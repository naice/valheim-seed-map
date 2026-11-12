// Port of Valheim's location placement (ZoneSystem.GenerateLocations) and the
// biome sector / alt-biome system it depends on (AltBiomeWorldData), game version 1.0.x.
//
// Everything is driven by UnityEngine.Random seeded from the world seed, so the
// exact order of random draws and the float32 arithmetic of the game are mirrored.

import { URandom, stableHash, forestFactor } from './worldgen.js';

const f = Math.fround;
const N = 2048;                       // biome data grid (12 m per point)
const FLAG = [0, 1, 2, 4, 8, 16, 32, 64, 256, 512]; // biome index -> Heightmap.Biome flag
const TWO_PI = f(f(Math.PI) * 2);
const SIXTH = [0, 1, 2, 3, 4, 5].map(n => f(f(f(n / 6) * f(Math.PI)) * 2));

const mapToWorld = (v) => f(f(f(v - 1024) * 12) + 6);
const worldToMap = (x) => Math.trunc(f(f(f(x - 6) / 12) + 1024));
const zoneOf = (x) => Math.floor(f((x + 32) / 64));
const zoneKey = (zx, zy) => (zx + 4096) * 8192 + (zy + 4096);

/**
 * Biome points, sectors and alt biomes (AltBiomeWorldData.GenerateBiomePoints + GenerateSectors).
 */
export function buildBiomeData(wg, altBiomes, onProgress) {
  const pb = new Uint8Array(N * N);
  const ph = new Float32Array(N * N);
  const count = new Int32Array(10), countAbove = new Int32Array(10);
  const coords = new Float32Array(N);
  for (let i = 0; i < N; i++) coords[i] = mapToWorld(i);

  for (let i = 0; i < N; i++) {
    const wy = coords[i];
    for (let j = 0; j < N; j++) {
      const wx = coords[j];
      const k = j + i * N;
      if (f(f(wx * wx) + f(wy * wy)) > 110250000) {
        pb[k] = 8; ph[k] = -1000;
      } else {
        const b = wg.getBiome(wx, wy);
        pb[k] = b;
        ph[k] = wg.getBiomeHeight(b, wx, wy);
      }
      count[pb[k]]++;
      if (ph[k] >= 30) countAbove[pb[k]]++;
    }
    if (onProgress && (i & 63) === 63) onProgress(i / N);
  }

  const all = [], above = [], nAll = new Int32Array(10), nAbove = new Int32Array(10);
  for (let b = 0; b < 10; b++) { all.push(new Int32Array(count[b])); above.push(new Int32Array(countAbove[b])); }
  const addPoint = (b, k) => {
    all[b][nAll[b]++] = k;
    if (ph[k] >= 30) above[b][nAbove[b]++] = k;
  };

  const ps = new Int32Array(N * N).fill(-1);
  const sectors = [];
  const biomeSectors = []; for (let b = 0; b < 10; b++) biomeSectors.push([]);
  const newSector = (b) => {
    const s = {
      id: sectors.length, biome: b, edgeCount: 0, cx: 0, cy: 0,
      hMin: 99999, hMax: -99999, heightAvg: 0, dist: 0, alts: [],
    };
    sectors.push(s); biomeSectors[b].push(s);
    return s;
  };
  const global = new Int32Array(10).fill(-1);
  global[6] = newSector(6).id; global[7] = newSector(7).id; global[8] = newSector(8).id;

  for (let k = 0; k < N * N; k++) {
    const g = global[pb[k]];
    if (g >= 0) { ps[k] = g; addPoint(pb[k], k); }
  }

  let stack = new Int32Array(1 << 16), sp = 0;
  for (let k0 = 0; k0 < N * N; k0++) {
    if (ps[k0] >= 0) continue;
    const b = pb[k0];
    const sid = newSector(b).id;
    ps[k0] = sid; // note: the seed point is not added to the point lists (as in the game)
    stack[sp++] = k0;
    while (sp > 0) {
      const k = stack[--sp];
      const x = k & 2047, y = k >> 11;
      if (sp + 4 > stack.length) { const n = new Int32Array(stack.length * 2); n.set(stack); stack = n; }
      let q;
      if (x + 1 < N && ps[q = k + 1] < 0 && pb[q] === b) { ps[q] = sid; addPoint(b, q); stack[sp++] = q; }
      if (x - 1 >= 0 && ps[q = k - 1] < 0 && pb[q] === b) { ps[q] = sid; addPoint(b, q); stack[sp++] = q; }
      if (y + 1 < N && ps[q = k + N] < 0 && pb[q] === b) { ps[q] = sid; addPoint(b, q); stack[sp++] = q; }
      if (y - 1 >= 0 && ps[q = k - N] < 0 && pb[q] === b) { ps[q] = sid; addPoint(b, q); stack[sp++] = q; }
    }
  }

  for (let i = 1; i < N - 1; i++) {
    for (let j = 1; j < N - 1; j++) {
      const k = j + i * N, sid = ps[k];
      if (ps[k - 1] !== sid || ps[k + 1] !== sid || ps[k - N] !== sid || ps[k + N] !== sid) {
        const s = sectors[sid], h = ph[k];
        s.edgeCount++;
        s.cx = f(s.cx + j); s.cy = f(s.cy + i);
        if (h < s.hMin) s.hMin = h;
        if (h > s.hMax) s.hMax = h;
      }
    }
  }
  for (const s of sectors) {
    if (s.edgeCount > 0) {
      s.cx = mapToWorld(f(s.cx / s.edgeCount));
      s.cy = mapToWorld(f(s.cy / s.edgeCount));
      s.heightAvg = f(f(s.hMin + s.hMax) / 2);
    }
    s.dist = f(Math.sqrt(f(f(s.cx * s.cx) + f(s.cy * s.cy))));
  }

  // ---- alt biomes
  const rng = new URandom();
  const seed = wg.seed;
  const alts = altBiomes.map(a => ({ ...a, count: 0, chanceF: f(a.chance) }));
  for (let b = 1; b < 10; b++) {
    const flag = FLAG[b];
    const list = biomeSectors[b];
    for (const a of alts) {
      if (!a.enabled || (a.biome & flag) !== flag) continue;
      rng.init((flag + stableHash(a.name) + seed) | 0);
      for (let n = list.length - 1; n > 0; n--) {
        const idx = rng.rangeInt(0, n + 1);
        const t = list[n]; list[n] = list[idx]; list[idx] = t;
      }
      for (const s of list) {
        if (a.count >= a.maxAmountSpawned) continue;
        const r = rng.rangeFloat(0, 1);
        if ((a.count < a.minAmountSpawned || a.chanceF >= r) && canAddModifier(s, a)) {
          a.count++;
          s.alts.push(a);
        }
      }
    }
  }

  for (let b = 0; b < 10; b++) { all[b] = all[b].subarray(0, nAll[b]); above[b] = above[b].subarray(0, nAbove[b]); }
  return { pb, ph, ps, sectors, all, above, alts };
}

