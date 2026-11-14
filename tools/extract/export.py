"""Build items_raw.json: every item with where it comes from and what it is used for."""
import sys, os, json, collections, re
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from model import *

HOVER = json.load(open(os.path.join(S, "hover.json")))
cfg = json.load(open(REPO + "/data/locations-config.json"))
LOCBIOME = collections.defaultdict(int)
for l in cfg["locations"]:
    if l["enable"] and l["quantity"]:
        LOCBIOME[l["prefab"]] |= l["biome"]

src = collections.defaultdict(lambda: collections.defaultdict(list))   # item -> kind -> entries
uses = collections.defaultdict(lambda: collections.defaultdict(list))


def obj_name(gokey, y=None):
    """display token of a world object"""
    if y and y.get("objName"):
        return y["objName"]
    for c in BYROOT.get(gokey, []):
        if c["go"] == gokey[1]:
            if c["cls"] in ("MineRock", "MineRock5", "Container", "Piece") and c["t"].get("m_name"):
                return c["t"]["m_name"]
            if c["cls"] == "Pickable" and c["t"].get("m_overrideName"):
                return c["t"]["m_overrideName"]
    h = HOVER.get(str(gokey[1]))
    if h:
        return h
    for c in BYROOT.get(gokey, []):
        if c["cls"] in ("MineRock", "MineRock5") and c["t"].get("m_name"):
            return c["t"]["m_name"]
    return None


def merge(ys):
    """several yields of one item from one object -> one entry"""
    by = collections.OrderedDict()
    for y in ys:
        k = (y["item"], y["method"])
        e = by.get(k)
        if not e:
            by[k] = dict(y)
            by[k]["n"] = 1
        else:
            e["min"] = min(e["min"], y["min"]); e["max"] = max(e["max"], y["max"])
            e["chance"] = max(e["chance"], y["chance"]); e["tier"] = max(e["tier"], y["tier"]); e["n"] += 1
            if e["tool"] in (None, "any") and y["tool"] not in (None, "any"):
                pass
    return list(by.values())


# ------------------------------------------------------------ vegetation
zs = [c for c in C if c["cls"] == "ZoneSystem" and c["file"] == ZSFILE and c["path"] == ["_ZoneSystem"]][0]
lists = [zs] + [comp(ref(zs, p), "ZoneSystem") for p in zs["t"]["m_locationLists"]]
veg = collections.OrderedDict()   # prefab go -> biome mask
for l in lists:
    for v in l["t"]["m_vegetation"]:
        if not v["m_enable"] or v["m_max"] <= 0:
            continue
        g = go_of(ref(l, v["m_prefab"]))
        if g:
            veg[g] = veg.get(g, 0) | v["m_biome"]
VEGCREATURES = collections.defaultdict(int)
ROOTS = {}   # ResourceRoot (Yggdrasil root) name token -> biome mask; sap collectors only work on these
for g, mask in veg.items():
    rr = comp(g, "ResourceRoot")
    if rr:
        ROOTS[rr["t"]["m_name"]] = ROOTS.get(rr["t"]["m_name"], 0) | mask
    for y in merge(yields_of_root(g)):
        src[y["item"]]["world"].append({"obj": GOS[g], "name": obj_name(g, y), "method": y["method"], "tool": y["tool"], "tier": y["tier"],
                                        "min": y["min"], "max": y["max"], "chance": y["chance"], "biomes": mask, "via": y["via"]})
    for cg, n in spawns_of_comps(BYROOT.get(g, [])).items():
        VEGCREATURES[cg] |= mask

# ------------------------------------------------------------ locations + dungeon rooms
CRE_BYNAME = {c["goName"]: (c["file"], c["go"]) for c in C if c["cls"] == "Character" and c["file"] == MAIN and len(c["path"]) == 1}
locroots = {(c["file"], c["root"]): c["goName"] for c in C if c["cls"] == "Location" and len(c["path"]) == 1 and c["goName"] in LOCBIOME}
theme2loc = collections.defaultdict(set)
for c in C:
    if c["cls"] == "DungeonGenerator" and (c["file"], c["root"]) in locroots:
        theme2loc[c["t"]["m_themes"]].add(locroots[(c["file"], c["root"])])
