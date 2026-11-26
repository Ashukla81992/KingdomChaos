import sys, numpy as np, cv2
from scipy import ndimage as ndi
src, out = sys.argv[1], sys.argv[2]
dil = int(sys.argv[3]) if len(sys.argv) > 3 else 4
thr = float(sys.argv[4]) if len(sys.argv) > 4 else 0.45
fill = float(sys.argv[5]) if len(sys.argv) > 5 else 0.4
im = cv2.imread(src)
B, G, R = [im[..., i].astype(int) for i in range(3)]
cream = (R > 222) & (G > 205) & (B > 140) & (R - B < 112) & (R >= G - 5) & (G - B > 12)
lab, n = ndi.label(cream)
sizes = ndi.sum(cream, lab, range(1, n + 1))
objs = ndi.find_objects(lab)
keep = np.zeros_like(cream)
road = (R > 175) & (G > 135) & (B > 80) & (R - B > 40) & (G - B > 20) & ~cream
for i, sl in enumerate(objs):
    h = sl[0].stop - sl[0].start; w = sl[1].stop - sl[1].start
    if not (40 < sizes[i] < 1600 and 7 < w < 60 and 5 < h < 48 and sizes[i] > fill * w * h): continue
    y0, y1, x0, x1 = max(sl[0].start - 9, 0), sl[0].stop + 9, max(sl[1].start - 9, 0), sl[1].stop + 9
    blob = lab[y0:y1, x0:x1] == i + 1
    ring = ndi.binary_dilation(blob, iterations=8) & ~ndi.binary_dilation(blob, iterations=4)
    if road[y0:y1, x0:x1][ring].mean() > thr: keep[y0:y1, x0:x1] |= blob
m = ndi.binary_dilation(keep, iterations=dil)
tan = (R > 175) & (G > 135) & (B > 80) & (B < 200) & (R - B > 40) & (G - B > 20) & ~m
_, (iy, ix) = ndi.distance_transform_edt(~tan, return_indices=True)
res = im.copy()
res[m] = im[iy[m], ix[m]]
blur = cv2.GaussianBlur(res, (0, 0), 3)
soft = cv2.GaussianBlur(m.astype(np.float32), (0, 0), 1.5)[..., None]
res = (res * (1 - soft) + blur * soft).astype(np.uint8)
cv2.imwrite(out, res)
print(int(keep.sum()), 'px of dots')
