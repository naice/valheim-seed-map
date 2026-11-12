// Port of Valheim's WorldGenerator (game version 1.0.x, world gen version 2).
// Float32 rounding (Math.fround) mirrors the C# casts so that the seeded
// river/stream placement stays in sync with the game.

import { CELL_2D } from './cell2d.js';

const f = Math.fround;

export const Biome = {
  None: 0, Meadows: 1, Swamp: 2, Mountain: 3, BlackForest: 4, Plains: 5,
  AshLands: 6, DeepNorth: 7, Ocean: 8, Mistlands: 9,
};
export const BIOME_NAMES = ['?', 'Meadows', 'Swamp', 'Mountain', 'Black Forest', 'Plains',
  'Ashlands', 'Deep North', 'Ocean', 'Mistlands'];

export const WATER_LEVEL = 30;

// ---------------------------------------------------------------- hashing

export function stableHash(str) {
  let n1 = 5381, n2 = 5381;
  for (let i = 0; i < str.length; i += 2) {
    n1 = (((n1 << 5) + n1) ^ str.charCodeAt(i)) | 0;
    if (i === str.length - 1) break;
    n2 = (((n2 << 5) + n2) ^ str.charCodeAt(i + 1)) | 0;
  }
  return (n1 + Math.imul(n2, 1566083941)) | 0;
}

// ---------------------------------------------------------- UnityEngine.Random

class URandom {
  init(seed) {
    this.x = seed >>> 0;
    this.y = (Math.imul(this.x, 1812433253) + 1) >>> 0;
    this.z = (Math.imul(this.y, 1812433253) + 1) >>> 0;
    this.w = (Math.imul(this.z, 1812433253) + 1) >>> 0;
  }
  next() {
    const t = this.x ^ (this.x << 11);
    this.x = this.y; this.y = this.z; this.z = this.w;
    this.w = (this.w ^ (this.w >>> 19) ^ t ^ (t >>> 8)) >>> 0;
    return this.w;
  }
  rangeInt(min, max) {
    if (min === max) return min;
    const diff = (max - min) >>> 0;
    return (min + (this.next() % diff)) | 0;
  }
  rangeFloat(min, max) {
    const t = f(f(this.next() & 0x7FFFFF) * F_RAND);
    return f(f(min * t) + f(f(1 - t) * max));
  }
}
const F_RAND = f(1 / 8388607);

// ------------------------------------------------------------- Mathf.PerlinNoise

const PERM = new Uint8Array(514);
{
  const p = [151, 160, 137, 91, 90, 15, 131, 13, 201, 95, 96, 53, 194, 233, 7, 225, 140, 36, 103, 30, 69, 142,
    8, 99, 37, 240, 21, 10, 23, 190, 6, 148, 247, 120, 234, 75, 0, 26, 197, 62, 94, 252, 219, 203, 117, 35, 11,
    32, 57, 177, 33, 88, 237, 149, 56, 87, 174, 20, 125, 136, 171, 168, 68, 175, 74, 165, 71, 134, 139, 48, 27,
    166, 77, 146, 158, 231, 83, 111, 229, 122, 60, 211, 133, 230, 220, 105, 92, 41, 55, 46, 245, 40, 244, 102,
    143, 54, 65, 25, 63, 161, 1, 216, 80, 73, 209, 76, 132, 187, 208, 89, 18, 169, 200, 196, 135, 130, 116, 188,
    159, 86, 164, 100, 109, 198, 173, 186, 3, 64, 52, 217, 226, 250, 124, 123, 5, 202, 38, 147, 118, 126, 255,
    82, 85, 212, 207, 206, 59, 227, 47, 16, 58, 17, 182, 189, 28, 42, 223, 183, 170, 213, 119, 248, 152, 2, 44,
    154, 163, 70, 221, 153, 101, 155, 167, 43, 172, 9, 129, 22, 39, 253, 19, 98, 108, 110, 79, 113, 224, 232,
    178, 185, 112, 104, 218, 246, 97, 228, 251, 34, 242, 193, 238, 210, 144, 12, 191, 179, 162, 241, 81, 51, 145,
    235, 249, 14, 239, 107, 49, 192, 214, 31, 181, 199, 106, 157, 184, 84, 204, 176, 115, 121, 50, 45, 127, 4,
    150, 254, 138, 236, 205, 93, 222, 114, 67, 29, 24, 72, 243, 141, 128, 195, 78, 66, 215, 61, 156, 180];
  for (let i = 0; i < 514; i++) PERM[i] = p[i & 255];
}

function fade(t) {
  // t * t * t * (t * (t * 6 - 15) + 10) in float32
  return f(f(f(t * t) * t) * f(f(t * f(f(t * 6) - 15)) + 10));
}
function grad2(hash, x, y) {
  const h = hash & 15;
  const u = h < 8 ? x : y;
  const v = h < 4 ? y : (h === 12 || h === 14 ? x : 0);
  return f(((h & 1) === 0 ? u : -u) + ((h & 2) === 0 ? v : -v));
}
const PN_ADD = f(0.69);
const PN_DIV = f(f(0.793) + f(0.69));

