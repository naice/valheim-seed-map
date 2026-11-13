// Erzeugt alle statischen Seiten der Website:  node tools/build.mjs
//
//   /            Karte (Englisch, x-default)        /de/ /fr/ …   Karte je Sprache
//   /seeds/      beste Seeds                        /de/seeds/ …
//   /bosses/     Übersicht + eine Seite je Boss     /de/bosses/eikthyr/ …
//   /traders/    Übersicht + eine Seite je Händler  /de/traders/haldor/ …
//   /faq/        Erklärtext, Seed finden, FAQ       /de/faq/ …
//
// Quellen: tools/templates/*.html, tools/content/<sprache>.json (Texte), tools/data/*.json (Spieldaten),
// lang/<sprache>.json (Oberfläche der Karte). Die erzeugten Dateien werden mit eingecheckt – die Website
// braucht keinen Build-Schritt beim Ausliefern.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(HERE, '..');
const SITE = 'https://valheim-map.de/';
const LANGS = ['en', 'de', 'fr', 'it', 'pt', 'es', 'no', 'sv', 'nl'];
const HREFLANG = { no: 'nb' };
const OG_LOCALE = { en: 'en_US', de: 'de_DE', fr: 'fr_FR', it: 'it_IT', pt: 'pt_PT', es: 'es_ES', no: 'nb_NO', sv: 'sv_SE', nl: 'nl_NL' };
// Spielversion, aus der Weltgenerator und Händlerdaten stammen (steht auch als data-game-version auf der Kartenseite)
const GAME_VERSION = JSON.parse(fs.readFileSync(path.join(OUT, 'data', 'locations-config.json'), 'utf8')).gameVersion;
const KOFI ='https://ko-fi.com/emmuss';

const json = (...p) => JSON.parse(fs.readFileSync(path.join(HERE, ...p), 'utf8'));
const UI = Object.fromEntries(LANGS.map(l => [l, JSON.parse(fs.readFileSync(path.join(OUT, 'lang', l + '.json'), 'utf8'))]));
const C = Object.fromEntries(LANGS.map(l => [l, json('content', l + '.json')]));
const NAMES = json('data', 'names.json');        // Spieltexte: token -> { en, de, … }
const TRADERS = json('data', 'traders.json');
const BOSSES = json('data', 'bosses.json');
const SEEDS = json('data', 'seeds.json');
const ICONS = new Set(fs.existsSync(path.join(OUT, 'poi-icons', 'items')) ? fs.readdirSync(path.join(OUT, 'poi-icons', 'items')).map(f => f.replace(/\.png$/, '')) : []);
const TPL = { map: fs.readFileSync(path.join(HERE, 'templates', 'map.html'), 'utf8'), page: fs.readFileSync(path.join(HERE, 'templates', 'page.html'), 'utf8') };

// ------------------------------------------------------------------ Helfer
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
/** Fließtext: HTML maskieren, **fett** erlauben. */
const rich = (s) => esc(s).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
const fill = (s, p) => s.replace(/\{(\w+)\}/g, (m, k) => (k in p ? p[k] : m));
const langDir = (l) => (l === 'en' ? '' : l + '/');
const url = (l, p) => SITE + langDir(l) + p;
const depth = (l, p) => (langDir(l) + p).split('/').length - 1;
const nf = (l, n) => new Intl.NumberFormat(HREFLANG[l] || l).format(n);
function pick(obj, dotted) {
  const v = dotted.split('.').reduce((o, k) => (o == null ? o : o[k]), obj);
  if (v == null) throw new Error('Text fehlt: ' + dotted);
  return v;
}
/** Name aus den Spieltexten; fehlende Übersetzungen fallen auf pt_br bzw. Englisch zurück. */
function gameName(token, l) {
  const e = NAMES[token];
  if (!e) throw new Error('Spieltext fehlt: ' + token);
  return e[l] || (l === 'pt' && e.pt_br) || e.en;
}
const icon = (prefab, root, cls = 'item-icon') =>
  ICONS.has(prefab) ? `<img class="${cls}" src="${root}poi-icons/items/${prefab}.png" alt="" width="32" height="32" loading="lazy">` : '';
