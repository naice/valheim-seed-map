"""items_raw.json -> tools/data/items.json + tools/data/item-names.json (only what the website shows)."""
import json, sys, os, collections
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from paths import WORK as S, REPO
LOCFILE = sys.argv[1]   # localization.json: Token -> { en, de, ... }
raw = json.load(open(S + "/items_raw.json", encoding="utf-8"))
LOC = json.load(open(LOCFILE, encoding="utf-8"))
I, CR, PC = raw["items"], raw["creatures"], raw["pieces"]
BIOMES = [(1, "meadows"), (8, "blackforest"), (2, "swamp"), (4, "mountain"), (16, "plains"), (512, "mistlands"), (32, "ashlands"), (64, "deepnorth"), (256, "ocean")]
bl = lambda m: [n for b, n in BIOMES if m & b]
CAT = {1: "materials", 2: "food", 3: "weapons", 4: "weapons", 14: "weapons", 22: "weapons", 15: "weapons", 19: "weapons", 9: "weapons", 23: "weapons",
       5: "armor", 6: "armor", 7: "armor", 11: "armor", 12: "armor", 17: "armor", 18: "armor", 24: "armor", 13: "trophies", 16: "misc", 21: "misc", 20: "misc"}
AXE = {0: "AxeStone", 1: "AxeFlint", 2: "AxeBronze", 3: "AxeIron", 4: "AxeBlackMetal"}
PICK = {0: "PickaxeAntler", 1: "PickaxeBronze", 2: "PickaxeIron", 3: "PickaxeBlackMetal"}
used_tokens = set()


def tok(t):
    """$item_wood -> item_wood if the game has a text for it"""
    if not t or not t.startswith("$"):
        return None
    k = t[1:]
    if k in LOC and LOC[k].get("en"):
        used_tokens.add(k)
        return k
    return None


def has(t):
    return bool(t) and t.startswith("$") and t[1:] in LOC and bool(LOC[t[1:]].get("en"))


def r4(x):
    return round(x, 3)


# ---- which items are shown
cand = {n: e for n, e in I.items() if has(e["name"]) and e["hasIcon"] and e["type"] in CAT}


def pruned(e):
    src = {}
    for k, v in e.get("src", {}).items():
        if k == "recipe":
            v = [dict(r, res=[x for x in r["res"] if x["item"] in cand]) for r in v]
        elif k == "convert":
            v = [x for x in v if x["from"] in cand]
        elif k == "creature":
            v = [x for x in v if CR[x["creature"]]["placed"] or CR[x["creature"]]["parent"] or CR[x["creature"]]["egg"]]
            v = [x for x in v if has(CR[x["creature"]]["name"]) and x["chance"] > 0 and x["max"] > 0]
        elif k == "fishdrop":
            v = [x for x in v if x["fish"] in cand]
        elif k in ("world", "loc"):
            v = [x for x in v if x["chance"] > 0 and x.get("tool") != "none"]
        elif k == "grow":
            v = [x for x in v if x["chance"] >= 0.9 and x["cultivated"]]
        if v:
            src[k] = v
    return src


SRC = {n: pruned(e) for n, e in cand.items()}
keep = set(n for n in cand if SRC[n])
# an item without any source stays if a shown item needs it, unless it merely duplicates the name of a shown item
names_with_src = collections.Counter(cand[n]["name"] for n in keep)
for n, e in cand.items():
    if n in keep:
        continue
    u = e.get("uses", {})
    if (u.get("recipe") or u.get("piece") or u.get("convert")) and not names_with_src[e["name"]]:
        keep.add(n)
# several prefabs with the same name: keep the one(s) that can actually be crafted / found by the player
byname = collections.defaultdict(list)
for n in keep:
    byname[cand[n]["name"]].append(n)
for name, ns in byname.items():
    if len(ns) > 1:
        best = [n for n in ns if any(k in SRC[n] for k in ("recipe", "world", "creature", "trader", "convert", "fish", "grow"))]
        if best and len(best) < len(ns):
            for n in ns:
                if n not in best:
                    keep.discard(n)
print("shown items:", len(keep))


def amount(x):
    lo, hi = min(x["min"], x["max"]), max(x["min"], x["max"])
    return max(lo, 1), max(hi, 1)


