"""
Builds and renders Level 1 ("Open Office") backdrop to assets/level_bg/L1.png.

Layout intent — matches the M1 maze grid (see src/data/mazes.js):
  - Top row of workstations (rows 2-3)            : 4 cubicle clusters with desk+chair+monitor
  - Center cubicles (rows 5-6 and 8-9)           : 4 more cubicle clusters
  - Center pillar (row 7, cols 11-14)            : coffee station + water cooler
  - Bottom row of workstations (rows 11-12)      : mirror of top
  - Aisle floor (rows 1, 4, 10, 13)              : scattered props (plants/trashcans/clocks)

Run:
  "D:/DONG_VO/TOOL/blender/blender.exe" --background --python tools/render-level-1.py
"""

import bpy
import math
import mathutils
import os

# ---------------------------------------------------------------- config
PROJECT_DIR = r"C:\Users\enabl\Desktop\AI_Training\Game_Bug_Smasher"
VOXEL_PACK  = os.path.join(PROJECT_DIR, "assets", "office_3d", "3D Voxel Office Pack - Obj File")
OUT_PATH    = os.path.join(PROJECT_DIR, "assets", "level_bg", "L1.png")

GRID_COLS = 26
GRID_ROWS = 15
TILE_PX   = 48
OUT_W = GRID_COLS * TILE_PX       # 1248
OUT_H = GRID_ROWS * TILE_PX       # 720

# Workstation clusters — each is a 4-tile-wide, 2-tile-tall cubicle block
# Center column of each cluster, in grid coordinates.
# Match maze M1's "####" patterns at rows 2-3, 5-6, 8-9, 11-12
WORKSTATION_CLUSTERS = [
    # (col_center, row_center)  — center of the 4x2 block
    (3.5, 2.5),  (8.5, 2.5),  (16.5, 2.5),  (21.5, 2.5),    # top row
    (8.5, 5.5),  (16.5, 5.5),                               # middle-top
    (8.5, 8.5),  (16.5, 8.5),                               # middle-bottom
    (3.5, 11.5), (8.5, 11.5), (16.5, 11.5), (21.5, 11.5),   # bottom row
]

# Center pillar (row 7, cols 11-14) — coffee station
CENTER_PILLAR_CENTER = (12.5, 7.0)

# Free-floor decorations: scattered along aisles
FLOOR_DECORATIONS = [
    # (asset_relative, col, row, rotation_deg, scale)
    ("Misc/Trashcans/Office_Misc_Trashcan_Small_01", 1.5, 1.5, 0, 1.0),
    ("Misc/Trashcans/Office_Misc_Trashcan_Small_02", 24, 1.5, 0, 1.0),
    ("Misc/Trashcans/Office_Misc_Trashcan_Small_03", 1.5, 13, 0, 1.0),
    ("Misc/Trashcans/Office_Misc_Trashcan_Small_01", 24, 13, 0, 1.0),
    # Aisle midpoints
    ("Misc/Trashcans/Office_Misc_Trashcan_Big_01",  12.5, 1.2, 0, 1.0),
    ("Misc/Trashcans/Office_Misc_Trashcan_Big_02",  12.5, 13.2, 0, 1.0),
    # A couch in each end-cap aisle row
    ("Chairs/Office_Couch_White_01", 12.5, 4.0, 0, 1.0),
    ("Chairs/Office_Couch_White_02", 12.5, 10.0, 0, 1.0),
    # Wall clocks on outer rows (Misc folder, not Misc/Wall)
    ("Misc/Office_Misc_Wall_Clock_01", 6.5, 0.3, 0, 1.0),
    ("Misc/Office_Misc_Wall_Clock_02", 19.5, 0.3, 0, 1.0),
    # Whiteboard near top
    ("Misc/Office_Misc_Whiteboard_01", 12.5, 0.3, 0, 1.0),
    # Plants in floor corners (Misc folder)
    ("Misc/Office_Misc_Plant_01", 1.5, 4.5, 0, 1.0),
    ("Misc/Office_Misc_Plant_02", 24, 4.5, 0, 1.0),
    ("Misc/Office_Misc_Plant_03", 1.5, 10, 0, 1.0),
    ("Misc/Office_Misc_Plant_01", 24, 10, 0, 1.0),
    # Coffee on center pillar
    ("Misc/Coffee/Office_Misc_Coffee_Machine_02", 12.0, 7.0, 0, 1.0),
    ("Misc/Coffee/Office_Misc_Coffee_Mug",        13.0, 7.0, 0, 1.0),
]

