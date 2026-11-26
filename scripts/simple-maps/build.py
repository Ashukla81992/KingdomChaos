import json, sys, numpy as np
from PIL import Image
from scipy import ndimage as ndi
from skimage.morphology import skeletonize
from skimage.graph import route_through_array
from tps import make_warp
from mask import road_mask

MAP = sys.argv[1]; ART = sys.argv[2]; OUT = sys.argv[3]
cfg = json.load(open('pairs.json'))
overrides = cfg.get('overrides_' + MAP, {})   # node id -> [x,y] fixed (no snap)
noTrace = set(cfg.get('notrace_' + MAP, []))  # edge ids drawn straight (warped)
via = cfg.get('via_' + MAP, {})              # edge/chain key -> extra waypoints
nodes = [n for n in json.load(open('nodes.json')) if n['map'] == MAP]
byid = {n['id']: n for n in nodes}
edges = [e for e in json.load(open('edges.json')) if e['a'] in byid and e['b'] in byid]
warp = make_warp('pairs.json', MAP)
mask = road_mask(ART) if MAP == 'island' else None
if MAP == 'dungeon':
    from mask import road_mask as rm
mask = road_mask(ART)
dt = ndi.distance_transform_edt(mask)
skel = skeletonize(mask & (dt > 4))
sk_pts = np.argwhere(skel)  # (y,x)
from scipy.spatial import cKDTree
tree = cKDTree(sk_pts[:, ::-1])
cost = np.where(mask, 1.0 + 3.0 * np.exp(-dt / 6.0), 60.0)

def snap(p, r=45):
    d, i = tree.query(p)
    return tuple(map(float, sk_pts[i][::-1])) if d <= r else tuple(p)

def trace(a, b):
    a = (int(round(a[1])), int(round(a[0]))); b = (int(round(b[1])), int(round(b[0])))
    path, c = route_through_array(cost, a, b, fully_connected=True, geometric=True)
    pts = [(x, y) for y, x in path]
    off = sum(1 for (x, y) in pts if not mask[y, x]) / max(1, len(pts))
    return pts, off

fixed = {}  # final positions
pos0 = {n['id']: warp(n['xy']) for n in nodes}
road_nodes = {n['id'] for n in nodes if n['lane'] not in ('final',) and n['type'] not in ('castle', 'temple')}
FIXED_ONLY = set(overrides) - road_nodes
for k, v in overrides.items(): pos0[k] = tuple(v)
# graph of road edges
adj = {k: [] for k in road_nodes}
road_edges = []
for e in edges:
    if e['a'] in road_nodes and e['b'] in road_nodes:
        adj[e['a']].append((e['b'], e['id'])); adj[e['b']].append((e['a'], e['id'])); road_edges.append(e)
anchors = ({k for k in road_nodes if len(adj[k]) != 2} | set(overrides) | set(cfg.get('anchors_' + MAP, []))) & road_nodes
# also break at edges not traced
for e in road_edges:
    if e['id'] in noTrace: anchors |= {e['a'], e['b']}
for k in road_nodes:
    if k in anchors: fixed[k] = pos0[k] if k in overrides else snap(pos0[k])
# walk chains
seen = set(); chains = []
for a in sorted(anchors):
    for (nb, eid) in adj[a]:
        if eid in seen: continue
        chain = [a]; eids = [eid]; prev, cur = a, nb
        seen.add(eid)
        while cur not in anchors:
            chain.append(cur)
            nxt = [(x, i) for (x, i) in adj[cur] if i not in seen]
            if not nxt: break
            (x, i) = nxt[0]; seen.add(i); eids.append(i); prev, cur = cur, x
        chain.append(cur)
        chains.append((chain, eids))
routes = {}
report = []
def sub_polyline(pts, s0, s1, cum):
    out = []
    def at(s):
        j = np.searchsorted(cum, s); j = min(max(j, 1), len(pts) - 1)
        t = (s - cum[j-1]) / max(1e-9, cum[j] - cum[j-1])
        return (pts[j-1][0] + (pts[j][0]-pts[j-1][0])*t, pts[j-1][1] + (pts[j][1]-pts[j-1][1])*t)
    out.append(at(s0))
    for j in range(len(pts)):
        if s0 < cum[j] < s1: out.append(pts[j])
    out.append(at(s1))
    return out
def simplify(pts, eps=2.5):
    if len(pts) < 3: return pts
    a, b = np.array(pts[0]), np.array(pts[-1])
    ab = b - a; L = np.hypot(*ab) or 1e-9
    d = [abs(ab[0]*(p[1]-a[1]) - ab[1]*(p[0]-a[0])) / L for p in pts]
    i = int(np.argmax(d))
    if d[i] > eps: return simplify(pts[:i+1], eps)[:-1] + simplify(pts[i:], eps)
    return [pts[0], pts[-1]]
for chain, eids in chains:
    a, b = chain[0], chain[-1]
    if len(eids) == 1 and eids[0] in noTrace:
        routes[eids[0]] = None; continue
    key = f'{a}..{b}'
    wps = [fixed[a]] + [tuple(p) for p in via.get(key, [])]
    if not via.get(key):
        wps += [snap(pos0[k], 30) for k in chain[1:-1]]
    wps += [fixed[b]]
    pts = []; offs = []
    for p, q in zip(wps, wps[1:]):
        seg, off = trace(p, q); offs.append(off)
        pts += seg if not pts else seg[1:]
    cum = np.concatenate([[0], np.cumsum([np.hypot(pts[i][0]-pts[i-1][0], pts[i][1]-pts[i-1][1]) for i in range(1, len(pts))])])
    n = len(chain) - 1
    marks = [cum[-1] * i / n for i in range(n + 1)]
    for i, k in enumerate(chain[1:-1], 1):
        j = np.searchsorted(cum, marks[i]); fixed[k] = tuple(map(float, pts[min(j, len(pts)-1)]))
    for i, eid in enumerate(eids):
        poly = simplify(sub_polyline(pts, marks[i], marks[i+1], cum))
        # orient a->b per edge def
        e = next(x for x in edges if x['id'] == eid)
        if chain[i] != e['a']: poly = poly[::-1]
        routes[eid] = poly
    report.append((max(offs), key, round(cum[-1]), n))
for k in byid:
    if k not in fixed: fixed[k] = pos0[k]
# untraced edges: straight between final positions, warped interior
for e in edges:
    if routes.get(e['id']) is None:
        routes[e['id']] = [fixed[e['a']], fixed[e['b']]]
json.dump({'nodes': {k: [round(v[0]), round(v[1])] for k, v in fixed.items()},
           'routes': {k: [[round(x), round(y)] for x, y in v] for k, v in routes.items()}}, open(OUT, 'w'))
for r in sorted(report, reverse=True)[:25]: print('%.2f %s len=%d steps=%d' % r)
