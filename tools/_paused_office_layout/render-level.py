"""Procedural office layout generator + validator (Blender Python).

Outputs:
  - assets/level_bg/L1.png         visual backdrop (1248x720, transparent)
  - assets/level_bg/layout_report.json
      { desks: int, chairs: int, violations: [str], maze: [row strings] }
      `maze` is the collision grid the game can load into src/data/mazes.js:
        '#' = wall (collidable)
        '.' = floor (walkable)
        'T' = tunnel (wraparound walkable)

Tile legend:
  Walls (collidable in the resulting Pac-Man maze):
    # = partition wall (cubicle edge piece only)                 | misc
    K = cubicle wall + workstation visual (compact desk+chair+PC)| misc
    B = bookshelf (tall cabinet)                                 | misc
    F = filing cabinet (short)                                   | misc
    w = whiteboard                                                | misc
  Floor (walkable):
    . = empty floor
    T = tunnel (wraps to opposite edge)
    D = door (door asset on a walkable cell)
    W = workstation desk facing south (chair south rot 180, PC north) | desk-kind
    V = workstation desk facing north (chair north rot 0,   PC south) | desk-kind
    R = reception desk + chair                                         | desk-kind
    M = long meeting table cell (chains horizontally)                  | misc
    h = meeting chair NORTH side (rot 0)                               | misc
    H = meeting chair SOUTH side (rot 180)                             | misc
    C = coffee station (machine + mug + side table)                    | misc
    s = sofa                                                            | misc
    a = armchair                                                        | misc
    t = side table                                                     | misc
    o = printer                                                         | misc
    P = plant                                                           | misc
"""
import bpy, math, mathutils, os, json

# ========================== CONFIG ==========================
PROJECT_DIR = r"C:\Users\enabl\Desktop\AI_Training\Game_Bug_Smasher"
VOXEL_PACK  = os.path.join(PROJECT_DIR, "assets", "office_3d", "3D Voxel Office Pack - Obj File")
PNG_OUT     = os.path.join(PROJECT_DIR, "assets", "level_bg", "L1.png")
JSON_OUT    = os.path.join(PROJECT_DIR, "assets", "level_bg", "layout_report.json")

GRID_COLS = 26
GRID_ROWS = 15
TILE_UNIT = 1.0
BOUNDS_X = (-13.0, 13.0)
BOUNDS_Y = (-7.5, 7.5)

MIN_DESK_SPACING = 1.2

# Pac-Man-style office maze. K-clusters are workstation walls (collidable);
# corridors between them are walkable. Tunnel row in middle. Meeting room
# accessible via doors. Reception + decor in bottom strip.
GRID = [
    '##########################',   # 0  outer top wall
    '#........................#',   # 1  top corridor
    '#.KKKK.KKKKKK.KKKKKK.KKKK#',   # 2  cubicle wall row (workstation visuals)
    '#........................#',   # 3
    '#.KKKK.KK.KKKKKK.KK.KKKK.#',   # 4  cubicle wall row (with breaks)
    '#.KK.....C.C.s.a.....KK..#',   # 5  break + lounge in middle aisle
    '#.KK.KKKK.KKKKKK.KKKK.KK.#',   # 6  cubicle wall row
    'T...........KK...........T',   # 7  tunnel row (KK as wall in middle)
    '#.KK.KKKK.KKKKKK.KKKK.KK.#',   # 8  cubicle wall row
    '#.KK....t.M.M.M.M.h..KK..#',   # 9  meeting tables + chair + lounge
    '#.KKKK.KK.KKKKKK.KK.KKKK.#',   # 10 cubicle wall row
    '#........................#',   # 11 corridor
    '#.KKKK.KKKKKK.KKKKKK.KKKK#',   # 12 cubicle wall row
    '#..R....o.o.....C.C..F.F.#',   # 13 reception + decor
    '##########################',   # 14 outer bottom wall
]

