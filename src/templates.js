/*
 * Terrain builder + lead-in layouts ("wrappers") + basic-golf pieces.
 *
 * A hole is built left→right:  tee → wrapper.lead → piece → wrapper.mid → piece … → (goal piece | approach + green) → end.
 * Pieces (gimmick set-pieces) live in src/designs/*.js and are registered with GOLF.Designs.
 *
 * Useful numbers: full-power shot ≈ 1600px flat range, ≈ 800px max apex. A wall taller than ~950px or a
 * chasm wider than ~1900px cannot be cleared by a normal shot — perfect for making a gimmick mandatory.
 */
(function (root, factory) {
  const isNode = typeof module === 'object' && module.exports;
  const P = isNode ? require('./physics.js') : root.GOLF.Physics;
  const mod = factory(P);
  if (isNode) module.exports = mod;
  else { root.GOLF = root.GOLF || {}; root.GOLF.Templates = mod; }
})(typeof self !== 'undefined' ? self : this, function (P) {
  'use strict';
  const R = P.C.R;
  const Y0 = 1000;
  const MAX_APEX = 800, MAX_RANGE = 1600;

  const STYLE = {
    rolling: { amp: 28, wl: 420, cliff: 1 },
    hills: { amp: 70, wl: 640, cliff: 1.15 },
    cliffs: { amp: 18, wl: 380, cliff: 1.5 },
    caves: { amp: 18, wl: 360, cliff: 1 },
    islands: { amp: 24, wl: 420, cliff: 1 },
    canyon: { amp: 26, wl: 460, cliff: 1.3, deep: 1.25 },
    dunes: { amp: 48, wl: 300, cliff: 1, asym: true },
    terraces: { amp: 0, wl: 400, cliff: 1.2, steps: true },
    spires: { amp: 16, wl: 400, cliff: 1.1 },
    mesa: { amp: 4, wl: 400, cliff: 1.4 },
  };

  function makeBuilder(ctx) {
    const rng = ctx.rng, st = STYLE[ctx.style] || STYLE.rolling, d = ctx.d;
    const B = { pts: [], gs: [], solids: [], gm: [], sigIdx: [], x: 0, y: Y0, ctx, st, tee: null, cup: null, green: null, notes: {}, parExtra: 0, Y0, MAX_APEX, MAX_RANGE };
    const sm = ctx.sMain, sa = ctx.sAlt, hz = ctx.hzChar;
    B.rng = rng; B.d = d; B.hz = hz; B.sMain = sm; B.sAlt = sa;
    B.to = (x, y, s) => { if (x <= B.x + 0.5) x = B.x + 1; B.pts.push(x, y); B.gs.push(s); B.x = x; B.y = y; };
    B.start = (x, y) => { B.pts = [x, y]; B.gs = []; B.x = x; B.y = y; };
    // add a gimmick; returns its index. Instances of the hole's signature gimmick are recorded in sigIdx.
    B.add = (g, sig) => { B.gm.push(g); const i = B.gm.length - 1; if (sig !== false && g.t === ctx.sig) B.sigIdx.push(i); return i; };
    B.addSolid = (p, s) => { B.solids.push({ p: p.map((v) => Math.round(v)), s: s || 'k' }); };
    // ground height of already-built terrain at x
    B.gy = (x) => {
      const p = B.pts; let lo = 0, hi = (p.length >> 1) - 1;
      if (x <= p[0]) return p[1];
      if (x >= p[2 * hi]) return p[2 * hi + 1];
      while (hi - lo > 1) { const m = (lo + hi) >> 1; if (p[2 * m] <= x) lo = m; else hi = m; }
      const x0 = p[2 * lo], y0 = p[2 * lo + 1], x1 = p[2 * hi], y1 = p[2 * hi + 1];
      return x1 === x0 ? Math.min(y0, y1) : y0 + (y1 - y0) * (x - x0) / (x1 - x0);
    };
    B.terrain = (len, dy, s, opt) => {
      opt = opt || {}; s = s || sm; len = Math.max(40, len);
      if (st.steps && Math.abs(dy) > 50 && !opt.smooth) {
        const k = Math.max(2, Math.round(Math.abs(dy) / 55)), seg = len / k, sy = dy / k;
        for (let i = 0; i < k; i++) { B.to(B.x + seg * 0.72, B.y, s); B.to(B.x + seg * 0.28, B.y + sy, Math.abs(sy) > seg * 0.35 ? 'k' : s); }
        return;
      }
      const amp = (opt.amp !== undefined ? opt.amp : st.amp) * (ctx.hard ? 1.2 : 1);
      const x0 = B.x, y0 = B.y, n = Math.max(2, Math.round(len / 50));
      const ph1 = rng.float(0, 6.28), ph2 = rng.float(0, 6.28), wl = st.wl * rng.float(0.8, 1.25);
      const patch = opt.noPatch ? null : (rng.chance(0.4) ? [rng.float(0.15, 0.4), rng.float(0.55, 0.85)] : null);
      for (let i = 1; i <= n; i++) {
        const t = i / n;
        const base = y0 + dy * (0.5 - 0.5 * Math.cos(Math.PI * t));
        let w1 = Math.sin(t * len / wl * 6.283 + ph1); if (st.asym) w1 = (w1 > 0 ? w1 * 0.6 : w1 * 1.3);
        const noise = amp * Math.sin(Math.PI * t) * (w1 * 0.7 + 0.3 * Math.sin(t * len / (wl * 0.43) * 6.283 + ph2));
        const x = x0 + len * t, y = base + noise;
        const ss = (patch && t > patch[0] && t <= patch[1]) ? sa : s;
        B.to(x, y, Math.abs(y - B.y) > Math.abs(x - B.x) * 1.25 ? 'k' : ss);
      }
    };
    B.flat = (len, s) => B.to(B.x + Math.max(10, len), B.y, s || sm);
    B.cliff = (dy) => B.to(B.x + Math.max(8, Math.abs(dy) * 0.06), B.y + dy, 'k');
    B.wallUp = (h) => B.cliff(-h);
    B.pit = (width, depth, opt) => {
      opt = opt || {}; width = Math.max(70, width); depth = (depth || 320) * (st.deep || 1);
      const x0 = B.x, y0 = B.y, fy = y0 + depth;
      B.to(x0 + 10, fy, 'k'); B.to(x0 + width - 10, fy, opt.floor || hz); B.to(x0 + width, y0 + (opt.dyEnd || 0), 'k');
      return { x0, x1: B.x, y0, y1: B.y, y: Math.min(y0, B.y), fy };
    };
    B.chasm = (width, depth, opt) => B.pit(width, depth || 380, opt);
    B.bunker = (len) => { const y0 = B.y; B.to(B.x + 24, y0 + 22, 's'); B.to(B.x + len - 48, y0 + 26, 's'); B.to(B.x + 24, y0, 's'); };
    B.puddle = (len) => { B.pit(len, 44, { floor: hz === 'r' ? 'r' : hz }); };
    B.run = (len, dy, s) => {
      if (len > 420 && ctx.hazardDensity > 0 && rng.chance(0.2 + 0.4 * ctx.hazardDensity)) {
        const a = len * rng.float(0.3, 0.5);
        B.terrain(a, dy * 0.5, s);
        if (rng.chance(0.55)) B.bunker(rng.float(90, 150)); else B.puddle(rng.float(70, 120 + 60 * d));
        B.terrain(Math.max(60, len - a - 120), dy * 0.5, s);
      } else B.terrain(len, dy, s);
    };
    // tunnel through a mountain too tall to fly over (peak ~1000 above floor)
    B.corridor = (len, opt) => {
      opt = opt || {};
      const hgt = opt.h || rng.float(100, 140);
      B.flat(30);
      const fx0 = B.x, fy = B.y;
      B.to(B.x + len, B.y, opt.s || sm);
      const fx1 = B.x; B.flat(30);
      const top = fy - hgt, mid = (fx0 + fx1) / 2, peak = fy - (opt.peak || rng.float(960, 1060)), sh = Math.min(140, (fx1 - fx0) / 3);
      B.addSolid([fx0, top, fx1, top, fx1 + 50, top - 110, mid + sh, peak, mid - sh, peak - 20, fx0 - 50, top - 110]);
      return { x0: fx0, x1: fx1, y: fy, top };
    };
    // sealed vault (walls + roof): ball can only get in by teleport/pipe/etc. Contains a green + cup.
    B.vault = (len, opt) => {
      opt = opt || {};
      const hgt = opt.h || 170;
      B.flat(20);
      const x0 = B.x, fy = B.y;
      B.to(B.x + 30, B.y, 'r');
      const gx0 = B.x; B.to(B.x + len - 60, B.y, 'n'); const gx1 = B.x;
      B.to(B.x + 30, B.y, 'r');
      const x1 = B.x, top = fy - hgt;
      B.addSolid([x0 - 30, fy + 40, x0, fy + 40, x0, top, x0 - 30, top]);
      B.addSolid([x1, fy + 40, x1 + 30, fy + 40, x1 + 30, top, x1, top]);
      B.addSolid([x0 - 40, top, x1 + 40, top, x1 + 40, top - 60, x0 - 40, top - 60]);
      B.cup = [gx0 + (gx1 - gx0) * (opt.cupFrac || 0.6), fy];
      B.green = [gx0, gx1, fy];
      B.flat(40);
      return { x0, x1, y: fy, top, inX: x0 + 40, gx0, gx1 };
    };
    // flat putting green with the cup (n surface)
    B.greenFlat = (len, opt) => {
      opt = opt || {};
      len = Math.max(len || 240, ctx.wideGreen ? 440 : 0);
      const x0 = B.x; B.to(B.x + len, B.y, 'n');
      B.cup = [x0 + len * (opt.cupFrac || ctx.cupFrac || 0.5), B.y]; B.green = [x0, B.x, B.y];
    };
    // floating island (solid polygon); top surface s (default main)
    B.island = (x0, x1, y, s, thick) => {
      thick = thick || 70; const m = (x0 + x1) / 2;
      B.addSolid([x0, y, x1, y, x1 - 14, y + thick * 0.45, m + (x1 - x0) * 0.15, y + thick, m - (x1 - x0) * 0.2, y + thick * 0.85, x0 + 14, y + thick * 0.4], (s || sm) + 'kkkkk');
      return [x0, x1, y];
    };
    // island carrying the green + cup
    B.islandGreen = (x0, x1, y, thick) => { B.island(x0, x1, y, 'n', thick || 80); B.cup = [(x0 + x1) / 2 + rng.float(-20, 20), y]; B.green = [x0, x1, y]; };
    // speed for a ballistic arc from (x,y) through (tx,ty) at elevation th (radians, >0 = upward)
    B.ballistic = (x, y, tx, ty, th) => {
      const dx = tx - x, dy = ty - y, den = 2 * Math.cos(th) * Math.cos(th) * (dy + dx * Math.tan(th));
      return den > 0 ? Math.sqrt(P.C.G * dx * dx / den) : NaN;
    };
    // after the hole is built, tune gimmick field `key` (e.g. cannon 'sp') so the launch lands in [x0,x1] above ymax
    B.tune = (gi, key, lo, hi, x0, x1, ymax) => { B.post.push((BB, hole) => { B.tuneOk = ctx.tuneLaunch(hole, gi, key, lo, hi, x0, x1, ymax); }); };
    B.teeBox = (y) => { B.start(0, y - 520); B.to(14, y, 'k'); B.flat(280, 'f'); B.tee = [170, y - R]; };
    B.end = () => { B.terrain(rng.float(200, 280), -rng.float(80, 160), 'r', { noPatch: true, amp: 10 }); B.to(B.x + 12, B.y - 520, 'k'); };
    return B;
  }

  // ---------------- wrappers (lead-in / between) ----------------
  const len = (c, f) => (500 + 900 * c.d) * f;
  const WRAPPERS = [
    { id: 'meadow', ty: 0, lead: (B, c) => B.run(len(c, 0.8), c.rng.float(-50, 50)), mid: (B, c) => B.terrain(len(c, 0.5), c.rng.float(-40, 40)) },
    { id: 'valley', ty: -80, lead: (B, c) => { B.terrain(len(c, 0.5), 220); B.terrain(len(c, 0.5), -200); }, mid: (B, c) => B.terrain(len(c, 0.5), c.rng.float(-60, 60)) },
    { id: 'hillside', ty: 140, lead: (B, c) => B.terrain(len(c, 0.9), -c.rng.float(140, 260)), mid: (B, c) => B.terrain(len(c, 0.4), -60) },
    { id: 'downhill', ty: -320, lead: (B, c) => B.terrain(len(c, 0.9), c.rng.float(260, 360), null, { noPatch: true }), mid: (B, c) => B.terrain(len(c, 0.4), 40) },
    { id: 'stairs', ty: 220, lead: (B, c) => { for (let i = 0; i < 3; i++) { B.flat(c.rng.float(140, 220)); B.cliff(-70 * B.st.cliff); } }, mid: (B) => { B.flat(160); B.cliff(-60); B.flat(120); } },
    { id: 'stepsdown', ty: -240, lead: (B, c) => { for (let i = 0; i < 3; i++) { B.flat(c.rng.float(150, 230)); B.cliff(70 * B.st.cliff); } }, mid: (B) => { B.flat(140); B.cliff(50); B.flat(120); } },
    { id: 'bunkered', ty: 0, lead: (B, c) => { B.terrain(len(c, 0.3), 0); B.bunker(130); B.terrain(len(c, 0.3), c.rng.float(-40, 40)); B.bunker(110); B.flat(80); }, mid: (B) => { B.flat(120); B.bunker(120); B.flat(120); } },
    { id: 'watercarry', ty: 0, lead: (B, c) => { B.flat(len(c, 0.3)); B.pit(c.rng.float(160, 260), 160); B.terrain(len(c, 0.4), c.rng.float(-50, 30)); }, mid: (B) => { B.flat(140); B.puddle(110); B.flat(120); } },
    { id: 'dunes', ty: 0, lead: (B, c) => { B.terrain(len(c, 0.45), -90, null, { amp: 50 }); B.terrain(len(c, 0.45), 90, null, { amp: 50 }); }, mid: (B, c) => B.terrain(len(c, 0.5), 0, null, { amp: 45 }) },
    { id: 'ridge', ty: 0, lead: (B, c) => { const h = c.rng.float(180, 300); B.terrain(len(c, 0.45), -h); B.flat(60); B.terrain(len(c, 0.45), h - 30); }, mid: (B, c) => B.terrain(len(c, 0.4), c.rng.float(-40, 40)) },
    { id: 'shelf', ty: -150, lead: (B, c) => { B.flat(len(c, 0.4)); B.cliff(150); B.terrain(len(c, 0.45), c.rng.float(-30, 30)); }, mid: (B, c) => { B.flat(120); B.cliff(c.rng.float(-80, 80)); B.flat(120); } },
    { id: 'rollers', ty: 0, lead: (B, c) => { for (let i = 0; i < 3; i++) B.terrain(len(c, 0.3), (i % 2 ? 1 : -1) * c.rng.float(40, 90), null, { amp: 20 }); }, mid: (B, c) => B.terrain(len(c, 0.4), c.rng.float(-50, 50)) },
    { id: 'climb', ty: 260, lead: (B, c) => { B.terrain(len(c, 0.5), -140); B.flat(120); B.terrain(len(c, 0.5), -140); }, mid: (B, c) => B.terrain(len(c, 0.4), -50) },
    { id: 'rimdrop', ty: -300, lead: (B, c) => { B.flat(len(c, 0.3)); B.cliff(220); B.terrain(len(c, 0.5), c.rng.float(20, 80)); }, mid: (B, c) => { B.flat(140); B.cliff(60); B.flat(100); } },
    { id: 'longflat', ty: 0, lead: (B, c) => { B.flat(len(c, 0.4)); B.bunker(120); B.flat(len(c, 0.4)); }, mid: (B) => B.flat(260) },
    { id: 'saddle', ty: -100, lead: (B, c) => { B.terrain(len(c, 0.35), 160); B.flat(80); B.terrain(len(c, 0.35), -140); B.flat(80); }, mid: (B, c) => B.terrain(len(c, 0.4), c.rng.float(-30, 30)) },
    { id: 'ledges', ty: 120, lead: (B, c) => { for (let i = 0; i < 2; i++) { B.terrain(len(c, 0.3), 0, null, { amp: 10 }); B.cliff(-90); } B.flat(120); }, mid: (B) => { B.flat(120); B.cliff(-50); B.flat(140); } },
    { id: 'chute', ty: -200, lead: (B, c) => { B.terrain(len(c, 0.6), 200, null, { smooth: true, noPatch: true }); B.terrain(160, -40, null, { smooth: true }); B.flat(100); }, mid: (B, c) => B.terrain(len(c, 0.4), 30) },
  ];
  const WRAP = {}; WRAPPERS.forEach((w) => { WRAP[w.id] = w; });

  // ---------------- basic golf pieces (course 1, fillers, Endless with no gimmicks) ----------------
  // piece: { id, goal (builds the green + cup itself), build(B, c) }
  const BASIC = [
    { id: 'creek', build: (B, c) => { B.flat(120); B.pit(c.rng.float(220, 360) + 300 * c.d, 280); B.flat(160); } },
    { id: 'bunkerline', build: (B, c) => { for (let i = 0; i < 2 + Math.round(2 * c.d); i++) { B.terrain(c.rng.float(140, 260), c.rng.float(-30, 30)); B.bunker(c.rng.float(100, 160)); } } },
    { id: 'hump', build: (B, c) => { const h = 200 + 220 * c.d; B.terrain(360, -h, null, { smooth: true }); B.flat(80); B.terrain(360, h, null, { smooth: true }); } },
    { id: 'stepup', build: (B, c) => { B.flat(140); B.cliff(-(140 + 160 * c.d)); B.flat(180); } },
    { id: 'drop', build: (B, c) => { B.flat(140); B.cliff(160 + 140 * c.d); B.flat(200); } },
    { id: 'lake', build: (B, c) => { B.flat(80); B.pit(c.rng.float(400, 560) + 300 * c.d, 300); B.flat(140); } },
    { id: 'plateaugreen', goal: true, build: (B, c) => { B.flat(200); B.cliff(-(180 + 200 * c.d)); B.flat(80); B.greenFlat(260); B.flat(120); } },
    { id: 'bowlgreen', goal: true, build: (B, c) => { const dep = 140 + 120 * c.d; B.terrain(260, dep, null, { amp: 0, smooth: true, noPatch: true }); B.greenFlat(200); B.terrain(260, -dep, null, { amp: 0, smooth: true, noPatch: true }); } },
    { id: 'islandgreen', goal: true, build: (B, c) => { B.flat(140); const g = B.pit(520 + 260 * c.d, 300); const cx = (g.x0 + g.x1) / 2; B.islandGreen(cx - 140, cx + 140, g.y - c.rng.float(20, 120), 80); B.flat(220); } },
    { id: 'guardedgreen', goal: true, build: (B) => { B.flat(120); B.bunker(140); B.flat(40); B.greenFlat(240); B.bunker(120); } },
    { id: 'ledgegreen', goal: true, build: (B, c) => { B.flat(160); B.pit(300 + 200 * c.d, 320, { dyEnd: -(100 + 120 * c.d) }); B.flat(40); B.greenFlat(240); B.flat(80); } },
  ];

  return { makeBuilder, WRAPPERS, WRAP, BASIC, STYLE, Y0, MAX_APEX, MAX_RANGE };
});