rooms = {(c["file"], c["root"]): c for c in C if c["cls"] == "Room" and len(c["path"]) == 1 and c["t"]["m_enabled"]}
LOCCREATURES = collections.defaultdict(lambda: collections.defaultdict(int))   # creature go -> loc -> n
locitems = collections.defaultdict(lambda: collections.defaultdict(lambda: collections.defaultdict(lambda: {"n": 0, "min": 10**9, "max": 0, "chance": 0, "tier": 0, "objs": set()})))


CRE_SET = set(CRE_BYNAME.values())
FISHLOC = collections.defaultdict(set)   # fish item -> locations it swims in (cave lakes)
WISPLOC = collections.defaultdict(set)   # wisp spawner name token -> locations
plain = lambda n: re.sub(r" \(\d+\)$", "", n)


def add_yields(ys, locnames):
    for y in ys:
        for ln in locnames:
            e = locitems[y["item"]][y["method"]][ln]
            e["n"] += 1; e["min"] = min(e["min"], y["min"]); e["max"] = max(e["max"], y["max"]); e["chance"] = max(e["chance"], y["chance"])
            e["tier"] = max(e["tier"], y["tier"])
            if y.get("objName"):
                e["objs"].add(y["objName"])


def add_place(rootkey, locnames):
    add_yields(yields_of_root(rootkey), locnames)
    for cg, n in spawns_of_comps(BYROOT.get(rootkey, [])).items():
        for ln in locnames:
            LOCCREATURES[cg][ln] += n
        if cg not in CRE_SET:
            # a spawner may also place things that are no creatures: fish, or objects like the Charred ballista
            it = item_name(cg)
            if it and comp(cg, "Fish"):
                FISHLOC[it] |= set(locnames)
            else:
                add_yields(yields_of_root(cg), locnames)
    for c in BYROOT.get(rootkey, []):
        if c["cls"] == "Fish" and c["file"] != MAIN and plain(c["goName"]) in ITEMS:
            FISHLOC[plain(c["goName"])] |= set(locnames)
        if c["cls"] == "WispSpawner":
            WISPLOC[c["t"]["m_name"]] |= set(locnames)
    for c in BYROOT.get(rootkey, []):
        if c["cls"] == "Character" and c["file"] != MAIN:
            cg = CRE_BYNAME.get(re.sub(r" \(\d+\)$", "", c["goName"]))
            if cg:
                for ln in locnames:
                    LOCCREATURES[cg][ln] += 1


for k, ln in locroots.items():
    add_place(k, [ln])
for k, r in rooms.items():
    lns = set()
    for th, ls in theme2loc.items():
        if r["t"]["m_theme"] & th:
            lns |= ls
    if lns:
        add_place(k, sorted(lns))
for it, methods in locitems.items():
    for m, locs in methods.items():
        for ln, e in locs.items():
            src[it]["loc"].append({"loc": ln, "method": m, "n": e["n"], "min": e["min"], "max": e["max"], "chance": e["chance"], "tier": e["tier"],
                                   "biomes": LOCBIOME[ln], "objs": sorted(e["objs"])})

# ------------------------------------------------------------ creatures
SPAWN = collections.defaultdict(lambda: {"biomes": 0, "kbiomes": 0, "night": True, "day": False, "keys": set()})
for c in C:
    if c["cls"] == "SpawnSystemList" and c["file"] == MAIN:
        for s in c["t"]["m_spawners"]:
            if not s["m_enabled"] or s.get("m_devDisabled"):
                continue
            g = go_of(ref(c, s["m_prefab"]))
            if not g:
                continue
            e = SPAWN[g]
            if s["m_requiredGlobalKey"]:
                e["keys"].add(s["m_requiredGlobalKey"]); e["kbiomes"] |= s["m_biome"]
            else:
                e["biomes"] |= s["m_biome"]
                e["day"] = e["day"] or bool(s["m_spawnAtDay"])
for g, e in SPAWN.items():
    if not e["biomes"]:
        e["biomes"] = e["kbiomes"]
    fc = comp(g, "Fish")
    it = item_name(g)
    if it and fc:
        baits = [b for b in (item_name(ref(fc, x["m_bait"])) for x in fc["t"]["m_baits"]) if b]
        src[it]["fish"].append({"biomes": e["biomes"], "baits": baits})
        for b in baits:
            uses[b]["bait"].append(it)
        for y in droptable(fc, fc["t"]["m_extraDrops"], "fish", None, 0, []):
            src[y["item"]]["fishdrop"].append({"fish": it, "min": y["min"], "max": y["max"], "chance": y["chance"]})
