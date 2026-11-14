"""Vollständigkeitsprüfung: welche (von dumpall.py nicht erfassten) Komponenten verweisen auf Gegenstände?

Liest alle übrigen MonoBehaviours des Haupt-Bundles und listet je Komponententyp (erkennbar an seinen Feldnamen)
die Felder, die auf einen Gegenstand zeigen – so fallen neue Spielmechaniken auf, die eine Quelle sein könnten.
    python tools/extract/audit.py
"""
import UnityPy, os, sys, json, collections
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from paths import BUNDLES, WORK
from dumpall import classify
from model import ITEMS, MAIN

item_ids = {}
for name, c in ITEMS.items():
    item_ids[c["go"]] = name
    item_ids[c["pid"]] = name


def has_pptr(node, top=True):
    for ch in node.m_Children:
        if ch.m_Type.startswith("PPtr<") and not (top and ch.m_Name in ("m_GameObject", "m_Script")):
            return True
        if has_pptr(ch, False):
            return True
    return False


def walk(t, path, hits):
    if isinstance(t, dict):
        if len(t) == 2 and "m_PathID" in t and "m_FileID" in t:
            if t["m_FileID"] == 0 and t["m_PathID"] in item_ids:
                hits.append((path, item_ids[t["m_PathID"]]))
        else:
            for k, v in t.items():
                walk(v, path + "." + k if path else k, hits)
    elif isinstance(t, list):
        for v in t:
            walk(v, path + "[]", hits)


env = UnityPy.load(os.path.join(BUNDLES, "c4210710"))
found = collections.defaultdict(lambda: {"n": 0, "fields": collections.Counter(), "items": collections.Counter(), "gos": set(), "sig": None})
for af in env.assets:
    if af.name.lower() != MAIN:
        continue
    cache = {}
    for pid, o in af.objects.items():
        if o.type.name != "MonoBehaviour" or o.serialized_type is None or o.serialized_type.node is None:
            continue
        st = o.serialized_type
        k = id(st)
        if k not in cache:
            cache[k] = classify(st.node) is None and has_pptr(st.node)
        if not cache[k]:
            continue
        try:
            t = o.read_typetree()
        except Exception:
            continue
        hits = []
        walk(t, "", hits)
        if not hits:
            continue
        sig = tuple(c.m_Name for c in st.node.m_Children if c.m_Name not in ("m_GameObject", "m_Enabled", "m_Script", "m_Name"))
        e = found[sig]
        e["n"] += 1
        for p, it in hits:
            e["fields"][p] += 1
            e["items"][it] += 1
        if len(e["gos"]) < 6:
            try:
                e["gos"].add(af.objects[t["m_GameObject"]["m_PathID"]].read().m_Name)
            except Exception:
                pass
out = [{"sig": list(s)[:14], "n": e["n"], "fields": dict(e["fields"]), "items": e["items"].most_common(12), "gos": sorted(e["gos"])} for s, e in found.items()]
out.sort(key=lambda x: -x["n"])
json.dump(out, open(os.path.join(WORK, "audit.json"), "w"), indent=1)
for x in out:
    print(x["n"], x["sig"][:8], "|", x["fields"], "|", x["gos"], "|", [i for i, _ in x["items"]][:8])