# What goes INSIDE each workstation cluster (offsets from cluster center)
def workstation_layout(cx, cy):
    """Returns list of (asset_relative, col, row, rotation_deg, scale)."""
    return [
        # Long desk spanning the cluster
        ("Tables/Office_Table_White_3x1_01", cx, cy - 0.5, 0, 1.0),
        # Two chairs in front
        ("Chairs/Office_Chair_White_01", cx - 1.0, cy + 0.6, 180, 1.0),
        ("Chairs/Office_Chair_White_02", cx + 1.0, cy + 0.6, 180, 1.0),
        # A second desk underneath for the back-to-back pair
        ("Tables/Office_Table_Brown_3x1_01", cx, cy + 0.5, 0, 1.0),
        # Cubicle dividers behind
        ("Cubicles/Office_Cubicle_White_03", cx - 1.5, cy - 0.8, 0, 0.9),
        ("Cubicles/Office_Cubicle_White_04", cx + 1.5, cy - 0.8, 0, 0.9),
        # PCs / monitors on top
        ("Misc/Electronics/Office_Misc_PC_01", cx - 1.0, cy - 0.6, 0, 0.7),
        ("Misc/Electronics/Office_Misc_PC_02", cx + 1.0, cy - 0.6, 0, 0.7),
    ]


# ---------------------------------------------------------------- helpers
def tile_to_world(col, row):
    x = (col - (GRID_COLS - 1) / 2) * 1.0
    y = ((GRID_ROWS - 1) / 2 - row) * 1.0
    return (x, y, 0)


def clear_scene():
    for obj in list(bpy.data.objects):
        bpy.data.objects.remove(obj, do_unlink=True)
    for mesh in list(bpy.data.meshes):
        if mesh.users == 0: bpy.data.meshes.remove(mesh)
    for mat in list(bpy.data.materials):
        if mat.users == 0: bpy.data.materials.remove(mat)


def import_obj(path):
    if hasattr(bpy.ops.wm, "obj_import"):
        bpy.ops.wm.obj_import(filepath=path)
    else:
        bpy.ops.import_scene.obj(filepath=path)
    return [o for o in bpy.context.selected_objects if o.type == "MESH"]


def normalize_imported(meshes):
    """Join meshes, apply Y-up -> Z-up correction, then center on XY and sit on floor."""
    if not meshes: return None
    # Join into one object
    if len(meshes) > 1:
        bpy.ops.object.select_all(action="DESELECT")
        for m in meshes: m.select_set(True)
        bpy.context.view_layer.objects.active = meshes[0]
        bpy.ops.object.join()
    obj = bpy.context.view_layer.objects.active

    # Source models are Y-up (Maya/Max convention). Rotate +90deg on X so the
    # model's +Y becomes world +Z (stands upright) and we look down on the top.
    obj.rotation_euler = (math.radians(90), 0, 0)
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=False)

    # Re-measure bbox AFTER the rotation
    minv = mathutils.Vector(( math.inf,) * 3)
    maxv = mathutils.Vector((-math.inf,) * 3)
    for c in obj.bound_box:
        v = obj.matrix_world @ mathutils.Vector(c)
        for i in range(3):
            minv[i] = min(minv[i], v[i]); maxv[i] = max(maxv[i], v[i])
    cx, cy = (minv.x + maxv.x) / 2, (minv.y + maxv.y) / 2
    obj.location.x -= cx
    obj.location.y -= cy
    obj.location.z -= minv.z        # base on floor (z=0)
    bpy.ops.object.transform_apply(location=True, rotation=False, scale=False)

    # Auto-scale to fit largest XY dimension within ~1.6 tile units
    size = maxv - minv
    largest_xy = max(size.x, size.y, 0.01)
    target_xy = 1.6
    scale = target_xy / largest_xy if largest_xy > target_xy else 1.0
    if scale != 1.0:
        obj.scale = (scale, scale, scale)
        bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return obj


def place(relative_asset_path, col, row, rotation_deg=0, scale_mul=1.0):
    path = os.path.join(VOXEL_PACK, relative_asset_path + ".obj")
    if not os.path.isfile(path):
        print(f"  ! missing: {relative_asset_path}")
        return
    meshes = import_obj(path)
    obj = normalize_imported(meshes)
    if not obj: return
    x, y, z = tile_to_world(col, row)
    obj.location = (x, y, z)
    obj.rotation_euler = (0, 0, math.radians(rotation_deg))
    if scale_mul != 1.0:
        obj.scale = (obj.scale.x * scale_mul, obj.scale.y * scale_mul, obj.scale.z * scale_mul)
    return obj


