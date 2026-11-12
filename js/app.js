import { stableHash } from './worldgen.js';
import { CATEGORIES, classify } from './locations.js';

const $ = (id) => document.getElementById(id);
const canvas = $('map');
const ctx = canvas.getContext('2d');
const wrap = $('mapWrap');

const WORLD_R = 10500;
const TILE = 256;
const K_MIN = -1, K_MAX = 6;          // Kachel-Auflösung: 2^k Meter pro Pixel
const CACHE_LIMIT = 700;
// ------------------------------------------------------------------ Sprache
// Texte liegen in lang/<code>.json; POI-Namen sind dort nach der deutschen Bezeichnung aus locations.js verschlüsselt.

const LANGS = [['de', 'Deutsch'], ['en', 'English'], ['fr', 'Français'], ['it', 'Italiano'], ['pt', 'Português'],
  ['es', 'Español'], ['no', 'Norsk'], ['sv', 'Svenska'], ['nl', 'Nederlands']];
const LANG_KEY = 'valheim-map.lang';
let lang = 'de';
let L = { ui: {}, cat: {}, biome: [], poi: {} };

function t(key, params) {
  let s = L.ui[key] ?? key;
  if (params) for (const k in params) s = s.replace('{' + k + '}', params[k]);
  return s;
}
const locale = () => (lang === 'no' ? 'nb' : lang);
const catLabel = (c) => L.cat[c.id] || c.label;
const poiLabel = (de) => L.poi[de] || de;

function detectLang() {
  const known = (c) => LANGS.some(l => l[0] === c);
  try { const s = localStorage.getItem(LANG_KEY); if (known(s)) return s; } catch { /* kein Speicher */ }
  for (const l of navigator.languages || [navigator.language || '']) {
    let c = String(l).toLowerCase().split('-')[0];
    if (c === 'nb' || c === 'nn') c = 'no';
    if (known(c)) return c;
  }
  return 'en';
}
async function loadLang(code) {
  try {
    const res = await fetch(`lang/${code}.json`);
    if (!res.ok) throw new Error(res.status);
    L = await res.json();
    lang = code;
  } catch { return false; }
  document.documentElement.lang = locale();
  document.title = t('title');
  for (const el of document.querySelectorAll('[data-i18n]')) el.textContent = t(el.dataset.i18n);
  for (const a of ['placeholder', 'title', 'aria-label'])
    for (const el of document.querySelectorAll(`[data-i18n-${a}]`)) el.setAttribute(a, t(el.getAttribute('data-i18n-' + a)));
  $('btnLang').textContent = '🌐 ' + L.name;
  return true;
}
/** Sprache umschalten und alles neu beschriften, ohne Auswahl oder Kartenausschnitt zu verlieren. */
async function setLang(code) {
  if (!await loadLang(code)) return;
  try { localStorage.setItem(LANG_KEY, code); } catch { /* kein Speicher */ }
  for (const p of world.pois) p.label = poiLabel(p.de);
  buildSidebar(true);
  renderSaved();
  showWorldInfo();
  if (selected) select(selected);
  if (lastProbeMsg) showProbe(lastProbeMsg);
  $('tooltip').hidden = true;
  requestDraw();
}
const CAT = new Map(CATEGORIES.map(c => [c.id, c]));
const EXAMPLE_SEED = 'Xldpp3L2LG';

const view = { cx: 0, cz: 0, scale: 0.04 };
let world = { name: '', seedName: '', seed: 0, pois: [] };
const STORE_KEY = 'valheim-map.seeds';
let savedSeeds = readSaved();    // [{ seed, name }]
let epoch = 0;
let workers = [];
const tiles = new Map();      // key -> { canvas, used }
const pending = new Set();
let wanted = [];
let frame = 0;
let dirty = false;
const enabled = new Set();    // aktive Typen: "cat|label"
let groups = [];              // [{cat, types: [{key, label, prefabs:Set, pois:[]}]}]
let selected = null;
let hover = null;
let visiblePois = [];
const jumpIndex = new Map();

// ------------------------------------------------------------------ Worker

function startWorkers() {
  for (const w of workers) w.w.terminate();
  workers = [];
  pending.clear();
  tiles.clear();
  epoch++;
  const n = Math.min(8, Math.max(2, (navigator.hardwareConcurrency || 4) - 1));
  for (let i = 0; i < n; i++) {
    const w = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
    const rec = { w, ready: false, busy: false };
    w.onmessage = (e) => onWorkerMessage(rec, e.data);
    w.onerror = (e) => { $('stLoad').textContent = t('workerError') + ': ' + (e.message || e); };
    w.postMessage({ type: 'init', seed: world.seed, epoch });
    workers.push(rec);
  }
  requestDraw();
}

