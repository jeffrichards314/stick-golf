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
    if (G.Music) G.Music.set(!!s.bgm, s.bgmVol);
  };
  // accessibility / display classes on <body>
  App.applyA11y = function () {
    const s = G.Store.getSettings(), b = document.body;
    b.classList.toggle('cb', !!s.colorblind);
    b.classList.toggle('rfx', G.Store.reducedFx());
    b.classList.toggle('big-touch', !!s.bigTouch);
    b.classList.toggle('hc', !!s.highContrast);
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
      if ((code === 'Enter' || code === 'Space') && (G.UI.current === 'holeDone' || G.UI.current === 'mpHole')) { App.nextHole(); return true; }
      if ((code === 'Enter' || code === 'Space') && G.UI.current === 'mpHandoff' && G.Multi) { G.Multi.go(); return true; }
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
    } else if (r.kind === 'multi') {
      const rn = r.random ? 'Random' : (G.Progress.ROUND_NAMES[r.round] || '');
      sub = 'Hole ' + ((r.offset || 0) + r.idx + 1) + ' ·';
      kicker = 'Hole ' + ((r.offset || 0) + r.idx + 1); mode = 'Multiplayer · ' + rn + ' · ' + (r.idx + 1) + '/' + r.n;
    } else if (r.kind === 'practice') { kicker = 'Hole ' + ((r.offset || 0) + 1); mode = 'Practice' + (r.def && r.def.name ? ' · ' + r.def.name : ''); }
    else if (r.kind === 'tutorial') { kicker = 'Tutorial'; mode = 'Unlimited strokes · restart any time'; }
    else if (r.kind === 'custom') { kicker = r.custom.mode === 'test' ? 'Test play' : 'Shared hole'; mode = 'Unlimited strokes · restart any time'; }
    else { sub = 'Hole ' + (r.idx + 1) + '/' + r.n + ' ·'; kicker = 'Hole ' + (r.idx + 1) + '/' + r.n; mode = 'Practice'; }
    if ((r.kind === 'course' || r.kind === 'multi') && r.remix) mode = 'Remix · ' + mode;
    if (!total && r.kind !== 'practice' && r.kind !== 'tutorial' && r.kind !== 'custom') { const t = rel(); if (t !== null) total = { label: 'Total', value: t }; }
    const s = App.session;
    const timed = r.kind === 'course' || r.kind === 'multi' || r.kind === 'daily' || r.kind === 'random' || r.kind === 'practice' || r.kind === 'tutorial' || r.kind === 'custom';
    const roundT = (r.times || []).reduce((a, x) => a + (x || 0), 0) + (s && !r.scores[r.idx] ? s.clock : 0);
    return { sub, kicker, mode, total, allowRestart: r.kind === 'dev' || r.kind === 'practice' || r.kind === 'tutorial' || r.kind === 'custom',
      clock: timed && s ? { hole: s.clock, round: r.n > 1 ? roundT : null } : null, showMe: (r.kind === 'practice' || r.kind === 'tutorial' || r.kind === 'custom') && s && s.hasBotHint(), editCopy: r.kind === 'custom' && r.custom.mode === 'shared' };
  }
  // ---------- lifetime stats + cosmetic unlocks ----------
  function checkUnlocks(r) {
    try { if (G.Achievements) G.Achievements.check(); } catch (e) { console.warn('[ach]', e); }
    let items = [];
    try { items = G.Progress.newUnlockItems(); } catch (e) { console.warn('[unlocks]', e); }
    if (items.length) {
      if (r) (r.unlocked = r.unlocked || []).push(...items);
      G.UI.unlockToasts(items);
    }
    return items;
  }
  function holeStats(r, res) {
    if (!r || r.kind === 'dev' || r.kind === 'practice' || r.kind === 'tutorial' || r.kind === 'custom') return;
    try { G.Progress.recordHoleStats(res, r.kind); } catch (e) { console.warn('[stats]', e); }
  }
  function strokeLimitFor(run, par) {
    if (run.kind === 'practice' || run.kind === 'tutorial' || run.kind === 'custom') return Infinity;
    if (run.kind === 'endless') {
      const rule = run.settings.strokeRule || 'par+2';
      if (rule === 'unlimited') return Infinity;
      const m = /par\+(\d)/.exec(rule); return par + (m ? +m[1] : 2);
    }
    return G.Modes.strokeLimit(run.diff, par);
  }
  // the hole is ready: play it (multiplayer: hand the device to the next player first)
  function startReady() { if (App.run.kind === 'multi') G.Multi.ready(App.run); else playCurrent(); }
  function waitHole() {
    const r = App.run;
    if (r.ready(r.idx)) { startReady(); return; }
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
    const mp = r.kind === 'multi' ? r.mp.players[r.mp.turn] : null;
    const cos = Object.assign(G.Progress.equipped(), { holeNum: (r.offset || 0) + i + 1 });
    if (mp) cos.ball = mp.ball;
    App.session = G.Play.create({
      hole, theme, diff: r.diff, R: App.R, cam: App.cam, cosmetics: cos,
      mulligans: r.mulligans, kind: r.kind, strokeLimit: strokeLimitFor(r, hole.par),
      onHoled, onFailed,
    });
    App.attract = null;
    App.input.handler = proxy;
    G.UI.hide(); G.UI.showHud(true);
    if (App.lookToggle) App.toggleLook();
    G.UI.setHudPlayer(mp ? { name: mp.name, ball: mp.ball, idx: r.mp.turn, count: r.mp.players.length } : null);
    if (mp) G.UI.toast(mp.name + '\'s turn', 'info', 1300);
    App.state = 'play';
    try { if (G.Music) G.Music.setTheme(theme && typeof theme.index === 'number' ? theme.index : 0); } catch (e) { /* */ }
    // coach card (tutorial) / practice bar
    if (r.kind === 'tutorial') G.UI.setCoach({ kind: 'tutorial', type: r.tutorial, hint: App.session.hasBotHint() });
    else if (r.kind === 'practice') G.UI.setCoach({ kind: 'practice', hint: App.session.hasBotHint(), name: hole.name });
    else G.UI.setCoach(null);
    if (r.kind !== 'tutorial') introduce(r, i, hole);
    else G.Progress.markGimmicksSeen((hole.gm || []).map((g) => g && g.t).filter(Boolean));
  }
  // "New gimmick" intro cards during the pre-shot pan + token hint
  function introduce(r, i, hole) {
    try {
      if (r.kind === 'custom') { // hand-made holes: explain the gimmicks, but never touch the "gimmicks met" record
        if (r.custom.mode !== 'shared') return;
        const info0 = (G.Manifest && G.Manifest.GIMMICK_INFO) || {}, ts = [];
        (hole.gm || []).forEach((g) => { if (g && g.t && ts.indexOf(g.t) < 0 && info0[g.t]) ts.push(g.t); });
        ts.slice(0, 2).forEach((t, k) => setTimeout(() => { if (App.session && App.session.hole === hole) G.UI.introCard(t, info0[t]); }, 350 + k * 2600));
        return;
      }
      const mpr = r.kind === 'multi';
      if (mpr && r.mp.turn > 0) return; // pass-and-play: the cards show once per hole, for the first player
      const M = G.Manifest, info = (M && M.GIMMICK_INFO) || {};
      const types = [];
      (hole.gm || []).forEach((g) => { if (g && g.t && types.indexOf(g.t) < 0) types.push(g.t); });
      const show = [];
      const cg = (r.kind === 'course' || mpr) && r.def && r.def.gimmick;
      if (i === 0 && cg) show.push(cg); // hole 1 of a course always introduces the course's gimmick
      // multiplayer never touches the lifetime "gimmicks met" record: it tracks what it already showed in the run itself
      const seen = mpr ? (t) => G.Progress.gimmickSeen(t) || r.mp.seenG.has(t) : (t) => G.Progress.gimmickSeen(t);
      types.forEach((t) => { if (show.indexOf(t) < 0 && !seen(t) && info[t]) show.push(t); });
      // the course's own gimmick first, at most 2 cards
      show.slice(0, 2).forEach((t, k) => setTimeout(() => {
        if (App.session && App.session.hole === hole) G.UI.introCard(t, info[t] || {});
      }, 350 + k * 2600));
      if (mpr) types.forEach((t) => r.mp.seenG.add(t)); else G.Progress.markGimmicksSeen(types);
      if (types.indexOf('tokens') >= 0) setTimeout(() => { if (App.session && App.session.hole === hole) G.UI.toast('★ Collect all stars to open the cup', 'info', 2600); }, show.length ? 600 + show.length * 2600 : 600);
    } catch (e) { console.warn('[intro]', e); }
  }
  function onHoled(res) {
    const r = App.run, i = r.idx;
    if (r.kind === 'multi') { G.Multi.holed(res); return; }
    let newBest = false;
    const score = res.score !== undefined ? res.score : res.strokes;
    if (r.kind === 'custom') { G.UI.showHud(false); G.UI.show('customDone', { res, score, name: App.session.hole.name, time: res.time }); return; }
    if (r.kind === 'practice' || r.kind === 'tutorial') {
      G.UI.showHud(false);
      let first = false;
      if (r.kind === 'practice') G.Store.bumpStat('practice');
      else first = G.Progress.markTutorialDone(r.tutorial);
      setTimeout(() => checkUnlocks(r), 500);
      G.UI.show(r.kind === 'practice' ? 'practiceDone' : 'tutorialDone', { res, score, first, name: App.session.hole.name, time: res.time });
      return;
    }
    r.scores[i] = { strokes: res.strokes, bonus: res.bonus || 0, score, par: res.par, swish: !!res.swish, time: res.time || 0 };
    (r.times = r.times || [])[i] = res.time || 0;
    if (r.kind === 'course' && !r.remix) { const rec = G.Progress.recordHole(r.courseId, (r.offset || 0) + i, score, res.par); newBest = rec.newBest && rec.prevStars > 0; }
    if (r.kind !== 'dev' && G.Achievements) {
      const ev = [];
      if (score < res.par && (res.time || 0) > 0 && res.time < 8) ev.push('lightning_hole');
      if (score < res.par && res.hazards > 0) ev.push('comeback');
      if (ev.length) G.Achievements.grant(ev);
    }
    if (r.kind === 'endless') { const b = Math.max(0, res.par - score); r.cleared++; r.underPar += b; r.score += 1 + b; G.Store.maxStat('endless', r.cleared); G.Store.maxStat('endlessScore', r.score); }
    holeStats(r, { strokes: res.strokes, score, par: res.par, swish: !!res.swish, spin: !!res.spin });
    G.UI.showHud(false);
    setTimeout(() => checkUnlocks(r), 700);
    G.UI.show('holeDone', { res, last: i >= r.n - 1, newBest, name: App.session.hole.name });
  }
  function onFailed(res) {
    const r = App.run;
    if (r.kind === 'multi') { G.Multi.failed(res, App.session); return; }
    if (r.kind === 'practice' || r.kind === 'tutorial' || r.kind === 'custom') { // e.g. swamped by the flood: just start the hole again
      setTimeout(() => { if (App.session && App.run === r) { App.session.restart(); G.UI.toast('Try again!', 'info', 1200); } }, 300);
      return;
    }
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
    r.scores[i] = { strokes: x, bonus: 0, score: x, par: res.par, failed: true, reason: res.reason || null, time: res.time || 0 };
    (r.times = r.times || [])[i] = res.time || 0;
    holeStats(r, { strokes: res.strokes || 0, score: x, par: res.par, failed: true });
    G.UI.show('holeFail', { res, score: x, last: i >= r.n - 1, name: sess && sess.hole ? sess.hole.name : '' });
  }
  function finishRun() {
    const r = App.run;
    const complete = r.scores.length >= r.n && r.scores.every((s) => !!s); // picked-up holes still finish the round
    const args = { after: null };
    const sc = (s) => (s.score !== undefined ? s.score : s.strokes);
    const roundTime = (r.times || []).reduce((a, x) => a + (x || 0), 0);
    args.time = roundTime;
    if (complete && (r.kind === 'course' || r.kind === 'daily' || r.kind === 'random')) {
      try { roundAchievements(r, args, roundTime); } catch (e) { console.warn('[ach]', e); }
    }
    if (r.kind === 'course' && r.remix) {
      if (complete && r.startIdx === 0) { args.newBest = G.Progress.recordRemix(r.courseId, r.round, r.totalStrokes()); G.Store.bumpStat('remixRounds'); }
      args.round = r.round; args.remix = true;
      args.title = complete ? 'Remix complete!' : 'Round finished';
      args.after = 'course';
    } else if (r.kind === 'course') {
      const after = G.Progress.courseInfo(r.courseId);
      args.bonus = Math.max(0, after.bonus - (r.bonusBefore || 0));
      if (complete && r.startIdx === 0) {
        args.newBest = G.Progress.recordRound(r.courseId, r.round, r.totalStrokes());
        if (r.round === 'all' && r.n > 9) { // an 18-hole round also counts as a front-9 and a back-9 round
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
      if (complete) {
        args.dailyBest = G.Progress.recordDaily(r.date, r.totalStrokes(), r.scores.reduce((a, s) => a + s.par, 0), r.scores.map(sc), App.resultCodes(r.scores), roundTime);
        args.share = App.shareText(r.date, r.totalStrokes(), r.scores.reduce((a, s) => a + s.par, 0), App.resultCodes(r.scores));
        args.streak = G.Progress.dailyStreak();
      }
      args.title = 'Daily complete!'; args.after = 'daily';
    } else if (r.kind === 'random') {
      if (complete) G.Store.bumpStat('randoms');
      args.code = G.RNG.seedToCode(r.seed); args.title = 'Course complete!'; args.after = 'random';
    } else args.after = 'title';
    if (r.kind !== 'dev') checkUnlocks(r);
    args.unlocks = (r.unlocked || []).slice();
    if (G.Haptics && complete) G.Haptics.buzz('hole');
    G.UI.showHud(false);
    G.UI.show('courseDone', args);
  }

  // ---------- round-end achievements, fast rounds, best times ----------
  function roundAchievements(r, args, time) {
    const sc = (s) => (s.score !== undefined ? s.score : s.strokes);
    const ts = r.totalStrokes(), tp = r.scores.reduce((a, s) => a + s.par, 0), under = ts < tp;
    const ev = [];
    if (under) ev.push('under_par_round');
    const okHole = (s) => s && !s.failed && sc(s) <= s.par;
    for (let a = 0; a + 9 <= r.scores.length; a += 9) {
      const nine = r.scores.slice(a, a + 9);
      if (nine.every(okHole)) ev.push('clean_nine');
      const nt = nine.reduce((x, s) => x + (s.time || 0), 0), ns = nine.reduce((x, s) => x + sc(s), 0), np = nine.reduce((x, s) => x + s.par, 0);
      if (ns < np && nt > 0 && nt < 180) ev.push('speed_nine');
    }
    if (r.scores.length >= 18) {
      if (r.scores.every(okHole)) ev.push('perfect_round');
      if (!(r.mulligans && r.mulligans.used)) ev.push('no_mulligan_round');
      if (under && time > 0 && time < 480) ev.push('speed_18');
    }
    if (under && (r.diff === 'pro' || r.diff === 'insane')) ev.push('pro_round');
    if (r.diff === 'insane') ev.push('insane_round');
    if (r.kind === 'course' && r.remix && under) ev.push('remix_under_par');
    if (G.Achievements) G.Achievements.grant(ev);
    if (under && time > 0 && time < 20 * tp) { G.Store.bumpStat('fastRounds'); args.fast = true; }
    if (under && r.kind === 'course' && r.startIdx === 0 && time > 0) args.newBestTime = G.Progress.recordTime(r.courseId, (r.remix ? 'rx-' : '') + r.round, time);
  }
  // ---------- daily share card ----------
  App.resultCodes = function (scores) {
    return scores.map((s) => {
      if (!s) return 'X';
      if (s.failed) return 'X';
      const v = s.score !== undefined ? s.score : s.strokes, d = v - s.par;
      const c = s.strokes === 1 || v <= 1 || d <= -2 ? 'A' : d === -1 ? 'B' : d === 0 ? 'P' : d === 1 ? 'O' : 'D';
      return c + (s.swish ? '*' : '');
    });
  };
  const EMOJI = { A: '🟪', B: '🟩', P: '⬜', O: '🟨', D: '🟥', X: '⬛' };
  App.SHARE_URL = 'https://jeffrichards314.github.io/stick-golf/';
  App.shareText = function (date, total, par, codes) {
    const d = total - par, rel = d === 0 ? 'E' : d > 0 ? '+' + d : '−' + Math.abs(d);
    const row = (codes || []).map((c) => (EMOJI[c.charAt(0)] || '⬜') + (c.indexOf('*') > 0 ? '✨' : '')).join('');
    return 'Stick Golf Daily ' + date + ' · ' + total + ' (' + rel + ') ⛳\n' + row + '\n' + App.SHARE_URL;
  };

  // round: 'all' | 'front' | 'back' (default: the nine containing holeIdx). holeIdx is 0-based over the full course.
  App.startCourse = function (id, holeIdx, round) { startCourseRun(id, holeIdx, round, false); };
  // Remix: the course's holes mirrored (tee on the right), played as a normal round with separate bests
  App.startRemix = function (id, round) {
    if (!G.Generator || !G.Generator.mirrorHole) { G.UI.toast('Remix is not available yet', 'warn'); return; }
    startCourseRun(id, 0, round || 'all', true);
  };
  // Loads a course and cuts out the round to play (optionally mirrored): cb(err, {holes, round, a, b, n}); err = {stage:'load'|'remix', err?}
  function loadRound(id, holeIdx, round, remix, cb) {
    G.Progress.loadCourse(id, (holes, err) => {
      if (!holes || !holes.length) { cb({ stage: 'load', err }); return; }
      const n = holes.length; // tolerate stale 9-hole data
      if (round !== 'all' && round !== 'front' && round !== 'back') round = holeIdx >= 9 && n > 9 ? 'back' : 'front';
      if (n <= 9) round = 'front';
      const a = round === 'back' ? 9 : 0, b = round === 'front' ? Math.min(9, n) : n;
      let list = holes.slice(a, b);
      if (remix) {
        try { list = list.map((h) => { const m = G.Generator.mirrorHole(h); if (m && !/remix/i.test(m.name || '')) m.name = (h.name || 'Hole') + ' (Remix)'; return m; }); }
        catch (e) { console.error('[remix]', e); cb({ stage: 'remix' }); return; }
      }
      cb(null, { holes: list, round, a, b, n });
    });
  }
  function startCourseRun(id, holeIdx, round, remix) {
    holeIdx = Math.max(0, holeIdx | 0);
    const def = G.Progress.def(id);
    G.UI.show('loading', { title: 'Loading course…', sub: def ? def.name : id });
    loadRound(id, holeIdx, round, remix, (fail, L) => {
      if (fail && fail.stage === 'load') { G.UI.toast('Could not load course (' + (fail.err || '?') + ')', 'warn'); G.UI.show(def ? 'course' : 'courses', { id }); return; }
      if (fail) { G.UI.toast('Remix failed', 'warn'); G.UI.show('course', { id }); return; }
      const r = G.Run.fromHoles('course', def, L.holes, G.Modes.current());
      r.round = L.round; r.offset = L.a; r.courseHoles = L.n; r.remix = !!remix; r.times = [];
      const rel = Math.max(0, Math.min(L.b - L.a - 1, holeIdx - L.a));
      // a round is played in order from its first hole; a hole index is only honoured for automation (?course=&hole=)
      r.courseId = id; r.idx = !remix && App.allowHoleStart && holeIdx >= L.a && holeIdx < L.b ? rel : 0; r.startIdx = r.idx;
      r.bonusBefore = G.Progress.courseInfo(id).bonus;
      App.run = r; App.session = null;
      playCurrent();
    });
  }
  // Practice: any single hole of an unlocked course; unlimited strokes/restarts, nothing recorded but the practice count
  App.startPractice = function (courseId, holeIdx) {
    const def = G.Progress.def(courseId);
    holeIdx = Math.max(0, holeIdx | 0);
    G.UI.show('loading', { title: 'Loading hole…', sub: def ? def.name : courseId });
    G.Progress.loadCourse(courseId, (holes, err) => {
      if (!holes || !holes.length) { G.UI.toast('Could not load course (' + (err || '?') + ')', 'warn'); G.UI.show('practice'); return; }
      holeIdx = Math.min(holes.length - 1, holeIdx);
      const r = G.Run.fromHoles('practice', def, [holes[holeIdx]], G.Modes.current());
      r.courseId = courseId; r.offset = holeIdx; r.courseHoles = holes.length; r.mulligans = { left: Infinity };
      App.run = r; App.session = null;
      playCurrent();
    });
  };
  // Tutorial: the gimmick's teaching hole (GOLF.TUTORIALS[type]); opts.ret = {screen, args} to go back to, opts.then = course id to offer next
  App.startTutorial = function (type, opts) {
    const hole = G.Progress.tutorialHole(type);
    if (!hole) { G.UI.toast(G.Progress.hasTutorials() ? 'No tutorial for this gimmick yet' : 'Tutorials coming soon', 'info'); return false; }
    const M = G.Manifest, cid = M && M.introducedBy ? M.introducedBy[type] : null;
    const def = (cid && G.Progress.def(cid)) || null;
    const r = G.Run.fromHoles('tutorial', def, [hole], G.Modes.current());
    r.tutorial = type; r.opts = opts || {}; r.mulligans = { left: Infinity };
    App.run = r; App.session = null;
    playCurrent();
    return true;
  };
  // Custom holes (editor test play / shared codes / My Holes): opts = { mode:'test'|'shared', verified, local, warn, ret, retArgs }
  App.startCustom = function (hole, opts) {
    opts = opts || {};
    const r = G.Run.fromHoles('custom', null, [hole], G.Modes.current());
    r.custom = { mode: opts.mode === 'test' ? 'test' : 'shared', verified: !!opts.verified, local: !!opts.local, ret: opts.ret || null, retArgs: opts.retArgs || null };
    r.mulligans = { left: Infinity };
    G.UI.hide();
    App.run = r; App.session = null;
    if (G.Editor && G.Editor.active && r.custom.mode !== 'test') { G.Editor.commit(); G.Editor.save(); G.Editor.active = false; document.getElementById('editor').classList.add('hidden'); }
    playCurrent();
    if (opts.warn && opts.warn.length) G.UI.toast('Note: ' + opts.warn.join('; '), 'info', 3200);
    return true;
  };
  // back to a menu screen (used when leaving the editor)
  App.restoreMenu = function (screen) { App.session = null; App.run = null; App.waiting = false; G.UI.setCoach(null); G.UI.showHud(false); App.cancelAttract(); startAttract(); G.UI.show(screen || 'title'); };
  App.cancelAttract = function () { attractTry++; App.attract = null; };
  // Local pass-and-play: App.startMultiplayer({players:[{name, ball}], courseId, round, remix, seed}) -> started?
  // courseId => a baked course (round 'all'|'front'|'back', remix); no courseId => a Random course (seed number or code, default random).
  App.startMultiplayer = function (o) { return G.Multi ? G.Multi.start(o) : false; };
  App.showMe = function (on) { const s = App.session; if (!s || !s.showMe) return false; const v = s.showMe(on); if (v) App.cam.skipIntro(); return v; };
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
    // only gimmicks whose tutorial is complete (none -> plain golf holes)
    settings = Object.assign({}, settings);
    settings.gimmicks = (settings.gimmicks || []).filter((g) => G.Progress.gimmickUnlocked(g));
    App.run = G.Run.endless(settings, G.Modes.current());
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
    if (r.kind === 'multi') { G.Multi.nextHole(); return; }
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
    const k = App.run && App.run.kind;
    if (!App.session || !(k === 'dev' || k === 'practice' || k === 'tutorial' || k === 'custom')) return; // rounds play straight through
    App.session.restart(); App.session.paused = false; G.Audio.sfx('uiback');
    if (G.UI.current) { G.UI.hide(); G.UI.showHud(true); }
  };
  App.replayRun = function () {
    const r = App.run;
    if (r.kind === 'course' && r.remix) App.startRemix(r.courseId, r.round);
    else if (r.kind === 'course') App.startCourse(r.courseId, r.offset || 0, r.round);
    else if (r.kind === 'practice') App.startPractice(r.courseId, r.offset || 0);
    else if (r.kind === 'tutorial') App.startTutorial(r.tutorial, r.opts);
    else if (r.kind === 'daily') App.startDaily();
    else if (r.kind === 'random') App.startRandom(r.seed);
    else if (r.kind === 'dev') App.startDev();
    else if (r.kind === 'custom') App.startCustom(JSON.parse(JSON.stringify(r.holes[0])), r.custom);
    else if (r.kind === 'multi') G.Multi.start(r.mp.setup);
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
  App.quitToMenu = function (screen, sargs) {
    const r = App.run;
    G.UI.clearIntro(); G.UI.setCoach(null); G.UI.setHudPlayer(null);
    App.session = null; App.waiting = false; App.run = null;
    if (App.lookToggle) { App.lookToggle = false; App.input.lookToggle = false; }
    G.UI.showHud(false);
    if (r && r.kind === 'custom' && r.custom.mode === 'test' && G.Editor && G.Editor.S.hole && !screen) { G.Editor.resume(); return; }
    startAttract();
    if (r && r.kind === 'custom' && !screen) { const c = r.custom; G.UI.show(c.ret || 'editorHub', c.retArgs); return; }
    if (screen === 'course' && r && r.courseId) G.UI.show('course', { id: r.courseId, remix: !!r.remix });
    else if (screen) G.UI.show(screen, sargs);
    else if (r && r.kind === 'practice') G.UI.show('practiceCourse', { id: r.courseId });
    else if (r && r.kind === 'tutorial') { const o = r.opts || {}; if (o.ret) G.UI.show(o.ret.screen, o.ret.args); else G.UI.show('tutorials'); }
    else if (r && r.kind === 'course' && r.courseId) G.UI.show('course', { id: r.courseId });
    else G.UI.show('title');
  };
  // Snapshot for automation/tests
  App.status = function () {
    const s = App.session, r = App.run;
    const o = { state: App.state, screen: G.UI.current || null, waiting: !!App.waiting };
    if (r) Object.assign(o, { kind: r.kind, courseId: r.courseId || null, round: r.round || null, offset: r.offset || 0, hole: r.idx, courseHole: (r.offset || 0) + r.idx, holes: r.n, total: r.totalStrokes(), scores: r.scores.slice() });
    if (r && r.mp && G.Multi) o.multi = G.Multi.status(r);
    if (s) {
      Object.assign(o, {
        holeId: s.hole.id, par: s.hole.par, strokes: s.S.strokes, bonus: s.S.bonus || 0, score: s.score(),
        rest: !!s.S.rest, holed: !!s.S.holed, failed: s.S.failed || (s.state === 'failed' ? s.failReason || 'limit' : null), swish: !!s.S.swish,
        putt: s.isPutt(), spin: s.spin, limit: s.limit, x: s.S.x, y: s.S.y, playState: s.state, tokens: s.tokenInfo(),
        clock: s.clock, lastShot: s.lastShot, ghost: !!s.ghostPts, showMe: !!s.botGhost, remix: !!(r && r.remix), tutorial: (r && r.tutorial) || null,
        result: s.result ? { strokes: s.result.strokes, score: s.result.score, bonus: s.result.bonus, holed: s.result.holed, reason: s.result.reason || null } : null,
      });
    }
    return o;
  };
  App._internal = { playCurrent, waitHole, loadRound };
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
          if (r.ready(r.idx)) startReady();
          else G.UI.loaderUpdate(r.jobStatus(r.idx), 'hole ' + (r.idx + 1));
        }
      }
      if (G.Editor && G.Editor.active && !G.Editor.suspended && !App.session) { G.Editor.frame(App.time, dt); return; }
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
    App.applyAudio(); App.applyA11y();
    G.Progress.newUnlocks(); // prime "seen" set
    const migrated = G.Progress.migrationNotice();
    const bm = document.getElementById('boot-msg'); if (bm) bm.remove();
    if (G._missing && G._missing.length) console.warn('[golf] missing scripts:', G._missing.join(', '));
    // routing
    if (qs.get('dev')) { if (!G.Store.getSettings().difficulty) G.Store.saveSettings({ difficulty: 'standard' }); App.startDev(); }
    else if (qs.get('course')) { startAttract(); App.allowHoleStart = true; App.startCourse(qs.get('course'), +(qs.get('hole') || 1) - 1, qs.get('round') || undefined); }
    else {
      startAttract();
      if (!G.Store.getSettings().difficulty) G.UI.show('difficulty', { first: true, ret: 'title' });
      else if (migrated) G.UI.show('notice', { kind: 'reorder' });
      else G.UI.show('title');
    }
    if (G.MyHoles && !qs.get('dev') && !qs.get('course')) G.MyHoles.checkHash(); // #hole=<code> share links play straight away
    requestAnimationFrame(frame);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
