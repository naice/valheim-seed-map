// Kachel-Renderer: erzeugt aus dem Seed fertige RGBA-Kacheln (inkl. Schattierung).

import { WorldGenerator, Biome, BIOME_NAMES, forestFactor } from './worldgen.js';

let gen = null;
let epoch = 0;

//                    None        Meadows        Swamp          Mountain        BlackForest
const LAND = [[0, 0, 0], [146, 167, 92], [150, 112, 88], [236, 240, 244], [98, 116, 66],
//  Plains          AshLands       DeepNorth        Ocean(Strand)    Mistlands
  [226, 176, 110], [122, 44, 36], [214, 228, 240], [203, 190, 150], [92, 86, 108]];

function hashNoise(x, y) {
  let n = Math.imul(x, 374761393) ^ Math.imul(y, 668265263);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}

function renderTile(x0, zTop, mpp, S) {
  const W = S + 2;
  // Raster inkl. 1 Pixel Rand für die Geländeschattierung; Zeile 0 = Süden.
  const g = gen.sampleGrid(x0 - 0.5 * mpp, zTop - (S + 0.5) * mpp, mpp, W, W);
  const out = new Uint8ClampedArray(S * S * 4);
  const H = g.height, B = g.biome, M = g.mask;
  const slopeK = 1.6 / (2 * mpp);
  for (let py = 0; py < S; py++) {
    const gj = S - py; // Rasterzeile (Norden oben)
    for (let px = 0; px < S; px++) {
      const k = gj * W + px + 1;
      const h = H[k];
      const o = (py * S + px) * 4;
      if (h <= -399) continue; // außerhalb der Welt
      const b = B[k];
      let r, gr, bl;
      if (h < 30) {
        const depth = 30 - h;
        const t = Math.min(1, Math.pow(depth / 70, 0.55));
        r = 96 + (22 - 96) * t; gr = 150 + (50 - 150) * t; bl = 186 + (92 - 186) * t;
        if (depth < 1.2) { r += 30; gr += 30; bl += 25; }
        if (b === Biome.DeepNorth || b === Biome.Mountain) { r += 18; gr += 22; bl += 22; }
        const lavaSea = M[k * 3 + 2] / 255;
        if (lavaSea > 0) {
          r += (150 - r) * lavaSea * 0.85; gr += (52 - gr) * lavaSea * 0.85; bl += (34 - bl) * lavaSea * 0.85;
        }
      } else {
        const c = LAND[b];
        r = c[0]; gr = c[1]; bl = c[2];
        const forest = M[k * 3], mist = M[k * 3 + 1], lava = M[k * 3 + 2];
        if (forest) {
          const n = mpp <= 8 ? 0.82 + 0.16 * hashNoise(Math.round((x0 + px * mpp) / 4), Math.round((zTop - py * mpp) / 4)) : 0.9;
          const d = (b === Biome.BlackForest ? 0.86 : 0.74) * n;
          r *= d * 0.94; gr *= d; bl *= d * 0.9;
        }
        if (b === Biome.Mistlands && mist) {
          const m = mist / 255 * 0.45;
          r += (150 - r) * m; gr += (146 - gr) * m; bl += (172 - bl) * m;
        }
        if (b === Biome.AshLands && lava) {
          const l = Math.min(1, lava / 255 * 1.6);
          r += (255 - r) * l; gr += (128 - gr) * l; bl += (24 - bl) * l;
        }
        if (b === Biome.Mountain && h < 95) { // unterhalb der Schneegrenze: Fels
          const t = Math.max(0, (h - 70) / 25);
          r = 138 + (r - 138) * t; gr = 136 + (gr - 136) * t; bl = 132 + (bl - 132) * t;
        }
        // Geländeschattierung (Licht aus Nordwest)
        const dx = (H[k + 1] - H[k - 1]) * slopeK;
        const dz = (H[k + W] - H[k - W]) * slopeK;
        let shade = (-dx * -0.7 + -dz * 0.7 + 1.2) / Math.sqrt(dx * dx + dz * dz + 1) / 1.2;
        shade = Math.max(0.45, Math.min(1.35, shade));
        const hv = 1 + Math.min(0.12, (h - 30) / 1500);
        shade *= hv;
        r *= shade; gr *= shade; bl *= shade;
        if (h < 31) { r = r * 0.6 + 214 * 0.4; gr = gr * 0.6 + 200 * 0.4; bl = bl * 0.6 + 160 * 0.4; } // Uferlinie
      }
      out[o] = r; out[o + 1] = gr; out[o + 2] = bl; out[o + 3] = 255;
    }
  }
  return out;
}

self.onmessage = (e) => {
  const m = e.data;
  if (m.type === 'init') {
    epoch = m.epoch;
    gen = new WorldGenerator(m.seed);
    self.postMessage({ type: 'ready', epoch, seed: gen.seed });
  } else if (m.type === 'tile') {
    const data = renderTile(m.x0, m.zTop, m.mpp, m.size);
    self.postMessage({ type: 'tile', epoch, key: m.key, size: m.size, data }, [data.buffer]);
  } else if (m.type === 'probe') {
    const b = gen.getBiome(m.x, m.z);
    const h = gen.getBiomeHeight(b, m.x, m.z, false, true);
    let forest = false;
    if (h >= 30) {
      const ff = forestFactor(Math.fround(m.x), Math.fround(m.z));
      forest = b === Biome.BlackForest || (b === Biome.Meadows && ff < 1.15) || (b === Biome.Plains && ff < 0.8);
    }
    self.postMessage({ type: 'probe', epoch, id: m.id, x: m.x, z: m.z, biome: b, biomeName: BIOME_NAMES[b], height: h, forest });
  }
};