/** Mathf.PerlinNoise for float32 inputs. */
function perlinF(x, y) {
  x = Math.abs(x); y = Math.abs(y);
  const xi = Math.trunc(x), yi = Math.trunc(y);
  const X = xi & 255, Y = yi & 255;
  x = f(x - xi); y = f(y - yi);
  const u = fade(x), v = fade(y);
  const A = PERM[X] + Y, AA = PERM[A], AB = PERM[A + 1];
  const B = PERM[X + 1] + Y, BA = PERM[B], BB = PERM[B + 1];
  const x1 = f(x - 1), y1 = f(y - 1);
  const g00 = grad2(PERM[AA], x, y), g10 = grad2(PERM[BA], x1, y);
  const g01 = grad2(PERM[AB], x, y1), g11 = grad2(PERM[BB], x1, y1);
  const l0 = f(g00 + f(u * f(g10 - g00)));
  const l1 = f(g01 + f(u * f(g11 - g01)));
  const res = f(l0 + f(v * f(l1 - l0)));
  return f(f(res + PN_ADD) / PN_DIV);
}
/** DUtils.PerlinNoise(double, double) */
function pn(x, y) { return perlinF(f(x), f(y)); }

// ------------------------------------------------------------------ DUtils

function clamp01(v) { return v > 1 ? 1 : (v < 0 ? 0 : v); }
function lengthF(x, y) { return f(Math.sqrt(x * x + y * y)); }
function lengthD(x, y) { return Math.sqrt(x * x + y * y); }
function lerpF(a, b, t) { return t <= 0 ? a : (t >= 1 ? b : f(a * (1 - t) + b * t)); }
function lerpD(a, b, t) { return t <= 0 ? a : (t >= 1 ? b : a * (1 - t) + b * t); }
function lerpStepF(l, h, v) { return f(clamp01((v - l) / (h - l))); }
function lerpStepD(l, h, v) { return clamp01((v - l) / (h - l)); }
function smoothStepF(min, max, x) {
  const n = f(clamp01((x - min) / (max - min)));
  return f(n * n * (3 - 2 * n));
}
function mathfLikeSmoothStep(from, to, t) {
  t = clamp01(t);
  t = -2 * t * t * t + 3 * t * t;
  return f(to * t + from * (1 - t));
}
function blendOverlay(a, b) {
  return a < 0.5 ? 2 * a * b : 1 - 2 * (1 - a) * (1 - b);
}
function remap(value, inLow, inHigh, outLow, outHigh) {
  const t = inLow === inHigh ? 0 : clamp01((value - inLow) / (inHigh - inLow));
  return lerpD(outLow, outHigh, t);
}
/** DUtils.Fbm(Vector2, int, double, double) */
function fbmD(px, py, octaves, lacunarity, gain) {
  let sum = 0, amp = 1, x = px, y = py;
  for (let i = 0; i < octaves; i++) {
    sum += amp * pn(x, y);
    amp *= gain; x *= lacunarity; y *= lacunarity;
  }
  return sum;
}
/** DUtils.Fbm(Vector2, int, float, float) */
function fbmF(px, py, octaves, lacunarity, gain) {
  let sum = 0, amp = 1, x = px, y = py;
  for (let i = 0; i < octaves; i++) {
    sum = f(sum + amp * perlinF(x, y));
    amp = f(amp * gain);
    x = f(x * lacunarity); y = f(y * lacunarity);
  }
  return sum;
}
// Utils (float) variants
function utilsLerpStep(l, h, v) { return f(clamp01(f(f(v - l) / f(h - l)))); }
function utilsSmoothStep(min, max, x) {
  const n = f(clamp01(f(f(x - min) / f(max - min))));
  return f(f(n * n) * f(3 - f(2 * n)));
}

// --------------------------------------------------------------- FastNoise

const FN_SEED = 0, FN_FREQ = 0.01, FN_JITTER = f(0.45), FN_BOUNDING = 1 / 1.5;
const GRAD2X = [-1, 1, -1, 1, 0, -1, 0, 1], GRAD2Y = [-1, -1, 1, 1, -1, 0, 1, 0];

function hash2D(seed, x, y) {
  let n = seed;
  n ^= Math.imul(1619, x);
  n ^= Math.imul(31337, y);
  n = Math.imul(Math.imul(Math.imul(n, n), n), 60493);
  return (n >> 13) ^ n;
}
function fastFloor(v) { return v >= 0 ? Math.trunc(v) : Math.trunc(v) - 1; }
function fastRound(v) { return v >= 0 ? Math.trunc(v + 0.5) : Math.trunc(v - 0.5); }

function getCellular(x, y) {
  x *= FN_FREQ; y *= FN_FREQ;
  const xr = fastRound(x), yr = fastRound(y);
  let best = 999999;
  for (let xi = xr - 1; xi <= xr + 1; xi++) {
    for (let yi = yr - 1; yi <= yr + 1; yi++) {
      const idx = (hash2D(FN_SEED, xi, yi) & 255) * 2;
      const vx = xi - x + CELL_2D[idx] * FN_JITTER;
      const vy = yi - y + CELL_2D[idx + 1] * FN_JITTER;
      const d = vx * vx + vy * vy;
      if (d < best) best = d;
    }
  }
  return best;
}
function gradCoord2D(seed, x, y, xd, yd) {
  const h = hash2D(seed, x, y) & 7;
  return xd * GRAD2X[h] + yd * GRAD2Y[h];
}
function singleSimplex(seed, x, y) {
  const F2 = 0.3660254037844386, G2 = 0.21132486540518713;
  let t = (x + y) * F2;
  const i = fastFloor(x + t), j = fastFloor(y + t);
  t = (i + j) * G2;
  const x0 = x - (i - t), y0 = y - (j - t);
  const i1 = x0 > y0 ? 1 : 0, j1 = 1 - i1;
  const x1 = x0 - i1 + G2, y1 = y0 - j1 + G2;
  const x2 = x0 - 1 + 0.42264973081037427, y2 = y0 - 1 + 0.42264973081037427;
  let n0 = 0, n1 = 0, n2 = 0;
  t = 0.5 - x0 * x0 - y0 * y0;
  if (t >= 0) { t *= t; n0 = t * t * gradCoord2D(seed, i, j, x0, y0); }
  t = 0.5 - x1 * x1 - y1 * y1;
  if (t >= 0) { t *= t; n1 = t * t * gradCoord2D(seed, i + i1, j + j1, x1, y1); }
  t = 0.5 - x2 * x2 - y2 * y2;
  if (t >= 0) { t *= t; n2 = t * t * gradCoord2D(seed, i + 1, j + 1, x2, y2); }
  return 50 * (n0 + n1 + n2);
}
function getSimplexFractal(x, y) {
  x *= FN_FREQ; y *= FN_FREQ;
  let sum = singleSimplex(FN_SEED, x, y);
  sum += singleSimplex(FN_SEED + 1, x * 2, y * 2) * 0.5;
  return sum * FN_BOUNDING;
}