const mapLink = (l, root, params) => root + langDir(l) + '#' + Object.entries(params).map(([k, v]) => k + '=' + encodeURIComponent(v).replace(/%2C/g, ',')).join('&');

// ------------------------------------------------------------------ Kopfbereich
function head(l, p, { title, desc, ld = [], type = 'website' }) {
  const u = url(l, p), img = SITE + 'poi-icons/site/og-image.jpg';
  const alt = LANGS.map(a => `  <link rel="alternate" hreflang="${HREFLANG[a] || a}" href="${url(a, p)}">`).join('\n');
  return `  <title>${esc(title)}</title>
  <meta name="description" content="${esc(desc)}">
  <meta name="robots" content="index, follow, max-image-preview:large">
  <meta name="theme-color" content="#14181d">
  <link rel="canonical" href="${u}">
${alt}
  <link rel="alternate" hreflang="x-default" href="${url('en', p)}">
  <meta property="og:type" content="${type}">
  <meta property="og:site_name" content="Valheim-Map">
  <meta property="og:locale" content="${OG_LOCALE[l]}">
  <meta property="og:url" content="${u}">
  <meta property="og:title" content="${esc(title)}">
  <meta property="og:description" content="${esc(desc)}">
  <meta property="og:image" content="${img}">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${esc(title)}">
  <meta name="twitter:description" content="${esc(desc)}">
  <meta name="twitter:image" content="${img}">
${ld.map(o => `  <script type="application/ld+json">${JSON.stringify({ '@context': 'https://schema.org', ...o }).replace(/</g, '\\u003c')}</script>`).join('\n')}`;
}
const crumbs = (l, list) => ({
  '@type': 'BreadcrumbList',
  itemListElement: list.map(([name, p], i) => ({ '@type': 'ListItem', position: i + 1, name, item: url(l, p) })),
});
const faqLd = (faq) => ({ '@type': 'FAQPage', mainEntity: faq.map(f => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a.replace(/\*\*/g, '') } })) });

function render(tpl, l, p, vars) {
  const root = '../'.repeat(depth(l, p)) || './';
  const all = { root, lang: l, gameVersion: GAME_VERSION, htmlLang: HREFLANG[l] || l, langName: UI[l].name, ...vars };
  return tpl.replace(/\{\{(\w+)(?::([\w.]+))?\}\}/g, (m, a, b) => {
    if (b === undefined) { if (!(a in all)) throw new Error('Platzhalter ' + m); return all[a]; }
    if (a === 't') return esc(pick(UI[l].ui, b));
    if (a === 'c') return esc(pick(C[l], b));
    throw new Error('Platzhalter ' + m);
  });
}
const written = [];
function write(l, p, html) {
  const file = path.join(OUT, langDir(l), p, 'index.html');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, html.replace(/\r\n/g, '\n'));
  written.push([l, p]);
}

// ------------------------------------------------------------------ Bausteine
const guideCards = (l, root) => {
  const c = C[l], h = root + langDir(l);
  const card = (href, title, text, img) => `<a class="card" href="${href}">${img}<span><strong>${esc(title)}</strong><small>${esc(text)}</small></span></a>`;
  const poi = (f) => `<img src="${root}poi-icons/icons/${f}.png" alt="" width="40" height="40" loading="lazy">`;
  return `<div class="cards">
${card(h + 'seeds/', c.nav.seeds, c.seeds.teaser, poi('mapicon_start'))}
${card(h + 'bosses/', c.nav.bosses, c.bosses.teaser, poi('mapicon_boss_colored'))}
${card(h + 'traders/', c.nav.traders, c.traders.teaser, poi('mapicon_trader'))}
</div>`;
};
const langLinks = (l, p, root) => LANGS.map(a =>
  a === l ? `<span aria-current="true">${esc(UI[a].name)}</span>` : `<a href="${root}${langDir(a)}${p}" hreflang="${HREFLANG[a] || a}" lang="${HREFLANG[a] || a}" data-setlang="${a}">${esc(UI[a].name)}</a>`).join('\n      ');
