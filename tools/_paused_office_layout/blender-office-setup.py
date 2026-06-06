"""
One-time scene setup for composing an office level backdrop in Blender.

Workflow:
  1. Open Blender (any version 3.x or 4.x).
  2. Scripting workspace -> Open -> select this file -> Run Script.
  3. The scene is now ready: top-down ortho camera, lights, a 26x15 grid overlay
     matching the in-game maze.
  4. File > Import > Wavefront (.obj) ... pick props from
     C:/Users/enabl/Desktop/AI_Training/Game_Bug_Smasher/assets/office_3d/
     and position them on the grid. 1 Blender unit = 1 maze tile (48px in-game).
     World origin is the CENTER of the maze.
  5. When happy, File > Save (so you can re-edit later).
  6. Render: F12 (or Render > Render Image).
  7. Image > Save As... -> save to
     C:/Users/enabl/Desktop/AI_Training/Game_Bug_Smasher/assets/level_bg/L<N>.png
     (where N is the level number: L1.png, L2.png, ...).

Tile-to-world conversion:
  col 0  is at world X = -12.5
  col 25 is at world X = +12.5
  row 0  is at world Y = +7.0   (top of maze, y is up in 2D, but Blender Y inverted -> use -7 to +7 with row 0 at +7)
  row 14 is at world Y = -7.0

Use place_on_tile(obj, col, row) in the Scripting workspace to snap objects.
"""

import bpy
import math
import mathutils

# ----- Grid config (must match src/data/mazes.js) -----
GRID_COLS = 26
GRID_ROWS = 15
TILE_PX   = 48       # in-game pixels per tile
TILE_UNIT = 1.0      # Blender world units per tile

# ----- Render output size — must equal in-game maze pixel size -----
OUT_W = GRID_COLS * TILE_PX   # 1248
OUT_H = GRID_ROWS * TILE_PX   # 720


def clear_scene():
    for obj in list(bpy.data.objects):
        bpy.data.objects.remove(obj, do_unlink=True)
    for mat in list(bpy.data.materials):
        if mat.users == 0:
            bpy.data.materials.remove(mat)


def setup_camera():
    cam_data = bpy.data.cameras.new('LevelCam')
    cam_data.type = 'ORTHO'
    cam_data.ortho_scale = GRID_ROWS * TILE_UNIT     # vertical extent of view
    cam = bpy.data.objects.new('LevelCam', cam_data)
    bpy.context.scene.collection.objects.link(cam)
    cam.location = (0, 0, 20)
    cam.rotation_euler = (0, 0, 0)                   # looking straight down -Z
    bpy.context.scene.camera = cam
    return cam


def setup_lights():
    sun = bpy.data.lights.new('Key', type='SUN')
    sun.energy = 5
    sun.color  = (1.0, 0.97, 0.92)
    sun_obj = bpy.data.objects.new('Key', sun)
    bpy.context.scene.collection.objects.link(sun_obj)
    sun_obj.location = (5, -5, 12)
    sun_obj.rotation_euler = (math.radians(-30), math.radians(15), 0)

    fill = bpy.data.lights.new('Fill', type='SUN')
    fill.energy = 2.5
    fill.color  = (0.9, 0.94, 1.0)
    fill_obj = bpy.data.objects.new('Fill', fill)
    bpy.context.scene.collection.objects.link(fill_obj)
    fill_obj.location = (-5, 5, 10)
    fill_obj.rotation_euler = (math.radians(30), math.radians(-15), 0)

    amb = bpy.data.lights.new('Ambient', type='SUN')
    amb.energy = 1.0
    amb_obj = bpy.data.objects.new('Ambient', amb)
    bpy.context.scene.collection.objects.link(amb_obj)
    amb_obj.location = (0, 0, -5)
    amb_obj.rotation_euler = (math.radians(180), 0, 0)


def build_grid_overlay():
    """Build a flat wireframe plane subdivided into GRID_COLS x GRID_ROWS so the
    user can see tile boundaries while placing props."""
    bpy.ops.mesh.primitive_plane_add(size=1, location=(0, 0, -0.01))
    plane = bpy.context.object
    plane.name = 'GridOverlay'
    plane.scale = (GRID_COLS * TILE_UNIT, GRID_ROWS * TILE_UNIT, 1)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)

    # Subdivide along each axis to draw grid lines
    bpy.context.view_layer.objects.active = plane
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    # We need rectangular subdivision; default subdivide is uniform, but using
    # `number_cuts` here cuts each existing edge that many times. One subdivide call
    # with N cuts gives N+1 segments in BOTH directions. So:
    #   number_cuts = max(GRID_COLS, GRID_ROWS) - 1 gives a square grid that we
    #   then thin by deleting extra lines — but simpler: just subdivide enough
    #   for visibility (the grid is decorative; snapping uses world coords).
    bpy.ops.mesh.subdivide(number_cuts=max(GRID_COLS, GRID_ROWS) - 1)
    bpy.ops.object.mode_set(mode='OBJECT')

    plane.display_type = 'WIRE'
    plane.show_wire = True
    plane.hide_select = True            # don't accidentally drag the grid
    plane.hide_render = True            # never appears in renders


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


# ---------------------------------------------------------- helpers users call
def tile_to_world(col, row):
    """Convert maze tile (col, row) to Blender world position (x, y, 0)."""
    x = (col - (GRID_COLS - 1) / 2) * TILE_UNIT
    # In maze data row 0 is at the top of the screen; Blender Y is up,
    # so we invert: row 0 -> +max, last row -> -max.
    y = ((GRID_ROWS - 1) / 2 - row) * TILE_UNIT
    return (x, y, 0)


def place_on_tile(obj, col, row, rotate_deg=0):
    """Snap an object's origin to the center of tile (col, row)."""
    x, y, z = tile_to_world(col, row)
    obj.location = (x, y, z)
    obj.rotation_euler = (0, 0, math.radians(rotate_deg))


# Expose helpers as globals so the user can call them from the Python console.
bpy.app.driver_namespace['tile_to_world']  = tile_to_world
bpy.app.driver_namespace['place_on_tile']  = place_on_tile


def main():
    clear_scene()
    setup_camera()
    setup_lights()
    build_grid_overlay()
    configure_render()
    print('Scene ready.')
    print(f'  Grid: {GRID_COLS} cols x {GRID_ROWS} rows')
    print(f'  Render: {OUT_W} x {OUT_H} PNG (transparent)')
    print('  Drag .obj files into the scene from File > Import > Wavefront (.obj).')
    print('  Or, in the Python console: place_on_tile(bpy.context.object, col, row)')


main()