ASSETS = {
    'desk':           'Tables/Office_Table_White_2x1_01.obj',
    'desk_compact':   'Tables/Office_Table_White_1x1_01.obj',
    'long_desk':      'Tables/Office_Table_White_3x1_01.obj',
    'side_table':     'Tables/Office_Table_White_1x1_02.obj',
    'chair':          'Chairs/Office_Chair_White_02.obj',
    'pc':             'Misc/Electronics/Office_Misc_PC_01.obj',
    'coffee_machine': 'Misc/Coffee/Office_Misc_Coffee_Machine_02.obj',
    'coffee_mug':     'Misc/Coffee/Office_Misc_Coffee_Mug.obj',
    'coffee_table':   'Tables/Office_Table_Coffee_02_White.obj',
    'plant':          'Misc/Office_Misc_Plant_01.obj',
    'sofa':           'Chairs/Office_Couch_White_01.obj',
    'armchair':       'Chairs/Office_Couch_White_02.obj',
    'printer':        'Misc/Electronics/Office_Misc_Printer.obj',
    'cabinet':        'Misc/Office_Misc_Cabinet_01.obj',
    'bookshelf':      'Misc/Office_Misc_Cabinet_02.obj',
    'whiteboard':     'Misc/Office_Misc_Whiteboard_01.obj',
    'partition':      'Cubicles/Fragments/Office_Cubicle_Piece_Light_Edge_01.obj',
    'door':           'Misc/Office_Misc_Door_01.obj',
}

TARGET_XY_SIZE = {
    'desk':           1.5,
    'desk_compact':   0.85,
    'long_desk':      1.7,
    'side_table':     0.5,
    'chair':          0.55,
    'pc':             0.35,
    'coffee_machine': 0.7,
    'coffee_mug':     0.3,
    'coffee_table':   0.8,
    'plant':          0.6,
    'sofa':           0.95,
    'armchair':       0.7,
    'printer':        0.5,
    'cabinet':        0.55,
    'bookshelf':      0.65,
    'whiteboard':     0.85,
    'partition':      0.85,
    'door':           0.85,
}

# Characters that produce collidable walls in the output maze grid.
WALL_CHARS = set('#KBFw')

# ========================== HELPERS ==========================
def tile_to_world(col, row):
    x = (col - (GRID_COLS - 1) / 2.0) * TILE_UNIT
    y = ((GRID_ROWS - 1) / 2.0 - row) * TILE_UNIT
    return (x, y)


def clear_scene():
    for obj in list(bpy.data.objects):
        bpy.data.objects.remove(obj, do_unlink=True)
    for m in list(bpy.data.meshes):
        if m.users == 0:
            bpy.data.meshes.remove(m)


def import_obj(path):
    if hasattr(bpy.ops.wm, "obj_import"):
        bpy.ops.wm.obj_import(filepath=path)
    else:
        bpy.ops.import_scene.obj(filepath=path)
    return [o for o in bpy.context.selected_objects if o.type == 'MESH']


def aabb_world(obj):
    corners = [obj.matrix_world @ mathutils.Vector(c) for c in obj.bound_box]
    minx = min(c.x for c in corners); maxx = max(c.x for c in corners)
    miny = min(c.y for c in corners); maxy = max(c.y for c in corners)
    minz = min(c.z for c in corners); maxz = max(c.z for c in corners)
    return (minx, miny, minz, maxx, maxy, maxz)


def aabb_overlap_xy(a, b, eps=0.001):
    if a[3] <= b[0] + eps or b[3] <= a[0] + eps: return False
    if a[4] <= b[1] + eps or b[4] <= a[1] + eps: return False
    return True


# ========================== ASSET INSTANCING ==========================
TEMPLATES = {}