// ----------------------------------------------------------- static helpers

const ASH_Y = -4000, ASH_MIN = 12000;
const C = { // float32 constants used in comparisons
  c002: f(0.02), c005: f(0.05), c012: f(0.12), c025: f(0.25), c028: f(0.28), c038: f(0.38),
  c04: f(0.4), c06: f(0.6), c01: f(0.1), c015: f(0.15), c014: f(0.14), c0139: f(0.139),
  c0128: f(0.128), c085: f(0.85), c03: f(0.3), c137: f(0.137), cm02: f(-0.2),
  c11: f(1.1), c13: f(1.3), c115: f(1.15), c08: f(0.8), c001: f(0.01),
  eq: f(9.99999944e-11), twoPi: f(f(Math.PI) * 2),
};

export function worldAngle(wx, wy) {
  return f(Math.sin(f(f(Math.atan2(wx, wy)) * 20)));
}
export function isAshlands(x, y) {
  const a = worldAngle(x, y) * 100;
  return lengthF(x, f(y + ASH_Y)) > ASH_MIN + a;
}
export function isDeepNorth(x, y) {
  const a = f(worldAngle(x, y) * 100);
  return lengthF(x, f(y + 4000)) > f(12000 + a);
}
export function ashlandsOceanGradient(x, y) {
  const yo = f(y + ASH_Y);
  const a = worldAngle(x, yo) * 100;
  return f((lengthF(x, yo) - (ASH_MIN + a)) / 300);
}
function createAshlandsGap(wx, wy) {
  const a = worldAngle(wx, wy) * 100;
  let v = lengthF(wx, f(wy + ASH_Y)) - (ASH_MIN + a);
  v = clamp01(Math.abs(v) / 400);
  return mathfLikeSmoothStep(0, 1, f(v));
}
function createDeepNorthGap(wx, wy) {
  const a = worldAngle(wx, wy) * 100;
  let v = lengthF(wx, f(wy + 4000)) - (12000 + a);
  v = clamp01(Math.abs(v) / 400);
  return mathfLikeSmoothStep(0, 1, f(v));
}
/** WorldGenerator.GetForestFactor */
export function forestFactor(x, z) {
  const s = C.c04;
  return fbmF(f(f(x * C.c001) * s), f(f(z * C.c001) * s), 3, f(1.6), f(0.7));
}

function v2eq(ax, ay, bx, by) {
  const dx = f(ax - bx), dy = f(ay - by);
  return f(f(dx * dx) + f(dy * dy)) < C.eq;
}
function v2dist(ax, ay, bx, by) {
  const dx = f(ax - bx), dy = f(ay - by);
  return f(Math.sqrt(f(f(dx * dx) + f(dy * dy))));
}
function v2norm(x, y) {
  const m = f(Math.sqrt(f(f(x * x) + f(y * y))));
  if (m > 1e-5) return [f(x / m), f(y / m)];
  return [0, 0];
}

// ------------------------------------------------------------ WorldGenerator

export class WorldGenerator {
  /**
   * @param {number|string} seed  numeric world seed or the seed name (string)
   * @param {object} [opts] { pregenerate: bool (default true), riverData: from exportRivers() }
   */
  constructor(seed, opts = {}) {
    this.seed = typeof seed === 'string' ? stableHash(seed) : (seed | 0);
    this.minMountainDistance = 1000;
    this.minDarklandNoise = C.c04;
    this.maxMarshDistance = 6000;
    this.rng = new URandom();
    this.rng.init(this.seed);
    this.o0 = this.rng.rangeInt(-10000, 10000);
    this.o1 = this.rng.rangeInt(-10000, 10000);
    this.o2 = this.rng.rangeInt(-10000, 10000);
    this.o3 = this.rng.rangeInt(-10000, 10000);
    this.riverSeed = this.rng.rangeInt(-2147483648, 2147483647);
    this.streamSeed = this.rng.rangeInt(-2147483648, 2147483647);
    this.o4 = this.rng.rangeInt(-10000, 10000);

    this.riverPoints = new Map();   // grid key -> Float32Array [x, y, w, w2, ...]
    this.cachedGrid = NaN;
    this.cachedPoints = null;
    this._w = 0; this._width = 0;
    this.lakes = []; this.rivers = []; this.streams = [];

    if (opts.riverData) {
      this.importRivers(opts.riverData);
    } else if (opts.pregenerate !== false) {
      this.findLakes();
      this.rivers = this.placeRivers();
      this.streams = this.placeStreams(false);
      this.placeStreams(true);
    }
  }