function onWorkerMessage(rec, m) {
  if (m.epoch !== epoch) return;
  if (m.type === 'ready') {
    rec.ready = true;
  } else if (m.type === 'tile') {
    rec.busy = false;
    pending.delete(m.key);
    const c = document.createElement('canvas');
    c.width = c.height = m.size;
    c.getContext('2d').putImageData(new ImageData(m.data, m.size, m.size), 0, 0);
    tiles.set(m.key, { canvas: c, used: frame });
    if (tiles.size > CACHE_LIMIT) evict();
  } else if (m.type === 'probe') {
    if (m.id === probeId) showProbe(m);
    return;
  }
  requestDraw();
}

function evict() {
  const arr = [...tiles.entries()].filter(([k]) => !k.startsWith(K_MAX + '/')).sort((a, b) => a[1].used - b[1].used);
  for (let i = 0; i < arr.length && tiles.size > CACHE_LIMIT * 0.8; i++) tiles.delete(arr[i][0]);
}

function pump() {
  let qi = 0;
  for (const rec of workers) {
    if (!rec.ready || rec.busy) continue;
    while (qi < wanted.length && (pending.has(wanted[qi].key) || tiles.has(wanted[qi].key))) qi++;
    if (qi >= wanted.length) break;
    const t = wanted[qi++];
    pending.add(t.key);
    rec.busy = true;
    rec.w.postMessage({ type: 'tile', key: t.key, x0: t.x0, zTop: t.zTop, mpp: t.mpp, size: TILE });
  }
  const open = wanted.filter(t => !tiles.has(t.key)).length;
  $('stLoad').textContent = open ? t(open === 1 ? 'tiles1' : 'tilesN', { n: open }) : '';
}

// ---------------------------------------------------------------- Zeichnen

function requestDraw() {
  if (!dirty) { dirty = true; requestAnimationFrame(draw); }
}

function tileInWorld(x0, z0, ws) {
  const nx = Math.max(x0, Math.min(0, x0 + ws)), nz = Math.max(z0, Math.min(0, z0 + ws));
  return nx * nx + nz * nz < WORLD_R * WORLD_R;
}

function draw() {
  dirty = false;
  frame++;
  const dpr = window.devicePixelRatio || 1;
  const W = Math.round(wrap.clientWidth * dpr), H = Math.round(wrap.clientHeight * dpr);
  if (canvas.width !== W || canvas.height !== H) { canvas.width = W; canvas.height = H; }
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#0d1014';
  ctx.fillRect(0, 0, W, H);

  const S = view.scale * dpr;
  const xMin = view.cx - W / 2 / S, xMax = view.cx + W / 2 / S;
  const zMin = view.cz - H / 2 / S, zMax = view.cz + H / 2 / S;
  const kWant = Math.max(K_MIN, Math.min(K_MAX, Math.round(Math.log2(1 / S))));

  wanted = [];
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  for (let k = K_MAX; k >= kWant; k--) {
    const mpp = 2 ** k, ws = TILE * mpp;
    const tx0 = Math.floor(xMin / ws), tx1 = Math.floor(xMax / ws);
    const ty0 = Math.floor(zMin / ws), ty1 = Math.floor(zMax / ws);
    for (let ty = ty0; ty <= ty1; ty++) {
      for (let tx = tx0; tx <= tx1; tx++) {
        const x0 = tx * ws, z0 = ty * ws;
        if (!tileInWorld(x0, z0, ws)) continue;
        const key = `${k}/${tx}/${ty}`;
        const t = tiles.get(key);
        if (t) {
          t.used = frame;
          const sx0 = Math.round((x0 - view.cx) * S + W / 2), sx1 = Math.round((x0 + ws - view.cx) * S + W / 2);
          const sy0 = Math.round((view.cz - (z0 + ws)) * S + H / 2), sy1 = Math.round((view.cz - z0) * S + H / 2);
          ctx.drawImage(t.canvas, sx0, sy0, sx1 - sx0, sy1 - sy0);
        } else if (k === kWant || k === K_MAX) {
          const dx = x0 + ws / 2 - view.cx, dz = z0 + ws / 2 - view.cz;
          wanted.push({ key, x0, zTop: z0 + ws, mpp, d: (k === K_MAX ? -1 : dx * dx + dz * dz) });
        }
      }
    }
  }
  wanted.sort((a, b) => a.d - b.d);

  // Weltrand
  ctx.strokeStyle = '#ffffff30';
  ctx.lineWidth = dpr;
  ctx.beginPath();
  ctx.arc((0 - view.cx) * S + W / 2, view.cz * S + H / 2, WORLD_R * S, 0, Math.PI * 2);
  ctx.stroke();

  drawPois(W, H, S, dpr);
  pump();
  positionPopup();
  $('stScale').textContent = `1 px = ${(1 / view.scale).toFixed(view.scale > 0.5 ? 2 : 1)} m`;
  saveHashSoon();
}

