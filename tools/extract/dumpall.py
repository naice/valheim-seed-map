"""Dump all gameplay-relevant MonoBehaviours from the Valheim bundles (one JSON per bundle)."""
import UnityPy, os, sys, json, time, traceback
from multiprocessing import Pool


sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from paths import BUNDLES as B, WORK
OUT = os.path.join(WORK, "out")

# class -> fields that must all be present on the top level of the type tree
RULES = [
    ("ItemDrop", ["m_itemData"]),
    ("Recipe", ["m_item", "m_resources", "m_craftingStation", "m_minStationLevel"]),
    ("Piece", ["m_resources", "m_craftingStation", "m_category"]),
    ("Pickable", ["m_itemPrefab", "m_respawnTimeMinutes"]),
    ("PickableItem", ["m_randomItemPrefabs"]),
    ("TreeBase", ["m_logPrefab", "m_dropWhenDestroyed"]),
    ("TreeLog", ["m_subLogPrefab", "m_dropWhenDestroyed"]),
    ("Destructible", ["m_destructibleType", "m_spawnWhenDestroyed"]),
    ("MineRock5", ["m_dropItems", "m_supportCheck"]),
    ("MineRock", ["m_dropItems", "m_areaRoot"]),
    ("DropOnDestroyed", ["m_dropWhenDestroyed", "m_spawnYOffset"]),
    ("CharacterDrop", ["m_drops", "m_spawnOffset"]),
    ("Character", ["m_faction", "m_boss", "m_health"]),
    ("Container", ["m_defaultItems", "m_width"]),
    ("Smelter", ["m_conversion", "m_fuelPerProduct"]),
    ("Fermenter", ["m_conversion", "m_fermentationDuration"]),
    ("CookingStation", ["m_conversion", "m_slots"]),
    ("Incinerator", ["m_conversions", "m_defaultResult"]),
    ("SpawnSystemList", ["m_spawners"]),
    ("CreatureSpawner", ["m_creaturePrefab", "m_respawnTimeMinuts"]),
    ("SpawnArea", ["m_prefabs", "m_spawnIntervalSec"]),
    ("ZoneSystem", ["m_vegetation", "m_locations"]),
    ("Plant", ["m_grownPrefabs", "m_growTime"]),
    ("Beehive", ["m_honeyItem"]),
    ("SapCollector", ["m_spawnItem", "m_secPerUnit"]),
    ("LootSpawner", ["m_items", "m_respawnTimeMinuts"]),
    ("Trader", ["m_items", "m_randomBuy"]),
    ("OfferingBowl", ["m_bossItem", "m_bossPrefab"]),
    ("CraftingStation", ["m_discoverRange", "m_craftRequireRoof"]),
    ("StationExtension", ["m_craftingStation", "m_maxStationDistance"]),
    ("Room", ["m_theme", "m_entrance", "m_endCap"]),
    ("DungeonGenerator", ["m_themes", "m_maxRooms"]),
    ("Location", ["m_exteriorRadius", "m_hasInterior"]),
    ("Fish", ["m_swimRange", "m_extraDrops"]),
    ("Tameable", ["m_fedDuration", "m_tamingTime"]),
    ("Procreation", ["m_offspring", "m_pregnancyDuration"]),
    ("EggGrow", ["m_grownPrefab", "m_growTime"]),
    ("Growup", ["m_grownPrefab", "m_growTime"]),
    ("MonsterAI", ["m_consumeItems"]),
    ("RandomSpawn", ["m_chanceToSpawn"]),
    ("SpawnAbility", ["m_spawnPrefab", "m_spawnRadius"]),
    ("ItemStand", ["m_supportedItems", "m_supportedTypes"]),
    ("Vegvisir", ["m_locations", "m_pinName"]),
    ("ObjectDB", ["m_items", "m_recipes"]),
    ("Turret", ["m_allowedAmmo"]),
    ("ShieldGenerator", ["m_fuelItems"]),
    ("WispSpawner", ["m_wispPrefab", "m_spawnInterval"]),
    ("ResourceRoot", ["m_regenPerSec", "m_maxLevel", "m_emptyTreshold"]),
]
DROP = ("Effect", "m_onDestroyed", "m_onDamaged", "m_onHit", "m_onTakeAllSuccess")