  exportRivers() {
    const keys = new Float64Array(this.riverPoints.size);
    const arrays = [];
    let i = 0;
    for (const [k, v] of this.riverPoints) { keys[i++] = k; arrays.push(v); }
    return { keys, arrays };
  }
  importRivers(data) {
    this.riverPoints = new Map();
    for (let i = 0; i < data.keys.length; i++) this.riverPoints.set(data.keys[i], data.arrays[i]);
    this.cachedGrid = NaN; this.cachedPoints = null;
  }

  // ---- lakes / rivers / streams (pregeneration)

  findLakes() {
    const xs = [], ys = [];
    for (let y = -10000; y <= 10000; y = f(y + 128)) {
      for (let x = -10000; x <= 10000; x = f(x + 128)) {
        if (!(f(Math.sqrt(f(f(x * x) + f(y * y)))) > 10000) && this.getBaseHeight(x, y) < C.c005) {
          xs.push(x); ys.push(y);
        }
      }
    }
    this.lakes = this.mergePoints(xs, ys, 800);
  }

  mergePoints(xs, ys, range) {
    const out = [];
    while (xs.length > 0) {
      let vx = xs.shift(), vy = ys.shift();
      while (xs.length > 0) {
        // FindClosest
        let best = -1, bestD = 99999;
        for (let i = 0; i < xs.length; i++) {
          if (v2eq(xs[i], ys[i], vx, vy)) continue;
          const d = v2dist(vx, vy, xs[i], ys[i]);
          if (d < range && d < bestD) { best = i; bestD = d; }
        }
        if (best === -1) break;
        vx = f(f(vx + xs[best]) * 0.5); vy = f(f(vy + ys[best]) * 0.5);
        xs[best] = xs[xs.length - 1]; ys[best] = ys[ys.length - 1];
        xs.pop(); ys.pop();
      }
      out.push([vx, vy]);
    }
    return out;
  }

  placeRivers() {
    this.rng.init(this.riverSeed);
    const rivers = [];
    const lakes = this.lakes;
    const open = lakes.slice();
    while (open.length > 1) {
      const p = open[0];
      let idx = this.findRandomRiverEnd(rivers, lakes, p, 2000, C.c04, 128);
      if (idx === -1 && !this.haveRiver1(rivers, p)) {
        idx = this.findRandomRiverEnd(rivers, lakes, p, 5000, C.c04, 128);
      }
      if (idx !== -1) {
        const q = lakes[idx];
        const widthMax = this.rng.rangeFloat(60, 100);
        const widthMin = this.rng.rangeFloat(60, widthMax);
        const dist = v2dist(p[0], p[1], q[0], q[1]);
        rivers.push({
          p0: p, p1: q, widthMax, widthMin,
          curveWidth: f(dist / 15), curveWavelength: f(dist / 20),
        });
      } else {
        open.shift();
      }
    }
    this.renderRivers(rivers, 0);
    return rivers;
  }

  findRandomRiverEnd(rivers, points, p, maxDistance, heightLimit, checkStep) {
    const list = [];
    for (let i = 0; i < points.length; i++) {
      const q = points[i];
      if (!v2eq(q[0], q[1], p[0], p[1]) && v2dist(p[0], p[1], q[0], q[1]) < maxDistance &&
        !this.haveRiver2(rivers, p, q) && this.isRiverAllowed(p, q, checkStep, heightLimit)) {
        list.push(i);
      }
    }
    if (list.length === 0) return -1;
    return list[this.rng.rangeInt(0, list.length)];
  }
  haveRiver1(rivers, p) {
    for (const r of rivers) {
      if (v2eq(r.p0[0], r.p0[1], p[0], p[1]) || v2eq(r.p1[0], r.p1[1], p[0], p[1])) return true;
    }
    return false;
  }
  haveRiver2(rivers, p0, p1) {
    for (const r of rivers) {
      if ((v2eq(r.p0[0], r.p0[1], p0[0], p0[1]) && v2eq(r.p1[0], r.p1[1], p1[0], p1[1])) ||
        (v2eq(r.p0[0], r.p0[1], p1[0], p1[1]) && v2eq(r.p1[0], r.p1[1], p0[0], p0[1]))) return true;
    }
    return false;
  }
  isRiverAllowed(p0, p1, step, heightLimit) {
    const dist = v2dist(p0[0], p0[1], p1[0], p1[1]);
    const [nx, ny] = v2norm(f(p1[0] - p0[0]), f(p1[1] - p0[1]));
    let allWater = true;
    const end = f(dist - step);
    for (let t = step; t <= end; t = f(t + step)) {
      const h = this.getBaseHeight(f(p0[0] + f(nx * t)), f(p0[1] + f(ny * t)));
      if (h > heightLimit) return false;
      if (h > C.c005) allWater = false;
    }
    return !allWater;
  }