for it, lns in FISHLOC.items():
    ic = ITEMS[it]
    fc = comp((ic["file"], ic["go"]), "Fish")
    baits = [b for b in (item_name(ref(fc, x["m_bait"])) for x in fc["t"]["m_baits"]) if b] if fc else []
    lb = 0
    for ln in lns:
        lb |= LOCBIOME[ln]
    src[it]["fish"].append({"biomes": lb, "baits": baits, "locs": sorted(lns)})
    for b in baits:
        if it not in uses[b]["bait"]:
            uses[b]["bait"].append(it)
CREATURES = {}
for c in C:
    if c["cls"] == "Character" and c["file"] == MAIN and len(c["path"]) == 1:
        g = (c["file"], c["go"])
        CREATURES[g] = c
# bosses via offering bowls
BOSSLOC = collections.defaultdict(set)
for c in C:
    if c["cls"] == "OfferingBowl":
        bg = go_of(ref(c, c["t"]["m_bossPrefab"]))
        it = item_name(ref(c, c["t"]["m_bossItem"]))
        rk = (c["file"], c["root"])
        if bg and bg not in CREATURES:
            # the bowl calls a group instead of a single creature (memorial site: three Fallen Warriors)
            lns = [locroots[rk]] if rk in locroots else [ln for k, ln in locroots.items() if k[0] == c["file"]]
            for x in BYROOT.get(bg, []):
                cg = CRE_BYNAME.get(plain(x["goName"])) if x["cls"] == "Character" else None
                if cg:
                    for ln in lns:
                        BOSSLOC[cg].add(ln)
                    if it and lns:
                        e = {"boss": GOS[cg], "name": CREATURES[cg]["t"]["m_name"], "n": c["t"]["m_bossItems"], "loc": lns[0]}
                        if e not in uses[it]["summon"]:
                            uses[it]["summon"].append(e)
            continue
        if bg and rk in locroots:
            BOSSLOC[bg].add(locroots[rk])
            if it:
                e = {"boss": GOS[bg], "name": CREATURES[bg]["t"]["m_name"] if bg in CREATURES else None, "n": c["t"]["m_bossItems"], "loc": locroots[rk]}
                if e not in uses[it]["summon"]:
                    uses[it]["summon"].append(e)
PARENT = {}   # creature go -> parent creature go (grows from / born by)
EGGBORN = set()
for c in C:
    if c["file"] == MAIN and c["cls"] in ("EggGrow", "Growup", "Procreation") and "go" in c:
        me = (c["file"], c["root"])
        other = go_of(ref(c, c["t"].get("m_grownPrefab") or c["t"].get("m_offspring")))
        if not other:
            continue
        if c["cls"] == "Procreation":
            if other in CREATURES and me in CREATURES:
                PARENT[other] = me
        else:
            if other in CREATURES:
                if me in CREATURES:
                    PARENT.setdefault(other, me)
                else:
                    EGGBORN.add(other)
creature_out = {}
for g, c in CREATURES.items():
    drops = creature_drops(g)
    sp = SPAWN.get(g)
    locs = dict(LOCCREATURES.get(g, {}))
    for ln in BOSSLOC.get(g, []):
        locs.setdefault(ln, 1)
    lb = 0
    for ln in locs:
        lb |= LOCBIOME[ln]
    vb = VEGCREATURES.get(g, 0)
    placed = bool(sp or locs or vb)
    info = {"prefab": GOS[g], "name": c["t"]["m_name"], "boss": c["t"]["m_boss"], "health": c["t"]["m_health"],
            "spawnBiomes": (sp["biomes"] if sp else 0) | vb, "locBiomes": lb, "nightOnly": bool(sp and not sp["day"]) and not locs and not vb,
            "locs": sorted(locs), "placed": placed}
    info["parent"] = GOS[PARENT[g]] if g in PARENT else None
    info["egg"] = g in EGGBORN
    creature_out[GOS[g]] = info
    for d in drops:
        src[d["item"]]["creature"].append(dict(d, creature=GOS[g]))
    for cc in BYROOT.get(g, []):
        if cc["cls"] == "MonsterAI" and any(x["cls"] == "Tameable" for x in BYROOT.get(g, [])):
            for p in cc["t"]["m_consumeItems"]:
                it = item_name(ref(cc, p))
                if it:
                    uses[it]["feed"].append(GOS[g])

