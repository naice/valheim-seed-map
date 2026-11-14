import json, os, glob, collections, pickle
import sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from paths import WORK as S
def load():
    pk = os.path.join(S, "all.pkl")
    if os.path.exists(pk): return pickle.load(open(pk, "rb"))
    comps = []; files = {}; gos = {}; errs = []
    for f in glob.glob(os.path.join(S, "out", "*.json")):
        d = json.load(open(f))
        for x in d["files"]: files[x["name"]] = {"bundle": d["bundle"], "ext": x["externals"]}
        for c in d["comps"]: c["bundle"] = d["bundle"]; comps.append(c)
        gos.update(d["gos"]); errs += d["errors"]
    r = {"comps": comps, "files": files, "gos": gos, "errs": errs}
    pickle.dump(r, open(pk, "wb")); return r
