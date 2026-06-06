# Blender batch render: Mixamo character + animations -> 8-direction sprite PNGs.
#
# How to use:
#   1. Open Blender, switch to the Scripting tab
#   2. Set the three paths in CONFIG below to your local files
#   3. Click "Run Script"
#   4. Wait — outputs PNGs to OUT_DIR
#   5. Drag OUT_DIR into Free Texture Packer to build the Phaser atlas
#
# Tested on Blender 4.0+.

import os
import math
import bpy
from mathutils import Vector

# -----------------------------------------------------------------------------
# CONFIG
# -----------------------------------------------------------------------------
CHAR_FBX = r'C:\Users\enabl\Desktop\AI_Training\Game_Bug_Smasher\assets\mixamo\devstick.fbx'
ANIM_DIR = r'C:\Users\enabl\Desktop\AI_Training\Game_Bug_Smasher\assets\mixamo'
OUT_DIR  = r'C:\Users\enabl\Desktop\AI_Training\Game_Bug_Smasher\tools\atlas_raw'

ANIMATIONS = {
    'idle.fbx':  ('idle',  12, True),
    'run.fbx':   ('run',   16, True),
    'smash.fbx': ('smash', 10, False),
    'punch.fbx': ('punch', 8,  False),
    'kick.fbx':  ('kick',  14, False),
    'jump.fbx':  ('jump',  12, False),
    'parry.fbx': ('parry', 8,  False),
}

DIRECTIONS = [
    ('s',  0),    ('se', 45),  ('e',  90),  ('ne', 135),
    ('n',  180),  ('nw', 225), ('w',  270), ('sw', 315),
]

# Mixamo characters import facing +Y. Add 180° so yaw=0 = facing camera.
FACING_OFFSET_DEG = 180

# Stickman look — pure white silhouette + black Freestyle outline
STICKMAN_LOOK = True
OUTLINE_THICKNESS = 2.5  # Freestyle line width in pixels

# Render
RESOLUTION_X = 128
RESOLUTION_Y = 192
TRANSPARENT_BG = True
TARGET_CHARACTER_HEIGHT = 1.8  # meters; everything scales to this

# Camera (orthographic, slight top-down tilt)
CAM_DISTANCE    = 5.0
CAM_TILT_DEG    = 30.0
CAM_ORTHO_SCALE = 2.3
CAM_LOOK_HEIGHT = 1.0


# -----------------------------------------------------------------------------
# Scene setup
# -----------------------------------------------------------------------------
def clear_scene():
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)
    for collection in (bpy.data.actions, bpy.data.meshes, bpy.data.armatures,
                       bpy.data.materials, bpy.data.images, bpy.data.linestyles):
        for item in list(collection):
            if item.users == 0:
                collection.remove(item)


def setup_camera_and_light():
    tilt = math.radians(CAM_TILT_DEG)
    cam_y = -CAM_DISTANCE * math.sin(tilt)
    cam_z = CAM_DISTANCE * math.cos(tilt) + CAM_LOOK_HEIGHT
    bpy.ops.object.camera_add(location=(0, cam_y, cam_z))
    cam = bpy.context.object
    cam.data.type = 'ORTHO'
    cam.data.ortho_scale = CAM_ORTHO_SCALE
    cam.rotation_euler = (tilt, 0, 0)
    bpy.context.scene.camera = cam

    bpy.ops.object.light_add(type='SUN', location=(0, 0, 0))
    sun = bpy.context.object
    sun.data.energy = 5.0
    sun.rotation_euler = (math.radians(45), math.radians(-25), 0)

    bpy.ops.object.light_add(type='SUN', location=(0, 0, 0))
    fill = bpy.context.object
    fill.data.energy = 2.0
    fill.data.color = (1.0, 1.0, 1.0)
    fill.rotation_euler = (math.radians(110), math.radians(20), 0)


def setup_render():
    s = bpy.context.scene
    try:
        s.render.engine = 'BLENDER_EEVEE_NEXT'
    except TypeError:
        s.render.engine = 'BLENDER_EEVEE'
    s.render.image_settings.file_format = 'PNG'
    s.render.image_settings.color_mode = 'RGBA' if TRANSPARENT_BG else 'RGB'
    s.render.film_transparent = TRANSPARENT_BG
    s.render.resolution_x = RESOLUTION_X
    s.render.resolution_y = RESOLUTION_Y
    s.render.resolution_percentage = 100

    if STICKMAN_LOOK:
        # Enable Freestyle for black outline (the "drawn stickman" look)
        s.render.use_freestyle = True
        vl = s.view_layers[0]
        vl.use_freestyle = True
        fs = vl.freestyle_settings
        fs.crease_angle = math.radians(140)
        if not fs.linesets:
            fs.linesets.new('default')
        ls = fs.linesets[0]
        ls.linestyle.color = (0.0, 0.0, 0.0)
        ls.linestyle.thickness = OUTLINE_THICKNESS
        # Lines drawn on silhouette + crease + border edges
        ls.select_silhouette = True
        ls.select_crease = True
        ls.select_border = True


# -----------------------------------------------------------------------------
# Material override — pure white "stickman" look
# -----------------------------------------------------------------------------
def make_stickman_material():
    mat = bpy.data.materials.new(name='StickmanWhite')
    mat.use_nodes = True
    nt = mat.node_tree
    nt.nodes.clear()
    out = nt.nodes.new('ShaderNodeOutputMaterial')
    diffuse = nt.nodes.new('ShaderNodeBsdfDiffuse')
    diffuse.inputs['Color'].default_value = (1.0, 1.0, 1.0, 1.0)
    nt.links.new(diffuse.outputs[0], out.inputs[0])
    return mat