# later phases of a boss (FrozenKing_p2, _p3) appear where the first one does
for n, info in creature_out.items():
    m = re.match(r"(.+)_p\d+$", n)
    base = creature_out.get(m.group(1)) if m else None
    if base and base["placed"] and not info["placed"]:
        info.update(placed=True, locs=base["locs"], locBiomes=base["locBiomes"], spawnBiomes=base["spawnBiomes"], phaseOf=base["prefab"])

# ------------------------------------------------------------ recipes
def station_name(c, p):
    k = ref(c, p)
    cs = BYPID.get(k)
    return cs["t"]["m_name"] if cs else None


for c in C:
    if c["cls"] == "Recipe" and c["file"] == MAIN and c["t"]["m_enabled"]:
        t = c["t"]
        it = item_name(ref(c, t["m_item"]))
        if not it:
            continue
        res = []
        for r in t["m_resources"]:
            ri = item_name(ref(c, r["m_resItem"]))
            if ri:
                res.append({"item": ri, "n": r["m_amount"], "perLevel": r["m_amountPerLevel"]})
        e = {"station": station_name(c, t["m_craftingStation"]), "level": t["m_minStationLevel"], "amount": t["m_amount"], "res": res,
             "oneOf": t["m_requireOnlyOneIngredient"], "name": t["m_Name"]}
        src[it]["recipe"].append(e)
        for r in res:
            if r["n"] > 0:
                uses[r["item"]]["recipe"].append({"item": it, "n": r["n"]})
            elif r["perLevel"] > 0:
                uses[r["item"]]["upgrade"].append({"item": it, "n": r["perLevel"]})

# ------------------------------------------------------------ pieces, stations, plants
PIECES = {}
for c in C:
    if c["cls"] == "Piece" and c["file"] == MAIN and len(c["path"]) == 1:
        PIECES[(c["file"], c["go"])] = c
piece_out = {}
for g, c in PIECES.items():
    t = c["t"]
    res = []
    for r in t["m_resources"]:
        ri = item_name(ref(c, r["m_resItem"]))
        if ri:
            res.append({"item": ri, "n": r["m_amount"]})
    if not res or not t["m_enabled"]:
        continue
    piece_out[GOS[g]] = {"name": t["m_name"], "res": res, "station": station_name(c, t["m_craftingStation"]), "category": t["m_category"]}
    for r in res:
        uses[r["item"]]["piece"].append({"piece": GOS[g], "name": t["m_name"], "n": r["n"]})
    comps = BYROOT.get(g, [])
    for x in comps:
        tt = x["t"]
        if x["cls"] == "Smelter":
            fuel = item_name(ref(x, tt["m_fuelItem"]))
            for cv in tt["m_conversion"]:
                a, b = item_name(ref(x, cv["m_from"])), item_name(ref(x, cv["m_to"]))
                if a and b:
                    src[b]["convert"].append({"station": t["m_name"], "piece": GOS[g], "from": a, "kind": "smelt", "fuel": fuel, "fuelN": tt["m_fuelPerProduct"] if fuel else 0, "sec": tt["m_secPerProduct"]})
                    uses[a]["convert"].append({"station": t["m_name"], "piece": GOS[g], "to": b, "kind": "smelt"})
            if fuel:
                uses[fuel]["fuel"].append({"station": t["m_name"], "piece": GOS[g]})
        elif x["cls"] == "CookingStation":
            for cv in tt["m_conversion"]:
                a, b = item_name(ref(x, cv["m_from"])), item_name(ref(x, cv["m_to"]))
                if a and b:
                    src[b]["convert"].append({"station": t["m_name"], "piece": GOS[g], "from": a, "kind": "cook", "sec": cv["m_cookTime"]})
                    uses[a]["convert"].append({"station": t["m_name"], "piece": GOS[g], "to": b, "kind": "cook"})
        elif x["cls"] == "Fermenter":
            for cv in tt["m_conversion"]:
                a, b = item_name(ref(x, cv["m_from"])), item_name(ref(x, cv["m_to"]))
                if a and b:
                    src[b]["convert"].append({"station": t["m_name"], "piece": GOS[g], "from": a, "kind": "ferment", "amount": cv["m_producedItems"], "sec": tt["m_fermentationDuration"]})
                    uses[a]["convert"].append({"station": t["m_name"], "piece": GOS[g], "to": b, "kind": "ferment"})
        elif x["cls"] == "Plant":
            for gp in tt["m_grownPrefabs"][:1]:
                gg = go_of(ref(x, gp))
                if not gg:
                    continue
                for y in merge(yields_of_root(gg)):
                    src[y["item"]]["grow"].append({"piece": GOS[g], "name": t["m_name"], "seed": res, "biomes": tt["m_biome"], "cultivated": tt["m_needCultivatedGround"],
                                                   "growTime": [tt["m_growTime"], tt["m_growTimeMax"]], "min": y["min"], "max": y["max"], "chance": y["chance"], "method": y["method"], "tool": y["tool"], "tier": y["tier"], "grown": GOS[gg]})
        elif x["cls"] in ("Beehive", "SapCollector"):
            for y in yields_of_comps([x], frozenset(), []):
                e = {"piece": GOS[g], "name": t["m_name"], "max": y["max"], "sec": tt["m_secPerUnit"], "biomes": tt.get("m_biome", 0)}
                if x["cls"] == "SapCollector" and ROOTS:
                    # only works on a resource root of the world generation
                    e["on"] = sorted(ROOTS)[0]
                    e["biomes"] = ROOTS[e["on"]]
                src[y["item"]]["produce"].append(e)
