import sys, numpy as np
from PIL import Image
from scipy import ndimage as ndi
def road_mask(path):
    a = np.asarray(Image.open(path).convert('RGB')).astype(int)
    R,G,B = a[...,0],a[...,1],a[...,2]
    tan = (R>185)&(G>145)&(B>80)&(R-B>35)&(R>=G)&(G-B>15)
    pastel = (R>170)&(G>160)&(B>160)&((R+G+B)>560)  # cream dots, pastel lanes
    m = tan|pastel
    m = ndi.binary_opening(m, iterations=1)
    m = ndi.binary_closing(m, iterations=3)
    lab, n = ndi.label(m)
    sizes = ndi.sum(m, lab, range(1, n + 1))
    m = lab == (1 + int(np.argmax(sizes)))
    return m
if __name__ == '__main__':
    m = road_mask(sys.argv[1])
    Image.fromarray((m*255).astype(np.uint8)).save(sys.argv[2])
