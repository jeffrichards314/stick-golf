/*
 * Gimmick designs (set B): zipline, floatpool, ring, magnet, door, geyser, catapult, quicksand, windmill,
 * pendulum, pipe, bubble, drag, portal, antigrav, toggle, piston, vanish.
 * Same conventions as core.js: each piece builds a self-contained stretch of terrain from (B.x, B.y);
 * goal pieces build the green + cup. Launch gimmicks are tuned by simulating the finished hole
 * (helper `tuneSim` below, which also works for non-cannon launches).
 */
(function (root, factory) {
  const isNode = typeof module === 'object' && module.exports;
  const D = isNode ? require('./registry.js') : root.GOLF.Designs;
  const getP = () => (isNode ? require('../physics.js') : root.GOLF.Physics);
  factory(D, getP);
})(typeof self !== 'undefined' ? self : this, function (D, getP) {
  'use strict';
  const PI = Math.PI;
  const I = Math.round;
  const F3 = (v) => +v.toFixed(3);
  const val = (v) => (typeof v === 'function' ? v() : v);

  // ---------------- simulation helpers ----------------
  // Simulate a free ball in the finished hole. setup(S, W) places it. Returns {x,y,holed?,path} | null (hazard).
  function simBall(hole, setup, maxSteps) {
    const P = getP();
    const W = P.createWorld(hole), S = P.initState(W);
    S.hold = false; S.rest = false; S.shotT = 0;
    setup(S, W);
    S.lastX = S.x; S.lastY = S.y;
    const path = [];
    for (let i = 0; i < (maxSteps || 2600); i++) {
      const r = P.step(W, S);
      if ((i & 3) === 0) path.push(S.x, S.y);
      if (r === 1) return { x: S.x, y: S.y, holed: true, path };
      if (r === 2 || r === 4) return null;
      if (r === 3) return { x: S.x, y: S.y, path };
    }
    return { x: S.x, y: S.y, path, timeout: true };
  }
  // after the hole is built: tune hole.gm[gi][key] in [lo,hi] so the simulated ball rests in [x0,x1] (y <= ymax)
  function tuneSim(B, gi, key, lo, hi, setup, x0, x1, ymax, n) {
    B.post.push((BB, hole) => {
      const g = hole.gm[gi], a = val(x0), b = val(x1), ym = val(ymax), mid = (a + b) / 2;
      let best = null, bestD = 1e9;
      const N = n || 36;
      for (let i = 0; i <= N; i++) {
        const v = lo + (hi - lo) * i / N;
        g[key] = key === 'T' ? F3(v) : I(v);
        const l = simBall(hole, setup);
        if (!l || l.timeout) continue;
        if (l.holed) { best = g[key]; bestD = -1; break; }
        if (l.x >= a && l.x <= b && (ym === undefined || l.y <= ym)) { const dd = Math.abs(l.x - mid); if (dd < bestD) { bestD = dd; best = g[key]; } }
      }
      g[key] = best !== null ? best : (key === 'T' ? F3((lo + hi) / 2) : I((lo + hi) / 2));
      B.tuneOk = best !== null;
    });
  }
  const rollIn = (x, y, vx) => (S) => { S.x = x; S.y = y; S.vx = vx; S.vy = 0; };
  const restAt = (x, y) => (S) => { S.x = x; S.y = y; S.vx = 0; S.vy = 0; };

  // ---------------- terrain helpers ----------------
  // mountain over [x0,x1] whose underside is at `top` (optionally with chambers cut up into it). ref = floor y.
  function roof(B, x0, x1, top, opt) {
    opt = opt || {};
    const ref = opt.ref !== undefined ? opt.ref : top + 120;
    const peak = ref - (opt.peak || B.rng.float(1000, 1080));
    const mid = (x0 + x1) / 2, sh = Math.min(160, (x1 - x0) / 4);
    const s = opt.s || 'k';
    const pts = [x0, top];
    let ss = '';
    for (const ch of (opt.ch || []).slice().sort((p, q) => p.x0 - q.x0)) {
      pts.push(ch.x0, top, ch.x0, top - ch.up, ch.x1, top - ch.up, ch.x1, top); ss += s + 'kkk';
    }
    pts.push(x1, top); ss += s;
    pts.push(x1 + 60, top - 260, mid + sh, peak, mid - sh, peak - 20, x0 - 60, top - 260); ss += 'kkkk';
    ss += 'k';
    B.addSolid(pts, ss);
  }
  const tun0 = (B) => { B.flat(30); return { x0: B.x, y: B.y }; };
  const tun1 = (B, t, h, opt) => { opt = opt || {}; t.x1 = B.x; t.top = t.y - h; B.flat(30); roof(B, t.x0, t.x1, t.top, { ref: t.y, ch: opt.ch, s: opt.s }); return t; };
  // flat tunnel of length len, chambers given as fn(t) -> [{x0,x1,up}]
  function tunnel(B, len, h, chFn) {
    const t = tun0(B);
    B.to(B.x + len, B.y, B.sMain);
    t.x1 = B.x; t.top = t.y - h;
    return tun1(B, t, h, { ch: chFn ? chFn(t) : null });
  }
  const pitFloor = (B) => (B.hz === 'r' ? 'w' : B.hz);
  // small dip with a flat floor (for catapult plates); returns {x, y, w}
  function dip(B, w, dep) {
    dep = dep || 22;
    B.to(B.x + 50, B.y + dep, B.sMain);
    const x0 = B.x; B.flat(w, B.sMain); const x1 = B.x, y = B.y;
    B.to(B.x + 50, B.y - dep, B.sMain);
    return { x: (x0 + x1) / 2, y, w: w - 6 };
  }

  // =====================================================================================
  // ZIPLINE
  // =====================================================================================
  const zip = (B, sx, gy, ex, ey, sp) => B.add({ t: 'zipline', x: I(sx), y: I(gy - 18), x2: I(ex), y2: I(ey), sp: I(sp), r: 24 });
  D.register('zipline', {
    essential: true,
    pieces: [
      { id: 'zipgap', intro: true, build(B, c) {
        B.flat(300); const sx = B.x - 90, gy = B.y;
        const g = B.chasm(1200 + 400 * c.d, 360);
        B.flat(680);
        zip(B, sx, gy, g.x1 + 140, g.y1 - 70, 420);
      } },
      { id: 'zipcanyon', build(B, c) {
        B.flat(300); const sx = B.x - 90, gy = B.y;
        const g = B.chasm(2100 + 300 * c.d, 400);
        B.flat(720);
        zip(B, sx, gy, g.x1 + 160, g.y1 - 70, 500);
      } },
      { id: 'zipdown', build(B, c) {
        const drop = 320 + 160 * c.d;
        B.flat(220); B.wallUp(drop); B.flat(380);
        const sx = B.x - 90, gy = B.y;
        const g = B.chasm(2000 + 250 * c.d, 380 + drop, { dyEnd: drop });
        B.flat(720);
        zip(B, sx, gy, g.x1 + 180, g.y1 - 60, 480);
      } },
      { id: 'ziphop', build(B, c) {
        // two cables chained via a lonely pillar in the gorge
        B.flat(300); const sx = B.x - 90, gy = B.y;
        const g1 = B.pit(1500 + 150 * c.d, 380, { dyEnd: -120 });
        const px0 = B.x; B.flat(300); const py = B.y, sx2 = B.x - 70;
        const g2 = B.pit(1500 + 150 * c.d, 500, { dyEnd: 120 });
        B.flat(720);
        zip(B, sx, gy, px0 + 40, py - 60, 460);
        zip(B, sx2, py, g2.x1 + 160, g2.y1 - 70, 460);
      } },
      { id: 'zipclimb', goal: true, build(B, c) {
        B.flat(300); const sx = B.x - 80, gy = B.y;
        const H = 900 + 120 * c.d;
        const g = B.chasm(1500 + 200 * c.d, 380, { dyEnd: -H });
        const f = (H + 2) / (H + 22), e = (g.x1 - sx) * (1 / f - 1) + 40;
        B.flat(e + 300); B.greenFlat(320); B.flat(160);
        zip(B, sx, gy, g.x1 + e, g.y1 - 40, 420);
      } },
      { id: 'zipisle', goal: true, build(B, c) {
        B.flat(300); const sx = B.x - 80, gy = B.y;
        const g = B.chasm(2300 + 200 * c.d, 400);
        const ix0 = g.x0 + 1450 + 150 * c.d, iy = g.y - 70;
        B.islandGreen(ix0, ix0 + 420, iy, 90);
        zip(B, sx, gy, ix0 + 30, iy - 46, 300 + c.rng.float(0, 120));
        B.flat(300);
      } },
    ],
  });

  // =====================================================================================
  // FLOATPOOL
  // =====================================================================================
  function lake(B, width, depth, cur, opt) {
    opt = opt || {};
    const g = B.pit(width, depth, { floor: 'w', dyEnd: opt.dyEnd });
    const sy = g.y0 + (opt.drop || 60);
    const gi = B.add({ t: 'floatpool', x: I(g.x0 + 10), y: I(sy), w: I(g.x1 - g.x0 - 20), h: I(g.fy - sy), cur: I(cur), b: 1900 });
    return { g, sy, gi };
  }
  D.register('floatpool', {
    essential: true,
    pieces: [
      { id: 'poolcarry', intro: true, build(B, c) {
        B.flat(160); lake(B, 1300 + 300 * c.d, 420, 140); B.flat(320);
      } },
      { id: 'poollake', build(B, c) {
        B.flat(160); lake(B, 2300 + 300 * c.d, 420, 170 + 40 * c.d); B.flat(340);
      } },
      { id: 'poolcave', build(B, c) {
        // underground river: a mountain sits over the middle of the lake, only a low cave above the water
        B.flat(200);
        const L = lake(B, 1900 + 300 * c.d, 420, 230, { drop: 50 });
        roof(B, L.g.x0 + 300, L.g.x1 - 300, L.sy - 150, { ref: L.g.y0 });
        B.flat(340);
      } },
      { id: 'poolrapids', build(B, c) {
        // a very long lake with a strong current that sweeps you downstream
        B.flat(160); lake(B, 2800 + 400 * c.d, 420, 300 + 60 * c.d); B.flat(340);
      } },
      { id: 'poolshore', goal: true, build(B, c) {
        B.flat(160);
        lake(B, 2200 + 300 * c.d, 420, 160, { dyEnd: -(200 + 150 * c.d) });
        B.flat(200); B.greenFlat(300); B.flat(160);
      } },
      { id: 'poolisle', goal: true, build(B, c) {
        B.flat(160);
        const L = lake(B, 2300 + 250 * c.d, 420, -60);
        const cx = L.g.x0 + (L.g.x1 - L.g.x0) * 0.6;
        B.islandGreen(cx - 160, cx + 160, L.sy - 70, 90);
        B.flat(300);
      } },
    ],
  });

  // =====================================================================================
  // RING (mul 1 + a high min speed => deterministic output for any normal incoming ball)
  // =====================================================================================
  const ring = (B, x, y, ang, min, r) => B.add({ t: 'ring', x: I(x), y: I(y), r: r || 30, ang: F3(ang), mul: 1, min: I(min) });
  // move ring gi2 onto the flight path of a ball rolled into ring gi1 (at the path's point closest to x=atX / apex)
  function placeOnPath(B, gi2, setup, pick) {
    B.post.push((BB, hole) => {
      const g2 = hole.gm[gi2], ox = g2.x, oy = g2.y;
      g2.y = -99999;
      const l = simBall(hole, setup, 1200);
      g2.x = ox; g2.y = oy;
      if (!l || !l.path) return;
      const pt = pick(l.path);
      if (pt) { g2.x = I(pt[0]); g2.y = I(pt[1]); }
    });
  }
  const apexOf = (path, minX) => {
    let best = null;
    for (let i = 0; i < path.length; i += 2) if (path[i] > minX && (!best || path[i + 1] < best[1])) best = [path[i], path[i + 1]];
    return best;
  };
  // ring 1 at the foot of a cliff fires a rolling ball straight up; ring 2 at the top kicks it onto the plateau
  function ringLift(B, H) {
    B.flat(360); const rx = B.x - 70, gy = B.y;
    B.wallUp(H); const wx = B.x, top = B.y;
    const setup = rollIn(rx - 60, gy - 6, 260);
    ring(B, rx, gy - 26, -PI / 2, Math.sqrt(2 * 900 * (H + 40)) + 300);
    const g2 = ring(B, rx, top - 60, -0.3, 650, 36);
    placeOnPath(B, g2, setup, (p) => {
      for (let i = 0; i < p.length; i += 2) if (p[i + 1] < top - 60) return [p[i], top - 60];
      return null;
    });
    return { H, wx, top, g2, setup };
  }
  D.register('ring', {
    essential: true,
    pieces: [
      { id: 'ringhop', intro: true, build(B, c) {
        B.flat(320); const rx = B.x - 90, gy = B.y;
        const g = B.chasm(1100 + 400 * c.d, 360);
        B.flat(680);
        const gi = ring(B, rx, gy - 26, -0.75, 1000);
        tuneSim(B, gi, 'min', 600, 1600, rollIn(rx - 60, gy - 6, 280), g.x1 + 80, g.x1 + 480, g.y1 + 2);
      } },
      { id: 'ringchain', build(B, c) {
        // ring 1 on the rim lobs the ball up; ring 2 hangs at the apex and fires it across the rest of the gorge
        B.flat(320); const rx = B.x - 90, gy = B.y;
        const g = B.chasm(2200 + 300 * c.d, 400);
        B.flat(720);
        const setup = rollIn(rx - 60, gy - 6, 280);
        ring(B, rx, gy - 26, -0.85, 1250);
        const g2 = ring(B, g.x0 + 700, gy - 480, -0.3, 1100, 36);
        placeOnPath(B, g2, setup, (p) => apexOf(p, rx + 100));
        tuneSim(B, g2, 'min', 700, 1900, setup, g.x1 + 80, g.x1 + 560, g.y1 + 2);
      } },
      { id: 'ringpit', build(B, c) {
        // ice funnel too deep to climb out of; the ring at the bottom fires the ball out to the far rim
        B.flat(160);
        const x0 = B.x, y0 = B.y, W = 2100 + 300 * c.d, wd = 480, vd = 260, xm = x0 + W / 2;
        B.to(x0 + 10, y0 + wd, 'k');
        B.to(xm - 40, y0 + wd + vd, 'i');
        B.to(xm + 40, y0 + wd + vd, 'i');
        B.to(x0 + W - 10, y0 + wd, 'i');
        B.to(x0 + W, y0, 'k');
        B.flat(680);
        const by = y0 + wd + vd;
        const gi = ring(B, xm, by - 26, -1.0, 1700);
        tuneSim(B, gi, 'min', 1300, 2500, rollIn(xm - 60, by - 6, 260), x0 + W + 80, x0 + W + 560, y0 + 2);
      } },
      { id: 'ringmesa', build(B, c) {
        const L = ringLift(B, 950 + 150 * c.d);
        B.flat(700); const me = B.x; B.cliff(L.H - 40); B.flat(320);
        tuneSim(B, L.g2, 'min', 300, 1100, L.setup, L.wx + 100, me - 60, L.top + 2);
      } },
      { id: 'ringwall', goal: true, build(B, c) {
        // ring lift: ring 1 fires the ball straight up the cliff face, ring 2 at the top kicks it onto the green
        const L = ringLift(B, 1050 + 150 * c.d);
        B.flat(140); B.greenFlat(320); const ge = B.x; B.flat(160);
        tuneSim(B, L.g2, 'min', 300, 1100, L.setup, L.wx + 100, ge - 20, L.top + 2);
      } },
      { id: 'ringisle', goal: true, build(B, c) {
        B.flat(320); const rx = B.x - 90, gy = B.y;
        const g = B.chasm(2200 + 200 * c.d, 400);
        const ix0 = g.x0 + 1250 + 150 * c.d, iy = g.y - 80;
        B.islandGreen(ix0, ix0 + 400, iy, 90);
        B.flat(300);
        const gi = ring(B, rx, gy - 26, -0.95, 1500);
        tuneSim(B, gi, 'min', 900, 2200, rollIn(rx - 60, gy - 6, 280), ix0 + 20, ix0 + 380, iy + 2, 48);
      } },
    ],
  });

  // =====================================================================================
  // MAGNET (strong bar: the ball sticks to its underside and slides down it)
  // =====================================================================================
  const mag = (B, x, y, x2, y2) => B.add({ t: 'magnet', x: I(x), y: I(y), x2: I(x2), y2: I(y2), r: 150, k: 2500 });
  D.register('magnet', {
    essential: true,
    pieces: [
      { id: 'magbridge', intro: true, build(B, c) {
        B.flat(200);
        const g = B.chasm(1100 + 300 * c.d, 360);
        B.flat(720);
        mag(B, g.x0 + 40, g.y - 430, g.x1 + 220, g.y1 - 175);
      } },
      { id: 'maglava', build(B, c) {
        B.flat(200);
        const g = B.chasm(2200 + 300 * c.d, 400);
        B.flat(760);
        mag(B, g.x0 + 40, g.y - 520, g.x1 + 220, g.y1 - 175);
      } },
      { id: 'magcave', build(B, c) {
        // magnetic ceiling of a cave over lava; the mountain above can't be overflown
        B.flat(260);
        const g = B.chasm(2000 + 300 * c.d, 400);
        B.flat(760);
        const ax = g.x0 - 20, ay = g.y - 380, bx = g.x1 + 200, by = g.y1 - 175;
        mag(B, ax, ay, bx, by);
        const ly = (x) => ay + (by - ay) * (x - ax) / (bx - ax) - 12;
        const xa = g.x0 - 80, xb = g.x1 + 170, mid = (xa + xb) / 2;
        B.addSolid([xa, ly(xa), xb, ly(xb), xb + 90, by - 420, mid + 200, g.y - 1150, mid - 200, g.y - 1170, xa - 80, ay - 300]);
      } },
      { id: 'magzig', build(B, c) {
        // two bars: the first drops you on a pillar in the gorge, the second carries you off it
        B.flat(200);
        const g1 = B.pit(1300 + 150 * c.d, 400, { dyEnd: -60 });
        const px0 = B.x; B.flat(320); const py = B.y, px1 = B.x;
        const g2 = B.pit(1300 + 150 * c.d, 460, { dyEnd: 60 });
        B.flat(760);
        mag(B, g1.x0 + 40, g1.y0 - 480, px0 + 80, py - 190);
        mag(B, px1 - 60, py - 420, g2.x1 + 220, g2.y1 - 175);
      } },
      { id: 'magdrop', goal: true, build(B, c) {
        // the bar ends over a sunken green below the far rim
        B.flat(200);
        const dr = 260 + 120 * c.d;
        const g = B.chasm(2200 + 300 * c.d, 400 + dr, { dyEnd: dr });
        B.flat(80); const gx = B.x; B.greenFlat(380, { cupFrac: 0.55 }); B.flat(200);
        mag(B, g.x0 + 40, g.y0 - 420, gx + 60, g.y1 - 195);
      } },
      { id: 'magisle', goal: true, build(B, c) {
        B.flat(200);
        const g = B.chasm(2400 + 200 * c.d, 400);
        const ix0 = g.x0 + 1450 + 100 * c.d, iy = g.y - 40;
        B.islandGreen(ix0, ix0 + 420, iy, 90);
        mag(B, g.x0 + 40, g.y - 540, ix0 + 50, iy - 195);
        B.flat(300);
      } },
    ],
  });

  // =====================================================================================
  // DOOR
  // =====================================================================================
  const door = (B, x, top, fy, T, open, ph) => B.add({ t: 'door', x: I(x), y: I(top), w: 24, h: I(fy - top + 4), T: F3(T), open: F3(open), ph: F3(ph) });
  D.register('door', {
    essential: false,
    pieces: [
      { id: 'doortunnel', intro: true, build(B, c) {
        const t = B.corridor(800 + 200 * c.d);
        door(B, t.x0 + (t.x1 - t.x0) * 0.55, t.top, t.y, 2.4, 0.55, c.rng.next());
        B.flat(200);
      } },
      { id: 'doortwin', build(B, c) {
        const t = B.corridor(1200 + 200 * c.d), L = t.x1 - t.x0;
        door(B, t.x0 + L * 0.35, t.top, t.y, 2.2, 0.5, c.rng.next());
        door(B, t.x0 + L * 0.7, t.top, t.y, 2.9 - 0.4 * c.d, 0.5, c.rng.next());
        B.flat(200);
      } },
      { id: 'doortrap', build(B, c) {
        // trapdoor bridge over a lava pit inside a low tunnel
        const t = tun0(B);
        B.flat(320);
        const p = B.pit(520 + 160 * c.d, 300);
        B.flat(320);
        tun1(B, t, 105);
        B.add({ t: 'door', x: I(p.x0 - 4), y: I(p.y0), w: I(p.x1 - p.x0 + 8), h: 18, T: 3, open: 0.4, ph: F3(c.rng.next()) });
        B.flat(200);
      } },
      { id: 'doorlock', build(B, c) {
        // airlock: entrance and exit doors swing in opposite phase
        const t = B.corridor(700 + 150 * c.d), T = 2.6 - 0.3 * c.d, ph = c.rng.next();
        door(B, t.x0 + 60, t.top, t.y, T, 0.5, ph);
        door(B, t.x1 - 84, t.top, t.y, T, 0.5, ph + 0.5);
        B.flat(200);
      } },
      { id: 'doorgreen', goal: true, build(B, c) {
        // green at the back of a dead-end tunnel behind a timed door
        const t = tun0(B);
        B.flat(300); const dx = B.x; B.flat(160);
        B.greenFlat(360, { cupFrac: 0.6 }); B.flat(40);
        tun1(B, t, 130);
        B.wallUp(200);
        door(B, dx, t.top, t.y, 2.4, 0.5, c.rng.next());
      } },
      { id: 'doorvault', goal: true, build(B, c) {
        B.flat(420);
        const v = B.vault(380 + 60 * c.d);
        door(B, v.x0 - 27, v.top, v.y, 2.6, 0.5, c.rng.next());
        B.gm[B.gm.length - 1].w = 30; B.gm[B.gm.length - 1].x = I(v.x0 - 30);
        B.solids.splice(B.solids.length - 3, 1);
      } },
    ],
  });

  // =====================================================================================
  // GEYSER (a fountain column; anything inside it while it's blowing is shoved upward)
  // =====================================================================================
  const gey = (B, x, y, w, h, a, T, on, ph) => B.add({ t: 'geyser', x: I(x), y: I(y), w: I(w), h: I(h), a: I(a), T: F3(T), on: F3(on), ph: F3(ph) });
  D.register('geyser', {
    essential: true,
    pieces: [
      { id: 'geyserhop', intro: true, build(B, c) {
        B.flat(200);
        const g = B.chasm(1400 + 300 * c.d, 360);
        gey(B, (g.x0 + g.x1) / 2, g.fy, 260, g.fy - g.y + 300, 2500, 2.6, 0.62, c.rng.next());
        B.flat(560);
      } },
      { id: 'geysergap', build(B, c) {
        B.flat(200);
        const g = B.chasm(2300 + 300 * c.d, 380), L = g.x1 - g.x0, ph = c.rng.next();
        gey(B, g.x0 + L * 0.34, g.fy, 300, g.fy - g.y + 360, 2600, 2.6, 0.62, ph);
        gey(B, g.x0 + L * 0.68, g.fy, 300, g.fy - g.y + 360, 2600, 2.6, 0.62, ph + 0.4);
        B.flat(600);
      } },
      { id: 'geyserclimb', build(B, c) {
        // mesa too tall to climb; a vent at its foot blows you up onto it
        B.flat(440);
        const H = 950 + 150 * c.d;
        gey(B, B.x - 170, B.y, 280, H - 80, 2400, 3.2, 0.62, c.rng.next());
        B.wallUp(H);
        B.flat(900);
        B.cliff(H - 40);
        B.flat(300);
      } },
      { id: 'geyserledge', build(B, c) {
        // gorge whose far wall is a tall ledge; a vent on the gorge floor by that wall blows you up onto it
        B.flat(200);
        const H = 850 + 150 * c.d;
        const g = B.chasm(1300 + 200 * c.d, 380, { dyEnd: -H });
        // rock pedestal around the vent so a ball can wait for the eruption
        const vx = g.x1 - 200, py = g.fy - 40;
        B.addSolid([vx - 170, py, vx + 170, py, vx + 160, g.fy + 4, vx - 160, g.fy + 4], 'rkkk');
        gey(B, vx, py, 300, py - g.y1 + 240, 2600, 3.0, 0.62, c.rng.next());
        B.flat(800); B.cliff(H - 40); B.flat(300);
      } },
      { id: 'geyserisle', goal: true, build(B, c) {
        // floating island green high above a lava gorge, fed by a geyser just before it
        B.flat(200);
        const g = B.chasm(2000 + 200 * c.d, 380);
        const ix0 = g.x0 + 1100 + 100 * c.d, iy = g.y - (520 + 120 * c.d);
        B.islandGreen(ix0, ix0 + 420, iy, 90);
        gey(B, ix0 - 160, g.fy, 280, g.fy - iy - 60, 2600, 3.0, 0.62, c.rng.next());
        B.flat(300);
      } },
      { id: 'geyserwall', goal: true, build(B, c) {
        B.flat(440);
        const H = 1000 + 100 * c.d;
        gey(B, B.x - 170, B.y, 280, H - 80, 2400, 3.2, 0.62, c.rng.next());
        B.wallUp(H);
        B.flat(380); B.greenFlat(380); B.flat(160);
      } },
    ],
  });

  // =====================================================================================
  // CATAPULT (ball must come to rest on the plate, which sits at the bottom of a little dip)
  // =====================================================================================
  const cat = (B, p, ang, sp) => B.add({ t: 'catapult', x: I(p.x), y: I(p.y), w: I(p.w), ang: F3(ang), sp: I(sp), delay: 0.5 });
  const onPlate = (p) => restAt(p.x, p.y - 9);
  D.register('catapult', {
    essential: true,
    pieces: [
      { id: 'cathop', intro: true, build(B, c) {
        B.flat(160); const p = dip(B, 100); B.flat(140);
        const g = B.chasm(1200 + 300 * c.d, 360);
        B.flat(680);
        const gi = cat(B, p, -0.8, 1100);
        tuneSim(B, gi, 'sp', 600, 1700, onPlate(p), g.x1 + 60, g.x1 + 520, g.y1 + 2);
      } },
      { id: 'catchasm', build(B, c) {
        B.flat(160); const p = dip(B, 96); B.flat(120);
        const g = B.chasm(2200 + 300 * c.d, 380);
        B.flat(720);
        const gi = cat(B, p, -0.85, 1700);
        tuneSim(B, gi, 'sp', 1100, 2400, onPlate(p), g.x1 + 80, g.x1 + 600, g.y1 + 2);
      } },
      { id: 'catrelay', build(B, c) {
        // plate 1 flings onto a pillar whose bowl holds plate 2, which flings across the rest
        B.flat(160); const p1 = dip(B, 96); B.flat(120);
        const g1 = B.pit(900 + 150 * c.d, 380, { dyEnd: -220 });
        B.flat(60);
        const p2 = dip(B, 90, 60);
        B.flat(60);
        const g2 = B.pit(1100 + 150 * c.d, 600, { dyEnd: 220 });
        B.flat(720);
        const a = cat(B, p1, -0.9, 1200), b = cat(B, p2, -0.8, 1300);
        tuneSim(B, b, 'sp', 800, 2200, onPlate(p2), g2.x1 + 80, g2.x1 + 600, g2.y1 + 2);
        tuneSim(B, a, 'sp', 700, 1900, onPlate(p1), g2.x1 + 80, g2.x1 + 600, g2.y1 + 2);
      } },
      { id: 'catmesa', build(B, c) {
        B.flat(160); const p = dip(B, 96); B.flat(110);
        const H = 1000 + 150 * c.d;
        B.wallUp(H); const wx = B.x, top = B.y;
        B.flat(800); const me = B.x; B.cliff(H - 40); B.flat(320);
        const gi = cat(B, p, -1.46, 1800);
        tuneSim(B, gi, 'sp', 1450, 2500, onPlate(p), wx + 60, me - 80, top + 2);
      } },
      { id: 'catwall', goal: true, build(B, c) {
        B.flat(160); const p = dip(B, 96); B.flat(110);
        const H = 1050 + 150 * c.d;
        B.wallUp(H); const wx = B.x, top = B.y;
        B.flat(120); B.greenFlat(340); const ge = B.x; B.flat(160);
        const gi = cat(B, p, -1.46, 1800);
        tuneSim(B, gi, 'sp', 1450, 2500, onPlate(p), wx + 60, ge - 10, top + 2);
      } },
      { id: 'catisle', goal: true, build(B, c) {
        B.flat(160); const p = dip(B, 96); B.flat(120);
        const g = B.chasm(2200 + 200 * c.d, 380);
        const ix0 = g.x0 + 1300 + 150 * c.d, iy = g.y - 60;
        B.islandGreen(ix0, ix0 + 400, iy, 90);
        B.flat(300);
        const gi = cat(B, p, -0.95, 1500);
        tuneSim(B, gi, 'sp', 900, 2300, onPlate(p), ix0 + 20, ix0 + 380, iy + 2);
      } },
    ],
  });

  // =====================================================================================
  // QUICKSAND
  // =====================================================================================
  const qs = (B, len) => { const x0 = B.x; B.flat(len, 's'); B.add({ t: 'quicksand', x: I(x0), y: I(B.y), x2: I(B.x), y2: I(B.y) }); };
  const safePad = (B, w) => { B.to(B.x + 8, B.y - 16, 'k'); B.flat(w, 'r'); B.to(B.x + 8, B.y + 16, 'k'); };
  D.register('quicksand', {
    essential: false,
    pieces: [
      { id: 'sandfield', intro: true, build(B, c) {
        // a field too long to carry in one go, with a roomy safe pad in the middle
        B.flat(200); qs(B, 900 + 100 * c.d); safePad(B, 340); qs(B, 900 + 100 * c.d); B.flat(500);
      } },
      { id: 'sandsteps', build(B, c) {
        // a field too long to carry, with two tiny safe pads to stop on
        B.flat(160);
        const seg = 720 + 120 * c.d, pw = 190 - 50 * c.d;
        qs(B, seg); safePad(B, pw); qs(B, seg); safePad(B, pw); qs(B, seg * 0.9);
        B.flat(400);
      } },
      { id: 'sandbowl', build(B, c) {
        B.flat(160);
        const dep = 200 + 80 * c.d;
        B.terrain(420, dep, null, { amp: 0, smooth: true, noPatch: true });
        qs(B, 520 + 200 * c.d);
        B.terrain(420, -dep, null, { amp: 0, smooth: true, noPatch: true });
        B.flat(400);
      } },
      { id: 'sandslope', build(B, c) {
        // an uphill bank of quicksand: come up short and it swallows you
        B.flat(200);
        const x0 = B.x, y0 = B.y, len = 800 + 200 * c.d, rise = 260 + 100 * c.d;
        B.to(B.x + len, B.y - rise, 's');
        B.add({ t: 'quicksand', x: I(x0), y: I(y0), x2: I(B.x), y2: I(B.y) });
        B.flat(500);
      } },
      { id: 'sandpad', goal: true, build(B, c) {
        // one safe pad in the middle of the swamp, then a green ringed by quicksand
        B.flat(160);
        qs(B, 650 + 100 * c.d); safePad(B, 200 - 40 * c.d); qs(B, 600 + 100 * c.d);
        B.flat(16, 'r'); B.greenFlat(300); B.flat(16, 'r'); qs(B, 380); B.flat(200);
      } },
      { id: 'sandisle', goal: true, build(B, c) {
        B.flat(200); qs(B, 520 + 250 * c.d);
        B.flat(16, 'r'); B.greenFlat(280 - 40 * c.d); B.flat(16, 'r');
        qs(B, 420); B.flat(200);
      } },
    ],
  });

  // =====================================================================================
  // WINDMILL
  // =====================================================================================
  const mill = (B, x, y, L, n, w, ph) => B.add({ t: 'windmill', x: I(x), y: I(y), n, L: I(L), w: F3(w), ph: F3(ph) });
  // windmill whose blade tips just skim the tunnel floor; chamber cut into the ceiling for the blades
  function tunnelMills(B, len, fracs, c) {
    const h = 120, L = 128;
    const t = tun0(B);
    B.to(B.x + len, B.y, B.sMain);
    const ch = [];
    fracs.forEach((f, i) => {
      const hx = t.x0 + len * f, hy = t.y - L - 3;
      ch.push({ x0: hx - L - 16, x1: hx + L + 16, up: (t.y - h) - (hy - L - 16) });
      const sgn = i % 2 ? -1 : 1;
      mill(B, hx, hy, L, 4, sgn * (1.2 + 0.7 * c.d + c.rng.float(-0.1, 0.1)), c.rng.float(0, 6.28));
    });
    tun1(B, t, h, { ch });
    return t;
  }
  D.register('windmill', {
    essential: false,
    pieces: [
      { id: 'milltunnel', intro: true, build(B, c) { tunnelMills(B, 900 + 200 * c.d, [0.55], c); B.flat(200); } },
      { id: 'millpair', build(B, c) { tunnelMills(B, 1300 + 200 * c.d, [0.32, 0.7], c); B.flat(200); } },
      { id: 'millridge', build(B, c) {
        // the only landing between two gorges is swept by giant blades
        B.flat(160);
        B.pit(900 + 100 * c.d, 360);
        const rx = B.x; B.flat(340, B.sAlt); const ry = B.y;
        B.pit(900 + 100 * c.d, 360);
        B.flat(320);
        const L = 160;
        mill(B, rx + 170, ry - L - 3, L, 3, (c.rng.chance(0.5) ? 1 : -1) * (1.0 + 0.5 * c.d), c.rng.float(0, 6.28));
      } },
      { id: 'milltrio', build(B, c) { tunnelMills(B, 1600 + 200 * c.d, [0.22, 0.5, 0.78], c); B.flat(200); } },
      { id: 'millcave', goal: true, build(B, c) {
        // dead-end cave green; a windmill turns in a chamber over its mouth
        const t = tun0(B), h = 120, L = 128;
        B.flat(420); const hx = B.x - 150;
        B.greenFlat(400, { cupFrac: 0.7 }); B.flat(40);
        const hy = t.y - L - 3;
        tun1(B, t, h, { ch: [{ x0: hx - L - 16, x1: hx + L + 16, up: (t.y - h) - (hy - L - 16) }] });
        B.wallUp(200);
        mill(B, hx, hy, L, 4, (1.2 + 0.6 * c.d) * (c.rng.chance(0.5) ? 1 : -1), c.rng.float(0, 6.28));
      } },
      { id: 'millhouse', goal: true, build(B, c) {
        // classic: the green is inside a house; the blades sweep across its doorway
        B.flat(460);
        const v = B.vault(420 + 60 * c.d, { cupFrac: 0.7 });
        const gap = 36, si = B.solids.length - 3;
        B.solids[si] = { p: [v.x0 - 30, v.y - gap, v.x0, v.y - gap, v.x0, v.top, v.x0 - 30, v.top].map(I), s: 'k' };
        const L = 112;
        mill(B, v.x0 - 15, v.y - L - 3, L, 4, (1.1 + 0.6 * c.d) * (c.rng.chance(0.5) ? 1 : -1), c.rng.float(0, 6.28));
      } },
    ],
  });

  // =====================================================================================
  // PENDULUM
  // =====================================================================================
  const pend = (B, x, y, L, A, w, ph, r) => B.add({ t: 'pendulum', x: I(x), y: I(y), L: I(L), A: F3(A), w: F3(w), ph: F3(ph), r: r || 22 });
  // pendulums hung in shafts above a tunnel; head skims the floor at the bottom of its swing
  function tunnelPends(B, len, fracs, c, floorFn) {
    const h = 130, r = 22, L = 230, A = 0.72;
    const t = tun0(B);
    if (floorFn) floorFn(B); else B.to(B.x + len, B.y, B.sMain);
    const ch = [], ph0 = c.rng.next();
    fracs.forEach((f, i) => {
      const hx = t.x0 + (B.x - t.x0) * f, py = t.y - L - r - 3;
      const half = L * Math.sin(A) + r + 16;
      ch.push({ x0: hx - half, x1: hx + half, up: (t.y - h) - (py - 24) });
      pend(B, hx, py, L, A, 1.9 + 0.6 * c.d, ph0 + i * 0.37, r);
    });
    tun1(B, t, h, { ch });
    return t;
  }
  D.register('pendulum', {
    essential: false,
    pieces: [
      { id: 'pendtunnel', intro: true, build(B, c) { tunnelPends(B, 900 + 200 * c.d, [0.55], c); B.flat(200); } },
      { id: 'pendpair', build(B, c) { tunnelPends(B, 1300 + 200 * c.d, [0.33, 0.7], c); B.flat(200); } },
      { id: 'pendbridge', build(B, c) {
        // a narrow bridge between two lava pits, inside a tunnel, with a hammer swinging over it
        tunnelPends(B, 0, [0.5], c, (BB) => {
          BB.flat(260); BB.pit(220 + 60 * c.d, 260); BB.flat(300); BB.pit(220 + 60 * c.d, 260); BB.flat(260);
        });
        B.flat(200);
      } },
      { id: 'pendtrio', build(B, c) { tunnelPends(B, 1700 + 200 * c.d, [0.22, 0.5, 0.78], c); B.flat(200); } },
      { id: 'pendhouse', goal: true, build(B, c) {
        // green inside a hut with a low doorway; a hammer hangs from the eave and swings across it
        B.flat(480);
        const v = B.vault(460 + 60 * c.d, { cupFrac: 0.72 });
        const gap = 36, si = B.solids.length - 3;
        B.solids[si] = { p: [v.x0 - 30, v.y - gap, v.x0, v.y - gap, v.x0, v.top, v.x0 - 30, v.top].map(I), s: 'k' };
        const r = 22, py = v.top - 30, L = (v.y - r - 3) - py;
        B.addSolid([v.x0 - 120, py - 14, v.x0 - 30, py - 14, v.x0 - 30, py + 14, v.x0 - 120, py + 6], 'kkkk');
        pend(B, v.x0 - 60, py, L, 0.6, 2.1 + 0.6 * c.d, c.rng.next(), r);
      } },
      { id: 'pendgreen', goal: true, build(B, c) {
        // green at the back of a cave; a hammer swings across the cave mouth
        const t = tun0(B);
        B.flat(240);
        const gx0 = B.x;
        B.greenFlat(560, { cupFrac: 0.78 });
        B.flat(40);
        const h = 240, r = 22, L = h - r - 6;
        t.x1 = B.x; t.top = t.y - h;
        roof(B, t.x0, B.x + 40, t.top, { ref: t.y });
        B.wallUp(h + 40);
        pend(B, gx0 + 10, t.top, L, 0.75, 2.0 + 0.6 * c.d, c.rng.next(), r);
      } },
    ],
  });

  // =====================================================================================
  // PIPE
  // =====================================================================================
  const pipe = (B, pts, sp) => B.add({ t: 'pipe', p: pts.map(I), sp: I(sp), r: 22 });
  D.register('pipe', {
    essential: true,
    pieces: [
      { id: 'pipehill', intro: true, build(B, c) {
        B.flat(320); const ex = B.x - 100, gy = B.y;
        const H = 1000 + 100 * c.d;
        B.flat(40);
        B.to(B.x + 160, B.y - H * 0.62, 'k'); B.to(B.x + 140, B.y - H * 0.38, 'k');
        B.flat(260, 'r');
        B.to(B.x + 140, B.y + H * 0.38, 'k'); B.to(B.x + 160, B.y + H * 0.62, 'k');
        B.flat(60); const ox = B.x;
        B.flat(620);
        pipe(B, [ex, gy - 6, ex + 70, gy + 40, ox - 70, gy + 40, ox, gy - 12], 420);
      } },
      { id: 'pipeunder', build(B, c) {
        B.flat(320); const ex = B.x - 120, gy = B.y;
        const g = B.chasm(2100 + 300 * c.d, 400);
        const ox = g.x1 + 140;
        B.flat(720);
        pipe(B, [ex, gy - 6, g.x0 - 30, gy + 30, g.x0 + 40, g.fy - 70, g.x1 - 40, g.fy - 70, g.x1 + 40, g.y1 + 40, ox, g.y1 - 12], 460);
      } },
      { id: 'pipemesa', build(B, c) {
        // tall mesa: pipe climbs over it and drops you on the far side
        B.flat(320); const ex = B.x - 100, gy = B.y;
        const H = 1050 + 100 * c.d;
        B.flat(40); const wx = B.x;
        B.wallUp(H); B.flat(500, 'r'); const wx2 = B.x; B.cliff(H);
        B.flat(60); const ox = B.x + 80;
        B.flat(640);
        pipe(B, [ex, gy - 6, wx - 40, gy - 40, wx - 40, gy - H - 60, wx2 + 60, gy - H - 60, ox, gy - 12], 520);
      } },
      { id: 'pipechain', build(B, c) {
        // pipe 1 climbs onto a tall spire, pipe 2 dives off it to the far rim
        B.flat(320); const ex = B.x - 110, gy = B.y;
        const H = 1000 + 100 * c.d;
        const g1 = B.pit(700 + 100 * c.d, 380, { dyEnd: -H });
        const sx0 = B.x; B.flat(320, 'r'); const sx1 = B.x, top = B.y;
        const g2 = B.pit(700 + 100 * c.d, 380 + H, { dyEnd: H });
        B.flat(700);
        pipe(B, [ex, gy - 6, g1.x0 + 60, gy + 40, g1.x1 - 60, g1.fy - 60, g1.x1 - 60, top - 60, sx0 + 80, top - 14], 420);
        pipe(B, [sx1 - 70, top - 6, sx1 + 60, top - 60, g2.x1 - 40, g2.fy - 60, g2.x1 + 40, g2.y1 + 40, g2.x1 + 140, g2.y1 - 12], 460);
      } },
      { id: 'pipevault', goal: true, build(B, c) {
        B.flat(520); const ex = B.x - 180, gy = B.y;
        const v = B.vault(440 + 80 * c.d, { cupFrac: 0.65 });
        pipe(B, [ex, gy - 6, ex + 60, gy - 60, ex + 60, v.top - 100, v.gx0 + 40, v.top - 100, v.gx0 + 40, v.y - 50, v.gx0 + 70, v.y - 22], 260);
        B.parExtra += 1;
      } },
      { id: 'pipeup', goal: true, build(B, c) {
        B.flat(420); const ex = B.x - 220, gy = B.y;
        const H = 1050 + 150 * c.d;
        const wx = B.x;
        B.wallUp(H); const top = B.y;
        B.flat(200); B.greenFlat(320); B.flat(160);
        pipe(B, [ex, gy - 6, wx - 40, gy - 40, wx - 40, top - 70, wx + 70, top - 70, wx + 110, top - 22], 380);
      } },
    ],
  });

  // =====================================================================================
  // BUBBLE
  // =====================================================================================
  const bub = (B, x, y, dx, vy, T) => B.add({ t: 'bubble', x: I(x), y: I(y), r: 26, dx: I(dx), vy: I(vy), T: F3(T) });
  // diagonal bubble that clears a wall of height H whose foot is at wx
  function bubbleWall(B, wx, gy, H) {
    const vy = -300, by = gy - 30, rise = H + 120 - 24, d = 220;
    const tw = rise / -vy, dx = d / tw;
    const T = tw + 120 / dx;
    bub(B, wx - d, by, dx, vy, T);
  }
  D.register('bubble', {
    essential: true,
    pieces: [
      { id: 'bubblefloat', intro: true, build(B, c) {
        B.flat(320); const bx = B.x - 100, gy = B.y;
        const g = B.chasm(1200 + 300 * c.d, 360);
        B.flat(640);
        const dx = 200;
        bub(B, bx, gy - 30, dx, -50, (g.x1 + 160 - bx) / dx);
      } },
      { id: 'bubblechasm', build(B, c) {
        B.flat(320); const bx = B.x - 100, gy = B.y;
        const g = B.chasm(2200 + 300 * c.d, 400);
        B.flat(700);
        const dx = 280;
        bub(B, bx, gy - 30, dx, -45, (g.x1 + 180 - bx) / dx);
      } },
      { id: 'bubblelift', build(B, c) {
        B.flat(420);
        const H = 950 + 150 * c.d;
        bubbleWall(B, B.x, B.y, H);
        B.wallUp(H); B.flat(800); B.cliff(H - 40); B.flat(300);
      } },
      { id: 'bubblehop', build(B, c) {
        // two bubbles chained via a pillar in a huge gorge
        B.flat(320); const bx = B.x - 100, gy = B.y;
        const g1 = B.pit(1500 + 150 * c.d, 380, { dyEnd: -100 });
        const px0 = B.x; B.flat(320); const py = B.y, bx2 = B.x - 80;
        const g2 = B.pit(1500 + 150 * c.d, 480, { dyEnd: 100 });
        B.flat(700);
        const dx = 240;
        bub(B, bx, gy - 30, dx, -50, (px0 + 60 - bx) / dx);
        bub(B, bx2, py - 30, dx, -50, (g2.x1 + 180 - bx2) / dx);
      } },
      { id: 'bubblewall', goal: true, build(B, c) {
        B.flat(420);
        const H = 1000 + 150 * c.d;
        bubbleWall(B, B.x, B.y, H);
        B.wallUp(H); B.flat(200); B.greenFlat(320); B.flat(160);
      } },
      { id: 'bubbletower', goal: true, build(B, c) {
        // green on top of a lone spire; the bubble drifts you up and over it
        B.flat(300); const bx = B.x - 90, gy = B.y, by = gy - 30;
        const th = 700 + 150 * c.d, ttop = gy - th;
        const dx = 110, vy = -150, popY = ttop - 300;
        const T = (by - popY) / -vy, popX = bx + dx * T, gc = popX + 50;
        const x0 = B.x, fy = gy + 380, tx0 = gc - 150;
        B.to(x0 + 10, fy, 'k'); B.to(tx0 - 10, fy, pitFloor(B)); B.to(tx0, ttop, 'k');
        B.greenFlat(300); B.green = [tx0, tx0 + 300, ttop];
        B.to(B.x + 10, fy, 'k'); B.to(B.x + 600, fy, pitFloor(B)); B.to(B.x + 10, gy, 'k');
        B.flat(300);
        bub(B, bx, by, dx, vy, T);
      } },
    ],
  });

  // =====================================================================================
  // DRAG
  // =====================================================================================
  const dragz = (B, x, y, w, h, k) => B.add({ t: 'drag', x: I(x), y: I(y), w: I(w), h: I(h), k: F3(k) });
  // tiny island with a column of thick air above it
  function dragIsle(B, cx, ty, iw, k, s) {
    B.island(cx - iw / 2, cx + iw / 2, ty, s || B.sMain, 60);
    // thick air on the approach side, ending just above the island: it slows incoming balls but lets you shoot out
    dragz(B, cx - 280, ty - 620, 280 + iw / 2 - 10, 570, k);
  }
  D.register('drag', {
    essential: true,
    pieces: [
      { id: 'dragpad', intro: true, build(B, c) {
        B.flat(200);
        const g = B.chasm(1500 + 300 * c.d, 380);
        dragIsle(B, (g.x0 + g.x1) / 2, g.y - 20, 150, 3.5);
        B.flat(420);
      } },
      { id: 'dragislands', build(B, c) {
        B.flat(200);
        const g = B.chasm(2600 + 300 * c.d, 400), L = g.x1 - g.x0, iw = 130 - 30 * c.d;
        dragIsle(B, g.x0 + L * 0.34, g.y - 30, iw, 3.6);
        dragIsle(B, g.x0 + L * 0.67, g.y - 10, iw, 3.6);
        B.flat(420);
      } },
      { id: 'draghoney', build(B, c) {
        // a long tunnel full of syrup with a lava moat in the middle
        const t = tun0(B);
        B.flat(500 + 200 * c.d); const p = B.pit(260 + 80 * c.d, 300); B.flat(500 + 200 * c.d);
        tun1(B, t, 130);
        dragz(B, t.x0, t.top, t.x1 - t.x0, p.fy - t.top, 1.0 + 0.4 * c.d);
        B.flat(200);
      } },
      { id: 'dragcatch', build(B, c) {
        // one tiny ledge halfway across a gorge whose far rim sits higher
        B.flat(200);
        const g = B.chasm(2300 + 300 * c.d, 400, { dyEnd: -160 });
        dragIsle(B, g.x0 + (g.x1 - g.x0) * 0.5, g.y0 - 60, 110 - 20 * c.d, 3.6);
        B.flat(420);
      } },
      { id: 'dragperch', goal: true, build(B, c) {
        // green atop a needle-thin spire; thick air above it lets the ball settle
        B.flat(200);
        const x0 = B.x, y0 = B.y, fy = y0 + 380, th = 300 + 150 * c.d, gw = 200 - 30 * c.d;
        const tx0 = x0 + 1100 + 100 * c.d;
        B.to(x0 + 10, fy, 'k'); B.to(tx0 - 10, fy, pitFloor(B)); B.to(tx0, y0 - th, 'k');
        B.greenFlat(gw); B.green = [tx0, tx0 + gw, y0 - th];
        const cx = tx0 + gw / 2;
        B.to(B.x + 10, fy, 'k'); B.to(B.x + 900, fy, pitFloor(B)); B.to(B.x + 10, y0, 'k');
        B.flat(300);
        dragz(B, cx - 170, y0 - th - 640, 340, 645, 3.4);
      } },
      { id: 'draggreen', goal: true, build(B, c) {
        B.flat(200);
        const g = B.chasm(2200 + 200 * c.d, 400);
        const cx = g.x0 + 1250 + 150 * c.d, iy = g.y - 40, iw = 230 - 40 * c.d;
        B.islandGreen(cx - iw / 2, cx + iw / 2, iy, 80);
        dragz(B, cx - 170, iy - 640, 340, 650, 3.4);
        B.flat(300);
      } },
    ],
  });

  // =====================================================================================
  // PORTAL
  // =====================================================================================
  const portal = (B, x, y, a, x2, y2, a2) => B.add({ t: 'portal', x: I(x), y: I(y), a: F3(a), x2: I(x2), y2: I(y2), a2: F3(a2), r: 26 });
  D.register('portal', {
    essential: true,
    pieces: [
      { id: 'portalhop', intro: true, build(B, c) {
        B.flat(320); const ax = B.x - 100, gy = B.y;
        const g = B.chasm(1200 + 300 * c.d, 360);
        B.flat(640);
        portal(B, ax, gy - 26, -PI / 2, g.x1 + 160, g.y1 - 60, -0.35);
      } },
      { id: 'portalflip', build(B, c) {
        // dive into the portal hanging in the gorge: it turns the plunge into a skyward launch on the far side
        B.flat(200);
        const g = B.chasm(2200 + 300 * c.d, 440);
        B.flat(900);
        portal(B, g.x0 + 520 + 100 * c.d, g.y + 170, -PI / 2, g.x1 + 140, g.y1 - 44, -1.3);
      } },
      { id: 'portalfunnel', build(B, c) {
        B.flat(160);
        const x0 = B.x, y0 = B.y, W = 2100 + 300 * c.d, wd = 460, vd = 240, xm = x0 + W / 2;
        B.to(x0 + 10, y0 + wd, 'k');
        B.to(xm - 40, y0 + wd + vd, 'i'); B.to(xm + 40, y0 + wd + vd, 'i');
        B.to(x0 + W - 10, y0 + wd, 'i'); B.to(x0 + W, y0, 'k');
        B.flat(760);
        portal(B, xm, y0 + wd + vd - 26, -PI / 2, x0 + W + 150, y0 - 44, -0.3);
      } },
      { id: 'portalmount', build(B, c) {
        // a mountain with no way over: the portal at its foot opens on the far side
        B.flat(320); const ax = B.x - 100, gy = B.y;
        const H = 1050 + 100 * c.d;
        B.flat(40);
        B.to(B.x + 160, B.y - H * 0.62, 'k'); B.to(B.x + 140, B.y - H * 0.38, 'k');
        B.flat(300, 'r');
        B.to(B.x + 140, B.y + H * 0.38, 'k'); B.to(B.x + 160, B.y + H * 0.62, 'k');
        B.flat(140); const bx = B.x;
        B.flat(640);
        portal(B, ax, gy - 26, -PI / 2, bx, gy - 40, -0.2);
      } },
      { id: 'portalvault', goal: true, build(B, c) {
        B.flat(460); const ax = B.x - 200, gy = B.y;
        const v = B.vault(440 + 80 * c.d, { cupFrac: 0.65 });
        portal(B, ax, gy - 26, -PI / 2, v.gx0 + 30, v.y - 40, 0);
        B.parExtra += 1;
      } },
      { id: 'portalup', goal: true, build(B, c) {
        B.flat(420); const ax = B.x - 200, gy = B.y;
        const H = 1050 + 150 * c.d;
        B.wallUp(H); const wx = B.x, top = B.y;
        B.flat(160); B.greenFlat(340); B.flat(200);
        portal(B, ax, gy - 26, -PI / 2, wx + 60, top - 40, -0.25);
      } },
    ],
  });

  // =====================================================================================
  // ANTIGRAV
  // =====================================================================================
  const anti = (B, x, y, w, h, g) => B.add({ t: 'antigrav', x: I(x), y: I(y), w: I(w), h: I(h), g: F3(g) });
  // gravity flips inside a box spanning a gorge: the ball floats along the box's top edge until it leaves it
  function antiGorge(B, width, band) {
    const g = B.chasm(width, 400);
    anti(B, g.x0 + 20, g.y - band, g.x1 + 150 - (g.x0 + 20), g.fy - (g.y - band) - 6, -1);
    return g;
  }
  // tunnel over lava; inside it gravity points up so you roll along the ceiling
  function antiTunnel(B, c, pitW, tail) {
    const t = tun0(B);
    B.flat(260);
    const p = B.pit(pitW, 360);
    tail(B, p);
    const h = 150;
    t.x1 = B.x; t.top = t.y - h;
    roof(B, t.x0, B.x, t.top, { ref: t.y, s: B.sMain });
    anti(B, t.x0 + 120, t.top - 10, p.x1 + 20 - (t.x0 + 120), p.fy - t.top + 4, -1);
    return { t, p };
  }
  D.register('antigrav', {
    essential: true,
    pieces: [
      { id: 'antifloat', intro: true, build(B, c) { B.flat(200); antiGorge(B, 1400 + 300 * c.d, 220); B.flat(600); } },
      { id: 'antigap', build(B, c) { B.flat(200); antiGorge(B, 2400 + 300 * c.d, 260); B.flat(640); } },
      { id: 'antiroof', build(B, c) {
        antiTunnel(B, c, 1600 + 300 * c.d, (BB) => { BB.flat(300); });
        B.flat(30); B.flat(220);
      } },
      { id: 'antimesa', build(B, c) {
        B.flat(440);
        const H = 950 + 150 * c.d, wx = B.x, gy = B.y, top = gy - H;
        anti(B, wx - 320, top - 200, 320 + 520, H + 200, -1);
        B.wallUp(H);
        B.flat(900); B.cliff(H - 40); B.flat(320);
      } },
      { id: 'antiwall', goal: true, build(B, c) {
        B.flat(440);
        const H = 950 + 150 * c.d, wx = B.x, gy = B.y, top = gy - H;
        anti(B, wx - 320, top - 200, 320 + 520, H + 200, -1);
        B.wallUp(H);
        B.flat(560); B.greenFlat(320); B.flat(160);
      } },
      { id: 'anticave', goal: true, build(B, c) {
        antiTunnel(B, c, 1500 + 300 * c.d, (BB) => { BB.flat(60); BB.greenFlat(320, { cupFrac: 0.6 }); BB.flat(60); });
        B.wallUp(200);
      } },
    ],
  });

  // =====================================================================================
  // TOGGLE
  // =====================================================================================
  const rects = (arr) => arr.map((r) => r.map(I));
  const tog = (B, sx, sy, a, b) => B.add({ t: 'toggle', sx: I(sx), sy: I(sy), a: rects(a), b: rects(b) });
  D.register('toggle', {
    essential: false,
    pieces: [
      { id: 'togglebar', intro: true, build(B, c) {
        const t = B.corridor(900 + 200 * c.d), L = t.x1 - t.x0, hh = t.y - t.top + 4;
        tog(B, t.x0 + 230, t.y - 8, [[t.x0 + L * 0.68, t.top, 24, hh]], [[t.x0 + 90, t.top, 24, hh]]);
        B.flat(200);
      } },
      { id: 'toggleswap', build(B, c) {
        // two lava pits in a low tunnel; the switch between them swaps which one is bridged
        const t = tun0(B);
        B.flat(220); const p1 = B.pit(480 + 120 * c.d, 300);
        B.flat(140); const sx = B.x; B.flat(140);
        const p2 = B.pit(480 + 120 * c.d, 300); B.flat(220);
        tun1(B, t, 100);
        const br = (p) => [p.x0 - 2, p.y0, p.x1 - p.x0 + 4, 18];
        tog(B, sx, t.y - 8, [br(p1)], [br(p2)]);
        B.flat(200);
      } },
      { id: 'togglestair', build(B, c) {
        // a cliff too tall to climb; the switch makes steps appear on its face
        B.flat(460);
        const H = 1000 + 100 * c.d, wx = B.x, gy = B.y;
        const step = (x, y, w) => [[x, y, w, 24], [x + w - 12, y - 22, 12, 22]];
        const s1 = step(wx - 520, gy - 340, 190), s2 = step(wx - 250, gy - 680, 190);
        tog(B, wx - 150, gy - 8, [], s1.concat(s2));
        B.wallUp(H); B.flat(700); B.cliff(H - 40); B.flat(300);
      } },
      { id: 'toggleperch', build(B, c) {
        // switch on a perch above the path; flipping it opens the tunnel but locks the perch
        B.flat(300);
        const px = B.x - 140, py = B.y - 150 - 60 * c.d;
        B.addSolid([px - 44, py, px + 44, py, px + 34, py + 30, px - 34, py + 30], 'kkkk');
        B.flat(160);
        const t = B.corridor(700 + 200 * c.d), hh = t.y - t.top + 4;
        tog(B, px, py - 12, [[t.x0 + 60, t.top, 24, hh]], [[px - 44, py - 40, 88, 14]]);
        B.flat(200);
      } },
      { id: 'togglevault', goal: true, build(B, c) {
        // green in a sealed vault; its door is one half of the toggle, a barrier on the approach the other
        B.flat(260);
        const sx = B.x - 130, sy = B.y - 230 - 80 * c.d;
        B.addSolid([sx - 50, sy, sx + 50, sy, sx + 40, sy + 34, sx - 40, sy + 34], 'kkkk');
        B.flat(120); const bx = B.x - 60, gy = B.y;
        const v = B.vault(400);
        B.solids.splice(B.solids.length - 3, 1);
        tog(B, sx, sy - 12, [[v.x0 - 30, v.top, 30, v.y - v.top + 4]], [[bx, gy - 60, 24, 60]]);
        B.parExtra += 1;
      } },
      { id: 'togglebridge', goal: true, build(B, c) {
        // the switch on the rim summons a bridge over the gorge (and drops the barrier on the far side)
        B.flat(340); const sx = B.x - 160, gy = B.y;
        const g = B.chasm(2000 + 300 * c.d, 400);
        B.flat(140); B.greenFlat(300); B.flat(160);
        tog(B, sx, gy - 8, [[g.x1 + 60, g.y1 - 170, 26, 170]], [[g.x0 - 4, g.y0, g.x1 - g.x0 + 8, 20]]);
      } },
    ],
  });

  // =====================================================================================
  // PISTON
  // =====================================================================================
  const pist = (B, x, y, w, h, dx, dy, T, ph) => B.add({ t: 'piston', x: I(x), y: I(y), w: I(w), h: I(h), dx: I(dx), dy: I(dy), T: F3(T), ph: F3(ph) });
  // floor piston rising out of the tunnel floor to (nearly) the ceiling
  const riser = (B, x, fy, h, T, ph) => { const ext = h - 32; pist(B, x - 30, fy, 60, ext + 30, 0, -ext, T, ph); };
  D.register('piston', {
    essential: false,
    pieces: [
      { id: 'pistonrise', intro: true, build(B, c) {
        const t = B.corridor(900 + 200 * c.d, { h: 130 });
        riser(B, t.x0 + (t.x1 - t.x0) * 0.55, t.y, 130, 2.6, c.rng.next());
        B.flat(200);
      } },
      { id: 'pistonrow', build(B, c) {
        const t = B.corridor(1400 + 200 * c.d, { h: 130 }), L = t.x1 - t.x0, ph = c.rng.next(), T = 2.4 - 0.3 * c.d;
        [0.27, 0.52, 0.77].forEach((f, i) => riser(B, t.x0 + L * f, t.y, 130, T, ph + i * 0.3));
        B.flat(200);
      } },
      { id: 'pistonbridge', build(B, c) {
        // a ram slides out of the rock to bridge a lava pit inside a low tunnel
        const t = tun0(B);
        B.flat(320);
        const p = B.pit(520 + 150 * c.d, 300);
        B.flat(320);
        tun1(B, t, 80);
        const W = p.x1 - p.x0 + 6;
        pist(B, p.x0 - W, p.y0, W, 22, W, 0, 3.4 - 0.4 * c.d, c.rng.next());
        B.flat(200);
      } },
      { id: 'pistonvault', goal: true, build(B, c) {
        B.flat(440);
        const v = B.vault(400 + 60 * c.d);
        B.solids.splice(B.solids.length - 3, 1);
        const ext = (v.y - v.top) - 30;
        pist(B, v.x0 - 30, v.y, 30, ext + 30, 0, -ext, 2.6, c.rng.next());
      } },
    ],
  });

  // =====================================================================================
  // VANISH
  // =====================================================================================
  const van = (B, x, y, w, h, T, on, ph) => B.add({ t: 'vanish', x: I(x), y: I(y), w: I(w), h: I(h), T: F3(T), on: F3(on), ph: F3(ph) });
  D.register('vanish', {
    essential: false,
    pieces: [
      { id: 'vanishstone', intro: true, build(B, c) {
        B.flat(200);
        const g = B.chasm(1950 + 200 * c.d, 380), cx = (g.x0 + g.x1) / 2;
        van(B, cx - 130, g.y - 10, 260, 40, 4, 0.7, c.rng.next());
        B.flat(500);
      } },
      { id: 'vanishhop', build(B, c) {
        B.flat(200);
        const g = B.chasm(2500 + 300 * c.d, 400), L = g.x1 - g.x0, w = 210 - 40 * c.d, ph = c.rng.next();
        [0.26, 0.5, 0.74].forEach((f, i) => van(B, g.x0 + L * f - w / 2, g.y - 10 - 30 * (i % 2), w, 40, 4.2, 0.62, ph + i * 0.33));
        B.flat(500);
      } },
      { id: 'vanishbridge', build(B, c) {
        const t = tun0(B);
        B.flat(300);
        const p = B.pit(700 + 200 * c.d, 300);
        B.flat(300);
        tun1(B, t, 110);
        const n = 4, w = (p.x1 - p.x0 + 4) / n, ph = c.rng.next();
        for (let i = 0; i < n; i++) van(B, p.x0 - 2 + i * w, p.y0, w + 1, 20, 3, 0.7, ph + i * 0.15);
        B.flat(200);
      } },
      { id: 'vanishwall', build(B, c) {
        const t = B.corridor(1000 + 200 * c.d), L = t.x1 - t.x0, ph = c.rng.next();
        van(B, t.x0 + L * 0.4, t.top, 26, t.y - t.top + 4, 2.6, 0.5, ph);
        van(B, t.x0 + L * 0.72, t.top, 26, t.y - t.top + 4, 2.6, 0.5, ph + 0.5);
        B.flat(200);
      } },
      { id: 'vanishgreen', goal: true, build(B, c) {
        B.flat(200);
        const g = B.chasm(2300 + 200 * c.d, 400), L = g.x1 - g.x0, ph = c.rng.next();
        van(B, g.x0 + L * 0.3 - 110, g.y - 10, 220, 40, 4.2, 0.62, ph);
        van(B, g.x0 + L * 0.55 - 110, g.y - 40, 220, 40, 4.2, 0.62, ph + 0.4);
        const cx = g.x0 + L * 0.8;
        B.islandGreen(cx - 160, cx + 160, g.y - 40, 80);
        B.flat(300);
      } },
    ],
  });
});
