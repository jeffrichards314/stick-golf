/* Hole editor — core: document model, geometry ops, selection + handles, canvas rendering, input, undo, validation, verify, test play.
 * The panels / dialogs live in game/editor-ui.js, My Holes + share + import screens in game/myholes.js.
 * The editor draws the hole with the game renderer (App.R) on the main canvas and its own handles on an overlay canvas. */
(function () {
  'use strict';
  const G = window.GOLF = window.GOLF || {};
  const HS = G.HoleSchema, HC = G.HoleCode, Ph = G.Physics;
  if (!HS || !HC || !Ph) { console.warn('[editor] missing modules'); return; }
  const R6 = Ph.C.R, TAU = Math.PI * 2;
  const App = () => G.App;
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const rnd = Math.round, r3 = HS.r3;

  const E = G.Editor = { active: false, suspended: false, S: null, ui: null };
  const S = E.S = {
    hole: null, entry: null, sel: null, tool: 'select', brush: 'f', sbrush: 'k', paint: false, place: null, drawing: null, addPts: null,
    cam: { x: 1600, y: 800, z: 0.4 }, snap: true, grid: 20, guides: true,
    undo: [], redo: [], last: '', geo: '', dirty: true,
    time: 0, playing: false, strokes: 0, speed: 1, W: null, ps: null, theme: null, issues: [],
    autoGreen: true, ghost: null, ver: null, verified: null,
    vw: 800, vh: 600, ox: 0, oy: 0, touch: false, drag: null, pan: null, hover: null, cursor: null,
    flags: {}, touched: false, saveT: 0,
  };
  const changed = (...f) => { f.forEach((k) => { S.flags[k] = true; }); };
  E.changed = changed;

  // ======================================================================== document ========================================================================
  const FIELDS = ['name', 'theme', 'par', 'auto', 'cupW', 'tee', 'cup', 'ground', 'gs', 'solids', 'gm'];
  function ser() { const h = S.hole, o = {}; FIELDS.forEach((k) => { if (h[k] !== undefined) o[k] = h[k]; }); return JSON.stringify(o); }
  function restore(json) {
    const h = S.hole, o = JSON.parse(json);
    FIELDS.forEach((k) => { delete h[k]; });
    Object.assign(h, o);
    S.sel = null; S.drawing = null; S.addPts = null; S.drag = null;
    markDirty(); changed('props', 'tool', 'top', 'hole', 'bar');
  }
  function markDirty() { S.dirty = true; }
  // call after every completed edit
  function commit() {
    const cur = ser();
    if (cur === S.last) return false;
    S.undo.push(S.last); if (S.undo.length > 120) S.undo.shift();
    S.last = cur; S.redo.length = 0; S.touched = true;
    markDirty(); changed('top', 'hole', 'bar'); scheduleSave();
    return true;
  }
  E.commit = commit;
  E.undo = function () {
    if (S.drag || !S.undo.length) return;
    S.redo.push(S.last); S.last = S.undo.pop(); restore(S.last); scheduleSave();
  };
  E.redo = function () {
    if (S.drag || !S.redo.length) return;
    S.undo.push(S.last); S.last = S.redo.pop(); restore(S.last); scheduleSave();
  };
  function scheduleSave() {
    clearTimeout(S.saveT);
    S.saveT = setTimeout(save, 700);
  }
  function save() {
    clearTimeout(S.saveT); S.saveT = 0;
    if (!S.hole || !S.entry || !G.MyHoles) return false;
    if (!S.touched && !S.entry.saved) return false; // never edited a fresh template: do not litter My Holes
    S.entry.saved = true;
    const ok = G.MyHoles.save(S.entry, S.hole);
    if (!ok) G.UI.toast('Storage is full — copy this hole\'s code to keep it', 'warn', 3500);
    return ok;
  }
  E.save = save;

  function fixDerived() {
    const h = S.hole, g = h.ground;
    h.w = g[g.length - 2];
    let maxY = -1e9; for (let i = 1; i < g.length; i += 2) maxY = Math.max(maxY, g[i]);
    h.solids.forEach((so) => { for (let i = 1; i < so.p.length; i += 2) maxY = Math.max(maxY, so.p[i]); });
    h.h = Math.max(1000, Math.round((maxY + 380) / 10) * 10);
    if (h.par < 1) h.par = 1;
  }

  // ======================================================================== geometry helpers ========================================================================
  const dist2seg = (px, py, ax, ay, bx, by) => {
    const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy;
    let t = L2 > 0 ? ((px - ax) * dx + (py - ay) * dy) / L2 : 0; t = clamp(t, 0, 1);
    return Math.hypot(px - ax - dx * t, py - ay - dy * t);
  };
  const segT = (px, py, ax, ay, bx, by) => { const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy; return L2 > 0 ? clamp(((px - ax) * dx + (py - ay) * dy) / L2, 0, 1) : 0; };
  const gpairs = (h) => { const o = [], g = h.ground; for (let i = 0; i < g.length; i += 2) o.push([g[i], g[i + 1]]); return o; };
  function setGround(h, pts, cs) {
    const g = []; pts.forEach((p) => g.push(p[0], p[1]));
    h.ground = g; h.gs = cs.join('');
  }
  const groundY = (x) => Ph.groundY(S.hole, x);

  // insert a ground point at x (on the line); returns its index
  function insertGroundPoint(x) {
    const h = S.hole, pts = gpairs(h), cs = h.gs.split('');
    x = rnd(x);
    for (let i = 0; i < pts.length - 1; i++) {
      if (x > pts[i][0] + 2 && x < pts[i + 1][0] - 2) {
        const y = rnd(groundY(x));
        pts.splice(i + 1, 0, [x, y]); cs.splice(i + 1, 0, cs[i]);
        setGround(h, pts, cs); return i + 1;
      }
    }
    return -1;
  }
  function removeGroundPoint(i) {
    const h = S.hole, pts = gpairs(h), cs = h.gs.split('');
    if (i <= 0 || i >= pts.length - 1 || pts.length <= 3) return false;
    pts.splice(i, 1); cs.splice(i, 1); // the merged segment keeps the left segment's surface
    setGround(h, pts, cs); return true;
  }
  function moveGroundPoint(i, x, y) {
    const h = S.hole, g = h.ground, n = g.length / 2;
    if (i > 0 && i < n - 1) g[2 * i] = clamp(rnd(x), g[2 * i - 2] + 2, g[2 * i + 2] - 2);
    g[2 * i + 1] = clamp(rnd(y), HS.LIM.Y_MIN, HS.LIM.Y_MAX);
  }
  // level the ground on [x-hw, x+hw] at height y with surface ch (the ends of the level stretch become real ground points)
  function levelGround(x, hw, y, ch) {
    const h = S.hole, w = h.ground[h.ground.length - 2];
    let xa = Math.max(20, rnd(x - hw)), xb = Math.min(w - 20, rnd(x + hw));
    if (xb - xa < 20) return false;
    const pts = gpairs(h), cs = h.gs.split('');
    const split = (xx) => {
      for (let i = 0; i < pts.length - 1; i++) {
        if (xx > pts[i][0] + 1 && xx < pts[i + 1][0] - 1) {
          const yy = pts[i][1] + (pts[i + 1][1] - pts[i][1]) * (xx - pts[i][0]) / (pts[i + 1][0] - pts[i][0]);
          pts.splice(i + 1, 0, [xx, rnd(yy)]); cs.splice(i + 1, 0, cs[i]); return;
        }
      }
    };
    split(xa); split(xb);
    const near = (xx) => { let bi = 0; pts.forEach((p, i) => { if (Math.abs(p[0] - xx) < Math.abs(pts[bi][0] - xx)) bi = i; }); return bi; };
    const ia = near(xa), ib = near(xb);
    if (ib <= ia) return false;
    const np = [], nc = [];
    for (let i = 0; i < pts.length; i++) {
      if (i < ia) { np.push(pts[i]); nc.push(cs[i]); }
      else if (i === ia) { np.push([pts[i][0], rnd(y)]); nc.push(ch); }
      else if (i === ib) { np.push([pts[i][0], rnd(y)]); nc.push(cs[i]); }
      else if (i > ib) { np.push(pts[i]); nc.push(cs[i]); }
    }
    nc.length = np.length - 1;
    setGround(h, np, nc);
    return true;
  }
  E._level = levelGround;

  // nearest surface under/near a vertical line: ground segments + solid edges. -> {y, nx, ny, kind, i, e, c}
  function surfaceAt(x, yRef, mode) {
    const h = S.hole, c = [];
    const g = h.ground;
    for (let i = 0; i + 3 < g.length; i += 2) {
      const ax = g[i], ay = g[i + 1], bx = g[i + 2], by = g[i + 3];
      if (x >= ax && x <= bx && bx !== ax) c.push({ y: ay + (by - ay) * (x - ax) / (bx - ax), dx: bx - ax, dy: by - ay, kind: 'g', i: i / 2, c: h.gs.charAt(i / 2) });
    }
    h.solids.forEach((so, si) => {
      const n = so.p.length / 2;
      for (let k = 0; k < n; k++) {
        const j = (k + 1) % n, ax = so.p[2 * k], ay = so.p[2 * k + 1], bx = so.p[2 * j], by = so.p[2 * j + 1];
        const lo = Math.min(ax, bx), hi = Math.max(ax, bx);
        if (x >= lo && x <= hi && bx !== ax) c.push({ y: ay + (by - ay) * (x - ax) / (bx - ax), dx: bx - ax, dy: by - ay, kind: 's', i: si, e: k, c: so.s.length > 1 ? so.s.charAt(k) : so.s });
      }
    });
    if (!c.length) return null;
    let best = null;
    if (mode === 'below') { c.forEach((s) => { if (s.y >= yRef - 8 && (!best || s.y < best.y)) best = s; }); }
    if (!best) c.forEach((s) => { if (!best || Math.abs(s.y - yRef) < Math.abs(best.y - yRef)) best = s; });
    return best;
  }
  const teeYFor = (s) => s.y - R6 / (Math.abs(s.dx) / Math.hypot(s.dx, s.dy) || 1);
  function isSeated(which) {
    const h = S.hole, p = which === 'tee' ? h.tee : h.cup, s = surfaceAt(p[0], p[1], 'near');
    if (!s) return false;
    const want = which === 'tee' ? teeYFor(s) : s.y;
    return Math.abs(p[1] - want) < 4;
  }
  function seat(which, x, mode) {
    const h = S.hole, p = which === 'tee' ? h.tee : h.cup;
    if (x !== undefined) p[0] = rnd(clamp(x, 30, h.w - 30));
    const s = surfaceAt(p[0], p[1], mode || 'near');
    if (!s) return null;
    p[1] = rnd(which === 'tee' ? teeYFor(s) : s.y);
    return s;
  }
  // after a terrain edit: tee/cup that were resting on the ground follow it
  function reseat(was) { if (was.tee) seat('tee'); if (was.cup) seat('cup'); }
  const seatState = () => ({ tee: isSeated('tee'), cup: isSeated('cup') });
  function makeGreenUnderCup() {
    const h = S.hole, s = seat('cup', undefined, 'near');
    if (!s) return false;
    if (s.kind === 'g') levelGround(h.cup[0], 70, h.cup[1], 'n');
    else { const so = h.solids[s.i]; if (so.s.length === 1) so.s = so.s.repeat(so.p.length / 2); so.s = so.s.substr(0, s.e) + 'n' + so.s.substr(s.e + 1); }
    seat('cup'); return true;
  }
  function levelUnderTee() {
    const h = S.hole, s = seat('tee', undefined, 'near');
    if (s && s.kind === 'g') { levelGround(h.tee[0], 50, rnd(s.y), /[nwloxzvuj]/.test(s.c) ? 'f' : s.c); seat('tee'); }
    return !!s;
  }
  E.seatTee = () => { seat('tee', undefined, 'near'); if (S.autoGreen) levelUnderTee(); commit(); };
  E.seatCup = () => { seat('cup', undefined, 'near'); if (S.autoGreen) makeGreenUnderCup(); commit(); };
  // the old cup spot lost its cup: turn its leftover green back into fairway (never touches the new green)
  function reclaimGreen(old) {
    const h = S.hole, g = h.ground, cs = h.gs.split(''); let any = false;
    if (!old || Math.abs(old[0] - h.cup[0]) < 150) return;
    for (let i = 0; i + 3 < g.length; i += 2) {
      const a = g[i], b = g[i + 2], k = i / 2;
      if (cs[k] === 'n' && b > old[0] - 90 && a < old[0] + 90 && !(b > h.cup[0] - 90 && a < h.cup[0] + 90)) { cs[k] = 'f'; any = true; }
    }
    if (any) h.gs = cs.join('');
  }
  E.makeGreen = () => { if (!makeGreenUnderCup()) G.UI.toast('Put the cup on the ground first', 'warn'); commit(); };
  E.levelTee = () => { levelUnderTee(); commit(); };

  // world width: moves the right wall
  E.setWidth = function (nw) {
    const h = S.hole, g = h.ground, n = g.length / 2;
    nw = clamp(rnd(nw), 1200, HS.LIM.W_MAX);
    const was = seatState();
    const pts = gpairs(h), cs = h.gs.split('');
    const oldW = pts[n - 1][0];
    if (nw === oldW) return;
    if (n < 4) { pts[n - 1][0] = nw; pts[n - 2][0] = nw - 14; }
    else if (nw > oldW) { const d = nw - oldW; pts[n - 1][0] += d; pts[n - 2][0] += d; }
    else {
      // drop points that would end up beyond the new right wall, keep the last two as the wall
      const wall = [pts[n - 2], pts[n - 1]];
      const keepN = pts.length - 2;
      let k = keepN; while (k > 2 && pts[k - 1][0] > nw - 60) k--;
      const rest = pts.slice(0, k), rc = cs.slice(0, k - 1);
      wall[0][0] = nw - 14; wall[1][0] = nw;
      rest.push(wall[0], wall[1]); rc.push(cs[keepN - 1] || 'f', cs[n - 2] || 'k');
      pts.length = 0; rest.forEach((p) => pts.push(p)); cs.length = 0; rc.forEach((c) => cs.push(c));
    }
    setGround(h, pts, cs); fixDerived();
    h.tee[0] = Math.min(h.tee[0], nw - 80); h.cup[0] = Math.min(h.cup[0], nw - 100);
    reseat(was);
    if (S.autoGreen && was.cup && h.gs.indexOf('n') < 0) makeGreenUnderCup();
    commit();
  };

  // ---------- solids ----------
  function addSolid(p, s) { S.hole.solids.push({ p: p.map(rnd), s: s || S.sbrush }); return S.hole.solids.length - 1; }
  function solidChars(so) { return so.s.length > 1 ? so.s.split('') : new Array(so.p.length / 2).fill(so.s); }
  function insertSolidVertex(si, e) {
    const so = S.hole.solids[si], n = so.p.length / 2, j = (e + 1) % n, cs = solidChars(so);
    const mx = rnd((so.p[2 * e] + so.p[2 * j]) / 2), my = rnd((so.p[2 * e + 1] + so.p[2 * j + 1]) / 2);
    so.p.splice(2 * (e + 1), 0, mx, my); cs.splice(e + 1, 0, cs[e]);
    so.s = cs.every((c) => c === cs[0]) ? cs[0] : cs.join('');
    return e + 1;
  }
  function removeSolidVertex(si, v) {
    const so = S.hole.solids[si], n = so.p.length / 2;
    if (n <= 3) { S.hole.solids.splice(si, 1); return 'gone'; }
    const cs = solidChars(so);
    so.p.splice(2 * v, 2); cs.splice(v, 1); // edge v (v -> v+1) disappears; edge v-1 now runs to the next vertex
    so.s = cs.every((c) => c === cs[0]) ? cs[0] : cs.join('');
    return 'ok';
  }
  function setSolidSurface(si, ch, e) {
    const so = S.hole.solids[si];
    if (e === undefined || e === null) { so.s = ch; return; }
    const cs = solidChars(so); cs[e] = ch; so.s = cs.every((c) => c === cs[0]) ? cs[0] : cs.join('');
  }
  E.setSolidSurface = (si, ch, e) => { setSolidSurface(si, ch, e); commit(); };
  const solidBox = (so) => { let a = 1e9, b = 1e9, c = -1e9, d = -1e9; for (let i = 0; i < so.p.length; i += 2) { a = Math.min(a, so.p[i]); c = Math.max(c, so.p[i]); b = Math.min(b, so.p[i + 1]); d = Math.max(d, so.p[i + 1]); } return [a, b, c, d]; };

  // ---------- gimmicks ----------
  const specOf = (g) => HS.SPEC[g.t];
  function translateAll(g, dx, dy) {
    const sp = specOf(g);
    Object.keys(sp.posX).forEach((k) => { if (typeof g[k] === 'number') g[k] = rnd(g[k] + dx); });
    Object.keys(sp.posY).forEach((k) => { if (typeof g[k] === 'number') g[k] = rnd(g[k] + dy); });
    Object.keys(sp.lists).forEach((k) => {
      const L = g[k]; if (!Array.isArray(L)) return;
      if (sp.lists[k].kind === 'pts') for (let i = 0; i < L.length; i += 2) { L[i] = rnd(L[i] + dx); L[i + 1] = rnd(L[i + 1] + dy); }
      else L.forEach((r) => { r[0] = rnd(r[0] + dx); r[1] = rnd(r[1] + dy); });
    });
  }
  E.translateGimmick = (gi, dx, dy) => { translateAll(S.hole.gm[gi], dx, dy); commit(); };
  function addGimmick(type, x, y) {
    const g = HS.makeGimmick(type, x, y); if (!g) return -1;
    if (S.hole.gm.length >= HS.LIM.GIMMICKS) { G.UI.toast('That is the most gimmicks one hole can hold', 'warn'); return -1; }
    S.hole.gm.push(g);
    const sp = HS.SPEC[type];
    // cup-spot lists sit on the ground
    Object.keys(sp.lists).forEach((k) => {
      const part = sp.parts.find((p) => p.k === k);
      if (part && part.ground) for (let i = 0; i < g[k].length; i += 2) { const s = surfaceAt(g[k][i], g[k][i + 1], 'near'); if (s) g[k][i + 1] = rnd(s.y); }
    });
    return S.hole.gm.length - 1;
  }
  E.addGimmick = function (type, x, y) {
    const cx = x === undefined ? S.cam.x : x, cy = y === undefined ? S.cam.y : y;
    const i = addGimmick(type, cx, cy); if (i < 0) return -1;
    select({ k: 'gm', i }); commit(); changed('tool'); return i;
  };
  const ptsOf = (g, part) => { const L = g[part.k] || []; const o = []; for (let i = 0; i < L.length; i += 2) o.push([L[i], L[i + 1]]); return o; };

  // ======================================================================== selection ========================================================================
  function select(sel) {
    // gimmicks made of blocks show the first block's handles right away
    if (sel && sel.k === 'gm' && !sel.sub && S.hole.gm[sel.i]) {
      const g = S.hole.gm[sel.i], sp = HS.SPEC[g.t];
      const pi = sp.parts.findIndex((p) => p.p === 'rects' && g[p.k] && g[p.k].length);
      if (pi >= 0) sel = { k: 'gm', i: sel.i, sub: { p: pi, i: 0 } };
    }
    const same = JSON.stringify(sel) === JSON.stringify(S.sel);
    S.sel = sel;
    if (!same) changed('props');
    changed('outline');
  }
  E.select = select;
  const selGm = () => (S.sel && S.sel.k === 'gm' ? S.hole.gm[S.sel.i] : null);
  E.selGm = selGm;
  function setTool(t, arg) {
    S.drawing = null; S.addPts = null;
    S.tool = t; S.place = null;
    if (t === 'gimmick' && arg) S.place = arg;
    if (t === 'solid') S.drawing = null;
    changed('tool', 'rail');
  }
  E.setTool = setTool;
  E.armPlace = (type) => { S.tool = 'gimmick'; S.place = type; S.drawing = null; changed('tool', 'rail', 'hint'); };
  E.startPolygon = () => { S.tool = 'solid'; S.drawing = { pts: [] }; select(null); changed('tool', 'hint'); };
  E.finishPolygon = function () {
    const d = S.drawing; if (!d) return;
    if (d.pts.length >= 3) { const i = addSolid(d.pts.flat()); select({ k: 'so', i }); commit(); } else if (d.pts.length) G.UI.toast('A solid needs at least 3 corners', 'warn');
    S.drawing = null; S.tool = 'select'; changed('tool', 'rail', 'hint');
  };
  E.addBox = function (kind) {
    const c = [rnd(S.cam.x / 10) * 10, rnd(S.cam.y / 10) * 10];
    let p;
    if (kind === 'ramp') p = [c[0] - 150, c[1] + 60, c[0] + 150, c[1] + 60, c[0] + 150, c[1] - 90];
    else if (kind === 'island') p = [c[0] - 160, c[1] - 20, c[0] + 160, c[1] - 20, c[0] + 130, c[1] + 40, c[0] - 130, c[1] + 40];
    else p = [c[0] - 100, c[1] - 80, c[0] + 100, c[1] - 80, c[0] + 100, c[1] + 80, c[0] - 100, c[1] + 80];
    const i = addSolid(p); select({ k: 'so', i }); S.tool = 'select'; commit(); changed('tool', 'rail');
  };
  E.deleteSel = function () {
    const sel = S.sel, h = S.hole; if (!sel) return false;
    const was = seatState();
    if (sel.k === 'gm') {
      const g = h.gm[sel.i], sp = specOf(g);
      if (sel.sub) {
        const part = sp.parts[sel.sub.p], L = g[part.k];
        if (part.p === 'rects') { L.splice(sel.sub.i, 1); sel.sub = null; }
        else if (L.length / 2 > (part.min || 1)) { L.splice(2 * sel.sub.i, 2); sel.sub = null; }
        else { G.UI.toast('It needs at least ' + (part.min || 1) + ' point' + ((part.min || 1) > 1 ? 's' : ''), 'warn'); return false; }
        changed('props'); commit(); return true;
      }
      h.gm.splice(sel.i, 1); select(null);
    } else if (sel.k === 'gp') { if (!removeGroundPoint(sel.i)) { G.UI.toast('The end points of the ground stay', 'warn'); return false; } select(null); reseat(was); }
    else if (sel.k === 'gs') { select(null); return false; }
    else if (sel.k === 'so') {
      if (sel.v !== undefined && sel.v !== null) { const r = removeSolidVertex(sel.i, sel.v); if (r === 'gone') select(null); else select({ k: 'so', i: sel.i }); }
      else { h.solids.splice(sel.i, 1); select(null); }
      reseat(was);
    } else return false;
    commit(); return true;
  };
  E.duplicateSel = function () {
    const sel = S.sel, h = S.hole; if (!sel) return;
    if (sel.k === 'gm') { const g = JSON.parse(JSON.stringify(h.gm[sel.i])); translateAll(g, 60, 40); h.gm.push(g); select({ k: 'gm', i: h.gm.length - 1 }); commit(); }
    else if (sel.k === 'so') { const so = JSON.parse(JSON.stringify(h.solids[sel.i])); so.p = so.p.map((v, i) => v + (i % 2 ? 40 : 60)); h.solids.push(so); select({ k: 'so', i: h.solids.length - 1 }); commit(); }
  };
  E.nudge = function (dx, dy) {
    const sel = S.sel, h = S.hole; if (!sel) return;
    const was = seatState();
    if (sel.k === 'gm') translateAll(h.gm[sel.i], dx, dy);
    else if (sel.k === 'tee') { h.tee[0] += dx; h.tee[1] += dy; }
    else if (sel.k === 'cup') { h.cup[0] += dx; h.cup[1] += dy; }
    else if (sel.k === 'gp') moveGroundPoint(sel.i, h.ground[2 * sel.i] + dx, h.ground[2 * sel.i + 1] + dy);
    else if (sel.k === 'so') { const so = h.solids[sel.i]; so.p = so.p.map((v, i) => rnd(v + (i % 2 ? dy : dx))); }
    else return;
    if (sel.k === 'gp' || sel.k === 'so') reseat(was);
    changed('vals'); commit();
  };

  // ======================================================================== handles + hit testing ========================================================================
  const hr = () => (S.touch ? 15 : 9);          // handle radius (screen px)
  const wr = (px) => px / S.cam.z;               // screen px -> world
  const rectCorner = { tl: [0, 0], tr: [1, 0], bl: [0, 1], br: [1, 1] };
  const origin = (part, g) => part.from(g);

  // handles of the selected gimmick: [{x, y, part, kind, ...}]
  function gmHandles(g, gi) {
    const sp = specOf(g), out = [];
    sp.parts.forEach((part, pi) => {
      if (part.when && !part.when(g)) return;
      switch (part.p) {
        case 'rect':
          Object.keys(rectCorner).forEach((c) => out.push({ x: g.x + g.w * rectCorner[c][0], y: g.y + g.h * rectCorner[c][1], part: pi, kind: 'corner', corner: c }));
          break;
        case 'seg': out.push({ x: g.x, y: g.y, part: pi, kind: 'segend', end: 0 }, { x: g.x2, y: g.y2, part: pi, kind: 'segend', end: 1 }); break;
        case 'pt': out.push({ x: g[part.kx], y: g[part.ky], part: pi, kind: 'pt', name: part.name }); break;
        case 'len': { const o = origin(part, g); out.push({ x: o[0] + part.dir[0] * g[part.k] * part.scale, y: o[1] + part.dir[1] * g[part.k] * part.scale, part: pi, kind: 'len', small: true }); break; }
        case 'ang': { const o = origin(part, g), L = wr(part.len || 56); out.push({ x: o[0] + Math.cos(g[part.k]) * L, y: o[1] + Math.sin(g[part.k]) * L, part: pi, kind: 'ang', o, L }); break; }
        case 'vec': { const o = origin(part, g); out.push({ x: o[0] + g[part.kx] * part.scale, y: o[1] + g[part.ky] * part.scale, part: pi, kind: 'vec', o, small: true }); break; }
        case 'xrange': out.push({ x: g[part.k1], y: S.hole.cup[1], part: pi, kind: 'xr', key: part.k1 }, { x: g[part.k2], y: S.hole.cup[1], part: pi, kind: 'xr', key: part.k2 }); break;
        case 'hline': out.push({ x: clamp(S.cam.x, 0, S.hole.w), y: g[part.k], part: pi, kind: 'hline', key: part.k }); break;
        case 'pts': case 'poly': { const L = g[part.k] || []; for (let i = 0; i < L.length; i += 2) out.push({ x: L[i], y: L[i + 1], part: pi, kind: 'lpt', idx: i / 2 }); break; }
        case 'rects': {
          const L = g[part.k] || [], sub = S.sel && S.sel.sub;
          if (sub && sub.p === pi && L[sub.i]) { const r = L[sub.i]; Object.keys(rectCorner).forEach((c) => out.push({ x: r[0] + r[2] * rectCorner[c][0], y: r[1] + r[3] * rectCorner[c][1], part: pi, kind: 'rcorner', idx: sub.i, corner: c })); }
          break;
        }
        default: break;
      }
    });
    return out;
  }
  const snapV = (v, step) => (S.snap && !S.noSnap ? Math.round(v / step) * step : rnd(v));
  const snapP = (x, y) => [snapV(x, S.grid), snapV(y, S.grid)];
  // apply a handle drag to g (g0 = copy at drag start)
  function dragHandle(g, g0, H, wx, wy) {
    const sp = specOf(g), part = sp.parts[H.part];
    const [sx, sy] = snapP(wx, wy);
    switch (H.kind) {
      case 'corner': {
        const c = rectCorner[H.corner], ax = g0.x + g0.w * (1 - c[0]), ay = g0.y + g0.h * (1 - c[1]);
        let x0 = Math.min(sx, ax), x1 = Math.max(sx, ax), y0 = Math.min(sy, ay), y1 = Math.max(sy, ay);
        if (x1 - x0 < 8) { x1 = x0 + 8; } if (y1 - y0 < 8) { y1 = y0 + 8; }
        g.x = x0; g.y = y0; g.w = x1 - x0; g.h = y1 - y0; break;
      }
      case 'segend': if (H.end === 0) { g.x = sx; g.y = sy; } else { g.x2 = sx; g.y2 = sy; } break;
      case 'pt': if (!part.lockX) g[part.kx] = sx; if (!part.lockY) g[part.ky] = sy; break;
      case 'len': {
        const o = origin(part, g), v = ((wx - o[0]) * part.dir[0] + (wy - o[1]) * part.dir[1]) / part.scale;
        let val = S.snap && !S.noSnap ? Math.round(v / 5) * 5 : rnd(v);
        const f = sp.keys[part.k]; val = clamp(val, f && f.min !== undefined ? f.min : 1, f && f.max !== undefined ? f.max : 1e5); g[part.k] = val; break;
      }
      case 'ang': {
        let a = Math.atan2(wy - H.o[1], wx - H.o[0]);
        if (S.snap && !S.noSnap) a = Math.round(a / (Math.PI / 24)) * (Math.PI / 24);
        g[part.k] = r3(a); break;
      }
      case 'vec': { const o = origin(part, g); g[part.kx] = snapV((wx - o[0]) / part.scale, 10); g[part.ky] = snapV((wy - o[1]) / part.scale, 10); break; }
      case 'xr': { const other = H.key === part.k1 ? part.k2 : part.k1; g[H.key] = sx; if (H.key === part.k1 && g[part.k1] > g[part.k2]) g[part.k2] = g[part.k1]; if (H.key === part.k2 && g[part.k2] < g[part.k1]) g[part.k1] = g[part.k2]; void other; break; }
      case 'hline': g[H.key] = sy; break;
      case 'lpt': {
        const L = g[part.k]; L[2 * H.idx] = sx; L[2 * H.idx + 1] = sy;
        if (part.ground) { const s = surfaceAt(sx, sy, 'near'); if (s) L[2 * H.idx + 1] = rnd(s.y); }
        break;
      }
      case 'rcorner': {
        const r0 = g0[part.k][H.idx], c = rectCorner[H.corner], ax = r0[0] + r0[2] * (1 - c[0]), ay = r0[1] + r0[3] * (1 - c[1]);
        let x0 = Math.min(sx, ax), x1 = Math.max(sx, ax), y0 = Math.min(sy, ay), y1 = Math.max(sy, ay);
        if (x1 - x0 < 8) x1 = x0 + 8; if (y1 - y0 < 8) y1 = y0 + 8;
        g[part.k][H.idx] = [x0, y0, x1 - x0, y1 - y0]; break;
      }
      default: break;
    }
  }

  // body shapes of a gimmick for hit testing: [{t, ..., part, sub, area}]
  function gmShapes(g) {
    const sp = specOf(g), out = [];
    sp.parts.forEach((part, pi) => {
      if (part.when && !part.when(g)) return;
      switch (part.p) {
        case 'rect': out.push({ t: 'rect', x: g.x, y: g.y, w: g.w, h: g.h, part: pi }); break;
        case 'seg': out.push({ t: 'seg', ax: g.x, ay: g.y, bx: g.x2, by: g.y2, part: pi }); break;
        case 'pt': out.push({ t: 'circ', x: g[part.kx], y: g[part.ky], r: part.r ? (g[part.r] || 0) : 0, part: pi }); break;
        case 'pts': case 'poly': { ptsOf(g, part).forEach((p, i) => out.push({ t: 'circ', x: p[0], y: p[1], r: part.p === 'pts' ? (g.r || 16) : 0, part: pi, sub: i })); break; }
        case 'rects': (g[part.k] || []).forEach((r, i) => out.push({ t: 'rect', x: r[0], y: r[1], w: r[2], h: r[3], part: pi, sub: i })); break;
        case 'xrange': out.push({ t: 'seg', ax: g[part.k1], ay: S.hole.cup[1], bx: g[part.k2], by: S.hole.cup[1], part: pi }); break;
        case 'hline': out.push({ t: 'seg', ax: -1e5, ay: g[part.k], bx: 1e5, by: g[part.k], part: pi }); break;
        default: break;
      }
    });
    return out;
  }
  // -> {prio, area, part, sub} or null
  function shapeHit(sh, wx, wy, tol) {
    if (sh.t === 'rect') {
      if (wx < sh.x - tol || wx > sh.x + sh.w + tol || wy < sh.y - tol || wy > sh.y + sh.h + tol) return null;
      const inside = wx >= sh.x && wx <= sh.x + sh.w && wy >= sh.y && wy <= sh.y + sh.h;
      const edge = Math.min(Math.abs(wx - sh.x), Math.abs(wx - sh.x - sh.w), Math.abs(wy - sh.y), Math.abs(wy - sh.y - sh.h));
      const small = sh.w < tol * 4 && sh.h < tol * 4;
      if (!inside && edge > tol) return null;
      return { prio: edge <= tol || small ? 0 : 1, area: sh.w * sh.h };
    }
    if (sh.t === 'seg') { const d = dist2seg(wx, wy, sh.ax, sh.ay, sh.bx, sh.by); return d <= tol * 1.2 ? { prio: 0, area: 0 } : null; }
    if (sh.t === 'circ') { const d = Math.hypot(wx - sh.x, wy - sh.y); if (d <= tol * 1.3) return { prio: 0, area: 1 }; if (d <= sh.r) return { prio: 1, area: Math.PI * sh.r * sh.r }; return null; }
    return null;
  }

  // full hit test at screen point (relative to overlay). -> {k, ...} | null
  function hitTest(sx, sy) {
    const h = S.hole, z = S.cam.z, [wx, wy] = s2w(sx, sy), tol = wr(hr() + 4), ptol = wr(S.touch ? 18 : 10);
    // 1) handles of the selection
    if (S.sel && S.sel.k === 'gm' && h.gm[S.sel.i]) {
      const g = h.gm[S.sel.i], hs = gmHandles(g, S.sel.i);
      let best = null, bd = 1e9;
      hs.forEach((H) => { const d = Math.hypot(wx - H.x, wy - H.y); if (d <= tol && d < bd) { bd = d; best = H; } });
      if (best) return { k: 'handle', gi: S.sel.i, H: best };
    }
    if (S.sel && S.sel.k === 'so' && h.solids[S.sel.i]) {
      const so = h.solids[S.sel.i], n = so.p.length / 2;
      for (let v = 0; v < n; v++) if (Math.hypot(wx - so.p[2 * v], wy - so.p[2 * v + 1]) <= tol) return { k: 'sv', i: S.sel.i, v };
      for (let e = 0; e < n; e++) { const j = (e + 1) % n; const mx = (so.p[2 * e] + so.p[2 * j]) / 2, my = (so.p[2 * e + 1] + so.p[2 * j + 1]) / 2; const L = Math.hypot(so.p[2 * j] - so.p[2 * e], so.p[2 * j + 1] - so.p[2 * e + 1]); if (L * z > 44 && Math.hypot(wx - mx, wy - my) <= tol * 0.9) return { k: 'smid', i: S.sel.i, e }; }
    }
    // 2) tee / cup
    const tee = h.tee, cup = h.cup;
    if (Math.hypot(wx - tee[0], wy - tee[1]) <= tol * 1.2) return { k: 'tee' };
    if (Math.hypot(wx - cup[0], wy - (cup[1] - 14 / Math.min(1, z))) <= tol * 1.2 || Math.hypot(wx - cup[0], wy - cup[1]) <= tol * 1.2) return { k: 'cup' };
    // 3) ground points
    const g = h.ground;
    let gb = -1, gd = 1e9;
    for (let i = 0; i < g.length; i += 2) { const d = Math.hypot(wx - g[i], wy - g[i + 1]); if (d <= tol && d < gd) { gd = d; gb = i / 2; } }
    if (gb >= 0) return { k: 'gp', i: gb };
    // 4) solid vertices
    for (let si = h.solids.length - 1; si >= 0; si--) { const so = h.solids[si], n = so.p.length / 2; for (let v = 0; v < n; v++) if (Math.hypot(wx - so.p[2 * v], wy - so.p[2 * v + 1]) <= tol) return { k: 'sv', i: si, v }; }
    // 5) gimmicks (precise first, then area)
    let best = null;
    for (let gi = h.gm.length - 1; gi >= 0; gi--) {
      const gg = h.gm[gi];
      for (const sh of gmShapes(gg)) {
        const r = shapeHit(sh, wx, wy, ptol);
        if (!r) continue;
        const cand = { k: 'gm', i: gi, part: sh.part, sub: sh.sub, prio: r.prio, area: r.area };
        if (!best || cand.prio < best.prio || (cand.prio === best.prio && cand.area < best.area)) best = cand;
      }
    }
    if (best && best.prio === 0) return best;
    // 6) solid edges + ground segments
    for (let si = h.solids.length - 1; si >= 0; si--) {
      const so = h.solids[si], n = so.p.length / 2;
      for (let e = 0; e < n; e++) { const j = (e + 1) % n; if (dist2seg(wx, wy, so.p[2 * e], so.p[2 * e + 1], so.p[2 * j], so.p[2 * j + 1]) <= ptol) return { k: 'se', i: si, e }; }
    }
    for (let i = 0; i + 3 < g.length; i += 2) if (dist2seg(wx, wy, g[i], g[i + 1], g[i + 2], g[i + 3]) <= ptol) return { k: 'gs', i: i / 2 };
    if (best) return best;
    for (let si = h.solids.length - 1; si >= 0; si--) if (Ph.pointInPoly(h.solids[si].p, wx, wy)) return { k: 'sb', i: si };
    return null;
  }

  // ======================================================================== camera / coordinates ========================================================================
  const w2s = (x, y) => [(x - S.cam.x) * S.cam.z + S.vw / 2, (y - S.cam.y) * S.cam.z + S.vh / 2];
  const s2w = (sx, sy) => [(sx - S.vw / 2) / S.cam.z + S.cam.x, (sy - S.vh / 2) / S.cam.z + S.cam.y];
  E.w2s = w2s; E.s2w = s2w;
  function zoomAt(f, sx, sy) {
    const [wx, wy] = s2w(sx, sy);
    S.cam.z = clamp(S.cam.z * f, 0.02, 3);
    S.cam.x = wx - (sx - S.vw / 2) / S.cam.z; S.cam.y = wy - (sy - S.vh / 2) / S.cam.z;
  }
  E.zoomBy = (f) => zoomAt(f, S.vw / 2, S.vh / 2);
  E.fit = function () {
    const h = S.hole; if (!h) return;
    let x0 = 0, x1 = h.w, y0 = 1e9, y1 = -1e9;
    for (let i = 1; i < h.ground.length; i += 2) { y0 = Math.min(y0, h.ground[i]); y1 = Math.max(y1, h.ground[i]); }
    y0 = Math.min(y0, h.tee[1] - 300, h.cup[1] - 300); y1 = Math.max(y1 + 120, h.cup[1] + 200);
    const pad = 80, zx = (S.vw - 20) / (x1 - x0 + pad), zy = (S.vh - 20) / (y1 - y0 + pad);
    S.cam.z = clamp(Math.min(zx, zy), 0.02, 1); S.cam.x = (x0 + x1) / 2; S.cam.y = (y0 + y1) / 2;
  };
  E.focus = function (x, y, z) { S.cam.x = x; S.cam.y = y; if (z) S.cam.z = z; };
  E.focusSel = function () {
    const sel = S.sel, h = S.hole; if (!sel) return;
    let p = null;
    if (sel.k === 'tee') p = h.tee; else if (sel.k === 'cup') p = h.cup;
    else if (sel.k === 'gm') { const b = G.Generator && G.Generator.gimmickBox ? G.Generator.gimmickBox(h.gm[sel.i]) : null; if (b) p = [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2]; else { const g = h.gm[sel.i]; p = [g.x !== undefined ? g.x : S.cam.x, g.y !== undefined ? g.y : S.cam.y]; } }
    else if (sel.k === 'gp') p = [h.ground[2 * sel.i], h.ground[2 * sel.i + 1]];
    else if (sel.k === 'so') { const b = solidBox(h.solids[sel.i]); p = [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2]; }
    if (p) { S.cam.x = p[0]; S.cam.y = p[1]; }
  };
  // measure the stage (the overlay canvas box)
  function measure() {
    const cv = S.cv; if (!cv) return;
    const r = cv.getBoundingClientRect();
    const w = Math.max(1, Math.round(r.width)), h = Math.max(1, Math.round(r.height));
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); }
    S.vw = w; S.vh = h; S.ox = r.left; S.oy = r.top; S.dpr = dpr;
  }
  E.measure = measure;

  // ======================================================================== validation ========================================================================
  const CLEAR_EXEMPT = { wind: 1, fog: 1, lowgrav: 1, antigrav: 1, sidegrav: 1, slowmo: 1, drag: 1, movcup: 1, shrinkcup: 1, blinkcup: 1, flood: 1, liftcup: 1, gwell: 1, tornado: 1, floatpool: 1, magnet: 1 };
  const GM_NAME = (t) => { const I = G.Manifest && G.Manifest.GIMMICK_INFO && G.Manifest.GIMMICK_INFO[t]; return (I && I.name) || t; };
  E.gmName = GM_NAME;
  function segsCross(a, b, c, d) {
    const o = (p, q, r) => (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
    const d1 = o(a, b, c), d2 = o(a, b, d), d3 = o(c, d, a), d4 = o(c, d, b);
    return ((d1 > 0) !== (d2 > 0)) && ((d3 > 0) !== (d4 > 0)) && d1 * d2 < 0 && d3 * d4 < 0;
  }
  function validate() {
    const h = S.hole, out = [];
    const add = (sev, msg, sel, fix) => out.push({ sev, msg, sel: sel || null, fix: fix || null });
    let errs = [];
    try { errs = G.Generator.validateHole(h); } catch (e) { errs = ['broken']; }
    const T = { 'tee inside solid': ['Tee is inside the ground or a solid', { k: 'tee' }], 'tee overlaps terrain': ['Tee is touching terrain — give the ball some room', { k: 'tee' }],
      'tee not supported': ['Tee is floating — it must rest on a surface', { k: 'tee' }, 'seatTee'], 'cup inside solid': ['Cup is inside the ground or a solid', { k: 'cup' }],
      'cup overlaps terrain': ['Cup is wedged into terrain — level the ground around it', { k: 'cup' }, 'makeGreen'], 'cup not on surface': ['Cup must sit on a surface', { k: 'cup' }, 'seatCup'],
      'ground x not increasing': ['Ground points must run left to right', null], 'gs length mismatch': ['Ground surfaces do not match its points', null] };
    errs.forEach((e) => {
      if (T[e]) add('err', T[e][0], T[e][1], T[e][2]);
      else if (/overlaps tee\/cup$/.test(e)) {
        const t = e.split(' ')[0];
        const gi = h.gm.findIndex((g) => g.t === t && !CLEAR_EXEMPT[t] && G.Generator.gimmickBoxes(g).some((b) => [[h.tee[0], h.tee[1]], [h.cup[0], h.cup[1] - R6]].some(([x, y]) => x > b[0] - 20 && x < b[2] + 20 && y > b[1] - 20 && y < b[3] + 20)));
        add('err', GM_NAME(t) + ' overlaps the tee or cup — move it away', gi >= 0 ? { k: 'gm', i: gi } : null);
      } else add('err', e, null);
    });
    if (h.tee[0] < 0 || h.tee[0] > h.w) add('err', 'Tee is outside the hole', { k: 'tee' });
    if (h.cup[0] < 0 || h.cup[0] > h.w) add('err', 'Cup is outside the hole', { k: 'cup' });
    h.solids.forEach((so, si) => {
      const n = so.p.length / 2; let bad = false;
      for (let a = 0; a < n && !bad; a++) for (let b = a + 2; b < n && !bad; b++) {
        if (a === 0 && b === n - 1) continue;
        const a2 = (a + 1) % n, b2 = (b + 1) % n;
        if (segsCross([so.p[2 * a], so.p[2 * a + 1]], [so.p[2 * a2], so.p[2 * a2 + 1]], [so.p[2 * b], so.p[2 * b + 1]], [so.p[2 * b2], so.p[2 * b2 + 1]])) bad = true;
      }
      if (bad) add('warn', 'Solid #' + (si + 1) + ' crosses itself — its inside may behave oddly', { k: 'so', i: si });
    });
    const count = {}; h.gm.forEach((g, i) => { (count[g.t] = count[g.t] || []).push(i); });
    ['movcup', 'liftcup', 'blinkcup', 'flood', 'tokens', 'shrinkcup'].forEach((t) => { if (count[t] && count[t].length > 1) add('warn', 'Only one ' + GM_NAME(t) + ' works per hole — the others are ignored', { k: 'gm', i: count[t][1] }); });
    const cupCtl = ['movcup', 'liftcup', 'blinkcup'].filter((t) => count[t]);
    if (cupCtl.length > 1) add('warn', 'Moving-cup gimmicks fight each other: keep just one of ' + cupCtl.map(GM_NAME).join(' / '), { k: 'gm', i: count[cupCtl[1]][0] });
    h.gm.forEach((g, i) => { if (g.t === 'tokens' && g.pts.length / 2 > 30) add('warn', 'More than 30 stars will not all count', { k: 'gm', i }); });
    if (h.gm.some((g) => g.t === 'liftcup' || g.t === 'blinkcup' || g.t === 'movcup')) add('info', 'A moving-cup gimmick controls where the cup really is — the cup marker is only its base.', null);
    if (!errs.length && !h.bot) add('info', h.gm.length ? 'Not verified yet — use “Prove it’s beatable”.' : 'Not verified yet.', null);
    return out;
  }
  E.validate = validate;
  E.hasErrors = () => S.issues.some((i) => i.sev === 'err');

  // ======================================================================== rebuild ========================================================================
  function theme() { return G.Run.themeFor(S.hole, G.Manifest && G.Manifest.byId && G.Manifest.byId[S.hole.theme]); }
  function rebuild() {
    S.dirty = false;
    const h = S.hole;
    S.sceneN = h.gm.length;
    fixDerived();
    const gk = HS.geoKey(h);
    if (gk !== S.geo) {
      S.geo = gk;
      if (h.bot) { delete h.bot; S.ghost = null; }
      S.verified = null;
    }
    S.theme = theme();
    try {
      S.W = Ph.createWorld(h); S.ps = Ph.initState(S.W);
      App().R.setHole(h, S.theme, { holeNum: 1 });
      S.worldErr = null;
    } catch (e) { S.worldErr = e; console.warn('[editor] world build failed', e); }
    S.issues = validate();
    changed('issues', 'top', 'hole');
  }

  // ======================================================================== rendering ========================================================================
  const COL = { acc: '#ffc93c', white: '#ffffff', bad: '#ff5c6c', good: '#42d583', info: '#5ab0ff', grid: 'rgba(255,255,255,0.10)', dim: 'rgba(255,255,255,0.55)' };
  function drawHole(time, dt) {
    const A = App(), R = A.R;
    if (!S.W || !S.ps || S.worldErr) { const c = A.canvas.getContext('2d'); c.setTransform(1, 0, 0, 1, 0, 0); c.fillStyle = '#10182f'; c.fillRect(0, 0, A.canvas.width, A.canvas.height); return; }
    S.ps.t = S.time; S.ps.strokes = S.strokes;
    const z = S.cam.z, cssW = A.vw, cssH = A.vh;
    const cam = { x: S.cam.x + (cssW / 2 - S.ox - S.vw / 2) / z, y: S.cam.y + (cssH / 2 - S.oy - S.vh / 2) / z, zoom: z };
    const f = { cam, W: S.W, S: S.ps, time, dt: Math.min(dt, 0.05), a11y: { colorblind: false, reducedFx: true }, fogReveal: S.hole.gm.map((g) => (g.t === 'fog' ? 0.78 : 0)) };
    if (S.ghost) {
      const dur = S.ghost.points.length / 2 / 60, per = dur + 0.8, ph = ((time - S.ghost.t0) % per);
      f.ghost = { points: S.ghost.points, t: Math.min(1, ph / dur), bot: true };
    }
    try { R.draw(f); } catch (e) { if (!S.rerr) { S.rerr = true; console.error('[editor render]', e); } }
  }
  const surfCol = (c) => (HS.SURF_BY[c] ? HS.SURF_BY[c].col : '#ffffff');
  function drawOverlay() {
    const cv = S.cv, c = cv.getContext('2d'), dpr = S.dpr || 1, h = S.hole, z = S.cam.z;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.clearRect(0, 0, S.vw, S.vh);
    const P = (x, y) => w2s(x, y);
    // grid
    if (S.snap && S.guides) {
      let step = S.grid; while (step * z < 14) step *= 5;
      const [wx0, wy0] = s2w(0, 0), [wx1, wy1] = s2w(S.vw, S.vh);
      c.strokeStyle = COL.grid; c.lineWidth = 1; c.beginPath();
      for (let x = Math.floor(wx0 / step) * step; x <= wx1; x += step) { const sx = Math.round(P(x, 0)[0]) + 0.5; c.moveTo(sx, 0); c.lineTo(sx, S.vh); }
      for (let y = Math.floor(wy0 / step) * step; y <= wy1; y += step) { const sy = Math.round(P(0, y)[1]) + 0.5; c.moveTo(0, sy); c.lineTo(S.vw, sy); }
      c.stroke();
    }
    // world bounds
    c.save(); c.setLineDash([8, 6]); c.strokeStyle = 'rgba(255,255,255,0.45)'; c.lineWidth = 1.5;
    const a = P(0, -3000), b = P(h.w, h.h); c.strokeRect(a[0], P(0, -2600)[1], b[0] - a[0], b[1] - P(0, -2600)[1]); c.restore();
    // ground surfaces
    const g = h.ground;
    c.lineCap = 'round'; c.lineJoin = 'round';
    for (let i = 0; i + 3 < g.length; i += 2) {
      const ch = h.gs.charAt(i / 2), p0 = P(g[i], g[i + 1]), p1 = P(g[i + 2], g[i + 3]);
      const sel = S.sel && S.sel.k === 'gs' && S.sel.i === i / 2;
      if (p1[0] < -50 || p0[0] > S.vw + 50) continue;
      c.strokeStyle = 'rgba(8,12,28,0.78)'; c.globalAlpha = 1; c.lineWidth = sel ? 9 : 6.5;
      c.beginPath(); c.moveTo(p0[0], p0[1]); c.lineTo(p1[0], p1[1]); c.stroke();
      c.strokeStyle = surfCol(ch); c.globalAlpha = sel ? 1 : 0.95; c.lineWidth = sel ? 6 : 3.5;
      c.beginPath(); c.moveTo(p0[0], p0[1]); c.lineTo(p1[0], p1[1]); c.stroke();
      if (sel) { c.strokeStyle = COL.white; c.lineWidth = 1.5; c.stroke(); }
    }
    c.globalAlpha = 1;
    for (let i = 0; i < g.length; i += 2) {
      const p = P(g[i], g[i + 1]); if (p[0] < -20 || p[0] > S.vw + 20) continue;
      const sel = S.sel && S.sel.k === 'gp' && S.sel.i === i / 2;
      dot(c, p[0], p[1], sel ? hr() : (S.tool === 'ground' ? 5 : 3.2), sel ? COL.acc : 'rgba(255,255,255,0.85)', sel ? '#222' : 'rgba(0,0,0,0.5)');
    }
    // solids
    h.solids.forEach((so, si) => {
      const n = so.p.length / 2, sel = S.sel && S.sel.k === 'so' && S.sel.i === si;
      if (sel) { c.beginPath(); for (let v = 0; v < n; v++) { const p = P(so.p[2 * v], so.p[2 * v + 1]); if (v) c.lineTo(p[0], p[1]); else c.moveTo(p[0], p[1]); } c.closePath(); c.fillStyle = 'rgba(255,201,60,0.13)'; c.fill(); }
      for (let e = 0; e < n; e++) {
        const j = (e + 1) % n, p0 = P(so.p[2 * e], so.p[2 * e + 1]), p1 = P(so.p[2 * j], so.p[2 * j + 1]);
        const ch = so.s.length > 1 ? so.s.charAt(e) : so.s, es = sel && S.sel.e === e;
        c.strokeStyle = 'rgba(8,12,28,0.78)'; c.lineWidth = es ? 9 : 6.5; c.globalAlpha = 1;
        c.beginPath(); c.moveTo(p0[0], p0[1]); c.lineTo(p1[0], p1[1]); c.stroke();
        c.strokeStyle = surfCol(ch); c.lineWidth = es ? 6 : 3.5; c.globalAlpha = 0.95;
        c.beginPath(); c.moveTo(p0[0], p0[1]); c.lineTo(p1[0], p1[1]); c.stroke();
        if (es) { c.strokeStyle = COL.white; c.lineWidth = 1.5; c.stroke(); }
      }
      c.globalAlpha = 1;
      for (let v = 0; v < n; v++) { const p = P(so.p[2 * v], so.p[2 * v + 1]), vs = sel && S.sel.v === v; dot(c, p[0], p[1], vs ? hr() : sel ? hr() * 0.75 : 3.2, vs ? COL.acc : sel ? COL.white : 'rgba(255,255,255,0.8)', '#222'); }
      if (sel) for (let e = 0; e < n; e++) {
        const j = (e + 1) % n, ax = so.p[2 * e], ay = so.p[2 * e + 1], bx = so.p[2 * j], by = so.p[2 * j + 1];
        if (Math.hypot(bx - ax, by - ay) * z < 44) continue;
        const m = P((ax + bx) / 2, (ay + by) / 2); c.fillStyle = 'rgba(0,0,0,0.5)'; c.beginPath(); c.arc(m[0], m[1], hr() * 0.8, 0, TAU); c.fill();
        c.strokeStyle = COL.white; c.lineWidth = 1.6; c.beginPath(); c.moveTo(m[0] - 4, m[1]); c.lineTo(m[0] + 4, m[1]); c.moveTo(m[0], m[1] - 4); c.lineTo(m[0], m[1] + 4); c.stroke();
      }
    });
    // gimmick outlines
    h.gm.forEach((gg, gi) => {
      const sel = S.sel && S.sel.k === 'gm' && S.sel.i === gi;
      drawGimmickGuide(c, gg, gi, sel);
    });
    // tee + cup
    drawMarker(c, 'tee'); drawMarker(c, 'cup');
    // issues
    S.issues.forEach((it) => {
      if (it.sev !== 'err' || !it.sel) return;
      let p = null;
      if (it.sel.k === 'tee') p = h.tee; else if (it.sel.k === 'cup') p = h.cup;
      else if (it.sel.k === 'gm' && h.gm[it.sel.i]) { const bx = G.Generator.gimmickBox(h.gm[it.sel.i]); if (bx) p = [(bx[0] + bx[2]) / 2, (bx[1] + bx[3]) / 2]; }
      if (!p) return;
      const q = w2s(p[0], p[1]); const pulse = 0.5 + 0.5 * Math.sin(performance.now() / 220);
      c.strokeStyle = COL.bad; c.globalAlpha = 0.5 + 0.5 * pulse; c.lineWidth = 3; c.beginPath(); c.arc(q[0], q[1], 22 + pulse * 4, 0, TAU); c.stroke(); c.globalAlpha = 1;
    });
    // handles of the selected gimmick
    if (S.sel && S.sel.k === 'gm' && h.gm[S.sel.i]) {
      const gg = h.gm[S.sel.i], hs = gmHandles(gg, S.sel.i);
      // helper lines
      const sp = specOf(gg);
      hs.forEach((H) => {
        const part = sp.parts[H.part], q = w2s(H.x, H.y);
        if (H.kind === 'ang' || H.kind === 'vec' || H.kind === 'len') { const o = w2s((H.o || origin(part, gg))[0], (H.o || origin(part, gg))[1]); c.strokeStyle = COL.acc; c.lineWidth = 1.5; c.setLineDash([4, 3]); c.beginPath(); c.moveTo(o[0], o[1]); c.lineTo(q[0], q[1]); c.stroke(); c.setLineDash([]); }
        const hot = S.hover && S.hover.k === 'handle' && S.hover.H.part === H.part && S.hover.H.kind === H.kind && S.hover.H.idx === H.idx && S.hover.H.corner === H.corner && S.hover.H.end === H.end;
        const active = S.drag && S.drag.H && S.drag.H === H;
        const rr = (H.small ? 0.75 : 1) * hr() * (hot || active ? 1.2 : 1);
        if (H.kind === 'ang') { c.fillStyle = COL.acc; c.strokeStyle = '#222'; c.lineWidth = 2; c.beginPath(); c.arc(q[0], q[1], rr, 0, TAU); c.fill(); c.stroke(); c.fillStyle = '#222'; c.beginPath(); c.arc(q[0], q[1], rr * 0.3, 0, TAU); c.fill(); }
        else if (H.kind === 'corner' || H.kind === 'rcorner') { c.fillStyle = COL.white; c.strokeStyle = '#222'; c.lineWidth = 2; c.fillRect(q[0] - rr * 0.8, q[1] - rr * 0.8, rr * 1.6, rr * 1.6); c.strokeRect(q[0] - rr * 0.8, q[1] - rr * 0.8, rr * 1.6, rr * 1.6); }
        else if (H.kind === 'len' || H.kind === 'vec' || H.kind === 'hline' || H.kind === 'xr') { c.fillStyle = COL.acc; c.strokeStyle = '#222'; c.lineWidth = 2; c.beginPath(); c.moveTo(q[0], q[1] - rr); c.lineTo(q[0] + rr, q[1]); c.lineTo(q[0], q[1] + rr); c.lineTo(q[0] - rr, q[1]); c.closePath(); c.fill(); c.stroke(); }
        else dot(c, q[0], q[1], rr, S.sel.sub && S.sel.sub.p === H.part && S.sel.sub.i === H.idx && H.kind === 'lpt' ? COL.acc : COL.white, '#222');
        if (H.name && (hot || H.kind === 'pt')) { c.font = '700 11px system-ui, sans-serif'; c.fillStyle = COL.white; c.strokeStyle = 'rgba(0,0,0,0.65)'; c.lineWidth = 3; c.textAlign = 'center'; c.strokeText(H.name, q[0], q[1] - rr - 5); c.fillText(H.name, q[0], q[1] - rr - 5); }
      });
    }
    // polygon in progress
    const d = S.drawing;
    if (d) {
      c.strokeStyle = COL.acc; c.lineWidth = 2.5; c.setLineDash([]);
      c.beginPath(); d.pts.forEach((p, i) => { const q = P(p[0], p[1]); if (i) c.lineTo(q[0], q[1]); else c.moveTo(q[0], q[1]); });
      if (S.cursor && d.pts.length) { const q = P(S.cursor[0], S.cursor[1]); c.lineTo(q[0], q[1]); if (d.pts.length >= 2) { c.setLineDash([5, 4]); const q0 = P(d.pts[0][0], d.pts[0][1]); c.lineTo(q0[0], q0[1]); } }
      c.stroke(); c.setLineDash([]);
      d.pts.forEach((p, i) => { const q = P(p[0], p[1]); dot(c, q[0], q[1], i === 0 && d.pts.length >= 3 ? hr() : 5, i === 0 ? COL.good : COL.white, '#222'); });
    }
    // placement / draw cursor
    if (S.cursor && (S.place || (S.tool === 'tee' || S.tool === 'cup' || (S.tool === 'solid' && d)))) {
      const q = P(S.cursor[0], S.cursor[1]); c.strokeStyle = COL.acc; c.lineWidth = 1.5; c.beginPath(); c.moveTo(q[0] - 10, q[1]); c.lineTo(q[0] + 10, q[1]); c.moveTo(q[0], q[1] - 10); c.lineTo(q[0], q[1] + 10); c.stroke();
      if (S.place) { c.font = '800 12px system-ui, sans-serif'; c.fillStyle = COL.acc; c.textAlign = 'left'; c.strokeStyle = 'rgba(0,0,0,0.7)'; c.lineWidth = 3; c.strokeText(GM_NAME(S.place), q[0] + 12, q[1] - 8); c.fillText(GM_NAME(S.place), q[0] + 12, q[1] - 8); }
    }
    // add-points mode banner is DOM (editor-ui)
  }
  function dot(c, x, y, r, fill, stroke) { c.fillStyle = fill; c.strokeStyle = stroke; c.lineWidth = 2; c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill(); c.stroke(); }
  function drawMarker(c, which) {
    const h = S.hole, p = which === 'tee' ? h.tee : h.cup, q = w2s(p[0], p[1]);
    const sel = S.sel && S.sel.k === which, hot = S.hover && S.hover.k === which;
    const r = (sel || hot ? 1.25 : 1) * 13;
    c.lineWidth = sel ? 3 : 2;
    if (which === 'tee') { c.strokeStyle = sel ? COL.acc : 'rgba(255,255,255,0.9)'; c.beginPath(); c.arc(q[0], q[1], r, 0, TAU); c.stroke(); c.font = '800 11px system-ui, sans-serif'; c.fillStyle = c.strokeStyle; c.textAlign = 'center'; c.fillText('TEE', q[0], q[1] - r - 5); }
    else {
      c.strokeStyle = sel ? COL.acc : 'rgba(255,255,255,0.9)'; c.beginPath(); c.moveTo(q[0], q[1]); c.lineTo(q[0], q[1] - 34); c.stroke();
      c.fillStyle = sel ? COL.acc : '#ff4d5e'; c.beginPath(); c.moveTo(q[0], q[1] - 34); c.lineTo(q[0] + 18, q[1] - 28); c.lineTo(q[0], q[1] - 22); c.fill();
      c.strokeStyle = sel ? COL.acc : 'rgba(255,255,255,0.9)'; c.beginPath(); c.arc(q[0], q[1], r * 0.7, 0, TAU); c.stroke();
    }
  }
  function drawGimmickGuide(c, g, gi, sel) {
    const sp = specOf(g), hov = S.hover && S.hover.k === 'gm' && S.hover.i === gi;
    const col = sel ? COL.acc : hov ? '#fff' : 'rgba(120,200,255,0.75)';
    c.strokeStyle = col; c.fillStyle = sel ? 'rgba(255,201,60,0.10)' : 'rgba(120,200,255,0.05)'; c.lineWidth = sel ? 2.2 : 1.3;
    c.setLineDash(sel ? [] : [5, 4]);
    let anchor = null;
    gmShapes(g).forEach((sh) => {
      const part = sp.parts[sh.part];
      if (sh.t === 'rect') { const a = w2s(sh.x, sh.y), b = w2s(sh.x + sh.w, sh.y + sh.h); c.fillRect(a[0], a[1], b[0] - a[0], b[1] - a[1]); c.strokeStyle = part && part.color ? part.color : col; c.strokeRect(a[0], a[1], b[0] - a[0], b[1] - a[1]); c.strokeStyle = col; if (!anchor) anchor = [a[0], a[1]]; }
      else if (sh.t === 'seg') { if (Math.abs(sh.ax) > 5e4) { const y = w2s(0, sh.ay)[1]; c.beginPath(); c.moveTo(0, y); c.lineTo(S.vw, y); c.stroke(); if (!anchor) anchor = [60, y]; } else { const a = w2s(sh.ax, sh.ay), b = w2s(sh.bx, sh.by); c.beginPath(); c.moveTo(a[0], a[1]); c.lineTo(b[0], b[1]); c.stroke(); if (!anchor) anchor = a; } }
      else if (sh.t === 'circ') { const a = w2s(sh.x, sh.y), rr = Math.max(sh.r * S.cam.z, 5); c.beginPath(); c.arc(a[0], a[1], rr, 0, TAU); c.fill(); c.stroke(); if (!anchor) anchor = a; }
    });
    // polyline connection for tube paths + range indicators
    sp.parts.forEach((part) => {
      if (part.when && !part.when(g)) return;
      if (part.p === 'poly') { c.beginPath(); ptsOf(g, part).forEach((p, i) => { const q = w2s(p[0], p[1]); if (i) c.lineTo(q[0], q[1]); else c.moveTo(q[0], q[1]); }); c.lineWidth = sel ? 3 : 1.5; c.stroke(); }
      if (part.p === 'pt' && part.ghost) { const a = w2s(g[part.kx], g[part.ky]), b = w2s(g[part.kx] + g[part.ghost[0]], g[part.ky] + g[part.ghost[1]]); c.strokeRect(a[0], a[1], b[0] - a[0], b[1] - a[1]); const o = w2s(g.x, g.y); c.beginPath(); c.moveTo(o[0], o[1]); c.lineTo(a[0], a[1]); c.stroke(); }
      if (part.p === 'pt' && part.r && g[part.r]) { /* circle already drawn by shape */ }
    });
    if (g.t === 'piston') { const a = w2s(g.x + g.dx, g.y + g.dy), b = w2s(g.x + g.dx + g.w, g.y + g.dy + g.h); c.strokeRect(a[0], a[1], b[0] - a[0], b[1] - a[1]); }
    if (g.t === 'crusher') { const a = w2s(g.x, g.y + g.dy), b = w2s(g.x + g.w, g.y + g.dy + g.h); c.strokeRect(a[0], a[1], b[0] - a[0], b[1] - a[1]); }
    if (g.t === 'pendulum') { const a = w2s(g.x, g.y); c.beginPath(); c.arc(a[0], a[1], g.L * S.cam.z, HP_ - g.A, HP_ + g.A); c.stroke(); }
    if (g.t === 'saw' || g.t === 'laser') { /* segment drawn */ }
    if (g.t === 'movplat') { const a = w2s(g.x2, g.y2), b = w2s(g.x2 + g.w, g.y2 + g.h); c.fillRect(a[0], a[1], b[0] - a[0], b[1] - a[1]); c.strokeRect(a[0], a[1], b[0] - a[0], b[1] - a[1]); }
    c.setLineDash([]);
    if (sel && anchor) { c.font = '800 12px system-ui, sans-serif'; c.textAlign = 'left'; c.lineWidth = 3; c.strokeStyle = 'rgba(0,0,0,0.7)'; c.strokeText(GM_NAME(g.t), anchor[0] + 4, anchor[1] - 6); c.fillStyle = COL.acc; c.fillText(GM_NAME(g.t), anchor[0] + 4, anchor[1] - 6); }
  }
  const HP_ = Math.PI / 2;

  // ======================================================================== pointer input ========================================================================
  const ptrs = new Map();
  function localPos(e) { const r = S.cv.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; }
  function beginDragSnapshot() { return { geo: ser(), seat: seatState(), tee: S.hole.tee.slice(), cup: S.hole.cup.slice() }; }
  function onDown(e) {
    if (!S.hole) return;
    e.preventDefault();
    try { S.cv.setPointerCapture(e.pointerId); } catch (er) { /* */ }
    S.touch = e.pointerType === 'touch' || e.pointerType === 'pen';
    const p = localPos(e);
    ptrs.set(e.pointerId, { x: p[0], y: p[1], t: performance.now(), type: e.pointerType });
    S.noSnap = !!e.altKey;
    if (ptrs.size === 2) { cancelDrag(true); startPinch(); return; }
    if (ptrs.size > 2) return;
    S.down = { x: p[0], y: p[1], moved: false, t: performance.now(), button: e.button };
    if (e.button === 1 || e.button === 2 || S.space) { S.pan = { x: p[0], y: p[1], cx: S.cam.x, cy: S.cam.y }; return; }
    handleDown(p, e);
  }
  function startPinch() {
    const a = [...ptrs.values()];
    S.pinch = { d: Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y) || 1, cx: (a[0].x + a[1].x) / 2, cy: (a[0].y + a[1].y) / 2 };
    S.pan = null;
  }
  function cancelDrag(commitIt) { if (S.drag) { if (commitIt) { commit(); } S.drag = null; changed('props'); } }
  function handleDown(p, e) {
    const tool = S.tool, h = S.hole;
    const [wx, wy] = s2w(p[0], p[1]);
    const hit = hitTest(p[0], p[1]);
    S.hitStart = hit;
    // ---- placement tools handled on pointerup (tap) so panning still works
    if (tool === 'gimmick' && S.place) { S.pan = { x: p[0], y: p[1], cx: S.cam.x, cy: S.cam.y }; S.tapAct = 'place'; return; }
    if (tool === 'solid' && S.drawing) { S.pan = { x: p[0], y: p[1], cx: S.cam.x, cy: S.cam.y }; S.tapAct = 'poly'; return; }
    if (S.addPts) { S.pan = { x: p[0], y: p[1], cx: S.cam.x, cy: S.cam.y }; S.tapAct = 'addpt'; return; }
    if (tool === 'tee' || tool === 'cup') {
      // drag the marker (grab it if hit, else teleport it to the tap)
      S.drag = { kind: tool, snap: beginDragSnapshot() };
      const pos = snapP(wx, wy); const q = tool === 'tee' ? h.tee : h.cup; q[0] = pos[0]; q[1] = pos[1];
      select({ k: tool }); markDirty(); return;
    }
    if (tool === 'ground') {
      if (S.paint) { if (hit && hit.k === 'gs') { S.drag = { kind: 'paint', snap: beginDragSnapshot() }; paintSeg(hit.i); } else S.pan = { x: p[0], y: p[1], cx: S.cam.x, cy: S.cam.y }; return; }
      if (hit && hit.k === 'gs') { // tap the line: new point, immediately draggable
        const idx = insertGroundPoint(wx); if (idx > 0) { select({ k: 'gp', i: idx }); S.drag = { kind: 'gp', i: idx, snap: beginDragSnapshot(), fresh: true }; markDirty(); return; }
      }
    }
    if (hit) { startHitDrag(hit, p, wx, wy, e); return; }
    // empty space: pan, deselect on tap
    S.pan = { x: p[0], y: p[1], cx: S.cam.x, cy: S.cam.y }; S.tapAct = 'deselect';
  }
  function paintSeg(i) { const h = S.hole, cs = h.gs.split(''); if (cs[i] !== S.brush) { cs[i] = S.brush; h.gs = cs.join(''); markDirty(); } }
  function startHitDrag(hit, p, wx, wy, e) {
    const h = S.hole, snap = beginDragSnapshot();
    switch (hit.k) {
      case 'handle': S.drag = { kind: 'handle', gi: hit.gi, H: hit.H, g0: JSON.parse(JSON.stringify(h.gm[hit.gi])), snap }; if (hit.H.kind === 'lpt') select({ k: 'gm', i: hit.gi, sub: { p: hit.H.part, i: hit.H.idx } }); break;
      case 'sv': select({ k: 'so', i: hit.i, v: hit.v }); S.drag = { kind: 'sv', i: hit.i, v: hit.v, snap }; break;
      case 'smid': { const v = insertSolidVertex(hit.i, hit.e); select({ k: 'so', i: hit.i, v }); S.drag = { kind: 'sv', i: hit.i, v, snap, fresh: true }; markDirty(); break; }
      case 'tee': case 'cup': select({ k: hit.k }); S.drag = { kind: hit.k, snap, off: [(hit.k === 'tee' ? h.tee : h.cup)[0] - wx, (hit.k === 'tee' ? h.tee : h.cup)[1] - wy] }; break;
      case 'gp': select({ k: 'gp', i: hit.i }); S.drag = { kind: 'gp', i: hit.i, snap }; break;
      case 'gs': select({ k: 'gs', i: hit.i }); S.pan = { x: p[0], y: p[1], cx: S.cam.x, cy: S.cam.y }; S.tapAct = 'keep'; break;
      case 'se': select({ k: 'so', i: hit.i, e: hit.e }); S.drag = { kind: 'sbody', i: hit.i, o: h.solids[hit.i].p.slice(), start: [wx, wy], snap, e: hit.e }; break;
      case 'sb': select({ k: 'so', i: hit.i }); S.drag = { kind: 'sbody', i: hit.i, o: h.solids[hit.i].p.slice(), start: [wx, wy], snap }; break;
      case 'gm': {
        const sp = specOf(h.gm[hit.i]), part = sp.parts[hit.part];
        const sub = part && (part.p === 'pts' || part.p === 'poly' || part.p === 'rects') && hit.sub !== undefined ? { p: hit.part, i: hit.sub } : undefined;
        select({ k: 'gm', i: hit.i, sub });
        S.drag = { kind: 'gmbody', gi: hit.i, part: hit.part, sub: hit.sub, g0: JSON.parse(JSON.stringify(h.gm[hit.i])), start: [wx, wy], snap, all: !!e.shiftKey };
        break;
      }
      default: break;
    }
    S.drag.moved = false;
  }
  function onMove(e) {
    const p = localPos(e);
    if (ptrs.has(e.pointerId)) { const o = ptrs.get(e.pointerId); o.x = p[0]; o.y = p[1]; }
    S.cursor = snapP(...s2w(p[0], p[1]));
    S.noSnap = !!e.altKey;
    if (S.pinch && ptrs.size >= 2) {
      const a = [...ptrs.values()], d = Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y) || 1, cx = (a[0].x + a[1].x) / 2, cy = (a[0].y + a[1].y) / 2;
      zoomAt(d / S.pinch.d, cx, cy);
      S.cam.x -= (cx - S.pinch.cx) / S.cam.z; S.cam.y -= (cy - S.pinch.cy) / S.cam.z;
      S.pinch.d = d; S.pinch.cx = cx; S.pinch.cy = cy; return;
    }
    if (!ptrs.has(e.pointerId)) { // hover
      if (e.pointerType === 'mouse' || e.pointerType === 'pen') S.hover = hitTest(p[0], p[1]);
      S.cv.style.cursor = S.hover ? (S.hover.k === 'handle' ? 'crosshair' : 'pointer') : (S.place || S.drawing || S.tool === 'tee' || S.tool === 'cup' ? 'crosshair' : 'default');
      return;
    }
    const dwn = S.down; if (dwn && !dwn.moved && Math.hypot(p[0] - dwn.x, p[1] - dwn.y) > (S.touch ? 9 : 5)) dwn.moved = true;
    if (S.pan && ptrs.size === 1) { S.cam.x = S.pan.cx - (p[0] - S.pan.x) / S.cam.z; S.cam.y = S.pan.cy - (p[1] - S.pan.y) / S.cam.z; return; }
    if (S.drag) dragMove(p, e);
  }
  function dragMove(p, e) {
    const d = S.drag, h = S.hole;
    if (!d.moved && S.down && !S.down.moved && !d.fresh && d.kind !== 'tee' && d.kind !== 'cup') return; // click, not a drag, yet
    d.moved = true;
    const [wx, wy] = s2w(p[0], p[1]);
    switch (d.kind) {
      case 'handle': { const g = h.gm[d.gi]; dragHandle(g, d.g0, d.H, wx, wy); if (d.H.kind === 'lpt') { /* element follows */ } break; }
      case 'gmbody': {
        const g = h.gm[d.gi], g0 = d.g0, sp = specOf(g0);
        const dx = snapV(wx - d.start[0], S.grid), dy = snapV(wy - d.start[1], S.grid);
        const part = sp.parts[d.part];
        // restore from g0 then apply
        Object.keys(g0).forEach((k) => { g[k] = JSON.parse(JSON.stringify(g0[k])); });
        if (d.all) translateAll(g, dx, dy);
        else if (part.p === 'rect') { g.x = g0.x + dx; g.y = g0.y + dy; }
        else if (part.p === 'seg') { g.x = g0.x + dx; g.y = g0.y + dy; g.x2 = g0.x2 + dx; g.y2 = g0.y2 + dy; }
        else if (part.p === 'pt') { if (!part.lockX) g[part.kx] = g0[part.kx] + dx; if (!part.lockY) g[part.ky] = g0[part.ky] + dy; }
        else if (part.p === 'xrange') { g[part.k1] = g0[part.k1] + dx; g[part.k2] = g0[part.k2] + dx; }
        else if (part.p === 'hline') g[part.k] = g0[part.k] + dy;
        else if (part.p === 'pts' || part.p === 'poly') { const i = d.sub; if (i !== undefined) { g[part.k][2 * i] = g0[part.k][2 * i] + dx; g[part.k][2 * i + 1] = g0[part.k][2 * i + 1] + dy; if (part.ground) { const s = surfaceAt(g[part.k][2 * i], g[part.k][2 * i + 1], 'near'); if (s) g[part.k][2 * i + 1] = rnd(s.y); } } }
        else if (part.p === 'rects') { const i = d.sub; if (i !== undefined) { const r0 = g0[part.k][i]; g[part.k][i] = [r0[0] + dx, r0[1] + dy, r0[2], r0[3]]; } }
        break;
      }
      case 'gp': { const [sx, sy] = snapP(wx, wy); moveGroundPoint(d.i, sx, sy); reseat(d.snap.seat); break; }
      case 'sv': { const so = h.solids[d.i], [sx, sy] = snapP(wx, wy); so.p[2 * d.v] = sx; so.p[2 * d.v + 1] = sy; reseat(d.snap.seat); break; }
      case 'sbody': { const so = h.solids[d.i], dx = snapV(wx - d.start[0], S.grid), dy = snapV(wy - d.start[1], S.grid); so.p = d.o.map((v, i) => v + (i % 2 ? dy : dx)); reseat(d.snap.seat); break; }
      case 'tee': case 'cup': {
        const q = d.kind === 'tee' ? h.tee : h.cup, off = d.off || [0, 0], [sx, sy] = snapP(wx + off[0], wy + off[1]);
        q[0] = clamp(sx, 20, h.w - 20); q[1] = sy; break;
      }
      case 'paint': { const hit = hitTest(p[0], p[1]); if (hit && hit.k === 'gs') paintSeg(hit.i); break; }
      default: break;
    }
    markDirty(); changed('vals');
  }
  function onUp(e) {
    const p = localPos(e), had = ptrs.has(e.pointerId);
    ptrs.delete(e.pointerId);
    if (!had) return;
    if (S.pinch) { if (ptrs.size < 2) S.pinch = null; if (ptrs.size === 0) { S.pan = null; S.down = null; } return; }
    const dwn = S.down, tap = dwn && !dwn.moved && performance.now() - dwn.t < 700;
    const d = S.drag;
    if (d) {
      if (d.kind === 'tee' || d.kind === 'cup') {
        // dropped: rest it on the surface below (+ level/green when the option is on)
        if (d.kind === 'tee') { seat('tee', undefined, 'below'); if (S.autoGreen) levelUnderTee(); }
        else { seat('cup', undefined, 'below'); if (S.autoGreen) { makeGreenUnderCup(); reclaimGreen(d.snap.cup); } }
        if (S.tool === 'tee' || S.tool === 'cup') { S.tool = 'select'; changed('tool', 'rail'); }
      }
      S.drag = null; commit(); changed('props', 'outline'); markDirty();
    } else if (S.pan && tap) {
      const act = S.tapAct;
      if (act === 'place' && S.place) placeAt(p);
      else if (act === 'poly') polyTap(p);
      else if (act === 'addpt') addPtTap(p);
      else if (act === 'deselect') { select(null); }
    }
    S.pan = null; S.tapAct = null; S.down = null;
  }
  function placeAt(p) {
    const [wx, wy] = s2w(p[0], p[1]), [sx, sy] = snapP(wx, wy), t = S.place;
    const i = addGimmick(t, sx, sy); if (i < 0) return;
    S.tool = 'select'; S.place = null; select({ k: 'gm', i }); commit(); changed('tool', 'rail', 'hint');
  }
  function polyTap(p) {
    const d = S.drawing, [wx, wy] = s2w(p[0], p[1]), q = snapP(wx, wy);
    if (d.pts.length >= 3) { const f = w2s(d.pts[0][0], d.pts[0][1]); if (Math.hypot(p[0] - f[0], p[1] - f[1]) < hr() * 1.6) { E.finishPolygon(); return; } }
    d.pts.push(q); changed('hint');
  }
  function addPtTap(p) {
    const a = S.addPts, g = S.hole.gm[a.gi]; if (!g) { S.addPts = null; return; }
    const part = specOf(g).parts[a.part], [wx, wy] = s2w(p[0], p[1]);
    const [sx, sy] = snapP(wx, wy); let y = sy; if (part.ground) { const s = surfaceAt(sx, sy, 'below'); if (s) y = rnd(s.y); }
    if (g[part.k].length / 2 >= HS.LIM.LIST_PTS) { G.UI.toast('That is plenty of points', 'warn'); return; }
    g[part.k].push(sx, y); select({ k: 'gm', i: a.gi, sub: { p: a.part, i: g[part.k].length / 2 - 1 } }); commit(); changed('props');
  }
  function onWheel(e) {
    e.preventDefault();
    const p = localPos(e);
    if (e.ctrlKey || Math.abs(e.deltaY) >= 1) zoomAt(Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0016)), p[0], p[1]);
    if (e.deltaX && !e.ctrlKey) { S.cam.x += e.deltaX / S.cam.z; }
  }

  // ======================================================================== keyboard ========================================================================
  function onKey(e) {
    if (!E.active || E.suspended) return;
    const t = e.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) { if (e.code === 'Escape') t.blur(); return; }
    if (E.ui && E.ui.modalOpen && E.ui.modalOpen()) { if (e.code === 'Escape') E.ui.closeModal(); return; }
    const mod = e.ctrlKey || e.metaKey, k = e.code;
    if (k === 'Space') { S.space = true; e.preventDefault(); return; }
    if (mod && k === 'KeyZ') { e.preventDefault(); if (e.shiftKey) E.redo(); else E.undo(); return; }
    if (mod && k === 'KeyY') { e.preventDefault(); E.redo(); return; }
    if (mod && k === 'KeyD') { e.preventDefault(); E.duplicateSel(); return; }
    if (mod && k === 'Enter') { e.preventDefault(); E.testPlay(); return; }
    if (mod && k === 'KeyS') { e.preventDefault(); save(); G.UI.toast('Saved to My Holes', 'info', 900); return; }
    if (mod) return;
    const step = (S.snap ? S.grid : 1) * (e.shiftKey ? 5 : 1);
    switch (k) {
      case 'Delete': case 'Backspace': if (E.deleteSel()) e.preventDefault(); break;
      case 'Escape': if (S.drawing) { S.drawing = null; changed('hint'); } else if (S.addPts) { S.addPts = null; changed('props', 'hint'); } else if (S.place || S.tool !== 'select') { setTool('select'); } else select(null); break;
      case 'Enter': if (S.drawing) E.finishPolygon(); break;
      case 'ArrowLeft': if (S.sel) { E.nudge(-step, 0); e.preventDefault(); } break;
      case 'ArrowRight': if (S.sel) { E.nudge(step, 0); e.preventDefault(); } break;
      case 'ArrowUp': if (S.sel) { E.nudge(0, -step); e.preventDefault(); } break;
      case 'ArrowDown': if (S.sel) { E.nudge(0, step); e.preventDefault(); } break;
      case 'KeyV': setTool('select'); break;
      case 'KeyL': setTool('ground'); break;
      case 'KeyP': setTool('solid'); break;
      case 'KeyC': setTool(S.tool === 'tee' ? 'cup' : 'tee'); break;
      case 'KeyA': setTool('gimmick'); break;
      case 'KeyH': setTool('hole'); break;
      case 'KeyG': S.snap = !S.snap; changed('bar'); break;
      case 'KeyF': E.fit(); break;
      case 'KeyN': E.testPlay(); break;
      case 'Equal': case 'NumpadAdd': E.zoomBy(1.25); break;
      case 'Minus': case 'NumpadSubtract': E.zoomBy(0.8); break;
      case 'BracketLeft': E.setTime(S.time - 0.25); break;
      case 'BracketRight': E.setTime(S.time + 0.25); break;
      case 'KeyK': E.togglePlay(); break;
      default: break;
    }
  }
  function onKeyUp(e) { if (e.code === 'Space') S.space = false; }

  E.setTime = (t) => { S.time = clamp(t, 0, 30); changed('bar'); };
  E.togglePlay = () => { S.playing = !S.playing; changed('bar'); };

  // ======================================================================== verify (“prove it’s beatable”) ========================================================================
  E.verify = function () {
    if (S.ver && !S.ver.done) return;
    commit();
    rebuild();
    if (E.hasErrors()) { G.UI.toast('Fix the problems first', 'warn'); changed('hole'); return false; }
    const h = S.hole;
    let par = h.par;
    if (h.auto) { par = HS.estimatePar(h); h.par = par; }
    const maxStrokes = par + 2;
    let solver;
    try {
      const v = { stroke: 0, t0: performance.now(), done: false, res: null, maxStrokes, par, auto: !!h.auto, geo: S.geo };
      solver = G.Bot.createSolver(JSON.parse(JSON.stringify(Object.assign({}, h, { bot: undefined, par }))), { maxStrokes, debug: (st) => { v.stroke = st + 1; } });
      v.solver = solver; S.ver = v;
    } catch (e) { console.error(e); G.UI.toast('Verification failed to start', 'warn'); return false; }
    changed('modal');
    return true;
  };
  E.cancelVerify = function () { if (S.ver && !S.ver.done) { S.ver = null; changed('modal'); } };
  function stepVerify() {
    const v = S.ver; if (!v || v.done) return;
    let res = null;
    try { res = v.solver.run(12); } catch (e) { console.error('[verify]', e); v.done = true; v.res = { ok: false, error: true }; changed('modal'); return; }
    changed('modal-progress');
    if (!res) return;
    v.done = true; v.t1 = performance.now();
    if (res.ok && S.geo === v.geo) {
      const h = S.hole;
      const shots = HC.compactShots(h, res.shots);
      h.bot = { s: shots.length, shots };
      if (v.auto) { h.par = v.par; G.Generator.finalizePar(h, res.strokes); }
      v.res = { ok: true, strokes: res.strokes, par: h.par };
      S.verified = null;
      S.touched = true; scheduleSave(); markDirty();
      // markDirty would rebuild and drop nothing: geometry key is unchanged
    } else v.res = { ok: false, strokes: res.strokes, stale: S.geo !== v.geo };
    changed('modal', 'top', 'hole');
  }
  E.isVerified = function () {
    const h = S.hole; if (!h || !h.bot) return false;
    if (S.verified && S.verified.geo === S.geo && S.verified.par === h.par) return S.verified.ok;
    const c = HC.check(h); S.verified = { geo: S.geo, par: h.par, ok: c.verified };
    return c.verified;
  };
  E.showMe = function (on) {
    const h = S.hole;
    if (on === false || (on === undefined && S.ghost)) { S.ghost = null; changed('hole'); return false; }
    if (!h.bot) return false;
    try { const pts = G.Play.simulatePath(h, h.bot.shots); S.ghost = { points: pts, t0: App().time }; } catch (e) { console.warn(e); return false; }
    changed('hole'); return true;
  };

  // ======================================================================== lifecycle ========================================================================
  E.play = function (mode) { return E.testPlay(mode); };
  E.testPlay = function () {
    if (!S.hole) return;
    commit(); rebuild();
    if (E.hasErrors()) { G.UI.toast('Fix the problems before test play', 'warn'); changed('hole'); return; }
    save();
    const copy = JSON.parse(JSON.stringify(S.hole)); copy.id = 'edit-test'; fixCopy(copy);
    E.suspended = true; S.ghost = null;
    document.getElementById('editor').classList.add('hidden');
    App().startCustom(copy, { mode: 'test' });
  };
  function fixCopy(h) { try { Object.assign(h, HC.canon(h)); h.id = 'edit-test'; } catch (e) { /* keep */ } }
  // back from test play
  E.resume = function () {
    E.suspended = false; E.active = true;
    document.getElementById('editor').classList.remove('hidden');
    App().input.handler = null; App().session = null;
    G.UI.hide(); G.UI.showHud(false);
    markDirty(); measure(); changed('top', 'tool', 'props', 'hole', 'rail', 'bar');
  };

  // open the editor on a My Holes entry ({id, name, ...}) with its hole object (already canonical)
  E.open = function (entry, hole) {
    E.ui.build();
    const A = App();
    A.attract = null; A.session = null; A.run = null; A.waiting = false;
    if (A.cancelAttract) A.cancelAttract();
    A.input.handler = null;
    G.UI.hide(); G.UI.showHud(false); G.UI.clearIntro && G.UI.clearIntro();
    S.entry = entry; S.hole = hole; S.sel = null; S.tool = 'select'; S.place = null; S.drawing = null; S.addPts = null; S.drag = null; S.ver = null; S.ghost = null;
    S.undo = []; S.redo = []; S.last = ser(); S.geo = HS.geoKey(hole); S.touched = false; S.verified = null; S.time = 0; S.playing = false; S.strokes = 0;
    if (S.hole.auto === undefined) S.hole.auto = !S.hole.bot;
    S.flags = {}; S.rerr = false;
    E.active = true; E.suspended = false;
    const el = document.getElementById('editor'); el.classList.remove('hidden');
    E.ui.layout(); measure(); markDirty(); rebuild(); E.fit();
    changed('top', 'tool', 'props', 'hole', 'rail', 'bar', 'outline');
    E.ui.sync(true);
    if (window.matchMedia && !window.matchMedia('(max-width: 899px)').matches) { /* desktop */ }
  };
  E.close = function (toScreen) {
    if (!E.active) return;
    commit(); save();
    E.active = false; E.suspended = false; S.ver = null; S.ghost = null;
    const el = document.getElementById('editor'); if (el) el.classList.add('hidden');
    const A = App();
    A.input.handler = null;
    if (A.restoreMenu) A.restoreMenu(toScreen || 'editorHub');
  };

  // main-loop hook (called by App every animation frame while the editor is active and not in test play)
  E.frame = function (time, dt) {
    if (!E.active || E.suspended || !S.hole) return;
    if (S.cv) { const r = S.cv.getBoundingClientRect(); if (Math.round(r.width) !== S.vw || Math.round(r.height) !== S.vh || r.left !== S.ox || r.top !== S.oy) measure(); }
    if (S.playing) { S.time += dt * S.speed; if (S.time > 30) S.time -= 30; changed('time'); }
    if (S.dirty || S.hole.gm.length !== S.sceneN) rebuild();
    if (S.ver) stepVerify();
    drawHole(time, dt);
    drawOverlay();
    if (E.ui) E.ui.sync();
  };
  // manual stepping for automation (pane may be hidden so rAF is paused)
  E.step = function (n, dt) { for (let i = 0; i < (n || 1); i++) E.frame(App().time += (dt || 0.016), dt || 0.016); };

  E.bind = function (cv) {
    S.cv = cv;
    cv.addEventListener('pointerdown', onDown);
    cv.addEventListener('pointermove', onMove);
    cv.addEventListener('pointerup', onUp);
    cv.addEventListener('pointercancel', onUp);
    cv.addEventListener('pointerleave', () => { S.hover = null; S.cursor = null; });
    cv.addEventListener('wheel', onWheel, { passive: false });
    cv.addEventListener('contextmenu', (e) => e.preventDefault());
    cv.addEventListener('dblclick', (e) => { if (S.tool === 'solid' && S.drawing && S.drawing.pts.length >= 3) E.finishPolygon(); });
    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('resize', () => { if (E.active) { E.ui.layout(); measure(); } });
    window.addEventListener('pagehide', () => { if (E.active) { commit(); save(); } });
    document.addEventListener('visibilitychange', () => { if (document.hidden && E.active) { commit(); save(); } });
  };

  // helpers for editor-ui
  E._h = { surfaceAt, specOf, gmShapes, gmHandles, ptsOf, insertGroundPoint, removeGroundPoint, setGround, solidChars, insertSolidVertex, levelGround, rebuild, markDirty, fixDerived, addSolid, solidBox, translateAll, moveGroundPoint, reseat, seatState, groundY };
})();
