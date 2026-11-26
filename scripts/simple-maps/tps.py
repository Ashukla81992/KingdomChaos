import json, numpy as np
from scipy.interpolate import RBFInterpolator
def make_warp(pairsf, mapid, smoothing=0.0):
    P = np.array(json.load(open(pairsf))[mapid], float)
    f = RBFInterpolator(P[:, :2], P[:, 2:], kernel='thin_plate_spline', smoothing=smoothing)
    return lambda p: tuple(float(v) for v in f(np.array([p], float))[0])
