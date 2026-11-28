# Extract high-fidelity Summoner's Rift cliff polygons for the full Blue half (y > x)
# from docs/maps/ref_lol_minimap.jpg, build curved 3-gate base ramparts, compute pixel-level
# IoU/Dice + heatmap, and render a shaded 3D terrain & cliff surface preview.
# Author: Duke Nguyen <duc.nguyen@onethesis.com>
import json
import math
import sys
import io
import base64
from collections import deque
from PIL import Image, ImageDraw
import numpy as np

IMG_PATH = 'docs/maps/ref_lol_minimap.jpg'
COMPARE_OUT = 'docs/maps/compare_side_by_side.png'
PREVIEW_3D_OUT = 'docs/maps/preview_3d_surface.png'
CROP = (34, 34, 554, 554)
MAP_SIZE = 6000.0

LANES = [
    [(850, 4650), (650, 4000), (650, 1000), (1000, 650), (4000, 650), (4650, 850)],
    [(1200, 4800), (3000, 3000), (4800, 1200)],
    [(1350, 5150), (2000, 5350), (5000, 5350), (5350, 5000), (5350, 2000), (5150, 1350)],
]
RIVER_SEG = ((700, 700), (5300, 5300))
EPICS = [(1925, 1730), (4075, 4270)]
FOUNTAINS = [(380, 5620), (5620, 380)]
BLUE_STRUCTS = [
    (650, 2000, 70), (650, 3500, 70), (850, 4650, 70),
    (2250, 3750, 70), (1650, 4350, 70), (1200, 4800, 70),
    (4000, 5350, 70), (2500, 5350, 70), (1350, 5150, 70),
    (850, 5150, 115),
]
ALL_STRUCTS = BLUE_STRUCTS + [(MAP_SIZE - x, MAP_SIZE - y, r) for (x, y, r) in BLUE_STRUCTS]

# Natural LoL Blue-half camp alcoves nested inside C-bowls (#1-#5 + Krugs):
BLUE_CAMPS = [
    (1280, 2060),  # tj_small  (#5 Gromp corner alcove)
    (1500, 3410),  # tj_medium (#3 Wolves horseshoe pocket)
    (1475, 2775),  # tj_big    (#4 Blue Buff C-bowl)
    (3430, 5075),  # bj_small  (Krugs southern pocket)
    (2880, 3930),  # bj_medium (#2 Raptors pocket)
    (3165, 4465),  # bj_big    (#1 Red Buff C-bowl)
]


def load_lol_masks():
    im = Image.open(IMG_PATH).convert('RGB').crop(CROP)
    arr = np.array(im)
    h, w, _ = arr.shape
    lum = 0.299 * arr[:, :, 0] + 0.587 * arr[:, :, 1] + 0.114 * arr[:, :, 2]
    sat = arr.max(axis=2).astype(np.int16) - arr.min(axis=2).astype(np.int16)
    wall = (lum < 36) & (sat < 46)
    return arr, wall, w, h


def dist_to_seg_grid(wx, wy, ax, ay, bx, by):
    vx, vy = bx - ax, by - ay
    l2 = vx * vx + vy * vy
    if l2 == 0:
        return np.hypot(wx - ax, wy - ay)
    t = np.clip(((wx - ax) * vx + (wy - ay) * vy) / l2, 0.0, 1.0)
    return np.hypot(wx - (ax + t * vx), wy - (ay + t * vy))


def clearance_mask(w, h, camps):
    yy, xx = np.mgrid[0:h, 0:w]
    wx = (xx + 0.5) / w * MAP_SIZE
    wy = (yy + 0.5) / h * MAP_SIZE
    bad = np.zeros((h, w), dtype=bool)
    # Match real champion collision clearances (CHAMP_RADIUS = 30) while preserving Baron/Dragon horseshoes
    for pts in LANES:
        for i in range(len(pts) - 1):
            bad |= dist_to_seg_grid(wx, wy, pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1]) < 186.0
    bad |= dist_to_seg_grid(wx, wy, RIVER_SEG[0][0], RIVER_SEG[0][1], RIVER_SEG[1][0], RIVER_SEG[1][1]) < 146.0
    for ex, ey in EPICS:
        bad |= np.hypot(wx - ex, wy - ey) < 155.0
    for sx, sy, sr in ALL_STRUCTS:
        bad |= np.hypot(wx - sx, wy - sy) < (140.0 + sr)
    for fx, fy in FOUNTAINS:
        bad |= np.hypot(wx - fx, wy - fy) < 900.0
    # Leave curved Base Wall rim clear for our explicit base ramparts (R=1200..1460 around 570,5430)
    bad |= np.hypot(wx - 570.0, wy - 5430.0) < 1520.0
    bad |= np.hypot(wx - 5430.0, wy - 570.0) < 1520.0
    for cx, cy in camps:
        bad |= np.hypot(wx - cx, wy - cy) < 136.0
    # Strictly Blue half (y > x) so rot180 across center keeps full pit horseshoes without colliding
    bad |= (wy < wx + 150.0)
    bad |= (wx < 830.0) | (wx > 5170.0) | (wy < 830.0) | (wy > 5170.0)
    return ~bad


