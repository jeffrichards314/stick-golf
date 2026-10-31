/* Course loading, stars, unlocks, cosmetics. */
(function () {
  'use strict';
  const G = window.GOLF = window.GOLF || {};
  const Store = G.Store;
  const ALL = /[?&]unlock=all\b/.test(location.search);

  // ---------- course loading ----------
  const cache = {}, pending = {};
  G.registerCourse = function (id, holes) {
    cache[id] = holes;
    const cbs = pending[id]; delete pending[id];
    if (cbs) cbs.forEach((cb) => { try { cb(holes); } catch (e) { console.error(e); } });
  };
  function courses() { return (G.Manifest && G.Manifest.COURSES) || []; }
  function def(id) { const M = G.Manifest; return M && M.byId ? M.byId[id] : courses().find((c) => c.id === id); }
  function baked(id) { return !!(G.BAKED && G.BAKED[id]); }
  function pars(id) { const b = G.BAKED && G.BAKED[id]; return b && b.pars ? b.pars : (cache[id] ? cache[id].map((h) => h.par) : null); }
  function loadCourse(id, cb) {
    if (cache[id]) { cb(cache[id]); return; }
    if (!baked(id)) { cb(null, 'not baked'); return; }
    if (pending[id]) { pending[id].push(cb); return; }
    pending[id] = [cb];
    const s = document.createElement('script');
    s.src = 'data/courses/' + id + '.js';
    s.onerror = () => { const cbs = pending[id] || []; delete pending[id]; cbs.forEach((f) => f(null, 'load error')); };
    document.head.appendChild(s);
  }
  function cached(id) { return cache[id] || null; }

  // ---------- progress ----------
  let prog = null;
  function P() { if (!prog) { prog = Store.get('progress', null) || { c: {} }; if (!prog.c) prog.c = {}; } return prog; }
  function save() { Store.set('progress', P()); }
  function cprog(id) { const p = P(); return p.c[id] || (p.c[id] = { h: [] }); }
  function holeRec(id, i) { const c = P().c[id]; return c && c.h[i] ? c.h[i] : null; }

  // `strokes` = hole score (raw strokes - swish bonus). returns {newBest, stars, prevStars}
  function recordHole(id, i, strokes, par) {
    const c = cprog(id), prev = c.h[i];
    const st = G.Modes.stars(strokes, par);
    const r = { newBest: !prev || strokes < prev.b, stars: st, prevStars: prev ? prev.s : 0 };
    c.h[i] = { b: prev ? Math.min(prev.b, strokes) : strokes, s: Math.max(prev ? prev.s : 0, st), p: par };
    save();
    return r;
  }
  // ---------- 18-hole courses: front 9 (easier) / back 9 (harder) ----------
  const ROUNDS = ['all', 'front', 'back'];
  const ROUND_NAMES = { all: 'All 18', front: 'Front 9', back: 'Back 9' };
  // number of holes in a course (18 by contract; tolerate stale 9-hole data)
  function holeCount(id) {
    const ps = pars(id); if (ps && ps.length) return ps.length;
    const H = G.Generator && G.Generator.HOLES; return H || 18;
  }
  // [start, end) hole range for a round type; null if the course has no such nine
  function roundRange(id, round) {
    const n = holeCount(id);
    if (round === 'back') return n > 9 ? [9, n] : null;
    if (round === 'front') return [0, Math.min(9, n)];
    return [0, n];
  }
  function roundsFor(id) { return holeCount(id) > 9 ? ROUNDS.slice() : ['front']; }
  function roundFor(id, holeIdx) { return holeIdx >= 9 && holeCount(id) > 9 ? 'back' : 'front'; }
  // best round per type: c.br = {all, front, back}; returns true if new best
  function recordRound(id, round, total) {
    const c = cprog(id); c.br = c.br || {};
    if (round === 'all' && holeCount(id) <= 9) round = 'front';
    let nb = false;
    if (c.br[round] === undefined || total < c.br[round]) { c.br[round] = total; nb = true; }
    if (round === 'all') c.full = 1;
    if (c.bt !== undefined) delete c.bt; // legacy
    save();
    return nb;
  }
  function recordCourseTotal(id, total) { return recordRound(id, 'all', total); } // legacy alias
  function nineInfo(id, c, ps, a, b) {
    let stars = 0, done = 0, best = 0, par = 0, allPar = true;
    for (let i = a; i < b; i++) {
      const r = c && c.h[i];
      const hp = r && r.p ? r.p : (ps && ps[i] ? ps[i] : 3);
      par += hp;
      if (r) { stars += r.s; done++; best += r.b; if (r.b > hp) allPar = false; } else allPar = false;
    }
    const n = b - a, complete = n > 0 && done >= n;
    return { stars, done, n, complete, best: complete ? best : null, par, bonus: complete ? (allPar ? 5 : 3) : 0 };
  }
  function courseInfo(id) {
    const c = P().c[id], ps = pars(id), n = holeCount(id);
    const front = nineInfo(id, c, ps, 0, Math.min(9, n));
    const back = n > 9 ? nineInfo(id, c, ps, 9, n) : null;
    const full = !!(c && c.full);
    const stars = front.stars + (back ? back.stars : 0), done = front.done + (back ? back.done : 0);
    const bonus = front.bonus + (back ? back.bonus : 0) + (full && n > 9 ? 5 : 0);
    const allDone = front.complete && (!back || back.complete);
    const br = (c && c.br) || {};
    if (c && c.bt && br.all === undefined) br.all = c.bt;
    const bestAll = br.all !== undefined ? br.all : (n <= 9 && br.front !== undefined ? br.front : undefined);
    const coursePar = front.par + (back ? back.par : 0);
    return {
      cleared: bestAll !== undefined && bestAll < coursePar, // finished a full round under par: unlocks the next course
      holes: n, maxStars: n * 3, stars, done, bonus, front, back, full,
      complete: front.complete,            // unlock rule: the front nine is finished
      allDone, par: front.par + (back ? back.par : 0), best: allDone ? front.best + (back ? back.best : 0) : null,
      bestRound: br, bestTotal: br.all !== undefined ? br.all : null,
    };
  }
  function totalStars() {
    let t = 0;
    for (const c of courses()) { const i = courseInfo(c.id); t += i.stars + i.bonus; }
    return t;
  }
  function completedCount() { return courses().filter((c) => courseInfo(c.id).complete).length; }

  // Linear unlock: finish a full round of the previous course under par.
  function prevId(d) {
    if (!d) return null;
    if (d.unlock && d.unlock.prev !== undefined) return d.unlock.prev;
    const list = courses(), i = list.indexOf(d);
    return i > 0 ? list[i - 1].id : null;
  }
  function unlocked(d) {
    if (ALL || !d) return true;
    const p = prevId(d);
    return !p || courseInfo(p).cleared;
  }
  function unlockText(d) {
    const p = prevId(d); if (!p) return '';
    const pd = def(p), n = pd && pd.index !== undefined ? pd.index + 1 : null;
    return 'Finish ' + (n ? '#' + n + ' ' : '') + (pd ? pd.name : p) + ' under par';
  }
  function courseNumber(d) { if (!d) return 0; if (typeof d.index === 'number') return d.index + 1; return courses().indexOf(d) + 1; }

  // ---------- gimmicks the player has been introduced to ----------
  let seenG = null;
  function seenSet() { if (!seenG) seenG = new Set(Store.get('seenGimmicks', []) || []); return seenG; }
  function gimmickSeen(t) { return seenSet().has(t); }
  function markGimmicksSeen(ts) { const s = seenSet(); let ch = false; (ts || []).forEach((t) => { if (!s.has(t)) { s.add(t); ch = true; } }); if (ch) Store.set('seenGimmicks', [...s]); }

  // ---------- cosmetics ----------
  // Categories come from GOLF.Render.COSMETIC_CATS when the renderer provides them; otherwise the default list,
  // filtered to the categories that actually exist in GOLF.Render.COSMETICS.
  const DEFAULT_CATS = [
    { key: 'balls', slot: 'ball' }, { key: 'trails', slot: 'trail' }, { key: 'cupEffects', slot: 'cupEffect' },
    { key: 'flags', slot: 'flag' }, { key: 'palettes', slot: 'palette' },
  ];
  const CAT_NAMES = { balls: 'Balls', trails: 'Trails', cupEffects: 'Cup FX', flags: 'Flags', palettes: 'Palettes' };
  const SLOT_OF = { balls: 'ball', trails: 'trail', cupEffects: 'cupEffect', flags: 'flag', palettes: 'palette' };
  const RARITIES = ['common', 'rare', 'epic', 'legendary'];
  function cosAll() { return (G.Render && G.Render.COSMETICS) || {}; }
  function cats() {
    const C = cosAll(), R = G.Render;
    const src = R && Array.isArray(R.COSMETIC_CATS) && R.COSMETIC_CATS.length ? R.COSMETIC_CATS : DEFAULT_CATS;
    return src.filter((c) => c && c.key && Array.isArray(C[c.key]) && C[c.key].length).map((c) => ({
      key: c.key, slot: c.slot || SLOT_OF[c.key] || c.key, name: c.name || CAT_NAMES[c.key] || (c.key.charAt(0).toUpperCase() + c.key.slice(1)),
    }));
  }
  function cosList(cat) { const C = cosAll(); return C[cat] || []; }
  const isDefaultId = (id) => id === 'classic' || id === 'default';

  // Normalised unlock requirement {type, n?, id?}. item.unlock (new schema) wins; legacy shapes are converted;
  // items without one fall back to the old index-based rule.
  function cosReq(cat, item, i) {
    const u = item.unlock;
    if (u === 'free' || u === true) return { type: 'free' };
    if (u && typeof u === 'object') {
      if (u.type) return u;
      if (u.stars) return { type: 'stars', n: u.stars };
      if (u.courses) return { type: 'cleared', n: u.courses };
      if (u.course) return { type: 'course', id: u.course };
    }
    if (i === 0 || isDefaultId(item.id)) return { type: 'free' };
    const ci = Math.max(0, DEFAULT_CATS.findIndex((c) => c.key === cat));
    const k = (i + ci) % 3;
    if (k === 0 && i >= 6) return { type: 'cleared', n: Math.min(60, Math.round(i * 3)) };
    if (k === 1) return { type: 'stars', n: Math.round(8 * i + 4 * i * i / 3) };
    return { type: 'cleared', n: Math.max(1, Math.round(i * 1.6)) };
  }
  function clearedCount() { return courses().filter((c) => courseInfo(c.id).cleared).length; }
  // lazily-memoised snapshot of every stat a requirement can ask for
  function snapshot() {
    const memo = {};
    const st = Store.getStats ? Store.getStats() : {};
    return function (type, u) {
      if (type === 'stars') return memo.stars !== undefined ? memo.stars : (memo.stars = totalStars());
      if (type === 'cleared') return memo.cleared !== undefined ? memo.cleared : (memo.cleared = clearedCount());
      if (type === 'course') return u && u.id && courseInfo(u.id).cleared ? 1 : 0;
      if (type === 'gimmicks') return seenSet().size;
      if (type === 'free') return 1;
      return +st[type] || 0;
    };
  }
  const plural = (n, a, b) => n + ' ' + (n === 1 ? a : (b || a + 's'));
  function reqText(r) {
    if (!r || r.type === 'free') return 'Free';
    const n = +r.n || 1;
    switch (r.type) {
      case 'stars': return 'Earn ' + n + ' stars';
      case 'cleared': return 'Clear ' + plural(n, 'course') + ' under par';
      case 'course': { const d = def(r.id), num = courseNumber(d); return 'Clear ' + (num ? '#' + num + ' ' : '') + (d ? d.name : r.id) + ' under par'; }
      case 'swishes': return 'Sink ' + plural(n, 'swish', 'swishes');
      case 'aces': return 'Hit ' + plural(n, 'hole-in-one', 'holes-in-one');
      case 'birdies': return 'Make ' + plural(n, 'birdie') + ' or better';
      case 'holes': return 'Complete ' + plural(n, 'hole');
      case 'rounds': return 'Finish ' + plural(n, 'full 18-hole round');
      case 'daily': return 'Finish ' + plural(n, 'daily round');
      case 'endless': return 'Clear ' + plural(n, 'hole') + ' in one Endless run';
      case 'gimmicks': return 'Encounter ' + plural(n, 'different gimmick');
      default: return 'Locked';
    }
  }
  const REQ_LABEL = { stars: 'Stars', cleared: 'Courses cleared', course: 'Course', swishes: 'Swishes', aces: 'Aces', birdies: 'Birdies', holes: 'Holes', rounds: 'Rounds', daily: 'Daily rounds', endless: 'Best run', gimmicks: 'Gimmicks' };
  // {ok, cur, need, frac, text, label, prog} for a requirement
  function evalReq(r, get) {
    get = get || snapshot();
    if (!r || r.type === 'free') return { ok: true, cur: 1, need: 1, frac: 1, text: 'Free', label: '', prog: '' };
    const need = r.type === 'course' ? 1 : Math.max(1, +r.n || 1);
    const raw = get(r.type, r);
    const cur = ALL ? need : Math.min(need, raw);
    const ok = ALL || raw >= need;
    const label = REQ_LABEL[r.type] || r.type;
    return { ok, cur, need, frac: need ? cur / need : 1, text: reqText(r), label, prog: r.type === 'course' ? (ok ? 'Cleared' : 'Not cleared yet') : label + ' ' + cur + '/' + need };
  }
  function reqMet(r) { return evalReq(r).ok; }
  function rarityOf(item, i, n, req) {
    if (item.rarity && RARITIES.indexOf(item.rarity) >= 0) return item.rarity;
    if (!req || req.type === 'free') return 'common';
    const f = n > 1 ? i / (n - 1) : 0;
    return f < 0.4 ? 'common' : f < 0.7 ? 'rare' : f < 0.9 ? 'epic' : 'legendary';
  }
  // ---- "new" badges: items unlocked since the player last looked at them ----
  function newSet() { return new Set(Store.get('newItems', []) || []); }
  function isNew(cat, id) { return newSet().has(cat + ':' + id); }
  function markSeen(cat, id) { const s = newSet(), k = cat + ':' + id; if (s.delete(k)) Store.set('newItems', [...s]); }
  function markCatSeen(cat) { const s = newSet(); let ch = false; s.forEach((k) => { if (k.indexOf(cat + ':') === 0) { s.delete(k); ch = true; } }); if (ch) Store.set('newItems', [...s]); }
  function newCount(cat) { let n = 0; newSet().forEach((k) => { if (!cat || k.indexOf(cat + ':') === 0) n++; }); return n; }

  function cosmeticsState() {
    const get = snapshot(), nw = newSet();
    return cats().map((c) => {
      const list = cosList(c.key);
      return {
        cat: c,
        items: list.map((it, i) => {
          const r = cosReq(c.key, it, i), e = evalReq(r, get);
          return { item: it, req: r, ok: e.ok, text: e.text, cur: e.cur, need: e.need, frac: e.frac, prog: e.prog, label: e.label, rarity: rarityOf(it, i, list.length, r), isNew: e.ok && nw.has(c.key + ':' + it.id) };
        }),
      };
    });
  }
  // equipped cosmetics, falling back to the category's default when unset or locked
  function equipped() {
    const s = Store.getSettings().cosmetics || {};
    const out = {}, get = snapshot();
    for (const c of cats()) {
      const list = cosList(c.key);
      let id = s[c.slot];
      const idx = list.findIndex((it) => it.id === id);
      if (idx < 0 || !evalReq(cosReq(c.key, list[idx], idx), get).ok) { const d = list.find((it) => isDefaultId(it.id)) || list[0]; id = d ? d.id : null; }
      out[c.slot] = id;
    }
    return out;
  }
  function equip(slot, id) { const st = Store.getSettings(); st.cosmetics = st.cosmetics || {}; st.cosmetics[slot] = id; Store.saveSettings(); }
  function unlockedSet() {
    const set = [];
    cosmeticsState().forEach((g) => g.items.forEach((x) => { if (x.ok) set.push(g.cat.key + ':' + x.item.id); }));
    return set;
  }
  // Items unlocked since the last check: [{cat, slot, catName, id, name, item, rarity, label}]. Marks them "new".
  function newUnlockItems() {
    if (ALL) return [];
    const seen = Store.get('seenUnlocks', null);
    const now = unlockedSet();
    if (!seen) { Store.set('seenUnlocks', now); return []; }
    const fresh = now.filter((k) => seen.indexOf(k) < 0);
    if (!fresh.length) return [];
    Store.set('seenUnlocks', Array.from(new Set(seen.concat(now))));
    const nw = newSet(); fresh.forEach((k) => nw.add(k)); Store.set('newItems', [...nw]);
    const cs = cats(), st = cosmeticsState();
    return fresh.map((k) => {
      const j = k.indexOf(':'), cat = k.slice(0, j), id = k.slice(j + 1);
      const c = cs.find((x) => x.key === cat) || { key: cat, slot: cat, name: cat };
      const g = st.find((x) => x.cat.key === cat), x = g && g.items.find((y) => y.item.id === id);
      const it = x ? x.item : { id };
      const catName = c.name.replace(/s$/, '');
      return { cat, slot: c.slot, catName, id, name: it.name || id, item: it, rarity: x ? x.rarity : 'common', label: catName + ': ' + (it.name || id) };
    });
  }
  function newUnlocks() { return newUnlockItems().map((x) => x.label); }

  // ---------- lifetime stats ----------
  // Called after every finished hole (course, daily, random, endless). res = {strokes, score, par, swish, failed}
  function recordHoleStats(res, kind) {
    if (!Store.bumpStat || kind === 'dev') return;
    const st = Store.getStats();
    st.shots = (st.shots || 0) + (res.strokes || 0);
    if (res.failed) st.pickups = (st.pickups || 0) + 1;
    else {
      st.holes = (st.holes || 0) + 1;
      const sc = res.score !== undefined ? res.score : res.strokes;
      if (res.swish) st.swishes = (st.swishes || 0) + 1;
      if (res.strokes === 1) st.aces = (st.aces || 0) + 1;
      if (sc < res.par) st.birdies = (st.birdies || 0) + 1;
      if (sc <= res.par - 2) st.eagles = (st.eagles || 0) + 1;
      if (sc <= res.par) st.pars = (st.pars || 0) + 1;
    }
    Store.set('stats', st);
  }
  function stats() { return Object.assign({}, Store.getStats ? Store.getStats() : {}, { gimmicks: seenSet().size, stars: totalStars(), cleared: clearedCount() }); }

  // ---------- daily bests ----------
  function dailyBest(date) { const d = Store.get('daily', {}) || {}; return d[date] || null; }
  function recordDaily(date, total, par, strokes) {
    const d = Store.get('daily', {}) || {};
    const prev = d[date];
    if (!prev || total < prev.total) { d[date] = { total, par, strokes }; Store.set('daily', d); return true; }
    return false;
  }

  G.Progress = {
    ALL, loadCourse, cached, baked, pars, def, courses,
    holeRec, recordHole, recordCourseTotal, recordRound, courseInfo, ROUNDS, ROUND_NAMES, holeCount, roundRange, roundsFor, roundFor, totalStars, completedCount,
    unlocked, unlockText, prevId, courseNumber, gimmickSeen, markGimmicksSeen, cats, cosList, cosReq, evalReq, reqText, cosmeticsState, equipped, equip,
    newUnlocks, newUnlockItems, unlockedSet, isNew, markSeen, markCatSeen, newCount, RARITIES, clearedCount, recordHoleStats, stats,
    dailyBest, recordDaily,
    resetAll() { prog = { c: {} }; save(); seenG = new Set(); Store.del('seenGimmicks'); Store.del('newItems'); if (Store.resetStats) Store.resetStats(); },
  };
  Object.defineProperty(G.Progress, 'CATS', { get: cats, enumerable: true });
})();