def get_template(name):
    if name in TEMPLATES:
        return TEMPLATES[name]
    path = os.path.join(VOXEL_PACK, ASSETS[name])
    if not os.path.isfile(path):
        raise RuntimeError(f"Missing asset: {path}")
    meshes = import_obj(path)
    if not meshes:
        raise RuntimeError(f"No mesh in {path}")
    bpy.ops.object.select_all(action='DESELECT')
    for m in meshes: m.select_set(True)
    bpy.context.view_layer.objects.active = meshes[0]
    if len(meshes) > 1:
        bpy.ops.object.join()
    tpl = bpy.context.view_layer.objects.active
    tpl.rotation_euler = (math.radians(90), 0, 0)
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=False)
    bb = aabb_world(tpl)
    tpl.location.x -= (bb[0] + bb[3]) / 2.0
    tpl.location.y -= (bb[1] + bb[4]) / 2.0
    tpl.location.z -= bb[2]
    bpy.ops.object.transform_apply(location=True, rotation=False, scale=False)
    bb = aabb_world(tpl)
    largest_xy = max(bb[3] - bb[0], bb[4] - bb[1], 0.0001)
    target = TARGET_XY_SIZE.get(name, 1.0)
    s = target / largest_xy
    tpl.scale = (s, s, s)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    tpl.hide_render = True
    tpl.hide_set(True)
    tpl.name = f"TEMPLATE_{name}"
    TEMPLATES[name] = tpl
    return tpl


def instance(name, x, y, rot_z_deg=0):
    tpl = get_template(name)
    inst = tpl.copy()
    bpy.context.collection.objects.link(inst)
    inst.hide_render = False
    inst.hide_set(False)
    inst.location = (x, y, 0)
    inst.rotation_euler = (0, 0, math.radians(rot_z_deg))
    return inst


# ========================== PLACEMENT ==========================
PLACEMENTS = []

def place(name, kind, col, row, x_offset=0.0, y_offset=0.0, rot_z=0):
    wx, wy = tile_to_world(col, row)
    wx += x_offset; wy += y_offset
    obj = instance(name, wx, wy, rot_z)
    PLACEMENTS.append({
        'name': name, 'kind': kind, 'obj': obj,
        'x': wx, 'y': wy, 'tile': (col, row), 'rotation': rot_z % 360,
    })


def place_workstation_facing(col, row, desk_rot):
    chair_dy = -0.45 if desk_rot == 0 else 0.45
    pc_dy    =  0.15 if desk_rot == 0 else -0.15
    chair_rot = 180 if chair_dy < 0 else 0
    place('desk',  'desk',  col, row, rot_z=desk_rot)
    place('chair', 'chair', col, row, y_offset=chair_dy, rot_z=chair_rot)
    place('pc',    'pc',    col, row, y_offset=pc_dy,    rot_z=desk_rot)


def place_reception(col, row):
    top_half = row < GRID_ROWS / 2
    desk_rot = 0 if top_half else 180
    chair_dy = -0.45 if top_half else 0.45
    chair_rot = 180 if chair_dy < 0 else 0
    place('desk',  'desk',  col, row, rot_z=desk_rot)
    place('chair', 'chair', col, row, y_offset=chair_dy, rot_z=chair_rot)


def place_long_desk(col, row):
    place('long_desk', 'misc', col, row)


def place_meeting_chair_north(col, row):
    # NORTH of table -> chair faces -Y (south) -> rot 0
    place('chair', 'misc', col, row, rot_z=0)


def place_meeting_chair_south(col, row):
    # SOUTH of table -> chair faces +Y (north) -> rot 180
    place('chair', 'misc', col, row, rot_z=180)


def place_coffee(col, row):
    # All three items stay within the cell so they don't intrude on adjacent tiles
    # (e.g. K-cubicle walls in the row below).
    place('coffee_machine', 'misc', col, row, x_offset=-0.2, y_offset=0.1)
    place('coffee_mug',     'misc', col, row, x_offset=+0.2, y_offset=0.1)
    place('coffee_table',   'misc', col, row, y_offset=-0.15)


def place_partition(col, row):
    place('partition', 'misc', col, row)