def build_alcove_pillar():
    # Iconic Top-left (NW) lane alcove stone ruin pillar (rot180 creates SE alcove pillar)
    return {"look": "partition", "pts": [[250, 260], [340, 220], [415, 290], [385, 385], [295, 410], [230, 340]]}


def extract_snapped_bushes(blue_polys):
    # Extract LoL bush positions from ref_lol_bushes.jpg, snap slim bushes flush along walls (never inside walls),
    # plus compact river pixel bushes and NW corner alcove lane bushes.
    b_im = Image.open('docs/maps/ref_lol_bushes.jpg').convert('RGB')
    bw_img, bh_img = b_im.size
    x0, y0, x1, y1 = int(bw_img * 0.058), int(bh_img * 0.058), int(bw_img * 0.942), int(bh_img * 0.942)
    m = np.array(b_im.crop((x0, y0, x1, y1)))
    mh, mw, _ = m.shape
    R, G, B = m[:, :, 0].astype(int), m[:, :, 1].astype(int), m[:, :, 2].astype(int)
    green = (G - R > 32) & (G - B > 25) & (G > 85)
    seen = np.zeros_like(green)
    dots = []
    for r in range(mh):
        for c in range(mw):
            if green[r, c] and not seen[r, c]:
                q = deque([(r, c)]); seen[r, c] = True; pts = []
                while q:
                    cr, cc = q.popleft(); pts.append((cr, cc))
                    for dr, dc in ((-1, 0), (1, 0), (0, -1), (0, 1)):
                        nr, nc = cr + dr, cc + dc
                        if 0 <= nr < mh and 0 <= nc < mw and green[nr, nc] and not seen[nr, nc]:
                            seen[nr, nc] = True; q.append((nr, nc))
                if len(pts) >= 45:
                    cy = sum(p[0] for p in pts) / len(pts) / mh * MAP_SIZE
                    cx = sum(p[1] for p in pts) / len(pts) / mw * MAP_SIZE
                    dots.append((cx, cy))

    all_polys = list(blue_polys) + [{"pts": [[MAP_SIZE - x, MAP_SIZE - y] for x, y in p["pts"]]} for p in blue_polys]

    def pt_in_poly(px, py, pts):
        inside = False
        n = len(pts)
        for i in range(n):
            j = (i - 1) % n
            xi, yi = pts[i]
            xj, yj = pts[j]
            if ((yi > py) != (yj > py)) and (px < (xj - xi) * (py - yi) / ((yj - yi) if yj != yi else 1e-9) + xi):
                inside = not inside
        return inside

    def closest_wall_info(px, py):
        best_d, best_cx, best_cy, best_tx, best_ty, best_nx, best_ny = 1e9, px, py, 1.0, 0.0, 0.0, 1.0
        inside_any = False
        for wp in all_polys:
            pts = wp["pts"]
            if pt_in_poly(px, py, pts):
                inside_any = True
            n = len(pts)
            for i in range(n):
                j = (i - 1) % n
                ax, ay = pts[j]
                bx, by = pts[i]
                vx, vy = bx - ax, by - ay
                l2 = vx * vx + vy * vy
                if l2 == 0:
                    continue
                t = max(0.0, min(1.0, ((px - ax) * vx + (py - ay) * vy) / l2))
                qx, qy = ax + vx * t, ay + vy * t
                d = math.hypot(px - qx, py - qy)
                if d < best_d:
                    best_d = d
                    best_cx, best_cy = qx, qy
                    L = math.sqrt(l2)
                    tx, ty = vx / L, vy / L
                    nx, ny = -ty, tx
                    # Orient normal outward away from polygon interior
                    if pt_in_poly(qx + nx * 8.0, qy + ny * 8.0, pts):
                        nx, ny = -nx, -ny
                    best_tx, best_ty, best_nx, best_ny = tx, ty, nx, ny
        return (-best_d if inside_any else best_d), best_cx, best_cy, best_tx, best_ty, best_nx, best_ny

    bushes = []
    # Deduplicate across y > x (keep Blue half only, rot180 generates Red half)
    for bx, by in dots:
        # Filter out UI frame ring / shop icon artifacts at outer corners
        if bx < 160 or by > 5840 or (bx > 5200 and by < 800):
            continue
        # Only author for Blue half (y > x) + NW lane alcove dots (where y + x < 1800)
        if by < bx - 60 and not (bx < 1100 and by < 1100):
            continue
        # Skip mirrored duplicate of NW alcove south of river if too close to diagonal
        d, cx, cy, tx, ty, nx, ny = closest_wall_info(bx, by)
        if abs(by - bx) < 300 and d > 210 and bx > 1400:
            # River pixel brush
            bushes.append({"kind": "circle", "x": round(bx), "y": round(by), "r": 66})
            continue
        if d <= 250:
            # Push cleanly outward so bush center is at wallDist >= 52, never overlapping inside wall
            mx, my = cx + nx * 52.0, cy + ny * 52.0
            d2, *_ = closest_wall_info(mx, my)
            if d2 < 46:
                continue
            hl = 88.0
            bushes.append({
                "kind": "seg",
                "x1": round(mx - tx * hl), "y1": round(my - ty * hl),
                "x2": round(mx + tx * hl), "y2": round(my + ty * hl),
                "w": 76,
            })
        elif bx < 900 or by > 5100:
            # Outer Top/Bot lane bush hugging outer border / alcove
            if bx < 520 and by < 900:
                tx, ty = 0.7071, -0.7071
            elif bx < 900:
                tx, ty = 0.0, 1.0
            else:
                tx, ty = 1.0, 0.0
            hl = 95.0
            cx_c = max(140.0, min(5860.0, bx))
            cy_c = max(140.0, min(5860.0, by))
            bushes.append({
                "kind": "seg",
                "x1": round(cx_c - tx * hl), "y1": round(cy_c - ty * hl),
                "x2": round(cx_c + tx * hl), "y2": round(cy_c + ty * hl),
                "w": 74,
            })
    return bushes