def setup_camera_lights():
    # Slight 3/4 view (pitch=70 deg from horizontal, i.e. 20 deg tilt from straight down).
    # Camera is in front of and above the scene, looking back+down.
    PITCH_DEG = 70
    pitch = math.radians(PITCH_DEG)
    radius = 30  # distance from origin
    cam_y = -math.cos(pitch) * radius
    cam_z =  math.sin(pitch) * radius

    cam_data = bpy.data.cameras.new("Cam")
    cam_data.type = "ORTHO"
    # ortho_scale is the larger frame dimension in world units. Render is 1248x720
    # (aspect ~1.73). At pitch 70 the visible Y compresses by sin(70)=0.94, so we
    # need the world-height visible >= 15 / 0.94 ~= 16. Width = 16 * 1.73 ~= 27.7,
    # which fits 26 cols. Bump to 30 for a touch of margin.
    cam_data.ortho_scale = 30

    cam = bpy.data.objects.new("Cam", cam_data)
    bpy.context.scene.collection.objects.link(cam)
    cam.location = (0, cam_y, cam_z)
    # Aim at origin
    direction = mathutils.Vector((0, 0, 0)) - mathutils.Vector(cam.location)
    cam.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()
    bpy.context.scene.camera = cam

    sun = bpy.data.lights.new("Key", type="SUN")
    sun.energy = 5.0
    sun.color = (1.0, 0.97, 0.92)
    sun_obj = bpy.data.objects.new("Key", sun)
    bpy.context.scene.collection.objects.link(sun_obj)
    sun_obj.location = (5, -5, 15)
    sun_obj.rotation_euler = (math.radians(-30), math.radians(15), 0)

    fill = bpy.data.lights.new("Fill", type="SUN")
    fill.energy = 2.5
    fill.color = (0.88, 0.92, 1.0)
    fill_obj = bpy.data.objects.new("Fill", fill)
    bpy.context.scene.collection.objects.link(fill_obj)
    fill_obj.location = (-5, 5, 12)
    fill_obj.rotation_euler = (math.radians(30), math.radians(-15), 0)

    amb = bpy.data.lights.new("Amb", type="SUN")
    amb.energy = 1.2
    amb_obj = bpy.data.objects.new("Amb", amb)
    bpy.context.scene.collection.objects.link(amb_obj)
    amb_obj.location = (0, 0, -5)
    amb_obj.rotation_euler = (math.radians(180), 0, 0)


def configure_render():
    scn = bpy.context.scene
    engines = scn.render.bl_rna.properties["engine"].enum_items.keys()
    scn.render.engine = "BLENDER_EEVEE_NEXT" if "BLENDER_EEVEE_NEXT" in engines else "BLENDER_EEVEE"
    scn.render.resolution_x = OUT_W
    scn.render.resolution_y = OUT_H
    scn.render.resolution_percentage = 100
    scn.render.film_transparent = True
    scn.render.image_settings.file_format = "PNG"
    scn.render.image_settings.color_mode = "RGBA"


# ---------------------------------------------------------------- main
def main():
    if not os.path.isdir(VOXEL_PACK):
        print(f"Voxel pack folder not found: {VOXEL_PACK}")
        return
    os.makedirs(os.path.dirname(OUT_PATH), exist_ok=True)

    clear_scene()
    setup_camera_lights()
    configure_render()

    print("Placing workstation clusters...")
    for (cx, cy) in WORKSTATION_CLUSTERS:
        for (asset, col, row, rot, scl) in workstation_layout(cx, cy):
            place(asset, col, row, rot, scl)

    print("Placing center pillar / coffee station...")
    cx, cy = CENTER_PILLAR_CENTER
    place("Misc/Coffee/Office_Misc_Coffee_Machine_02", cx - 1.0, cy, 0, 1.0)
    place("Misc/Coffee/Office_Misc_Coffee_Pot_01",     cx,       cy, 0, 1.0)
    place("Misc/Coffee/Office_Misc_Coffee_Mug",        cx + 1.0, cy, 0, 1.0)
    place("Tables/Office_Table_Coffee_02_White",       cx + 0.0, cy + 0.5, 0, 1.0)

    print("Placing floor decorations...")
    for (asset, col, row, rot, scl) in FLOOR_DECORATIONS:
        place(asset, col, row, rot, scl)

    bpy.context.scene.render.filepath = OUT_PATH
    print(f"Rendering -> {OUT_PATH}")
    bpy.ops.render.render(write_still=True)
    print("Done.")


main()