function canAddModifier(s, m) {
  if (s.dist < m.minDistanceFromCenter) return false;
  if (s.edgeCount < m.minEdgeSize) return false;
  if (s.edgeCount >= m.maxEdgeSize) return false;
  if (s.heightAvg < m.minAvgHeight || s.heightAvg >= m.maxAvgHeight) return false;
  if ((m.aboveWorldX !== 0 && s.cx < m.aboveWorldX) || (m.belowWorldX !== 0 && s.cx > m.belowWorldX) ||
      (m.aboveWorldY !== 0 && s.cy < m.aboveWorldY) || (m.belowWorldY !== 0 && s.cy > m.belowWorldY)) return false;
  for (const a of s.alts) if (a.incompatibleAltBiomes.includes(m.name)) return false;
  for (const name of m.incompatibleAltBiomes) if (s.alts.some(a => a.name === name)) return false;
  // m_requireNeighbor / m_notNeighbor are unused by the game's data (and compare
  // against biome indices instead of flags), so they are not modelled here.
  return true;
}

/** AltBiomeWorldData.RandomBiomeFromBiomes – including its quirks. Returns a biome index. */
function randomBiomeFromBiomes(rng, mask) {
  if ((mask & (mask - 1)) === 0) return FLAG.indexOf(mask);
  let num = 0;
  for (let b = 1; b < 10; b++) if (mask & FLAG[b]) num++;
  let n = rng.rangeInt(0, num - 1);
  if ((mask & 1) && n-- === 0) return 1;
  if ((mask & 2) && n-- === 0) return 2;
  if ((mask & 4) && n-- === 0) return 3;
  if ((mask & 8) && n-- === 0) return 4;
  if ((mask & 16) && n-- === 0) return 4;   // sic: Plains yields BlackForest
  if ((mask & 32) && n-- === 0) return 6;
  if ((mask & 64) && n-- === 0) return 7;
  if ((mask & 1) && n-- === 0) return 8;    // sic: Ocean is tested via the Meadows bit
  return 9;
}

/**
 * Places all locations. Returns [{ prefab, name, x, y, z }].
 * config: { locations: [...], altBiomes: [...] } (data/locations-config.json)
 */
