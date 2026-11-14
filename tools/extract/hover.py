import UnityPy, json
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from paths import BUNDLES, WORK
B = BUNDLES + "/c4210710"
env = UnityPy.load(B); out = {}; cache = {}
for af in env.assets:
    objs = af.objects
    for pid, o in objs.items():
        if o.type.name != "MonoBehaviour" or not o.serialized_type or not o.serialized_type.node: continue
        k = id(o.serialized_type)
        if k not in cache:
            names = [c.m_Name for c in o.serialized_type.node.m_Children]
            cache[k] = "m_text" in names and len(names) < 9 and isinstance(o.read_typetree().get("m_text"), str)
        if not cache[k]: continue
        t = o.read_typetree()
        out[str(t["m_GameObject"]["m_PathID"])] = t["m_text"]
json.dump(out, open(os.path.join(WORK, "hover.json"), "w"))
print(len(out), list(out.items())[:20])