def prune(v):
    if isinstance(v, dict):
        return {k: prune(x) for k, x in v.items() if not any(d in k for d in DROP)}
    if isinstance(v, list):
        return [prune(x) for x in v]
    return v


def classify(node):
    names = set(c.m_Name for c in node.m_Children)
    for cls, req in RULES:
        if all(r in names for r in req):
            return cls
    return None


def work(f):
    outp = os.path.join(OUT, f + ".json")
    if os.path.exists(outp):
        return f, 0, 0
    t0 = time.time()
    try:
        env = UnityPy.load(os.path.join(B, f))
    except Exception as e:
        return f, -1, str(e)
    res = {"bundle": f, "files": [], "comps": [], "gos": {}, "errors": []}
    for af in env.assets:
        ext = [os.path.basename(e.path) for e in af.externals]
        res["files"].append({"name": af.name, "externals": ext})
        objs = af.objects
        cache = {}
        tcache = {}
        gocache = {}

        def go_info(pid):
            if pid in gocache:
                return gocache[pid]
            o = objs.get(pid)
            if o is None:
                gocache[pid] = None
                return None
            t = o.read_typetree()
            tr = t["m_Component"][0]["component"]["m_PathID"] if t["m_Component"] else 0
            gocache[pid] = (t["m_Name"], tr, t.get("m_IsActive", 1))
            return gocache[pid]

        def root_of(trpid, depth=0):
            # returns (root go pid, path of names)
            if trpid in tcache:
                return tcache[trpid]
            o = objs.get(trpid)
            if o is None:
                return (0, [])
            t = o.read_typetree()
            gp = t["m_GameObject"]["m_PathID"]
            gi = go_info(gp)
            name = gi[0] if gi else "?"
            fa = t["m_Father"]["m_PathID"]
            if fa and depth < 60:
                r, p = root_of(fa, depth + 1)
                val = (r, p + [name])
            else:
                val = (gp, [name])
            tcache[trpid] = val
            return val

        for pid, o in objs.items():
            try:
                tn = o.type.name
                if tn == "GameObject":
                    continue
                if tn != "MonoBehaviour":
                    continue
                st = o.serialized_type
                if st is None or st.node is None:
                    continue
                k = id(st)
                if k not in cache:
                    cache[k] = classify(st.node)
                cls = cache[k]
                if cls is None:
                    continue
                t = prune(o.read_typetree())
                rec = {"cls": cls, "file": af.name, "pid": pid, "t": t}
                gp = t.get("m_GameObject", {}).get("m_PathID", 0)
                if gp:
                    gi = go_info(gp)
                    if gi:
                        rec["go"] = gp
                        rec["goName"] = gi[0]
                        rec["active"] = gi[2]
                        r, p = root_of(gi[1])
                        rec["root"] = r
                        rec["path"] = p
                res["comps"].append(rec)
            except Exception as e:
                res["errors"].append("%s %s %s" % (af.name, pid, e))
        # names of all root-level GameObjects that were touched + everything cached
        for pid, gi in gocache.items():
            if gi:
                res["gos"]["%s|%d" % (af.name, pid)] = gi[0]
    json.dump(res, open(outp, "w"), separators=(",", ":"))
    return f, len(res["comps"]), round(time.time() - t0, 1)


if __name__ == "__main__":
    os.makedirs(OUT, exist_ok=True)
    files = sorted(os.listdir(B), key=lambda f: os.path.getsize(os.path.join(B, f)))
    if len(sys.argv) > 1:
        files = sys.argv[1:]
        for f in files:
            print(work(f), flush=True)
    else:
        with Pool(10) as p:
            for i, r in enumerate(p.imap_unordered(work, files)):
                print(i, r, flush=True)