function poiVisible(p) {
  return enabled.has(p.key);
}

// ---------------------------------------------------------------- POI-Icons
// Einfarbige Masken (Form im Alphakanal); werden je Kategorie-Farbe eingefärbt.

const ICON_DIR = 'poi-icons/';
const icons = new Map();        // Prefab -> { url, img, ready, sprites }
const iconByUrl = new Map();

async function loadIconIndex() {
  try {
    const list = await (await fetch(ICON_DIR + 'pois.json')).json();
    for (const e of list) {
      const url = ICON_DIR + e.image;
      let rec = iconByUrl.get(url);
      if (!rec) iconByUrl.set(url, rec = { url, img: null, ready: false, sprites: new Map() });
      icons.set(e.type, rec);
    }
  } catch { /* ohne Icons bleiben die Punkte */ }
}
function iconReady(rec) {
  if (!rec) return false;
  if (!rec.img) {
    rec.img = new Image();
    rec.img.onload = () => { rec.ready = true; requestDraw(); };
    rec.img.src = rec.url;
  }
  return rec.ready;
}
function tinted(img, color, size) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  g.drawImage(img, 0, 0, size, size);
  g.globalCompositeOperation = 'source-in';
  g.fillStyle = color;
  g.fillRect(0, 0, size, size);
  return c;
}
/** Eingefärbtes Icon mit dunkler Kontur, je Motiv/Farbe/Größe zwischengespeichert. */
function iconSprite(rec, color, size, o) {
  const key = color + '|' + size + '|' + o;
  let sp = rec.sprites.get(key);
  if (!sp) {
    sp = document.createElement('canvas');
    sp.width = sp.height = size + 2 * o;
    const g = sp.getContext('2d');
    const dark = tinted(rec.img, '#0b0e12', size);
    for (let i = 0; i < 12; i++) g.drawImage(dark, o + Math.cos(i * Math.PI / 6) * o, o + Math.sin(i * Math.PI / 6) * o);
    g.drawImage(tinted(rec.img, color, size), o, o);
    rec.sprites.set(key, sp);
  }
  return sp;
}