def place_cubicle_wall(col, row):
    """K tile: compact cubicle workstation (desk+chair+PC), all misc-kind.
    Functions as a wall in the game maze but reads visually as a workstation."""
    place('desk_compact', 'misc', col, row)
    place('chair',        'misc', col, row, y_offset=0.15, rot_z=0)
    place('pc',           'misc', col, row, y_offset=-0.20)


def place_door(col, row):
    place('door', 'misc', col, row)


def place_plant(c, r):      place('plant',      'misc', c, r)
def place_sofa(c, r):       place('sofa',       'misc', c, r)
def place_armchair(c, r):   place('armchair',   'misc', c, r)
def place_side_table(c, r): place('side_table', 'misc', c, r)
def place_printer(c, r):    place('printer',    'misc', c, r)
def place_cabinet(c, r):    place('cabinet',    'misc', c, r)
def place_bookshelf(c, r):  place('bookshelf',  'misc', c, r)
def place_whiteboard(c, r): place('whiteboard', 'misc', c, r)


PLACERS = {
    '#': place_partition,
    'K': place_cubicle_wall,
    'D': place_door,
    'W': lambda c, r: place_workstation_facing(c, r, 0),
    'V': lambda c, r: place_workstation_facing(c, r, 180),
    'R': place_reception,
    'M': place_long_desk,
    'h': place_meeting_chair_north,
    'H': place_meeting_chair_south,
    'C': place_coffee,
    'a': place_armchair,
    't': place_side_table,
    's': place_sofa,
    'o': place_printer,
    'F': place_cabinet,
    'B': place_bookshelf,
    'w': place_whiteboard,
    'P': place_plant,
}


# ========================== VALIDATION ==========================
def validate():
    v = []
    bpy.context.view_layer.update()
    for p in PLACEMENTS:
        p['bbox'] = aabb_world(p['obj'])

    # 1. XY overlap between different tiles
    for i in range(len(PLACEMENTS)):
        a = PLACEMENTS[i]
        for j in range(i + 1, len(PLACEMENTS)):
            b = PLACEMENTS[j]
            if a['tile'] == b['tile']:
                continue
            if aabb_overlap_xy(a['bbox'], b['bbox']):
                v.append(f"overlap: {a['name']}@{a['tile']} vs {b['name']}@{b['tile']}")

    # 2. Desk-to-desk center spacing
    desks = [p for p in PLACEMENTS if p['kind'] == 'desk']
    for i in range(len(desks)):
        for j in range(i + 1, len(desks)):
            a, b = desks[i], desks[j]
            d = math.hypot(a['x'] - b['x'], a['y'] - b['y'])
            if d < MIN_DESK_SPACING - 1e-6:
                v.append(f"desk_spacing<{MIN_DESK_SPACING}: {a['tile']} vs {b['tile']} d={d:.3f}")

    # 3. One chair per desk-kind tile
    desk_tiles = {p['tile'] for p in PLACEMENTS if p['kind'] == 'desk'}
    chair_count = {}
    for p in PLACEMENTS:
        if p['kind'] == 'chair':
            chair_count[p['tile']] = chair_count.get(p['tile'], 0) + 1
    for t in desk_tiles:
        n = chair_count.get(t, 0)
        if n == 0:
            v.append(f"missing_chair: desk tile {t}")
        elif n > 1:
            v.append(f"extra_chairs: desk tile {t} has {n} chairs")
    for t, n in chair_count.items():
        if t not in desk_tiles:
            v.append(f"orphan_chair: chair-kind at tile {t} has no desk")

    # 4. Out-of-bounds
    for p in PLACEMENTS:
        bb = p['bbox']
        if bb[0] < BOUNDS_X[0] - 1e-6 or bb[3] > BOUNDS_X[1] + 1e-6 \
           or bb[1] < BOUNDS_Y[0] - 1e-6 or bb[4] > BOUNDS_Y[1] + 1e-6:
            v.append(f"out_of_bounds: {p['name']}@{p['tile']} bbox=({bb[0]:.2f},{bb[1]:.2f})-({bb[3]:.2f},{bb[4]:.2f})")

    # 5. Desk rotation must be 0 or 180
    for d in desks:
        rot = (math.degrees(d['obj'].rotation_euler.z) % 360 + 360) % 360
        if not (rot < 0.5 or abs(rot - 180) < 0.5 or rot > 359.5):
            v.append(f"desk_rotation_invalid: {d['tile']} rot={rot:.2f}")

    return v