  placeStreams(isDN) {
    this.rng.init(this.streamSeed);
    const list = [];
    const pre = !isDN;
    for (let i = 0; i < 3000; i++) {
      const start = this.findStreamStartPoint(100, 26, 31, pre);
      if (!start) continue;
      const end = this.findStreamEndPoint(100, 36, 44, start, 80, 200, pre);
      if (!end) continue;
      const cx = f(f(start[0] + end[0]) * 0.5), cy = f(f(start[1] + end[1]) * 0.5);
      const h = this.getPregenerationHeight(cx, cy, pre);
      if (h < 26 || h > 44) continue;
      const dist = v2dist(start[0], start[1], end[0], end[1]);
      list.push({
        p0: start, p1: end, widthMax: 20, widthMin: 20,
        curveWidth: f(dist / 15), curveWavelength: f(dist / 20),
      });
    }
    this.renderRivers(list, isDN ? 2 : 1);
    return list;
  }
  findStreamStartPoint(iterations, minHeight, maxHeight, pre) {
    for (let i = 0; i < iterations; i++) {
      const x = this.rng.rangeFloat(-10000, 10000);
      const y = this.rng.rangeFloat(-10000, 10000);
      const h = this.getPregenerationHeight(x, y, pre);
      if (h > minHeight && h < maxHeight) return [x, y];
    }
    return null;
  }
  findStreamEndPoint(iterations, minHeight, maxHeight, start, minLength, maxLength, pre) {
    const step = f((maxLength - minLength) / iterations);
    let len = maxLength;
    for (let i = 0; i < iterations; i++) {
      len = f(len - step);
      const a = this.rng.rangeFloat(0, C.twoPi);
      const x = f(start[0] + f(f(Math.sin(a)) * len));
      const y = f(start[1] + f(f(Math.cos(a)) * len));
      const h = this.getPregenerationHeight(x, y, pre);
      if (h > minHeight && h < maxHeight) return [x, y];
    }
    return null;
  }

  /** addRule: 0 = all, 1 = skip deep north, 2 = only deep north */
  renderRivers(rivers, addRule) {
    const dict = new Map();
    const add = (key, px, py, r) => {
      let l = dict.get(key);
      if (!l) { l = []; dict.set(key, l); }
      l.push(px, py, r, f(r * r));
    };
    for (const river of rivers) {
      if (addRule !== 0) {
        const dn = isDeepNorth(river.p0[0], river.p0[1]);
        if ((dn && addRule === 1) || (!dn && addRule === 2)) continue;
      }
      const step = f(river.widthMin / 8);
      const [nx, ny] = v2norm(f(river.p1[0] - river.p0[0]), f(river.p1[1] - river.p0[1]));
      const ox = f(0 - ny), oy = nx;
      const dist = v2dist(river.p0[0], river.p0[1], river.p1[0], river.p1[1]);
      for (let t = 0; t <= dist; t = f(t + step)) {
        const a = f(t / river.curveWavelength);
        const off = f(Math.sin(a) * Math.sin(a * 0.634119987487793) * Math.sin(a * 0.3341200053691864) * river.curveWidth);
        const r = this.rng.rangeFloat(river.widthMin, river.widthMax);
        const px = f(f(river.p0[0] + f(nx * t)) + f(ox * off));
        const py = f(f(river.p0[1] + f(ny * t)) + f(oy * off));
        // AddRiverPoint
        const gx = Math.floor(f((px + 32) / 64)), gy = Math.floor(f((py + 32) / 64));
        const n = Math.ceil(f(r / 64));
        const lim = f(r + 32);
        for (let y = gy - n; y <= gy + n; y++) {
          for (let x = gx - n; x <= gx + n; x++) {
            if (Math.abs(f(px - f(x * 64))) < lim && Math.abs(f(py - f(y * 64))) < lim) {
              add(x * 100000 + y, px, py, r);
            }
          }
        }
      }
    }
    for (const [key, list] of dict) {
      const old = this.riverPoints.get(key);
      if (old) {
        const merged = new Float32Array(old.length + list.length);
        merged.set(old); merged.set(list, old.length);
        this.riverPoints.set(key, merged);
      } else {
        this.riverPoints.set(key, Float32Array.from(list));
      }
    }
  }

  /** Sets this._w (weight) and this._width. Mirrors the game's one-entry grid cache. */
  getRiverWeight(wx, wy) {
    const gx = Math.floor(f((wx + 32) / 64)), gy = Math.floor(f((wy + 32) / 64));
    const key = gx * 100000 + gy;
    let pts;
    if (key === this.cachedGrid) {
      pts = this.cachedPoints;
    } else {
      pts = this.riverPoints.get(key) || null;
      this.cachedGrid = key;
      this.cachedPoints = pts;
    }
    let weight = 0, width = 0;
    if (pts) {
      let sumW = 0, sum = 0;
      for (let i = 0; i < pts.length; i += 4) {
        const dx = f(pts[i] - wx), dy = f(pts[i + 1] - wy);
        const d2 = f(f(dx * dx) + f(dy * dy));
        if (d2 < pts[i + 3]) {
          const w = pts[i + 2];
          const d = f(Math.sqrt(d2));
          const k = f(1 - d / w);
          if (k > weight) weight = k;
          sumW = f(sumW + w * k);
          sum = f(sum + k);
        }
      }
      if (sum > 0) width = f(sumW / sum);
    }
    this._w = weight; this._width = width;
  }

  addRivers(wx, wy, h) {
    this.getRiverWeight(wx, wy);
    const weight = this._w;
    if (weight <= 0) return h;
    const t = lerpStepF(20, 60, this._width);
    const a = lerpF(C.c014, C.c012, t);
    const b = lerpF(C.c0139, C.c0128, t);
    if (h > a) h = lerpF(h, a, weight);
    if (h > b) h = lerpF(h, b, lerpStepF(C.c085, 1, weight));
    return h;
  }

  // ---- biomes

