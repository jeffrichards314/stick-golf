/* Procedural WebAudio sound effects, optional generative ambient music (off by default) and haptics. */
(function () {
  'use strict';
  const G = window.GOLF = window.GOLF || {};
  let ctx = null, master = null, sfxBus = null, noiseBuf = null;
  let muted = false, sfxVol = 0.8;
  const lastPlay = {};

  function ensure() {
    if (ctx) return ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    try { ctx = new AC(); } catch (e) { return null; }
    master = ctx.createGain(); master.connect(ctx.destination);
    const comp = ctx.createDynamicsCompressor(); comp.connect(master);
    sfxBus = ctx.createGain(); sfxBus.connect(comp);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 1, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    applyVol();
    return ctx;
  }
  function applyVol() {
    if (!ctx) return;
    master.gain.value = muted ? 0 : 1;
    sfxBus.gain.value = sfxVol;
  }
  function resume() {
    ensure();
    if (ctx && ctx.state === 'suspended') { try { ctx.resume(); } catch (e) { /* */ } }
  }
  ['pointerdown', 'keydown', 'touchstart'].forEach((ev) => window.addEventListener(ev, resume, { passive: true }));

  function ready() { return ctx && ctx.state === 'running' && !muted; }

  // --- primitives ---
  function tone(freq, dur, opt) {
    opt = opt || {};
    const t0 = (opt.at || ctx.currentTime) + (opt.delay || 0);
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = opt.type || 'sine';
    o.frequency.setValueAtTime(freq, t0);
    if (opt.to) o.frequency.exponentialRampToValueAtTime(Math.max(20, opt.to), t0 + dur);
    const v = opt.vol === undefined ? 0.3 : opt.vol, a = opt.attack || 0.005;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, v), t0 + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(opt.bus || sfxBus);
    o.start(t0); o.stop(t0 + dur + 0.05);
    return o;
  }
  function noise(dur, opt) {
    opt = opt || {};
    const t0 = (opt.at || ctx.currentTime) + (opt.delay || 0);
    const s = ctx.createBufferSource(); s.buffer = noiseBuf; s.loop = true;
    const f = ctx.createBiquadFilter(); f.type = opt.filter || 'bandpass';
    f.frequency.setValueAtTime(opt.freq || 1000, t0);
    if (opt.to) f.frequency.exponentialRampToValueAtTime(opt.to, t0 + dur);
    f.Q.value = opt.q || 1;
    const g = ctx.createGain(); const v = opt.vol === undefined ? 0.3 : opt.vol;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(v, t0 + (opt.attack || 0.01));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    s.connect(f); f.connect(g); g.connect(opt.bus || sfxBus);
    s.start(t0, Math.random() * 0.5); s.stop(t0 + dur + 0.05);
  }

  // --- sfx ---
  function sfx(name, o) {
    if (!ready()) return;
    o = o || {};
    const now = ctx.currentTime;
    // rate limit per name
    const minGap = { bounce: 0.04, roll: 0.05, ui: 0.03 }[name] || 0.025;
    if (lastPlay[name] && now - lastPlay[name] < minGap) return;
    lastPlay[name] = now;
    const m = Math.max(0, Math.min(1, o.m === undefined ? 0.5 : o.m));
    switch (name) {
      case 'swing': {
        const p = o.p === undefined ? 0.6 : o.p;
        noise(0.18 + p * 0.2, { freq: 600 + p * 1800, to: 300, q: 0.8, vol: 0.15 + p * 0.35, attack: 0.03 });
        tone(180 + p * 120, 0.06, { type: 'triangle', vol: 0.25 });
        break;
      }
      case 'bounce': {
        const s = o.s || 'f', v = 0.06 + m * 0.3;
        if (s === 'i') { tone(1800 + Math.random() * 400, 0.12, { type: 'sine', vol: v * 0.6 }); tone(2700, 0.08, { type: 'sine', vol: v * 0.3 }); }
        else if (s === 's') noise(0.2, { freq: 3000, q: 0.5, vol: v * 0.7, filter: 'highpass' });
        else if (s === 'b' || s === 'pad') tone(220, 0.25, { type: 'sine', to: 620, vol: v * 1.1 });
        else if (s === 'k' || s === 'm' || s === 'q') { tone(s === 'm' ? 900 : 420, 0.08, { type: 'triangle', vol: v * 0.8 }); noise(0.05, { freq: 2500, vol: v * 0.3 }); }
        else if (s === 'g') tone(140, 0.15, { type: 'sine', to: 70, vol: v });
        else if (s === 'r') noise(0.1, { freq: 500, q: 0.7, vol: v * 0.8, filter: 'lowpass' });
        else { tone(130 + m * 60, 0.09, { type: 'sine', to: 70, vol: v * 1.2 }); noise(0.04, { freq: 800, vol: v * 0.25 }); }
        break;
      }
      case 'pad': tone(200, 0.3, { type: 'sine', to: 800, vol: 0.3 }); tone(400, 0.2, { type: 'triangle', to: 1200, vol: 0.1 }); break;
      case 'cup': {
        tone(160, 0.12, { type: 'triangle', vol: 0.3 });
        const notes = [72, 76, 79, 84];
        notes.forEach((n, i) => tone(mtof(n), 0.35, { type: 'triangle', vol: 0.18, delay: 0.12 + i * 0.09 }));
        break;
      }
      case 'water': noise(0.6, { freq: 900, to: 200, q: 0.6, vol: 0.4, filter: 'lowpass' }); tone(300, 0.25, { to: 90, vol: 0.15 }); break;
      case 'lava': noise(0.8, { freq: 4000, to: 1500, q: 0.4, vol: 0.3, filter: 'highpass' }); tone(90, 0.5, { type: 'sawtooth', to: 50, vol: 0.12 }); break;
      case 'hazard': tone(330, 0.2, { type: 'square', to: 120, vol: 0.12 }); break;
      case 'cannon': noise(0.5, { freq: 300, to: 60, q: 0.5, vol: 0.6, filter: 'lowpass' }); tone(80, 0.4, { type: 'sine', to: 35, vol: 0.5 }); break;
      case 'load': tone(300, 0.1, { type: 'square', to: 150, vol: 0.1 }); break;
      case 'teleport': tone(400, 0.3, { type: 'sawtooth', to: 2400, vol: 0.12 }); tone(1200, 0.25, { type: 'sine', to: 300, vol: 0.1, delay: 0.05 }); break;
      case 'bumper': tone(1046, 0.4, { type: 'sine', vol: 0.25 }); tone(1568, 0.3, { type: 'sine', vol: 0.12 }); break;
      case 'break': noise(0.35, { freq: 1200, to: 300, q: 0.5, vol: 0.5 }); tone(120, 0.2, { type: 'square', to: 50, vol: 0.12 }); break;
      case 'crumble': noise(0.5, { freq: 400, to: 120, q: 0.6, vol: 0.3, filter: 'lowpass' }); break;
      case 'switch': tone(1500, 0.04, { type: 'square', vol: 0.12 }); tone(900, 0.06, { type: 'square', vol: 0.1, delay: 0.05 }); break;
      case 'stick': tone(110, 0.2, { type: 'sine', to: 55, vol: 0.3 }); noise(0.15, { freq: 300, vol: 0.15, filter: 'lowpass' }); break;
      case 'ui': tone(880, 0.05, { type: 'triangle', vol: 0.12 }); break;
      case 'uiback': tone(560, 0.06, { type: 'triangle', vol: 0.1 }); break;
      case 'star': {
        const i = o.i || 0;
        tone(mtof(84 + [0, 4, 7][i % 3]), 0.4, { type: 'sine', vol: 0.18 });
        tone(mtof(96 + [0, 4, 7][i % 3]), 0.25, { type: 'triangle', vol: 0.06 });
        break;
      }
      case 'fail': [60, 56, 52].forEach((n, i) => tone(mtof(n), 0.35, { type: 'triangle', vol: 0.15, delay: i * 0.18 })); break;
      case 'fanfare': [60, 64, 67, 72, 67, 72, 76].forEach((n, i) => tone(mtof(n), 0.3, { type: 'square', vol: 0.06, delay: i * 0.1 })); break;
      case 'tick': tone(1200, 0.02, { type: 'square', vol: 0.05 }); break;
      // ---- gimmick / scoring sfx ----
      case 'swish': {
        noise(0.35, { freq: 2500, to: 6000, q: 0.7, vol: 0.18, filter: 'bandpass', attack: 0.06 });
        [79, 83, 86, 91, 95].forEach((n, i) => tone(mtof(n), 0.4, { type: 'sine', vol: 0.16, delay: 0.05 + i * 0.06 }));
        tone(mtof(103), 0.7, { type: 'triangle', vol: 0.07, delay: 0.38 });
        break;
      }
      case 'token': { const i = o.i || 0; tone(mtof(88 + (i % 5) * 2), 0.18, { type: 'sine', vol: 0.18 }); tone(mtof(100 + (i % 5) * 2), 0.22, { type: 'triangle', vol: 0.07, delay: 0.06 }); break; }
      case 'tokensAll': [84, 88, 91, 96].forEach((n, i) => tone(mtof(n), 0.3, { type: 'triangle', vol: 0.13, delay: i * 0.07 })); break;
      case 'boost': tone(300, 0.25, { type: 'sawtooth', to: 1400, vol: 0.08 }); noise(0.2, { freq: 1500, to: 4000, vol: 0.08 }); break;
      case 'skim': tone(900 + Math.random() * 300, 0.07, { type: 'sine', to: 500, vol: 0.14 }); noise(0.09, { freq: 2200, q: 1.2, vol: 0.12 }); break;
      case 'bubble': tone(260, 0.3, { type: 'sine', to: 700, vol: 0.18 }); tone(500, 0.15, { type: 'sine', to: 1100, vol: 0.08, delay: 0.1 }); break;
      case 'pop': tone(900, 0.06, { type: 'square', to: 300, vol: 0.12 }); noise(0.06, { freq: 3000, q: 0.8, vol: 0.18 }); break;
      case 'ride': tone(500, 0.2, { type: 'triangle', to: 900, vol: 0.1 }); noise(0.4, { freq: 1800, q: 3, vol: 0.05 }); break;
      case 'unride': tone(900, 0.15, { type: 'triangle', to: 400, vol: 0.1 }); break;
      case 'ring': tone(mtof(84), 0.3, { type: 'sine', vol: 0.15 }); tone(mtof(91), 0.35, { type: 'sine', vol: 0.12, delay: 0.05 }); tone(500, 0.2, { type: 'sawtooth', to: 1800, vol: 0.05 }); break;
      case 'boom': noise(0.8, { freq: 600, to: 50, q: 0.4, vol: 0.7, filter: 'lowpass' }); tone(70, 0.6, { type: 'sine', to: 28, vol: 0.6 }); break;
      case 'arm': tone(1300, 0.05, { type: 'square', vol: 0.08 }); tone(1300, 0.05, { type: 'square', vol: 0.08, delay: 0.15 }); break;
      case 'catapult': noise(0.3, { freq: 400, to: 1800, q: 0.6, vol: 0.4 }); tone(120, 0.3, { type: 'triangle', to: 500, vol: 0.3 }); break;
      case 'sink': noise(0.9, { freq: 500, to: 120, q: 0.5, vol: 0.25, filter: 'lowpass', attack: 0.1 }); tone(200, 0.8, { type: 'sine', to: 60, vol: 0.15 }); break;
      case 'drown': noise(0.9, { freq: 800, to: 150, q: 0.5, vol: 0.4, filter: 'lowpass' }); [55, 52, 48].forEach((n, i) => tone(mtof(n), 0.3, { type: 'sine', vol: 0.15, delay: 0.1 + i * 0.15 })); break;
      case 'zap': tone(1800, 0.18, { type: 'sawtooth', to: 200, vol: 0.12 }); noise(0.15, { freq: 5000, q: 0.5, vol: 0.15, filter: 'highpass' }); break;
      case 'void': tone(400, 0.7, { type: 'sine', to: 40, vol: 0.25 }); tone(600, 0.6, { type: 'triangle', to: 60, vol: 0.08, delay: 0.05 }); break;
      case 'decoy': tone(mtof(72), 0.15, { type: 'square', vol: 0.08 }); tone(mtof(66), 0.3, { type: 'square', vol: 0.08, delay: 0.14 }); break;
      case 'intro': tone(mtof(79), 0.18, { type: 'triangle', vol: 0.12 }); tone(mtof(86), 0.3, { type: 'triangle', vol: 0.12, delay: 0.1 }); break;
      default: break;
    }
  }
  function mtof(m) { return 440 * Math.pow(2, (m - 69) / 12); }

  function setMute(v) { muted = !!v; applyVol(); }
  function setVolumes(s) { if (s !== undefined) sfxVol = s; applyVol(); }
  G.Audio = {
    sfx, resume, setMute, setVolumes,
    isMuted: () => muted, get ctx() { return ctx; },
  };

  // ---------------- generative ambient music ----------------
  // Soft pads + a sparse arpeggio over a slow 4-chord loop. The key/mode/tempo vary with the course (palette index).
  // Fully stopped (no oscillators, no timer) when off.
  const MODES = [
    [0, 2, 4, 7, 9], [0, 3, 5, 7, 10], [0, 2, 4, 6, 7, 9, 11], [0, 2, 3, 5, 7, 9, 10], [0, 2, 4, 5, 7, 9, 11], [0, 2, 3, 7, 8],
  ];
  const ROOTS = [57, 60, 55, 62, 58, 53, 59, 56];
  const PROGS = [[0, 3, 4, 2], [0, 4, 2, 3], [0, 2, 3, 1], [0, 3, 1, 4]];
  const Music = { on: false, vol: 0.45, idx: 0, bus: null, timer: 0, next: 0, step: 0, voices: [], delay: null };
  function mBus() {
    if (!ensure()) return null;
    if (!Music.bus) {
      Music.bus = ctx.createGain(); Music.bus.gain.value = 0;
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2600;
      Music.bus.connect(lp); lp.connect(master);
      const d = ctx.createDelay(1.5), fb = ctx.createGain(), wet = ctx.createGain();
      d.delayTime.value = 0.45; fb.gain.value = 0.35; wet.gain.value = 0.35;
      d.connect(fb); fb.connect(d); d.connect(wet); wet.connect(Music.bus);
      Music.delay = d;
    }
    return Music.bus;
  }
  function mVoice(freq, t0, dur, o) {
    const osc = ctx.createOscillator(), g = ctx.createGain();
    osc.type = o.type || 'sine'; osc.frequency.value = freq; if (o.det) osc.detune.value = o.det;
    const a = o.a || 0.02, v = o.v || 0.05;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(v, t0 + a);
    g.gain.setValueAtTime(v, t0 + Math.max(a, dur - (o.r || 0.3)));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g); g.connect(Music.bus); if (o.send && Music.delay) g.connect(Music.delay);
    osc.start(t0); osc.stop(t0 + dur + 0.05);
    const vo = { osc, end: t0 + dur + 0.1 };
    Music.voices.push(vo);
    osc.onended = () => { const i = Music.voices.indexOf(vo); if (i >= 0) Music.voices.splice(i, 1); try { g.disconnect(); } catch (e) { /* */ } };
  }
  function mTick() {
    if (!Music.on || !ctx) return;
    if (ctx.state !== 'running') return;
    const k = Music.idx | 0, scale = MODES[k % MODES.length], root = ROOTS[(k * 3) % ROOTS.length] - 12;
    const prog = PROGS[(k >> 1) % PROGS.length], beat = 0.62 + ((k * 7) % 5) * 0.06, bar = beat * 8;
    const deg = (i) => { const n = scale.length, o = Math.floor(i / n); return root + scale[((i % n) + n) % n] + 12 * o; };
    if (Music.next < ctx.currentTime) Music.next = ctx.currentTime + 0.1;
    while (Music.next < ctx.currentTime + 0.8) {
      const t = Music.next, st = Music.step, inBar = st % 8, chord = prog[Math.floor(st / 8) % prog.length];
      if (inBar === 0) {
        [0, 2, 4].forEach((d, i) => {
          const f = mtof(deg(chord + d) + 12);
          mVoice(f, t, bar + 1.2, { type: 'triangle', v: 0.022, a: 1.4, r: 1.6, det: i * 4 - 4 });
          mVoice(f * 1.003, t, bar + 1.2, { type: 'sine', v: 0.018, a: 1.8, r: 1.6 });
        });
        mVoice(mtof(deg(chord) - 12 + 12), t, bar, { type: 'sine', v: 0.035, a: 0.6, r: 1.2 });
      }
      // sparse arpeggio (deterministic-ish per step)
      const h = Math.sin((st + 1) * 12.9898 + k * 78.233) * 43758.5453, r = h - Math.floor(h);
      if (r < 0.55 && inBar !== 7) {
        const pick = [0, 2, 4, 7, 9][Math.floor(r * 9.1) % 5];
        mVoice(mtof(deg(chord + pick) + 24), t, beat * 1.6, { type: 'sine', v: 0.03, a: 0.01, r: beat * 1.2, send: true });
      }
      Music.next += beat; Music.step++;
    }
  }
  function musicOn(v) {
    v = !!v;
    if (v === Music.on && (!v || Music.timer)) return;
    Music.on = v;
    if (v) {
      if (!mBus()) { Music.on = false; return; }
      Music.bus.gain.cancelScheduledValues(ctx.currentTime);
      Music.bus.gain.setTargetAtTime(Music.vol * 0.9, ctx.currentTime, 0.6);
      Music.next = 0; Music.step = 0;
      Music.timer = setInterval(mTick, 200); mTick();
    } else {
      if (Music.timer) clearInterval(Music.timer); Music.timer = 0;
      if (ctx && Music.bus) {
        const t = ctx.currentTime;
        Music.bus.gain.cancelScheduledValues(t); Music.bus.gain.setTargetAtTime(0, t, 0.15);
        Music.voices.slice().forEach((vo) => { try { vo.osc.stop(t + 0.6); } catch (e) { /* */ } });
      }
    }
  }
  G.Music = {
    set(on, vol) { if (vol !== undefined) { Music.vol = +vol; if (Music.on && ctx && Music.bus) Music.bus.gain.setTargetAtTime(Music.vol * 0.9, ctx.currentTime, 0.2); } musicOn(on); },
    setTheme(idx) { idx = (idx | 0) || 0; if (idx === Music.idx) return; Music.idx = idx; if (Music.on && ctx) { Music.step = Math.ceil(Music.step / 8) * 8; } },
    get on() { return Music.on; }, get voices() { return Music.voices.length; }, get running() { return !!Music.timer; },
  };
  // resume music scheduling after the first user gesture
  ['pointerdown', 'keydown'].forEach((ev) => window.addEventListener(ev, () => { if (Music.on && !Music.timer) { Music.on = false; musicOn(true); } }, { passive: true }));

  // ---------------- haptics ----------------
  const canVibrate = typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';
  const PATTERNS = { shot: [14], bounce: [6], hole: [20, 50, 30, 50, 60], hazard: [60, 40, 60], unlock: [15, 40, 15, 40, 45], tick: [4], fail: [80] };
  let lastBuzz = 0;
  G.Haptics = {
    supported: canVibrate,
    buzz(kind) {
      if (!canVibrate) return;
      const s = G.Store && G.Store.getSettings ? G.Store.getSettings() : {};
      if (s.haptics === false) return;
      const now = performance.now();
      if (kind === 'bounce' && now - lastBuzz < 140) return;
      lastBuzz = now;
      try { navigator.vibrate(PATTERNS[kind] || [10]); } catch (e) { /* */ }
    },
  };
})();