export function generateLocations(wg, config, onProgress) {
  const progress = onProgress || (() => {});
  const data = buildBiomeData(wg, config.altBiomes, p => progress(p * 0.5, 'Biome'));
  const { ps, sectors, all, above } = data;
  const seed = wg.seed;
  const rng = new URandom();

  // stable OrderByDescending(m_prioritized)
  const src = config.locations.filter(l => l.enable && l.quantity !== 0);
  const ordered = [...src.filter(l => l.prioritized), ...src.filter(l => !l.prioritized)];

  const zones = new Map();            // zone key -> instance
  const byPrefab = new Map(), byGroup = new Map(), byGroupMax = new Map();
  const result = [];
  const biomeCache = new Map(), areaCache = new Map();

  const biomeAt = (x, y) => {
    const key = zoneKey(x >> 6, y >> 6);
    let b = biomeCache.get(key);
    if (b === undefined) { b = wg.getBiome(x, y); biomeCache.set(key, b); }
    return b;
  };
  const isEdge = (zx, zy) => {
    const key = zoneKey(zx, zy);
    let e = areaCache.get(key);
    if (e === undefined) {
      const x = zx * 64, y = zy * 64, b = biomeAt(x, y);
      e = b !== biomeAt(x + 64, y + 64) || b !== biomeAt(x - 64, y + 64) || b !== biomeAt(x - 64, y - 64) ||
          b !== biomeAt(x + 64, y - 64) || b !== biomeAt(x + 64, y) || b !== biomeAt(x - 64, y) ||
          b !== biomeAt(x, y + 64) || b !== biomeAt(x, y - 64);
      areaCache.set(key, e);
    }
    return e;
  };
  const anyWithin = (list, x, y, z, radius) => {
    if (!list) return false;
    const r2 = f(radius * radius);
    for (let i = 0; i < list.length; i++) {
      const l = list[i];
      const dx = f(l.x - x), dy = f(l.y - y), dz = f(l.z - z);
      if (f(f(f(dx * dx) + f(dy * dy)) + f(dz * dz)) < r2) return true;
    }
    return false;
  };
  const push = (map, key, inst) => { const l = map.get(key); if (l) l.push(inst); else map.set(key, [inst]); };
  const sectorAt = (x, z) => {
    let gx = worldToMap(x), gy = worldToMap(z);
    gx = gx < 0 ? 0 : (gx > 2047 ? 2047 : gx);
    gy = gy < 0 ? 0 : (gy > 2047 ? 2047 : gy);
    return sectors[ps[gx + gy * N]];
  };

  for (let li = 0; li < ordered.length; li++) {
    const loc = ordered[li];
    progress(0.5 + 0.5 * li / ordered.length, loc.prefab);
    rng.init((seed + stableHash(loc.prefab)) | 0);
    const maxRadius = Math.max(f(loc.exteriorRadius), f(loc.interiorRadius));
    const attempts = loc.prioritized ? 60000 : 12000;
    const prefabList = byPrefab.get(loc.prefab);
    let placed = prefabList ? prefabList.length : 0;
    if (loc.unique && placed > 0) continue;
    let maxRange = 10000;
    if (loc.centerFirst) maxRange = f(loc.minDistance);
    const tempVeg = [];
    const lo = f(-32 + maxRadius), hi = f(32 - maxRadius);
    const minAlt = f(loc.minAltitude), maxAlt = f(loc.maxAltitude);
    const minDist = f(loc.minDistance), maxDist = f(loc.maxDistance);
    const minDC = f(loc.minDistanceFromCenter), maxDC = f(loc.maxDistanceFromCenter);
    const minTD = f(loc.minTerrainDelta), maxTD = f(loc.maxTerrainDelta);
    const extR = f(loc.exteriorRadius);
    const minSim = f(loc.minDistanceFromSimilar), maxSim = f(loc.maxDistanceFromSimilar);
    const minVeg = f(loc.minimumVegetation), maxVeg = f(loc.maximumVegetation);
    const fMin = f(loc.forestTresholdMin), fMax = f(loc.forestTresholdMax);
    const aboveSea = !(minAlt < 0);

    for (let i = 0; i < attempts && placed < loc.quantity; i++) {
      let zx, zy;
      if (loc.centerFirst) {
        const num = Math.trunc(Math.trunc(maxRange) / 64);
        do {
          zx = rng.rangeInt(-num, num); zy = rng.rangeInt(-num, num);
        } while (!(f(Math.sqrt(f(f(zx * 64 * zx * 64) + f(zy * 64 * zy * 64)))) < 10000));
        maxRange = f(maxRange + 1);
      } else {
        const b = randomBiomeFromBiomes(rng, loc.biome);
        if (b < 0) break;
        let list = aboveSea ? above[b] : all[b];
        if (list.length === 0) list = all[b];
        if (list.length === 0) break; // the game would throw here
        const k = list[rng.rangeInt(0, list.length)];
        zx = zoneOf(mapToWorld(k & 2047)); zy = zoneOf(mapToWorld(k >> 11));
      }
      if (zones.has(zoneKey(zx, zy))) continue;
      if ((loc.biomeArea & (isEdge(zx, zy) ? 1 : 2)) === 0) continue;

      for (let j = 0; j < 6; j++) {
        const px = f(zx * 64 + rng.rangeFloat(lo, hi));
        const pz = f(zy * 64 + rng.rangeFloat(lo, hi));
        const mag = f(Math.sqrt(f(f(px * px) + f(pz * pz))));
        if (minDist !== 0 && mag < minDist) continue;
        if (maxDist !== 0 && mag > maxDist) continue;
        const biome = wg.getBiome(px, pz);
        if ((loc.biome & FLAG[biome]) === 0) continue;
        const py = wg.getBiomeHeight(biome, px, pz);
        const veg = wg._veg;
        const alt = f(py - 30);
        if (alt < minAlt || alt > maxAlt) continue;
        if (loc.inForest) {
          const ff = forestFactor(px, pz);
          if (ff < fMin || ff > fMax) continue;
        }
        if (minDC > 0 || maxDC > 0) {
          if ((minDC > 0 && mag < minDC) || (maxDC > 0 && mag > maxDC)) continue;
        }
        // WorldGenerator.GetTerrainDelta
        let hMax = -999999, hMin = 999999;
        for (let n = 0; n < 10; n++) {
          const theta = rng.rangeFloat(0, TWO_PI);
          const radius = f(Math.sqrt(rng.rangeFloat(0, 1)));
          const cx = f(f(radius * f(Math.cos(theta))) * extR);
          const cy = f(f(radius * f(Math.sin(theta))) * extR);
          const h = wg.getHeight(f(px + cx), f(pz + cy));
          if (h < hMin) hMin = h;
          if (h > hMax) hMax = h;
        }
        const delta = f(hMax - hMin);
        if (delta > maxTD || delta < minTD) continue;
        if (minSim > 0 && (anyWithin(byPrefab.get(loc.prefab), px, py, pz, minSim) ||
            (loc.group.length > 0 && anyWithin(byGroup.get(loc.group), px, py, pz, minSim)))) continue;
        if (maxSim > 0 && !(anyWithin(byPrefab.get(loc.prefab), px, py, pz, maxSim) ||
            (loc.groupMax.length > 0 && anyWithin(byGroupMax.get(loc.groupMax), px, py, pz, maxSim)))) continue;
        if (minVeg > 0 && veg <= minVeg) continue;
        if (maxVeg < 1 && veg >= maxVeg) continue;
        const sector = sectorAt(px, pz);
        if (loc.altBiomeParent != null && !sector.alts.some(a => a.name === loc.altBiomeParent)) continue;
        if (sector.alts.some(a => a.blockLocationNames.includes(loc.name))) continue;
        if (loc.surroundCheckVegetation) {
          let sum = 0;
          const dist = f(loc.surroundCheckDistance);
          for (let l = 0; l < loc.surroundCheckLayers; l++) {
            const r = f(f(f(l + 1) / f(loc.surroundCheckLayers)) * dist);
            const w = f(f(dist - r) / f(dist * 2));
            for (let n = 0; n < 6; n++) {
              const a = SIXTH[n];
              wg.getHeight(f(px + f(f(Math.sin(a)) * r)), f(pz + f(f(Math.cos(a)) * r)));
              sum = f(sum + f(wg._veg * w));
            }
          }
          tempVeg.push(sum);
          if (tempVeg.length < 10) continue;
          let max = -Infinity, total = 0;
          for (const v of tempVeg) { if (v > max) max = v; total += v; }
          const avg = f(total / tempVeg.length);
          const cutoff = f(avg + f(f(max - avg) * f(loc.surroundBetterThanAverage)));
          if (sum < cutoff) continue;
        }
        // RegisterLocation
        const key = zoneKey(zoneOf(px), zoneOf(pz));
        if (!zones.has(key)) {
          const inst = { prefab: loc.prefab, name: loc.name, x: px, y: py, z: pz };
          zones.set(key, inst);
          push(byPrefab, loc.prefab, inst);
          push(byGroup, loc.group, inst);
          push(byGroupMax, loc.groupMax, inst);
          result.push(inst);
        }
        placed++;
        break;
      }
    }
  }
  progress(1, '');
  return result;
}
