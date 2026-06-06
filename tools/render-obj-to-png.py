"""
Batch-render .obj files to transparent PNG sprites for use in the Phaser game.

Usage (headless):
  "D:\\DONG_VO\\TOOL\\blender\\blender.exe" --background --python tools/render-obj-to-png.py

  Or from a project terminal:
  blender --background --python tools/render-obj-to-png.py

GUI usage:
  Open Blender > Scripting > Open > select this file > Run Script

What it does:
  - Recursively scans IN_DIR for .obj files (skipping EXCLUDE_DIRS).
  - Frames each with a 45 pitch / 30 yaw 3/4 camera (matches the game's top-down feel).
  - Renders to OUT_DIR as <category>-<name>.png at OUT_SIZE x OUT_SIZE,
    transparent background, RGBA.
"""

import os
import math
import bpy
import mathutils

# ------------------------------------------------------------------ config
PROJECT_DIR = r"C:\Users\enabl\Desktop\AI_Training\Game_Bug_Smasher"
IN_DIR      = os.path.join(PROJECT_DIR, "assets", "office_3d", "3D Voxel Office Pack - Obj File")
OUT_DIR     = os.path.join(PROJECT_DIR, "assets", "office")
OUT_SIZE    = 256
EXCLUDE_DIRS = {"Fragments"}        # skip half-pieces meant for assembly

# Camera view. Slight 3/4 (pitch=70) so tall items like coffee machines and
# monitors show their fronts/screens while the floor furniture still reads from
# above. Yaw=0 keeps everything facing the same way.
CAM_PITCH_DEG = 70
CAM_YAW_DEG   = 0
CAM_MARGIN    = 1.15                # a bit of padding so 3/4 doesn't clip
USE_ORTHO     = True                # orthographic projection


# ------------------------------------------------------------------ helpers
def clear_scene():
    for obj in list(bpy.data.objects):
        bpy.data.objects.remove(obj, do_unlink=True)
    for mesh in list(bpy.data.meshes):
        if mesh.users == 0:
            bpy.data.meshes.remove(mesh)
    for mat in list(bpy.data.materials):
        if mat.users == 0:
            bpy.data.materials.remove(mat)


def import_obj(path):
    """Handle both Blender 3.x and 4.x OBJ importers."""
    if hasattr(bpy.ops.wm, "obj_import"):       # 4.x
        bpy.ops.wm.obj_import(filepath=path)
    else:                                        # 3.x
        bpy.ops.import_scene.obj(filepath=path)
    meshes = [o for o in bpy.context.selected_objects if o.type == "MESH"]
    # Source models are Y-up (Maya/Max convention). Rotate +90deg on X so the
    # model stands upright in Blender's Z-up world. Apply to each so future
    # framing/scaling math sees the correct bbox.
    for m in meshes:
        m.rotation_euler = (math.radians(90), 0, 0)
    bpy.ops.object.select_all(action="DESELECT")
    for m in meshes: m.select_set(True)
    if meshes:
        bpy.context.view_layer.objects.active = meshes[0]
        bpy.ops.object.transform_apply(location=False, rotation=True, scale=False)
    return meshes


def compute_bounds(objs):
    if not objs:
        return mathutils.Vector((0, 0, 0)), mathutils.Vector((1, 1, 1))
    minv = mathutils.Vector(( math.inf,) * 3)
    maxv = mathutils.Vector((-math.inf,) * 3)
    for obj in objs:
        for corner in obj.bound_box:
            v = obj.matrix_world @ mathutils.Vector(corner)
            for i in range(3):
                minv[i] = min(minv[i], v[i])
                maxv[i] = max(maxv[i], v[i])
    return (minv + maxv) * 0.5, (maxv - minv)