def tooled(d, tool, tier):
    if tool in ("axe", "axe|pickaxe"):
        d["tool"] = "axe" if tool == "axe" else "axepick"
        d["toolItem"] = AXE.get(tier, AXE[4])
    elif tool == "pickaxe":
        d["tool"] = "pickaxe"
        d["toolItem"] = PICK.get(tier, PICK[3])
    if "toolItem" in d:
        d["tier"] = tier
    return d


def merge_into(groups, key, d):
    g = groups.get(key)
    if not g:
        groups[key] = d
        return d
    g["min"] = min(g["min"], d["min"]); g["max"] = max(g["max"], d["max"]); g["ch"] = max(g["ch"], d["ch"])
    for b in d.get("b", []):
        if b not in g["b"]:
            g["b"].append(b)
    return g


def order_biomes(g):
    if "b" in g:
        g["b"] = [n for _, n in BIOMES if n in g["b"]]
    return g


out = {}
for n in sorted(keep):
    e = cand[n]
    o = {"n": tok(e["name"]), "cat": CAT[e["type"]], "type": e["type"], "w": e["weight"], "stack": e["stack"], "tp": e["teleport"]}
    d = tok(e["desc"])
    if d:
        o["d"] = d
    if e["value"]:
        o["value"] = e["value"]
    if e["maxQuality"] > 1:
        o["q"] = e["maxQuality"]
    if "food" in e:
        o["food"] = {k: (round(v) if k != "regen" else v) for k, v in e["food"].items() if v}
    if e["type"] in (3, 4, 14, 22, 9, 19, 23, 15) and "damage" in e:
        dm = {k: round(v) for k, v in e["damage"].items() if k in ("blunt", "slash", "pierce", "chop", "pickaxe", "fire", "frost", "lightning", "poison", "spirit")}
        if dm:
            o["dmg"] = dm
    if "armor" in e:
        o["armor"] = round(e["armor"])
    if e.get("block"):
        o["block"] = round(e["block"])
    src = []
    s = SRC[n]
    # world objects
    groups = collections.OrderedDict()
    for x in s.get("world", []):
        lo, hi = amount(x)
        name = tok(x["name"]) if x["method"] != "pick" else None
        generic = None
        if not name and x["method"] == "destroy":
            generic = "shrub" if ("ush" in x["obj"] or "shrub" in x["obj"]) else "object"
        d = tooled({"k": "world", "m": x["method"], "b": bl(x["biomes"]), "min": lo, "max": hi, "ch": r4(x["chance"])}, x["tool"], x["tier"])
        if name:
            d["name"] = name
        if generic:
            d["g"] = generic
        merge_into(groups, (name, generic, x["method"], d.get("tool"), d.get("tier")), d)
    src += [order_biomes(g) for g in groups.values()]
    for x in s.get("grow", []):
        src.append({"k": "grow", "name": tok(x["name"]), "seed": [[r["item"], r["n"]] for r in x["seed"] if r["item"] in keep], "b": bl(x["biomes"]),
                    "min": amount(x)[0], "max": amount(x)[1]})
    for x in s.get("produce", []):
        d = {"k": "produce", "name": tok(x["name"]), "b": bl(x["biomes"])}
        if x.get("on") and tok(x["on"]):
            d["on"] = tok(x["on"])
        if x.get("locs"):
            d["locs"] = x["locs"]
        if x.get("night"):
            d["night"] = 1
        src.append(d)
    for x in s.get("fish", []):
        d = {"k": "fish", "b": bl(x["biomes"]), "baits": [b for b in x["baits"] if b in keep]}
        if x.get("locs"):
            d["locs"] = x["locs"]
        src.append(d)
    fd = [x["fish"] for x in s.get("fishdrop", []) if x["fish"] in keep]
    if fd:
        src.append({"k": "fishdrop", "fish": sorted(set(fd)), "ch": r4(max(x["chance"] for x in s["fishdrop"]))})
    # creatures, merged by display name
    groups = collections.OrderedDict()
    for x in s.get("creature", []):
        c = CR[x["creature"]]
        lo, hi = amount(x)
        bred = bool(c["parent"] or c["egg"]) and not c["placed"]
        d = {"k": "creature", "name": tok(c["name"]), "b": bl(c["spawnBiomes"] | c["locBiomes"]), "min": lo, "max": hi, "ch": r4(x["chance"])}
        if c["boss"]:
            d["boss"] = 1
        if bred:
            d["bred"] = 1
        g = merge_into(groups, d["name"], d)
        g.setdefault("locs", [])
        if not c["spawnBiomes"]:
            for l in c["locs"]:
                if l not in g["locs"]:
                    g["locs"].append(l)
    for g in groups.values():
        if not g["locs"]:
            del g["locs"]
        src.append(order_biomes(g))
    for x in s.get("loc", []):
        lo, hi = amount(x)
        src.append({"k": "loc", "loc": x["loc"], "m": x["method"], "min": lo, "max": hi, "ch": r4(x["chance"])})
    for x in s.get("recipe", []):
        d = {"k": "recipe", "st": tok(x["station"]), "lvl": x["level"], "n": x["amount"], "res": [[r["item"], r["n"]] for r in x["res"] if r["n"] > 0 and r["item"] in keep]}
        up = [[r["item"], r["perLevel"]] for r in x["res"] if r["perLevel"] > 0 and r["item"] in keep]
        if up and e["maxQuality"] > 1:
            d["up"] = up
        if x["oneOf"]:
            d["oneOf"] = 1
        if d["res"]:
            src.append(d)
    for x in s.get("convert", []):
        if x["from"] in keep:
            d = {"k": "convert", "st": tok(x["station"]), "from": x["from"], "kind": x["kind"]}
            if x.get("fuel") in keep:
                d["fuel"] = x["fuel"]
            if d not in src:
                src.append(d)
    for x in s.get("trader", []):
        src.append({"k": "trader", "id": x["trader"], "price": x["price"], "stack": x["stack"], "key": x["key"]})
    o["src"] = src
    # uses
    u = e.get("uses", {})
    use = {}
    rec = []
    for x in u.get("recipe", []) + u.get("upgrade", []):
        if x["item"] in keep and x["item"] != n and x["item"] not in rec:
            rec.append(x["item"])
    if rec:
        use["recipe"] = rec
    pcs = []
    for x in u.get("piece", []):
        t = tok(x["name"])
        if t and t != o["n"] and t not in pcs:
            pcs.append(t)
    if pcs:
        use["piece"] = pcs
    cv = []
    for x in u.get("convert", []):
        if x["to"] in keep:
            d = {"st": tok(x["station"]), "to": x["to"]}
            if d not in cv:
                cv.append(d)
    if cv:
        use["convert"] = cv
    fu = sorted(set(t for t in (tok(x["station"]) for x in u.get("fuel", [])) if t))
    if fu:
        use["fuel"] = fu
    feed = []
    for c in u.get("feed", []):
        t = tok(CR[c]["name"]) if c in CR else None
        if t and t not in feed and (CR[c]["placed"] or CR[c]["parent"]):
            feed.append(t)
    if feed:
        use["feed"] = feed
    sm = []
    for x in u.get("summon", []):
        t = tok(x["name"])
        if t and not any(y["boss"] == t for y in sm):
            sm.append({"boss": t, "n": x["n"], "loc": x["loc"]})
    if sm:
        use["summon"] = sm
    bait = [f for f in u.get("bait", []) if f in keep]
    if bait:
        use["bait"] = bait
    if use:
        o["use"] = use
    out[n] = o

for b, name in BIOMES:
    used_tokens.add("biome_" + name)
json.dump({"items": out}, open(REPO + "/tools/data/items.json", "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
LANGK = ["en", "de", "fr", "it", "pt", "pt_br", "es", "no", "sv", "nl"]
names = {}
for t in sorted(used_tokens):
    if t not in LOC:
        print("missing token", t)
        continue
    v = {k: LOC[t][k] for k in LANGK if LOC[t].get(k)}
    if v.get("pt") and v.get("pt_br"):
        del v["pt_br"]
    names[t] = v
json.dump(names, open(REPO + "/tools/data/item-names.json", "w", encoding="utf-8"), ensure_ascii=False, indent=0)
json.dump(sorted(keep), open(S + "/keep.json", "w"))
cats = collections.Counter(o["cat"] for o in out.values())
print(cats, "tokens", len(names), "items.json", os.path.getsize(REPO + "/tools/data/items.json"), "names", os.path.getsize(REPO + "/tools/data/item-names.json"))
print("no src:", [n for n, o in out.items() if not o["src"]])
for n in sys.argv[2:]:
    print(json.dumps(out[n], ensure_ascii=False))