  getBiome(wx, wy) {
    const dist = lengthF(wx, wy);
    const base = this.getBaseHeight(wx, wy);
    const angle = f(worldAngle(wx, wy) * 100);
    if (isAshlands(wx, wy)) return Biome.AshLands;
    if (base <= C.c002) return Biome.Ocean;
    if (isDeepNorth(wx, wy)) return Biome.DeepNorth;
    if (base > C.c04) return Biome.Mountain;
    const S = 0.0010000000474974513;
    if (pn(f(this.o0 + wx) * S, f(this.o0 + wy) * S) > C.c06 && dist > 2000 &&
      dist < this.maxMarshDistance && base > C.c005 && base < C.c025) return Biome.Swamp;
    if (pn(f(this.o4 + wx) * S, f(this.o4 + wy) * S) > this.minDarklandNoise &&
      dist > f(6000 + angle) && dist < 10000) return Biome.Mistlands;
    if (pn(f(this.o1 + wx) * S, f(this.o1 + wy) * S) > C.c04 &&
      dist > f(3000 + angle) && dist < 8000) return Biome.Plains;
    if (pn(f(this.o2 + wx) * S, f(this.o2 + wy) * S) > C.c04 &&
      dist > f(600 + angle) && dist < 6000) return Biome.BlackForest;
    if (dist > f(5000 + angle)) return Biome.BlackForest;
    return Biome.Meadows;
  }

  // ---- heights

  getBaseHeight(wx, wy) {
    const dist = lengthF(wx, wy);
    const x = wx + (100000 + this.o0);
    const y = wy + (100000 + this.o1);
    const S2 = 0.0020000000949949026, S3 = 0.003000000026077032;
    let h = 0;
    h = f(h + pn(x * S2 * 0.5, y * S2 * 0.5) * pn(x * S3 * 0.5, y * S3 * 0.5) * 1.0);
    h = f(h + pn(x * S2 * 1.0, y * S2 * 1.0) * pn(x * S3 * 1.0, y * S3 * 1.0) * h * 0.8999999761581421);
    h = f(h + pn(x * 0.004999999888241291 * 1.0, y * 0.004999999888241291 * 1.0) *
      pn(x * 0.009999999776482582 * 1.0, y * 0.009999999776482582 * 1.0) * 0.5 * h);
    h = f(h - 0.07000000029802322);
    const n1 = pn(x * S2 * 0.25 + 0.12300000339746475, y * S2 * 0.25 + 0.15123000741004944);
    const n2 = pn(x * S2 * 0.25 + 0.32100000977516174, y * S2 * 0.25 + 0.23100000619888306);
    const v = Math.abs(f(n1 - n2));
    let k = f(1 - lerpStepF(C.c002, C.c012, v));
    k = f(k * smoothStepF(744, 1000, dist));
    h = f(h * (1 - k));
    if (dist > 10000) {
      const t = lerpStepF(10000, 10500, dist);
      h = lerpF(h, C.cm02, t);
      if (dist > 10490) {
        const t2 = utilsLerpStep(10490, 10500, dist);
        h = lerpF(h, -2, t2);
      }
      return h;
    }
    if (dist < this.minMountainDistance && h > C.c028) {
      const t3 = f(clamp01((h - 0.2800000011920929) / 0.09999999403953552));
      h = lerpF(lerpF(C.c028, C.c038, t3), h,
        lerpStepF(f(this.minMountainDistance - 400), this.minMountainDistance, dist));
    }
    return h;
  }

  getHeight(wx, wy) {
    return this.getBiomeHeight(this.getBiome(wx, wy), wx, wy, false, true);
  }
  getPregenerationHeight(wx, wy, riverPreGen) {
    return this.getBiomeHeight(this.getBiome(wx, wy), wx, wy, true, riverPreGen);
  }

  getBiomeHeight(biome, wx, wy, preGeneration = false, riverPreDN = true) {
    const mul = preGeneration ? 200 : f(200 * createAshlandsGap(wx, wy) * createDeepNorthGap(wx, wy));
    if (lengthF(wx, wy) > 10500) return -400;
    let h;
    switch (biome) {
      case Biome.Swamp: h = this.getMarshHeight(wx, wy); break;
      case Biome.DeepNorth:
        h = preGeneration ? this.getDeepNorthHeightPregenerate(wx, wy, riverPreDN) : this.getDeepNorthHeight(wx, wy);
        break;
      case Biome.Mountain: h = this.getSnowMountainHeight(wx, wy); break;
      case Biome.BlackForest: h = this.getForestHeight(wx, wy); break;
      case Biome.Ocean: h = this.getBaseHeight(wx, wy); break;
      case Biome.AshLands:
        h = preGeneration ? this.getAshlandsHeightPregenerate(wx, wy) : this.getAshlandsHeight(wx, wy, false);
        break;
      case Biome.Plains: h = this.getPlainsHeight(wx, wy); break;
      case Biome.Meadows: h = this.getMeadowsHeight(wx, wy); break;
      case Biome.Mistlands:
        h = preGeneration ? this.getForestHeight(wx, wy) : this.getMistlandsHeight(wx, wy);
        break;
      default: return 0;
    }
    return f(h * mul);
  }

  getMarshHeight(wx, wy) {
    const x = f(wx + 100000), y = f(wy + 100000);
    let h = C.c137;
    const n = f(pn(x * 0.03999999910593033, y * 0.03999999910593033) * pn(x * 0.07999999821186066, y * 0.07999999821186066));
    h = f(h + n * 0.029999999329447746);
    h = this.addRivers(wx, wy, h);
    h = f(h + pn(x * 0.10000000149011612, y * 0.10000000149011612) * 0.009999999776482582);
    return f(h + pn(x * 0.4000000059604645, y * 0.4000000059604645) * 0.003000000026077032);
  }