const siteFooter = (l, p, root) => `<footer class="site-foot">
    <nav class="langs" aria-label="${esc(UI[l].ui.langTitle)}">
      ${langLinks(l, p, root)}
    </nav>
    <p>${esc(fill(C[l].common.disclaimer, { version: GAME_VERSION }))}</p>
  </footer>`;

/** Rechts in der Kopfzeile: Spenden und Sprachwahl (auf der Karte öffnet app.js den Sprachdialog, sonst ein Aufklappmenü). */
function headTools(l, p, root, isMap) {
  const ui = UI[l].ui;
  const donate = `<a id="btnDonate" class="tool" href="${KOFI}" target="_blank" rel="noopener" title="${esc(ui.donateTitle)}"><span class="heart">♥</span> ${esc(ui.donate)}</a>`;
  const lang = isMap
    ? `<button id="btnLang" class="tool" type="button" title="${esc(ui.langTitle)}" aria-haspopup="dialog">🌐 ${esc(UI[l].name)}</button>`
    : `<details class="lang-menu"><summary class="tool" title="${esc(ui.langTitle)}">🌐 ${esc(UI[l].name)}</summary><div>
      ${langLinks(l, p, root)}
    </div></details>`;
  return `<div class="tools">${donate}${lang}</div>`;
}
const NAV_FAQ = 'FAQ';                             // in allen neun Sprachen gleich
/** Hauptmenü – auf der Karte und auf allen Inhaltsseiten dasselbe. */
function siteNav(l, root, active) {
  const c = C[l], h = root + langDir(l);
  return [['', c.nav.map, 'map'], ['seeds/', c.nav.seeds, 'seeds'], ['bosses/', c.nav.bosses, 'bosses'], ['traders/', c.nav.traders, 'traders'], ['faq/', NAV_FAQ, 'faq']]
    .map(([q, name, id]) => `<a href="${h}${q}"${id === active ? ' aria-current="page"' : ''}>${esc(name)}</a>`).join('\n        ');
}

// ------------------------------------------------------------------ Kartenseite
function mapPage(l) {
  const c = C[l], ui = UI[l].ui, root = '../'.repeat(depth(l, '')) || './';
  const ld = [{
    '@type': 'WebApplication', name: 'Valheim-Map', alternateName: ['Valheim Map', 'Valheim Seed Map', 'Valheim World Generator Map'],
    url: url(l, ''), description: ui.metaDesc, applicationCategory: 'GameApplication', operatingSystem: 'Any', browserRequirements: 'Requires JavaScript',
    isAccessibleForFree: true, inLanguage: HREFLANG[l] || l, image: SITE + 'poi-icons/site/og-image.jpg',
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'EUR' }, about: { '@type': 'VideoGame', name: 'Valheim' },
  }];
  const redirect = l !== 'en' ? '' : `
  <script>
    // Stammseite = Englisch. Wer eine andere Sprache gewählt hat (oder dessen Browser eine andere bevorzugt), wird weitergeleitet.
    (function () {
      var known = ${JSON.stringify(LANGS)}, c = null;
      try { c = localStorage.getItem('valheim-map.lang'); } catch (e) {}
      if (known.indexOf(c) < 0) {
        c = null;
        var list = navigator.languages || [navigator.language || ''];
        for (var i = 0; i < list.length && !c; i++) {
          var x = String(list[i]).toLowerCase().split('-')[0];
          if (x === 'nb' || x === 'nn') x = 'no';
          if (known.indexOf(x) >= 0) c = x;
        }
      }
      if (c && c !== 'en') location.replace(c + '/' + location.hash);
    })();
  </script>`;
  write(l, '', render(TPL.map, l, '', {
    head: head(l, '', { title: ui.pageTitle, desc: ui.metaDesc, ld }) + redirect,
    home: root + langDir(l), nav: siteNav(l, root, 'map'), tools: headTools(l, '', root, true), noscript: esc(c.common.noscript),
  }));
}