def build_base_ramparts():
    # 4 curved Blue Base Rampart Wall polygons along circle center (570, 5430) leaving 3 wide open gates:
    # Top gate ~ -84.2 deg, Mid gate ~ -45.0 deg, Bot gate ~ -5.9 deg.
    ox, oy, r0, r1 = 570.0, 5430.0, 1215.0, 1345.0
    arcs = [
        (-107.0, -96.5),  # left outer wing
        (-71.5,  -57.5),  # top <-> mid gate arc
        (-32.5,  -18.5),  # mid <-> bot gate arc
        (6.5,     17.0),  # bot outer wing
    ]
    out = []
    for d0, d1 in arcs:
        steps = 5
        outer, inner = [], []
        for i in range(steps + 1):
            a = math.radians(d0 + (d1 - d0) * (i / steps))
            outer.append([round(ox + math.cos(a) * r1), round(oy + math.sin(a) * r1)])
            inner.append([round(ox + math.cos(a) * r0), round(oy + math.sin(a) * r0)])
        pts = outer + list(reversed(inner))
        out.append({"look": "partition", "baseWall": True, "pts": pts})
    return out


def fill_holes(bin_mask):
    h, w = bin_mask.shape
    inv = ~bin_mask
    seen = np.zeros((h, w), dtype=bool)
    q = deque()
    for r in range(h):
        for c in (0, w - 1):
            if inv[r, c] and not seen[r, c]:
                seen[r, c] = True
                q.append((r, c))
    for c in range(w):
        for r in (0, h - 1):
            if inv[r, c] and not seen[r, c]:
                seen[r, c] = True
                q.append((r, c))
    while q:
        cr, cc = q.popleft()
        for dr, dc in ((-1, 0), (1, 0), (0, -1), (0, 1)):
            nr, nc = cr + dr, cc + dc
            if 0 <= nr < h and 0 <= nc < w and inv[nr, nc] and not seen[nr, nc]:
                seen[nr, nc] = True
                q.append((nr, nc))
    return bin_mask | (~seen)


def label_components(mask, min_area=55):
    h, w = mask.shape
    labels = np.zeros((h, w), dtype=np.int32)
    cur = 0
    comps = []
    for r in range(h):
        for c in range(w):
            if mask[r, c] and labels[r, c] == 0:
                cur += 1
                q = deque([(r, c)])
                labels[r, c] = cur
                pts = []
                while q:
                    cr, cc = q.popleft()
                    pts.append((cr, cc))
                    for dr, dc in ((-1, 0), (1, 0), (0, -1), (0, 1)):
                        nr, nc = cr + dr, cc + dc
                        if 0 <= nr < h and 0 <= nc < w and mask[nr, nc] and labels[nr, nc] == 0:
                            labels[nr, nc] = cur
                            q.append((nr, nc))
                if len(pts) >= min_area:
                    comps.append((cur, pts))
                else:
                    for pr, pc in pts:
                        labels[pr, pc] = 0
    return labels, comps


