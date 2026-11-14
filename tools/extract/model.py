"""Link the raw dump: item -> sources (world objects, creatures, recipes ...) -> biomes / tools."""
import sys, os, json, collections
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from load import load, S

D = load()
C = D["comps"]
FILES = {k.lower(): v for k, v in D["files"].items()}
MAIN = "cab-8923bd833c4171316cf3c761b642c1c8"
ZSFILE = "cab-4fa65c91aa342391f97cc62455bd888a"
from paths import REPO

for c in C:
    c["file"] = c["file"].lower()
GOS = {}
for k, v in D["gos"].items():
    f, p = k.rsplit("|", 1)
    GOS[(f.lower(), int(p))] = v
BYPID = {(c["file"], c["pid"]): c for c in C}
BYGO = collections.defaultdict(list)
BYROOT = collections.defaultdict(list)
for c in C:
    if "go" in c:
        BYGO[(c["file"], c["go"])].append(c)
        BYROOT[(c["file"], c["root"])].append(c)


def ref(c, p):
    """PPtr -> (file, pid) or None"""
    if not p or not p.get("m_PathID"):
        return None
    fid = p["m_FileID"]
    if fid == 0:
        return (c["file"], p["m_PathID"])
    ext = FILES[c["file"]]["ext"]
    return (ext[fid - 1].lower(), p["m_PathID"])


def go_of(key):
    """key may point to a GameObject or to a component; return GameObject key"""
    if key is None:
        return None
    if key in GOS:
        return key
    c = BYPID.get(key)
    if c and "go" in c:
        return (c["file"], c["go"])
    return None


def name_of(key):
    g = go_of(key)
    return GOS.get(g) if g else None


def comp(gokey, cls):
    for c in BYGO.get(gokey, []):
        if c["cls"] == cls:
            return c
    return None


# ---------------------------------------------------------------- items
ITEMS = {}  # prefab name -> ItemDrop comp (roots of the main bundle)
for c in C:
    if c["cls"] == "ItemDrop" and c["file"] == MAIN and len(c["path"]) == 1:
        ITEMS.setdefault(c["goName"], c)
odb = [c for c in C if c["cls"] == "ObjectDB" and c["file"] == MAIN][0]
ODB_ITEMS = [name_of(ref(odb, p)) for p in odb["t"]["m_items"]]


def item_name(key):
    """reference to an item prefab (GameObject or ItemDrop) -> prefab name if it is an item"""
    g = go_of(key)
    if not g:
        return None
    n = GOS.get(g)
    if comp(g, "ItemDrop") is not None:
        return n
    return None


# ---------------------------------------------------------------- tools
def tool_from_mods(m):
    """which damage type can hurt this object"""
    if not m:
        return "any"
    ok = lambda v: v not in (3, 4)
    chop, pick = ok(m.get("m_chop", 0)), ok(m.get("m_pickaxe", 0))
    others = any(ok(m.get(k, 0)) for k in ("m_blunt", "m_slash", "m_pierce"))
    if others:
        return "any"
    if chop and pick:
        return "axe|pickaxe"
    if chop:
        return "axe"
    if pick:
        return "pickaxe"
    return "none"


def droptable(c, dt, method, tool, tier, via):
    out = []
    drops = dt.get("m_drops", [])
    tw = sum(d["m_weight"] for d in drops)
    for d in drops:
        it = item_name(ref(c, d["m_item"]))
        if not it:
            continue
        picks = (dt["m_dropMin"] + dt["m_dropMax"]) / 2
        share = (d["m_weight"] / tw) if tw else (1.0 if d is drops[0] else 0.0)
        if dt.get("m_oneOfEach") and picks >= len(drops):
            p = 1.0
        else:
            p = 1 - (1 - share) ** max(picks, 0)
        out.append({"item": it, "min": d["m_stackMin"], "max": d["m_stackMax"], "chance": round(dt["m_dropChance"] * p, 4),
                    "picks": [dt["m_dropMin"], dt["m_dropMax"]], "share": round(share, 4), "tableChance": dt["m_dropChance"],
                    "method": method, "tool": tool, "tier": tier, "via": list(via)})
    return out