def apply_stickman_look(mesh_objects):
    mat = make_stickman_material()
    for m in mesh_objects:
        m.data.materials.clear()
        m.data.materials.append(mat)


# -----------------------------------------------------------------------------
# Import + auto-normalize character
# -----------------------------------------------------------------------------
def _snapshot():
    return {
        'objects': set(o.name for o in bpy.data.objects),
        'actions': set(a.name for a in bpy.data.actions),
    }


def measure_height(meshes):
    """Return world-space (min_z, max_z) bounding box across the given meshes."""
    min_z, max_z = float('inf'), float('-inf')
    for m in meshes:
        mw = m.matrix_world
        for corner in m.bound_box:
            wc = mw @ Vector(corner)
            if wc.z < min_z: min_z = wc.z
            if wc.z > max_z: max_z = wc.z
    return min_z, max_z


def import_character(fbx_path):
    before = _snapshot()
    bpy.ops.import_scene.fbx(filepath=fbx_path, automatic_bone_orientation=True)
    new_objs = [bpy.data.objects[n] for n in bpy.data.objects.keys() if n not in before['objects']]
    armature = next((o for o in new_objs if o.type == 'ARMATURE'), None)
    if armature is None:
        raise RuntimeError(f'No armature found in {fbx_path}')
    meshes = [o for o in new_objs if o.type == 'MESH']

    print(f'  imported armature "{armature.name}" + {len(meshes)} mesh(es)')

    # Update depsgraph so bounding boxes are accurate
    bpy.context.view_layer.update()

    if meshes:
        min_z, max_z = measure_height(meshes)
        height = max_z - min_z
        print(f'  raw height: {height:.3f} (min_z={min_z:.3f}, max_z={max_z:.3f})')
        if height > 0:
            scale = TARGET_CHARACTER_HEIGHT / height
            print(f'  scaling armature by {scale:.5f} to reach target height {TARGET_CHARACTER_HEIGHT}m')
            armature.scale = (scale, scale, scale)
            # Re-measure to get post-scale feet position
            bpy.context.view_layer.update()
            min_z2, _ = measure_height(meshes)
            armature.location.z -= min_z2     # feet to z=0
            armature.location.x = 0
            armature.location.y = 0
            bpy.context.view_layer.update()

    # Apply white material if stickman mode is on
    if STICKMAN_LOOK and meshes:
        apply_stickman_look(meshes)

    return armature


def import_animation(fbx_path, target_armature):
    before = _snapshot()
    bpy.ops.import_scene.fbx(filepath=fbx_path, automatic_bone_orientation=True)
    new_objs = [bpy.data.objects[n] for n in bpy.data.objects.keys() if n not in before['objects']]
    new_actions = [bpy.data.actions[n] for n in bpy.data.actions.keys() if n not in before['actions']]

    if not new_actions:
        for o in new_objs:
            try: bpy.data.objects.remove(o, do_unlink=True)
            except Exception: pass
        return None

    action = new_actions[0]
    if target_armature.animation_data is None:
        target_armature.animation_data_create()
    target_armature.animation_data.action = action

    # Delete temporary armature + any mesh that came with the anim FBX
    for o in new_objs:
        try: bpy.data.objects.remove(o, do_unlink=True)
        except Exception: pass

    return action


# -----------------------------------------------------------------------------
# Frame sampling + render
# -----------------------------------------------------------------------------
def sample_frame_indices(action, count, evenly):
    start = int(action.frame_range[0])
    end   = int(action.frame_range[1])
    if count <= 1 or end <= start:
        return [start]
    if evenly:
        step = (end - start) / count
        return [int(start + i * step) for i in range(count)]
    return [min(end, start + i) for i in range(count)]


def render_frame(armature, yaw_deg, out_path):
    armature.rotation_euler = (0, 0, math.radians(yaw_deg + FACING_OFFSET_DEG))
    bpy.context.view_layer.update()
    bpy.context.scene.render.filepath = out_path
    bpy.ops.render.render(write_still=True)


# -----------------------------------------------------------------------------
# Main
# -----------------------------------------------------------------------------
def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    clear_scene()
    setup_camera_and_light()
    setup_render()

    print(f'Importing character: {CHAR_FBX}')
    armature = import_character(CHAR_FBX)

    total = 0
    for fbx_name, (action_name, frame_count, loop_compress) in ANIMATIONS.items():
        anim_path = os.path.join(ANIM_DIR, fbx_name)
        if not os.path.isfile(anim_path):
            print(f'[skip] missing: {anim_path}')
            continue
        print(f'\n=== {action_name} ===  ({fbx_name})')
        action = import_animation(anim_path, armature)
        if action is None:
            print(f'[skip] no action in {fbx_name}')
            continue
        print(f'  action: {action.name}  frames {int(action.frame_range[0])}..{int(action.frame_range[1])}')

        frames = sample_frame_indices(action, frame_count, loop_compress)
        for frame_idx, blender_frame in enumerate(frames):
            bpy.context.scene.frame_set(blender_frame)
            for dir_name, yaw in DIRECTIONS:
                fname = f'{action_name}_{dir_name}_{frame_idx:04d}.png'
                out_path = os.path.join(OUT_DIR, fname)
                render_frame(armature, yaw, out_path)
                total += 1
        print(f'  rendered {len(frames) * len(DIRECTIONS)} frames (total: {total})')

    print(f'\nDONE — wrote {total} frames to {OUT_DIR}')


if __name__ == '__main__':
    main()