def trace_outer_contour(comp_mask):
    h, w = comp_mask.shape
    pad = np.zeros((h + 2, w + 2), dtype=bool)
    pad[1:-1, 1:-1] = comp_mask
    ys, xs = np.where(pad)
    if len(ys) == 0:
        return []
    start = (int(ys[0]), int(xs[0]))
    dirs = [(-1, 0), (-1, 1), (0, 1), (1, 1), (1, 0), (1, -1), (0, -1), (-1, -1)]
    contour = [start]
    cur = start
    backtrack_idx = 6
    for _ in range(h * w * 2):
        found = False
        for step in range(8):
            idx = (backtrack_idx + step) % 8
            nr, nc = cur[0] + dirs[idx][0], cur[1] + dirs[idx][1]
            if pad[nr, nc]:
                prev_idx = (idx + 7) % 8
                er, ec = cur[0] + dirs[prev_idx][0], cur[1] + dirs[prev_idx][1]
                dr, dc = er - nr, ec - nc
                for k, d in enumerate(dirs):
                    if d == (dr, dc):
                        backtrack_idx = k
                        break
                cur = (nr, nc)
                found = True
                break
        if not found or cur == start:
            break
        contour.append(cur)
    return [[(c - 0.5) / w * MAP_SIZE, (r - 0.5) / h * MAP_SIZE] for (r, c) in contour]


def rdp_closed(pts, eps):
    if len(pts) < 4:
        return pts

    def perp_dist(p, a, b):
        vx, vy = b[0] - a[0], b[1] - a[1]
        l2 = vx * vx + vy * vy
        if l2 == 0:
            return math.hypot(p[0] - a[0], p[1] - a[1])
        t = max(0.0, min(1.0, ((p[0] - a[0]) * vx + (p[1] - a[1]) * vy) / l2))
        return math.hypot(p[0] - (a[0] + t * vx), p[1] - (a[1] + t * vy))

    def rdp(arr):
        if len(arr) <= 2:
            return arr
        max_d, idx = -1.0, 0
        for i in range(1, len(arr) - 1):
            d = perp_dist(arr[i], arr[0], arr[-1])
            if d > max_d:
                max_d, idx = d, i
        if max_d > eps:
            return rdp(arr[:idx + 1])[:-1] + rdp(arr[idx:])
        return [arr[0], arr[-1]]

    a = pts[0]
    far_i = max(range(1, len(pts)), key=lambda i: (pts[i][0] - a[0]) ** 2 + (pts[i][1] - a[1]) ** 2)
    h1 = rdp(pts[:far_i + 1])
    h2 = rdp(pts[far_i:] + [pts[0]])
    res = h1[:-1] + h2[:-1]
    return [[round(x), round(y)] for (x, y) in res]


def extract():
    _, wall, w, h = load_lol_masks()
    clear = clearance_mask(w, h, BLUE_CAMPS)
    blue_wall = fill_holes(wall & clear)
    labels, comps = label_components(blue_wall, min_area=55)

    # Separate neighboring islands by >= 118px (~4x CHAMP_RADIUS) while preserving thick curved profiles
    gap_half = 60.0
    pts_by_id = {}
    for cid, pts in comps:
        arr_p = np.array(pts, dtype=np.float32)
        wx_c = (arr_p[:, 1] + 0.5) / w * MAP_SIZE
        wy_c = (arr_p[:, 0] + 0.5) / h * MAP_SIZE
        pts_by_id[cid] = (arr_p, wx_c, wy_c)

    keep_mask = np.zeros_like(blue_wall)
    for cid, (arr_p, wx_c, wy_c) in pts_by_id.items():
        others_x, others_y = [], []
        for oid, (_, ox, oy) in pts_by_id.items():
            if oid == cid:
                continue
            others_x.append(ox[::2])
            others_y.append(oy[::2])
        if others_x:
            ox_all = np.concatenate(others_x)
            oy_all = np.concatenate(others_y)
            dmin = np.min(np.hypot(wx_c[:, None] - ox_all[None, :], wy_c[:, None] - oy_all[None, :]), axis=1)
            arr_p = arr_p[dmin >= gap_half]
        for r, c in arr_p.astype(np.int32):
            keep_mask[r, c] = True

    labels2, comps2 = label_components(keep_mask, min_area=55)
    polys = []
    for cid, _ in comps2:
        cm = fill_holes(labels2 == cid)
        contour = trace_outer_contour(cm)
        simp = rdp_closed(contour, eps=24.0)
        if len(simp) >= 4:
            cx = sum(p[0] for p in simp) / len(simp)
            cy = sum(p[1] for p in simp) / len(simp)
            if abs(cy - cx) < 1100:
                look = 'glass'
            elif cx < 1350 or cy > 4650:
                look = 'cubicles'
            elif abs(cx + cy - 6000) < 900:
                look = 'partition'
            else:
                look = 'shelf'
            polys.append({"look": look, "pts": simp})

    polys.extend(build_base_ramparts())
    polys.append(build_alcove_pillar())
    bushes = extract_snapped_bushes(polys)
    print(json.dumps({"camps": BLUE_CAMPS, "polys": polys, "bushes": bushes}))