def export_maze_grid():
    """Produce the collision grid the game can load:
       '#' = wall (collidable), '.' = floor, 'T' = tunnel."""
    out = []
    for row in GRID:
        s = ''
        for ch in row:
            if ch in WALL_CHARS:
                s += '#'
            elif ch == 'T':
                s += 'T'
            else:
                s += '.'
        out.append(s)
    return out


# ========================== SCENE + RENDER ==========================
def setup_camera_lights():
    PITCH = math.radians(70)
    radius = 30
    cam_data = bpy.data.cameras.new('Cam')
    cam_data.type = 'ORTHO'
    cam_data.ortho_scale = 30
    cam = bpy.data.objects.new('Cam', cam_data)
    bpy.context.scene.collection.objects.link(cam)
    cam.location = (0, -math.cos(PITCH) * radius, math.sin(PITCH) * radius)
    direction = mathutils.Vector((0, 0, 0)) - mathutils.Vector(cam.location)
    cam.rotation_euler = direction.to_track_quat('-Z', 'Y').to_euler()
    bpy.context.scene.camera = cam

    for (name, energy, color, pos, rot) in [
        ('Key',  5.0, (1.0, 0.97, 0.92), (5, -5, 15),  (math.radians(-30), math.radians(15),  0)),
        ('Fill', 2.5, (0.88, 0.92, 1.0), (-5, 5, 12),  (math.radians( 30), math.radians(-15), 0)),
        ('Amb',  1.2, (1, 1, 1),         (0, 0, -5),   (math.radians(180), 0, 0)),
    ]:
        light = bpy.data.lights.new(name, type='SUN')
        light.energy = energy
        light.color = color
        obj = bpy.data.objects.new(name, light)
        bpy.context.scene.collection.objects.link(obj)
        obj.location = pos
        obj.rotation_euler = rot


def configure_render():
    scn = bpy.context.scene
    engines = scn.render.bl_rna.properties['engine'].enum_items.keys()
    scn.render.engine = 'BLENDER_EEVEE_NEXT' if 'BLENDER_EEVEE_NEXT' in engines else 'BLENDER_EEVEE'
    scn.render.resolution_x = GRID_COLS * 48
    scn.render.resolution_y = GRID_ROWS * 48
    scn.render.resolution_percentage = 100
    scn.render.film_transparent = True
    scn.render.image_settings.file_format = 'PNG'
    scn.render.image_settings.color_mode = 'RGBA'


def write_report(violations, maze_grid):
    desks = sum(1 for p in PLACEMENTS if p['kind'] == 'desk')
    chairs = sum(1 for p in PLACEMENTS if p['kind'] == 'chair')
    report = {
        'desks': desks,
        'chairs': chairs,
        'violations': violations,
        'maze': maze_grid,
    }
    os.makedirs(os.path.dirname(JSON_OUT), exist_ok=True)
    with open(JSON_OUT, 'w') as f:
        json.dump(report, f, indent=2)


def main():
    clear_scene()
    setup_camera_lights()
    configure_render()

    for r, line in enumerate(GRID):
        for c, ch in enumerate(line):
            placer = PLACERS.get(ch)
            if placer is not None:
                placer(c, r)

    violations = validate()
    maze_grid = export_maze_grid()
    write_report(violations, maze_grid)
    print(f"VIOLATIONS: {len(violations)}")
    for v in violations: print(f"  - {v}")
    print("MAZE:")
    for row in maze_grid:
        print(f"  '{row}'")

    bpy.context.scene.render.filepath = PNG_OUT
    bpy.ops.render.render(write_still=True)


main()