def yields_of_comps(comps, seen, via):
    """yields of a set of components (all below one root)"""
    out = []
    bygo = collections.defaultdict(dict)
    for c in comps:
        bygo[c["go"]][c["cls"]] = c
    for c in comps:
        t = c["t"]
        cls = c["cls"]
        if cls == "Pickable":
            it = item_name(ref(c, t["m_itemPrefab"]))
            if it:
                out.append({"item": it, "min": t["m_amount"], "max": t["m_amount"], "chance": 1, "method": "pick", "tool": None, "tier": 0,
                            "via": list(via), "respawn": t["m_respawnTimeMinutes"], "obj": c["goName"]})
            out += [dict(y, obj=c["goName"]) for y in droptable(c, t["m_extraDrops"], "pick", None, 0, via)]
        elif cls == "PickableItem":
            it = item_name(ref(c, t["m_itemPrefab"]))
            if it:
                out.append({"item": it, "min": t["m_stack"] or 1, "max": t["m_stack"] or 1, "chance": 1, "method": "pick", "tool": None, "tier": 0, "via": list(via), "obj": c["goName"]})
            rnd = t["m_randomItemPrefabs"]
            for r in rnd:
                it = item_name(ref(c, r["m_itemPrefab"]))
                if it:
                    out.append({"item": it, "min": r["m_stackMin"], "max": r["m_stackMax"], "chance": round(1 / len(rnd), 4), "method": "pick", "tool": None, "tier": 0, "via": list(via), "obj": c["goName"]})
        elif cls == "TreeBase":
            tool = tool_from_mods(t["m_damageModifiers"])
            out += [dict(y, obj=c["goName"]) for y in droptable(c, t["m_dropWhenDestroyed"], "chop", tool, t["m_minToolTier"], via)]
            out += sub(ref(c, t["m_logPrefab"]), seen, via + ["log"], t["m_minToolTier"])
        elif cls == "TreeLog":
            tool = tool_from_mods(t["m_damages"])
            out += [dict(y, obj=c["goName"]) for y in droptable(c, t["m_dropWhenDestroyed"], "chop", tool, t["m_minToolTier"], via)]
            out += sub(ref(c, t["m_subLogPrefab"]), seen, via + ["log"], t["m_minToolTier"])
        elif cls in ("MineRock", "MineRock5"):
            tool = tool_from_mods(t["m_damageModifiers"])
            out += [dict(y, obj=c["goName"], objName=t.get("m_name", "")) for y in droptable(c, t["m_dropItems"], "mine", tool, t["m_minToolTier"], via)]
        elif cls == "Destructible":
            tool = tool_from_mods(t["m_damages"])
            dod = bygo[c["go"]].get("DropOnDestroyed")
            if dod:
                out += [dict(y, obj=c["goName"], dtype=t["m_destructibleType"]) for y in droptable(dod, dod["t"]["m_dropWhenDestroyed"], "destroy", tool, t["m_minToolTier"], via)]
            sp = ref(c, t["m_spawnWhenDestroyed"])
            spi = item_name(sp)
            if spi:
                # leaves the item itself behind (e.g. the crystal holding a Dvergr key fragment)
                out.append({"item": spi, "min": 1, "max": 1, "chance": 1, "method": "destroy", "tool": tool, "tier": t["m_minToolTier"], "via": list(via), "obj": c["goName"]})
            elif sp:
                out += sub(sp, seen, via + ["frac"], t["m_minToolTier"])
        elif cls == "DropOnDestroyed":
            if "Destructible" not in bygo[c["go"]]:
                # WearNTear pieces, characters etc.
                out += [dict(y, obj=c["goName"]) for y in droptable(c, t["m_dropWhenDestroyed"], "destroy", "any", 0, via)]
        elif cls == "Container":
            out += [dict(y, obj=c["goName"], objName=t.get("m_name", "")) for y in droptable(c, t["m_defaultItems"], "chest", None, 0, via)]
        elif cls == "LootSpawner":
            out += [dict(y, obj=c["goName"]) for y in droptable(c, t["m_items"], "loot", None, 0, via)]
        elif cls == "Beehive":
            it = item_name(ref(c, t["m_honeyItem"]))
            if it:
                out.append({"item": it, "min": 1, "max": t["m_maxHoney"], "chance": 1, "method": "produce", "tool": None, "tier": 0, "via": list(via), "obj": c["goName"]})
        elif cls == "SapCollector":
            it = item_name(ref(c, t["m_spawnItem"]))
            if it:
                out.append({"item": it, "min": 1, "max": t["m_maxLevel"], "chance": 1, "method": "produce", "tool": None, "tier": 0, "via": list(via), "obj": c["goName"]})
    return out


def sub(key, seen, via, parent_tier=0):
    g = go_of(key)
    if not g or g in seen:
        return []
    seen = seen | {g}
    res = yields_of_comps(BYROOT.get(g, []), seen, via)
    for y in res:
        y["tier"] = max(y["tier"], parent_tier)
    return res


def yields_of_root(rootkey):
    return yields_of_comps(BYROOT.get(rootkey, []), frozenset([rootkey]), [])


def creature_drops(gokey):
    out = []
    for c in BYROOT.get(gokey, []):
        if c["cls"] == "CharacterDrop":
            for d in c["t"]["m_drops"]:
                it = item_name(ref(c, d["m_prefab"]))
                if it:
                    out.append({"item": it, "min": d["m_amountMin"], "max": d["m_amountMax"], "chance": round(d["m_chance"], 4),
                                "levelMul": d["m_levelMultiplier"], "onePerPlayer": d["m_onePerPlayer"]})
    return out


def spawns_of_comps(comps):
    """creatures spawned by CreatureSpawner / SpawnArea among comps -> set of creature GO keys"""
    out = collections.Counter()
    for c in comps:
        if c["cls"] == "CreatureSpawner":
            g = go_of(ref(c, c["t"]["m_creaturePrefab"]))
            if g:
                out[g] += 1
        elif c["cls"] == "SpawnArea":
            for p in c["t"]["m_prefabs"]:
                g = go_of(ref(c, p["m_prefab"]))
                if g:
                    out[g] += 1
    return out


BIOMES = [(1, "Meadows"), (8, "BlackForest"), (2, "Swamp"), (4, "Mountain"), (16, "Plains"), (512, "Mistlands"), (32, "AshLands"), (64, "DeepNorth"), (256, "Ocean")]


def biomes(mask):
    return [n for b, n in BIOMES if mask & b]