def render_3d_surface_preview(walls, camps, river_path, epics):
    # Software shaded 3D isometric terrain preview of Blue Top Jungle + Base Wall (matching walls.js rock heightfield)
    W_OUT, H_OUT = 680, 440
    # Focus crop in scene units (0..60): x in [3..31], z in [13..41]
    x0, z0, x1, z1 = 2.0, 15.0, 32.0, 45.0
    gw, gh = 260, 260
    gx = np.linspace(x0, x1, gw)
    gz = np.linspace(z0, z1, gh)
    X, Z = np.meshgrid(gx, gz)

    # Signed distance inside polygons (positive inside cliff)
    sd = np.full((gh, gw), -10.0, dtype=np.float32)
    is_base = np.zeros((gh, gw), dtype=bool)
    for wobj in walls:
        if wobj.get("kind") != "poly":
            continue
        pts = wobj["pts"]
        px = np.array([p[0] * 0.01 for p in pts], dtype=np.float32)
        pz = np.array([p[1] * 0.01 for p in pts], dtype=np.float32)
        if px.max() < x0 - 1 or px.min() > x1 + 1 or pz.max() < z0 - 1 or pz.min() > z1 + 1:
            continue
        # Point-in-polygon + min edge distance
        inside = np.zeros((gh, gw), dtype=bool)
        min_d = np.full((gh, gw), 1e9, dtype=np.float32)
        n = len(px)
        for i in range(n):
            j = (i - 1) % n
            ax, az, bx, bz = px[j], pz[j], px[i], pz[i]
            cond = ((pz[i] > Z) != (pz[j] > Z)) & (X < ((ax - bx) * (Z - bz) / ((az - bz) if az != bz else 1e-6) + bx))
            inside ^= cond
            vx, vz = bx - ax, bz - az
            l2 = vx * vx + vz * vz
            t = np.clip(((X - ax) * vx + (Z - az) * vz) / (l2 if l2 > 0 else 1.0), 0.0, 1.0)
            d = np.hypot(X - (ax + t * vx), Z - (az + t * vz))
            min_d = np.minimum(min_d, d)
        cur_sd = np.where(inside, min_d, -min_d)
        better = cur_sd > sd
        sd = np.where(better, cur_sd, sd)
        if wobj.get("baseWall"):
            is_base |= (cur_sd > -0.2)

    # Multi-octave ridged craggy cliff heightfield + sloped sides + crevices
    def smoothstep(a, b, v):
        t = np.clip((v - a) / (b - a), 0.0, 1.0)
        return t * t * (3.0 - 2.0 * t)

    slope = smoothstep(-0.22, 0.55, sd)
    ridge1 = 1.0 - np.abs(np.sin(X * 1.65 + Z * 1.15) * np.cos(X * 0.85 - Z * 1.85))
    ridge2 = 0.5 + 0.5 * np.sin(X * 3.1 - Z * 2.4)
    crevice = 0.62 + 0.38 * ridge1 - 0.14 * (1.0 - ridge2)
    base_step = smoothstep(-0.18, 0.12, sd) * (0.64 + 0.16 * np.sin((X + Z) * 5.0))
    cliff_h = np.where(is_base, base_step, slope * (0.48 + 0.34 * np.clip(sd / 1.4, 0.0, 1.0)) * crevice)
    cliff_h = np.maximum(0.0, cliff_h)

    # River depression
    rpts = np.array([[p["x"] * 0.01, p["y"] * 0.01] for p in river_path], dtype=np.float32)
    d_riv = np.full((gh, gw), 1e9, dtype=np.float32)
    for i in range(len(rpts) - 1):
        ax, az = rpts[i]
        bx, bz = rpts[i + 1]
        vx, vz = bx - ax, bz - az
        l2 = vx * vx + vz * vz
        t = np.clip(((X - ax) * vx + (Z - az) * vz) / (l2 if l2 > 0 else 1.0), 0.0, 1.0)
        d_riv = np.minimum(d_riv, np.hypot(X - (ax + t * vx), Z - (az + t * vz)))
    in_river = (1.0 - smoothstep(1.6, 2.5, d_riv)) * smoothstep(1.3, 2.7, np.abs(X + Z - 60.0) * 0.7071)
    Y = cliff_h - 0.30 * in_river

    # Compute surface normals & directional lighting
    dx_s = (x1 - x0) / (gw - 1)
    dz_s = (z1 - z0) / (gh - 1)
    dYdZ, dYdX = np.gradient(Y, dz_s, dx_s)
    nx, ny, nz = -dYdX, np.ones_like(Y), -dYdZ
    nlen = np.sqrt(nx * nx + ny * ny + nz * nz)
    nx /= nlen; ny /= nlen; nz /= nlen
    lx, ly, lz = -0.52, 0.78, 0.35
    ndotl = np.clip(nx * lx + ny * ly + nz * lz, 0.15, 1.0)

    # Hand-painted biome/rock/moss albedo
    col = np.zeros((gh, gw, 3), dtype=np.float32)
    # Walkable ground (sage lane / olive jungle / cyan river)
    on_top_lane = (np.abs(X - 6.5) < 1.8)
    on_mid_lane = (np.abs(X + Z - 60.0) * 0.7071 < 1.8)
    ground_col = np.where((on_top_lane | on_mid_lane)[:, :, None], np.array([154, 158, 112]), np.array([108, 126, 86]))
    river_col = np.array([34, 148, 192])
    ground_col = ground_col * (1.0 - in_river[:, :, None]) + river_col * in_river[:, :, None]

    # Rock slope vs moss cap vs crevice shadow vs base masonry
    is_cliff = cliff_h > 0.02
    steep = ny < 0.80
    crev_dark = np.clip((0.55 - ridge1) * 1.4, 0.0, 0.45)
    rock_col = np.array([96, 108, 106], dtype=np.float32) * (1.0 - crev_dark[:, :, None])
    moss_col = np.array([76, 118, 62], dtype=np.float32) * (0.88 + 0.18 * ridge2[:, :, None])
    base_col = np.array([92, 116, 128], dtype=np.float32)
    cliff_rgb = np.where(is_base[:, :, None], base_col, np.where(steep[:, :, None], rock_col, moss_col))
    base_rgb = np.where(is_cliff[:, :, None], cliff_rgb, ground_col)
    lit = base_rgb * (0.45 + 0.72 * ndotl[:, :, None])
    lit = np.clip(lit, 0, 255).astype(np.uint8)

    # Isometric forward-splat height projection so cliffs & crevices appear in true 3D perspective
    canvas = Image.new("RGB", (W_OUT, H_OUT), (14, 22, 26))
    draw = ImageDraw.Draw(canvas)
    px_arr = np.zeros((H_OUT, W_OUT, 3), dtype=np.uint8)
    px_arr[:, :] = [14, 22, 26]
    # Vectorized painters projection (north-to-south along z)
    sx = ((X - x0) / (x1 - x0) * (W_OUT - 80) + 40).astype(np.int32)
    sy = ((Z - z0) / (z1 - z0) * (H_OUT - 90) + 55 - Y * 24.0).astype(np.int32)
    for r in range(gh):
        for c in range(gw):
            xx = sx[r, c]
            yy = sy[r, c]
            h_drop = 3 if cliff_h[r, c] > 0.02 else 2
            y_end = min(H_OUT, yy + h_drop)
            if 0 <= xx < W_OUT and yy < H_OUT and y_end > 0:
                y_st = max(0, yy)
                px_arr[y_st:y_end, xx:min(W_OUT, xx + 3)] = lit[r, c]
    canvas = Image.fromarray(px_arr)
    draw = ImageDraw.Draw(canvas)
    # Mark camp pockets with clear numbered circles matching LoL reference (#3, #4, #5)
    for cid, cx_w, cy_w, lbl in [
        ('Gromp #5', 1280, 2060, '#5'),
        ('Blue #4', 1475, 2775, '#4'),
        ('Wolves #3', 1500, 3410, '#3'),
        ('Raptors #2', 2880, 3930, '#2'),
    ]:
        cx_s, cz_s = cx_w * 0.01, cy_w * 0.01
        if x0 <= cx_s <= x1 and z0 <= cz_s <= z1:
            px_i = int((cx_s - x0) / (x1 - x0) * (W_OUT - 80) + 40)
            py_i = int((cz_s - z0) / (z1 - z0) * (H_OUT - 90) + 55)
            draw.ellipse([px_i - 12, py_i - 12, px_i + 12, py_i + 12], fill=(232, 188, 84), outline=(18, 26, 30), width=2)
            draw.text((px_i - 6, py_i - 5), lbl, fill=(14, 20, 24))
    draw.text((14, 10), "Bug Smash 3D Sculpted Rock Cliffs (Crevices + Sloped Facets + Base Wall + Alcoves #2-#5)", fill=(240, 215, 136))
    canvas.save(PREVIEW_3D_OUT)


