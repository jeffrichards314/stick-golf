/* My Holes (localStorage), the Editor hub / templates / import / share screens, shared-hole play and #hole= links.
 * Works with game/editor.js (the canvas editor) and game/holecode.js (share codes). */
(function () {
  'use strict';
  const G = window.GOLF = window.GOLF || {};
  const K = G.UI && G.UI.kit, HS = G.HoleSchema, HC = G.HoleCode;
  if (!K || !HS || !HC) { console.warn('[myholes] missing modules'); return; }
  const { SCREENS, render, on, show, click, scr, keepScroll, esc, ic, topbar, toast, copyText, swatch } = K;
  const App = () => G.App;
  const KEY = 'myholes', MAX_HOLES = 60;
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const DPR = () => Math.min(2, window.devicePixelRatio || 1);
  const uid = () => 'h' + Date.now().toString(36) + Math.floor(Math.random() * 1e6).toString(36);
  const gmName = (t) => { const I = G.Manifest && G.Manifest.GIMMICK_INFO && G.Manifest.GIMMICK_INFO[t]; return (I && I.name) || t; };

  // ======================================================================== storage ========================================================================
  function load() {
    const db = G.Store.get(KEY, null);
    if (!db || !Array.isArray(db.items)) return { v: 1, items: [] };
    return db;
  }
  const M = G.MyHoles = {
    list() { return load().items.slice(); },
    get(id) { return load().items.find((i) => i.id === id) || null; },
    count() { return load().items.length; },
    summary() { const n = load().items.length; return n ? n + ' hole' + (n > 1 ? 's' : '') + ' · make & share' : 'Make & share holes'; },
    newId: uid,
    // a fresh (unsaved) entry for the editor
    create(hole) { return { id: uid(), saved: false, hole }; },
    save(entry, hole) {
      const db = load();
      let c; try { c = HC.canon(hole); } catch (e) { console.warn('[myholes] canon', e); return false; }
      let it = db.items.find((i) => i.id === entry.id);
      if (!it) { if (db.items.length >= MAX_HOLES) { toast('My Holes is full (' + MAX_HOLES + ') — delete one first', 'warn', 3000); return false; } it = { id: entry.id, created: Date.now() }; db.items.unshift(it); }
      it.name = c.name; it.par = c.par; it.verified = !!c.bot; it.gm = c.gm.length; it.updated = Date.now(); it.hole = c;
      return G.Store.set(KEY, db);
    },
    remove(id) { const db = load(); db.items = db.items.filter((i) => i.id !== id); G.Store.set(KEY, db); },
    rename(id, name) { const db = load(), it = db.items.find((i) => i.id === id); if (!it) return; it.name = String(name).slice(0, HS.LIM.NAME) || 'Untitled hole'; it.hole.name = it.name; it.updated = Date.now(); G.Store.set(KEY, db); },
    duplicate(id) {
      const db = load(), it = db.items.find((i) => i.id === id); if (!it) return null;
      if (db.items.length >= MAX_HOLES) { toast('My Holes is full', 'warn'); return null; }
      const c = clone(it); c.id = uid(); c.name = (it.name + ' (copy)').slice(0, HS.LIM.NAME); c.hole.name = c.name; c.hole.seed = 1 + Math.floor(Math.random() * 2e9); c.created = c.updated = Date.now();
      db.items.unshift(c); G.Store.set(KEY, db); return c;
    },
    // hole -> editor (new entry, unsaved until the first edit)
    editCopy(hole, name) {
      let h; try { h = HC.canon(hole); } catch (e) { toast('Could not open that hole', 'warn'); return false; }
      if (name) h.name = name.slice(0, HS.LIM.NAME);
      h.seed = 1 + Math.floor(Math.random() * 2e9); h.id = 'custom';
      if (h.auto === undefined) h.auto = !h.bot;
      G.Editor.open(M.create(h), h); return true;
    },
    editNew() { return M.editCopy(HS.blankHole(), 'Untitled hole'); },
    edit(id) {
      const it = M.get(id); if (!it) { toast('That hole is gone', 'warn'); return false; }
      const h = clone(it.hole); if (h.auto === undefined) h.auto = !h.bot;
      G.Editor.open({ id: it.id, saved: true }, h); return true;
    },
    // ---- codes ----
    async decodeText(text) {
      const code = HC.parseInput(text);
      if (!code) throw new Error('That does not look like a hole code or link');
      return HC.decode(code);
    },
    editRunCopy() { const r = App().run; if (!r || r.kind !== 'custom') return; const h = clone(r.holes[0]); App().quitToMenu('editorHub'); M.editCopy(h, h.name + ' (copy)'); },
    shareInto, play, openCode, checkHash,
  };

  // ======================================================================== thumbnails ========================================================================
  function drawThumbs(sc, items, sel) {
    const cvs = [...sc.querySelectorAll(sel || 'canvas.hg-cv')];
    let k = 0;
    const step = () => {
      const t0 = performance.now();
      while (k < cvs.length && performance.now() - t0 < 12) {
        const cv = cvs[k], h = items[k]; k++; if (!h) continue;
        const w = cv.clientWidth || 160, hh = cv.clientHeight || 90, d = DPR();
        cv.width = Math.round(w * d); cv.height = Math.round(hh * d);
        const ctx = cv.getContext('2d'); ctx.setTransform(d, 0, 0, d, 0, 0);
        try { G.Render.drawPreview(ctx, h, G.Run.themeFor(h), w, hh); } catch (e) { /* preview optional */ }
      }
      if (k < cvs.length && sc.isConnected) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }
  const badge = (verified) => verified ? '<span class="vbadge ok" title="A bot proved this hole can be beaten">' + ic('shield') + 'Verified</span>' : '<span class="vbadge" title="Nobody has proven this hole can be beaten">' + ic('warn') + 'Unverified</span>';
  const ago = (t) => { const s = Math.max(1, Math.round((Date.now() - t) / 1000)); if (s < 90) return 'just now'; const m = Math.round(s / 60); if (m < 90) return m + ' min ago'; const h = Math.round(m / 60); if (h < 36) return h + ' h ago'; return Math.round(h / 24) + ' d ago'; };

  // ======================================================================== screens ========================================================================
  SCREENS.editorHub = function (args) {
    const n = M.count();
    render(topbar('Hole Editor', 'Build a hole, prove it can be beaten, share it', { noStars: true }) + '<div class="page narrow">' +
      '<button class="tile hero" data-act="new"><span class="tile-ic">' + ic('plus') + '</span><span class="hero-b"><span class="tile-l">New hole</span><span class="tile-s">Start from a blank course or copy any hole</span></span><span class="hero-go">' + ic('next') + '</span></button>' +
      '<div class="tgrid two">' +
        '<button class="tile" data-act="mine"><span class="tile-ic">' + ic('folder') + '</span><span class="tile-l">My Holes</span><span class="tile-s">' + (n ? n + ' saved on this device' : 'Nothing saved yet') + '</span></button>' +
        '<button class="tile" data-act="import"><span class="tile-ic">' + ic('download') + '</span><span class="tile-l">Play a shared hole</span><span class="tile-s">Paste a code or link</span></button>' +
      '</div>' +
      '<div class="panel mh-how"><div class="panel-h"><h3>' + ic('bulb') + 'How it works</h3></div>' +
      '<ol class="mh-steps"><li><b>Build</b> the ground, add solids, drop the tee and cup, then sprinkle any of the 59 gimmicks.</li><li><b>Test play</b> it right away with unlimited strokes.</li><li><b>Prove it’s beatable</b> — the bot searches for a solution. Only verified holes carry the badge.</li><li><b>Share</b> a link or code. Anyone can open it and play, or edit their own copy.</li></ol></div>' +
      '</div>', 'list');
    on({ back: () => show('title'), new: () => { click(); show('newHole'); }, mine: () => { click(); show('myHoles'); }, import: () => { click(); show('importHole'); } });
  };

  // ----- templates -----
  SCREENS.newHole = function () {
    render(topbar('New hole', 'Pick a starting point', { noStars: true }) + '<div class="page narrow">' +
      '<button class="tile hero" data-act="blank"><span class="tile-ic">' + ic('mountain') + '</span><span class="hero-b"><span class="tile-l">Blank flat hole</span><span class="tile-s">Fairway, a green, tee and cup — ready to shape</span></span><span class="hero-go">' + ic('next') + '</span></button>' +
      '<div class="tgrid two">' +
        '<button class="tile" data-act="course"><span class="tile-ic">' + ic('flag') + '</span><span class="tile-l">Copy a course hole</span><span class="tile-s">Any of the 1,080 baked holes</span></button>' +
        '<button class="tile" data-act="tut"><span class="tile-ic">' + ic('grad') + '</span><span class="tile-l">Copy a tutorial hole</span><span class="tile-s">One small hole per gimmick</span></button>' +
      '</div></div>', 'list');
    on({ back: () => show('editorHub'), blank: () => { click(); M.editNew(); }, course: () => { click(); show('tplCourses'); }, tut: () => { click(); show('tplTutorials'); } });
  };
  SCREENS.tplCourses = function (args) {
    const Pg = G.Progress, list = Pg.courses().filter((c) => Pg.baked(c.id));
    render(topbar('Copy a course hole', 'Pick a course', { noStars: true }) + '<div class="page"><div class="cgrid">' + list.map((c, k) =>
      '<div class="ccard" role="button" tabindex="0" data-act="c" data-id="' + esc(c.id) + '" style="--d:' + Math.min(0.4, k * 0.012) + 's"><div class="cc-art">' + swatch(c) + '<span class="cc-num">' + Pg.courseNumber(c) + '</span></div><div class="cc-body"><div class="cc-name">' + esc(c.name) + '</div><div class="cc-gim">' + K.gimBadge(K.courseGim(c)) + '</div></div></div>').join('') + '</div></div>', 'list');
    keepScroll(args);
    on({ back: () => show('newHole'), c: (d) => { click(); show('tplHoles', { id: d.id }); } });
  };
  SCREENS.tplHoles = function (args) {
    const Pg = G.Progress, c = Pg.def(args.id);
    if (!c) { show('tplCourses'); return; }
    const pars = Pg.pars(c.id) || [], names = (G.BAKED && G.BAKED[c.id] && G.BAKED[c.id].names) || [], N = Pg.holeCount(c.id);
    let html = topbar('#' + Pg.courseNumber(c) + ' ' + c.name, 'Tap a hole to copy it', { noStars: true }) + '<div class="page"><div class="hole-grid">';
    for (let i = 0; i < N; i++) html += '<button class="hg" data-act="hole" data-i="' + i + '"><canvas class="hg-cv" data-i="' + i + '"></canvas><span class="hg-b"><b>' + (i + 1) + '</b><span class="hg-n">' + esc(names[i] || 'Hole ' + (i + 1)) + '</span><small>Par ' + (pars[i] || '?') + '</small></span></button>';
    render(html + '</div></div>', 'list');
    const sc = scr();
    Pg.loadCourse(c.id, (holes) => {
      if (!holes || !sc.isConnected) return;
      sc._holes = holes; drawThumbs(sc, holes);
    });
    on({ back: () => show('tplCourses'), hole: (d) => { const hs = sc._holes; if (!hs) { toast('Still loading…', 'info', 800); return; } click(); const h = hs[+d.i]; M.editCopy(h, (names[+d.i] || h.name || 'Hole') + ' (copy)'); } });
  };
  SCREENS.tplTutorials = function () {
    const T = G.TUTORIALS || {}, packs = ((G.Manifest && G.Manifest.PACKS) || []).filter((p) => p && p.gimmicks);
    let html = topbar('Copy a tutorial hole', 'One small hole per gimmick', { noStars: true }) + '<div class="page">';
    const keys = [];
    (packs.length ? packs : [{ name: 'All', gimmicks: Object.keys(T) }]).forEach((p) => {
      const ts = p.gimmicks.filter((t) => T[t]); if (!ts.length) return;
      html += '<div class="panel"><div class="panel-h"><h3>' + esc(p.name) + '</h3></div><div class="hole-grid">';
      ts.forEach((t) => { keys.push(t); html += '<button class="hg" data-act="hole" data-t="' + t + '"><canvas class="hg-cv" data-i="' + (keys.length - 1) + '"></canvas><span class="hg-b"><span class="hg-n">' + G.UI.gimIcon(t) + ' ' + esc(gmName(t)) + '</span></span></button>'; });
      html += '</div></div>';
    });
    if (!keys.length) html += '<div class="empty">Tutorials are not available.</div>';
    render(html + '</div>', 'list');
    const sc = scr(); drawThumbs(sc, keys.map((t) => T[t]));
    on({ back: () => show('newHole'), hole: (d) => { click(); M.editCopy(T[d.t], gmName(d.t) + ' hole'); } });
  };

  // ----- my holes -----
  SCREENS.myHoles = function (args) {
    const items = M.list();
    let html = topbar('My Holes', items.length + ' saved on this device', { noStars: true, right: '<button class="ibtn" data-act="new" aria-label="New hole" title="New hole">' + ic('plus') + '</button>' }) + '<div class="page">';
    if (!items.length) html += '<div class="empty">No holes yet.<br><small>Build one and it saves here automatically.</small><br><br><button class="btn primary" data-act="new">' + ic('plus') + 'New hole</button></div>';
    else html += '<div class="mh-grid">' + items.map((it) =>
      '<div class="mh-card" data-id="' + esc(it.id) + '"><button class="mh-thumb" data-act="edit" data-id="' + esc(it.id) + '" aria-label="Edit ' + esc(it.name) + '"><canvas class="hg-cv"></canvas></button>' +
      '<div class="mh-b"><div class="mh-t"><b>' + esc(it.name) + '</b>' + badge(it.verified) + '</div><small>Par ' + it.par + ' · ' + it.gm + ' gimmick' + (it.gm === 1 ? '' : 's') + ' · ' + ago(it.updated) + '</small>' +
      '<div class="mh-act"><button class="btn sm primary" data-act="edit" data-id="' + esc(it.id) + '">' + ic('edit') + 'Edit</button><button class="btn sm" data-act="play" data-id="' + esc(it.id) + '">' + ic('play') + 'Play</button>' +
      '<button class="ibtn sm" data-act="share" data-id="' + esc(it.id) + '" aria-label="Share" title="Share">' + ic('share') + '</button><button class="ibtn sm" data-act="ren" data-id="' + esc(it.id) + '" aria-label="Rename" title="Rename">' + ic('card') + '</button>' +
      '<button class="ibtn sm" data-act="dup" data-id="' + esc(it.id) + '" aria-label="Duplicate" title="Duplicate">' + ic('copy') + '</button><button class="ibtn sm" data-act="del" data-id="' + esc(it.id) + '" aria-label="Delete" title="Delete">' + ic('trash') + '</button></div></div></div>').join('') + '</div>';
    render(html + '</div>', 'list');
    keepScroll(args);
    const sc = scr(); drawThumbs(sc, items.map((i) => i.hole), 'canvas.hg-cv');
    const keep = () => ({ scroll: sc.scrollTop });
    on({
      back: () => show('editorHub'), new: () => { click(); show('newHole'); },
      edit: (d) => { click(); M.edit(d.id); },
      play: (d) => { click(); const it = M.get(d.id); if (it) play(clone(it.hole), { mode: 'shared', local: true, ret: 'myHoles' }); },
      share: (d) => { click(); show('shareHole', { id: d.id }); },
      dup: (d) => { click(); if (M.duplicate(d.id)) { toast('Duplicated', 'info', 900); show('myHoles', keep()); } },
      ren: (d) => {
        const it = M.get(d.id); if (!it) return;
        const card = sc.querySelector('.mh-card[data-id="' + d.id + '"] .mh-t'); if (!card) return;
        card.innerHTML = '<input class="mh-in" maxlength="40" value="' + esc(it.name) + '" aria-label="New name"><button class="ibtn sm" data-act="rename-ok" data-id="' + esc(d.id) + '" aria-label="Save name">' + ic('check') + '</button>';
        const inp = card.querySelector('input'); inp.focus(); inp.select();
        inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') { M.rename(d.id, inp.value); show('myHoles', keep()); } else if (e.key === 'Escape') show('myHoles', keep()); e.stopPropagation(); });
      },
      'rename-ok': (d) => { const inp = sc.querySelector('.mh-card[data-id="' + d.id + '"] .mh-in'); if (inp) M.rename(d.id, inp.value); show('myHoles', keep()); },
      del: (d, elb) => {
        if (!elb.classList.contains('armed')) { elb.classList.add('armed'); elb.innerHTML = ic('trash') + '<span>Sure?</span>'; elb.style.width = 'auto'; K.A().sfx('uiback'); return; }
        click(); M.remove(d.id); show('myHoles', keep());
      },
    });
  };

  // ----- share -----
  SCREENS.shareHole = function (args) {
    const it = M.get(args.id); if (!it) { show('myHoles'); return; }
    render(topbar('Share “' + esc(it.name) + '”', '', { noStars: true }) + '<div class="page narrow"><div class="panel"><div class="ed-share" id="mh-share"><p class="ed-note c">Encoding…</p></div></div></div>', 'list');
    shareInto(scr().querySelector('#mh-share'), clone(it.hole), {});
    on({ back: () => show('myHoles') });
  };
  // fills `box` with link + code + copy buttons for `hole`
  async function shareInto(box, hole, opts) {
    try {
      let h = HC.canon(hole);
      const ver = !!(h.bot && HC.check(h).verified);
      if (!ver) delete h.bot;
      const code = await HC.encode(h, { bot: ver });
      const link = HC.url(code, App() && App().SHARE_URL);
      if (!box.isConnected) return;
      box.innerHTML =
        '<div class="ed-sh-top">' + badge(ver) + '<span class="ed-sh-n">' + esc(h.name) + ' · par ' + h.par + '</span></div>' +
        (ver ? '<p class="ed-note c">This code includes the bot’s solution, so anyone opening it sees the <b>Verified</b> badge (it is re-checked on their device).</p>' : '<p class="ed-note c">This hole is <b>not verified</b>, so the code carries no badge. Use “Prove it’s beatable” in the editor to verify it.</p>') +
        '<div class="ed-fr col"><label>Link</label><div class="ed-copy"><input readonly class="ed-ro" value="' + esc(link) + '" aria-label="Share link"><button class="btn sm primary" data-sh="link">' + ic('link') + 'Copy link</button></div></div>' +
        '<div class="ed-fr col"><label>Code <small>' + code.length + ' characters</small></label><div class="ed-copy"><textarea readonly class="ed-ro" rows="3" aria-label="Hole code">' + esc(code) + '</textarea><button class="btn sm" data-sh="code">' + ic('copy') + 'Copy code</button></div></div>' +
        (link.length > HC.URL_WARN ? '<p class="ed-note warn">' + ic('warn') + 'This link is very long — some chat apps cut links off. Sharing the code instead is safer.</p>' : '') +
        (navigator.share ? '<div class="ed-btnrow"><button class="btn sm" data-sh="native">' + ic('share') + 'Share…</button></div>' : '');
      box.querySelectorAll('textarea,input.ed-ro').forEach((x) => x.addEventListener('focus', () => x.select()));
      box.addEventListener('click', (e) => {
        const b = e.target.closest('[data-sh]'); if (!b) return; e.stopPropagation(); K.click();
        if (b.dataset.sh === 'link') copyText(link, 'Link copied'); else if (b.dataset.sh === 'code') copyText(code, 'Code copied');
        else if (navigator.share) navigator.share({ title: h.name, text: 'Try my Stick Golf hole “' + h.name + '”', url: link }).catch(() => { /* cancelled */ });
      });
    } catch (e) { console.error('[share]', e); if (box.isConnected) box.innerHTML = '<p class="ed-note c">Could not encode this hole (' + esc(e.message) + ').</p>'; }
  }

  // ----- import / play shared -----
  SCREENS.importHole = function (args) {
    args = args || {};
    render(topbar('Play a shared hole', 'Paste a code or link', { noStars: true }) + '<div class="page narrow"><div class="panel">' +
      '<textarea class="mh-code" id="mh-code" rows="4" spellcheck="false" autocomplete="off" placeholder="Paste a hole code or a link like https://…/#hole=…">' + esc(args.text || '') + '</textarea>' +
      '<div class="ed-btnrow"><button class="btn primary" data-act="load">' + ic('download') + 'Load hole</button><button class="btn ghost" data-act="paste">' + ic('copy') + 'Paste from clipboard</button></div>' +
      '<div id="mh-msg" class="ed-note c' + (args.error ? ' warn' : '') + '">' + (args.error ? ic('warn') + esc(args.error) : 'Codes can be pasted whole, or as the full link.') + '</div></div>' +
      '<div id="mh-prev"></div></div>', 'list');
    const sc = scr(), ta = sc.querySelector('#mh-code'), msg = sc.querySelector('#mh-msg'), prev = sc.querySelector('#mh-prev');
    let cur = null;
    const doLoad = async () => {
      const text = ta.value; prev.innerHTML = ''; cur = null;
      if (!text.trim()) { msg.className = 'ed-note c'; msg.textContent = 'Paste a code first.'; return; }
      msg.className = 'ed-note c'; msg.textContent = 'Decoding…';
      try {
        const r = await M.decodeText(text);
        if (!sc.isConnected) return;
        cur = r; msg.className = 'ed-note c'; msg.textContent = r.warn && r.warn.length ? 'Loaded (' + r.warn.join('; ') + ').' : 'Loaded.';
        const h = r.hole, gms = {}; h.gm.forEach((g) => { gms[g.t] = 1; });
        prev.innerHTML = '<div class="panel mh-prev"><canvas class="hg-cv"></canvas><div class="mh-b"><div class="mh-t"><b>' + esc(h.name) + '</b>' + badge(r.verified) + '</div><small>Par ' + h.par + ' · ' + Math.round(h.w) + ' wide · ' + h.gm.length + ' gimmick' + (h.gm.length === 1 ? '' : 's') + '</small>' +
          '<div class="mh-tags">' + Object.keys(gms).map((t) => '<span class="gbadge"><i>' + G.UI.gimIcon(t) + '</i>' + esc(gmName(t)) + '</span>').join('') + '</div>' +
          '<div class="mh-act"><button class="btn primary" data-act="playit">' + ic('play') + 'Play</button><button class="btn" data-act="copyit">' + ic('edit') + 'Edit a copy</button><button class="btn" data-act="saveit">' + ic('save') + 'Save</button></div></div></div>';
        drawThumbs(sc, [h], 'canvas.hg-cv');
      } catch (e) { msg.className = 'ed-note c warn'; msg.innerHTML = ic('warn') + esc(e.message || 'Could not read that code'); }
    };
    ta.addEventListener('keydown', (e) => e.stopPropagation());
    on({
      back: () => show('editorHub'), load: () => { click(); doLoad(); },
      paste: async () => { click(); try { const t = await navigator.clipboard.readText(); ta.value = t; doLoad(); } catch (e) { toast('Paste with Ctrl/Cmd+V in the box', 'info', 2200); ta.focus(); } },
      playit: () => { if (cur) { click(); play(cur.hole, { mode: 'shared', verified: cur.verified, ret: 'importHole', retArgs: { text: ta.value } }); } },
      copyit: () => { if (cur) { click(); M.editCopy(cur.hole, (cur.hole.name + ' (copy)')); } },
      saveit: () => { if (cur) { click(); const e = M.create(cur.hole); if (M.save(e, cur.hole)) toast('Saved to My Holes', 'info', 1400); } },
    });
    if (args.text && !args.error) doLoad();
  };

  // ======================================================================== play (shared / saved holes) ========================================================================
  function play(hole, opts) {
    opts = opts || {};
    const h = clone(hole); h.id = opts.mode === 'test' ? 'edit-test' : 'shared';
    App().startCustom(h, opts);
  }
  async function openCode(text, how) {
    try {
      const r = await M.decodeText(text);
      play(r.hole, { mode: 'shared', verified: r.verified, warn: r.warn, fromLink: true, ret: 'editorHub' });
      return true;
    } catch (e) {
      console.warn('[hole code]', e);
      G.UI.show('importHole', { text: HC.parseInput(text) || String(text).slice(0, 4000), error: (e && e.message) || 'Could not read that code' });
      return false;
    }
  }
  // #hole=<code> in the URL: play it right away. Returns true when a code was present.
  function checkHash() {
    const m = /[#&]hole=([A-Za-z0-9_-]+)/.exec(location.hash || '');
    if (!m) return false;
    try { history.replaceState(null, '', location.pathname + location.search); } catch (e) { /* file:// may refuse */ }
    if (!G.Store.getSettings().difficulty) G.Store.saveSettings({ difficulty: 'standard' });
    openCode(m[1], 'link');
    return true;
  }
  window.addEventListener('hashchange', () => { if (/[#&]hole=/.test(location.hash)) { const A = App(); if (A && A.session && G.UI) { try { A.quitToMenu('title'); } catch (e) { /* */ } } checkHash(); } });

  // ----- result after finishing a custom hole -----
  SCREENS.customDone = function (args) {
    const r = args.res, lbl = G.Modes.scoreLabel(args.score, r.par), run = App().run, mode = run && run.custom ? run.custom.mode : 'test';
    const shared = mode === 'shared';
    render('<div class="center-col"><div class="card pop"><div class="card-k">' + ic(shared ? 'users' : 'edit') + (shared ? 'Shared hole' : 'Test play') + ' · ' + esc(args.name || '') + '</div>' +
      '<div class="hd-label ' + lbl.cls + '">' + esc(lbl.text) + '</div>' + K.scoreTiles([['Strokes', r.strokes], ['Par', r.par], ['Time', K.fmtTime(args.time)]]) +
      (shared ? '<div class="ed-sh-top">' + badge(run.custom.verified) + '</div>' : '') +
      '<div class="menu"><button class="btn big primary" data-act="again">' + ic('replay') + 'Play again</button><div class="menu-2">' +
      (shared ? '<button class="btn" data-act="copy">' + ic('edit') + 'Edit a copy</button>' + (run.custom.local ? '' : '<button class="btn" data-act="save">' + ic('save') + 'Save</button>') : '<button class="btn" data-act="back2">' + ic('edit') + 'Back to editor</button>') +
      '<button class="btn ghost" data-act="menu">' + ic('home') + (shared ? 'Done' : 'Menu') + '</button></div></div></div></div>', 'dim');
    on({
      again: () => { click(); App().restartHole(); },
      copy: () => { click(); M.editRunCopy(); },
      save: () => { click(); const h = clone(run.holes[0]); if (M.save(M.create(h), h)) toast('Saved to My Holes', 'info', 1400); },
      back2: () => { click(); App().quitToMenu(); }, menu: () => { click(); App().quitToMenu(); }, back: () => App().quitToMenu(),
    });
  };
})();
