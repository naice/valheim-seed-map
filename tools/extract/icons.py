"""Write a 64x64 PNG icon for every shown item that has none yet:  icons.py"""
import UnityPy, os, json, sys, glob
from PIL import Image


sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from paths import BUNDLES as B, WORK as S, REPO
OUT = REPO + "/poi-icons/items"
keep = set(json.load(open(S + "/keep.json")))
# cab name -> bundle file (from the raw dump)
cab2bundle = {}
for f in glob.glob(S + "/out/*.json"):
    d = json.load(open(f))
    for x in d["files"]:
        cab2bundle[x["name"].lower()] = d["bundle"]
envs = {}


def assets_file(cab):
    cab = cab.lower()
    b = cab2bundle[cab]
    if b not in envs:
        envs[b] = UnityPy.load(os.path.join(B, b))
    for af in envs[b].assets:
        if af.name.lower() == cab:
            return af
    raise Exception("cab " + cab)


main = assets_file("cab-8923bd833c4171316cf3c761b642c1c8")
done = miss = 0
for o in main.objects.values():
    if o.type.name != "MonoBehaviour":
        continue
    nd = o.serialized_type.node if o.serialized_type else None
    if nd is None or "m_itemData" not in [c.m_Name for c in nd.m_Children]:
        continue
    t = o.read_typetree()
    name = main.objects[t["m_GameObject"]["m_PathID"]].read().m_Name
    if name not in keep or os.path.exists(os.path.join(OUT, name + ".png")):
        continue
    ic = t["m_itemData"]["m_shared"].get("m_icons") or []
    try:
        p = ic[0]
        af = main if p["m_FileID"] == 0 else assets_file(os.path.basename(main.externals[p["m_FileID"] - 1].path))
        img = af.objects[p["m_PathID"]].read().image.convert("RGBA")
        if img.size != (64, 64):
            img = img.resize((64, 64), Image.LANCZOS)
        img.save(os.path.join(OUT, name + ".png"), optimize=True)
        keep.discard(name)
        done += 1
    except Exception as e:
        miss += 1
        print("ICONERR", name, e, flush=True)
print("written", done, "errors", miss)
