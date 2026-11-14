// Gegenstandsseiten: Detailansicht im Dialog (Übersicht) und Sammellisten zum Abarbeiten (localStorage).
// Ohne dieses Skript bleiben die Seiten benutzbar: die Links führen dann auf die Kategorieseiten.
(function () {
  var T = JSON.parse(document.getElementById('itemsI18n').textContent);
  var KEY = 'valheim-map-item-lists';
  var panel = document.getElementById('lists'), dlg = document.getElementById('itemDialog');
  var isIndex = !!panel;
  var listsHref = isIndex ? '#lists' : '../#lists';
  var fill = function (s, o) { return s.replace(/\{(\w+)\}/g, function (m, k) { return k in o ? o[k] : m; }); };
  var el = function (tag, attrs, kids) {
    var e = document.createElement(tag);
    for (var k in attrs || {}) { if (k === 'text') e.textContent = attrs[k]; else if (k in e && k !== 'list') e[k] = attrs[k]; else e.setAttribute(k, attrs[k]); }
    (kids || []).forEach(function (c) { if (c) e.appendChild(c); });
    return e;
  };

  // ---------------------------------------------------------------- Speicher
  function load() {
    try {
      var d = JSON.parse(localStorage.getItem(KEY));
      if (d && Array.isArray(d.lists)) return d;
    } catch (e) { /* kein Speicher: Listen gelten nur für diese Sitzung */ }
    return { lists: [], active: null };
  }
  var S = load();
  function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { /* s. o. */ } }
  function active() { return S.lists.filter(function (l) { return l.id === S.active; })[0] || S.lists[0] || null; }
  function newList(name, entries) {
    var l = { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), name: name, entries: entries || [] };
    S.lists.push(l); S.active = l.id;
    return l;
  }
  function addEntry(l, p, n) {
    var e = l.entries.filter(function (x) { return x.p === p; })[0];
    if (e) { e.n += n; e.done = false; } else l.entries.push({ p: p, n: n, done: false });
  }

  // ---------------------------------------------------------------- Hinweis
  var toast, toastTimer;
  function notice(text) {
    if (!toast) { toast = el('div', { className: 'item-toast', role: 'status' }); document.body.appendChild(toast); }
    toast.textContent = '';
    toast.appendChild(el('span', { text: text + ' ' }));
    toast.appendChild(el('a', { href: listsHref, text: T.view }));
    (dlg && dlg.open ? dlg : document.body).appendChild(toast);   // im geöffneten Dialog läge er sonst dahinter
    toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toast.hidden = true; }, 5000);
  }

  // ---------------------------------------------------------------- Knöpfe an Gegenständen und Rezepten
  function enhance(root) {
    var secs = root.matches && root.matches('section.item') ? [root] : [].slice.call(root.querySelectorAll('section.item'));
    secs.forEach(function (sec) {
      var h = sec.querySelector('h2');
      if (h && !h.querySelector('.list-btn')) h.appendChild(el('button', { type: 'button', className: 'list-btn', 'data-add': sec.id, text: '+ ' + T.add }));
      [].forEach.call(sec.querySelectorAll('li[data-recipe]'), function (li) {
        if (!li.querySelector('.list-btn')) li.appendChild(el('button', { type: 'button', className: 'list-btn', 'data-mk': sec.id, text: T.fromRecipe }));
      });
    });
  }
  function itemTitle(sec) {
    var h = sec.querySelector('h2').cloneNode(true);
    [].forEach.call(h.querySelectorAll('button'), function (b) { b.remove(); });
    return h.textContent.trim();
  }
  document.addEventListener('click', function (ev) {
    var b = ev.target.closest && ev.target.closest('.list-btn');
    if (!b) return;
    var l;
    if (b.hasAttribute('data-add')) {
      l = active() || newList(T.defaultName);
      addEntry(l, b.getAttribute('data-add'), 1);
      save(); render();
      notice(fill(T.added, { list: l.name }));
    } else if (b.hasAttribute('data-mk')) {
      var li = b.closest('li'), sec = b.closest('section.item');
      l = newList(itemTitle(sec), []);
      li.getAttribute('data-recipe').split(',').forEach(function (x) { var a = x.split(':'); addEntry(l, a[0], +a[1] || 1); });
      save(); render();
      if (isIndex) { if (dlg.open) dlg.close(); panel.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
      else notice(fill(T.created, { list: l.name }));
    }
  });
  enhance(document);
  if (!isIndex) { render(); return; }

  // ---------------------------------------------------------------- Übersicht: Katalog aus dem Raster
  var CAT = {};
  [].forEach.call(document.querySelectorAll('.item-grid a'), function (a) {
    var img = a.querySelector('img');
    CAT[a.hash.slice(1)] = { name: a.textContent.trim(), href: a.getAttribute('href'), cat: a.getAttribute('href').split('/')[0], icon: img ? img.getAttribute('src') : '' };
  });

  // ---------------------------------------------------------------- Listen
  function render() {
    if (!isIndex) return;
    panel.textContent = '';
    panel.hidden = false;
    panel.appendChild(el('h2', { text: T.title }));
    var cur = active();
    var name = el('input', { type: 'text', placeholder: T.newPh, maxLength: 60, 'aria-label': T.newPh });
    var form = el('form', { className: 'lists-new' }, [name, el('button', { type: 'submit', className: 'list-btn', text: T.create })]);
    form.addEventListener('submit', function (ev) {
      ev.preventDefault();
      newList(name.value.trim() || T.defaultName); save(); render();
    });
    if (!cur) {
      panel.appendChild(el('p', { className: 'dim', text: T.empty }));
      panel.appendChild(form);
      return;
    }
    var sel = el('select', { 'aria-label': T.choose });
    S.lists.forEach(function (l) { sel.appendChild(el('option', { value: l.id, text: l.name + ' (' + l.entries.filter(function (e) { return !e.done; }).length + ')', selected: l.id === cur.id })); });
    sel.addEventListener('change', function () { S.active = sel.value; save(); render(); });
    var del = el('button', { type: 'button', className: 'list-btn danger', text: T.del });
    del.addEventListener('click', function () {
      if (!confirm(fill(T.confirmDel, { list: cur.name }))) return;
      S.lists = S.lists.filter(function (l) { return l !== cur; }); S.active = S.lists.length ? S.lists[0].id : null; save(); render();
    });
    panel.appendChild(el('div', { className: 'lists-bar' }, [sel, del, form]));
    if (!cur.entries.length) { panel.appendChild(el('p', { className: 'dim', text: T.emptyList })); return; }
    var done = cur.entries.filter(function (e) { return e.done; }).length;
    panel.appendChild(el('p', { className: 'dim lists-progress', text: fill(T.progress, { done: done, n: cur.entries.length }) }));
    var ul = el('ul', { className: 'lists-entries' });
    cur.entries.forEach(function (e) {
      var c = CAT[e.p] || { name: e.p, href: '', icon: '' };
      var cb = el('input', { type: 'checkbox', checked: !!e.done, 'aria-label': c.name });
      cb.addEventListener('change', function () { e.done = cb.checked; save(); render(); });
      var num = el('input', { type: 'number', min: 1, max: 99999, value: e.n, 'aria-label': T.amount });
      num.addEventListener('change', function () { e.n = Math.max(1, Math.round(+num.value) || 1); save(); });
      var rm = el('button', { type: 'button', className: 'list-rm', title: T.remove, 'aria-label': T.remove, text: '×' });
      rm.addEventListener('click', function () { cur.entries = cur.entries.filter(function (x) { return x !== e; }); save(); render(); });
      var link = el(c.href ? 'a' : 'span', c.href ? { href: c.href } : {}, [c.icon ? el('img', { className: 'item-icon', src: c.icon, alt: '', width: 24, height: 24 }) : null, document.createTextNode(c.name)]);
      ul.appendChild(el('li', { className: e.done ? 'done' : '' }, [cb, num, el('span', { className: 'x', text: '×' }), link, rm]));
    });
    panel.appendChild(ul);
  }
  render();
  if (location.hash === '#lists') panel.scrollIntoView();

  // ---------------------------------------------------------------- Detailansicht
  var body = dlg.querySelector('.item-dialog-body'), docs = {};
  function page(cat) {
    if (!docs[cat]) {
      docs[cat] = fetch(cat + '/').then(function (r) { if (!r.ok) throw new Error(r.status); return r.text(); })
        .then(function (t) { return new DOMParser().parseFromString(t, 'text/html'); });
    }
    return docs[cat];
  }
  function openItem(p, push) {
    var c = CAT[p];
    if (!c) return false;
    var base = new URL(c.cat + '/', location.href);
    page(c.cat).then(function (doc) {
      var src = doc.getElementById(p);
      if (!src) throw new Error('missing');
      var sec = document.importNode(src, true);
      sec.removeAttribute('data-n'); sec.removeAttribute('data-s');
      [].forEach.call(sec.querySelectorAll('[href]'), function (a) { a.setAttribute('href', new URL(a.getAttribute('href'), base).href); });
      [].forEach.call(sec.querySelectorAll('[src]'), function (a) { a.setAttribute('src', new URL(a.getAttribute('src'), base).href); });
      body.textContent = '';
      body.appendChild(sec);
      enhance(sec);
      if (!dlg.open) dlg.showModal();
      dlg.scrollTop = 0;
      if (push !== false && location.hash !== '#' + p) history.pushState(null, '', '#' + p);
    }).catch(function () { location.href = c.href; });
    return true;
  }
  dlg.addEventListener('close', function () { if (CAT[location.hash.slice(1)]) history.pushState(null, '', location.pathname + location.search); });
  dlg.addEventListener('click', function (ev) { if (ev.target === dlg || ev.target.closest('.item-dialog-close')) dlg.close(); });
  document.addEventListener('click', function (ev) {
    if (ev.defaultPrevented || ev.button || ev.ctrlKey || ev.metaKey || ev.shiftKey || ev.altKey) return;
    var a = ev.target.closest && ev.target.closest('a[href]');
    if (!a || !a.hash) return;
    var p = a.hash.slice(1), c = CAT[p];
    if (c && new URL(c.cat + '/', location.href).pathname === a.pathname.replace(/index\.html$/, '') && openItem(p)) ev.preventDefault();
  });
  function fromHash() {
    var p = location.hash.slice(1);
    if (CAT[p]) openItem(p, false); else if (dlg.open) dlg.close();
  }
  window.addEventListener('popstate', fromHash);
  fromHash();
})();
