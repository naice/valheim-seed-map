// Berechnet alle Orte einer Welt aus dem Seed (läuft einmal pro Welt, ca. 10 s).

import { WorldGenerator } from './worldgen.js';
import { generateLocations } from './locgen.js';

self.onmessage = async (e) => {
  const { seed, epoch } = e.data;
  try {
    const config = await (await fetch(new URL('../data/locations-config.json', import.meta.url))).json();
    const gen = new WorldGenerator(seed);
    let last = 0;
    const locs = generateLocations(gen, config, (p) => {
      const now = Date.now();
      if (now - last < 100) return;
      last = now;
      self.postMessage({ type: 'progress', epoch, p });
    });
    const prefabs = [], index = new Map();
    const data = new Float32Array(locs.length * 4);
    locs.forEach((l, i) => {
      let n = index.get(l.prefab);
      if (n === undefined) { n = prefabs.length; prefabs.push(l.prefab); index.set(l.prefab, n); }
      data.set([n, l.x, l.y, l.z], i * 4);
    });
    self.postMessage({ type: 'done', epoch, prefabs, data, gameVersion: config.gameVersion }, [data.buffer]);
  } catch (err) {
    self.postMessage({ type: 'error', epoch, message: String(err && err.message || err) });
  }
};