def setup_camera_and_lights(center, size):
    radius = max(size.x, size.y, size.z, 0.5) * CAM_MARGIN * 1.6
    yaw   = math.radians(CAM_YAW_DEG)
    pitch = math.radians(CAM_PITCH_DEG)
    cam_pos = center + mathutils.Vector((
        math.cos(pitch) * math.cos(yaw) * radius,
        math.cos(pitch) * math.sin(yaw) * radius,
        math.sin(pitch) * radius,
    ))
    cam_data = bpy.data.cameras.new("Cam")
    if USE_ORTHO:
        cam_data.type = "ORTHO"
        # Frame the object: ortho_scale is the visible vertical extent of the view.
        cam_data.ortho_scale = max(size.x, size.y, size.z, 0.5) * CAM_MARGIN
    else:
        cam_data.lens = 50
    cam_obj = bpy.data.objects.new("Cam", cam_data)
    bpy.context.scene.collection.objects.link(cam_obj)
    cam_obj.location = cam_pos
    cam_obj.rotation_euler = (center - cam_pos).to_track_quat("-Z", "Y").to_euler()
    bpy.context.scene.camera = cam_obj

    # Brighter than before so the dark variants (black chairs, dark coffee machines) read clearly.
    key = bpy.data.lights.new("Key", type="SUN")
    key.energy = 7.0
    key.color  = (1.0, 0.97, 0.92)
    key_obj = bpy.data.objects.new("Key", key)
    bpy.context.scene.collection.objects.link(key_obj)
    key_obj.location = center + mathutils.Vector(( radius, -radius * 0.6, radius * 1.5))
    key_obj.rotation_euler = (math.radians(-50), math.radians(20), math.radians(30))

    fill = bpy.data.lights.new("Fill", type="SUN")
    fill.energy = 3.5
    fill.color  = (0.85, 0.9, 1.0)
    fill_obj = bpy.data.objects.new("Fill", fill)
    bpy.context.scene.collection.objects.link(fill_obj)
    fill_obj.location = center + mathutils.Vector((-radius, radius * 0.6, radius))
    fill_obj.rotation_euler = (math.radians(-30), math.radians(-20), math.radians(-30))

    # Soft ambient so the underside isn't pitch-black
    ambient = bpy.data.lights.new("Ambient", type="SUN")
    ambient.energy = 1.2
    ambient.color  = (1.0, 1.0, 1.0)
    amb_obj = bpy.data.objects.new("Ambient", ambient)
    bpy.context.scene.collection.objects.link(amb_obj)
    amb_obj.location = center + mathutils.Vector((0, 0, -radius))
    amb_obj.rotation_euler = (math.radians(180), 0, 0)


def configure_render():
    scn = bpy.context.scene
    engines = scn.render.bl_rna.properties["engine"].enum_items.keys()
    scn.render.engine = "BLENDER_EEVEE_NEXT" if "BLENDER_EEVEE_NEXT" in engines else "BLENDER_EEVEE"
    scn.render.resolution_x = OUT_SIZE
    scn.render.resolution_y = OUT_SIZE
    scn.render.resolution_percentage = 100
    scn.render.film_transparent = True
    scn.render.image_settings.file_format = "PNG"
    scn.render.image_settings.color_mode = "RGBA"


def render_one(obj_path, out_path):
    clear_scene()
    meshes = import_obj(obj_path)
    if not meshes:
        return False
    center, size = compute_bounds(meshes)
    setup_camera_and_lights(center, size)
    configure_render()
    bpy.context.scene.render.filepath = out_path
    bpy.ops.render.render(write_still=True)
    return True


def collect_obj_files():
    """Return list of (in_path, out_filename) tuples."""
    items = []
    for root, dirs, files in os.walk(IN_DIR):
        dirs[:] = [d for d in dirs if d not in EXCLUDE_DIRS]
        rel_dir = os.path.relpath(root, IN_DIR)
        category = rel_dir.split(os.sep)[0].lower() if rel_dir != "." else ""
        for f in files:
            if not f.lower().endswith(".obj"):
                continue
            base = os.path.splitext(f)[0].lower()
            # strip the redundant "office_" prefix common to this pack
            if base.startswith("office_"):
                base = base[len("office_"):]
            out_name = f"{category}-{base}.png" if category else f"{base}.png"
            items.append((os.path.join(root, f), out_name))
    return sorted(items, key=lambda x: x[1])


# ------------------------------------------------------------------ main
def main():
    if not os.path.isdir(IN_DIR):
        print(f"Input folder not found: {IN_DIR}")
        return
    os.makedirs(OUT_DIR, exist_ok=True)

    files = collect_obj_files()
    if not files:
        print(f"No .obj files in {IN_DIR}")
        return

    print(f"Rendering {len(files)} OBJ files")
    print(f"  in : {IN_DIR}")
    print(f"  out: {OUT_DIR}")
    ok, fail = 0, 0
    for i, (in_path, out_name) in enumerate(files, 1):
        out_path = os.path.join(OUT_DIR, out_name)
        print(f"[{i}/{len(files)}] {out_name}")
        try:
            if render_one(in_path, out_path):
                ok += 1
            else:
                fail += 1
                print(f"    ! no mesh")
        except Exception as e:
            fail += 1
            print(f"    ! FAILED: {e}")
    print(f"Done. ok={ok} fail={fail}")


main()