def score_walls():
    payload = json.loads(sys.stdin.read())
    walls = payload["walls"]
    lanes = payload.get("lanes", LANES)
    river_path = payload.get("riverPath", [])
    camps = payload.get("camps", [])
    epics = payload.get("epics", EPICS)
    structs = payload.get("structures", [])
    bushes = payload.get("bushes", [])

    lol_arr, lol_wall, w, h = load_lol_masks()

    wall_mask_img = Image.new("L", (w, h), 0)
    wdraw = ImageDraw.Draw(wall_mask_img)
    for obj in walls:
        if obj["kind"] == "poly":
            pts = [((x / MAP_SIZE) * w, (y / MAP_SIZE) * h) for x, y in obj["pts"]]
            if len(pts) >= 3:
                wdraw.polygon(pts, fill=255)
        elif obj["kind"] == "circle":
            cx, cy = (obj["x"] / MAP_SIZE) * w, (obj["y"] / MAP_SIZE) * h
            r = (obj["r"] / MAP_SIZE) * w
            wdraw.ellipse([cx - r, cy - r, cx + r, cy + r], fill=255)
        elif obj["kind"] == "seg":
            x1, y1 = (obj["x1"] / MAP_SIZE) * w, (obj["y1"] / MAP_SIZE) * h
            x2, y2 = (obj["x2"] / MAP_SIZE) * w, (obj["y2"] / MAP_SIZE) * h
            lw = max(1, int(round((obj["w"] / MAP_SIZE) * w)))
            wdraw.line([(x1, y1), (x2, y2)], fill=255, width=lw)

    bs_wall = np.array(wall_mask_img) > 127

    yy, xx = np.mgrid[0:h, 0:w]
    wx = (xx + 0.5) / w * MAP_SIZE
    wy = (yy + 0.5) / h * MAP_SIZE
    playable = (wx > 780) & (wx < 5220) & (wy > 780) & (wy < 5220)
    blue_half = playable & (wy > wx + 180)

    def iou_dice(a, b, roi):
        ar, br = a & roi, b & roi
        inter = int(np.sum(ar & br))
        union = int(np.sum(ar | br))
        tot = int(np.sum(ar)) + int(np.sum(br))
        return ((inter / union * 100.0) if union else 0.0, (2.0 * inter / tot * 100.0) if tot else 0.0)

    bh_iou, bh_dice = iou_dice(lol_wall, bs_wall, blue_half)
    full_iou, full_dice = iou_dice(lol_wall, bs_wall, playable)
    lol_density = float(lol_wall[playable].mean() * 100.0)
    bs_density = float(bs_wall[playable].mean() * 100.0)

    bs_img = Image.new("RGB", (w, h), (109, 122, 85))
    bdraw = ImageDraw.Draw(bs_img, "RGBA")
    core_b = next((s for s in structs if s["team"] == "blue" and s["kind"] == "core"), {"x": 850, "y": 5150})
    core_r = next((s for s in structs if s["team"] == "red" and s["kind"] == "core"), {"x": 5150, "y": 850})
    for cx_w, cy_w, fill_c, rim_c in [
        (core_b["x"] - 280, core_b["y"] + 280, (112, 148, 162, 245), (72, 168, 223, 210)),
        (core_r["x"] + 280, core_r["y"] - 280, (132, 118, 126, 245), (223, 90, 104, 210)),
    ]:
        for rr, col in [(1340, fill_c), (980, (fill_c[0] + 10, fill_c[1] + 10, fill_c[2] + 10, 235))]:
            px0, py0 = ((cx_w - rr) / MAP_SIZE) * w, ((cy_w - rr) / MAP_SIZE) * h
            px1, py1 = ((cx_w + rr) / MAP_SIZE) * w, ((cy_w + rr) / MAP_SIZE) * h
            bdraw.ellipse([px0, py0, px1, py1], fill=col, outline=rim_c, width=2)
    lw_px = max(4, int(round((360 / MAP_SIZE) * w)))
    for pts in lanes:
        lpts = [((p["x"] / MAP_SIZE) * w, (p["y"] / MAP_SIZE) * h) for p in pts]
        bdraw.line(lpts, fill=(146, 155, 112, 255), width=lw_px, joint="curve")

    river_layer = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    rdraw = ImageDraw.Draw(river_layer, "RGBA")
    rpts = [((p["x"] / MAP_SIZE) * w, (p["y"] / MAP_SIZE) * h) for p in river_path] if river_path else [((700 / MAP_SIZE) * w, (700 / MAP_SIZE) * h), ((5300 / MAP_SIZE) * w, (5300 / MAP_SIZE) * h)]
    rw_px = max(6, int(round((460 / MAP_SIZE) * w)))
    rdraw.line(rpts, fill=(16, 112, 158, 245), width=rw_px, joint="curve")
    rdraw.line(rpts, fill=(44, 174, 222, 180), width=max(4, int(rw_px * 0.44)), joint="curve")
    for ex, ey in epics:
        cx, cy = (ex / MAP_SIZE) * w, (ey / MAP_SIZE) * h
        er = (275 / MAP_SIZE) * w
        rdraw.ellipse([cx - er, cy - er, cx + er, cy + er], fill=(22, 134, 180, 240))
    r_arr = np.array(river_layer)
    yy_r, xx_r = np.mgrid[0:h, 0:w]
    u_diag = ((xx_r + 0.5) / w + (yy_r + 0.5) / h) * 3000.0
    end_fade = np.clip((u_diag - 820.0) / 560.0, 0.0, 1.0) * np.clip((5180.0 - u_diag) / 560.0, 0.0, 1.0)
    mid_dist = np.abs(((xx_r + 0.5) / w * MAP_SIZE) + ((yy_r + 0.5) / h * MAP_SIZE) - 6000.0) * 0.7071
    mid_fade = np.clip((mid_dist - 120.0) / 340.0, 0.22, 1.0)
    r_arr[:, :, 3] = (r_arr[:, :, 3].astype(np.float32) * end_fade * mid_fade).astype(np.uint8)
    bs_img = Image.alpha_composite(bs_img.convert("RGBA"), Image.fromarray(r_arr))
    mid_lane_layer = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    mdraw = ImageDraw.Draw(mid_lane_layer, "RGBA")
    mdraw.line([((2450 / MAP_SIZE) * w, (3550 / MAP_SIZE) * h), ((3550 / MAP_SIZE) * w, (2450 / MAP_SIZE) * h)], fill=(146, 155, 112, 235), width=max(4, int(lw_px * 0.96)))
    ml_arr = np.array(mid_lane_layer)
    ml_alpha = np.clip(1.0 - (mid_dist - 80.0) / 260.0, 0.0, 1.0) * np.clip(1.0 - np.abs(((yy_r + 0.5) / h - (xx_r + 0.5) / w) * 3000.0) / 480.0, 0.0, 1.0)
    ml_arr[:, :, 3] = (ml_arr[:, :, 3].astype(np.float32) * ml_alpha).astype(np.uint8)
    bs_img = Image.alpha_composite(bs_img, Image.fromarray(ml_arr)).convert("RGB")
    bdraw = ImageDraw.Draw(bs_img, "RGBA")

    for b in bushes:
        if b["kind"] == "circle":
            cx, cy = (b["x"] / MAP_SIZE) * w, (b["y"] / MAP_SIZE) * h
            r = max(2, (b["r"] / MAP_SIZE) * w)
            bdraw.ellipse([cx - r, cy - r, cx + r, cy + r], fill=(42, 128, 64, 210))
        elif b["kind"] == "seg":
            x1, y1 = (b["x1"] / MAP_SIZE) * w, (b["y1"] / MAP_SIZE) * h
            x2, y2 = (b["x2"] / MAP_SIZE) * w, (b["y2"] / MAP_SIZE) * h
            bdraw.line([(x1, y1), (x2, y2)], fill=(42, 128, 64, 210), width=max(2, int(round((b["w"] / MAP_SIZE) * w))))

    for obj in walls:
        if obj["kind"] == "poly":
            pts = [((x / MAP_SIZE) * w, (y / MAP_SIZE) * h) for x, y in obj["pts"]]
            if len(pts) >= 3:
                is_bw = bool(obj.get("baseWall"))
                bdraw.polygon(pts, fill=(44, 62, 72, 255) if is_bw else (10, 20, 27, 255), outline=(104, 152, 174, 255) if is_bw else (46, 74, 82, 255))

    for cx, cy in camps:
        px, py = (cx / MAP_SIZE) * w, (cy / MAP_SIZE) * h
        bdraw.ellipse([px - 4, py - 4, px + 4, py + 4], fill=(232, 188, 84, 240))
    for st in structs:
        px, py = (st["x"] / MAP_SIZE) * w, (st["y"] / MAP_SIZE) * h
        sr = 8 if st["kind"] == "core" else 5
        scol = (57, 168, 255, 255) if st["team"] == "blue" else (255, 77, 94, 255)
        bdraw.ellipse([px - sr, py - sr, px + sr, py + sr], fill=scol, outline=(7, 13, 18, 255))

    diff_rgb = np.zeros((h, w, 3), dtype=np.uint8)
    diff_rgb[:, :] = [16, 26, 32]
    diff_rgb[playable] = [28, 42, 46]
    both = lol_wall & bs_wall
    miss = lol_wall & (~bs_wall)
    extra = bs_wall & (~lol_wall)
    diff_rgb[both & playable] = [74, 214, 108]
    diff_rgb[miss & playable] = [235, 76, 86]
    diff_rgb[extra & playable] = [62, 168, 245]
    diff_rgb[both & (~playable)] = [42, 118, 62]
    diff_img = Image.fromarray(diff_rgb)

    panel = Image.new("RGB", (w * 3 + 16, h), (12, 20, 25))
    panel.paste(Image.fromarray(lol_arr), (0, 0))
    panel.paste(bs_img, (w + 8, 0))
    panel.paste(diff_img, (w * 2 + 16, 0))
    panel.save(COMPARE_OUT)

    render_3d_surface_preview(walls, camps, river_path, epics)

    buf = io.BytesIO()
    diff_img.resize((360, 360), Image.NEAREST).save(buf, format='PNG')
    heatmap_b64 = base64.b64encode(buf.getvalue()).decode('ascii')

    print(json.dumps({
        "lolDensity": round(lol_density, 1),
        "bsDensity": round(bs_density, 1),
        "blueHalfIoU": round(bh_iou, 1),
        "blueHalfDice": round(bh_dice, 1),
        "fullIoU": round(full_iou, 1),
        "fullDice": round(full_dice, 1),
        "heatmapB64": heatmap_b64,
    }))


if __name__ == '__main__':
    if '--score' in sys.argv:
        score_walls()
    else:
        extract()
