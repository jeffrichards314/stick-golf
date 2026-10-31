/* Boot, main loop, app flow + automation API (GOLF.App). */
(function () {
  'use strict';
  const G = window.GOLF = window.GOLF || {};
  const qs = new URLSearchParams(location.search);

  const App = G.App = {
    state: 'boot', session: null, run: null, attract: null, waiting: false, lookToggle: false,
    R: null, cam: null, input: null, time: 0,
  };

  function today() { const d = new Date(); const p = (n) => (n < 10 ? '0' : '') + n; return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()); }
  App.today = today;

  // ---------- audio ----------
  App.applyAudio = function () {
    const s = G.Store.getSettings();
    G.Audio.setMute(s.mute); G.Audio.setVolumes(s.sfxVol);
  };
  App.toggleMute = function () {
    const s = G.Store.getSettings(); G.Store.saveSettings({ mute: !s.mute }); App.applyAudio();
    G.UI.toast(s.mute ? 'Sound off' : 'Sound on', 'info', 900);
  };

  // ---------- input proxy ----------
  const proxy = {};
  ['aimStart', 'aimMove', 'aimEnd', 'pan', 'zoom', 'tap', 'lookStart', 'lookEnd', 'keyUp', 'wheel', 'isAimingNow'].forEach((k) => {
    proxy[k] = function (...a) {
      const s = App.session;
      if (!s || App.waiting || G.UI.current) return k === 'aimStart' || k === 'wheel' ? false : undefined;
      if (k === 'lookEnd' && App.lookToggle) return undefined;
      return s[k] ? s[k](...a) : undefined;
    };
  });
  proxy.keyDown = function (code, e) {
    if (code === 'Escape' || code === 'KeyP') {
      if (G.UI.current) { if (code === 'Escape') return G.UI.back(); return false; }
      if (App.session && !App.waiting) { App.pause(); return true; }
      return false;
    }
    if (code === 'KeyM' && !e.repeat) { App.toggleMute(); return true; }
    if (G.UI.current) {
      if ((code === 'Enter' || code === 'Space') && (G.UI.current === 'holeDone')) { App.nextHole(); return true; }
      return false;
    }
    if (!App.session || App.waiting) return false;
    if (code === 'KeyR' && !e.repeat) { App.restartHole(); return true; }
    return App.session.keyDown(code, e);
  };

  // ---------- flow ----------
  function hudExtra() {
    const r = App.run; if (!r) return {};
    let sub = '', kicker = '', mode = '', total = null;
    const done = r.scores.filter((x) => !!x);
    const rel = () => { const ts = done.reduce((a, x) => a + (x.score !== undefined ? x.score : x.strokes), 0), tp = done.reduce((a, x) => a + x.par, 0); const d = ts - tp; return done.length ? (d === 0 ? 'E' : d > 0 ? '+' + d : String(d)) : null; };
    if (r.kind === 'endless') { sub = 'Score ' + r.score + ' ·'; kicker = 'Hole ' + (r.idx + 1); mode = 'Endless'; total = { label: 'Score', value: String(r.score) }; }
    else if (r.kind === 'daily') { sub = 'Daily ' + (r.idx + 1) + '/9 ·'; kicker = 'Hole ' + (r.idx + 1) + '/' + r.n; mode = 'Daily'; }
    else if (r.kind === 'random') { sub = 'Random ' + (r.idx + 1) + '/9 ·'; kicker = 'Hole ' + (r.idx + 1) + '/' + r.n; mode = 'Random'; }
    else if (r.kind === 'course') {
      const rn = G.Progress.ROUND_NAMES[r.round] || '';
      sub = 'Hole ' + ((r.offset || 0) + r.idx + 1) + ' · ' + rn + ' ·';
      kicker = 'Hole ' + ((r.offset || 0) + r.idx + 1); mode = rn + ' · ' + (r.idx + 1) + '/' + r.n;
    } else { sub = 'Hole ' + (r.idx + 1) + '/' + r.n + ' ·'; kicker = 'Hole ' + (r.idx + 1) + '/' + r.n; mode = 'Practice'; }
    if (!total) { const t = rel(); if (t !== null) total = { label: 'Total', value: t }; }
    return { sub, kicker, mode, total, allowRestart: r.kind === 'dev' };
  }
  // ---------- lifetime stats + cosmetic unlocks ----------
  function checkUnlocks(r) {
    let items = [];
    try { items = G.Progress.newUnlockItems(); } catch (e) { console.warn('[unlocks]', e); }
    if (items.length) {
      if (r) (r.unlocked = r.unlocked || []).push(...items);
      G.UI.unlockToasts(items);
    }
    return items;
  }
  function holeStats(r, res) {
    if (!r || r.kind === 'dev') return;
    try { G.Progress.recordHoleStats(res, r.kind); } catch (e) { console.warn('[stats]', e); }
  }
  function strokeLimitFor(run, par) {
    if (run.kind === 'endless') {
      const rule = run.settings.strokeRule || 'par+2';
      if (rule === 'unlimited') return Infinity;
      const m = /par\+(\d)/.exec(rule); return par + (m ? +m[1] : 2);
    }
    return G.Modes.strokeLimit(run.diff, par);
  }
  function waitHole() {
    const r = App.run;
    if (r.ready(r.idx)) { playCurrent(); return; }
    App.waiting = true;
    App.input.handler = proxy;
    G.UI.showHud(false);
    G.UI.show('loading', { title: 'Generating hole…' });
  }
  function playCurrent() {
    const r = App.run, i = r.idx, hole = r.holes[i];
    App.waiting = false;
    if (!hole) { G.UI.toast('Hole unavailable', 'warn'); App.quitToMenu(); return; }
    const theme = r.theme(i);
    App.session = G.Play.create({
      hole, theme, diff: r.diff, R: App.R, cam: App.cam, cosmetics: Object.assign(G.Progress.equipped(), { holeNum: (r.offset || 0) + i + 1 }),
      mulligans: r.mulligans, kind: r.kind, strokeLimit: strokeLimitFor(r, hole.par),
      onHoled, onFailed,
    });
    App.attract = null;
    App.input.handler = proxy;
    G.UI.hide(); G.UI.showHud(true);
    if (App.lookToggle) App.toggleLook();
    App.state = 'play';
    introduce(r, i, hole);
  }
  // "New gimmick" intro cards during the pre-shot pan + token hint
  function introduce(r, i, hole) {
    try {
      const M = G.Manifest, info = (M && M.GIMMICK_INFO) || {};
      const types = [];
      (hole.gm || []).forEach((g) => { if (g && g.t && types.indexOf(g.t) < 0) types.push(g.t); });
      const show = [];
      const cg = r.kind === 'course' && r.def && r.def.gimmick;
      if (i === 0 && cg) show.push(cg); // hole 1 of a course always introduces the course's gimmick
      types.forEach((t) => { if (show.indexOf(t) < 0 && !G.Progress.gimmickSeen(t) && info[t]) show.push(t); });
      // the course's own gimmick first, at most 2 cards
      show.slice(0, 2).forEach((t, k) => setTimeout(() => {
        if (App.session && App.session.hole === hole) G.UI.introCard(t, info[t] || {});
      }, 350 + k * 2600));
      G.Progress.markGimmicksSeen(types);
      if (types.indexOf('tokens') >= 0) setTimeout(() => { if (App.session && App.session.hole === hole) G.UI.toast('★ Collect all stars to open the cup', 'info', 2600); }, show.length ? 600 + show.length * 2600 : 600);
    } catch (e) { console.warn('[intro]', e); }
  }
  function onHoled(res) {
    const r = App.run, i = r.idx;
    let newBest = false;
    const score = res.score !== undefined ? res.score : res.strokes;
    r.scores[i] = { strokes: res.strokes, bonus: res.bonus || 0, score, par: res.par, swish: !!res.swish };
    if (r.kind === 'course') { const rec = G.Progress.recordHole(r.courseId, (r.offset || 0) + i, score, res.par); newBest = rec.newBest && rec.prevStars > 0; }
    if (r.kind === 'endless') { const b = Math.max(0, res.par - score); r.cleared++; r.underPar += b; r.score += 1 + b; G.Store.maxStat('endless', r.cleared); G.Store.maxStat('endlessScore', r.score); }
    holeStats(r, { strokes: res.strokes, score, par: res.par, swish: !!res.swish });
    G.UI.showHud(false);
    setTimeout(() => checkUnlocks(r), 700);
    G.UI.show('holeDone', { res, last: i >= r.n - 1, newBest, name: App.session.hole.name });
  }
  function onFailed(res) {
    const r = App.run;
    G.UI.showHud(false);
    if (r.kind === 'endless') {
      const diff = G.Modes.get(r.diff).name;
      const entry = { score: r.score, holes: r.cleared, diff, seed: G.RNG.seedToCode(r.settings.seed) };
      const rank = G.Run.addScore(G.Run.settingsKey(r.settings), entry);
      G.Store.bumpStat('endlessRuns'); G.Store.maxStat('endless', r.cleared); G.Store.maxStat('endlessScore', r.score);
      G.UI.show('gameOver', { rank, entryId: entry.id });
      setTimeout(() => checkUnlocks(r), 700);
      return;
    }
    // rounds play straight through: a hole that hits the limit is picked up and scored, then on to the next hole
    const sess = App.session, i = r.idx;
    const lim = sess && sess.limit !== Infinity ? sess.limit : (res.strokes || 0) + 1;
    const x = lim + 1;
    r.scores[i] = { strokes: x, bonus: 0, score: x, par: res.par, failed: true, reason: res.reason || null };
    holeStats(r, { strokes: res.strokes || 0, score: x, par: res.par, failed: true });
    G.UI.show('holeFail', { res, score: x, last: i >= r.n - 1, name: sess && sess.hole ? sess.hole.name : '' });
  }
  function finishRun() {
    const r = App.run;
    const complete = r.scores.length >= r.n && r.scores.every((s) => !!s); // picked-up holes still finish the round
    const args = { after: null };
    if (r.kind === 'course') {
      const after = G.Progress.courseInfo(r.courseId);
      args.bonus = Math.max(0, after.bonus - (r.bonusBefore || 0));
      if (complete && r.startIdx === 0) {
        args.newBest = G.Progress.recordRound(r.courseId, r.round, r.totalStrokes());
        if (r.round === 'all' && r.n > 9) { // an 18-hole round also counts as a front-9 and a back-9 round
          const sc = (s) => (s.score !== undefined ? s.score : s.strokes);
          G.Progress.recordRound(r.courseId, 'front', r.scores.slice(0, 9).reduce((t, s) => t + sc(s), 0));
          G.Progress.recordRound(r.courseId, 'back', r.scores.slice(9).reduce((t, s) => t + sc(s), 0));
        }
        const a2 = G.Progress.courseInfo(r.courseId); args.bonus = Math.max(0, a2.bonus - (r.bonusBefore || 0)); // full-18 bonus
      }
      args.round = r.round;
      args.stars = r.scores.reduce((a, s) => a + (s && !s.failed ? G.Modes.stars(s.score !== undefined ? s.score : s.strokes, s.par) : 0), 0);
      if (complete) G.Store.bumpStat(r.round === 'all' && r.n > 9 ? 'rounds' : 'nines');
      const rn = G.Progress.ROUND_NAMES[r.round] || '';
      args.title = complete ? (r.round === 'all' ? 'Course complete!' : rn + ' complete!') : 'Round finished';
      args.after = 'course';
    } else if (r.kind === 'daily') {
      if (complete) G.Store.bumpStat('daily');
      if (complete) args.dailyBest = G.Progress.recordDaily(r.date, r.totalStrokes(), r.scores.reduce((a, s) => a + s.par, 0), r.scores.map((s) => (s.score !== undefined ? s.score : s.strokes)));
      args.title = 'Daily complete!'; args.after = 'daily';
    } else if (r.kind === 'random') {
      if (complete) G.Store.bumpStat('randoms');
      args.code = G.RNG.seedToCode(r.seed); args.title = 'Course complete!'; args.after = 'random';
    } else args.after = 'title';
    if (r.kind !== 'dev') checkUnlocks(r);
    args.unlocks = (r.unlocked || []).slice();
    G.UI.showHud(false);
    G.UI.show('courseDone', args);
  }

  // round: 'all' | 'front' | 'back' (default: the nine containing holeIdx). holeIdx is 0-based over the full course.
  App.startCourse = function (id, holeIdx, round) {
    holeIdx = Math.max(0, holeIdx | 0);
    const def = G.Progress.def(id);
    G.UI.show('loading', { title: 'Loading course…', sub: def ? def.name : id });
    G.Progress.loadCourse(id, (holes, err) => {
      if (!holes || !holes.length) { G.UI.toast('Could not load course (' + (err || '?') + ')', 'warn'); G.UI.show(def ? 'course' : 'courses', { id }); return; }
      const n = holes.length; // tolerate stale 9-hole data
      if (round !== 'all' && round !== 'front' && round !== 'back') round = holeIdx >= 9 && n > 9 ? 'back' : 'front';
      if (n <= 9) round = 'front';
      const a = round === 'back' ? 9 : 0, b = round === 'front' ? Math.min(9, n) : n;
      const r = G.Run.fromHoles('course', def, holes.slice(a, b), G.Modes.current());
      r.round = round; r.offset = a; r.courseHoles = n;
      const rel = Math.max(0, Math.min(b - a - 1, holeIdx - a));
      // a round is played in order from its first hole; a hole index is only honoured for automation (?course=&hole=)
      r.courseId = id; r.idx = App.allowHoleStart && holeIdx >= a && holeIdx < b ? rel : 0; r.startIdx = r.idx;
      r.bonusBefore = G.Progress.courseInfo(id).bonus;
      App.run = r; App.session = null;
      playCurrent();
    });
  };
  App.startDev = function () {
    const D = G.Dev;
    const h2 = JSON.parse(JSON.stringify(D.DEV_HOLE)); h2.name = 'Dev Hole 2'; h2.par = 4; h2.gm[0].ax = 60;
    const holes = [D.DEV_HOLE, h2].concat(D.DEV_EXTRA || []);
    const r = G.Run.fromHoles('dev', D.DEV_THEME, holes, G.Modes.current());
    r.idx = Math.max(0, Math.min(holes.length - 1, (+(qs.get('hole') || 1) || 1) - 1));
    App.run = r; playCurrent();
  };
  App.startEndless = function (settings) {
    if (!G.Generator || !G.Generator.endlessHole) { G.UI.toast('Generator not loaded', 'warn'); return; }
    App.run = G.Run.endless(Object.assign({}, settings), G.Modes.current());
    App.session = null;
    waitHole();
  };
  App.startDaily = function () {
    if (!G.Generator || !G.Generator.dailyCourse) { G.UI.toast('Generator not loaded', 'warn'); return; }
    const date = today();
    let dc; try { dc = G.Generator.dailyCourse(date); } catch (e) { console.error(e); G.UI.toast('Daily generation failed', 'warn'); return; }
    const r = G.Run.generated('daily', Object.assign({}, dc.def, { name: 'Daily ' + date }), dc.holeParams, G.Modes.current());
    r.date = date; App.run = r; App.session = null;
    waitHole();
  };
  App.startRandom = function (seed) {
    if (!G.Generator || !G.Generator.randomCourse) { G.UI.toast('Generator not loaded', 'warn'); return; }
    seed = seed === undefined ? Math.floor(Math.random() * 0x3fffffff) : seed >>> 0;
    let rc; try { rc = G.Generator.randomCourse(seed); } catch (e) { console.error(e); G.UI.toast('Generation failed', 'warn'); return; }
    const r = G.Run.generated('random', Object.assign({}, rc.def, { name: 'Random ' + G.RNG.seedToCode(seed) }), rc.holeParams, G.Modes.current());
    r.seed = seed; App.run = r; App.session = null;
    waitHole();
  };
  App.nextHole = function () {
    const r = App.run; if (!r) return;
    if (r.idx >= r.n - 1) { finishRun(); return; }
    r.idx++;
    waitHole();
  };
  App.retryHole = function () {
    if (!App.session) return;
    App.session.restart(); App.session.paused = false;
    const r = App.run; if (r) delete r.scores[r.idx];
    G.UI.hide(); G.UI.showHud(true);
  };
  App.skipHole = function () {
    const r = App.run, s = App.session; if (!r || !s) return;
    const x = (s.limit === Infinity ? s.S.strokes : s.limit) + 1;
    r.scores[r.idx] = { strokes: x, bonus: 0, score: x, par: s.hole.par, failed: true, reason: s.failReason || null };
    App.nextHole();
  };
  App.restartHole = function () {
    if (!App.session || !App.run || App.run.kind !== 'dev') return; // rounds play straight through
    App.session.restart(); G.Audio.sfx('uiback');
  };
  App.replayRun = function () {
    const r = App.run;
    if (r.kind === 'course') App.startCourse(r.courseId, r.offset || 0, r.round);
    else if (r.kind === 'daily') App.startDaily();
    else if (r.kind === 'random') App.startRandom(r.seed);
    else if (r.kind === 'dev') App.startDev();
  };
  App.pause = function () {
    const s = App.session; if (!s || App.waiting) return;
    if (s.state !== 'play') return;
    s.paused = true; App.input.cancel();
    G.UI.show('pause');
  };
  App.resume = function () {
    const s = App.session; if (s) s.paused = false;
    G.UI.hide(); if (s) G.UI.showHud(true);
    App.state = 'play';
  };
  App.toggleLook = function () {
    App.lookToggle = !App.lookToggle; App.input.lookToggle = App.lookToggle;
    App.cam.look.on = App.lookToggle;
    G.UI.toast(App.lookToggle ? 'Look mode: drag to pan' : 'Look mode off', 'info', 1000);
  };
  App.quitToMenu = function (screen) {
    const r = App.run;
    G.UI.clearIntro();
    App.session = null; App.waiting = false; App.run = null;
    if (App.lookToggle) { App.lookToggle = false; App.input.lookToggle = false; }
    G.UI.showHud(false);
    startAttract();
    if (screen === 'course' && r && r.courseId) G.UI.show('course', { id: r.courseId });
    else if (screen) G.UI.show(screen);
    else if (r && r.kind === 'course' && r.courseId) G.UI.show('course', { id: r.courseId });
    else G.UI.show('title');
  };
  // Snapshot for automation/tests
  App.status = function () {
    const s = App.session, r = App.run;
    const o = { state: App.state, screen: G.UI.current || null, waiting: !!App.waiting };
    if (r) Object.assign(o, { kind: r.kind, courseId: r.courseId || null, round: r.round || null, offset: r.offset || 0, hole: r.idx, courseHole: (r.offset || 0) + r.idx, holes: r.n, total: r.totalStrokes(), scores: r.scores.slice() });
    if (s) {
      Object.assign(o, {
        holeId: s.hole.id, par: s.hole.par, strokes: s.S.strokes, bonus: s.S.bonus || 0, score: s.score(),
        rest: !!s.S.rest, holed: !!s.S.holed, failed: s.S.failed || (s.state === 'failed' ? s.failReason || 'limit' : null), swish: !!s.S.swish,
        putt: s.isPutt(), spin: s.spin, limit: s.limit, x: s.S.x, y: s.S.y, playState: s.state, tokens: s.tokenInfo(),
        result: s.result ? { strokes: s.result.strokes, score: s.result.score, bonus: s.result.bonus, holed: s.result.holed, reason: s.result.reason || null } : null,
      });
    }
    return o;
  };
  App.setSpin = function (v) { const s = App.session; if (!s) return false; s.setSpin(+v || 0); return s.spin; };
  App.currentPlay = function () { const s = App.session; return s ? { W: s.W, S: s.S, hole: s.hole, session: s, run: App.run } : null; };
  App.shoot = function (angle, power, spin) { const s = App.session; if (!s) return false; App.cam.skipIntro(); return s.shoot(angle, power, spin); };

  // Fire a bot solution [{a,p}] with exact Bot timing (each shot on the step the ball comes to rest).
  // For a faithful replay call right after the hole starts (or after restartHole()).
  App.autoplay = function (shots) { const s = App.session; if (!s) return false; App.cam.skipIntro(); s.queueShots(shots); return true; };

  // ---------- attract mode ----------
  let attractTry = 0;
  function startAttract() {
    const token = ++attractTry;
    const begin = (hole, theme) => {
      if (token !== attractTry || App.session) return;
      App.attract = G.Play.create({ hole, theme, diff: 'chill', R: App.R, cam: App.cam, cosmetics: G.Progress.equipped(), demo: true, intro: false });
      App.attract.demo = { wait: 0, shots: 0, sol: null, si: 0, solver: null };
      try { if (G.Bot && G.Bot.createSolver) App.attract.demo.solver = G.Bot.createSolver(hole, { maxStrokes: hole.par + 2 }); } catch (e) { /* */ }
      App.cam.userMul = 0.85;
    };
    const list = G.Progress.courses().filter((c) => G.Progress.baked(c.id) && G.Progress.unlocked(c));
    if (list.length) {
      const c = list[Math.floor(Math.random() * Math.min(list.length, 4))];
      G.Progress.loadCourse(c.id, (holes) => {
        if (holes && holes.length) { const h = holes[Math.floor(Math.random() * holes.length)]; begin(h, G.Run.themeFor(h, c)); }
        else begin(G.Dev.DEV_HOLE, G.Dev.DEV_THEME);
      });
    } else begin(G.Dev.DEV_HOLE, G.Dev.DEV_THEME);
  }
  function attractUpdate(a, dt) {
    const d = a.demo;
    if (d.solver && !d.sol) {
      let res = null; try { res = d.solver.run(3); } catch (e) { d.solver = null; d.sol = []; }
      if (res) { d.sol = res.ok ? res.shots : []; d.solver = null; }
    }
    if (a.S.holed || d.shots > 7) { d.wait += dt; if (d.wait > 2.5) { a.restart(); d.wait = 0; d.shots = 0; d.queued = false; } return; }
    if (d.sol && d.sol.length && !d.queued) {
      if (a.S.strokes > 0) a.restart();
      a.queueShots(d.sol); d.queued = true; d.shots = 0; return;
    }
    if (d.queued) { if (a.S.rest && !a.queue.length) { d.wait += dt; if (d.wait > 3) { d.shots = 99; } } return; }
    if (a.S.rest && !a.S.holed) {
      d.wait += dt;
      if (d.wait > 1.1 && (d.sol || !d.solver || d.wait > 4)) {
        const dir = a.hole.cup[0] > a.S.x ? 1 : -1;
        const ang = dir > 0 ? -Math.PI / 4 - Math.random() * 0.4 : -3 * Math.PI / 4 + Math.random() * 0.4;
        const pw = Math.min(1, 0.35 + Math.min(0.6, Math.abs(a.hole.cup[0] - a.S.x) / 3000) + Math.random() * 0.15);
        a.shoot(ang, pw, 0); d.shots++; d.wait = 0;
      }
    } else d.wait = 0;
  }

  // ---------- boot ----------
  function resize() {
    const cv = App.canvas, w = window.innerWidth, h = window.innerHeight, dpr = Math.min(2, window.devicePixelRatio || 1);
    cv.style.width = w + 'px'; cv.style.height = h + 'px';
    cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
    App.vw = w; App.vh = h; App.dpr = dpr;
    if (App.R) App.R.resize(w, h);
    App.cam.setViewport(w, h);
  }
  function drawIdle(t) {
    const c = App.canvas.getContext('2d');
    c.setTransform(App.dpr, 0, 0, App.dpr, 0, 0);
    const g = c.createLinearGradient(0, 0, 0, App.vh); g.addColorStop(0, '#2b4a8a'); g.addColorStop(1, '#8fd0ff');
    c.fillStyle = g; c.fillRect(0, 0, App.vw, App.vh);
    for (let i = 0; i < 6; i++) {
      const x = ((i * 233 + t * 60) % (App.vw + 40)) - 20, y = App.vh * 0.8 - Math.abs(Math.sin(t * 2 + i)) * 160;
      c.fillStyle = '#fff'; c.beginPath(); c.arc(x, y, 7, 0, 7); c.fill();
    }
    c.fillStyle = '#4c9a3c'; c.fillRect(0, App.vh * 0.8 + 7, App.vw, App.vh);
  }
  let last = 0;
  function frame(ts) {
    requestAnimationFrame(frame);
    const dt = Math.min(0.05, Math.max(0, (ts - (last || ts)) / 1000)); last = ts;
    App.time += dt;
    try {
      const r = App.run;
      if (r && r.kind !== 'course' && r.kind !== 'dev') {
        r.pump(App.waiting ? 14 : 3);
        if (App.waiting) {
          if (r.ready(r.idx)) playCurrent();
          else G.UI.loaderUpdate(r.jobStatus(r.idx), 'hole ' + (r.idx + 1));
        }
      }
      const s = App.session || App.attract;
      if (s) {
        if (s === App.attract) attractUpdate(s, dt);
        if (!(App.waiting && s === App.session)) s.update(dt, App.input.keys);
        try { s.draw(App.time, dt); } catch (e) { // renderer errors must not stall the game/HUD
          if (!App._drawErr) { App._drawErr = true; console.error('[render]', e); G.UI.toast('Render error: ' + e.message, 'warn', 4000); }
        }
        if (App.session && !App.waiting) {
          G.UI.updateHud(App.session.hudInfo(), hudExtra());
          if (!G.UI.current) App.state = App.session.paused ? 'pause' : App.session.state; // 'play' | 'holed' | 'failed'
        }
      } else drawIdle(App.time);
    } catch (e) {
      console.error(e);
      if (!App._errShown) { App._errShown = true; G.UI.toast('Error: ' + e.message, 'warn', 4000); }
    }
  }
  function boot() {
    App.canvas = document.getElementById('game');
    App.cam = G.Camera.create();
    const RM = G.Render && G.Render.create ? G.Render : G.Dev.FallbackRender;
    if (RM !== G.Render) console.warn('[golf] GOLF.Render missing — using dev fallback renderer');
    try { App.R = RM.create(App.canvas); } catch (e) { console.error('Render.create failed', e); App.R = G.Dev.FallbackRender.create(App.canvas); }
    App.usingFallback = RM !== G.Render;
    if (!G.Render) G.Render = { COSMETICS: G.Dev.FallbackRender.COSMETICS, drawPreview: G.Dev.FallbackRender.drawPreview, fallback: true };
    App.input = G.Input.create(App.canvas);
    App.input.handler = proxy;
    G.UI.init();
    resize();
    window.addEventListener('resize', resize);
    window.addEventListener('orientationchange', () => setTimeout(resize, 200));
    document.addEventListener('visibilitychange', () => { if (document.hidden && App.session && !G.UI.current) App.pause(); });
    App.applyAudio();
    G.Progress.newUnlocks(); // prime "seen" set
    const bm = document.getElementById('boot-msg'); if (bm) bm.remove();
    if (G._missing && G._missing.length) console.warn('[golf] missing scripts:', G._missing.join(', '));
    // routing
    if (qs.get('dev')) { if (!G.Store.getSettings().difficulty) G.Store.saveSettings({ difficulty: 'standard' }); App.startDev(); }
    else if (qs.get('course')) { startAttract(); App.allowHoleStart = true; App.startCourse(qs.get('course'), +(qs.get('hole') || 1) - 1, qs.get('round') || undefined); }
    else {
      startAttract();
      if (!G.Store.getSettings().difficulty) G.UI.show('difficulty', { first: true, ret: 'title' });
      else G.UI.show('title');
    }
    requestAnimationFrame(frame);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