function drawPois(W, H, S, dpr) {
  visiblePois = [];
  const pad = 20 * dpr;
  for (const p of world.pois) {
    if (!poiVisible(p)) continue;
    const sx = (p.x - view.cx) * S + W / 2, sy = (view.cz - p.z) * S + H / 2;
    if (sx < -pad || sy < -pad || sx > W + pad || sy > H + pad) continue;
    p.sx = sx; p.sy = sy;
    visiblePois.push(p);
  }
  const rSmall = Math.max(2.5, Math.min(6, 3 + view.scale * 6)) * dpr;
  ctx.lineWidth = dpr;
  const o = Math.max(1, Math.round(1.5 * dpr));
  const sSmall = Math.round(Math.max(14, Math.min(24, 14 + view.scale * 28)) * dpr);
  const sBig = Math.round(28 * dpr);
  const drawIcon = (p, size) => {
    if (!iconReady(p.icon)) return false;
    ctx.drawImage(iconSprite(p.icon, p.c.color, size, o), Math.round(p.sx - size / 2) - o, Math.round(p.sy - size / 2) - o);
    p.r = size / 2;
    return true;
  };
  for (const p of visiblePois) {
    if (p.c.big) continue;
    if (drawIcon(p, sSmall)) continue;
    p.r = rSmall;
    ctx.lineWidth = dpr;
    ctx.beginPath();
    ctx.arc(p.sx, p.sy, rSmall, 0, 6.2832);
    ctx.fillStyle = p.c.color;
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.strokeStyle = '#000c';
    ctx.stroke();
  }
  const rBig = 9 * dpr;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.font = `bold ${11 * dpr}px "Segoe UI", sans-serif`;
  for (const p of visiblePois) {
    if (!p.c.big) continue;
    if (drawIcon(p, sBig)) continue;
    p.r = rBig;
    ctx.beginPath();
    ctx.arc(p.sx, p.sy, rBig, 0, 6.2832);
    ctx.fillStyle = p.c.color;
    ctx.fill();
    ctx.lineWidth = 2 * dpr;
    ctx.strokeStyle = '#fff';
    ctx.stroke();
    ctx.fillStyle = '#111';
    ctx.fillText(p.label[0], p.sx, p.sy + dpr * 0.5);
  }
  if (selected && poiVisible(selected)) {
    ctx.beginPath();
    ctx.arc(selected.sx, selected.sy, selected.r + 5 * dpr, 0, 6.2832);
    ctx.lineWidth = 2.5 * dpr; ctx.strokeStyle = '#fff'; ctx.stroke();
  }
  if ($('chkLabels').checked) {
    const few = visiblePois.length <= 250 && view.scale >= 0.1;
    ctx.font = `${12 * dpr}px "Segoe UI", sans-serif`;
    ctx.textAlign = 'left';
    ctx.lineWidth = 3 * dpr; ctx.strokeStyle = '#000c'; ctx.fillStyle = '#fff'; ctx.lineJoin = 'round';
    const boxes = [];
    const th = 14 * dpr;
    const place = (p) => {
      const off = p.r + 4 * dpr;
      const x0 = p.sx + off, y0 = p.sy - th / 2, x1 = x0 + ctx.measureText(p.label).width;
      for (const b of boxes) if (x0 < b[2] && x1 > b[0] && y0 < b[3] && y0 + th > b[1]) return;
      boxes.push([x0, y0, x1, y0 + th]);
      ctx.strokeText(p.label, x0, p.sy);
      ctx.fillText(p.label, x0, p.sy);
    };
    if (selected && poiVisible(selected)) place(selected);
    for (const p of visiblePois) if (p.c.big && p !== selected) place(p);
    if (few) for (const p of visiblePois) if (!p.c.big && p !== selected) place(p);
  }
}

// ------------------------------------------------------------- Interaktion

function screenToWorld(px, py) {
  return [view.cx + (px - wrap.clientWidth / 2) / view.scale, view.cz - (py - wrap.clientHeight / 2) / view.scale];
}
function minScale() { return Math.min(wrap.clientWidth, wrap.clientHeight) / (WORLD_R * 2) / 1.6; }
function zoomAt(px, py, factor) {
  const [wx, wz] = screenToWorld(px, py);
  view.scale = Math.max(minScale(), Math.min(4, view.scale * factor));
  view.cx = wx - (px - wrap.clientWidth / 2) / view.scale;
  view.cz = wz + (py - wrap.clientHeight / 2) / view.scale;
  clampView();
  requestDraw();
}
function clampView() {
  view.cx = Math.max(-WORLD_R, Math.min(WORLD_R, view.cx));
  view.cz = Math.max(-WORLD_R, Math.min(WORLD_R, view.cz));
}
function home() {
  view.cx = 0; view.cz = 0;
  view.scale = Math.min(wrap.clientWidth, wrap.clientHeight) / (WORLD_R * 2.05);
  requestDraw();
}

const pointers = new Map();
let dragMoved = 0, pinchDist = 0;
canvas.addEventListener('pointerdown', (e) => {
  canvas.setPointerCapture(e.pointerId);
  pointers.set(e.pointerId, { x: e.offsetX, y: e.offsetY });
  dragMoved = 0;
  if (pointers.size === 2) {
    const [a, b] = [...pointers.values()];
    pinchDist = Math.hypot(a.x - b.x, a.y - b.y);
  }
  canvas.classList.add('drag');
});
canvas.addEventListener('pointermove', (e) => {
  const p = pointers.get(e.pointerId);
  if (p) {
    const dx = e.offsetX - p.x, dy = e.offsetY - p.y;
    p.x = e.offsetX; p.y = e.offsetY;
    dragMoved += Math.abs(dx) + Math.abs(dy);
    if (pointers.size === 1) {
      view.cx -= dx / view.scale; view.cz += dy / view.scale;
      clampView();
    } else if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinchDist > 0) zoomAt((a.x + b.x) / 2, (a.y + b.y) / 2, d / pinchDist);
      pinchDist = d;
    }
    requestDraw();
  }
  onHover(e.offsetX, e.offsetY, !!p);
});
function endPointer(e) {
  const had = pointers.delete(e.pointerId);
  if (pointers.size === 0) canvas.classList.remove('drag');
  if (had && e.type === 'pointerup' && dragMoved < 5) onClick(e.offsetX, e.offsetY);
}
canvas.addEventListener('pointerup', endPointer);
canvas.addEventListener('pointercancel', endPointer);
canvas.addEventListener('pointerleave', () => { $('tooltip').hidden = true; });
canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  const delta = e.deltaMode === 1 ? e.deltaY * 33 : e.deltaY;
  zoomAt(e.offsetX, e.offsetY, Math.exp(-delta * 0.0016));
}, { passive: false });
$('zoomIn').onclick = () => zoomAt(wrap.clientWidth / 2, wrap.clientHeight / 2, 1.6);
$('zoomOut').onclick = () => zoomAt(wrap.clientWidth / 2, wrap.clientHeight / 2, 1 / 1.6);
$('zoomHome').onclick = home;
new ResizeObserver(requestDraw).observe(wrap);

