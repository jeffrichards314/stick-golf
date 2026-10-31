/*
 * Shared deterministic physics for the game and the headless bot.
 * Browser: GOLF.Physics   Node: require('./physics.js')
 *
 * World coordinates: pixels, y grows DOWN (gravity is +y).
 * Fixed timestep DT. All gimmick motion is a pure function of time (or of the stroke count);
 * mutable gimmick state lives only in state.dyn / state.dyn2 (one pair of numbers per gimmick).
 */
(function (root, factory) {
  const mod = factory();
  if (typeof module === 'object' && module.exports) module.exports = mod;
  else { root.GOLF = root.GOLF || {}; root.GOLF.Physics = mod; }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const C = {
    VERSION: 8,
    DT: 1 / 120,
    G: 900,
    R: 6,
    MAX_SPEED: 1200,      // shot speed at power 1 (flat range ~1600px, max apex ~800px)
    REST_SPEED: 12,
    REST_TIME: 0.25,
    MAX_SHOT_TIME: 18,
    CUP_W: 30,
    CAPTURE_SPEED: 400,   // rolling capture
    DROP_SPEED: 1300,     // dropping straight into the cup mouth
    BOUNCE_MIN: 70,
    CELL: 48,
    SPEED_CAP: 2600,
    MAGNUS: 0.32,         // spin lift: accel = MAGNUS * |v| * spin
    SPIN_KICK: 240,       // tangential speed added/removed by spin on first bounce
  };

  // Surface table. Codes are single chars used in hole JSON.
  const SURF_LIST = [
    { c: 'f', name: 'fairway', e: 0.42, mu: 0.28, tan: 0.82 },
    { c: 'r', name: 'rough', e: 0.28, mu: 0.95, tan: 0.6 },
    { c: 's', name: 'sand', e: 0.06, mu: 3.6, tan: 0.22 },
    { c: 'i', name: 'ice', e: 0.32, mu: 0.012, tan: 0.99 },
    { c: 'g', name: 'goo', e: 0, mu: 50, tan: 0, stick: true },
    { c: 'b', name: 'bouncy', e: 0.9, mu: 0.35, tan: 0.9 },
    { c: 'k', name: 'rock', e: 0.5, mu: 0.45, tan: 0.8 },
    { c: 'q', name: 'ricochet', e: 1.08, mu: 0.3, tan: 1.0 },
    { c: 'm', name: 'metal', e: 0.55, mu: 0.3, tan: 0.85 },
    { c: 'c', name: 'conveyor', e: 0.3, mu: 1.4, tan: 0.7 },
    { c: 'n', name: 'green', e: 0.36, mu: 0.3, tan: 0.8, green: true },
    { c: 'u', name: 'quicksand', e: 0.04, mu: 4.0, tan: 0.2, sink: true },
    { c: 'h', name: 'cushion', e: 0.02, mu: 2.6, tan: 0.3 },
    { c: 'j', name: 'skim', e: 0.62, mu: 0.1, tan: 0.86, skim: true },
    { c: 'w', name: 'water', hazard: true },
    { c: 'l', name: 'lava', hazard: true },
    { c: 'o', name: 'oob', hazard: true },
    { c: 'x', name: 'spikes', hazard: true },
    { c: 'z', name: 'laser', hazard: true },
    { c: 'v', name: 'void', hazard: true },
  ];
  const SURF = {}; const SURF_IDX = {};
  SURF_LIST.forEach((s, i) => { SURF[s.c] = s; SURF_IDX[s.c] = i; SURF[s.name] = s; });
  const surfIndex = (c) => (SURF_IDX[c] !== undefined ? SURF_IDX[c] : (SURF[c] ? SURF_IDX[SURF[c].c] : 0));
  const S_GREEN = SURF_IDX.n;

  // segment kinds
  const K_NORMAL = 0, K_PAD = 1, K_CONV = 2, K_ONEWAY = 3, K_BREAK = 4, K_CRUMBLE = 5, K_BOOST = 6, K_CAT = 7, K_SEESAW = 8, K_GLASS = 9;

  const GIMMICK_TYPES = [
    // original 26
    'wind', 'fan', 'windmill', 'movplat', 'rotplat', 'pad', 'teleport', 'portal', 'conveyor',
    'gwell', 'lowgrav', 'antigrav', 'cannon', 'bumper', 'breakable', 'gate', 'door', 'oneway',
    'vanish', 'sticky', 'ricochet', 'fog', 'movcup', 'shrinkcup', 'spikes', 'crumble',
    // 33 new
    'boost', 'magnet', 'bubble', 'piston', 'pendulum', 'seesaw', 'zipline', 'pipe', 'floatpool',
    'quicksand', 'blackhole', 'sidegrav', 'slowmo', 'drag', 'laser', 'saw', 'crusher', 'tokens',
    'spinner', 'glass', 'flood', 'decoy', 'geyser', 'phase', 'toggle', 'ring', 'skim', 'cushion',
    'tornado', 'catapult', 'mine', 'liftcup', 'blinkcup',
  ];

  // ---------- pure pose functions (used by physics + renderer) ----------
  const TAU = Math.PI * 2;
  function frac(x) { return x - Math.floor(x); }
  const ease = (t) => t * t * (3 - 2 * t);
  const poses = {
    angle(g, tg) { return (g.ph || 0) + g.w * tg; },                      // windmill / rotplat
    movplat(g, tg) {                                                      // -> [x, y, vx, vy]
      const T = g.T || 4, ph = TAU * (tg / T + (g.ph || 0));
      const s = 0.5 - 0.5 * Math.cos(ph), ds = 0.5 * Math.sin(ph) * TAU / T;
      return [g.x + (g.x2 - g.x) * s, g.y + (g.y2 - g.y) * s, (g.x2 - g.x) * ds, (g.y2 - g.y) * ds];
    },
    doorClosed(g, tg) { return frac(tg / (g.T || 3) + (g.ph || 0)) >= (g.open || 0.5); },
    doorOpenAmt(g, tg) {
      const T = g.T || 3, f = frac(tg / T + (g.ph || 0)), o = g.open || 0.5, ramp = Math.min(0.08, o / 3);
      return f < o ? Math.min(1, Math.min(f, o - f) / ramp) : 0;
    },
    vanishOn(g, tg) { return frac(tg / (g.T || 3) + (g.ph || 0)) < (g.on || 0.6); },
    vanishLeft(g, tg) { const f = frac(tg / (g.T || 3) + (g.ph || 0)), on = g.on || 0.6; return f < on ? (on - f) * (g.T || 3) : 0; },
    cannonAngle(g, tg) { return g.ang + (g.amp || 0) * Math.sin(tg * (g.f || 1.5)); },
    windFactor(g, tg) { return 1 + (g.gust || 0) * Math.sin(tg * (g.f || 0.8) + (g.ph || 0) * TAU); },
    // pendulum: [theta (0 = +x, PI/2 = straight down), omega]
    pendulum(g, tg) { const a = (g.w || 2) * tg + (g.ph || 0) * TAU; return [Math.PI / 2 + g.A * Math.sin(a), g.A * (g.w || 2) * Math.cos(a)]; },
    // piston: offset along (dx,dy) 0..1 plus its rate -> [ox, oy, vx, vy]
    piston(g, tg) {
      const T = g.T || 2.4, f = frac(tg / T + (g.ph || 0));
      let s, ds;
      if (f < 0.1) { s = ease(f / 0.1); ds = 6 * (f / 0.1) * (1 - f / 0.1) / (0.1 * T); }
      else if (f < 0.4) { s = 1; ds = 0; }
      else if (f < 0.8) { const u = (f - 0.4) / 0.4; s = 1 - ease(u); ds = -6 * u * (1 - u) / (0.4 * T); }
      else { s = 0; ds = 0; }
      return [g.dx * s, g.dy * s, g.dx * ds, g.dy * ds];
    },
    // crusher: [yOffset, vy]
    crusher(g, tg) {
      const T = g.T || 3, f = frac(tg / T + (g.ph || 0));
      if (f < 0.5) return [0, 0];
      if (f < 0.6) { const u = (f - 0.5) / 0.1; return [g.dy * u * u, 2 * g.dy * u / (0.1 * T)]; }
      if (f < 0.75) return [g.dy, 0];
      const u = (f - 0.75) / 0.25; return [g.dy * (1 - ease(u)), -6 * g.dy * u * (1 - u) / (0.25 * T)];
    },
    crusherWarn(g, tg) { const f = frac(tg / (g.T || 3) + (g.ph || 0)); return f > 0.38 && f < 0.5; },
    sawPos(g, tg) {
      const s = 0.5 - 0.5 * Math.cos(TAU * (tg / (g.T || 3) + (g.ph || 0))), ds = 0.5 * Math.sin(TAU * (tg / (g.T || 3) + (g.ph || 0))) * TAU / (g.T || 3);
      return [g.x + (g.x2 - g.x) * s, g.y + (g.y2 - g.y) * s, (g.x2 - g.x) * ds, (g.y2 - g.y) * ds];
    },
    laserOn(g, tg) { return frac(tg / (g.T || 2) + (g.ph || 0)) < (g.on || 0.5); },
    laserWarn(g, tg) { const f = frac(tg / (g.T || 2) + (g.ph || 0)); return f > 0.85; },
    geyserOn(g, tg) { return frac(tg / (g.T || 3) + (g.ph || 0)) < (g.on || 0.4); },
    tornadoX(g, tg) { const s = 0.5 - 0.5 * Math.cos(TAU * (tg / (g.T || 6) + (g.ph || 0))); return g.x + ((g.x2 === undefined ? g.x : g.x2) - g.x) * s; },
    liftTop(g, tg) {
      const T = g.T || 4, ph = TAU * (tg / T + (g.ph || 0));
      const s = 0.5 - 0.5 * Math.cos(ph), ds = 0.5 * Math.sin(ph) * TAU / T;
      return [g.y2 + (g.y1 - g.y2) * s, (g.y1 - g.y2) * ds];
    },
    blinkIndex(g, tg) { return Math.floor(tg / (g.T || 3) + (g.ph || 0)) % (g.pts.length >> 1); },
    floodLevel(g, strokes) { return Math.max(g.top, g.y0 - g.dy * Math.max(0, strokes - 1)); },
    phaseSolid(g, strokes) { return (strokes % 2 === 1) === !!g.odd; },
  };

  // ---------- world construction ----------
  function createWorld(hole, opts) {
    opts = Object.assign({ gspeed: 1, windMul: 1, hazardPenalty: 1, rec: false }, opts || {});
    const W = {
      hole, opts, w: hole.w, h: hole.h,
      ax: [], ay: [], bx: [], by: [], th: [], sf: [], kd: [], pr: [], p2: [], ux: [], uy: [],
      gimmicks: hole.gm || [],
      fields: [], triggers: [], bumpers: [], dynG: [], crumbles: [], decoys: [], seesaws: [],
      cup: { x: hole.cup[0], y: hole.cup[1], w: hole.cupW || C.CUP_W },
      movcup: null, shrinkcup: null, liftcup: -1, blinkcup: null, tokens: -1, flood: null,
      globalWind: [], rides: {},
      ssTouch: {},
    };
    const addSeg = (ax, ay, bx, by, sc, kind, param, th, p2) => {
      W.ax.push(ax); W.ay.push(ay); W.bx.push(bx); W.by.push(by);
      W.th.push(th || 0); W.sf.push(typeof sc === 'number' ? sc : surfIndex(sc));
      W.kd.push(kind || 0); W.pr.push(param || 0); W.p2.push(p2 || 0);
      let dx = bx - ax, dy = by - ay; const L = Math.hypot(dx, dy) || 1; dx /= L; dy /= L;
      let nx = dy, ny = -dx; if (ny > 0) { nx = -nx; ny = -ny; }
      W.ux.push(nx); W.uy.push(ny);
    };
    W._addSeg = addSeg;
    const gp = hole.ground, gs = hole.gs || '';
    for (let i = 0; i + 3 < gp.length; i += 2) addSeg(gp[i], gp[i + 1], gp[i + 2], gp[i + 3], gs[i >> 1] || 'f', K_NORMAL, 0, 0);
    for (const so of hole.solids || []) {
      const p = so.p, n = p.length >> 1;
      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n;
        const sc = so.s.length > 1 ? (so.s[i] || so.s[0]) : so.s;
        addSeg(p[2 * i], p[2 * i + 1], p[2 * j], p[2 * j + 1], sc, K_NORMAL, 0, 0);
      }
    }
    W.gimmicks.forEach((g, gi) => {
      switch (g.t) {
        case 'wind': if (g.w === undefined) W.globalWind.push(gi); else W.fields.push(gi); break;
        case 'fan': case 'gwell': case 'lowgrav': case 'antigrav': case 'blackhole': case 'sidegrav':
        case 'slowmo': case 'drag': case 'floatpool': case 'geyser': case 'tornado': W.fields.push(gi); break;
        case 'magnet': W.fields.push(gi); addSeg(g.x, g.y, g.x2, g.y2, 'm', K_NORMAL, 0, 5); break;
        case 'pad': {
          const dx = Math.cos(g.ang + Math.PI / 2) * g.L / 2, dy = Math.sin(g.ang + Math.PI / 2) * g.L / 2;
          addSeg(g.x - dx, g.y - dy, g.x + dx, g.y + dy, 'b', K_PAD, g.boost, 3);
          break;
        }
        case 'conveyor': addSeg(g.x, g.y, g.x2, g.y2, 'c', K_CONV, g.v, 4); break;
        case 'boost': addSeg(g.x, g.y, g.x2, g.y2, 'f', K_BOOST, g.a || 2400, 3, g.v || 1100); break;
        case 'oneway': addSeg(g.x, g.y, g.x2, g.y2, 'm', K_ONEWAY, 0, 3); break;
        case 'cushion': addSeg(g.x, g.y, g.x2, g.y2, 'h', K_ONEWAY, 0, 6); break;
        case 'ricochet': addSeg(g.x, g.y, g.x2, g.y2, 'q', K_NORMAL, 0, 5); break;
        case 'spikes': addSeg(g.x, g.y, g.x2, g.y2, 'x', K_NORMAL, 0, 4); break;
        case 'sticky': rectSegs(g.x, g.y, g.w, g.h, (a, b, c, d) => addSeg(a, b, c, d, 'g', K_NORMAL, 0, 0)); break;
        case 'skim': addSeg(g.x, g.y, g.x + g.w, g.y, 'j', K_NORMAL, 0, 0); break;
        case 'quicksand': addSeg(g.x, g.y, g.x2, g.y2, 'u', K_NORMAL, 0, 3); break;
        case 'teleport': case 'portal': case 'cannon': case 'bubble': case 'ring': case 'mine': W.triggers.push(gi); break;
        case 'gate': case 'toggle': W.triggers.push(gi); W.dynG.push(gi); break;
        case 'zipline': case 'pipe': {
          const pts = g.t === 'zipline' ? [g.x, g.y, g.x2, g.y2] : g.p;
          const cum = [0]; for (let i = 2; i < pts.length; i += 2) cum.push(cum[cum.length - 1] + Math.hypot(pts[i] - pts[i - 2], pts[i + 1] - pts[i - 1]));
          W.rides[gi] = { pts, cum, total: cum[cum.length - 1] };
          W.triggers.push(gi);
          break;
        }
        case 'bumper': W.bumpers.push(gi); break;
        case 'windmill': case 'movplat': case 'rotplat': case 'breakable': case 'door': case 'vanish':
        case 'piston': case 'pendulum': case 'crusher': case 'laser': case 'saw': case 'spinner':
        case 'glass': case 'phase': case 'catapult': W.dynG.push(gi); break;
        case 'seesaw': W.dynG.push(gi); W.seesaws.push(gi); break;
        case 'crumble': W.dynG.push(gi); W.crumbles.push(gi); break;
        case 'liftcup': W.dynG.push(gi); W.liftcup = gi; break;
        case 'movcup': W.movcup = g; break;
        case 'shrinkcup': W.shrinkcup = g; break;
        case 'blinkcup': W.blinkcup = g; break;
        case 'tokens': W.tokens = gi; W.triggers.push(gi); break;
        case 'decoy': W.decoys.push(gi); break;
        case 'flood': W.flood = g; break;
        default: break; // fog: render only
      }
    });
    buildGrid(W);
    const N = 384;
    W.dmax = N; W.dn = 0;
    const F = () => new Float64Array(N), I = () => new Int32Array(N);
    W.d = { ax: F(), ay: F(), bx: F(), by: F(), th: F(), sf: I(), kd: I(), pr: F(), p2: F(), gi: I(), vx: F(), vy: F(), cx: F(), cy: F(), w: F() };
    return W;
  }

  function rectSegs(x, y, w, h, fn) {
    fn(x, y, x + w, y); fn(x + w, y, x + w, y + h); fn(x + w, y + h, x, y + h); fn(x, y + h, x, y);
  }

  function buildGrid(W) {
    const cs = C.CELL;
    const minX = -200, minY = -4000, maxX = W.w + 200, maxY = W.h + 200;
    W.gx0 = minX; W.gy0 = minY;
    W.gcols = Math.ceil((maxX - minX) / cs) + 1; W.grows = Math.ceil((maxY - minY) / cs) + 1;
    const cells = new Array(W.gcols * W.grows);
    for (let i = 0; i < W.ax.length; i++) {
      const m = C.R + W.th[i] + 3;
      const c0 = Math.max(0, Math.floor((Math.min(W.ax[i], W.bx[i]) - m - minX) / cs)), c1 = Math.min(W.gcols - 1, Math.floor((Math.max(W.ax[i], W.bx[i]) + m - minX) / cs));
      const r0 = Math.max(0, Math.floor((Math.min(W.ay[i], W.by[i]) - m - minY) / cs)), r1 = Math.min(W.grows - 1, Math.floor((Math.max(W.ay[i], W.by[i]) + m - minY) / cs));
      for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) { const k = r * W.gcols + c; (cells[k] || (cells[k] = [])).push(i); }
    }
    const off = new Int32Array(cells.length + 1);
    let tot = 0;
    for (let k = 0; k < cells.length; k++) { off[k] = tot; tot += cells[k] ? cells[k].length : 0; }
    off[cells.length] = tot;
    const idx = new Int32Array(tot);
    for (let k = 0; k < cells.length; k++) if (cells[k]) idx.set(cells[k], off[k]);
    W.goff = off; W.gidx = idx;
  }

  // ---------- state ----------
  function initState(W) {
    const h = W.hole;
    return {
      x: h.tee[0], y: h.tee[1], vx: 0, vy: 0, t: 0,
      strokes: 0, bonus: 0, shotT: 0, restT: 0,
      rest: true, hold: true, stuck: false, holed: false, failed: null, swish: false,
      contact: 0, bvx: 0, bvy: 0, supS: -1, supG: -1,
      spin: 0, putt: false, touchedGreen: false, lastGround: -1,
      lastX: h.tee[0], lastY: h.tee[1],
      tpCool: -1, cnCool: -1, cannon: -1, cannonT: 0,
      ride: -1, rideD: 0, rideV: 0, bub: -1, bubT: 0, catT: 0, sinkT: 0,
      dyn: new Array(W.gimmicks.length).fill(0),
      dyn2: new Array(W.gimmicks.length).fill(0),
      ev: W.opts.rec ? [] : null,
      flag: 0, hazards: 0,
    };
  }

  function cloneState(S) {
    const c = Object.assign({}, S);
    c.dyn = S.dyn.slice(); c.dyn2 = S.dyn2.slice();
    c.ev = S.ev ? [] : null;
    return c;
  }

  // current cup: {x, y, w, open, vy}
  function cupState(W, S) {
    let x = W.cup.x, y = W.cup.y, w = W.cup.w, vy = 0;
    const tg = S.t * W.opts.gspeed;
    if (W.movcup) {
      const g = W.movcup, s = 0.5 - 0.5 * Math.cos(TAU * (tg / (g.T || 6) + (g.ph || 0)));
      x = g.x1 + (g.x2 - g.x1) * s;
    }
    if (W.blinkcup) { const g = W.blinkcup, i = poses.blinkIndex(g, tg); x = g.pts[2 * i]; y = g.pts[2 * i + 1]; }
    if (W.liftcup >= 0) { const g = W.gimmicks[W.liftcup], p = poses.liftTop(g, tg); x = g.x; y = p[0]; vy = p[1] * W.opts.gspeed; }
    if (W.shrinkcup) { const g = W.shrinkcup; w = Math.max(g.min || 16, w - (g.per || 4) * Math.max(0, S.strokes - 1)); }
    let open = true;
    if (W.tokens >= 0) { const g = W.gimmicks[W.tokens], n = g.pts.length >> 1; open = S.dyn[W.tokens] === (1 << n) - 1; }
    return { x, y, w, open, vy };
  }

  function emit(S, e) { if (S.ev) S.ev.push(e); }

  // Is the ball resting on a putting green? (spin is disabled for putts)
  function isPutt(S) { return S.supS === S_GREEN && S.contact < 3 && !S.hold; }

  // power: 0..1, angle radians (0 = right, -PI/2 = up), spin -1 (back) .. +1 (top); ignored on putts
  function shoot(W, S, angle, power, spin) {
    power = Math.max(0, Math.min(1, power));
    const sp = power * C.MAX_SPEED;
    const putt = isPutt(S);
    S.lastX = S.x; S.lastY = S.y;
    const carry = S.contact < 3 && !S.hold;
    S.vx = Math.cos(angle) * sp + (carry ? S.bvx : 0);
    S.vy = Math.sin(angle) * sp + (carry ? S.bvy : 0);
    S.hold = false; S.stuck = false; S.rest = false; S.restT = 0; S.shotT = 0; S.catT = 0; S.sinkT = 0;
    S.strokes++; S.spin = putt ? 0 : Math.max(-1, Math.min(1, spin || 0)); S.flag = 0;
    S.putt = putt; S.touchedGreen = putt; S.swish = false;
    emit(S, { e: 'shot', x: S.x, y: S.y, p: power, putt });
    if (W.flood && S.y > poses.floodLevel(W.flood, S.strokes) - 2) {
      S.failed = 'flood'; S.rest = true; S.vx = 0; S.vy = 0; emit(S, { e: 'drown', x: S.x, y: S.y });
    }
  }

  function hazardReset(W, S, why) {
    emit(S, { e: 'hazard', x: S.x, y: S.y, k: why });
    S.strokes += W.opts.hazardPenalty;
    S.hazards++;
    S.x = S.lastX; S.y = S.lastY; S.vx = 0; S.vy = 0;
    S.hold = true; S.rest = true; S.stuck = false; S.cannon = -1; S.ride = -1; S.bub = -1; S.catT = 0;
    S.supS = -1; S.spin = 0;
    S.flag = 2;
  }

  // Fill dynamic segment buffers for gimmick time tg.
  function buildDyn(W, S, tg) {
    const D = W.d, gs = W.opts.gspeed; let n = 0;
    const push = (ax, ay, bx, by, th, sf, kd, pr, gi, vx, vy, cx, cy, w, p2) => {
      if (n >= W.dmax) return;
      D.ax[n] = ax; D.ay[n] = ay; D.bx[n] = bx; D.by[n] = by; D.th[n] = th; D.sf[n] = sf; D.kd[n] = kd; D.pr[n] = pr; D.p2[n] = p2 || 0;
      D.gi[n] = gi; D.vx[n] = vx; D.vy[n] = vy; D.cx[n] = cx; D.cy[n] = cy; D.w[n] = w; n++;
    };
    const SM = SURF_IDX.m, SK = SURF_IDX.k, SF = SURF_IDX.f, SX = SURF_IDX.x, SZ = SURF_IDX.z, SC = SURF_IDX.c;
    const rect = (x, y, w, h, sf, kd, pr, gi, vx, vy) => rectSegs(x, y, w, h, (a, b, c, d) => push(a, b, c, d, 0, sf, kd, pr, gi, vx, vy, 0, 0, 0));
    for (let k = 0; k < W.dynG.length; k++) {
      const gi = W.dynG[k], g = W.gimmicks[gi];
      switch (g.t) {
        case 'windmill': {
          const a0 = poses.angle(g, tg), w = g.w * gs;
          for (let i = 0; i < g.n; i++) { const a = a0 + TAU * i / g.n; push(g.x, g.y, g.x + Math.cos(a) * g.L, g.y + Math.sin(a) * g.L, 5, SM, K_NORMAL, 0, gi, 0, 0, g.x, g.y, w); }
          break;
        }
        case 'rotplat': {
          const a = poses.angle(g, tg), w = g.w * gs, dx = Math.cos(a) * g.L / 2, dy = Math.sin(a) * g.L / 2;
          push(g.x - dx, g.y - dy, g.x + dx, g.y + dy, 6, SF, K_NORMAL, 0, gi, 0, 0, g.x, g.y, w);
          break;
        }
        case 'seesaw': {
          const a = S.dyn[gi], dx = Math.cos(a) * g.L / 2, dy = Math.sin(a) * g.L / 2;
          push(g.x - dx, g.y - dy, g.x + dx, g.y + dy, 6, SF, K_SEESAW, 0, gi, 0, 0, g.x, g.y, S.dyn2[gi]);
          break;
        }
        case 'movplat': { const p = poses.movplat(g, tg); rect(p[0], p[1], g.w, g.h, SF, K_NORMAL, 0, gi, p[2] * gs, p[3] * gs); break; }
        case 'piston': { const p = poses.piston(g, tg); rect(g.x + p[0], g.y + p[1], g.w, g.h, SM, K_NORMAL, 0, gi, p[2] * gs, p[3] * gs); break; }
        case 'crusher': {
          const p = poses.crusher(g, tg), y = g.y + p[0], vy = p[1] * gs;
          const x = g.x, w = g.w, h = g.h;
          push(x, y, x + w, y, 0, SM, K_NORMAL, 0, gi, 0, vy, 0, 0, 0);
          push(x + w, y, x + w, y + h, 0, SM, K_NORMAL, 0, gi, 0, vy, 0, 0, 0);
          push(x + w, y + h, x, y + h, 0, vy > 40 ? SX : SM, K_NORMAL, 0, gi, 0, vy, 0, 0, 0);
          push(x, y + h, x, y, 0, SM, K_NORMAL, 0, gi, 0, vy, 0, 0, 0);
          break;
        }
        case 'pendulum': {
          const p = poses.pendulum(g, tg), w = p[1] * gs, ex = g.x + Math.cos(p[0]) * g.L, ey = g.y + Math.sin(p[0]) * g.L;
          push(g.x, g.y, ex, ey, 3, SM, K_NORMAL, 0, gi, 0, 0, g.x, g.y, w);
          push(ex, ey, ex, ey, g.r || 22, SM, K_NORMAL, 0, gi, 0, 0, g.x, g.y, w);
          break;
        }
        case 'spinner': push(g.x, g.y, g.x, g.y, g.r, SC, K_NORMAL, 0, gi, 0, 0, g.x, g.y, g.w * gs); break;
        case 'saw': { const p = poses.sawPos(g, tg); push(p[0], p[1], p[0], p[1], g.r || 18, SX, K_NORMAL, 0, gi, 0, 0, 0, 0, 0); break; }
        case 'laser': if (poses.laserOn(g, tg)) push(g.x, g.y, g.x2, g.y2, 2, SZ, K_NORMAL, 0, gi, 0, 0, 0, 0, 0); break;
        case 'catapult': push(g.x - g.w / 2, g.y, g.x + g.w / 2, g.y, 3, SM, K_CAT, 0, gi, 0, 0, 0, 0, 0); break;
        case 'breakable': if (!S.dyn[gi]) rect(g.x, g.y, g.w, g.h, SK, K_BREAK, g.th || 260, gi, 0, 0); break;
        case 'glass': if (!S.dyn[gi]) rect(g.x, g.y, g.w, g.h, SM, K_GLASS, g.th || 380, gi, 0, 0); break;
        case 'gate': if (!S.dyn[gi]) rect(g.x, g.y, g.w, g.h, SM, K_NORMAL, 0, gi, 0, 0); break;
        case 'toggle': { const set = S.dyn[gi] ? g.b : g.a; for (const r of set) rect(r[0], r[1], r[2], r[3], SM, K_NORMAL, 0, gi, 0, 0); break; }
        case 'phase': if (poses.phaseSolid(g, S.strokes)) for (const r of g.blocks) rect(r[0], r[1], r[2], r[3], SK, K_NORMAL, 0, gi, 0, 0); break;
        case 'door': if (poses.doorClosed(g, tg)) rect(g.x, g.y, g.w, g.h, SM, K_NORMAL, 0, gi, 0, 0); break;
        case 'vanish': if (poses.vanishOn(g, tg)) rect(g.x, g.y, g.w, g.h, SF, K_NORMAL, 0, gi, 0, 0); break;
        case 'liftcup': { const p = poses.liftTop(g, tg); rect(g.x - g.w / 2, p[0], g.w, g.yb - p[0], SURF_IDX.n, K_NORMAL, 0, gi, 0, p[1] * gs); break; }
        case 'crumble': {
          const st = S.dyn[gi];
          if (st >= 0 && !(st > 0 && S.t >= st)) rect(g.x, g.y, g.w, g.h, SK, K_CRUMBLE, g.delay || 0.6, gi, 0, 0);
          else if (st > 0 && S.t >= st) S.dyn[gi] = -1;
          break;
        }
      }
    }
    W.dn = n;
  }

  // contact scratch (valid within one step)
  let fricDone = false, supDot = 0, gdx = 0, gdy = 1, gmag = C.G, hb = 0;

  function contact(W, S, ax, ay, bx, by, th, sfi, kd, pr, p2, gi, bvx, bvy, cx, cy, aw, h, ux, uy) {
    const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy;
    let t = L2 > 0 ? ((S.x - ax) * dx + (S.y - ay) * dy) / L2 : 0;
    if (t < 0) t = 0; else if (t > 1) t = 1;
    const qx = ax + dx * t, qy = ay + dy * t;
    let nx = S.x - qx, ny = S.y - qy;
    const d2 = nx * nx + ny * ny, rr = C.R + th;
    if (d2 >= rr * rr) return false;
    if (kd === K_ONEWAY && (S.x - ax) * ux + (S.y - ay) * uy <= 0) return false;
    let d = Math.sqrt(d2);
    if (d < 1e-6) { nx = ux; ny = uy; d = 0; } else { nx /= d; ny /= d; }
    if (kd === K_ONEWAY && ny > -0.2) return false;
    const sf = SURF_LIST[sfi];
    if (sf.hazard) { S.flag = 1; S.hzKind = sf.name; return true; }
    // body velocity at the contact surface point
    if (aw !== 0) { const sx = qx + nx * th, sy = qy + ny * th; bvx = -aw * (sy - cy); bvy = aw * (sx - cx); }
    let svx = bvx, svy = bvy;
    if (kd === K_CONV) { const L = Math.sqrt(L2) || 1; svx += dx / L * pr; svy += dy / L * pr; }
    let rvx = S.vx - svx, rvy = S.vy - svy;
    let vn = rvx * nx + rvy * ny;
    if ((kd === K_BREAK || kd === K_GLASS) && -vn > pr) {
      S.dyn[gi] = 1; const keep = kd === K_GLASS ? 0.9 : 0.72; S.vx *= keep; S.vy *= keep;
      emit(S, { e: 'break', x: S.x, y: S.y, g: gi });
      return false;
    }
    // skim water: shallow fast impacts skip, otherwise splash
    if (sf.skim) {
      const sp = Math.sqrt(rvx * rvx + rvy * rvy);
      if (!(sp > 420 && -vn < 0.5 * sp)) { S.flag = 1; S.hzKind = 'water'; return true; }
      emit(S, { e: 'skim', x: S.x, y: S.y });
    }
    const pen = rr - d;
    S.x += nx * pen; S.y += ny * pen;
    if (sf.stick) { S.vx = bvx; S.vy = bvy; S.stuck = true; emit(S, { e: 'stick', x: S.x, y: S.y }); return true; }
    if (sf.green) S.touchedGreen = true;
    if (kd === K_CRUMBLE && S.dyn[gi] === 0) { S.dyn[gi] = S.t + pr; emit(S, { e: 'crumble', x: S.x, y: S.y, g: gi }); }
    if (kd === K_SEESAW) W.ssTouch[gi] = S.x;
    const ndot = nx * gdx + ny * gdy; // < 0 : surface faces against gravity (a floor)
    if (vn < 0) {
      let tvx = rvx - vn * nx, tvy = rvy - vn * ny, nvn;
      if (kd === K_PAD) { nvn = Math.max(-vn * 0.8, pr); tvx *= 0.95; tvy *= 0.95; emit(S, { e: 'pad', x: S.x, y: S.y, m: nvn }); }
      else if (-vn > C.BOUNCE_MIN) {
        nvn = -vn * sf.e; tvx *= sf.tan; tvy *= sf.tan;
        if (S.spin && ndot < -0.5) {
          // spin kicks along travel: topspin runs on, backspin bites / checks back
          const tl = Math.hypot(tvx, tvy) || 1, ux2 = tvx / tl, uy2 = tvy / tl;
          const kick = S.spin * C.SPIN_KICK * (S.spin < 0 ? 1.25 : 1);
          tvx += ux2 * kick; tvy += uy2 * kick;
          S.spin *= 0.35; if (Math.abs(S.spin) < 0.05) S.spin = 0;
        }
        emit(S, { e: 'bounce', x: S.x, y: S.y, m: -vn, s: sf.c });
      } else nvn = 0;
      rvx = tvx + nvn * nx; rvy = tvy + nvn * ny;
    }
    if (ndot < -0.2) {
      if (!fricDone) {
        fricDone = true;
        const rn = rvx * nx + rvy * ny;
        let tvx = rvx - rn * nx, tvy = rvy - rn * ny;
        if (kd === K_BOOST) {
          // accelerate along the strip direction, up to its target speed
          const L = Math.sqrt(L2) || 1; let ex = dx / L, ey = dy / L;
          const along = tvx * ex + tvy * ey;
          if (along < p2) { const add = Math.min(p2 - along, pr * h); tvx += ex * add; tvy += ey * add; }
          emit(S, { e: 'boost', x: S.x, y: S.y });
        } else {
          const tl = Math.sqrt(tvx * tvx + tvy * tvy), dec = sf.mu * gmag * hb * (-ndot);
          if (tl <= dec) { tvx = 0; tvy = 0; } else { const k = 1 - dec / tl; tvx *= k; tvy *= k; }
        }
        rvx = tvx + rn * nx; rvy = tvy + rn * ny;
      }
      if (ndot < supDot) { supDot = ndot; S.bvx = bvx; S.bvy = bvy; S.supS = sfi; S.supG = gi; S.supK = kd; }
    }
    S.vx = rvx + svx; S.vy = rvy + svy;
    return true;
  }

  function collideAll(W, S, h) {
    let any = false;
    const c = Math.floor((S.x - W.gx0) / C.CELL), r = Math.floor((S.y - W.gy0) / C.CELL);
    if (c >= 0 && r >= 0 && c < W.gcols && r < W.grows) {
      const k = r * W.gcols + c;
      for (let j = W.goff[k], e = W.goff[k + 1]; j < e; j++) {
        const i = W.gidx[j];
        if (contact(W, S, W.ax[i], W.ay[i], W.bx[i], W.by[i], W.th[i], W.sf[i], W.kd[i], W.pr[i], W.p2[i], -1, 0, 0, 0, 0, 0, h, W.ux[i], W.uy[i])) {
          any = true; if (S.flag || S.stuck) return true;
        }
      }
    }
    const D = W.d;
    for (let i = 0; i < W.dn; i++) {
      const m = C.R + D.th[i] + 2;
      if (S.x < Math.min(D.ax[i], D.bx[i]) - m || S.x > Math.max(D.ax[i], D.bx[i]) + m ||
          S.y < Math.min(D.ay[i], D.by[i]) - m || S.y > Math.max(D.ay[i], D.by[i]) + m) continue;
      if (contact(W, S, D.ax[i], D.ay[i], D.bx[i], D.by[i], D.th[i], D.sf[i], D.kd[i], D.pr[i], D.p2[i], D.gi[i], D.vx[i], D.vy[i], D.cx[i], D.cy[i], D.w[i], h, 0, -1)) {
        any = true; if (S.flag || S.stuck) return true;
      }
    }
    for (let k = 0; k < W.bumpers.length; k++) {
      const g = W.gimmicks[W.bumpers[k]];
      let nx = S.x - g.x, ny = S.y - g.y;
      const rr = C.R + g.r, d2 = nx * nx + ny * ny;
      if (d2 < rr * rr && d2 > 1e-9) {
        const d = Math.sqrt(d2); nx /= d; ny /= d;
        S.x = g.x + nx * rr; S.y = g.y + ny * rr;
        const vn = S.vx * nx + S.vy * ny;
        if (vn < 0) { const out = Math.max(-vn * 0.9, g.boost || 650); S.vx += (-vn + out) * nx; S.vy += (-vn + out) * ny; emit(S, { e: 'bumper', x: S.x, y: S.y, g: W.bumpers[k] }); }
        any = true;
      }
    }
    return any;
  }

  function inRect(g, x, y) { return x >= g.x && x <= g.x + g.w && y >= g.y && y <= g.y + g.h; }

  function ridePoint(rd, d) {
    const { pts, cum } = rd;
    let i = 1; while (i < cum.length - 1 && cum[i] < d) i++;
    const L = cum[i] - cum[i - 1] || 1, u = Math.max(0, Math.min(1, (d - cum[i - 1]) / L));
    const x0 = pts[2 * i - 2], y0 = pts[2 * i - 1], x1 = pts[2 * i], y1 = pts[2 * i + 1];
    return [x0 + (x1 - x0) * u, y0 + (y1 - y0) * u, (x1 - x0) / L, (y1 - y0) / L];
  }

  function triggers(W, S, tg) {
    const R2 = (r) => r * r;
    for (let k = 0; k < W.triggers.length; k++) {
      const gi = W.triggers[k], g = W.gimmicks[gi];
      switch (g.t) {
        case 'gate': {
          if (!S.dyn[gi] && R2(S.x - g.sx) + R2(S.y - g.sy) < R2(C.R + 14)) { S.dyn[gi] = 1; emit(S, { e: 'switch', x: g.sx, y: g.sy, g: gi }); }
          break;
        }
        case 'toggle': {
          if (S.t >= S.dyn2[gi] && R2(S.x - g.sx) + R2(S.y - g.sy) < R2(C.R + 14)) { S.dyn[gi] = S.dyn[gi] ? 0 : 1; S.dyn2[gi] = S.t + 1.0; emit(S, { e: 'switch', x: g.sx, y: g.sy, g: gi }); }
          break;
        }
        case 'tokens': {
          const n = g.pts.length >> 1, rr = R2((g.r || 16) + C.R);
          for (let i = 0; i < n; i++) if (!(S.dyn[gi] & (1 << i)) && R2(S.x - g.pts[2 * i]) + R2(S.y - g.pts[2 * i + 1]) < rr) {
            S.dyn[gi] |= (1 << i); emit(S, { e: 'token', x: g.pts[2 * i], y: g.pts[2 * i + 1], g: gi, i, all: S.dyn[gi] === (1 << n) - 1 });
          }
          break;
        }
        case 'mine': {
          if (!S.dyn[gi] && R2(S.x - g.x) + R2(S.y - g.y) < R2(g.r || 40)) {
            S.dyn[gi] = 1;
            let dx = S.x - g.x, dy = S.y - g.y; const d = Math.hypot(dx, dy);
            if (d < 1) { dx = 0; dy = -1; } else { dx /= d; dy /= d; }
            S.vx += dx * (g.imp || 900); S.vy += dy * (g.imp || 900);
            emit(S, { e: 'boom', x: g.x, y: g.y, g: gi });
          }
          break;
        }
        case 'ring': {
          if (S.t >= S.dyn2[gi] && R2(S.x - g.x) + R2(S.y - g.y) < R2(g.r || 30)) {
            const sp = Math.max(Math.hypot(S.vx, S.vy) * (g.mul || 1.4), g.min || 500);
            S.vx = Math.cos(g.ang) * sp; S.vy = Math.sin(g.ang) * sp; S.dyn2[gi] = S.t + 0.4;
            emit(S, { e: 'ring', x: g.x, y: g.y, g: gi });
          }
          break;
        }
        case 'bubble': {
          if (S.bub < 0 && S.t >= S.dyn[gi] && R2(S.x - g.x) + R2(S.y - g.y) < R2((g.r || 26) + C.R)) {
            S.bub = gi; S.bubT = S.t + (g.T || 3); S.dyn[gi] = S.t + (g.T || 3) + 2.5;
            S.x = g.x; S.y = g.y;
            emit(S, { e: 'bubble', x: g.x, y: g.y, g: gi });
            return true;
          }
          break;
        }
        case 'zipline': case 'pipe': {
          if (S.ride < 0 && S.t >= S.dyn2[gi]) {
            const rd = W.rides[gi], sx = rd.pts[0], sy = rd.pts[1] + (g.t === 'zipline' ? 12 : 0);
            if (R2(S.x - sx) + R2(S.y - sy) < R2(g.r || 22)) {
              S.ride = gi; S.rideD = 0;
              S.rideV = g.t === 'zipline' ? (g.sp || 500) : Math.max(g.sp || 400, Math.hypot(S.vx, S.vy));
              emit(S, { e: 'ride', x: S.x, y: S.y, g: gi });
              return true;
            }
          }
          break;
        }
        case 'cannon': {
          if (S.cannon < 0 && S.t >= S.cnCool && R2(S.x - g.x) + R2(S.y - g.y) < R2(g.r || 20)) {
            S.cannon = gi; S.cannonT = S.t; S.x = g.x; S.y = g.y; S.vx = 0; S.vy = 0;
            emit(S, { e: 'load', x: g.x, y: g.y, g: gi });
            return true;
          }
          break;
        }
        case 'teleport': case 'portal': {
          if (S.t < S.tpCool) break;
          const r = g.r || 22;
          let from = 0;
          if (R2(S.x - g.x) + R2(S.y - g.y) < r * r) from = 1;
          else if (R2(S.x - g.x2) + R2(S.y - g.y2) < r * r) from = 2;
          if (!from) break;
          const ox = from === 1 ? g.x2 : g.x, oy = from === 1 ? g.y2 : g.y;
          emit(S, { e: 'teleport', x: S.x, y: S.y, x2: ox, y2: oy, g: gi });
          S.x = ox; S.y = oy; S.tpCool = S.t + 0.7;
          if (g.t === 'portal') { const a = from === 1 ? g.a2 : g.a, sp = Math.max(260, Math.hypot(S.vx, S.vy)); S.vx = Math.cos(a) * sp; S.vy = Math.sin(a) * sp; }
          return true;
        }
      }
    }
    return false;
  }

  function stepSeesaws(W, S, dt) {
    for (const gi of W.seesaws) {
      const g = W.gimmicks[gi], tx = W.ssTouch[gi];
      let a = S.dyn[gi], w = S.dyn2[gi];
      const torque = tx !== undefined ? (tx - g.x) * (g.k || 0.06) : 0;
      w += (torque - 2.2 * w - 2.5 * a) * dt;
      a += w * dt;
      const m = g.max || 0.38;
      if (a > m) { a = m; if (w > 0) w = 0; } else if (a < -m) { a = -m; if (w < 0) w = 0; }
      S.dyn[gi] = a; S.dyn2[gi] = w;
      W.ssTouch[gi] = undefined;
    }
  }

  // ---- cup capture checks. returns true if holed / hazard handled ----
  function cupCheck(W, S, prevY) {
    const cup = cupState(W, S);
    if (cup.open) {
      const dx = S.x - cup.x, mouth = cup.y - C.R - 1;
      // drop straight into the mouth (a "swish" if the green wasn't touched this shot)
      if (S.vy - cup.vy > 0 && Math.abs(dx) < cup.w / 2 - 1.5 && prevY < mouth && S.y >= mouth && S.y < mouth + 24 &&
          Math.hypot(S.vx, S.vy - cup.vy) < C.DROP_SPEED) {
        holeOut(S, cup, !S.touchedGreen && !S.putt);
        return true;
      }
      const dy = S.y - (cup.y - C.R), rvx = S.vx - S.bvx, rvy = S.vy - S.bvy;
      if ((S.contact <= 2 || S.vy <= 0) && Math.abs(dx) < cup.w / 2 - 1 && Math.abs(dy) < C.R + 5 && rvx * rvx + rvy * rvy < C.CAPTURE_SPEED * C.CAPTURE_SPEED) {
        holeOut(S, cup, false);
        return true;
      }
    }
    for (const gi of W.decoys) {
      const g = W.gimmicks[gi];
      for (let i = 0; i < g.pts.length; i += 2) {
        const dx = S.x - g.pts[i], dy = S.y - (g.pts[i + 1] - C.R);
        if (Math.abs(dx) < 14 && Math.abs(dy) < C.R + 5 && S.vx * S.vx + S.vy * S.vy < C.DROP_SPEED * C.DROP_SPEED) {
          hazardReset(W, S, 'decoy'); return true;
        }
      }
    }
    return false;
  }
  function holeOut(S, cup, swish) {
    S.holed = true; S.rest = true; S.x = cup.x; S.y = cup.y + 4; S.vx = 0; S.vy = 0;
    if (swish) { S.swish = true; S.bonus += 1; emit(S, { e: 'swish', x: cup.x, y: cup.y }); }
    emit(S, { e: 'holed', x: cup.x, y: cup.y, swish });
  }

  // One fixed step. Returns 0 normal, 1 holed, 2 hazard-reset, 3 came to rest, 4 hole failed (flood)
  function step(W, S) {
    if (S.holed) return 1;
    if (S.failed) return 4;
    const dt = C.DT;
    S.t += dt;
    if (S.hold) { if (W.seesaws.length) stepSeesaws(W, S, dt); return 0; }
    const tg = S.t * W.opts.gspeed;
    S.shotT += dt;
    // ---- captured states ----
    if (S.cannon >= 0) {
      const g = W.gimmicks[S.cannon];
      S.x = g.x; S.y = g.y; S.vx = 0; S.vy = 0;
      if (S.t - S.cannonT >= 0.4) {
        const a = poses.cannonAngle(g, tg);
        S.vx = Math.cos(a) * g.sp; S.vy = Math.sin(a) * g.sp;
        S.x += Math.cos(a) * ((g.r || 20) + 2); S.y += Math.sin(a) * ((g.r || 20) + 2);
        emit(S, { e: 'fire', x: g.x, y: g.y, a, g: S.cannon });
        S.cannon = -1; S.cnCool = S.t + 0.6;
      }
      return 0;
    }
    if (S.ride >= 0) {
      const g = W.gimmicks[S.ride], rd = W.rides[S.ride];
      S.rideD += S.rideV * dt;
      const p = ridePoint(rd, Math.min(S.rideD, rd.total)), hang = g.t === 'zipline' ? 12 : 0;
      S.x = p[0]; S.y = p[1] + hang; S.vx = p[2] * S.rideV; S.vy = p[3] * S.rideV;
      if (S.rideD >= rd.total) { emit(S, { e: 'unride', x: S.x, y: S.y, g: S.ride }); S.dyn2[S.ride] = S.t + 0.6; S.ride = -1; }
      return 0;
    }
    if (S.stuck) { if (!S.rest) { S.rest = true; return 3; } return 0; }
    // ---- forces ----
    let gx = 0, gy = C.G, ax = 0, ay = 0, ts = 1, damp = 0, pool = -1, poolCur = 0, gmul = 1;
    const air = S.contact > 2;
    for (let k = 0; k < W.fields.length; k++) {
      const g = W.gimmicks[W.fields[k]];
      switch (g.t) {
        case 'wind': if (air && inRect(g, S.x, S.y)) { const f = poses.windFactor(g, tg) * W.opts.windMul; ax += g.ax * f; ay += (g.ay || 0) * f; } break;
        case 'fan': if (inRect(g, S.x, S.y)) { ax += Math.cos(g.ang) * g.a; ay += Math.sin(g.ang) * g.a; } break;
        case 'geyser': if (poses.geyserOn(g, tg) && S.x > g.x - g.w / 2 && S.x < g.x + g.w / 2 && S.y < g.y + 4 && S.y > g.y - g.h) ay -= g.a || 2200; break;
        case 'tornado': {
          const cx = poses.tornadoX(g, tg);
          if (S.x > cx - g.w / 2 && S.x < cx + g.w / 2 && S.y < g.y + 4 && S.y > g.y - g.h) { ay -= g.a || 1500; ax += (cx - S.x) * 6; }
          break;
        }
        case 'lowgrav': case 'antigrav': if (inRect(g, S.x, S.y)) gmul = g.g; break;
        case 'sidegrav': if (inRect(g, S.x, S.y)) { gx = g.gx; gy = g.gy; } break;
        case 'slowmo': if (inRect(g, S.x, S.y)) ts = Math.min(ts, g.f || 0.4); break;
        case 'drag': if (inRect(g, S.x, S.y)) damp += g.k || 2.5; break;
        case 'floatpool': if (S.x > g.x && S.x < g.x + g.w && S.y > g.y - C.R && S.y < g.y + g.h) { pool = W.fields[k]; poolCur = g.cur || 0; } break;
        case 'gwell': case 'blackhole': {
          const dx = g.x - S.x, dy = g.y - S.y, d = Math.sqrt(dx * dx + dy * dy);
          if (g.t === 'blackhole' && d < (g.core || 16) + C.R) { hazardReset(W, S, 'void'); return 2; }
          if (d < g.r && d > 10) { const f = g.k * (1 - d / g.r) / d; ax += dx * f; ay += dy * f; }
          break;
        }
        case 'magnet': {
          const ex = g.x2 - g.x, ey = g.y2 - g.y, L2 = ex * ex + ey * ey;
          let u = L2 ? ((S.x - g.x) * ex + (S.y - g.y) * ey) / L2 : 0; u = Math.max(0, Math.min(1, u));
          const dx = g.x + ex * u - S.x, dy = g.y + ey * u - S.y, d = Math.sqrt(dx * dx + dy * dy);
          if (d < g.r && d > 1) { const f = g.k * (1 - 0.5 * d / g.r) / d; ax += dx * f; ay += dy * f; }
          break;
        }
      }
    }
    if (air) for (let k = 0; k < W.globalWind.length; k++) {
      const g = W.gimmicks[W.globalWind[k]], f = poses.windFactor(g, tg) * W.opts.windMul;
      ax += g.ax * f; ay += (g.ay || 0) * f;
    }
    gx *= gmul; gy *= gmul;
    const dtb = dt * ts; // ball-local time (slow-mo zones)
    let poolSupport = false;
    if (S.bub >= 0) {
      const g = W.gimmicks[S.bub];
      S.vx = g.dx || 0; S.vy = g.vy || -150;
      if (S.t >= S.bubT) { emit(S, { e: 'pop', x: S.x, y: S.y }); S.bub = -1; }
    } else {
      S.vx += (gx + ax) * dtb; S.vy += (gy + ay) * dtb;
      // spin (Magnus): backspin lifts, topspin dives — airborne only
      if (S.spin && air) {
        const sp = Math.hypot(S.vx, S.vy);
        if (sp > 50) {
          const dir = S.vx >= 0 ? 1 : -1;            // lift normal = "up" relative to travel
          const nx = dir * S.vy / sp, ny = -dir * S.vx / sp;
          const a = -S.spin * C.MAGNUS * sp;
          S.vx += nx * a * dtb; S.vy += ny * a * dtb;
        }
      }
      if (damp) { const k = Math.exp(-damp * dtb); S.vx *= k; S.vy *= k; }
      if (pool >= 0) {
        const g = W.gimmicks[pool], sub = Math.max(0, Math.min(1, (S.y - g.y + C.R) / (2 * C.R)));
        S.vy -= (g.b || 1900) * sub * dtb;
        const k = Math.exp(-3.2 * sub * dtb); S.vy *= k;
        S.vx += (poolCur - S.vx) * Math.min(1, 2.4 * sub * dtb);
        if (sub > 0.3 && Math.abs(S.vx - poolCur) < 15 && Math.abs(S.vy) < 15) poolSupport = true;
      }
    }
    let sp = Math.sqrt(S.vx * S.vx + S.vy * S.vy);
    if (sp > C.SPEED_CAP) { S.vx *= C.SPEED_CAP / sp; S.vy *= C.SPEED_CAP / sp; sp = C.SPEED_CAP; }
    // gravity direction for friction / rest
    const gl = Math.hypot(gx, gy);
    if (gl > 40) { gdx = gx / gl; gdy = gy / gl; gmag = gl; } else { gdx = 0; gdy = 1; gmag = 0; }
    // ---- substeps ----
    let n = Math.ceil(sp * dtb / (C.R * 0.45)); if (n < 1) n = 1; else if (n > 14) n = 14;
    if (W.dynG.length && n < 2) n = 2;
    const h = dt / n; hb = dtb / n;
    let touched = false;
    supDot = 0; S.supS = -1; S.supG = -1; S.supK = 0;
    for (let k = 0; k < n; k++) {
      const py = S.y;
      S.x += S.vx * hb; S.y += S.vy * hb;
      if (W.dynG.length) buildDyn(W, S, (S.t - dt + (k + 1) * h) * W.opts.gspeed);
      if (cupCheck(W, S, py)) return S.holed ? 1 : 2;
      fricDone = false;
      if (collideAll(W, S, h)) touched = true;
      if (S.flag === 1) { hazardReset(W, S, S.hzKind); return 2; }
      if (S.stuck) break;
      if (S.bub >= 0 && touched) { emit(S, { e: 'pop', x: S.x, y: S.y }); S.bub = -1; }
      if (W.triggers.length && triggers(W, S, tg)) break;
      if (W.flood && S.y > poses.floodLevel(W.flood, S.strokes)) { hazardReset(W, S, 'water'); return 2; }
    }
    if (supDot === 0) { S.bvx = 0; S.bvy = 0; }
    if (poolSupport) { S.bvx = poolCur; S.bvy = 0; supDot = -1; touched = true; }
    if (W.seesaws.length) stepSeesaws(W, S, dt);
    S.contact = touched ? 0 : S.contact + 1;
    if (S.x < -60 || S.x > W.w + 60 || S.y > W.h + 120) { hazardReset(W, S, 'oob'); return 2; }
    if (cupCheck(W, S, S.y)) return S.holed ? 1 : 2;
    // ---- rest ----
    if (S.stuck) { S.rest = true; return 3; }
    if (S.bub >= 0 || S.cannon >= 0 || S.ride >= 0) return 0;
    const rvx = S.vx - S.bvx, rvy = S.vy - S.bvy, rs2 = rvx * rvx + rvy * rvy;
    let pending = false;
    for (let k = 0; k < W.crumbles.length; k++) if (S.dyn[W.crumbles[k]] > 0) { pending = true; break; }
    if (S.contact === 0 && supDot < -0.3 && rs2 < C.REST_SPEED * C.REST_SPEED && !pending) {
      S.restT += dt;
      if (!S.rest && S.restT >= C.REST_TIME) {
        if (S.supK === K_CAT) {
          // catapult plate: arm, then fling
          if (!S.catT) { S.catT = S.t + (W.gimmicks[S.supG].delay || 0.5); emit(S, { e: 'arm', x: S.x, y: S.y, g: S.supG }); }
          else if (S.t >= S.catT) {
            const g = W.gimmicks[S.supG];
            S.vx = Math.cos(g.ang) * g.sp; S.vy = Math.sin(g.ang) * g.sp; S.y -= 2; S.catT = 0; S.restT = 0; S.contact = 3;
            emit(S, { e: 'catapult', x: S.x, y: S.y, g: S.supG });
          }
          return 0;
        }
        if (SURF_LIST[S.supS] && SURF_LIST[S.supS].sink) {
          if (!S.sinkT) { S.sinkT = S.t + 0.6; emit(S, { e: 'sink', x: S.x, y: S.y }); }
          else if (S.t >= S.sinkT) { hazardReset(W, S, 'quicksand'); return 2; }
          return 0;
        }
        S.rest = true; return 3;
      }
    } else {
      S.restT = 0;
      if (S.rest && (S.contact > 12 || rs2 > 16 * C.REST_SPEED * C.REST_SPEED)) S.rest = false;
    }
    if (!S.rest && S.shotT > C.MAX_SHOT_TIME) {
      if (S.contact < 6 && !(SURF_LIST[S.supS] && SURF_LIST[S.supS].sink)) { S.rest = true; S.vx = S.bvx; S.vy = S.bvy; return 3; }
      hazardReset(W, S, 'timeout'); return 2;
    }
    return 0;
  }

  // Simulate a whole shot from a resting state (mutates S). Returns 'holed'|'rest'|'hazard'|'fail'.
  function simulateShot(W, S, angle, power, spin, maxT) {
    shoot(W, S, angle, power, spin);
    if (S.failed) return 'fail';
    const lim = Math.ceil((maxT || C.MAX_SHOT_TIME + 2) / C.DT);
    for (let i = 0; i < lim; i++) {
      const r = step(W, S);
      if (r === 1) return 'holed';
      if (r === 2) return 'hazard';
      if (r === 3) return 'rest';
      if (r === 4) return 'fail';
    }
    return 'rest';
  }

  // ---------- geometry helpers ----------
  function groundY(hole, x) {
    const g = hole.ground;
    let lo = 0, hi = (g.length >> 1) - 1;
    if (x <= g[0]) return g[1];
    if (x >= g[2 * hi]) return g[2 * hi + 1];
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (g[2 * m] <= x) lo = m; else hi = m; }
    const x0 = g[2 * lo], y0 = g[2 * lo + 1], x1 = g[2 * hi], y1 = g[2 * hi + 1];
    return x1 === x0 ? Math.min(y0, y1) : y0 + (y1 - y0) * (x - x0) / (x1 - x0);
  }
  function pointInPoly(p, x, y) {
    let inside = false; const n = p.length >> 1;
    for (let i = 0, j = n - 1; i < n; j = i++) {
      const xi = p[2 * i], yi = p[2 * i + 1], xj = p[2 * j], yj = p[2 * j + 1];
      if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  }
  function insideSolid(hole, x, y) {
    if (y > groundY(hole, x) + 0.5) return true;
    for (const so of hole.solids || []) if (pointInPoly(so.p, x, y)) return true;
    return false;
  }
  function clearance(W, x, y) {
    let best = 1e9;
    for (let i = 0; i < W.ax.length; i++) {
      const ax = W.ax[i], ay = W.ay[i], dx = W.bx[i] - ax, dy = W.by[i] - ay, L2 = dx * dx + dy * dy;
      let t = L2 > 0 ? ((x - ax) * dx + (y - ay) * dy) / L2 : 0; t = Math.max(0, Math.min(1, t));
      const d = Math.hypot(x - ax - dx * t, y - ay - dy * t) - W.th[i];
      if (d < best) best = d;
    }
    return best;
  }

  return {
    C, SURF, SURF_LIST, SURF_IDX, surfIndex, GIMMICK_TYPES, poses, isPutt,
    createWorld, initState, cloneState, shoot, step, simulateShot, cupState, hazardReset, buildDyn,
    groundY, insideSolid, pointInPoly, clearance, rectSegs, ridePoint,
  };
});
