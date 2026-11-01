/* Hole editor — DOM: top bar, tool rail, tool panel, property panel, time bar, dialogs. Core logic lives in game/editor.js. */
(function () {
  'use strict';
  const G = window.GOLF = window.GOLF || {};
  const E = G.Editor, HS = G.HoleSchema, HC = G.HoleCode;
  if (!E || !HS) return;
  const S = E.S, H = E._h;
  const esc = (s) => String(s === undefined || s === null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const ic = (n, c) => G.UI.icon(n, c);
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const r3 = HS.r3, rnd = Math.round;
  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => [...(root || document).querySelectorAll(sel)];
  const UI = E.ui = {};
  let root = null, el = {}, openPacks = new Set(), packsInit = false, search = '', posOpen = false;

  const TOOLS = [
    { id: 'select', icon: 'cursor', label: 'Select', key: 'V' },
    { id: 'ground', icon: 'mountain', label: 'Ground', key: 'L' },
    { id: 'solid', icon: 'shape', label: 'Solids', key: 'P' },
    { id: 'tee', icon: 'tee', label: 'Tee & cup', key: 'C' },
    { id: 'gimmick', icon: 'sparkle', label: 'Gimmicks', key: 'A' },
    { id: 'hole', icon: 'settings', label: 'Hole', key: 'H' },
  ];
  const GM_INFO = (t) => (G.Manifest && G.Manifest.GIMMICK_INFO && G.Manifest.GIMMICK_INFO[t]) || {};
  const gmName = (t) => GM_INFO(t).name || t;
  const gmIcon = (t) => G.UI.gimIcon(t);

  // ======================================================================== build ========================================================================
  UI.build = function () {
    if (root) return;
    root = document.createElement('div');
    root.id = 'editor'; root.className = 'ed hidden';
    root.innerHTML =
      '<header class="ed-top">' +
        '<button class="ibtn" data-ed="exit" aria-label="Back to the menu" title="Back to the menu">' + ic('back') + '</button>' +
        '<input class="ed-name" data-in="name" maxlength="40" spellcheck="false" aria-label="Hole name" placeholder="Name your hole">' +
        '<div class="ed-top-mid"><button class="ibtn" data-ed="undo" aria-label="Undo" title="Undo (Ctrl+Z)">' + ic('undo') + '</button><button class="ibtn" data-ed="redo" aria-label="Redo" title="Redo (Ctrl+Shift+Z)">' + ic('redo') + '</button></div>' +
        '<button class="ed-chip ok" data-ed="issues" title="Problems with this hole"></button>' +
        '<div class="ed-top-r">' +
          '<button class="btn sm" data-ed="verify" title="Let the bot prove this hole can be beaten">' + ic('shield') + '<span>Prove it’s beatable</span></button>' +
          '<button class="btn sm primary" data-ed="test" title="Play this hole now (Ctrl+Enter)">' + ic('play') + '<span>Test play</span></button>' +
          '<button class="btn sm" data-ed="share" title="Get a share code and link">' + ic('share') + '<span>Share</span></button>' +
        '</div>' +
      '</header>' +
      '<nav class="ed-rail" aria-label="Tools"></nav>' +
      '<section class="ed-tool"></section>' +
      '<div class="ed-stage"><canvas class="ed-cv" aria-label="Hole canvas"></canvas><div class="ed-hint hidden"></div>' +
        '<div class="ed-bar"></div></div>' +
      '<aside class="ed-props"></aside>' +
      '<div class="ed-modal hidden" role="dialog" aria-modal="true"></div>';
    document.getElementById('app').appendChild(root);
    el = { top: $('.ed-top', root), name: $('.ed-name', root), chip: $('.ed-chip', root), rail: $('.ed-rail', root), tool: $('.ed-tool', root), stage: $('.ed-stage', root), cv: $('.ed-cv', root), hint: $('.ed-hint', root), bar: $('.ed-bar', root), props: $('.ed-props', root), modal: $('.ed-modal', root) };
    E.bind(el.cv);
    root.addEventListener('click', onClick);
    root.addEventListener('input', onInput);
    root.addEventListener('change', onChange);
    root.addEventListener('pointerdown', onDown);
    el.modal.addEventListener('pointerdown', (e) => { if (e.target === el.modal && !el.modal.dataset.sticky) UI.closeModal(); });
    // stop panel interactions from reaching the game (keyboard shortcuts are filtered by target in editor.js)
    ['pointerup', 'pointermove'].forEach((t) => root.addEventListener(t, (e) => { if (dial) onDialMove(e); }));
  };

  UI.layout = function () {
    if (!root) return;
    const w = window.innerWidth, h = window.innerHeight;
    const mode = w >= 1180 && h >= 560 ? 'wide' : w > h && w >= 700 ? 'side' : 'tall';
    if (root.dataset.mode !== mode) { root.dataset.mode = mode; if (!root.dataset.sheet) root.dataset.sheet = 'tool'; changed('all'); }
  };
  const changed = (...f) => E.changed(...f);
  const sheet = () => root.dataset.sheet || 'tool';
  function setSheet(v) { root.dataset.sheet = v; changed('props'); setTimeout(() => { E.measure(); }, 0); }
  UI.setSheet = setSheet;

  // ======================================================================== sync ========================================================================
  UI.sync = function (force) {
    if (!root) return;
    const f = S.flags; if (force) f.all = true;
    if (f.all) { f.top = f.tool = f.props = f.hole = f.rail = f.bar = f.hint = true; }
    if (f.top || f.hole) renderTop();
    if (f.rail) renderRail();
    if (f.tool || f.hole || f.outline) { if (!(document.activeElement && el.tool.contains(document.activeElement) && document.activeElement.matches('input[type=text],input[type=search]'))) renderTool(); else if (f.outline) renderOutlineOnly(); }
    if (f.props) renderProps(); else if (f.vals) syncVals();
    if (f.bar || f.time) renderBar();
    if (f.hint || f.tool) renderHint();
    if (f.modal) renderModal(); else if (f['modal-progress']) renderModalProgress();
    S.flags = {};
    if (f.all || f.rail) requestAnimationFrame(E.measure);
  };
  UI.modalOpen = () => !el.modal.classList.contains('hidden');
  UI.closeModal = function () { el.modal.classList.add('hidden'); el.modal.innerHTML = ''; delete el.modal.dataset.sticky; modalKind = null; if (S.ver && S.ver.done) S.ver = null; };
  let modalKind = null;
  UI.modal = function (html, kind, sticky) { el.modal.innerHTML = html; el.modal.classList.remove('hidden'); modalKind = kind || 'misc'; if (sticky) el.modal.dataset.sticky = '1'; else delete el.modal.dataset.sticky; };

  // ======================================================================== top bar / rail ========================================================================
  function renderTop() {
    if (document.activeElement !== el.name) el.name.value = S.hole.name || '';
    $('[data-ed=undo]', root).classList.toggle('disabled', !S.undo.length);
    $('[data-ed=redo]', root).classList.toggle('disabled', !S.redo.length);
    const errs = S.issues.filter((i) => i.sev === 'err').length, warns = S.issues.filter((i) => i.sev === 'warn').length;
    const v = E.isVerified();
    el.chip.className = 'ed-chip ' + (errs ? 'bad' : warns ? 'warn' : v ? 'ok verified' : 'ok');
    el.chip.innerHTML = errs ? ic('warn') + '<b>' + errs + '</b><span>problem' + (errs > 1 ? 's' : '') + '</span>' : warns ? ic('warn') + '<b>' + warns + '</b><span>heads-up' + (warns > 1 ? 's' : '') + '</span>' : v ? ic('shield') + '<span>Verified</span>' : ic('check') + '<span>Valid</span>';
    $('[data-ed=share]', root).classList.toggle('disabled', errs > 0);
    $('[data-ed=test]', root).classList.toggle('disabled', errs > 0);
    $('[data-ed=verify]', root).classList.toggle('disabled', errs > 0);
  }
  function renderRail() {
    el.rail.innerHTML = TOOLS.map((t) => {
      const on = S.tool === t.id || (t.id === 'tee' && S.tool === 'cup') || (t.id === 'gimmick' && S.tool === 'gimmick');
      return '<button class="ed-rb' + (on ? ' on' : '') + '" data-ed="tool" data-t="' + t.id + '" aria-pressed="' + on + '" title="' + t.label + ' (' + t.key + ')">' + ic(t.icon) + '<span>' + t.label + '</span></button>';
    }).join('');
  }

  // ======================================================================== tool panel ========================================================================
  const surfBtn = (s, cur, act) => '<button class="schip' + (cur === s.c ? ' on' : '') + '" data-ed="' + act + '" data-c="' + s.c + '" style="--c:' + s.col + '" title="' + esc(s.name) + '"><i></i><span>' + esc(s.name) + '</span></button>';
  function surfPalette(cur, act, groups) {
    const gs = groups || ['Ground', 'Special', 'Hazard'];
    return gs.map((g) => '<div class="ed-sg"><h4>' + g + '</h4><div class="schips">' + HS.SURFS.filter((s) => s.g === g).map((s) => surfBtn(s, cur, act)).join('') + '</div></div>').join('');
  }
  function tabsHeader(which) {
    if (root.dataset.mode === 'wide') return '';
    return '<div class="ed-tabs"><button class="' + (which === 'tool' ? 'on' : '') + '" data-ed="sheet" data-s="tool">Tool</button><button class="' + (which === 'props' ? 'on' : '') + '" data-ed="sheet" data-s="props">' + (S.sel ? 'Selected' : 'Properties') + '</button><button class="ed-x" data-ed="sheet" data-s="none" aria-label="Collapse">' + ic('down') + '</button></div>';
  }
  function renderTool() {
    const t = S.tool, h = S.hole;
    let html = tabsHeader('tool');
    if (t === 'select') html += outlineHtml();
    else if (t === 'ground') {
      html += '<h3 class="ed-h">' + ic('mountain') + 'Ground</h3>' +
        '<div class="ed-seg"><button class="' + (!S.paint ? 'on' : '') + '" data-ed="paint" data-v="0">' + ic('cursor') + 'Edit points</button><button class="' + (S.paint ? 'on' : '') + '" data-ed="paint" data-v="1">' + ic('edit') + 'Paint surface</button></div>' +
        '<p class="ed-note">' + (S.paint ? 'Pick a surface, then tap or drag along the ground to paint it.' : 'Tap the ground line to add a point and drag it. Drag points to shape the terrain. Select a point to delete it.') + '</p>' +
        (S.paint ? '<div class="ed-sub">Brush</div>' + surfPalette(S.brush, 'brush') : '<div class="ed-sub">Quick</div><div class="ed-btnrow"><button class="btn sm" data-ed="makeGreen">' + ic('flag') + 'Green under cup</button><button class="btn sm" data-ed="levelTee">' + ic('tee') + 'Level under tee</button></div>');
    } else if (t === 'solid') {
      html += '<h3 class="ed-h">' + ic('shape') + 'Solids</h3><p class="ed-note">Solid shapes: walls, ledges, caves, floating islands. Corners can be dragged; tap a “+” to add one. Each edge can have its own surface.</p>' +
        '<div class="ed-btnrow"><button class="btn sm' + (S.drawing ? ' primary' : '') + '" data-ed="drawPoly">' + ic('edit') + 'Draw polygon</button><button class="btn sm" data-ed="box" data-k="box">' + ic('grid') + 'Block</button><button class="btn sm" data-ed="box" data-k="ramp">Ramp</button><button class="btn sm" data-ed="box" data-k="island">Island</button></div>' +
        '<div class="ed-sub">New solids use</div>' + surfPalette(S.sbrush, 'sbrush', ['Ground', 'Special']);
    } else if (t === 'tee' || t === 'cup') {
      html += '<h3 class="ed-h">' + ic('tee') + 'Tee &amp; cup</h3><div class="ed-seg"><button class="' + (t === 'tee' ? 'on' : '') + '" data-ed="tool" data-t="tee">' + ic('tee') + 'Place tee</button><button class="' + (t === 'cup' ? 'on' : '') + '" data-ed="tool" data-t="cup">' + ic('flag') + 'Place cup</button></div>' +
        '<p class="ed-note">Tap (or drag) on the canvas. The ' + (t === 'tee' ? 'tee' : 'cup') + ' drops onto the surface below.</p>' +
        '<label class="ed-sw"><span><b>Auto-level the ground</b><small>Flat tee box + flat green under the cup</small></span>' + sw(S.autoGreen, 'autoGreen') + '</label>' +
        '<div class="ed-btnrow"><button class="btn sm" data-ed="seatTee">' + ic('tee') + 'Rest tee on ground</button><button class="btn sm" data-ed="seatCup">' + ic('flag') + 'Rest cup on ground</button><button class="btn sm" data-ed="makeGreen">Flat green</button></div>' +
        '<div class="ed-fr"><label>Cup width</label><input type="range" min="16" max="80" step="1" value="' + (h.cupW || 30) + '" data-pf="cupW"><input type="number" min="16" max="80" step="1" value="' + (h.cupW || 30) + '" data-pf="cupW"></div>';
    } else if (t === 'gimmick') html += gimmickPalette();
    else if (t === 'hole') html += holePanel();
    el.tool.innerHTML = html;
    el.tool.dataset.t = t;
    paintSliders(el.tool);
    bindPreviewThumbs();
  }
  function renderOutlineOnly() { /* keep typing focus in the search box: skip */ }
  const sw = (on, act, extra) => '<button class="switch' + (on ? ' on' : '') + '" role="switch" aria-checked="' + (on ? 'true' : 'false') + '" data-ed="' + act + '"' + (extra || '') + '><i></i></button>';

  function outlineHtml() {
    const h = S.hole, sel = S.sel || {};
    const row = (icn, label, sub, on, data) => '<button class="ed-or' + (on ? ' on' : '') + '" data-ed="pick" ' + data + '><span class="ic">' + icn + '</span><span class="t"><b>' + esc(label) + '</b>' + (sub ? '<small>' + esc(sub) + '</small>' : '') + '</span></button>';
    let html = '<h3 class="ed-h">' + ic('layers') + 'This hole</h3><p class="ed-note">Tap things on the canvas to select them, drag to move. Drag empty space to pan; pinch or scroll to zoom.</p><div class="ed-list">';
    html += row(ic('tee'), 'Tee', Math.round(h.tee[0]) + ', ' + Math.round(h.tee[1]), sel.k === 'tee', 'data-k="tee"');
    html += row(ic('flag'), 'Cup', Math.round(h.cup[0]) + ', ' + Math.round(h.cup[1]), sel.k === 'cup', 'data-k="cup"');
    html += row(ic('mountain'), 'Ground', h.ground.length / 2 + ' points · ' + Math.round(h.w) + ' wide', sel.k === 'gp' || sel.k === 'gs', 'data-k="gp" data-i="1"');
    h.solids.forEach((so, i) => { html += row(ic('shape'), 'Solid #' + (i + 1), so.p.length / 2 + ' corners', sel.k === 'so' && sel.i === i, 'data-k="so" data-i="' + i + '"'); });
    h.gm.forEach((g, i) => { html += row('<span class="gi">' + gmIcon(g.t) + '</span>', gmName(g.t), '', sel.k === 'gm' && sel.i === i, 'data-k="gm" data-i="' + i + '"'); });
    if (!h.gm.length) html += '<div class="ed-empty">No gimmicks yet — open <b>Gimmicks</b> to add some.</div>';
    return html + '</div>';
  }

  function gimmickPalette() {
    const packs = ((G.Manifest && G.Manifest.PACKS) || []).filter((p) => p && Array.isArray(p.gimmicks));
    const q = search.trim().toLowerCase();
    if (!packsInit && packs.length) { packsInit = true; openPacks.add(packs[0].id); }
    let html = '<h3 class="ed-h">' + ic('sparkle') + 'Gimmicks</h3>';
    if (S.place) {
      const inf = GM_INFO(S.place);
      html += '<div class="ed-armed"><div class="gi">' + gmIcon(S.place) + '</div><div><b>' + esc(gmName(S.place)) + '</b><small>' + esc(inf.desc || '') + '</small>' + (inf.tip ? '<small class="tip"><b>Tip</b> ' + esc(inf.tip) + '</small>' : '') + '</div></div>' +
        '<div class="ed-btnrow"><button class="btn sm primary" data-ed="placeCenter">' + ic('plus') + 'Place in the middle of the view</button><button class="btn sm ghost" data-ed="cancelPlace">Cancel</button></div><p class="ed-note">…or tap anywhere on the canvas.</p>';
    } else html += '<p class="ed-note">Pick a gimmick, then tap the canvas to place it. Select it afterwards to edit every setting.</p>';
    html += '<input class="ed-search" type="search" placeholder="Search gimmicks…" value="' + esc(search) + '" data-in="search" autocomplete="off">';
    const have = HS.TYPES;
    const groups = packs.length ? packs : [{ id: 'all', name: 'All gimmicks', gimmicks: have }];
    groups.forEach((p) => {
      const list = p.gimmicks.filter((t) => have.indexOf(t) >= 0 && (!q || gmName(t).toLowerCase().indexOf(q) >= 0 || (GM_INFO(t).desc || '').toLowerCase().indexOf(q) >= 0 || t.indexOf(q) >= 0));
      if (!list.length) return;
      const open = q || openPacks.has(p.id);
      html += '<div class="ed-pack' + (open ? ' open' : '') + '"><button class="ed-ph2" data-ed="pack" data-id="' + esc(p.id) + '">' + ic(open ? 'down' : 'next') + '<b>' + esc(p.name) + '</b><small>' + list.length + '</small></button>';
      if (open) html += '<div class="ed-gg">' + list.map((t) => '<button class="ed-gb' + (S.place === t ? ' on' : '') + '" data-ed="arm" data-t="' + t + '" title="' + esc(GM_INFO(t).desc || '') + '"><span class="gi">' + gmIcon(t) + '</span><span>' + esc(gmName(t)) + '</span></button>').join('') + '</div>';
      html += '</div>';
    });
    return html;
  }

  function holePanel() {
    const h = S.hole, M = G.Manifest, th = (M && M.byId && M.byId[h.theme]) || null;
    const v = E.isVerified();
    let html = '<h3 class="ed-h">' + ic('settings') + 'Hole settings</h3>' +
      '<div class="ed-fr col"><label>Name</label><input type="text" class="ed-txt" maxlength="40" value="' + esc(h.name) + '" data-pf="name" spellcheck="false"></div>' +
      '<div class="ed-fr col"><label>Theme <small>' + (th ? esc(th.name) : '') + '</small></label><button class="ed-theme" data-ed="theme">' + (th ? G.UI.kit.swatch(th, 'mini') : '') + '<span>Change palette</span>' + ic('next') + '</button></div>' +
      '<div class="ed-fr"><label>Width</label><input type="range" min="1600" max="16000" step="100" value="' + h.w + '" data-pf="w"><input type="number" min="1200" max="24000" step="100" value="' + h.w + '" data-pf="w"></div>' +
      '<label class="ed-sw"><span><b>Par: ' + (h.auto ? 'automatic' : 'manual') + '</b><small>' + (h.auto ? 'Set from distance + the bot’s best result when you verify' : 'You choose it; the bot gets par + 2 strokes') + '</small></span>' + sw(h.auto, 'autoPar') + '</label>' +
      '<div class="ed-fr"><label>Par</label><div class="ed-step"><button class="ibtn sm" data-ed="par" data-d="-1" aria-label="Lower par">' + ic('minus') + '</button><b>' + h.par + '</b><button class="ibtn sm" data-ed="par" data-d="1" aria-label="Raise par">' + ic('plus') + '</button></div></div>' +
      '<div class="ed-sub">Checks</div>' + issuesHtml() +
      '<div class="ed-vcard ' + (v ? 'ok' : '') + '">' + ic(v ? 'shield' : 'target') + '<div><b>' + (v ? 'Verified beatable' : 'Not verified') + '</b><small>' + (v ? 'The bot beat it in ' + h.bot.s + ' stroke' + (h.bot.s > 1 ? 's' : '') + '. Share codes carry a “verified” badge.' : 'Only verified holes get the badge in share codes. Editing the course clears it.') + '</small></div></div>' +
      '<div class="ed-btnrow"><button class="btn sm' + (S.issues.some((i) => i.sev === 'err') ? ' disabled' : '') + '" data-ed="verify">' + ic('shield') + 'Prove it’s beatable</button>' + (h.bot ? '<button class="btn sm" data-ed="showme">' + ic('bulb') + (S.ghost ? 'Hide' : 'Show me') + '</button>' : '') + '</div>';
    return html;
  }
  function issuesHtml() {
    if (!S.issues.length) return '<div class="ed-empty ok">' + ic('check') + 'No problems found.</div>';
    return '<div class="ed-issues">' + S.issues.map((it, i) => '<button class="ed-is ' + it.sev + '" data-ed="issue" data-i="' + i + '">' + ic(it.sev === 'info' ? 'bulb' : 'warn') + '<span>' + esc(it.msg) + '</span>' + (it.fix ? '<em data-ed="fix" data-f="' + it.fix + '">Fix</em>' : '') + '</button>').join('') + '</div>';
  }

  // ======================================================================== props panel ========================================================================
  let lastSelKey = '';
  function renderProps() {
    const sel = S.sel, h = S.hole;
    const sk = sel ? sel.k + ':' + sel.i : '';
    if (sk !== lastSelKey) { lastSelKey = sk; if (sel && root.dataset.mode !== 'wide' && !(sel.k === 'gm' && S.drag)) root.dataset.sheet = 'props'; }
    let html = tabsHeader('props');
    if (!sel) {
      html += '<div class="ed-empty big">' + ic('cursor') + '<b>Nothing selected</b><small>Tap the tee, cup, ground, a solid or a gimmick to edit it.</small></div>' + summaryHtml();
    } else if (sel.k === 'tee' || sel.k === 'cup') {
      const p = sel.k === 'tee' ? h.tee : h.cup;
      html += '<h3 class="ed-h">' + ic(sel.k === 'tee' ? 'tee' : 'flag') + (sel.k === 'tee' ? 'Tee' : 'Cup') + '</h3>' + numPair(sel.k + '.x', 'X', p[0], sel.k + '.y', 'Y', p[1]) +
        (sel.k === 'cup' ? '<div class="ed-fr"><label>Cup width</label><input type="range" min="16" max="80" step="1" value="' + (h.cupW || 30) + '" data-pf="cupW"><input type="number" min="16" max="80" step="1" value="' + (h.cupW || 30) + '" data-pf="cupW"></div>' : '') +
        '<div class="ed-btnrow">' + (sel.k === 'tee' ? '<button class="btn sm" data-ed="seatTee">Rest on ground</button><button class="btn sm" data-ed="levelTee">Level ground</button>' : '<button class="btn sm" data-ed="seatCup">Rest on ground</button><button class="btn sm" data-ed="makeGreen">Flat green</button>') + '</div>' + nudgePad();
    } else if (sel.k === 'gp') {
      const g = h.ground, n = g.length / 2, i = sel.i, end = i === 0 || i === n - 1;
      html += '<h3 class="ed-h">' + ic('mountain') + 'Ground point ' + (i + 1) + '<small>/' + n + '</small></h3>' + numPair('gp.x', 'X', g[2 * i], 'gp.y', 'Y', g[2 * i + 1], end) +
        '<div class="ed-btnrow"><button class="btn sm' + (end ? ' disabled' : '') + '" data-ed="del">' + ic('trash') + 'Delete point</button></div>' +
        '<div class="ed-sub">Surface on its left</div>' + (i > 0 ? '<div class="schips">' + HS.SURFS.map((s) => surfBtn(s, h.gs.charAt(i - 1), 'setSurf').replace('data-ed="setSurf"', 'data-ed="setSurf" data-seg="' + (i - 1) + '"')).join('') + '</div>' : '<div class="ed-empty small">(the left wall edge)</div>') +
        '<div class="ed-sub">Surface on its right</div>' + (i < n - 1 ? '<div class="schips">' + HS.SURFS.map((s) => surfBtn(s, h.gs.charAt(i), 'setSurf').replace('data-ed="setSurf"', 'data-ed="setSurf" data-seg="' + i + '"')).join('') + '</div>' : '<div class="ed-empty small">(the right wall edge)</div>') + nudgePad();
    } else if (sel.k === 'gs') {
      const g = h.ground, i = sel.i, dx = g[2 * i + 2] - g[2 * i], dy = g[2 * i + 3] - g[2 * i + 1];
      html += '<h3 class="ed-h">' + ic('mountain') + 'Ground segment ' + (i + 1) + '</h3><div class="kv"><span><small>Length</small><b>' + Math.round(Math.hypot(dx, dy)) + '</b></span><span><small>Slope</small><b>' + Math.round(Math.atan2(-dy, dx) * 180 / Math.PI) + '°</b></span></div>' +
        '<div class="ed-sub">Surface</div>' + surfPalette(h.gs.charAt(i), 'setSurf') +
        '<div class="ed-btnrow"><button class="btn sm" data-ed="splitSeg">' + ic('plus') + 'Add a point here</button></div>';
    } else if (sel.k === 'so') {
      const so = h.solids[sel.i]; if (!so) { html += ''; } else {
        const n = so.p.length / 2, edge = sel.e !== undefined && sel.e !== null, cur = edge ? (so.s.length > 1 ? so.s.charAt(sel.e) : so.s) : so.s.charAt(0);
        html += '<h3 class="ed-h">' + ic('shape') + 'Solid #' + (sel.i + 1) + '<small>' + n + ' corners</small></h3>';
        if (sel.v !== undefined && sel.v !== null) html += numPair('sv.x', 'Corner X', so.p[2 * sel.v], 'sv.y', 'Y', so.p[2 * sel.v + 1]) + '<div class="ed-btnrow"><button class="btn sm" data-ed="del">' + ic('trash') + 'Delete corner</button></div>';
        html += '<div class="ed-seg"><button class="' + (!edge ? 'on' : '') + '" data-ed="solidWhole">Whole solid</button><button class="' + (edge ? 'on' : '') + '" data-ed="solidEdge"' + (edge ? '' : ' data-first="1"') + '>' + (edge ? 'Edge ' + (sel.e + 1) : 'One edge') + '</button></div>' +
          '<div class="ed-sub">Surface of the ' + (edge ? 'edge' : 'whole solid') + '</div>' + surfPalette(cur, 'setSurf') +
          '<div class="ed-btnrow"><button class="btn sm" data-ed="dup">' + ic('copy') + 'Duplicate</button><button class="btn sm danger" data-ed="del">' + ic('trash') + 'Delete</button></div>' + nudgePad();
      }
    } else if (sel.k === 'gm') html += gimmickProps(sel);
    el.props.innerHTML = html;
    paintSliders(el.props);
    $$('.dial', el.props).forEach(drawDial);
  }
  function summaryHtml() {
    const h = S.hole, types = {}; h.gm.forEach((g) => { types[g.t] = (types[g.t] || 0) + 1; });
    return '<div class="ed-sum"><div class="kv"><span><small>Par</small><b>' + h.par + '</b></span><span><small>Width</small><b>' + h.w + '</b></span><span><small>Gimmicks</small><b>' + h.gm.length + '</b></span></div>' +
      '<div class="ed-keys"><b>Shortcuts</b><span><kbd>V</kbd> select</span><span><kbd>L</kbd> ground</span><span><kbd>P</kbd> solids</span><span><kbd>C</kbd> tee/cup</span><span><kbd>A</kbd> gimmicks</span><span><kbd>G</kbd> grid snap</span><span><kbd>Space</kbd>+drag pan</span><span><kbd>Del</kbd> delete</span><span><kbd>Ctrl</kbd>+<kbd>D</kbd> duplicate</span><span><kbd>Ctrl</kbd>+<kbd>Z</kbd> undo</span><span><kbd>Ctrl</kbd>+<kbd>↵</kbd> test play</span><span><kbd>Alt</kbd> hold: no snap</span></div></div>';
  }
  const numIn = (k, v, dis, attr) => '<input type="number" step="1" value="' + (typeof v === 'number' ? v : '') + '" ' + (attr || 'data-pf') + '="' + k + '"' + (dis ? ' disabled' : '') + ' inputmode="numeric">';
  const numPair = (k1, l1, v1, k2, l2, v2, lockX) => '<div class="ed-xy"><label><span>' + l1 + '</span>' + numIn(k1, v1, lockX) + '</label><label><span>' + l2 + '</span>' + numIn(k2, v2) + '</label></div>';
  const nudgePad = () => '<div class="ed-nudge"><span>Nudge</span><button class="ibtn sm" data-ed="nudge" data-dx="-1" data-dy="0" aria-label="Left">' + ic('back') + '</button><button class="ibtn sm" data-ed="nudge" data-dx="0" data-dy="-1" aria-label="Up">' + ic('up') + '</button><button class="ibtn sm" data-ed="nudge" data-dx="0" data-dy="1" aria-label="Down">' + ic('down') + '</button><button class="ibtn sm" data-ed="nudge" data-dx="1" data-dy="0" aria-label="Right">' + ic('next') + '</button></div>';

  function fieldHtml(g, f) {
    const v = g[f.k];
    if (f.t === 'bool') return '<label class="ed-sw"><span><b>' + esc(f.label) + '</b></span>' + sw(!!v, 'gbool', ' data-k="' + f.k + '"') + '</label>';
    if (f.t === 'ang') {
      const deg = Math.round((v * 180 / Math.PI) * 10) / 10;
      return '<div class="ed-fr ang"><label>' + esc(f.label) + '</label><div class="dial" data-f="' + f.k + '" data-v="' + v + '" role="slider" aria-label="' + esc(f.label) + '" tabindex="0"><canvas width="88" height="88"></canvas></div><input type="number" step="1" value="' + deg + '" data-f="' + f.k + '" data-deg="1"><small>°</small></div>';
    }
    const lo = Math.min(f.min, v), hi = Math.max(f.max, v), step = f.step || 1;
    return '<div class="ed-fr"><label title="' + esc(f.hint || '') + '">' + esc(f.label) + '</label><input type="range" min="' + lo + '" max="' + hi + '" step="' + step + '" value="' + v + '" data-f="' + f.k + '"><input type="number" step="' + step + '" value="' + v + '" data-f="' + f.k + '"></div>';
  }
  function posKeysOf(g) {
    const sp = HS.SPEC[g.t], fk = {}; sp.fields.forEach((f) => { fk[f.k] = 1; });
    const ks = [];
    const add = (k) => { if (k && typeof g[k] === 'number' && !fk[k] && ks.indexOf(k) < 0) ks.push(k); };
    sp.parts.forEach((p) => {
      if (p.when && !p.when(g)) return;
      if (p.p === 'rect') ['x', 'y', 'w', 'h'].forEach(add);
      else if (p.p === 'seg') ['x', 'y', 'x2', 'y2'].forEach(add);
      else if (p.p === 'pt') { add(p.kx); add(p.ky); }
      else if (p.p === 'xrange') { add(p.k1); add(p.k2); }
      else if (p.p === 'hline') add(p.k);
      else if (p.p === 'len' && g.t !== 'pendulum') { /* length lives in fields */ }
    });
    return ks;
  }
  const POSLABEL = { x: 'X', y: 'Y', w: 'Width', h: 'Height', x2: 'End X', y2: 'End Y', sx: 'Switch X', sy: 'Switch Y', x1: 'Left X', y0: 'Water starts at Y', top: 'Rises up to Y', y1: 'Top (high) Y', yb: 'Bottom Y', kx: '' };
  function gimmickProps(sel) {
    const g = S.hole.gm[sel.i]; if (!g) return '';
    const sp = HS.SPEC[g.t], inf = GM_INFO(g.t);
    let html = '<div class="ed-gh"><span class="gi">' + gmIcon(g.t) + '</span><div><b>' + esc(inf.name || g.t) + '</b><small>' + esc(inf.desc || '') + '</small></div></div>' + (inf.tip ? '<div class="ed-tip"><b>Tip</b> ' + esc(inf.tip) + '</div>' : '');
    html += '<div class="ed-btnrow"><button class="btn sm" data-ed="dup">' + ic('copy') + 'Duplicate</button><button class="btn sm danger" data-ed="del">' + ic('trash') + 'Delete</button><button class="btn sm ghost" data-ed="focus">' + ic('eye') + 'Find</button></div>';
    if (sp.zone) html += '<label class="ed-sw"><span><b>Only inside a zone</b><small>Off = the whole hole</small></span>' + sw(g.w !== undefined, 'zone') + '</label>';
    if (sp.cup) html += '<div class="ed-tip warn">This gimmick controls the cup — the exact cup position comes from it.</div>';
    if (g.t === 'flood') html += '<div class="ed-tip">Use <b>Preview stroke</b> on the time bar to see the water level rise.</div>';
    if (g.t === 'phase') html += '<div class="ed-tip">Use <b>Preview stroke</b> on the time bar to see which strokes make the blocks solid.</div>';
    sp.fields.forEach((f) => { html += fieldHtml(g, f); });
    // lists
    sp.parts.forEach((part, pi) => {
      if (part.p === 'pts' || part.p === 'poly') {
        const L = g[part.k] || [], subSel = sel.sub && sel.sub.p === pi ? sel.sub.i : -1;
        html += '<div class="ed-sub">' + esc(part.label || 'Points') + ' <small>' + L.length / 2 + '</small></div><div class="ed-rows">';
        for (let i = 0; i < L.length; i += 2) html += '<div class="ed-row' + (subSel === i / 2 ? ' on' : '') + '" data-ed="sub" data-p="' + pi + '" data-i="' + i / 2 + '"><b>' + (i / 2 + 1) + '</b>' + numIn(pi + ':' + i, L[i], false, 'data-li') + numIn(pi + ':' + (i + 1), L[i + 1], false, 'data-li') + '<button class="ibtn sm" data-ed="subdel" data-p="' + pi + '" data-i="' + i / 2 + '" aria-label="Remove point">' + ic('x') + '</button></div>';
        html += '</div><div class="ed-btnrow"><button class="btn sm" data-ed="addpt" data-p="' + pi + '">' + ic('plus') + 'Add point</button><button class="btn sm' + (S.addPts && S.addPts.part === pi ? ' primary' : '') + '" data-ed="tapadd" data-p="' + pi + '">' + ic('target') + 'Tap to add</button></div>';
      } else if (part.p === 'rects') {
        const L = g[part.k] || [], subSel = sel.sub && sel.sub.p === pi ? sel.sub.i : -1;
        html += '<div class="ed-sub"><i class="dotc" style="background:' + (part.color || '#fff') + '"></i>' + esc(part.label || 'Blocks') + ' <small>' + L.length + '</small></div><div class="ed-rows">';
        L.forEach((r, i) => { html += '<div class="ed-row r4' + (subSel === i ? ' on' : '') + '" data-ed="sub" data-p="' + pi + '" data-i="' + i + '"><b>' + (i + 1) + '</b>' + [0, 1, 2, 3].map((c) => numIn(pi + ':' + i + ':' + c, r[c], false, 'data-lr')).join('') + '<button class="ibtn sm" data-ed="subdel" data-p="' + pi + '" data-i="' + i + '" aria-label="Remove block">' + ic('x') + '</button></div>'; });
        html += '</div><div class="ed-btnrow"><button class="btn sm" data-ed="addrect" data-p="' + pi + '">' + ic('plus') + 'Add block</button></div>';
      }
    });
    const ks = posKeysOf(g);
    if (ks.length) {
      html += '<details class="ed-det"' + (posOpen ? ' open' : '') + '><summary>Position &amp; size</summary><div class="ed-pos">' +
        ks.map((k) => '<label><span>' + (POSLABEL[k] || k) + '</span><input type="number" step="1" value="' + g[k] + '" data-f="' + k + '" data-pos="1" inputmode="numeric"></label>').join('') + '</div></details>';
    }
    html += nudgePad();
    return html;
  }
  function syncVals() {
    const sel = S.sel, h = S.hole;
    if (!sel) return;
    const setv = (e, v) => { if (e !== document.activeElement && e.value !== String(v)) e.value = v; };
    if (sel.k === 'gm' && h.gm[sel.i]) {
      const g = h.gm[sel.i];
      $$('[data-f]', el.props).forEach((e) => {
        const k = e.dataset.f; let v = g[k]; if (v === undefined) return;
        if (e.classList.contains('dial')) { e.dataset.v = v; drawDial(e); return; }
        if (e.dataset.deg) v = Math.round((v * 180 / Math.PI) * 10) / 10;
        if (e.type === 'range') { if (v < +e.min) e.min = v; if (v > +e.max) e.max = v; }
        setv(e, v);
      });
      $$('[data-li]', el.props).forEach((e) => { const [p, i] = e.dataset.li.split(':').map(Number); const part = HS.SPEC[g.t].parts[p]; const L = g[part.k]; if (L && L[i] !== undefined) setv(e, L[i]); });
      $$('[data-lr]', el.props).forEach((e) => { const [p, i, c] = e.dataset.lr.split(':').map(Number); const part = HS.SPEC[g.t].parts[p]; const L = g[part.k]; if (L && L[i]) setv(e, L[i][c]); });
      paintSliders(el.props);
    } else $$('[data-pf]', el.props).forEach((e) => { const v = pfGet(e.dataset.pf); if (v !== undefined) setv(e, v); });
  }
  function pfGet(k) {
    const h = S.hole, sel = S.sel || {};
    switch (k) {
      case 'tee.x': return h.tee[0]; case 'tee.y': return h.tee[1]; case 'cup.x': return h.cup[0]; case 'cup.y': return h.cup[1];
      case 'gp.x': return h.ground[2 * sel.i]; case 'gp.y': return h.ground[2 * sel.i + 1];
      case 'sv.x': return h.solids[sel.i] && h.solids[sel.i].p[2 * sel.v]; case 'sv.y': return h.solids[sel.i] && h.solids[sel.i].p[2 * sel.v + 1];
      case 'cupW': return h.cupW || 30; case 'w': return h.w; case 'name': return h.name;
      default: return undefined;
    }
  }
  function pfSet(k, v) {
    const h = S.hole, sel = S.sel || {};
    const was = H.seatState();
    switch (k) {
      case 'tee.x': h.tee[0] = v; break; case 'tee.y': h.tee[1] = v; break; case 'cup.x': h.cup[0] = v; break; case 'cup.y': h.cup[1] = v; break;
      case 'gp.x': H.moveGroundPoint(sel.i, v, h.ground[2 * sel.i + 1]); H.reseat(was); break;
      case 'gp.y': H.moveGroundPoint(sel.i, h.ground[2 * sel.i], v); H.reseat(was); break;
      case 'sv.x': h.solids[sel.i].p[2 * sel.v] = v; H.reseat(was); break; case 'sv.y': h.solids[sel.i].p[2 * sel.v + 1] = v; H.reseat(was); break;
      case 'cupW': if (v === 30) delete h.cupW; else h.cupW = clamp(v, 16, 80); break;
      case 'name': h.name = String(v).slice(0, HS.LIM.NAME); break;
      default: break;
    }
    H.markDirty();
  }

  // ---------- sliders ----------
  function paintSliders(scope) {
    $$('input[type=range]', scope).forEach((r) => { const lo = +r.min, hi = +r.max, v = +r.value; r.style.setProperty('--v', (hi > lo ? ((v - lo) / (hi - lo)) * 100 : 0) + '%'); });
  }
  // ---------- angle dial ----------
  let dial = null;
  function drawDial(d) {
    const cv = $('canvas', d), c = cv.getContext('2d'), a = +d.dataset.v, W = cv.width, R = W / 2 - 6;
    c.clearRect(0, 0, W, W);
    c.strokeStyle = 'rgba(255,255,255,0.22)'; c.lineWidth = 2; c.beginPath(); c.arc(W / 2, W / 2, R, 0, Math.PI * 2); c.stroke();
    for (let k = 0; k < 12; k++) { const t = k * Math.PI / 6; c.beginPath(); c.moveTo(W / 2 + Math.cos(t) * (R - 4), W / 2 + Math.sin(t) * (R - 4)); c.lineTo(W / 2 + Math.cos(t) * R, W / 2 + Math.sin(t) * R); c.stroke(); }
    c.strokeStyle = '#ffc93c'; c.lineWidth = 4; c.lineCap = 'round'; c.beginPath(); c.moveTo(W / 2, W / 2); c.lineTo(W / 2 + Math.cos(a) * (R - 2), W / 2 + Math.sin(a) * (R - 2)); c.stroke();
    c.fillStyle = '#ffc93c'; c.beginPath(); c.arc(W / 2 + Math.cos(a) * (R - 2), W / 2 + Math.sin(a) * (R - 2), 6, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#fff'; c.beginPath(); c.arc(W / 2, W / 2, 3, 0, Math.PI * 2); c.fill();
  }
  function onDialMove(e) {
    if (!dial) return;
    const r = dial.getBoundingClientRect();
    let a = Math.atan2(e.clientY - (r.top + r.height / 2), e.clientX - (r.left + r.width / 2));
    if (S.snap && !e.altKey) a = Math.round(a / (Math.PI / 24)) * (Math.PI / 24);
    setGmField(dial.dataset.f, r3(a)); dial.dataset.v = r3(a); drawDial(dial);
    const inp = $('input[data-deg]', dial.parentNode); if (inp) inp.value = Math.round((a * 180 / Math.PI) * 10) / 10;
  }
  function onDown(e) {
    const d = e.target.closest && e.target.closest('.dial');
    if (d) { dial = d; try { d.setPointerCapture(e.pointerId); } catch (er) { /* */ } onDialMove(e); e.preventDefault(); }
  }
  window.addEventListener('pointerup', () => { if (dial) { dial = null; E.commit(); } });

  // ======================================================================== field edits ========================================================================
  function setGmField(k, v) {
    const g = E.selGm(); if (!g) return;
    const sp = HS.SPEC[g.t], f = sp.keys[k];
    if (typeof v === 'number') {
      if (f && f.pos) v = rnd(v); else { v = r3(v); if (f && f.int) v = rnd(v); if (f && f.min !== undefined) v = Math.max(f.min, Math.min(f.max, v)); }
      if (f && f.axis === 'w' || f && f.axis === 'h') v = Math.max(4, v);
    }
    g[k] = v; H.markDirty();
  }
  function onInput(e) {
    const t = e.target;
    if (t.dataset.in === 'name') { S.hole.name = t.value.slice(0, HS.LIM.NAME); S.touched = true; return; }
    if (t.dataset.in === 'search') { search = t.value; renderTool(); const s = $('.ed-search', el.tool); if (s) { s.focus(); s.setSelectionRange(s.value.length, s.value.length); } return; }
    if (t.dataset.in === 'time') { S.time = +t.value; S.playing = false; const lb = $('.t', el.bar); if (lb) lb.textContent = S.time.toFixed(1) + 's'; paintSliders(el.bar); return; }
    if (t.dataset.in === 'strokes') { S.strokes = rnd(+t.value); changed('bar'); return; }
    if (t.dataset.f !== undefined) {
      let v = t.type === 'checkbox' ? t.checked : parseFloat(t.value);
      if (!isFinite(v)) return;
      if (t.dataset.deg) v = v * Math.PI / 180;
      setGmField(t.dataset.f, v);
      // keep the twin control (slider <-> number) in step
      $$('[data-f="' + t.dataset.f + '"]', el.props).forEach((o) => { if (o !== t && !o.classList.contains('dial')) { const g = E.selGm(); let nv = g[t.dataset.f]; if (o.dataset.deg) nv = Math.round((nv * 180 / Math.PI) * 10) / 10; if (o.type === 'range') { if (nv < +o.min) o.min = nv; if (nv > +o.max) o.max = nv; } o.value = nv; } });
      paintSliders(el.props); return;
    }
    if (t.dataset.li !== undefined) { const v = parseFloat(t.value); if (!isFinite(v)) return; const [p, i] = t.dataset.li.split(':').map(Number), g = E.selGm(), part = HS.SPEC[g.t].parts[p]; g[part.k][i] = rnd(v); H.markDirty(); return; }
    if (t.dataset.lr !== undefined) { const v = parseFloat(t.value); if (!isFinite(v)) return; const [p, i, c] = t.dataset.lr.split(':').map(Number), g = E.selGm(), part = HS.SPEC[g.t].parts[p]; g[part.k][i][c] = c > 1 ? Math.max(4, rnd(v)) : rnd(v); H.markDirty(); return; }
    if (t.dataset.pf !== undefined) {
      if (t.type === 'text') { pfSet(t.dataset.pf, t.value); return; }
      const v = parseFloat(t.value); if (!isFinite(v)) return;
      if (t.dataset.pf === 'w') { if (t.type === 'range') { $$('input[data-pf=w]', el.tool).forEach((o) => { if (o !== t) o.value = v; }); paintSliders(el.tool); } return; } // applied on change
      pfSet(t.dataset.pf, rnd(v));
      $$('[data-pf="' + t.dataset.pf + '"]').forEach((o) => { if (o !== t) o.value = rnd(v); });
      paintSliders(root);
    }
  }
  function onChange(e) {
    const t = e.target;
    if (t.dataset.in === 'name') { E.commit(); return; }
    if (t.dataset.in === 'time') { changed('bar'); return; }
    if (t.dataset.in === 'search' || t.dataset.in === 'strokes') return;
    if (t.dataset.pf === 'w') { E.setWidth(+t.value); changed('props', 'tool'); return; }
    if (t.dataset.pf === 'name') { E.commit(); return; }
    if (t.dataset.f !== undefined || t.dataset.li !== undefined || t.dataset.lr !== undefined || t.dataset.pf !== undefined) {
      E.commit(); H.fixDerived(); changed('vals');
      if (t.dataset.pos || t.dataset.li !== undefined || t.dataset.lr !== undefined) changed('props');
    }
  }

  // ======================================================================== clicks ========================================================================
  const ACT = {
    exit() { E.close('editorHub'); },
    undo() { E.undo(); }, redo() { E.redo(); },
    verify() { E.verify(); }, test() { E.testPlay(); },
    share() { if (E.hasErrors()) { G.UI.toast('Fix the problems first', 'warn'); return; } E.commit(); E.save(); shareModal(); },
    issues() { E.setTool('hole'); if (root.dataset.mode !== 'wide') setSheet('tool'); },
    tool(b) { const t = b.dataset.t; if (S.tool === t && root.dataset.mode !== 'wide' && sheet() === 'tool') { setSheet('none'); return; } E.setTool(t); if (root.dataset.mode !== 'wide') setSheet('tool'); setTimeout(E.measure, 0); },
    sheet(b) { setSheet(b.dataset.s); },
    paint(b) { S.paint = b.dataset.v === '1'; changed('tool'); },
    brush(b) { S.brush = b.dataset.c; changed('tool'); },
    sbrush(b) { S.sbrush = b.dataset.c; changed('tool'); },
    makeGreen() { E.makeGreen(); }, levelTee() { E.levelTee(); }, seatTee() { E.seatTee(); changed('props'); }, seatCup() { E.seatCup(); changed('props'); },
    autoGreen(b) { S.autoGreen = !S.autoGreen; changed('tool'); },
    drawPoly() { if (S.drawing) { S.drawing = null; changed('tool', 'hint'); } else { E.startPolygon(); if (root.dataset.mode !== 'wide') setSheet('none'); } },
    box(b) { E.addBox(b.dataset.k); },
    pick(b) {
      const d = b.dataset;
      if (d.k === 'tee' || d.k === 'cup') E.select({ k: d.k });
      else if (d.k === 'gp') E.select({ k: 'gp', i: +d.i });
      else E.select({ k: d.k, i: +d.i });
      E.focusSel(); if (root.dataset.mode !== 'wide') setSheet('props');
    },
    pack(b) { const id = b.dataset.id; if (openPacks.has(id)) openPacks.delete(id); else openPacks.add(id); changed('tool'); },
    arm(b) { E.armPlace(b.dataset.t); if (root.dataset.mode !== 'wide') setSheet('none'); },
    cancelPlace() { E.setTool('select'); },
    placeCenter() { const t = S.place; if (!t) return; E.setTool('select'); E.addGimmick(t, Math.round(S.cam.x / S.grid) * S.grid, Math.round(S.cam.y / S.grid) * S.grid); if (root.dataset.mode !== 'wide') setSheet('props'); },
    theme() { themeModal(); },
    autoPar() { S.hole.auto = !S.hole.auto; if (S.hole.auto) S.hole.par = HS.estimatePar(S.hole); E.commit(); changed('tool', 'hole'); },
    par(b) { S.hole.par = clamp(S.hole.par + +b.dataset.d, 1, 12); S.hole.auto = false; E.commit(); changed('tool', 'hole'); },
    issue(b, e) {
      if (e.target.closest('[data-ed=fix]')) return;
      const it = S.issues[+b.dataset.i]; if (!it || !it.sel) return; E.select(it.sel); E.focusSel(); if (root.dataset.mode !== 'wide') setSheet('props');
    },
    fix(b, e) { const f = b.dataset.f; if (E[f]) E[f](); e.stopPropagation(); },
    showme() { if (!S.hole.bot) return; E.showMe(); },
    setSurf(b) {
      const c = b.dataset.c, sel = S.sel, h = S.hole; if (!sel) return;
      if (sel.k === 'gs' || sel.k === 'gp') { const i = b.dataset.seg !== undefined ? +b.dataset.seg : sel.i; const cs = h.gs.split(''); cs[i] = c; h.gs = cs.join(''); E.commit(); H.markDirty(); changed('props'); }
      else if (sel.k === 'so') { E.setSolidSurface(sel.i, c, sel.e !== undefined ? sel.e : null); changed('props'); }
    },
    splitSeg() { const sel = S.sel; if (!sel || sel.k !== 'gs') return; const g = S.hole.ground, x = (g[2 * sel.i] + g[2 * sel.i + 2]) / 2; const i = H.insertGroundPoint(x); if (i > 0) { E.select({ k: 'gp', i }); E.commit(); } },
    solidWhole() { if (S.sel && S.sel.k === 'so') { E.select({ k: 'so', i: S.sel.i }); } },
    solidEdge() { if (S.sel && S.sel.k === 'so') { E.select({ k: 'so', i: S.sel.i, e: S.sel.e !== undefined ? S.sel.e : 0 }); } },
    del() { E.deleteSel(); if (root.dataset.mode !== 'wide' && !S.sel) setSheet('tool'); },
    dup() { E.duplicateSel(); },
    focus() { E.focusSel(); },
    nudge(b) { const st = (S.snap ? S.grid : 1) * 1; E.nudge(+b.dataset.dx * st, +b.dataset.dy * st); },
    zone() {
      const g = E.selGm(); if (!g) return; const sp = HS.SPEC[g.t];
      if (g.w !== undefined) sp.zone.keys.forEach((k) => { delete g[k]; });
      else { const z = sp.zone.make(g); z.x = rnd(S.cam.x - 400); z.y = rnd(S.cam.y - 500); sp.zone.keys.forEach((k) => { g[k] = z[k]; }); }
      E.commit(); changed('props');
    },
    gbool(b) { const g = E.selGm(); if (!g) return; g[b.dataset.k] = !g[b.dataset.k]; E.commit(); H.markDirty(); changed('props'); },
    sub(b, e) { if (e.target.closest('input,button')) return; const g = E.selGm(); if (!g) return; E.select({ k: 'gm', i: S.sel.i, sub: { p: +b.dataset.p, i: +b.dataset.i } }); changed('props'); },
    subdel(b, e) { e.stopPropagation(); const g = E.selGm(); if (!g) return; E.select({ k: 'gm', i: S.sel.i, sub: { p: +b.dataset.p, i: +b.dataset.i } }); E.deleteSel(); changed('props'); },
    addpt(b) {
      const g = E.selGm(); if (!g) return; const pi = +b.dataset.p, part = HS.SPEC[g.t].parts[pi], L = g[part.k];
      if (L.length / 2 >= HS.LIM.LIST_PTS) { G.UI.toast('That is plenty of points', 'warn'); return; }
      let x = L.length >= 2 ? L[L.length - 2] + 90 : S.cam.x, y = L.length >= 2 ? L[L.length - 1] : S.cam.y;
      if (part.ground) { const s = H.surfaceAt(x, y, 'below'); if (s) y = s.y; }
      L.push(rnd(x), rnd(y)); E.select({ k: 'gm', i: S.sel.i, sub: { p: pi, i: L.length / 2 - 1 } }); E.commit(); changed('props');
    },
    tapadd(b) { const g = E.selGm(); if (!g) return; const pi = +b.dataset.p; S.addPts = S.addPts && S.addPts.part === pi ? null : { gi: S.sel.i, part: pi }; changed('props', 'hint'); if (S.addPts && root.dataset.mode !== 'wide') setSheet('none'); },
    addrect(b) { const g = E.selGm(); if (!g) return; const pi = +b.dataset.p, part = HS.SPEC[g.t].parts[pi], L = g[part.k]; if (L.length >= HS.LIM.LIST_RECTS) return; L.push([rnd(S.cam.x - 20), rnd(S.cam.y - 70), 40, 140]); E.select({ k: 'gm', i: S.sel.i, sub: { p: pi, i: L.length - 1 } }); E.commit(); changed('props'); },
    play() { E.togglePlay(); },
    snap() { S.snap = !S.snap; changed('bar'); },
    zin() { E.zoomBy(1.3); }, zout() { E.zoomBy(0.77); }, fit() { E.fit(); },
    strokes(b) { S.strokes = clamp(S.strokes + +b.dataset.d, 0, 12); changed('bar'); },
    cancelHint() { S.drawing = null; S.addPts = null; E.setTool('select'); changed('hint', 'props'); },
    donePoly() { E.finishPolygon(); },
    doneAdd() { S.addPts = null; changed('props', 'hint'); },
    undoPoint() { if (S.drawing && S.drawing.pts.length) { S.drawing.pts.pop(); changed('hint'); } },
    mclose() { UI.closeModal(); },
  };
  function onClick(e) {
    const b = e.target.closest('[data-ed]');
    if (!b || b.classList.contains('disabled') || b.disabled) return;
    const fn = ACT[b.dataset.ed];
    if (fn) { e.preventDefault(); G.UI.kit.click(); fn(b, e); }
    else if (MODAL_ACT[b.dataset.ed]) { e.preventDefault(); MODAL_ACT[b.dataset.ed](b, e); }
  }

  // ======================================================================== bar + hint ========================================================================
  function renderBar() {
    const h = S.hole, needStrokes = h.gm.some((g) => g.t === 'phase' || g.t === 'flood'), moving = h.gm.length > 0;
    const focus = document.activeElement;
    if (focus && el.bar.contains(focus) && focus.type === 'range' && S.flags.time) { const sl = $('input[data-in=time]', el.bar); if (sl) { sl.value = S.time; $('.t', el.bar).textContent = S.time.toFixed(1) + 's'; } return; }
    if (S.playing && $('input[data-in=time]', el.bar) && !S.flags.bar) { const sl = $('input[data-in=time]', el.bar); sl.value = S.time; paintSliders(el.bar); $('.t', el.bar).textContent = S.time.toFixed(1) + 's'; return; }
    el.bar.innerHTML =
      '<button class="ibtn sm" data-ed="play" aria-label="' + (S.playing ? 'Pause' : 'Play') + ' motion preview" title="Preview motion (K)">' + ic(S.playing ? 'pause' : 'play') + '</button>' +
      '<div class="ed-tl"><input type="range" min="0" max="30" step="0.05" value="' + S.time + '" data-in="time" aria-label="Preview time"><span class="t">' + S.time.toFixed(1) + 's</span></div>' +
      (needStrokes ? '<div class="ed-st" title="Which stroke to preview (phase blocks, rising water)"><button class="ibtn sm" data-ed="strokes" data-d="-1" aria-label="Previous stroke">' + ic('minus') + '</button><span>Stroke <b>' + (S.strokes + 1) + '</b></span><button class="ibtn sm" data-ed="strokes" data-d="1" aria-label="Next stroke">' + ic('plus') + '</button></div>' : '') +
      '<span class="ed-sep"></span>' +
      '<button class="ibtn sm' + (S.snap ? ' on' : '') + '" data-ed="snap" aria-pressed="' + S.snap + '" title="Snap to grid (G)">' + ic('grid') + '</button>' +
      '<button class="ibtn sm" data-ed="zout" aria-label="Zoom out" title="Zoom out (−)">' + ic('minus') + '</button><button class="ibtn sm" data-ed="zin" aria-label="Zoom in" title="Zoom in (+)">' + ic('plus') + '</button><button class="ibtn sm" data-ed="fit" aria-label="Fit hole" title="Fit the whole hole (F)">' + ic('expand') + '</button>';
    paintSliders(el.bar);
    void moving;
  }
  function renderHint() {
    let txt = '', btn = '';
    if (S.drawing) { const n = S.drawing.pts.length; txt = n < 3 ? 'Tap corners to outline the solid (' + n + '/3 minimum)' : 'Tap more corners, or tap the green corner to close'; btn = '<button class="btn sm" data-ed="undoPoint">' + ic('undo') + 'Undo corner</button>' + (n >= 3 ? '<button class="btn sm primary" data-ed="donePoly">' + ic('check') + 'Done</button>' : '') + '<button class="btn sm ghost" data-ed="cancelHint">Cancel</button>'; }
    else if (S.addPts) { txt = 'Tap the canvas to add points'; btn = '<button class="btn sm primary" data-ed="doneAdd">' + ic('check') + 'Done</button>'; }
    else if (S.tool === 'gimmick' && S.place) { txt = 'Tap to place: ' + gmName(S.place); btn = '<button class="btn sm ghost" data-ed="cancelPlace">Cancel</button>'; }
    else if (S.tool === 'tee') { txt = 'Tap or drag to place the tee'; }
    else if (S.tool === 'cup') { txt = 'Tap or drag to place the cup'; }
    el.hint.classList.toggle('hidden', !txt);
    if (txt) el.hint.innerHTML = '<span>' + esc(txt) + '</span>' + btn;
  }

  // ======================================================================== modals ========================================================================
  const MODAL_ACT = {};
  function modalCard(title, body, foot, cls) {
    return '<div class="ed-card ' + (cls || '') + '"><div class="ed-card-h"><h2>' + title + '</h2><button class="ibtn sm" data-ed="mclose" aria-label="Close">' + ic('x') + '</button></div><div class="ed-card-b">' + body + '</div>' + (foot ? '<div class="ed-card-f">' + foot + '</div>' : '') + '</div>';
  }
  function renderModal() {
    const v = S.ver;
    if (v) UI.modal(verifyHtml(), 'verify', !v.done);
    else if (modalKind === 'verify') UI.closeModal();
  }
  function verifyHtml() {
    const v = S.ver, h = S.hole;
    if (!v.done) {
      const secs = ((performance.now() - v.t0) / 1000).toFixed(1);
      return modalCard('Proving it’s beatable…', '<div class="ed-ver"><div class="ed-bar-l"><i style="width:' + verifyPct() + '%"></i></div><p class="ed-note c">The bot is test-playing: it looks for a way to hole out in <b>' + v.maxStrokes + '</b> strokes or fewer (par ' + v.par + ' + 2).</p><div class="kv"><span><small>Strokes tried</small><b>' + Math.max(1, v.stroke) + '</b></span><span><small>Time</small><b class="vs">' + secs + 's</b></span></div></div>', '<button class="btn" data-ed="vcancel">Cancel</button>', 'ver');
    }
    const r = v.res;
    if (r && r.ok) {
      return modalCard(ic('shield') + 'Verified!', '<div class="ed-ver ok"><p class="ed-big">The bot beat it in <b>' + r.strokes + '</b> stroke' + (r.strokes > 1 ? 's' : '') + '.</p><p class="ed-note c">Par is now <b>' + h.par + '</b>' + (v.auto ? ' (automatic)' : '') + '. Share codes for this hole carry the verified badge until you change the course.</p></div>',
        '<button class="btn" data-ed="vshow">' + ic('bulb') + 'Show me</button><button class="btn" data-ed="vshare">' + ic('share') + 'Share</button><button class="btn primary" data-ed="mclose">Done</button>', 'ver');
    }
    if (r && r.stale) return modalCard('Verification cancelled', '<p class="ed-note c">The hole changed while the bot was working. Run it again.</p>', '<button class="btn primary" data-ed="mclose">OK</button>', 'ver');
    return modalCard(ic('warn') + 'No solution found', '<div class="ed-ver"><p class="ed-big">The bot could not hole out in ' + v.maxStrokes + ' strokes.</p><p class="ed-note c">That doesn’t always mean it is impossible — but a hole that nobody can prove beatable stays <b>unverified</b>. Try making it a bit easier (wider landing zones, fewer hazards), play it yourself with Test play, or raise the par to give the bot more strokes.</p></div>',
      '<button class="btn" data-ed="vpar">' + ic('plus') + 'Raise par and retry</button><button class="btn primary" data-ed="mclose">Close</button>', 'ver');
  }
  function verifyPct() { const v = S.ver; if (!v) return 0; const t = (performance.now() - v.t0) / 1000, byStroke = v.stroke / (v.maxStrokes + 0.5), byTime = 1 - Math.exp(-t / 14); return Math.round(Math.min(96, Math.max(byStroke, byTime) * 100)); }
  function renderModalProgress() {
    const v = S.ver; if (!v || v.done || modalKind !== 'verify') return;
    const bar = $('.ed-bar-l i', el.modal); if (bar) bar.style.width = verifyPct() + '%';
    const b = $$('.kv b', el.modal); if (b[0]) b[0].textContent = Math.max(1, v.stroke); if (b[1]) b[1].textContent = ((performance.now() - v.t0) / 1000).toFixed(1) + 's';
  }
  Object.assign(MODAL_ACT, {
    vcancel() { E.cancelVerify(); UI.closeModal(); },
    vshow() { UI.closeModal(); E.showMe(true); },
    vshare() { UI.closeModal(); shareModal(); },
    vpar() { S.hole.par = clamp(S.hole.par + 1, 1, 12); S.hole.auto = false; E.commit(); UI.closeModal(); E.verify(); },
  });
  // theme picker
  function themeModal() {
    const M = G.Manifest, list = (M && M.COURSES) || [];
    const body = '<div class="ed-themes">' + list.map((c) => '<button class="ed-th' + (S.hole.theme === c.id ? ' on' : '') + '" data-ed="setTheme" data-id="' + c.id + '" title="' + esc(c.name) + '">' + G.UI.kit.swatch(c, 'mini') + '<span>' + esc(c.name) + '</span></button>').join('') + '</div>';
    UI.modal(modalCard('Theme', body, '', 'wide'), 'theme');
  }
  MODAL_ACT.setTheme = function (b) { S.hole.theme = b.dataset.id; E.commit(); H.markDirty(); UI.closeModal(); changed('tool'); };
  // share
  function shareModal() {
    UI.modal(modalCard(ic('share') + 'Share this hole', '<div class="ed-share" id="ed-share-body"><p class="ed-note c">Encoding…</p></div>', '', 'wide'), 'share');
    const hole = JSON.parse(JSON.stringify(S.hole));
    if (G.MyHoles) G.MyHoles.shareInto($('#ed-share-body', el.modal), hole, { fromEditor: true });
  }
  UI.shareModal = shareModal;

  // thumbnails inside the tool panel (swatch preview)
  function bindPreviewThumbs() { /* swatches are pure CSS */ }
})();