# things that lure wisps or embers: buildable (wisp fountain) or part of a location
for c in C:
    if c["cls"] == "WispSpawner" and c["file"] == MAIN and len(c["path"]) == 1:
        g = (c["file"], c["go"])
        wg = go_of(ref(c, c["t"]["m_wispPrefab"]))
        lns = sorted(WISPLOC.get(c["t"]["m_name"], []))
        if not wg or not (GOS[g] in piece_out or lns):
            continue
        lb = 0
        for ln in lns:
            lb |= LOCBIOME[ln]
        for y in merge(yields_of_root(wg)):
            e = {"piece": GOS[g], "name": c["t"]["m_name"], "max": y["max"], "sec": c["t"]["m_spawnInterval"], "biomes": lb, "locs": lns, "night": c["t"]["m_onlySpawnAtNight"]}
            if not any(o["name"] == e["name"] for o in src[y["item"]]["produce"]):
                src[y["item"]]["produce"].append(e)

# ------------------------------------------------------------ traders
for c in C:
    if c["cls"] == "Trader" and c["file"] == MAIN:
        for i in c["t"]["m_items"]:
            it = item_name(ref(c, i["m_prefab"]))
            if it:
                src[it]["trader"].append({"trader": c["goName"].lower(), "price": i["m_price"], "stack": i["m_stack"], "key": i["m_requiredGlobalKey"]})

# ------------------------------------------------------------ items
out = {}
for n in ODB_ITEMS:
    c = ITEMS.get(n)
    if not c:
        continue
    s = c["t"]["m_itemData"]["m_shared"]
    d = s["m_damages"]
    e = {"prefab": n, "name": s["m_name"], "desc": s["m_description"], "type": s["m_itemType"], "weight": round(s["m_weight"], 2), "stack": s["m_maxStackSize"],
         "value": s["m_value"], "teleport": s["m_teleportable"], "maxQuality": s["m_maxQuality"], "dlc": s["m_dlc"], "hasIcon": bool(s["m_icons"]),
         "toolTier": s["m_toolTier"], "skill": s["m_skillType"]}
    if s["m_food"] or s["m_foodStamina"] or s["m_foodEitr"]:
        e["food"] = {"hp": s["m_food"], "stamina": s["m_foodStamina"], "eitr": s["m_foodEitr"], "time": s["m_foodBurnTime"], "regen": s["m_foodRegen"]}
    dm = {k[2:]: v for k, v in d.items() if v and k != "m_nonPlayer"}
    if dm:
        e["damage"] = dm
    if s["m_itemType"] in (5, 6, 7, 11, 12, 17) and s["m_armor"]:
        e["armor"] = s["m_armor"]
    if s["m_itemType"] == 5:
        e["block"] = s["m_blockPower"]
    if n in src:
        e["src"] = src[n]
    if n in uses:
        e["uses"] = uses[n]
    out[n] = e

json.dump({"items": out, "creatures": creature_out, "pieces": piece_out}, open(os.path.join(S, "items_raw.json"), "w"), indent=1, default=list)
print(len(out), "items;", sum(1 for e in out.values() if "src" in e), "with sources;", len(creature_out), "creatures;", len(piece_out), "pieces")
for n in sys.argv[1:]:
    print(json.dumps(out[n], indent=None, default=list)[:6000])
    print()