function poiAt(px, py) {
  const dpr = window.devicePixelRatio || 1;
  let best = null, bestD = (13 * dpr) ** 2;
  for (const p of visiblePois) {
    const d = (p.sx - px * dpr) ** 2 + (p.sy - py * dpr) ** 2;
    if (d < bestD) { bestD = d; best = p; }
  }
  return best;
}

let probeId = 0, probeTimer = 0, lastProbe = null;
function onHover(px, py, dragging) {
  const [wx, wz] = screenToWorld(px, py);
  $('stPos').textContent = `X ${wx.toFixed(0)}  ·  Z ${wz.toFixed(0)}`;
  lastProbe = [wx, wz];
  if (!probeTimer) {
    probeTimer = setTimeout(() => {
      probeTimer = 0;
      const rec = workers.find(w => w.ready);
      if (rec && lastProbe) rec.w.postMessage({ type: 'probe', id: ++probeId, x: lastProbe[0], z: lastProbe[1] });
    }, 60);
  }
  const tip = $('tooltip');
  hover = dragging ? null : poiAt(px, py);
  canvas.style.cursor = hover ? 'pointer' : '';
  if (hover) {
    tip.innerHTML = `<b>${esc(hover.label)}</b><br>X ${hover.x.toFixed(0)} · Z ${hover.z.toFixed(0)}`;
    tip.hidden = false;
    tip.style.left = Math.min(px + 14, wrap.clientWidth - 200) + 'px';
    tip.style.top = (py + 14) + 'px';
  } else {
    tip.hidden = true;
  }
}
let lastProbeMsg = null;
function showProbe(m) {
  lastProbeMsg = m;
  if (Math.hypot(m.x, m.z) > WORLD_R) { $('stBiome').textContent = t('outside'); return; }
  const rel = m.height - 30;
  const h = rel < 0 ? t('water', { d: (-rel).toFixed(1) }) : t('above', { h: rel.toFixed(1) });
  $('stBiome').textContent = `${L.biome[m.biome] || '–'}${m.forest ? ` (${t('forest')})` : ''}  ·  ${h}`;
}