  /** shared detail noise used by most biomes */
  _detail(x, y) {
    let n = f(pn(x * 0.009999999776482582, y * 0.009999999776482582) * pn(x * 0.019999999552965164, y * 0.019999999552965164));
    n = f(n + pn(x * 0.05000000074505806, y * 0.05000000074505806) * pn(x * 0.10000000149011612, y * 0.10000000149011612) * n * 0.5);
    return n;
  }
  _fine(h, x, y) {
    h = f(h + pn(x * 0.10000000149011612, y * 0.10000000149011612) * 0.009999999776482582);
    return f(h + pn(x * 0.4000000059604645, y * 0.4000000059604645) * 0.003000000026077032);
  }

  getMeadowsHeight(wx, wy) {
    const base = this.getBaseHeight(wx, wy);
    const x = f(wx + 100000 + this.o3), y = f(wy + 100000 + this.o3);
    const n = this._detail(x, y);
    let h = f(base + n * 0.10000000149011612);
    const over = f(h - C.c015);
    const k = f(clamp01(base / 0.4000000059604645));
    if (over > 0) h = f(h - over * ((1 - k) * 0.75));
    h = this.addRivers(wx, wy, h);
    return this._fine(h, x, y);
  }

  getForestHeight(wx, wy) {
    let h = this.getBaseHeight(wx, wy);
    const x = f(wx + 100000 + this.o3), y = f(wy + 100000 + this.o3);
    const n = this._detail(x, y);
    h = f(h + n * 0.10000000149011612);
    h = this.addRivers(wx, wy, h);
    return this._fine(h, x, y);
  }

  getPlainsHeight(wx, wy) {
    const base = this.getBaseHeight(wx, wy);
    const x = f(wx + 100000 + this.o3), y = f(wy + 100000 + this.o3);
    const n = this._detail(x, y);
    let h = f(base + n * 0.10000000149011612);
    const over = f(h - C.c015);
    const k = f(clamp01(base / 0.4000000059604645));
    if (over > 0) h = f(h - over * (1 - k) * 0.75);
    h = this.addRivers(wx, wy, h);
    return this._fine(h, x, y);
  }

  getMistlandsHeight(wx, wy) {
    let h = this.getBaseHeight(wx, wy);
    const x = f(wx + 100000 + this.o3), y = f(wy + 100000 + this.o3);
    const K = 0.699999988079071;
    let n = f(pn(x * 0.019999999552965164 * K, y * 0.019999999552965164 * K) * pn(x * 0.03999999910593033 * K, y * 0.03999999910593033 * K));
    n = f(n + pn(x * 0.029999999329447746 * K, y * 0.029999999329447746 * K) * pn(x * 0.05000000074505806 * K, y * 0.05000000074505806 * K) * n * 0.5);
    n = n > 0 ? f(Math.pow(n, 1.5)) : n;
    h = f(h + n * 0.4000000059604645);
    h = this.addRivers(wx, wy, h);
    const k = f(clamp01(n * 7));
    h = f(h + pn(x * 0.10000000149011612, y * 0.10000000149011612) * 0.029999999329447746 * k);
    h = f(h + pn(x * 0.4000000059604645, y * 0.4000000059604645) * 0.009999999776482582 * k);
    const a = f(h + pn(x * 0.4000000059604645, y * 0.4000000059604645) * 0.0020000000949949026);
    let stepped = f(h * 400);
    stepped = Math.ceil(stepped);
    stepped = f(stepped / 400);
    return lerpF(a, stepped, k);
  }

  baseHeightTilt(wx, wy) {
    const a = this.getBaseHeight(f(wx - 1), wy);
    const b = this.getBaseHeight(f(wx + 1), wy);
    const c = this.getBaseHeight(wx, f(wy - 1));
    const d = this.getBaseHeight(wx, f(wy + 1));
    return f(Math.abs(f(b - a)) + Math.abs(f(c - d)));
  }

  getSnowMountainHeight(wx, wy) {
    let h = this.getBaseHeight(wx, wy);
    const tilt = this.baseHeightTilt(wx, wy);
    const x = f(wx + 100000 + this.o3), y = f(wy + 100000 + this.o3);
    const up = f(h - 0.4000000059604645);
    h = f(h + up);
    const n = this._detail(x, y);
    h = f(h + n * 0.20000000298023224);
    h = this.addRivers(wx, wy, h);
    h = this._fine(h, x, y);
    return f(h + pn(x * 0.20000000298023224, y * 0.20000000298023224) * 2.0 * tilt);
  }

  getDeepNorthHeightPregenerate(wx, wy, riverPregen) {
    let h = this.getBaseHeight(wx, wy);
    if (!riverPregen) h = f(h + C.c01);
    const x = f(wx + 100000 + this.o3), y = f(wy + 100000 + this.o3);
    const up = Math.max(0, f(h - 0.4000000059604645));
    h = f(h + up);
    const n = this._detail(x, y);
    h = f(h + n * 0.20000000298023224);
    h = f(h * 1.2000000476837158);
    h = this.addRivers(wx, wy, h);
    h = f(h + perlinF(f(x * C.c01), f(y * C.c01)) * 0.009999999776482582);
    return f(h + perlinF(f(x * C.c04), f(y * C.c04)) * 0.003000000026077032);
  }

  getDeepNorthHeight(wx, wy) {
    const base = f(this.getBaseHeight(wx, wy) + C.c01);
    const x = f(wx + 100000 + this.o3), y = f(wy + 100000 + this.o3);
    const n = this._detail(x, y);
    let h = f(base + n * 0.10000000149011612);
    const over = f(h - C.c015);
    const k = f(clamp01(base / 0.4000000059604645));
    if (over > 0) h = f(h - over * ((1 - k) * 0.75));
    h = this.addRivers(wx, wy, h);
    return this._fine(h, x, y);
  }

