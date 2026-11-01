/* Local pass-and-play multiplayer: 2-4 players share one device and take turns on every hole.
 *
 * A multiplayer game is an ordinary Run (kind 'multi') over a baked course round or a Random course, plus run.mp:
 *   { players:[{name, ball, scores[], times[], mull:{left, used}, swishes, aces, pickups}], turn, phase, setup, seenG }
 * run.scores / run.times / run.mulligans always point at the player whose turn it is, so the single-player HUD,
 * stroke limits and mulligans work unchanged. Multiplayer is deliberately self-contained: it never records course
 * progress, personal bests, daily results, lifetime stats or achievements.
 *
 * Flow:  setup -> [ hand-off -> play ] per player -> shared scorecard per hole -> ... -> results.            */
(function () {
  'use strict';
  const G = window.GOLF = window.GOLF || {};
  const K = G.UI && G.UI.kit;
  if (!K) { console.warn('[multi] UI kit missing'); return; }
  const { SCREENS, render, on, show, click, scr, keepScroll, esc, ic, iconBtn, topbar, section, diffChip, gimBadge, courseGim, scv, relPar, relCls, relTag, scoreTiles, fmtTimeS, cosCanvas, bindPreviews, toast, copyText, A } = K;
  const App = () => G.App;
  const Pg = () => G.Progress;
  const MIN_P = 2, MAX_P = 4, NAME_MAX = 14;
  // distinct-looking balls, in the order they are handed out when a player has not chosen one
  const PREF_BALLS = ['cherry', 'sunny', 'sky', 'mint', 'grape', 'classic'];
  const cur = (r) => r.mp.players[r.mp.turn];
  const sc = (s) => (s.score !== undefined ? s.score : s.strokes);

  // ---------- balls + players ----------
  function unlockedBalls() {
    const g = Pg().cosmeticsState().find((x) => x.cat.key === 'balls');
    return g ? g.items.filter((x) => x.ok).map((x) => x.item.id) : [];
  }
  // `want` (an explicit choice) wins when it is unlocked; otherwise the first unlocked ball nobody has yet, else reuse one
  function pickBall(unl, taken, want) {
    if (want && unl.indexOf(want) >= 0) return want;
    const order = PREF_BALLS.filter((id) => unl.indexOf(id) >= 0).concat(unl);
    return order.find((id) => taken.indexOf(id) < 0) || unl[taken.length % Math.max(1, unl.length)] || 'classic';
  }
  // [{name, ball}] (2-4) -> clean players: trimmed unique names, unlocked balls; null if fewer than 2
  function normalizePlayers(list) {
    if (!Array.isArray(list)) return null;
    const src = list.filter((p) => p !== null && p !== undefined).slice(0, MAX_P);
    if (src.length < MIN_P) return null;
    const unl = unlockedBalls(), taken = [], seen = {};
    return src.map((p, i) => {
      if (typeof p === 'string') p = { name: p };
      let name = String(p.name === undefined || p.name === null ? '' : p.name).replace(/\s+/g, ' ').trim().slice(0, NAME_MAX) || 'Player ' + (i + 1);
      const key = name.toLowerCase();
      if (seen[key]) { seen[key]++; name = name.slice(0, NAME_MAX - 2) + ' ' + seen[key]; } else seen[key] = 1;
      const ball = pickBall(unl, taken, p.ball); taken.push(ball);
      return { name, ball };
    });
  }

  // ---------- setup state (persisted) ----------
  let setup = null, pickerFor = null;
  const courseList = () => Pg().courses().filter((c) => Pg().unlocked(c) && Pg().baked(c.id));
  const canRandom = () => !!(G.Generator && G.Generator.randomCourse);
  const canRemix = () => !!(G.Generator && G.Generator.mirrorHole);
  const randSeed = () => Math.floor(Math.random() * 0x3fffffff);
  function getSetup() {
    if (setup) return setup;
    const saved = G.Store.get('multi.setup', null) || {}, unl = unlockedBalls(), sp = Array.isArray(saved.players) ? saved.players : [];
    const players = [];
    for (let i = 0; i < Math.max(MIN_P, Math.min(MAX_P, sp.length)); i++) {
      const q = sp[i] || {};
      players.push({ name: typeof q.name === 'string' ? q.name.slice(0, NAME_MAX) : '', ball: pickBall(unl, players.map((p) => p.ball), q.ball || (i === 0 ? Pg().equipped().ball : null)) });
    }
    const list = courseList();
    const next = list.find((c) => !Pg().courseInfo(c.id).cleared) || list[0];
    const courseId = list.some((c) => c.id === saved.courseId) ? saved.courseId : next ? next.id : null;
    setup = {
      players, courseId, mode: (saved.mode === 'random' && canRandom()) || !courseId ? 'random' : 'course',
      round: saved.round || G.Store.get('roundChoice', 'all'), remix: !!saved.remix, seed: (saved.seed >>> 0) || randSeed(),
    };
    fixRound(setup);
    return setup;
  }
  function fixRound(s) {
    if (s.courseId) { const rs = Pg().roundsFor(s.courseId); if (rs.indexOf(s.round) < 0) s.round = rs[0]; }
    if (s.remix && !(canRemix() && s.courseId && Pg().remixAvailable(s.courseId))) s.remix = false;
  }
  const saveSetup = () => G.Store.set('multi.setup', setup);

  // ---------- starting a game ----------
  // o = {players:[{name, ball}], courseId, round, remix, seed}; returns false when it could not start
  function start(o) {
    o = o || {};
    const players = normalizePlayers(o.players);
    if (!players) { toast('Multiplayer needs 2–4 players', 'warn'); return false; }
    const diff = G.Modes.current();
    if (o.courseId) {
      const id = o.courseId, def = Pg().def(id);
      if (!def || !Pg().baked(id)) { toast('Unknown course', 'warn'); return false; }
      if (!Pg().unlocked(def)) { toast('Locked: ' + Pg().unlockText(def), 'warn'); return false; }
      const remix = !!o.remix && canRemix() && Pg().remixAvailable(id);
      const rounds = Pg().roundsFor(id), round = rounds.indexOf(o.round) >= 0 ? o.round : 'all';
      G.UI.show('loading', { title: 'Loading course…', sub: def.name });
      App()._internal.loadRound(id, 0, round, remix, (fail, L) => {
        if (fail) { toast(fail.stage === 'remix' ? 'Remix failed' : 'Could not load course', 'warn'); G.UI.show('mpSetup'); return; }
        const r = G.Run.fromHoles('multi', def, L.holes, diff);
        r.round = L.round; r.offset = L.a; r.courseHoles = L.n; r.remix = remix; r.courseId = id;
        begin(r, players, { courseId: id, round: L.round, remix });
      });
      return true;
    }
    if (!canRandom()) { toast('Generator not loaded', 'warn'); return false; }
    let seed = typeof o.seed === 'string' ? G.RNG.codeToSeed(o.seed) : o.seed;
    seed = seed === undefined || seed === null || isNaN(seed) ? randSeed() : seed >>> 0;
    let rc; try { rc = G.Generator.randomCourse(seed); } catch (e) { console.error(e); toast('Generation failed', 'warn'); return false; }
    const r = G.Run.generated('multi', Object.assign({}, rc.def, { name: 'Random ' + G.RNG.seedToCode(seed) }), rc.holeParams, diff);
    r.random = true; r.seed = seed; r.round = 'front'; r.offset = 0; r.courseHoles = rc.holeParams.length;
    begin(r, players, { seed });
    return true;
  }
  function begin(r, players, what) {
    const A0 = App(), d = G.Modes.get(r.diff);
    r.mp = {
      players: players.map((p, i) => ({ id: i, name: p.name, ball: p.ball, scores: [], times: [], mull: { left: d.mulligans, used: 0 }, swishes: 0, aces: 0, pickups: 0 })),
      turn: 0, phase: 'loading', seenG: new Set(), setup: Object.assign({ players: players.map((p) => ({ name: p.name, ball: p.ball })) }, what),
    };
    r.idx = 0; setTurn(r, 0);
    pickerFor = null;
    A0.run = r; A0.session = null; A0.attract = null;
    A0._internal.waitHole();
  }
  function setTurn(r, k) {
    const p = r.mp.players[k];
    r.mp.turn = k; r.scores = p.scores; r.times = p.times; r.mulligans = p.mull;
  }

  // ---------- turn flow ----------
  // the hole is generated/loaded: hand the device to the first player of it
  function ready(r) { handoff(r); }
  function handoff(r) {
    const A0 = App();
    r.mp.phase = 'handoff';
    A0.waiting = false; A0.session = null; A0.attract = null; // nothing of the course is drawn behind the hand-off screen
    G.UI.clearIntro(); G.UI.setHudPlayer(null); G.UI.showHud(false);
    G.UI.show('mpHandoff');
  }
  function go() { // "I'm ready": the player starts their turn
    const r = App().run; if (!r || !r.mp || r.mp.phase !== 'handoff') return;
    r.mp.phase = 'play';
    App()._internal.playCurrent();
  }
  function afterTurn(r, entry) {
    const mp = r.mp, p = cur(r);
    p.scores[r.idx] = entry; p.times[r.idx] = entry.time || 0;
    if (!entry.failed && entry.swish) p.swishes++;
    if (!entry.failed && entry.strokes === 1) p.aces++;
    if (entry.failed) p.pickups++;
    G.UI.showHud(false);
    if (mp.turn < mp.players.length - 1) { setTurn(r, mp.turn + 1); handoff(r); return; }
    mp.phase = 'hole';
    G.UI.show('mpHole', { last: r.idx >= r.n - 1 });
  }
  function holed(res) {
    const r = App().run, score = res.score !== undefined ? res.score : res.strokes;
    afterTurn(r, { strokes: res.strokes, bonus: res.bonus || 0, score, par: res.par, swish: !!res.swish, time: res.time || 0 });
  }
  // stroke limit / flood: the hole is picked up and scored (limit + 1), like a single-player round
  function failed(res, sess) {
    const r = App().run;
    const lim = sess && sess.limit !== Infinity ? sess.limit : (res.strokes || 0) + 1, x = lim + 1;
    afterTurn(r, { strokes: x, bonus: 0, score: x, par: res.par, failed: true, reason: res.reason || null, time: res.time || 0 });
  }
  function nextHole() {
    const r = App().run; if (!r || !r.mp) return;
    if (r.idx >= r.n - 1) { finish(r); return; }
    r.idx++; setTurn(r, 0);
    App()._internal.waitHole();
  }
  function finish(r) {
    r.mp.phase = 'results';
    G.UI.clearIntro(); G.UI.setHudPlayer(null); G.UI.showHud(false);
    G.UI.show('mpResults');
  }

  // ---------- numbers ----------
  function totals(r) {
    return r.mp.players.map((p, i) => {
      let total = 0, par = 0, played = 0, time = 0;
      p.scores.forEach((s) => { if (s) { total += sc(s); par += s.par; played++; time += s.time || 0; } });
      return { i, p, total, par, rel: total - par, played, time };
    });
  }
  // best (lowest vs par) first; equal totals share a rank (1, 1, 3, ...)
  function standings(r) {
    const t = totals(r).sort((a, b) => a.rel - b.rel || a.total - b.total || a.i - b.i);
    t.forEach((x, k) => { x.rank = k > 0 && x.rel === t[k - 1].rel && x.total === t[k - 1].total ? t[k - 1].rank : k + 1; });
    t.forEach((x) => { x.tie = t.filter((y) => y.rank === x.rank).length > 1; });
    return t;
  }
  function status(r) {
    const mp = r.mp, t = totals(r);
    return {
      phase: mp.phase, turn: mp.turn, turnName: cur(r).name, turnBall: cur(r).ball, count: mp.players.length, setup: mp.setup,
      players: mp.players.map((p, i) => ({
        name: p.name, ball: p.ball, scores: p.scores.map((s) => (s ? sc(s) : null)), failed: p.scores.map((s) => !!(s && s.failed)), total: t[i].total, vsPar: t[i].rel,
        mulligans: { left: p.mull.left, used: p.mull.used || 0 }, swishes: p.swishes, aces: p.aces, pickups: p.pickups, time: t[i].time,
      })),
    };
  }

  // ---------- shared scorecard (one row per player) ----------
  // 18 holes -> Out / In / Tot; 9 holes -> Tot. The last column is each player's score vs par over the holes they have played.
  function cardHtml(r) {
    const n = r.n, off = r.offset || 0, split = !r.random && n > 9 && off === 0;
    const parOf = (i) => { const h = r.holes[i]; return h && h.par ? h.par : 0; };
    const groups = split ? [[0, 9, 'Out'], [9, n, 'In']] : [[0, n, '']];
    let h1 = '<tr><th>Hole</th>', h2 = '<tr class="par-row"><th>Par</th>';
    const rows = r.mp.players.map((p) => '<tr' + (p === cur(r) && r.mp.phase === 'play' ? ' class="turn"' : '') + '><td class="mp-nm"><span class="mp-nmi">' + cosCanvas('balls', p.ball, 'mp-dot', 6) + '<b>' + esc(p.name) + '</b></span></td>');
    const sums = r.mp.players.map(() => ({ t: 0, played: 0, par: 0 }));
    let allPar = 0;
    groups.forEach(([a, b, label]) => {
      let gp = 0; const gs = r.mp.players.map(() => ({ t: 0, played: 0 }));
      for (let i = a; i < b; i++) {
        const par = parOf(i); gp += par; allPar += par;
        h1 += '<td' + (i === r.idx && r.mp.phase !== 'results' ? ' class="cur"' : '') + '>' + (off + i + 1) + '</td>'; h2 += '<td>' + (par || '') + '</td>';
        r.mp.players.forEach((p, k) => {
          const s = p.scores[i];
          if (!s) { rows[k] += '<td class="none">·</td>'; return; }
          const lb = G.Modes.scoreLabel(sc(s), s.par);
          rows[k] += '<td>' + scv(sc(s) + (s.bonus ? '<sup class="swsup">−' + s.bonus + '</sup>' : ''), s.failed ? 'x' : lb.cls, (s.failed ? 'Picked up' : lb.text) + (s.bonus ? ' · swish −' + s.bonus : '')) + '</td>';
          gs[k].t += sc(s); gs[k].played++; sums[k].t += sc(s); sums[k].played++; sums[k].par += s.par;
        });
      }
      if (label) {
        h1 += '<th class="sum">' + label + '</th>'; h2 += '<td class="sum">' + gp + '</td>';
        gs.forEach((g, k) => { rows[k] += '<td class="sum"><b>' + (g.played ? g.t : '–') + '</b></td>'; });
      }
    });
    h1 += '<th class="sum tot">Tot</th><th class="sum tot">vs par</th></tr>'; h2 += '<td class="sum tot">' + allPar + '</td><td class="sum tot"></td></tr>';
    sums.forEach((s, k) => { rows[k] += '<td class="sum tot"><b>' + (s.played ? s.t : '–') + '</b></td><td class="sum tot">' + (s.played ? relTag(s.t, s.par) : '–') + '</td></tr>'; });
    return '<div class="scroll-x"><table class="scorecard mpcard">' + h1 + h2 + rows.join('') + '</table></div>';
  }
  const LEGEND = '<div class="legend">' + scv(3, 'eagle') + 'eagle ' + scv(3, 'birdie') + 'birdie ' + scv(4, 'par') + 'par ' + scv(5, 'bogey') + 'bogey ' + scv(6, 'dbogey') + 'double+ ' + scv(7, 'x') + 'picked up</div>';
  const ballCv = (id, cls, fps) => cosCanvas('balls', id, cls, fps || 8);
  const quitBtn = (label) => '<button class="btn danger" data-act="quit">' + ic('home') + label + '</button>';
  function armQuit(el, label) {
    if (!el.classList.contains('armed')) { el.classList.add('armed'); el.innerHTML = ic('home') + 'Tap again to quit'; A().sfx('uiback'); return false; }
    return true;
  }
  // "Hole 3 of 9"; a back nine keeps the course numbering: "Hole 12 · 3 of 9"
  const holeLabel = (r) => 'Hole ' + ((r.offset || 0) + r.idx + 1) + (r.offset ? ' · ' + (r.idx + 1) : '') + ' of ' + r.n;
  const gameName = (r) => (r.def && r.def.name ? r.def.name : 'Multiplayer') + (r.remix ? ' · Remix' : '') + (!r.random && r.courseHoles > 9 ? ' · ' + (Pg().ROUND_NAMES[r.round] || '') : '');
  const resultText = (s) => (s.failed ? 'Picked up' : G.Modes.scoreLabel(sc(s), s.par).text.replace(/!$/, ''));

  // ---------- screens ----------
  SCREENS.mpSetup = function (args) {
    const s = getSetup(), unl = unlockedBalls(), list = courseList(), hasGen = canRandom();
    const taken = s.players.map((p) => p.ball);
    const c = s.courseId ? Pg().def(s.courseId) : null;
    let html = topbar('Multiplayer', 'Pass &amp; play · 2–4 players, one device', { right: diffChip() }) + '<div class="page narrow mp-setup">';

    // players
    let ph = '<div class="mp-players">';
    s.players.forEach((p, i) => {
      ph += '<div class="mp-row"><span class="mp-num">' + (i + 1) + '</span>' +
        '<button class="mp-ballbtn' + (pickerFor === i ? ' open' : '') + '" data-act="mpball" data-i="' + i + '" aria-label="Choose a ball for player ' + (i + 1) + '" aria-expanded="' + (pickerFor === i) + '">' + ballCv(p.ball, '', 10) + '</button>' +
        '<input class="txt mp-name" data-in="mpname" data-i="' + i + '" maxlength="' + NAME_MAX + '" placeholder="Player ' + (i + 1) + '" value="' + esc(p.name) + '" autocomplete="off" autocapitalize="words" spellcheck="false" aria-label="Player ' + (i + 1) + ' name">' +
        (s.players.length > MIN_P ? iconBtn('mprem', 'x', 'Remove player ' + (i + 1), '', ' data-i="' + i + '"') : '<span></span>') + '</div>';
      if (pickerFor === i) {
        ph += '<div class="mp-picker" role="listbox" aria-label="Balls">' + unl.map((id) => {
          const used = taken.indexOf(id) >= 0 && id !== p.ball;
          return '<button class="mp-pick' + (id === p.ball ? ' sel' : '') + (used ? ' taken' : '') + '" role="option" aria-selected="' + (id === p.ball) + '" data-act="mppick" data-i="' + i + '" data-id="' + esc(id) + '" title="' + (used ? 'Already used by another player' : '') + '">' + ballCv(id, '', 8) + (used ? '<span class="mp-tag">in use</span>' : '') + '</button>';
        }).join('') + '</div>';
      }
    });
    ph += '</div>' + (s.players.length < MAX_P ? '<button class="btn" data-act="mpadd">' + ic('plus') + 'Add player</button>' : '') +
      (unl.length < s.players.length ? '<div class="note">' + ic('lock') + 'Only ' + unl.length + ' balls unlocked, so some players share one. Names tell them apart.</div>' : '');
    html += section(ic('users') + 'Players <small>' + s.players.length + '/' + MAX_P + '</small>', ph);

    // what to play
    let ch = '<div class="seg mp-mode" role="tablist">' +
      '<button class="segb ' + (s.mode === 'course' ? 'on' : '') + (list.length ? '' : ' locked') + '" data-act="mpmode" data-v="course">' + ic('flag') + 'Course</button>' +
      '<button class="segb ' + (s.mode === 'random' ? 'on' : '') + (hasGen ? '' : ' locked') + '" data-act="mpmode" data-v="random">' + ic('dice') + 'Random course</button></div>';
    if (s.mode === 'course' && c) {
      const info = Pg().courseInfo(c.id), rounds = Pg().roundsFor(c.id), N = info.holes;
      const par = (r) => (r === 'back' ? info.back.par : r === 'front' ? info.front.par : info.par);
      const remixOk = canRemix() && Pg().remixAvailable(c.id);
      ch += '<select class="txt mp-select" data-in="mpcourse" aria-label="Course">' + list.map((x) => '<option value="' + esc(x.id) + '"' + (x.id === c.id ? ' selected' : '') + '>#' + Pg().courseNumber(x) + ' ' + esc(x.name) + '</option>').join('') + '</select>' +
        '<div class="mp-cinfo">' + gimBadge(courseGim(c)) + '<span class="dim">' + N + ' holes · par ' + info.par + '</span></div>' +
        '<div class="rounds mp-rounds">' + rounds.map((r) => '<button class="rbtn ' + (r === s.round ? 'on' : '') + '" data-act="mpround" data-r="' + r + '"><span class="rb-n">' + esc(N <= 9 ? '9 holes' : Pg().ROUND_NAMES[r]) + '</span><span class="rb-d">Par ' + par(r) + '</span></button>').join('') + '</div>' +
        (canRemix() ? '<div class="seg mode-seg"><button class="segb ' + (s.remix ? '' : 'on') + '" data-act="mpremix" data-v="0">' + ic('flag') + 'Normal</button>' +
          '<button class="segb ' + (s.remix ? 'on' : '') + (remixOk ? '' : ' locked') + '" data-act="mpremix" data-v="1" title="' + (remixOk ? 'Mirrored holes, tee on the right' : 'Clear this course under par to unlock Remix') + '">' + ic(remixOk ? 'mirror' : 'lock') + 'Remix</button></div>' : '');
    } else if (s.mode === 'random') {
      ch += '<div class="seedbox"><input class="seed" maxlength="12" value="' + G.RNG.seedToCode(s.seed) + '" data-in="mpseed" spellcheck="false" autocomplete="off" aria-label="Course code">' +
        iconBtn('mprand', 'dice', 'New random code') + iconBtn('mpcopy', 'copy', 'Copy code') + '</div><div class="note">' + ic('dice') + 'A seeded 9-hole course. Share the code to play the same one again.</div>';
    } else ch += '<div class="empty small">No courses unlocked yet.</div>';
    html += section(ic('flag') + 'What to play', ch);
    html += '<div class="note">' + ic('users') + 'Players take turns on every hole, using the ' + esc(G.Modes.get(G.Modes.current()).name) + ' rules. Multiplayer games don\'t unlock courses or change your progress, bests, stats or achievements.</div>';
    html += '</div><div class="sticky-go"><button class="btn big primary" data-act="mpgo">' + ic('play') + 'Start game</button></div>';
    render(html, 'list');
    keepScroll(args);
    bindPreviews(scr(), 'balls', 8);
    const redraw = () => { saveSetup(); show('mpSetup', { scroll: scr().scrollTop }); };
    on({
      back: () => { pickerFor = null; show('title'); },
      mpball: (d) => { click(); pickerFor = pickerFor === +d.i ? null : +d.i; redraw(); },
      mppick: (d) => { click(); s.players[+d.i].ball = d.id; pickerFor = null; redraw(); },
      mpadd: () => {
        if (s.players.length >= MAX_P) return;
        click(); s.players.push({ name: '', ball: pickBall(unl, s.players.map((p) => p.ball), null) }); redraw();
      },
      mprem: (d) => { if (s.players.length <= MIN_P) return; click(); s.players.splice(+d.i, 1); pickerFor = null; redraw(); },
      'in:mpname': (el) => { const p = s.players[+el.dataset.i]; if (p) { p.name = el.value.slice(0, NAME_MAX); saveSetup(); } },
      mpmode: (d) => {
        if (d.v === 'random' && !hasGen) { toast('Generator not loaded', 'warn'); return; }
        if (d.v === 'course' && !list.length) { toast('No courses unlocked yet', 'warn'); return; }
        click(); s.mode = d.v; redraw();
      },
      'in:mpcourse': (el) => { if (el.value === s.courseId) return; s.courseId = el.value; s.remix = s.remix && Pg().remixAvailable(s.courseId); fixRound(s); redraw(); },
      mpround: (d) => { click(); s.round = d.r; G.Store.set('roundChoice', d.r); redraw(); },
      mpremix: (d) => {
        if (d.v === '1' && !Pg().remixAvailable(s.courseId)) { A().sfx('uiback'); toast('Clear this course under par to unlock its Remix', 'warn'); return; }
        click(); s.remix = d.v === '1'; redraw();
      },
      'in:mpseed': (el) => { s.seed = G.RNG.codeToSeed(el.value) || s.seed; saveSetup(); },
      mprand: () => { click(); s.seed = randSeed(); redraw(); },
      mpcopy: () => { const el = scr().querySelector('.seed'); copyText(el ? el.value.toUpperCase() : G.RNG.seedToCode(s.seed)); },
      mpgo: () => {
        const players = normalizePlayers(s.players);
        if (!players) return;
        const el = scr().querySelector('.seed'); if (s.mode === 'random' && el) s.seed = G.RNG.codeToSeed(el.value) || s.seed;
        saveSetup(); click();
        start(s.mode === 'random' ? { players, seed: s.seed } : { players, courseId: s.courseId, round: s.round, remix: s.remix });
      },
    });
  };

  // "Pass the device to <name>": opaque, nothing of the course is visible while the device changes hands
  SCREENS.mpHandoff = function () {
    const r = App().run;
    if (!r || !r.mp) { show('title'); return; }
    const mp = r.mp, p = cur(r), prev = mp.turn > 0 ? mp.players[mp.turn - 1] : null, ps = prev && prev.scores[r.idx];
    const first = r.idx === 0 && mp.turn === 0;
    render('<div class="center-col"><div class="card pop mp-card">' +
      '<div class="card-k">' + ic('users') + esc(holeLabel(r)) + ' · ' + esc(gameName(r)) + '</div>' +
      '<div class="mp-pass-k">' + (first ? 'Tee off' : 'Pass the device to') + '</div>' +
      '<div class="mp-ballbig">' + ballCv(p.ball, '', 30) + '</div>' +
      '<h2 class="ttl mp-pass-n">' + esc(p.name) + '</h2>' +
      '<div class="mp-turn">Player ' + (mp.turn + 1) + ' of ' + mp.players.length + '</div>' +
      (ps ? '<div class="mp-last">' + ballCv(prev.ball, 'mp-dot', 6) + '<span><b>' + esc(prev.name) + '</b> · ' + esc(resultText(ps)) + ' <span class="dim">(' + sc(ps) + (ps.swish ? ', swish' : '') + ')</span></span></div>' : '') +
      '<div class="menu"><button class="btn big primary" data-act="go">' + ic('play') + (first || mp.turn === 0 ? 'Ready — tee off' : 'I\'m ready') + '</button>' +
      '<div class="menu-2"><button class="btn" data-act="card">' + ic('card') + 'Scorecard</button>' + quitBtn('Quit game') + '</div></div></div></div>', 'handoff');
    bindPreviews(scr(), 'balls', 12);
    on({
      go: () => { click(); go(); },
      card: () => { click(); show('mpScorecard', { ret: 'mpHandoff' }); },
      quit: (d, el) => { if (armQuit(el)) { click(); App().quitToMenu(); } },
      back: () => {},
    });
  };

  // after the last player has finished a hole: the hole's results and the shared scorecard
  SCREENS.mpHole = function (args) {
    const r = App().run;
    if (!r || !r.mp) { show('title'); return; }
    const par = (r.holes[r.idx] || {}).par, last = args.last;
    const rows = r.mp.players.map((p) => { const s = p.scores[r.idx]; return { p, s }; }).filter((x) => x.s);
    render('<div class="center-col"><div class="card pop wide mp-hole">' +
      '<div class="card-k">' + esc(holeLabel(r)) + ' · Par ' + esc(par) + (r.holes[r.idx] && r.holes[r.idx].name ? ' · ' + esc(r.holes[r.idx].name) : '') + '</div>' +
      '<div class="hd-label par">' + (last ? 'Last hole done' : 'Hole complete') + '</div>' +
      '<div class="mp-hres">' + rows.map(({ p, s }) => {
        const lb = G.Modes.scoreLabel(sc(s), s.par);
        return '<div class="mp-hr">' + ballCv(p.ball, 'mp-dot', 6) + '<b class="mp-hn">' + esc(p.name) + '</b><span class="mp-hl ' + (s.failed ? 'fail' : lb.cls) + '">' + esc(resultText(s)) + '</span>' +
          (s.swish ? '<span class="mp-sw" title="Swish">' + ic('swish') + '</span>' : '') + scv(sc(s) + (s.bonus ? '<sup class="swsup">−' + s.bonus + '</sup>' : ''), s.failed ? 'x' : lb.cls) + '</div>';
      }).join('') + '</div>' +
      cardHtml(r) + LEGEND +
      '<div class="menu row">' + quitBtn('Quit') + '<button class="btn big primary grow" data-act="next">' + (last ? 'Final results' : 'Next hole') + ic('next') + '</button></div></div></div>', 'dim');
    bindPreviews(scr(), 'balls', 6);
    G.Audio.sfx('star', { i: 0 });
    on({
      next: () => { click(); App().nextHole(); },
      quit: (d, el) => { if (armQuit(el)) { click(); App().quitToMenu(); } },
      back: () => {},
    });
  };

  // the shared scorecard on its own (from the pause menu or the hand-off screen)
  SCREENS.mpScorecard = function (args) {
    const r = App().run;
    if (!r || !r.mp) { show('title'); return; }
    render('<div class="center-col"><div class="card pop wide mp-sc"><div class="card-k">' + ic('card') + 'Scorecard · ' + esc(gameName(r)) + '</div>' +
      '<h2 class="ttl">' + esc(holeLabel(r)) + '</h2>' + cardHtml(r) + LEGEND +
      '<div class="menu row"><button class="btn primary big grow" data-act="back">' + ic('back') + 'Back</button></div></div></div>', 'dim');
    bindPreviews(scr(), 'balls', 6);
    on({ back: () => show(args.ret || 'pause', args.retArgs) });
  };

  const MEDAL = { 1: '1st', 2: '2nd', 3: '3rd', 4: '4th' };
  SCREENS.mpResults = function () {
    const r = App().run;
    if (!r || !r.mp) { show('title'); return; }
    const st = standings(r), winners = st.filter((x) => x.rank === 1), w0 = winners[0];
    const names = winners.map((x) => esc(x.p.name));
    const headline = winners.length === 1 ? names[0] + ' wins!' : winners.length === st.length ? 'Everyone ties!' : names.slice(0, -1).join(', ') + ' &amp; ' + names[names.length - 1] + ' tie!';
    const conf = [];
    for (let i = 0; i < 26; i++) conf.push('<i style="left:' + ((i * 37 + 7) % 100) + '%;--c:' + ['#ffc93c', '#ff5c6c', '#6ff0ff', '#42d583', '#b26bff', '#fff'][i % 6] + ';--dl:' + ((i * 0.13) % 1.8).toFixed(2) + 's;--dx:' + (((i * 53) % 60) - 30) + 'px"></i>');
    const tp = w0.par;
    render('<div class="center-col"><div class="card pop wide result mp-results">' +
      '<div class="card-k">' + ic('users') + 'Multiplayer · ' + esc(gameName(r)) + '</div>' +
      '<div class="mp-celebrate"><div class="confetti" aria-hidden="true">' + conf.join('') + '</div>' +
        '<div class="mp-wins">' + winners.map((x) => '<span class="mp-win">' + ballCv(x.p.ball, '', 30) + '</span>').join('') + '</div>' +
        '<div class="hd-label eagle">' + ic('trophy') + headline + '</div>' +
        '<div class="mp-sub">' + w0.total + ' strokes · <span class="rel ' + relCls(w0.total, tp) + '">' + relPar(w0.total, tp) + '</span> <span class="dim">(par ' + tp + ')</span></div></div>' +
      '<div class="mp-stand">' + st.map((x) => {
        const p = x.p;
        return '<div class="mp-sr r' + x.rank + '"><span class="mp-rk">' + (x.tie ? 'T' : '') + MEDAL[x.rank] + '</span><span class="mp-sball">' + ballCv(p.ball, '', 10) + '</span>' +
          '<span class="mp-sn"><b>' + esc(p.name) + '</b><span class="mp-chips">' +
            '<span class="mp-chip" title="Swishes">' + ic('swish') + p.swishes + '<small>swish' + (p.swishes === 1 ? '' : 'es') + '</small></span>' +
            '<span class="mp-chip" title="Holes-in-one">' + ic('target') + p.aces + '<small>ace' + (p.aces === 1 ? '' : 's') + '</small></span>' +
            (p.pickups ? '<span class="mp-chip" title="Holes picked up">' + ic('x') + p.pickups + '<small>picked up</small></span>' : '') +
            (p.mull.used ? '<span class="mp-chip" title="Mulligans used">' + ic('undo') + p.mull.used + '<small>mulligan' + (p.mull.used === 1 ? '' : 's') + '</small></span>' : '') +
            '<span class="mp-chip" title="Time played">' + ic('clock') + fmtTimeS(x.time) + '</span></span></span>' +
          '<span class="mp-tot"><b>' + x.total + '</b>' + relTag(x.total, x.par) + '</span></div>';
      }).join('') + '</div>' +
      cardHtml(r) + LEGEND +
      '<div class="menu row"><button class="btn ghost" data-act="menu">' + ic('home') + 'Menu</button><button class="btn ghost" data-act="setup">' + ic('settings') + 'New setup</button>' +
      '<button class="btn big primary grow" data-act="again">' + ic('replay') + 'Play again</button></div></div></div>', 'dim');
    bindPreviews(scr(), 'balls', 12);
    setTimeout(() => G.Audio.sfx('fanfare'), 200);
    if (G.Haptics) G.Haptics.buzz('hole');
    on({
      again: () => { click(); start(r.mp.setup); },
      setup: () => { click(); App().quitToMenu('mpSetup'); },
      menu: () => { click(); App().quitToMenu(); }, back: () => App().quitToMenu(),
    });
  };

  G.Multi = { start, go, ready, holed, failed, nextHole, status, standings, normalizePlayers, MIN_PLAYERS: MIN_P, MAX_PLAYERS: MAX_P };
})();