function onClick(px, py) {
  select(poiAt(px, py));
}
function select(p) {
  selected = p;
  const pop = $('popup');
  if (!p) { pop.hidden = true; requestDraw(); return; }
  const dist = Math.hypot(p.x, p.z);
  pop.innerHTML = `<button class="close" title="${esc(t('close'))}">×</button>
    <h3>${iconHtml(p.icon, p.c.color)}${esc(p.label)}</h3>
    <p>${esc(catLabel(p.c))} · <b>${esc(p.prefab)}</b></p>
    <p>${esc(t('popPos'))}: <b>X ${p.x.toFixed(0)}, Z ${p.z.toFixed(0)}</b> (${esc(t('popHeight', { h: (p.y - 30).toFixed(0) }))})</p>
    <p>${esc(t('popDist'))}: <b>${dist.toFixed(0)} m</b></p>
    <p>${esc(t('popConsole'))}: <code>goto ${p.x.toFixed(0)} ${p.z.toFixed(0)}</code></p>`;
  pop.querySelector('.close').onclick = () => select(null);
  pop.hidden = false;
  requestDraw();
}
function positionPopup() {
  const pop = $('popup');
  if (!selected || pop.hidden) return;
  const dpr = window.devicePixelRatio || 1;
  const x = selected.sx / dpr, y = selected.sy / dpr;
  pop.style.left = Math.max(4, Math.min(wrap.clientWidth - pop.offsetWidth - 4, x + 16)) + 'px';
  pop.style.top = Math.max(4, Math.min(wrap.clientHeight - pop.offsetHeight - 30, y - 20)) + 'px';
}
function iconHtml(rec, color) {
  return rec ? `<span class="poi-icon" style="-webkit-mask-image:url('${rec.url}');mask-image:url('${rec.url}');color:${color}"></span>` : '';
}
function esc(s) { return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

// ------------------------------------------------------------ Seitenleiste

function buildSidebar(keep) {
  const openCats = new Set(groups.filter(g => g.el && g.el.classList.contains('open')).map(g => g.cat.id));
  const byCat = new Map();
  for (const p of world.pois) {
    let types = byCat.get(p.cat);
    if (!types) byCat.set(p.cat, types = new Map());
    let t = types.get(p.key);
    if (!t) types.set(p.key, t = { key: p.key, label: p.label, icon: p.icon, prefabs: new Set(), pois: [] });
    t.prefabs.add(p.prefab);
    t.pois.push(p);
  }
  groups = CATEGORIES.filter(c => byCat.has(c.id)).map(c => ({
    cat: c, types: [...byCat.get(c.id).values()].sort((a, b) => a.label.localeCompare(b.label, locale())),
  }));
  if (!keep) {
    enabled.clear();
    for (const g of groups) if (g.cat.on) for (const ty of g.types) enabled.add(ty.key);
  }

  const root = $('cats');
  root.innerHTML = '';
  for (const g of groups) {
    const total = g.types.reduce((s, t) => s + t.pois.length, 0);
    const el = document.createElement('div');
    el.className = keep && openCats.has(g.cat.id) ? 'cat open' : 'cat';
    el.innerHTML = `<div class="cat-head"><input type="checkbox"><span class="dot" style="background:${g.cat.color}"></span>
      <span class="name">${esc(catLabel(g.cat))}</span><span class="count">${total}</span></div><div class="types"></div>`;
    g.el = el;
    g.box = el.querySelector('input');
    g.box.onchange = () => {
      for (const t of g.types) {
        if (t.row.classList.contains('hidden')) continue;
        if (g.box.checked) enabled.add(t.key); else enabled.delete(t.key);
      }
      syncBoxes();
    };
    el.querySelector('.name').onclick = () => el.classList.toggle('open');
    const list = el.querySelector('.types');
    const jump = esc(t('jumpTitle'));
    for (const ty of g.types) {
      const row = document.createElement('div');
      row.className = 'type';
      row.innerHTML = `<input type="checkbox">${iconHtml(ty.icon, g.cat.color)}<span class="name" title="${esc([...ty.prefabs].join(', '))} – ${jump}">${esc(ty.label)}</span><span class="count">${ty.pois.length}</span>`;
      ty.row = row;
      ty.box = row.querySelector('input');
      ty.box.onchange = () => { if (ty.box.checked) enabled.add(ty.key); else enabled.delete(ty.key); syncBoxes(); };
      row.querySelector('.name').onclick = () => jumpTo(ty);
      list.appendChild(row);
    }
    root.appendChild(el);
  }
  $('poiTotal').textContent = world.pois.length ? `– ${world.pois.length.toLocaleString(locale())}` : '';
  renderHint();
  applySearch();
  syncBoxes();
}

/** Hinweiszeile unter der Liste: Berechnung läuft / fehlgeschlagen / fertig. */
let hintState = null;         // { p } während der Berechnung, { fail } bei Fehler
function renderHint() {
  const h = hintState;
  $('poiHint').textContent = h
    ? (h.fail !== undefined ? t('calcFail') + ': ' + h.fail : t('calcHint') + (h.p ? ` ${Math.round(h.p * 100)} %` : ''))
    : world.computed ? t('computed', { v: world.computed }) : '';
}

function syncBoxes() {
  for (const g of groups) {
    let on = 0;
    for (const t of g.types) { const e = enabled.has(t.key); t.box.checked = e; if (e) on++; }
    g.box.checked = on === g.types.length;
    g.box.indeterminate = on > 0 && on < g.types.length;
  }
  requestDraw();
}

function applySearch() {
  const q = $('search').value.trim().toLowerCase();
  for (const g of groups) {
    let any = false;
    const catMatch = q && catLabel(g.cat).toLowerCase().includes(q);
    for (const t of g.types) {
      const m = !q || catMatch || t.label.toLowerCase().includes(q) || [...t.prefabs].some(p => p.toLowerCase().includes(q));
      t.row.classList.toggle('hidden', !m);
      any = any || m;
    }
    g.el.classList.toggle('hidden', !any);
    if (q) g.el.classList.toggle('open', any);
  }
}
$('search').addEventListener('input', applySearch);
$('btnAll').onclick = () => { for (const g of groups) for (const t of g.types) if (!t.row.classList.contains('hidden')) enabled.add(t.key); syncBoxes(); };
$('btnNone').onclick = () => { for (const g of groups) for (const t of g.types) if (!t.row.classList.contains('hidden')) enabled.delete(t.key); syncBoxes(); };
$('chkLabels').onchange = requestDraw;

/** Springt zum nächstgelegenen Ort dieses Typs; erneutes Klicken geht zum übernächsten usw. */
function jumpTo(t) {
  enabled.add(t.key);
  syncBoxes();
  let st = jumpIndex.get(t.key);
  if (!st || st.epoch !== epoch || Math.hypot(st.cx - view.cx, st.cz - view.cz) > 1) {
    const ox = view.cx, oz = view.cz;
    st = { epoch, i: 0, list: [...t.pois].sort((a, b) => Math.hypot(a.x - ox, a.z - oz) - Math.hypot(b.x - ox, b.z - oz)) };
    jumpIndex.set(t.key, st);
  } else {
    st.i = (st.i + 1) % st.list.length;
  }
  const p = st.list[st.i];
  view.cx = st.cx = p.x; view.cz = st.cz = p.z;
  if (view.scale < 0.35) view.scale = 0.35;
  select(p);
}

// --------------------------------------------------------------- Welt laden

function toPois(locations) {
  return locations.map(l => {
    const c = classify(l.prefab);
    return { ...l, cat: c.cat, de: c.label, label: poiLabel(c.label), key: c.cat + '|' + c.label, c: CAT.get(c.cat), icon: icons.get(l.prefab) };
  });
}

function setWorld(w, keepView) {
  world = {
    name: w.name || '', seedName: w.seedName || '', seed: w.seed | 0,
    pois: [], computed: '',
  };
  selected = null; $('popup').hidden = true;
  $('seedInput').value = world.seedName;
  $('nameInput').value = world.name;
  renderSaved();
  showWorldInfo();
  buildSidebar();
  startWorkers();
  if (!keepView) home();
  if (locWorker) { locWorker.terminate(); locWorker = null; }
  computeLocations();
}

function showWorldInfo() {
  $('worldInfo').innerHTML = `${world.name ? `${esc(t('world'))} <b>${esc(world.name)}</b> · ` : ''}Seed <b>${esc(world.seedName || '?')}</b> (${world.seed})`;
}

/** Fortschrittsbalken in der Kartenmitte; p = 0..1, null blendet ihn aus. */
function showProgress(p) {
  const box = $('progress');
  box.hidden = p === null;
  if (p === null) return;
  const pct = Math.round(p * 100);
  $('progressBar').style.width = pct + '%';
  $('progressText').textContent = pct + ' %';
  box.setAttribute('aria-valuenow', pct);
}

let locWorker = null;
function computeLocations() {
  const myEpoch = epoch;
  const w = locWorker = new Worker(new URL('./locworker.js', import.meta.url), { type: 'module' });
  hintState = { p: 0 };
  renderHint();
  showProgress(0);
  const fail = (msg) => { showProgress(null); hintState = { fail: msg }; renderHint(); w.terminate(); if (locWorker === w) locWorker = null; };
  w.onerror = (e) => fail(e.message || t('workerError'));
  w.onmessage = (e) => {
    const m = e.data;
    if (m.epoch !== myEpoch || myEpoch !== epoch) return;
    if (m.type === 'progress') {
      hintState = { p: m.p };
      renderHint();
      showProgress(m.p);
    } else if (m.type === 'error') {
      fail(m.message);
    } else if (m.type === 'done') {
      const locations = [];
      for (let i = 0; i < m.data.length; i += 4) {
        locations.push({ prefab: m.prefabs[m.data[i]], x: m.data[i + 1], y: m.data[i + 2], z: m.data[i + 3] });
      }
      world.pois = toPois(locations);
      world.computed = m.gameVersion;
      showProgress(null);
      hintState = null;
      buildSidebar();
      w.terminate(); locWorker = null;
    }
  };
  w.postMessage({ seed: world.seed, epoch: myEpoch });
}

$('seedForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const s = $('seedInput').value.trim();
  if (!s) return;
  loadSeed(s);
});
$('btnExample').onclick = () => loadSeed(EXAMPLE_SEED);