// --- FAQ: Erklärtext, Seed finden, häufige Fragen
function faqPage(l) {
  const c = C[l], a = c.about, p = 'faq/', root = '../'.repeat(depth(l, p));
  const body = `${bread(l, root, [[c.nav.map, ''], [NAV_FAQ, p]])}
<h1>${esc(a.h)}</h1>
${ps(a.p)}
<p><a class="btn primary" href="${root}${langDir(l)}">${esc(c.common.openMap)}</a></p>
<h2>${esc(a.seedH)}</h2>
<p>${rich(a.seedP)}</p>
<ol>
${a.seedSteps.map(x => `  <li>${rich(x)}</li>`).join('\n')}
</ol>
<h2>${esc(a.faqH)}</h2>
${a.faq.map(f => `<details><summary>${esc(f.q)}</summary><p>${rich(f.a)}</p></details>`).join('\n')}
<h2>${esc(a.guidesH)}</h2>
${guideCards(l, root)}`;
  contentPage(l, p, { title: a.faqH, desc: a.p[0].replace(/\*\*/g, ''), body, active: 'faq', ld: [crumbs(l, [[c.nav.map, ''], [NAV_FAQ, p]]), faqLd(a.faq)] });
}

// ------------------------------------------------------------------ Inhaltsseiten
function contentPage(l, p, { title, desc, ld, body, active }) {
  const c = C[l], root = '../'.repeat(depth(l, p)), h = root + langDir(l);
  write(l, p, render(TPL.page, l, p, {
    head: head(l, p, { title: title + ' – Valheim-Map', desc, ld, type: 'article' }),
    home: h, nav: siteNav(l, root, active), tools: headTools(l, p, root, false), body, footer: siteFooter(l, p, root),
  }));
}
const bread = (l, root, list) => `<nav class="crumbs">${list.map(([name, p], i) =>
  i === list.length - 1 ? `<span>${esc(name)}</span>` : `<a href="${root}${langDir(l)}${p}">${esc(name)}</a>`).join(' › ')}</nav>`;
const ps = (arr) => [].concat(arr).map(x => `<p>${rich(x)}</p>`).join('\n');
const ul = (arr) => `<ul>\n${arr.map(x => `  <li>${rich(x)}</li>`).join('\n')}\n</ul>`;

// --- Seeds
function seedsPage(l) {
  const c = C[l], s = c.seeds, k = c.common, p = 'seeds/', root = '../'.repeat(depth(l, p));
  const dist = (o) => fill(k.meters, { n: nf(l, Math.round(o.d / 10) * 10) });
  const bossName = (id) => gameName(BOSSES.find(b => b.id === id).name, l);
  const traderName = (id) => gameName(TRADERS.find(t => t.id === id).name, l);
  const items = SEEDS.map((sd, i) => {
    const txt = s.items[sd.seed];
    if (!txt) throw new Error(`${l}: Text für Seed ${sd.seed} fehlt`);
    const f = sd.facts;
    const jump = (o, prefabs, label) => `<a href="${mapLink(l, root, { seed: sd.seed, x: o.x, z: o.z, s: '0.2500', show: prefabs + ',StartTemple' })}" title="${esc(k.showOnMap)}">${esc(label)}</a>`;
    const rows = [];
    for (const t of TRADERS) rows.push([jump(f.key[t.id], t.prefab, traderName(t.id)), dist(f.key[t.id])]);
    for (const b of BOSSES) rows.push([jump(f.key[b.id], b.prefab, bossName(b.id)), dist(f.key[b.id])]);
    return `<section class="seed" id="${esc(sd.seed)}">
  <h2><span class="num">${i + 1}</span> ${esc(txt.title)}</h2>
  <p class="seedline"><code>${esc(sd.seed)}</code> <a class="btn primary" href="${mapLink(l, root, { seed: sd.seed })}">${esc(k.openMap)}</a></p>
  ${ps(txt.text)}
  <details class="facts"><summary>${esc(s.factsH)}</summary>
  <table>
    <thead><tr><th>${esc(s.colPlace)}</th><th class="r">${esc(s.colDist)}</th></tr></thead>
    <tbody>
${rows.map(r => `      <tr><td>${r[0]}</td><td class="r">${esc(r[1])}</td></tr>`).join('\n')}
    </tbody>
  </table>
  </details>
</section>`;
  }).join('\n');
  const body = `${bread(l, root, [[c.nav.map, ''], [c.nav.seeds, p]])}
<h1>${esc(s.h1)}</h1>
${ps(s.intro)}
<nav class="toc">${SEEDS.map(sd => `<a href="#${esc(sd.seed)}"><code>${esc(sd.seed)}</code> ${esc(s.items[sd.seed].title)}</a>`).join('\n')}</nav>
${items}
<h2>${esc(s.howH)}</h2>
${ps(s.how)}`;
  const ld = [crumbs(l, [[c.nav.map, ''], [c.nav.seeds, p]]), {
    '@type': 'ItemList', name: s.h1, numberOfItems: SEEDS.length,
    itemListElement: SEEDS.map((sd, i) => ({ '@type': 'ListItem', position: i + 1, name: `${sd.seed} – ${s.items[sd.seed].title}`, url: url(l, p) + '#' + sd.seed })),
  }];
  contentPage(l, p, { title: s.title, desc: s.desc, ld, body, active: 'seeds' });
}

