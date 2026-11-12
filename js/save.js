// Liest Valheim-Spielstände (neues Format: *.fwl2 / *.db2) direkt im Browser.

import { prefabFromHash } from './locations.js';

class Reader {
  constructor(buf, off = 0) {
    this.u8 = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
    this.dv = new DataView(this.u8.buffer, this.u8.byteOffset, this.u8.byteLength);
    this.o = off;
  }
  i32() { const v = this.dv.getInt32(this.o, true); this.o += 4; return v; }
  f32() { const v = this.dv.getFloat32(this.o, true); this.o += 4; return v; }
  u8v() { return this.u8[this.o++]; }
  skip(n) { this.o += n; }
  str() {
    let len = 0, shift = 0, b;
    do { b = this.u8[this.o++]; len |= (b & 0x7f) << shift; shift += 7; } while (b & 0x80);
    const s = new TextDecoder().decode(this.u8.subarray(this.o, this.o + len));
    this.o += len;
    return s;
  }
}

/** Welt-Metadaten (.fwl / .fwl2) */
export function parseFwl(buf) {
  const r = new Reader(buf);
  r.i32(); // Paketlänge
  const version = r.i32();
  const name = r.str();
  const seedName = r.str();
  const seed = r.i32();
  return { version, name, seedName, seed };
}

async function gunzip(u8) {
  const stream = new Blob([u8]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** Welt-Datenbank (.db2): liefert die Locations. */
export async function parseDb2(buf) {
  const head = new Reader(buf);
  const version = head.i32();
  head.skip(8); // netTime (double)
  const len = head.i32();
  const u8 = new Uint8Array(buf);
  if (len <= 0 || 16 + len > u8.length || u8[16] !== 0x1f || u8[17] !== 0x8b) {
    throw new Error('Unbekanntes Datenbankformat – erwartet wird eine *.db2-Datei (Valheim 1.0+).');
  }
  const r = new Reader(await gunzip(u8.subarray(16, 16 + len)));
  const nZones = r.i32();
  r.skip(nZones * 4);
  const locationVersion = r.i32();
  const nKeys = r.i32();
  for (let i = 0; i < nKeys; i++) r.str();
  const generated = r.u8v() !== 0;
  const n = r.i32();
  if (n < 0 || r.o + n * 17 > r.u8.length) throw new Error('Location-Liste konnte nicht gelesen werden.');
  const locations = new Array(n);
  for (let i = 0; i < n; i++) {
    const hash = r.i32();
    const x = r.f32(), y = r.f32(), z = r.f32();
    const placed = r.u8v() !== 0;
    locations[i] = { prefab: prefabFromHash(hash), x, y, z, placed };
  }
  return { version, locationVersion, generated, exploredZones: nZones, locations };
}