  getAshlandsHeightPregenerate(wx, wy) {
    let h = this.getBaseHeight(wx, wy);
    const x = f(wx + 100000 + this.o3), y = f(wy + 100000 + this.o3);
    const n = this._detail(x, y);
    h = f(h + n * 0.10000000149011612);
    h = f(h + 0.10000000149011612);
    h = this._fine(h, x, y);
    return this.addRivers(wx, wy, h);
  }

  /** Returns height; lava mask is stored in this._lava */
  getAshlandsHeight(wx, wy, cheap) {
    let x = wx, y = wy;
    const base = this.getBaseHeight(f(x), f(y));
    const angle = worldAngle(f(x), f(y)) * 100;
    let v = lengthD(x, y + ASH_Y - ASH_Y * 0.3) - (ASH_MIN + angle);
    v = Math.abs(v) / 1000;
    v = 1 - clamp01(v);
    v = mathfLikeSmoothStep(0.1, 1, v);
    let ax = Math.abs(x);
    ax = 1 - clamp01(ax / 7500);
    v *= ax;
    let edge = lengthD(x, y) - 10150;
    edge = 1 - clamp01(edge / 600);
    const off = f(100000 + this.o3);
    x += off; y += off;
    let cell = 0, amp = 1, freq = 0.33000001311302185;
    const n1 = cheap ? 2 : 5;
    for (let i = 0; i < n1; i++) {
      cell += amp * mathfLikeSmoothStep(0, 1, getCellular(x * freq, y * freq));
      freq *= 2; amp *= 0.5;
    }
    cell = remap(cell, -1, 1, 0, 1);
    const blend = lerpD(v, blendOverlay(v, cell), 0.5);
    let h = lerpD(base, 0.15000000596046448, 0.75);
    h += blend * 0.5;
    h = lerpD(-1, h, mathfLikeSmoothStep(0, 1, edge));
    const floor = 0.15;
    let cell2 = 0; amp = 1; freq = 8;
    const n2 = cheap ? 2 : 3;
    for (let i = 0; i < n2; i++) {
      cell2 += amp * getCellular(x * freq, y * freq);
      freq *= 2; amp *= 0.5;
    }
    cell2 = remap(cell2, -1, 1, 0, 1);
    cell2 = clamp01(Math.pow(cell2, 4) * 2);
    let simplex = getSimplexFractal(x * 0.075, y * 0.075);
    simplex = remap(simplex, -1, 1, 0, 1);
    simplex = Math.pow(simplex, 1.399999976158142);
    h *= simplex;
    let lavaN = fbmD(f(x * 0.009999999776482582), f(y * 0.009999999776482582), 3, 2, 0.5);
    lavaN *= clamp01(remap(v, 0, 0.5, 0.5, 1));
    lavaN = lerpStepD(0.699999988079071, 1, lavaN);
    lavaN = Math.pow(lavaN, 2);
    let lava = blendOverlay(lavaN, cell2);
    lava *= clamp01((h - floor - 0.02) / 0.01);
    let dip = pn(x * 0.05 + 5124, y * 0.05 + 5000);
    dip = Math.pow(dip, 2);
    dip = remap(dip, 0, 1, 0.009999999776482582, 0.054999999701976776);
    const lo = f(floor + 0.009999999776482582);
    let b = f(h - dip);
    b = b < lo ? lo : (b > 5000 ? 5000 : b);
    h = lerpD(h, b, lava);
    this._lava = f(lava);
    return f(h);
  }

  // ---- minimap-style sampling

  /**
   * Samples a w*h grid. Pixel (i, j) is world (x0 + i*step, y0 + j*step).
   * Returns { biome: Uint8Array, height: Float32Array, mask: Uint8Array(w*h*3) }
   * mask = [forest, mist, lava] as in the game's minimap mask texture (r, g, b).
   */
  sampleGrid(x0, y0, step, w, h) {
    const biome = new Uint8Array(w * h);
    const height = new Float32Array(w * h);
    const mask = new Uint8Array(w * h * 3);
    for (let j = 0; j < h; j++) {
      const wy = f(y0 + j * step);
      for (let i = 0; i < w; i++) {
        const wx = f(x0 + i * step);
        const b = this.getBiome(wx, wy);
        const ht = this.getBiomeHeight(b, wx, wy, false, true);
        const k = j * w + i;
        biome[k] = b;
        height[k] = ht;
        if (ht < 30) {
          mask[k * 3 + 2] = Math.round(clamp01(ashlandsOceanGradient(wx, wy)) * 255);
        } else if (b === Biome.Meadows) {
          if (forestFactor(wx, wy) < C.c115) mask[k * 3] = 255;
        } else if (b === Biome.Plains) {
          if (forestFactor(wx, wy) < C.c08) mask[k * 3] = 255;
        } else if (b === Biome.BlackForest) {
          mask[k * 3] = 255;
        } else if (b === Biome.Mistlands) {
          mask[k * 3 + 1] = Math.round(f(1 - utilsSmoothStep(C.c11, C.c13, forestFactor(wx, wy))) * 255);
        } else if (b === Biome.AshLands) {
          this.getAshlandsHeight(wx, wy, true);
          mask[k * 3 + 2] = Math.round(clamp01(this._lava) * 255);
        }
      }
    }
    return { biome, height, mask };
  }
}
