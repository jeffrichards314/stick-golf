/* A single hole session: fixed-timestep physics, aiming, preview, events -> fx/audio, fog, mulligans. */
(function () {
  'use strict';
  const G = window.GOLF = window.GOLF || {};
  const TAU = Math.PI * 2;
  const MAX_DRAG = 160, DEAD = 14;
  const HZ_NAMES = {
    water: 'Water hazard', lava: 'Lava!', oob: 'Out of bounds', spikes: 'Spiked!', timeout: 'Lost ball',
    laser: 'Zapped!', void: 'Swallowed by the void!', quicksand: 'Sank in quicksand', decoy: 'Decoy cup!',
  };
  const SPIN_STEPS = [-1, -0.5, 0, 0.5, 1];
  const FAIL_TEXT = { flood: 'Swamped by the rising tide!', limit: 'Stroke limit!' };
  const popcount = (v) => { v = v >>> 0; let n = 0; while (v) { n += v & 1; v >>>= 1; } return n; };
  const PUTT_ZONE = 0.4; // precision putting: the normal drag range covers 0..40% power, dragging further reaches 100%
  const settings = () => (G.Store && G.Store.getSettings ? G.Store.getSettings() : {});
  const reducedFx = () => !!(G.Store && G.Store.reducedFx && G.Store.reducedFx());

  // Replay a list of shots [[a,p,s?]|{a,p,s}] from the tee in a CLONED world; returns sampled path [x,y,...] (every 2 steps).
  function simulatePath(hole, shots, maxSteps) {
    const Ph = G.Physics;
    const W = Ph.createWorld(hole, { gspeed: 1, windMul: 1, hazardPenalty: 1, rec: false });
    const S = Ph.initState(W); S.ev = null;
    const list = (shots || []).map((x) => (Array.isArray(x) ? { a: x[0], p: x[1], s: x[2] || 0 } : x));
    const pts = [S.x, S.y];
    let si = 0, n = 0, idle = 0;
    maxSteps = maxSteps || 30000;
    for (let i = 0; i < maxSteps; i++) {
      if (S.rest && !S.holed && si < list.length) { const q = list[si++]; Ph.shoot(W, S, q.a, q.p, q.s || 0); }
      const r = Ph.step(W, S);
      if (S.ev) S.ev.length = 0;
      if (++n % 2 === 0) pts.push(S.x, S.y);
      if (r === 1 || r === 4) { pts.push(S.x, S.y); break; }
      if (S.rest && si >= list.length) { if (++idle > 30) break; } else idle = 0;
    }
    return pts;
  }

  function create(o) {
    const Ph = G.Physics, C = Ph.C;
    const hole = o.hole, diff = G.Modes.get(o.diff);
    const W = Ph.createWorld(hole, G.Modes.physOpts(o.diff));
    const R = o.R, cam = o.cam, A = G.Audio;
    const limit = o.demo ? Infinity : (o.strokeLimit !== undefined ? o.strokeLimit : G.Modes.strokeLimit(o.diff, hole.par));
    const fogIdx = []; let tokIdx = -1;
    (hole.gm || []).forEach((g, i) => { if (g.t === 'fog') fogIdx.push(i); if (g.t === 'tokens' && tokIdx < 0 && g.pts) tokIdx = i; });

    const P = {
      hole, W, S: Ph.initState(W), diff, limit, demo: !!o.demo, kind: o.kind || 'course',
      fog: new Array((hole.gm || []).length).fill(0),
      snaps: [], spin: 0, acc: 0, time: 0, state: 'play', stateT: 0, paused: false,
      aim: null, drag: null, kAim: null, preview: null, prevKey: null, prevT: 0,
      shakeMag: 0, shake: { x: 0, y: 0 }, mull: o.mulligans || { left: diff.mulligans },
      lastHz: null, queue: [], trailT: 0, result: null, onEvent: o.onEvent || null, failReason: null,
      // v3: previous shot + ghost replay, hole clock, per-hole flags
      lastShot: null, rec: null, ghostPts: null, ghostT0: -1, botGhost: null, clock: 0, hazards: 0, lastSpin: 0,
    };
    P.kAimDefault = () => (P.lastShot ? { angle: P.lastShot.angle, power: P.lastShot.power } : { angle: hole.cup[0] >= P.S.x ? -Math.PI / 4 : -3 * Math.PI / 4, power: 0.55 });

    cam.setHole(hole, !o.demo && o.intro !== false);
    if (R) { R.setHole(hole, o.theme, o.cosmetics || {}); R.trailClear(); }

    P.canShoot = () => P.state === 'play' && P.S.rest && !P.S.holed && !P.S.failed && !cam.inIntro() && !P.paused && P.S.strokes < limit;
    // Ball resting on the putting green -> putt (no spin)
    P.isPutt = () => !!(Ph.isPutt && P.S.rest && !P.S.holed && Ph.isPutt(P.S));
    P.effSpin = () => (P.isPutt() ? 0 : P.spin);
    P.score = () => P.S.strokes - (P.S.bonus || 0);

    function addShake(m) { if (settings().shake !== false && !reducedFx()) P.shakeMag = Math.max(P.shakeMag, m); }
    const buzz = (k) => { if (!P.demo && G.Haptics) G.Haptics.buzz(k); };
    function fx(kind, x, y, op) { if (R) { try { R.spawn(kind, x, y, op || {}); } catch (e) { /* renderer fx optional */ } } }

    P.shoot = function (angle, power, spin) {
      if (!(P.S.rest && !P.S.holed) || P.state !== 'play') return false;
      if (P.S.strokes >= limit) return false;
      cam.skipIntro();
      P.snaps.push({ S: Ph.cloneState(P.S), fog: P.fog.slice() });
      if (P.snaps.length > 30) P.snaps.shift();
      const sp = P.isPutt() ? 0 : (spin === undefined ? P.spin : spin);
      const pw = Math.max(0.02, Math.min(1, power));
      Ph.shoot(W, P.S, angle, pw, sp);
      P.lastShot = { angle, power: pw, spin: sp };
      P.lastSpin = sp;
      P.rec = { pts: [P.S.x, P.S.y], n: 0 };
      P.ghostT0 = -1;
      if (P.botGhost && !P.botGhost.keep) P.botGhost = null;
      P.aim = null; P.drag = null; P.preview = null; P.prevKey = null;
      if (P.kAim) P.kAim.active = false;
      return true;
    };

    // ---- input handlers ----
    P.tap = function () { if (cam.inIntro()) { cam.skipIntro(); return true; } return false; };
    P.aimStart = function (sx, sy, ptype) {
      if (P.demo || P.paused || P.state !== 'play') return false;
      if (!P.canShoot()) return false; // pan instead
      P.drag = { sx, sy, cx: sx, cy: sy, pt: ptype || 'mouse' };
      return true;
    };
    P.precise = () => !!(settings().precisionPutt !== false && P.isPutt());
    // drag fraction (1 = full normal drag) -> power
    P.powerFromFrac = function (f) {
      if (!P.precise()) return Math.min(1, f);
      return f <= 1 ? PUTT_ZONE * f : Math.min(1, PUTT_ZONE + (1 - PUTT_ZONE) * (f - 1) / 0.75);
    };
    P.aimMove = function (sx, sy, ptype) {
      if (!P.drag) return;
      P.drag.cx = sx; P.drag.cy = sy;
      const dx = P.drag.sx - sx, dy = P.drag.sy - sy, L = Math.hypot(dx, dy);
      if (L < DEAD) { P.aim = null; return; }
      const st = settings(), touch = (ptype || P.drag.pt) === 'touch' || (ptype || P.drag.pt) === 'pen';
      const sens = Math.max(0.3, Math.min(3, +(touch ? st.sensTouch : st.sensMouse) || 1));
      P.aim = { angle: Math.atan2(dy, dx), power: P.powerFromFrac(Math.max(0, (L - DEAD * 0.5) * sens / MAX_DRAG)) };
    };
    P.aimEnd = function (sx, sy, cancel) {
      if (!P.drag) return;
      if (!cancel) P.aimMove(sx, sy);
      const a = P.aim; P.drag = null;
      if (!cancel && a && P.canShoot()) P.shoot(a.angle, a.power);
      P.aim = null;
    };
    P.pan = function (dx, dy) { cam.pan(dx, dy); };
    P.zoom = function (f) { cam.zoomBy(f); };
    P.lookStart = function () { cam.look.on = true; };
    P.lookEnd = function () { cam.look.on = false; };
    // spin selector: 5 steps -1 (backspin) .. +1 (topspin); persists between shots, ignored on putts
    P.setSpin = function (v) {
      let best = 0; SPIN_STEPS.forEach((x) => { if (Math.abs(x - v) < Math.abs(best - v)) best = x; });
      if (best !== P.spin) { P.spin = best; P.preview = null; P.prevKey = null; }
    };
    P.adjSpin = function (d) {
      if (P.demo) return false;
      if (P.isPutt()) { if (G.UI) G.UI.toast('Putt — no spin on the green', 'info', 900); return false; }
      const i = SPIN_STEPS.indexOf(P.spin), j = Math.max(0, Math.min(SPIN_STEPS.length - 1, (i < 0 ? 2 : i) + (d > 0 ? 1 : -1)));
      if (SPIN_STEPS[j] !== P.spin) { P.setSpin(SPIN_STEPS[j]); A.sfx('tick'); }
      return true;
    };
    P.toggleSpin = function (dir) { P.adjSpin(dir); };
    P.isAiming = () => !!(P.drag || (P.kAim && P.kAim.active));
    P.isAimingNow = () => !P.demo && !P.paused && P.isAiming() && P.canShoot();
    // mouse wheel: adjusts spin while aiming, otherwise zoom (return true = consumed)
    P.wheel = function (dy) {
      if (P.demo || P.paused || !P.isAiming() || !P.canShoot()) return false;
      P.adjSpin(dy < 0 ? 1 : -1); return true;
    };

    P.keyDown = function (code, e) {
      if (P.demo || P.paused) return false;
      const aimKeys = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'KeyA', 'KeyD', 'KeyW', 'KeyS'];
      if (aimKeys.indexOf(code) >= 0) {
        if (cam.inIntro()) cam.skipIntro();
        if (!P.kAim) P.kAim = P.kAimDefault();
        if (P.kAim.active) { // discrete nudge per press (holding also ramps continuously)
          const st = e && e.shiftKey ? 0.004 : 0.012;
          if (code === 'ArrowLeft' || code === 'KeyA') P.kAim.angle -= st * 1.5;
          if (code === 'ArrowRight' || code === 'KeyD') P.kAim.angle += st * 1.5;
          if (code === 'ArrowUp' || code === 'KeyW') P.kAim.power = Math.min(1, P.kAim.power + st);
          if (code === 'ArrowDown' || code === 'KeyS') P.kAim.power = Math.max(0.02, P.kAim.power - st);
        }
        P.kAim.active = true; return true;
      }
      if (code === 'Space' || code === 'Enter') {
        if (cam.inIntro()) { cam.skipIntro(); return true; }
        if (P.canShoot()) {
          if (!P.kAim || !P.kAim.active) { if (!P.kAim) P.kAim = P.kAimDefault(); P.kAim.active = true; }
          else P.shoot(P.kAim.angle, P.kAim.power);
        }
        return true;
      }
      if (code === 'KeyB') { P.adjSpin(-1); return true; }
      if (code === 'KeyT') { P.adjSpin(1); return true; }
      return false;
    };
    P.keyboardAim = function (dt, keys) {
      if (!P.kAim || !P.kAim.active || !P.canShoot()) return;
      const fine = keys.ShiftLeft || keys.ShiftRight ? 0.25 : 1;
      if (keys.ArrowLeft || keys.KeyA) P.kAim.angle -= 1.3 * dt * fine;
      if (keys.ArrowRight || keys.KeyD) P.kAim.angle += 1.3 * dt * fine;
      if (keys.ArrowUp || keys.KeyW) P.kAim.power = Math.min(1, P.kAim.power + 0.55 * dt * fine);
      if (keys.ArrowDown || keys.KeyS) P.kAim.power = Math.max(0.02, P.kAim.power - 0.55 * dt * fine);
    };

    // ---- mulligan / restart ----
    P.canMulligan = () => !P.demo && P.snaps.length > 0 && P.mull.left > 0 && (P.state === 'play' || P.state === 'failed') && !P.S.holed;
    P.mulligan = function () {
      if (!P.canMulligan()) return false;
      // a flood failure happens at shot time from a spot that is already underwater: step back one more shot
      if (P.failReason === 'flood' && P.snaps.length >= 2) P.snaps.pop();
      const sn = P.snaps.pop();
      P.S = Ph.cloneState(sn.S); P.fog = sn.fog.slice();
      if (P.mull.left !== Infinity) P.mull.left--;
      P.mull.used = (P.mull.used || 0) + 1;
      P.state = 'play'; P.stateT = 0; P.acc = 0; P.aim = null; P.drag = null; P.failReason = null;
      if (R) R.trailClear();
      A.sfx('teleport');
      return true;
    };
    // queue shots [{a,p,s?}] to fire automatically (first one immediately if at rest)
    P.queueShots = function (shots) {
      P.queue = (shots || []).slice();
      if (P.queue.length && P.S.rest && !P.S.holed && P.state === 'play') { const q = P.queue.shift(); P.shoot(q.a, q.p, q.s || 0); }
    };
    P.restart = function () {
      P.queue = [];
      P.S = Ph.initState(W); P.fog.fill(0); P.snaps = []; P.state = 'play'; P.stateT = 0; P.acc = 0;
      P.aim = null; P.drag = null; P.kAim = null; P.result = null; P.failReason = null; P.reported = false;
      P.rec = null; P.clock = 0; P.hazards = 0; P.lastSpin = 0; P.ghostT0 = -1;
      if (P.botGhost && !P.botGhost.keep) P.botGhost = null;
      if (R) R.trailClear();
      cam.setHole(hole, false);
    };

    // ---- events -> fx ----
    function handleEvents() {
      const ev = P.S.ev; if (!ev || !ev.length) return;
      const cos = o.cosmetics || {};
      for (let i = 0; i < ev.length; i++) {
        const e = ev[i];
        switch (e.e) {
          case 'shot': buzz('shot'); A.sfx('swing', { p: e.p }); if (R) R.trailClear(); fx('dust', e.x, e.y + 5, { m: e.p }); break;
          case 'bounce': {
            const m = Math.min(1, e.m / 900);
            fx('bounce', e.x, e.y, { surf: e.s, m: e.m });
            if (e.s === 's') fx('sand', e.x, e.y, { m: e.m });
            A.sfx('bounce', { s: e.s, m });
            if (e.m > 450) buzz('bounce');
            if (e.m > 700) addShake(2 + m * 3);
            break;
          }
          case 'pad': fx('bounce', e.x, e.y, { surf: 'b', m: e.m }); A.sfx('pad'); addShake(3); break;
          case 'bumper': fx('spark', e.x, e.y, { m: 1 }); A.sfx('bumper'); addShake(4); break;
          case 'break': fx('break', e.x, e.y, { g: e.g }); A.sfx('break'); addShake(9); break;
          case 'stick': fx('stick', e.x, e.y); A.sfx('stick'); break;
          case 'crumble': fx('dust', e.x, e.y, { m: 1 }); A.sfx('crumble'); addShake(4); break;
          case 'switch': fx('spark', e.x, e.y, { m: 0.6 }); A.sfx('switch'); addShake(2); break;
          case 'teleport': fx('teleport', e.x, e.y); fx('teleport', e.x2, e.y2); A.sfx('teleport'); if (R) R.trailClear(); break;
          case 'load': A.sfx('load'); break;
          case 'fire': fx('fire', e.x, e.y, { a: e.a }); A.sfx('cannon'); addShake(11); break;
          case 'hazard': {
            const k = e.k;
            if (k === 'water') { fx('splash', e.x, e.y); A.sfx('water'); }
            else if (k === 'lava') { fx('lava', e.x, e.y); A.sfx('lava'); }
            else if (k === 'laser') { fx('spark', e.x, e.y, { m: 1.2 }); A.sfx('zap'); }
            else if (k === 'void') { fx('teleport', e.x, e.y); A.sfx('void'); }
            else if (k === 'quicksand') { fx('sink', e.x, e.y); A.sfx('sink'); }
            else if (k === 'decoy') { fx('pop', e.x, e.y); A.sfx('decoy'); }
            else { fx('spark', e.x, e.y, { m: 1 }); A.sfx('hazard'); }
            addShake(7); buzz('hazard');
            if (!P.demo) P.hazards++;
            if (R) R.trailClear();
            if (!P.demo) {
              const pen = W.opts.hazardPenalty;
              G.UI && G.UI.toast((HZ_NAMES[k] || 'Hazard') + (pen ? '  +' + pen : ''), 'hz');
            }
            break;
          }
          case 'holed': fx('holed', e.x, e.y, { effect: cos.cupEffect }); fx('confetti', e.x, e.y - 20); A.sfx('cup'); addShake(3); buzz('hole'); break;
          case 'swish':
            fx('swish', e.x, e.y); A.sfx('swish'); addShake(5);
            if (!P.demo && G.UI) G.UI.swishBanner();
            break;
          case 'token': {
            fx('token', e.x, e.y); A.sfx(e.all ? 'tokensAll' : 'token', { i: e.i });
            if (e.all && !P.demo && G.UI) G.UI.toast('★ All stars collected — the cup is open!', 'info', 2000);
            break;
          }
          case 'boost': fx('skim', e.x, e.y, { m: 1 }); A.sfx('boost'); break;
          case 'skim': fx('skim', e.x, e.y); A.sfx('skim'); break;
          case 'bubble': fx('pop', e.x, e.y, { m: 0.4 }); A.sfx('bubble'); break;
          case 'pop': fx('pop', e.x, e.y); A.sfx('pop'); break;
          case 'ride': fx('spark', e.x, e.y, { m: 0.4 }); A.sfx('ride'); if (R) R.trailClear(); break;
          case 'unride': fx('dust', e.x, e.y, { m: 0.5 }); A.sfx('unride'); if (R) R.trailClear(); break;
          case 'ring': fx('ring', e.x, e.y); A.sfx('ring'); addShake(2); break;
          case 'boom': fx('boom', e.x, e.y); A.sfx('boom'); addShake(14); break;
          case 'arm': fx('spark', e.x, e.y, { m: 0.4 }); A.sfx('arm'); break;
          case 'catapult': fx('dust', e.x, e.y, { m: 1.2 }); A.sfx('catapult'); addShake(9); break;
          case 'sink': fx('sink', e.x, e.y); A.sfx('sink'); break;
          case 'drown': fx('splash', e.x, e.y); A.sfx('drown'); addShake(5); break;
          default: break;
        }
        if (P.onEvent) P.onEvent(e);
      }
      ev.length = 0;
    }

    // ---- fog reveal ----
    function updateFog(dt) {
      const S = P.S;
      for (let k = 0; k < fogIdx.length; k++) {
        const gi = fogIdx[k], g = hole.gm[gi];
        if (P.fog[gi] >= 1) continue;
        const dx = Math.max(g.x - S.x, 0, S.x - (g.x + g.w)), dy = Math.max(g.y - S.y, 0, S.y - (g.y + g.h));
        const d = Math.hypot(dx, dy);
        if (d < 260) {
          const target = Math.min(1, 0.35 + 0.65 * (1 - d / 260));
          if (target > P.fog[gi]) P.fog[gi] = Math.min(target, P.fog[gi] + dt * 1.8);
        }
      }
    }

    // ---- aim preview ----
    function curAim() {
      if (P.aim) return P.aim;
      if (P.kAim && P.kAim.active) return P.kAim;
      return null;
    }
    function computePreview(a) {
      const mode = diff.preview;
      if (mode === 'none' && !P.demo) return null;
      const spin = P.effSpin();
      const key = a.angle.toFixed(3) + ':' + a.power.toFixed(3) + ':' + spin;
      const tNow = P.time;
      const dynamic = W.dynG.length > 0 || W.movcup;
      if (P.preview && P.prevKey === key && (!dynamic || tNow - P.prevT < 0.12)) return P.preview;
      if (P.preview && tNow - P.prevT < 0.03) return P.preview; // throttle
      const S2 = Ph.cloneState(P.S); S2.ev = null;
      Ph.shoot(W, S2, a.angle, Math.max(0.02, a.power), spin);
      const maxSteps = mode === 'full' ? Math.round(6 / C.DT) : Math.round(0.35 / C.DT);
      const pts = [S2.x, S2.y];
      for (let i = 0; i < maxSteps; i++) {
        const r = Ph.step(W, S2);
        if (i % 3 === 2) pts.push(S2.x, S2.y);
        if (r !== 0) { pts.push(S2.x, S2.y); break; }
      }
      P.preview = pts; P.prevKey = key; P.prevT = tNow;
      return pts;
    }

    // ---- main update ----
    P.update = function (dt, keys) {
      if (P.paused) return;
      P.time += dt;
      P.stateT += dt;
      if (!P.demo && P.state === 'play' && P.S.strokes > 0 && !P.S.holed) P.clock += dt;
      if (keys) P.keyboardAim(dt, keys);
      // fixed-step physics (keeps running while aiming)
      P.acc += Math.min(dt, 0.1);
      let n = 0;
      while (P.acc >= C.DT && n < 14) {
        P.acc -= C.DT; n++;
        // queued (automation/bot) shots fire on the exact step the ball is at rest, matching Bot timing
        if (P.queue.length && P.state === 'play' && P.S.rest && !P.S.holed && P.S.strokes < limit) {
          const q = P.queue.shift(); cam.skipIntro(); P.shoot(q.a, q.p, q.s || 0);
        }
        const r = Ph.step(W, P.S);
        if (P.rec) {
          if (++P.rec.n % 2 === 0) P.rec.pts.push(P.S.x, P.S.y);
          if (r !== 0 || P.rec.pts.length > 12000) {
            if (r !== 2) P.rec.pts.push(P.S.x, P.S.y);
            if (P.rec.pts.length >= 6) P.ghostPts = P.rec.pts;
            P.rec = null;
          }
        }
        if (r === 1) { if (P.state === 'play') { P.state = 'holed'; P.stateT = 0; } break; }
        if (r === 4 || P.S.failed) { if (P.state === 'play') { P.state = 'failed'; P.stateT = 0; P.failReason = P.S.failed || 'flood'; } break; }
        if (r === 2 || r === 3) {
          if (P.state === 'play' && !P.S.holed && P.S.strokes >= limit) { P.state = 'failed'; P.stateT = 0; P.failReason = 'limit'; }
        }
      }
      if (n >= 14) P.acc = 0;
      handleEvents();
      updateFog(dt);
      const S = P.S;
      if (!S.rest && !S.hold && R) { P.trailT += dt; if (P.trailT > 1 / 60) { P.trailT = 0; R.trailPush(S.x, S.y); } }
      cam.update(dt, (S.rest || S.hold) ? { x: S.x, y: S.y, vx: 0, vy: 0 } : S);
      // shake
      P.shakeMag *= Math.exp(-dt * 9);
      if (P.shakeMag < 0.2) P.shakeMag = 0;
      P.shake.x = (Math.random() * 2 - 1) * P.shakeMag; P.shake.y = (Math.random() * 2 - 1) * P.shakeMag;
      // transitions
      if (P.state === 'holed' && !P.result) {
        const bonus = S.bonus || 0, score = S.strokes - bonus;
        P.result = { holed: true, strokes: S.strokes, bonus, score, swish: !!S.swish, par: hole.par, label: G.Modes.scoreLabel(score, hole.par), time: P.clock, hazards: P.hazards, spin: P.lastSpin };
        if (!P.demo && G.UI) { if (S.swish) setTimeout(() => G.UI.bigLabel(P.result.label.text, P.result.label.cls), 900); else G.UI.bigLabel(P.result.label.text, P.result.label.cls); }
      }
      if (P.state === 'holed' && P.stateT > (S.swish ? 2.4 : 1.6) && !P.reported) { P.reported = true; o.onHoled && o.onHoled(P.result, P); }
      if (P.state === 'failed' && !P.result) {
        const reason = P.failReason || S.failed || 'limit';
        P.result = { holed: false, failed: true, reason, text: FAIL_TEXT[reason] || 'Hole failed', strokes: S.strokes, bonus: S.bonus || 0, score: S.strokes - (S.bonus || 0), par: hole.par, time: P.clock, hazards: P.hazards };
        if (!P.demo && G.UI) { G.UI.bigLabel(reason === 'flood' ? 'Swamped!' : 'Stroke limit!', 'fail'); if (reason === 'flood') G.UI.toast(P.result.text, 'hz', 2200); A.sfx('fail'); }
      }
      if (P.state === 'failed' && P.stateT > (P.failReason === 'flood' ? 1.8 : 1.3) && !P.reported) { P.reported = true; o.onFailed && o.onFailed(P.result, P); }
    };
    P.unfail = function () { P.result = null; P.reported = false; };

    P.aimInfo = function () {
      const a = curAim();
      if (!a || !P.canShoot()) return null;
      const pts = computePreview(a);
      const putt = P.isPutt();
      return { x: P.S.x, y: P.S.y, angle: a.angle, power: a.power, points: pts || null, spin: putt ? 0 : P.spin, putt, precise: P.precise() };
    };
    // "Show me": the bot's verified solution replayed from the tee in a cloned world, shown as a looping ghost
    P.hasBotHint = () => !!(hole.bot && hole.bot.shots && hole.bot.shots.length);
    P.showMe = function (on) {
      if (on === false || (on === undefined && P.botGhost)) { P.botGhost = null; return false; }
      if (!P.hasBotHint()) return false;
      let pts = null;
      try { pts = simulatePath(hole, hole.bot.shots); } catch (e) { console.warn('[showme]', e); }
      if (!pts || pts.length < 6) return false;
      P.botGhost = { points: pts, t0: P.time, dur: pts.length / 2 / 60 };
      return true;
    };
    function ghostFrame() {
      const loop = (pts, t0, rate) => { const dur = pts.length / 2 / 60 / (rate || 1), per = dur + 0.7; const ph = (P.time - t0) % per; return { points: pts, t: Math.min(1, ph / dur) }; };
      if (P.botGhost) { const g = loop(P.botGhost.points, P.botGhost.t0, P.botGhost.points.length > 2400 ? 1.6 : 1); g.bot = true; return g; }
      if (!P.ghostPts || P.demo || settings().ghost === false) { P.ghostT0 = -1; return null; }
      if (!(P.isAiming() && P.canShoot())) { P.ghostT0 = -1; return null; }
      if (P.ghostT0 < 0) P.ghostT0 = P.time;
      return loop(P.ghostPts, P.ghostT0, 1);
    }
    P.ghostFrame = ghostFrame;
    P.draw = function (time, dt) {
      if (!R) return;
      const st = settings(), aim = P.aimInfo();
      const f = { cam: cam.view(), W, S: P.S, aim, fogReveal: P.fog, shake: P.shake, time, dt, spin: P.effSpin(), putt: P.isPutt(),
        a11y: { colorblind: !!st.colorblind, reducedFx: reducedFx() } };
      const gh = ghostFrame(); if (gh) f.ghost = gh;
      if (aim && P.lastShot && !P.demo) f.prevAim = { angle: P.lastShot.angle, power: P.lastShot.power };
      R.draw(f);
    };
    P.windInfo = function () {
      if (!W.globalWind.length) return null;
      let ax = 0, ay = 0;
      const tg = P.S.t * W.opts.gspeed;
      for (const gi of W.globalWind) { const g = W.gimmicks[gi], f = Ph.poses.windFactor(g, tg) * W.opts.windMul; ax += g.ax * f; ay += (g.ay || 0) * f; }
      return { ax, ay, strength: Math.hypot(ax, ay), angle: Math.atan2(ay, ax) };
    };
    P.tokenInfo = function () {
      if (tokIdx < 0) return null;
      const n = hole.gm[tokIdx].pts.length >> 1;
      return { got: popcount(P.S.dyn[tokIdx] || 0), n };
    };
    P.hudInfo = function () {
      return {
        name: hole.name, par: hole.par, strokes: P.S.strokes, limit, mull: P.mull.left, canMull: P.canMulligan(),
        spin: P.spin, putt: P.isPutt(), score: P.score(), bonus: P.S.bonus || 0, tokens: P.tokenInfo(), wind: P.windInfo(), aim: P.aim || (P.kAim && P.kAim.active ? P.kAim : null), canShoot: P.canShoot(), state: P.state,
        intro: cam.inIntro(), last: P.lastShot, clock: P.clock, precise: P.precise(), showMe: !!P.botGhost,
      };
    };
    return P;
  }
  G.Play = { create, MAX_DRAG, SPIN_STEPS, HZ_NAMES, PUTT_ZONE, simulatePath };
})();