// --- Bosse
function bossPages(l) {
  const c = C[l], B = c.bosses, k = c.common, p = 'bosses/';
  let root = '../'.repeat(depth(l, p));
  const name = (b) => gameName(b.name, l);
  const index = `${bread(l, root, [[c.nav.map, ''], [c.nav.bosses, p]])}
<h1>${esc(B.h1)}</h1>
${ps(B.intro)}
<table class="wide">
  <thead><tr><th>#</th><th>${esc(k.boss)}</th><th>${esc(k.biome)}</th><th class="r">${esc(k.health)}</th><th>${esc(k.summon)}</th></tr></thead>
  <tbody>
${BOSSES.map((b, i) => `    <tr><td>${i + 1}</td><td>${icon(b.trophy, root)}<a href="${b.id}/"><strong>${esc(name(b))}</strong></a></td><td>${esc(gameName(b.biome, l))}</td><td class="r">${nf(l, b.health)}</td><td>${b.summon.map(s => `${s.n} × ${esc(gameName(s.item, l))}`).join(', ')}</td></tr>`).join('\n')}
  </tbody>
</table>
${ps(B.outro)}`;
  contentPage(l, p, { title: B.title, desc: B.desc, body: index, active: 'bosses', ld: [crumbs(l, [[c.nav.map, ''], [c.nav.bosses, p]])] });

  BOSSES.forEach((b, i) => {
    const q = p + b.id + '/', t = B.list[b.id], n = name(b);
    if (!t) throw new Error(`${l}: Text für Boss ${b.id} fehlt`);
    root = '../'.repeat(depth(l, q));
    const dmg = (arr) => arr.length ? arr.map(d => esc(k.dmg[d])).join(', ') : '–';
    const items = (arr) => arr.map(s => `${icon(s.prefab, root)}${s.n ? s.n + ' × ' : ''}${esc(gameName(s.item, l))}`).join('<br>');
    const prev = BOSSES[i - 1], next = BOSSES[i + 1];
    const title = fill(B.pageTitle, { boss: n }), desc = fill(B.pageDesc, { boss: n, biome: gameName(b.biome, l) });
    const body = `${bread(l, root, [[c.nav.map, ''], [c.nav.bosses, p], [n, q]])}
<h1>${icon(b.trophy, root, 'item-icon big')}${esc(title)}</h1>
<p class="lead">${rich(t.lead)}</p>
<table class="facts-table">
  <tbody>
    <tr><th>${esc(k.biome)}</th><td>${esc(gameName(b.biome, l))}</td></tr>
    <tr><th>${esc(k.health)}</th><td>${nf(l, b.health)}</td></tr>
    <tr><th>${esc(k.summon)}</th><td>${items(b.summon)}</td></tr>
    <tr><th>${esc(k.weak)}</th><td>${dmg(b.weak)}</td></tr>
    <tr><th>${esc(k.resist)}</th><td>${dmg(b.resist)}</td></tr>
    <tr><th>${esc(k.immune)}</th><td>${dmg(b.immune)}</td></tr>
    <tr><th>${esc(k.drops)}</th><td>${items(b.drops)}</td></tr>
    <tr><th>${esc(k.power)}</th><td>${rich(t.power)}</td></tr>
  </tbody>
</table>
<p><a class="btn primary" href="${mapLink(l, root, { show: b.prefab + ',StartTemple' })}">${esc(fill(B.showOnMap, { boss: n }))}</a></p>
<h2>${esc(fill(B.findH, { boss: n }))}</h2>
${ps(t.find)}
<h2>${esc(B.prepH)}</h2>
${ul(t.prep)}
<h2>${esc(B.attacksH)}</h2>
${ul(t.attacks)}
<h2>${esc(B.tipsH)}</h2>
${ul(t.tips)}
<h2>${esc(B.rewardH)}</h2>
${ps(t.reward)}
<nav class="prevnext">
  ${prev ? `<a href="../${prev.id}/">← ${esc(name(prev))}</a>` : '<span></span>'}
  ${next ? `<a href="../${next.id}/">${esc(name(next))} →</a>` : '<span></span>'}
</nav>`;
    const ld = [crumbs(l, [[c.nav.map, ''], [c.nav.bosses, p], [n, q]]),
      { '@type': 'Article', headline: title, description: desc, inLanguage: HREFLANG[l] || l, mainEntityOfPage: url(l, q), image: SITE + 'poi-icons/site/og-image.jpg',
        author: { '@type': 'Organization', name: 'Valheim-Map', url: SITE }, about: { '@type': 'VideoGame', name: 'Valheim' } }];
    contentPage(l, q, { title, desc, ld, body, active: 'bosses' });
  });
}