function loadSeed(seedName, keepView) {
  const entry = savedSeeds.find(e => e.seed === seedName);
  setWorld({ name: entry ? entry.name : '', seedName, seed: stableHash(seedName) }, keepView);
}

// ------------------------------------------------------- Gespeicherte Seeds

function readSaved() {
  try {
    const list = JSON.parse(localStorage.getItem(STORE_KEY) || '[]');
    return Array.isArray(list) ? list.filter(e => e && typeof e.seed === 'string' && e.seed)
      .map(e => ({ seed: e.seed, name: typeof e.name === 'string' ? e.name : '' })) : [];
  } catch { return []; }
}
function writeSaved() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(savedSeeds)); return true; } catch { return false; }
}
/** "Name (SEED)" mit gedimmtem Seed – ohne Namen nur der Seed in normaler Schrift. */
function seedLabel(e) {
  return e.name ? `${esc(e.name)} <span class="dim">(${esc(e.seed)})</span>` : esc(e.seed);
}
function renderSaved() {
  const btn = $('savedBtn'), list = $('savedList');
  const current = savedSeeds.find(e => e.seed === world.seedName);
  btn.disabled = savedSeeds.length === 0;
  btn.innerHTML = `<span class="dd-label">${current ? seedLabel(current)
    : savedSeeds.length ? esc(t('savedCount', { n: savedSeeds.length })) : esc(t('savedNone'))}</span>`;
  list.innerHTML = '';
  for (const e of savedSeeds) {
    const li = document.createElement('li');
    li.setAttribute('role', 'option');
    if (e === current) li.className = 'current';
    li.innerHTML = `<button type="button" class="pick">${seedLabel(e)}</button><button type="button" class="del" title="${esc(t('remove'))}">×</button>`;
    li.querySelector('.pick').onclick = () => { toggleSaved(false); loadSeed(e.seed); };
    li.querySelector('.del').onclick = () => {
      savedSeeds = savedSeeds.filter(x => x !== e);
      writeSaved();
      renderSaved();
      if (!savedSeeds.length) toggleSaved(false);
    };
    list.appendChild(li);
  }
}
function toggleSaved(open) {
  $('savedList').hidden = !open;
  $('savedBtn').setAttribute('aria-expanded', String(open));
}
$('savedBtn').onclick = () => toggleSaved($('savedList').hidden);
document.addEventListener('pointerdown', (e) => { if (!$('saved').contains(e.target)) toggleSaved(false); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') toggleSaved(false); });

$('btnSave').onclick = () => {
  const seed = $('seedInput').value.trim();
  if (!seed) { $('seedInput').focus(); return; }
  const name = $('nameInput').value.trim();
  const entry = savedSeeds.find(e => e.seed === seed);
  if (entry) entry.name = name; else savedSeeds.push({ seed, name });
  savedSeeds.sort((a, b) => (a.name || a.seed).localeCompare(b.name || b.seed, locale()));
  if (!writeSaved()) alert(t('saveFail'));
  if (seed === world.seedName) { world.name = name; showWorldInfo(); renderSaved(); }
  else loadSeed(seed);
};

// ------------------------------------------------------------ Sprachdialog

$('btnLang').onclick = () => {
  const list = $('langList');
  list.innerHTML = '';
  for (const [code, name] of LANGS) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = name;
    b.lang = code === 'no' ? 'nb' : code;
    if (code === lang) { b.className = 'current'; b.setAttribute('aria-current', 'true'); }
    b.onclick = () => { $('langDlg').close(); setLang(code); };
    list.appendChild(b);
  }
  $('langDlg').showModal();
};
$('langClose').onclick = () => $('langDlg').close();
$('langDlg').addEventListener('click', (e) => { if (e.target === $('langDlg')) $('langDlg').close(); });

// ---------------------------------------------------------------- URL-Hash

let hashTimer = 0;
function saveHashSoon() {
  clearTimeout(hashTimer);
  hashTimer = setTimeout(() => {
    const h = `#seed=${encodeURIComponent(world.seedName)}&x=${view.cx.toFixed(0)}&z=${view.cz.toFixed(0)}&s=${view.scale.toFixed(4)}`;
    history.replaceState(null, '', h);
  }, 400);
}

(async function init() {
  const params = new URLSearchParams(location.hash.slice(1));
  const seed = params.get('seed');
  const hasView = params.has('x') && params.has('z') && params.has('s');
  if (hasView) {
    view.cx = +params.get('x') || 0; view.cz = +params.get('z') || 0;
    view.scale = Math.max(0.005, Math.min(4, +params.get('s') || 0.04));
  }
  await Promise.all([loadIconIndex(), loadLang(detectLang()).then(ok => ok || loadLang('de'))]);
  loadSeed(seed || EXAMPLE_SEED, hasView);
})();
