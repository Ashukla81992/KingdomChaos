import numpy as np, cv2, sys
from scipy import ndimage as ndi
im = cv2.imread(sys.argv[1])
boxes = [(800,340,1010,525), (800,470,960,575), (560,360,750,480), (620,460,745,550)]
for x0,y0,x1,y1 in boxes:
    sub = im[y0:y1, x0:x1].copy()
    B,G,R = [sub[...,i].astype(int) for i in range(3)]
    light = (R>185)&(G>200)&(B>185)
    lab,n = ndi.label(light)
    keep = np.zeros_like(light)
    for i,sl in enumerate(ndi.find_objects(lab)):
        s = (lab[sl]==i+1).sum(); h=sl[0].stop-sl[0].start; w=sl[1].stop-sl[1].start
        if 100 < s < 1500 and w<45 and h<40 and s > 0.5*w*h: keep[sl] |= lab[sl]==i+1
    m = ndi.binary_dilation(keep, iterations=4)
    sat = np.max(sub,axis=2).astype(int)-np.min(sub,axis=2)
    lane = ~light & ~m & (sat > 25) & ((B>140)|(R>200)) & (sub.sum(axis=2) > 420)
    if not keep.any() or not lane.any(): continue
    _, (iy, ix) = ndi.distance_transform_edt(~lane, return_indices=True)
    sub[m] = sub[iy[m], ix[m]]
    blur = cv2.GaussianBlur(sub, (0,0), 3); soft = cv2.GaussianBlur(m.astype(np.float32),(0,0),1.5)[...,None]
    im[y0:y1, x0:x1] = (sub*(1-soft)+blur*soft).astype(np.uint8)
cv2.imwrite(sys.argv[2], im)