// --- Händler
function traderPages(l) {
  const c = C[l], T = c.traders, k = c.common, p = 'traders/';
  let root = '../'.repeat(depth(l, p));
  const name = (t) => gameName(t.name, l);
  const poi = (t, r) => `<img class="item-icon big" src="${r}poi-icons/icons/${t.poiIcon}.png" alt="" width="40" height="40">`;
  const index = `${bread(l, root, [[c.nav.map, ''], [c.nav.traders, p]])}
<h1>${esc(T.h1)}</h1>
${ps(T.intro)}
<div class="cards">
${TRADERS.map(t => `<a class="card" href="${t.id}/">${poi(t, root)}<span><strong>${esc(name(t))}</strong><small>${esc(gameName(t.biome, l))} · ${esc(T.list[t.id].teaser)}</small></span></a>`).join('\n')}
</div>
<h2>${esc(T.sellH)}</h2>
${ps(T.sellP)}
${sellTable(l, root)}
${ps(T.outro)}`;
  contentPage(l, p, { title: T.title, desc: T.desc, body: index, active: 'traders', ld: [crumbs(l, [[c.nav.map, ''], [c.nav.traders, p]])] });

  for (const t of TRADERS) {
    const q = p + t.id + '/', x = T.list[t.id], n = name(t);
    if (!x) throw new Error(`${l}: Text für Händler ${t.id} fehlt`);
    root = '../'.repeat(depth(l, q));
    const title = fill(T.pageTitle, { trader: n }), desc = fill(T.pageDesc, { trader: n, biome: gameName(t.biome, l), n: t.items.length });
    const req = (key) => {
      if (!key) return `<span class="dim">${esc(k.always)}</span>`;
      const u = UNLOCK[key];
      if (!u) throw new Error(`Freischaltbedingung ${key} unbekannt`);
      return esc(u[0] === 'boss' ? fill(k.afterBoss, { boss: gameName(u[1], l) }) : fill(k.afterChest, { chest: gameName(u[1], l) }));
    };
    const rows = t.items.map(it => `    <tr><td>${icon(it.prefab, root)}${esc(gameName(it.name, l))}${it.stack > 1 ? ` <span class="dim">× ${it.stack}</span>` : ''}</td><td class="r"><strong>${nf(l, it.price)}</strong></td><td>${req(it.key)}</td></tr>`).join('\n');
    const body = `${bread(l, root, [[c.nav.map, ''], [c.nav.traders, p], [n, q]])}
<h1>${poi(t, root)}${esc(title)}</h1>
<p class="lead">${rich(x.lead)}</p>
<p><a class="btn primary" href="${mapLink(l, root, { show: t.show + ',StartTemple' })}">${esc(fill(T.showOnMap, { trader: n }))}</a></p>
<h2>${esc(fill(T.findH, { trader: n }))}</h2>
${ps(x.find)}
<h2>${esc(fill(T.waresH, { trader: n }))}</h2>
${ps(x.waresP)}
<table class="wide wares">
  <thead><tr><th>${esc(k.item)}</th><th class="r">${esc(k.price)}</th><th>${esc(k.available)}</th></tr></thead>
  <tbody>
${rows}
  </tbody>
</table>
<h2>${esc(T.tipsH)}</h2>
${ul(x.tips)}
<h2>${esc(T.sellH)}</h2>
${ps(T.sellP)}
${sellTable(l, root)}
<nav class="prevnext">
  ${TRADERS.filter(o => o !== t).map(o => `<a href="../${o.id}/">${esc(name(o))} →</a>`).join('\n  ')}
</nav>`;
    const ld = [crumbs(l, [[c.nav.map, ''], [c.nav.traders, p], [n, q]]),
      { '@type': 'Article', headline: title, description: desc, inLanguage: HREFLANG[l] || l, mainEntityOfPage: url(l, q), image: SITE + 'poi-icons/site/og-image.jpg',
        author: { '@type': 'Organization', name: 'Valheim-Map', url: SITE }, about: { '@type': 'VideoGame', name: 'Valheim' } }];
    contentPage(l, q, { title, desc, ld, body, active: 'traders' });
  }
}
/** Globale Schlüssel der Händlerwaren → Boss bzw. Hildirs Truhe (Namen aus den Spieltexten). */
const UNLOCK = {
  defeated_gdking: ['boss', 'enemy_gdking'], defeated_dragon: ['boss', 'enemy_dragon'], defeated_goblinking: ['boss', 'enemy_goblinking'],
  defeated_queen: ['boss', 'enemy_seekerqueen'], defeated_fader: ['boss', 'enemy_fader'], defeated_serpent: ['boss', 'enemy_serpent'],
  defeated_frozenking_p3: ['boss', 'enemy_frozenking'], defeated_writhan: ['boss', 'enemy_writhan'],
  Hildir1: ['chest', 'item_chest_hildir1'], Hildir2: ['chest', 'item_chest_hildir2'], Hildir3: ['chest', 'item_chest_hildir3'],
};
function sellTable(l, root) {
  const k = C[l].common, V = json('data', 'valuables.json');
  return `<table class="wares">
  <thead><tr><th>${esc(k.item)}</th><th class="r">${esc(k.sellValue)}</th></tr></thead>
  <tbody>
${V.map(v => `    <tr><td>${icon(v.prefab, root)}${esc(gameName(v.name, l))}</td><td class="r"><strong>${nf(l, v.value)}</strong></td></tr>`).join('\n')}
  </tbody>
</table>`;
}

// ------------------------------------------------------------------ Lauf
for (const l of LANGS) { mapPage(l); faqPage(l); seedsPage(l); bossPages(l); traderPages(l); }

const today = new Date().toISOString().slice(0, 10);
const paths = [...new Set(written.map(w => w[1]))];
fs.writeFileSync(path.join(OUT, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
${paths.flatMap(p => LANGS.map(l => `  <url>
    <loc>${url(l, p)}</loc>
    <lastmod>${today}</lastmod>
${LANGS.map(a => `    <xhtml:link rel="alternate" hreflang="${HREFLANG[a] || a}" href="${url(a, p)}"/>`).join('\n')}
    <xhtml:link rel="alternate" hreflang="x-default" href="${url('en', p)}"/>
    <priority>${p === '' ? '1.0' : p.split('/').length === 2 ? '0.8' : '0.6'}</priority>
  </url>`)).join('\n')}
</urlset>
`);
console.log(`${written.length} Seiten in ${LANGS.length} Sprachen geschrieben, sitemap.xml mit ${paths.length * LANGS.length} Adressen.`);
