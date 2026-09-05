"""Generate _data/ioling/map_paths.yml from Natural Earth country polygons.

Usage:  python3 _tools/build_map.py

Run again only if the basemap itself needs changing -- the IOL categories are
computed at build time by _includes/ioling/participation_map.html, so adding a
new contest year needs no regeneration.
"""
import json, math, collections

import os, urllib.request

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SCRATCH = os.path.join(REPO, "_tools")
# Ukraine's point-of-view edition. Natural Earth's default ("de facto") basemap
# draws Crimea as part of Russia; the _ukr variant follows Ukraine's
# internationally recognised borders, in line with UN GA Resolution 68/262.
SOURCE = ("https://raw.githubusercontent.com/nvkelso/natural-earth-vector/"
          "master/geojson/ne_10m_admin_0_countries_ukr.geojson")
EPS, MIN_AREA, PREC, W = 0.35, 6.0, 1, 1000.0
A1, A2, A3, A4 = 1.340264, -0.081106, 0.000893, 0.003796
S3 = math.sqrt(3)

def equal_earth(lon, lat):
    lam, phi = math.radians(lon), math.radians(lat)
    th = math.asin(max(-1.0, min(1.0, (S3/2)*math.sin(phi))))
    t2 = th*th
    den = 3*(9*A4*t2**4 + 7*A3*t2**3 + 3*A2*t2 + A1)
    return 2*S3*lam*math.cos(th)/den, A4*th**9 + A3*th**7 + A2*th**3 + A1*th

def dp_open(pts, eps):
    if len(pts) < 3: return pts
    keep = [False]*len(pts); keep[0] = keep[-1] = True
    stack = [(0, len(pts)-1)]
    while stack:
        s, e = stack.pop()
        if e <= s+1: continue
        x1,y1 = pts[s]; x2,y2 = pts[e]
        dx, dy = x2-x1, y2-y1
        norm = math.hypot(dx, dy)
        dmax, idx = -1.0, -1
        for i in range(s+1, e):
            x0,y0 = pts[i]
            d = math.hypot(x0-x1, y0-y1) if norm < 1e-12 else abs(dy*x0 - dx*y0 + x2*y1 - y2*x1)/norm
            if d > dmax: dmax, idx = d, i
        if dmax > eps:
            keep[idx] = True; stack.append((s, idx)); stack.append((idx, e))
    return [p for p,k in zip(pts, keep) if k]

def simplify_ring(ring, eps):
    pts = ring[:-1] if len(ring) > 1 and ring[0] == ring[-1] else ring[:]
    if len(pts) < 4: return ring
    x0,y0 = pts[0]
    k = max(range(len(pts)), key=lambda i: (pts[i][0]-x0)**2 + (pts[i][1]-y0)**2)
    out = dp_open(pts[:k+1], eps)[:-1] + dp_open(pts[k:] + [pts[0]], eps)[:-1]
    return out if len(out) >= 3 else ring

def ring_area(r):
    a = 0.0
    for i in range(len(r)-1):
        a += r[i][0]*r[i+1][1] - r[i+1][0]*r[i][1]
    return abs(a)/2

# --- load, project, group by ISO ---------------------------------------------
cache = os.path.join(SCRATCH, "ne_10m_ukr.json")
if not os.path.exists(cache):
    print("downloading Natural Earth 10m countries (Ukraine POV), ~13 MB ...")
    urllib.request.urlretrieve(SOURCE, cache)
geo = json.load(open(cache))
groups = collections.OrderedDict()
xs, ys = [], []
for f in geo["features"]:
    p = f["properties"]
    name = p.get("NAME")
    if name in ("Antarctica",): continue
    iso = p.get("ISO_A2_EH") or ""
    if iso == "-99": iso = ""                      # never fall back to POSTAL
    key = iso if iso else f"~{name}"               # ~ = not an ISO territory
    g = f["geometry"]
    polys = g["coordinates"] if g["type"] == "MultiPolygon" else [g["coordinates"]]
    rings = []
    for poly in polys:
        for ring in poly:
            pr = [equal_earth(lo, la) for lo, la in ring]
            rings.append(pr)
            for x, y in pr: xs.append(x); ys.append(y)
    slot = groups.setdefault(key, {"iso": iso, "name": name, "rings": []})
    slot["rings"].extend(rings)

minx, maxx, miny, maxy = min(xs), max(xs), min(ys), max(ys)
sc = W/(maxx-minx)
H = (maxy-miny)*sc

# --- IOL codes, so we know which micro-territories need a marker -------------
import re
ymlsrc = open(f"{REPO}/_data/ioling/countries.yml").read()
iol_iso = set(re.findall(r'^  iso_2: (\S+)', ymlsrc, re.M))

rows = []
for key, g in groups.items():
    areas = [ring_area(r) for r in g["rings"]]
    biggest = max(areas) if areas else 0
    segs, total_px, cx, cy, best = [], 0.0, None, None, -1
    for r, a in zip(g["rings"], areas):
        px = [((x-minx)*sc, (maxy-y)*sc) for x, y in r]
        apx = a*sc*sc
        if apx < MIN_AREA and a != biggest: continue
        simp = simplify_ring(px, EPS)
        if len(simp) < 3: continue
        total_px += apx
        if apx > best:
            best = apx
            cx = sum(q[0] for q in simp)/len(simp)
            cy = sum(q[1] for q in simp)/len(simp)
        segs.append("M" + "L".join(f"{x:.{PREC}f},{y:.{PREC}f}" for x, y in simp) + "Z")
    if not segs: continue
    rows.append({"iso": g["iso"], "name": g["name"], "d": "".join(segs),
                 "area": total_px, "cx": cx, "cy": cy})

micro = [r for r in rows if r["iso"] in iol_iso and r["area"] < 8]
print(f"viewBox 0 0 {W:.0f} {H:.0f}   shapes={len(rows)}")
print("micro-territories needing a marker dot:",
      ", ".join(f'{r["name"]}({r["iso"]},{r["area"]:.0f}px2)' for r in sorted(micro, key=lambda r: r["area"])))

def q(s): return '"' + str(s).replace('\\', '\\\\').replace('"', '\\"') + '"'
lines = ["# GENERATED FILE -- do not edit by hand.",
         "# Source: Natural Earth 1:10m admin-0 countries, Ukraine point-of-view edition",
         "# (public domain), projected to Equal Earth. Regenerate only to change the",
         "# basemap itself;",
         "# country colours are derived from contests.yml + results_by_countries.yml",
         "# at build time, so a new IOL year needs no change here.",
         f"# viewBox: 0 0 {W:.0f} {H:.1f}", ""]
for r in sorted(rows, key=lambda r: -r["area"]):
    lines.append(f"- iso: {q(r['iso'])}")
    lines.append(f"  name: {q(r['name'])}")
    if r["iso"] in {m["iso"] for m in micro}:
        lines.append(f"  cx: {r['cx']:.1f}")
        lines.append(f"  cy: {r['cy']:.1f}")
    lines.append(f"  d: {q(r['d'])}")
out = "\n".join(lines) + "\n"
open(f"{REPO}/_data/ioling/map_paths.yml", "w").write(out)
print(f"wrote _data/ioling/map_paths.yml  ({len(out)/1024:.0f} KB)")
