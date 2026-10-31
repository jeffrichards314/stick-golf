/*
 * Gimmick designs (set A): conveyor, boost, bumper, oneway, fan, wind, breakable, sticky, ricochet,
 * cushion, spinner, movplat, skim, rotplat, lowgrav, tokens, seesaw, glass.
 * Same conventions as core.js: every piece builds a self-contained stretch of terrain from (B.x, B.y).
 */
(function (root, factory) {
  const isNode = typeof module === 'object' && module.exports;
  const D = isNode ? require('./registry.js') : root.GOLF.Designs;
  factory(D);
})(typeof self !== 'undefined' ? self : this, function (D) {
  'use strict';
  const PI = Math.PI;
  const r = Math.round;
  const f3 = (v) => +v.toFixed(3);

  // tunnel through a mountain (like B.corridor) whose floor is built by floorFn(x0, y)
  function tunnel(B, c, floorFn, opt) {
    opt = opt || {};
    const hgt = opt.h || c.rng.float(110, 140);
    B.flat(30);
    const fx0 = B.x, fy = B.y;
    floorFn(fx0, fy);
    const fx1 = B.x; B.flat(30);
    const top = Math.min(fy, B.y) - hgt, mid = (fx0 + fx1) / 2, peak = fy - (opt.peak || c.rng.float(980, 1060)), sh = Math.min(140, (fx1 - fx0) / 3);
    B.addSolid([fx0, top, fx1, top, fx1 + 50, top - 110, mid + sh, peak, mid - sh, peak - 20, fx0 - 50, top - 110]);
    return { x0: fx0, x1: fx1, y: fy, top };
  }

  // conveyor ramp rising h at angle th (deg) from the current point; terrain runs just below the belt
  function beltRamp(B, h, th, v) {
    const t = Math.tan(th * PI / 180), run = h / t;
    const xa = B.x, ya = B.y, xb = xa + run, yb = ya - h;
    B.to(xa + 20, ya, B.sMain);
    B.to(xb + 20, yb, 'k');
    B.add({ t: 'conveyor', x: r(xa), y: r(ya + 4), x2: r(xb), y2: r(yb + 3), v: r(v) });
    return { xa, ya, xb, yb };
  }

  // boost strip laid in a shallow trench: from current point, length len, rising -dy (dy<0 = up)
  function boostStrip(B, len, dy, v, a, lip) {
    const x0 = B.x, y0 = B.y;
    B.to(x0 + 5, y0 + 12, 'k');
    B.to(x0 + len, y0 + dy + 12, 'k');
    const gi = B.add({ t: 'boost', x: r(x0), y: r(y0 + 3), x2: r(x0 + len), y2: r(y0 + dy + 3), v: r(v), a: r(a || 9000) });
    if (!lip) B.to(B.x + 5, y0 + dy, B.sMain);
    return gi;
  }

  function addTokens(B, pts, rad) {
    const ex = B.gm.find((g) => g.t === 'tokens');
    const p = pts.map(r);
    if (ex) { if ((ex.pts.length >> 1) + (p.length >> 1) <= 24) ex.pts.push(...p); return; }
    B.add({ t: 'tokens', pts: p, r: rad || 16 });
  }

  // ======================= CONVEYOR =======================
  D.register('conveyor', {
    essential: true,
    pieces: [
      { id: 'beltstep', intro: true, build(B, c) {
        B.flat(220);
        beltRamp(B, 280 + 120 * c.d, 30, 420);
        B.flat(320);
      } },
      { id: 'beltclimb', essential: true, build(B, c) {
        B.flat(220);
        const h = 1040 + 140 * c.d;
        beltRamp(B, h, 38, 520 + 60 * c.d);
        B.flat(340);
        B.terrain(560, h * 0.45, null, { amp: 10 });
        B.flat(120);
      } },
      { id: 'beltbridge', essential: true, build(B, c) {
        B.flat(180);
        const W = 2100 + 250 * c.d, rise = 380 + 120 * c.d;
        const xa = B.x, ya = B.y;
        const g = B.chasm(W, 380, { dyEnd: -rise + 14 });
        B.flat(50); B.to(B.x + 40, B.y - 14, B.sMain);
        B.add({ t: 'conveyor', x: r(xa), y: r(ya + 4), x2: r(g.x1 + 30), y2: r(ya - rise + 4), v: r(560 + 80 * c.d) });
        B.flat(260);
      } },
      { id: 'beltmesa', goal: true, essential: true, build(B, c) {
        B.flat(240);
        beltRamp(B, 1060 + 120 * c.d, 40, 560);
        B.flat(140, 'r'); B.greenFlat(280); B.flat(100); B.wallUp(120); B.flat(80);
      } },
      { id: 'beltswitchback', essential: true, build(B, c) {
        B.flat(200);
        const h = 560 + 60 * c.d;
        beltRamp(B, h, 34, 480);
        B.flat(260, 'r');
        beltRamp(B, h, 34, 520);
        B.flat(300);
        B.terrain(620, h * 0.8, null, { amp: 10 });
      } },
      { id: 'beltbridgegreen', goal: true, essential: true, build(B, c) {
        B.flat(180);
        const W = 2050 + 200 * c.d, rise = 360 + 100 * c.d;
        const xa = B.x, ya = B.y;
        const g = B.chasm(W, 380, { dyEnd: -rise + 14 });
        B.flat(50); B.to(B.x + 40, B.y - 14, 'r');
        B.add({ t: 'conveyor', x: r(xa), y: r(ya + 4), x2: r(g.x1 + 30), y2: r(ya - rise + 4), v: r(520 + 60 * c.d) });
        B.flat(200, 'r'); B.greenFlat(260); B.flat(80); B.wallUp(140); B.flat(60);
      } },
    ],
  });

  // ======================= BOOST =======================
  // kicker: flat strip then ramp strip ending at a lip; returns lip point (ball centre) and ramp angle
  // ski-jump: a straight boost strip up an incline of thDeg, ending at a lip (ball launches at thDeg)
  function kicker(B, len, thDeg, v) {
    const th = thDeg * PI / 180, x0 = B.x, y0 = B.y, x1 = x0 + len * Math.cos(th), y1 = y0 - len * Math.sin(th);
    B.to(x0 + 6, y0 + 12, 'k');
    B.to(x1, y1 + 12, 'k');
    B.add({ t: 'boost', x: r(x0), y: r(y0 + 3), x2: r(x1), y2: r(y1 + 3), v: r(v), a: 20000 });
    return { x: x1, y: y1 + 3 - 9, th, n: 1 };
  }
  const setV = (B, k, v) => { for (let i = 1; i <= k.n; i++) B.gm[B.gm.length - i].v = r(v); };
  D.register('boost', {
    essential: true,
    pieces: [
      { id: 'boostrun', intro: true, build(B, c) {
        B.flat(160);
        const k = kicker(B, 520, 18, 1300);
        B.chasm(1750 + 150 * c.d, 320, { dyEnd: 12 + 140 });
        const land = B.x, landY = B.y;
        B.flat(700, 'r'); B.terrain(240, -60, 'r', { amp: 0 });
        const v = B.ballistic(k.x, k.y, land + 300, landY - 6, k.th);
        const vv = Math.min(2200, Math.max(1000, (v || 1400) * 1.03));
        setV(B, k, vv);
      } },
      { id: 'skijump', essential: true, build(B, c) {
        B.flat(160);
        const W = 2050 + 300 * c.d;
        const k = kicker(B, 640, 20, 1500);
        const g = B.chasm(W, 380, { dyEnd: 12 + 180 });
        const land = B.x, landY = B.y;
        B.flat(800, 'r'); B.terrain(300, -120, 'r', { amp: 0 });
        const v = B.ballistic(k.x, k.y, land + 380, landY - 6, k.th);
        setV(B, k, Math.min(2300, Math.max(1100, (v || 1600) * 1.02)));
        void g;
      } },
      { id: 'doublejump', essential: true, build(B, c) {
        B.flat(140);
        for (let i = 0; i < 2; i++) {
          const k = kicker(B, 560, 20, 1400);
          B.chasm(1950 + 150 * c.d, 380, { dyEnd: 12 + 160 });
          const land = B.x, landY = B.y;
          B.flat(i === 0 ? 900 : 700, 'r');
          const v = B.ballistic(k.x, k.y, land + 350, landY - 6, k.th);
          const vv = Math.min(2300, Math.max(1100, (v || 1500) * 1.03));
          setV(B, k, vv);
        }
        B.terrain(260, -80, 'r', { amp: 0 });
      } },
      { id: 'boostclimb', goal: true, essential: true, build(B, c) {
        B.flat(200);
        const h = 1040 + 120 * c.d, run = h / Math.tan(28 * PI / 180);
        // strip up the slope (trench below), ending a bit before the top so the ball rolls over the crest
        const x0 = B.x, y0 = B.y;
        B.to(x0 + 5, y0 + 12, 'k');
        B.to(x0 + run * 0.92, y0 - h * 0.92 + 12, 'k');
        B.add({ t: 'boost', x: r(x0), y: r(y0 + 3), x2: r(x0 + run * 0.92), y2: r(y0 - h * 0.92 + 3), v: r(1050 + 80 * c.d), a: 20000 });
        B.to(x0 + run, y0 - h, 'r');
        B.flat(500, 'r'); B.greenFlat(260); B.flat(60, 'r'); B.wallUp(200); B.flat(100);
      } },
      { id: 'boostridge', essential: true, build(B, c) {
        B.flat(200);
        const h = 1020 + 100 * c.d, run = h / Math.tan(26 * PI / 180);
        const x0 = B.x, y0 = B.y;
        B.to(x0 + 5, y0 + 12, 'k');
        B.to(x0 + run * 0.92, y0 - h * 0.92 + 12, 'k');
        B.add({ t: 'boost', x: r(x0), y: r(y0 + 3), x2: r(x0 + run * 0.92), y2: r(y0 - h * 0.92 + 3), v: r(1050 + 60 * c.d), a: 20000 });
        B.to(x0 + run, y0 - h, 'r');
        B.flat(700, 'r');
        B.terrain(700, h * 0.6, null, { amp: 10 });
      } },
      { id: 'boostmesa', goal: true, essential: true, build(B, c) {
        B.flat(160);
        const k = kicker(B, 620, 20, 1500);
        B.chasm(2050 + 250 * c.d, 380, { dyEnd: 12 + 180 });
        const land = B.x, landY = B.y;
        B.flat(560, 'r'); B.greenFlat(280); B.flat(60, 'r'); B.wallUp(220); B.flat(60);
        const v = B.ballistic(k.x, k.y, land + 260, landY - 6, k.th);
        setV(B, k, Math.min(2300, Math.max(1100, (v || 1600) * 1.0)));
      } },
    ],
  });

  // ======================= BUMPER =======================
  D.register('bumper', {
    essential: false,
    pieces: [
      { id: 'bumperbounce', intro: true, build(B, c) {
        // a friendly bumper in the middle of a gap too wide to carry: bounce off its top
        B.flat(200);
        const g = B.chasm(1850 + 150 * c.d, 360);
        B.add({ t: 'bumper', x: r((g.x0 + g.x1) / 2), y: r(g.y0 + 40), r: 40, boost: 900 });
        B.flat(360);
      } },
      { id: 'bumpertunnel', build(B, c) {
        const n = 2 + Math.round(c.d * 2);
        tunnel(B, c, () => {
          for (let i = 0; i < n; i++) {
            B.flat(300);
            const top = i % 2 === 0;
            B.add({ t: 'bumper', x: r(B.x - 150), y: r(top ? B.y - 60 : B.y - 20), r: top ? 30 : 20, boost: 620 });
          }
          B.flat(260);
        }, { h: 170 });
        B.flat(180);
      } },
      { id: 'bumperhop', essential: true, build(B, c) {
        B.flat(200);
        const g = B.chasm(2150 + 250 * c.d, 380);
        const x = g.x0 + (g.x1 - g.x0) * 0.5;
        B.add({ t: 'bumper', x: r(x), y: r(g.y0 + 60), r: 36, boost: r(950 + 100 * c.d) });
        B.flat(420);
      } },
      { id: 'bumperwall', goal: true, essential: true, build(B, c) {
        B.flat(460);
        const bx = B.x - 170, by = B.y - 210;
        B.add({ t: 'bumper', x: r(bx), y: r(by), r: 40, boost: r(1480 + 80 * c.d) });
        B.wallUp(1020 + 80 * c.d);
        B.flat(180); B.greenFlat(280); B.flat(80); B.wallUp(140); B.flat(60);
      } },
      { id: 'bumperpair', essential: true, build(B, c) {
        B.flat(200);
        const g = B.chasm(2900 + 200 * c.d, 400);
        B.add({ t: 'bumper', x: r(g.x0 + (g.x1 - g.x0) * 0.36), y: r(g.y0 + 50), r: 34, boost: 950 });
        B.add({ t: 'bumper', x: r(g.x0 + (g.x1 - g.x0) * 0.68), y: r(g.y0 + 30), r: 34, boost: 950 });
        B.flat(420);
      } },
      { id: 'bumperisle', goal: true, essential: true, build(B, c) {
        B.flat(200);
        const g = B.chasm(2700 + 200 * c.d, 400);
        B.add({ t: 'bumper', x: r(g.x0 + 1050), y: r(g.y0 + 50), r: 38, boost: 950 });
        const ix = g.x0 + 2000 + 100 * c.d;
        B.islandGreen(ix - 170, ix + 170, g.y0 - 20, 80);
        B.flat(260);
      } },
    ],
  });

  // ======================= ONEWAY =======================
  const shelf = (B, x0, x1, y) => B.add({ t: 'oneway', x: r(x0), y: r(y), x2: r(x1), y2: r(y) });
  D.register('oneway', {
    essential: true,
    pieces: [
      { id: 'shelfhop', intro: true, build(B, c) {
        B.flat(160);
        const g = B.chasm(1850 + 150 * c.d, 320);
        const m = (g.x0 + g.x1) / 2;
        shelf(B, m - 170, m + 170, g.y0 - 120);
        B.flat(260);
      } },
      { id: 'onewaystairs', essential: true, build(B, c) {
        B.flat(200);
        const H = 1040 + 100 * c.d, n = 3, step = H / (n + 0.6);
        const g = B.chasm(900 + 120 * n, 380, { dyEnd: -H });
        for (let i = 0; i < n; i++) {
          const x0 = g.x0 + 260 + i * 200;
          shelf(B, x0, x0 + 320, g.y0 - step * (i + 1) + 40);
        }
        B.flat(360);
        B.terrain(620, H * 0.5, null, { amp: 10 });
      } },
      { id: 'onewayweave', essential: true, build(B, c) {
        B.flat(200);
        const g = B.chasm(2200 + 300 * c.d, 380);
        const a = g.x0 + (g.x1 - g.x0) * 0.36, b = g.x0 + (g.x1 - g.x0) * 0.66;
        shelf(B, a - 150, a + 150, g.y0 - 60);
        shelf(B, b - 150, b + 150, g.y0 - 260);
        // a rock canopy above the second shelf: you must come up through it from below-left
        B.addSolid([b - 200, g.y0 - 520, b + 220, g.y0 - 520, b + 220, g.y0 - 480, b - 200, g.y0 - 480]);
        B.flat(360);
      } },
      { id: 'onewayladder', goal: true, essential: true, build(B, c) {
        B.flat(260);
        const H = 1060 + 100 * c.d;
        const wx = B.x + 520;
        for (let i = 0; i < 3; i++) {
          const y = B.y - (i + 1) * H / 3.6;
          const x0 = i % 2 === 0 ? wx - 420 : wx - 300;
          shelf(B, x0, x0 + 300, y);
        }
        B.flat(520);
        B.wallUp(H);
        B.flat(120); B.greenFlat(260); B.flat(80); B.wallUp(120); B.flat(60);
      } },
      { id: 'onewaychimney', essential: true, build(B, c) {
        B.flat(220);
        const H = 1050 + 100 * c.d;
        const g = B.chasm(1100, 380, { dyEnd: -H });
        for (let i = 0; i < 3; i++) shelf(B, g.x1 - 340, g.x1 - 10, g.y0 - (i + 1) * H / 3.4);
        B.flat(360);
        B.terrain(620, H * 0.5, null, { amp: 10 });
      } },
      { id: 'onewayisle', goal: true, essential: true, build(B, c) {
        B.flat(220);
        const g = B.chasm(2000 + 200 * c.d, 380);
        const ix = g.x0 + 1250, iy = g.y0 - 960 - 40 * c.d;
        B.islandGreen(ix - 170, ix + 170, iy, 70);
        shelf(B, ix - 760, ix - 420, g.y0 - 320);
        shelf(B, ix - 500, ix - 180, g.y0 - 640);
        B.flat(300);
      } },
    ],
  });

  // ======================= FAN =======================
  const fan = (B, x, y, w, h, a, ang) => B.add({ t: 'fan', x: r(x), y: r(y), w: r(w), h: r(h), a: r(a), ang: f3(ang) });
  D.register('fan', {
    essential: true,
    pieces: [
      { id: 'fanhop', intro: true, build(B, c) {
        B.flat(160);
        const g = B.chasm(1850 + 150 * c.d, 340);
        const m = (g.x0 + g.x1) / 2;
        fan(B, m - 260, g.y0 - 200, 520, 200 + g.fy - g.y0 - 10, 1900, -PI / 2 + 0.3);
        B.flat(300);
      } },
      { id: 'fanlift', essential: true, build(B, c) {
        B.flat(460);
        const H = 1050 + 120 * c.d;
        fan(B, B.x - 240, B.y - H - 220, 230, H + 214, 1600 + 100 * c.d, -PI / 2 + 0.22);
        B.wallUp(H);
        B.flat(420);
        B.terrain(600, H * 0.45, null, { amp: 10 });
      } },
      { id: 'fanthermals', essential: true, build(B, c) {
        B.flat(200);
        const g = B.chasm(2300 + 300 * c.d, 400);
        for (const fr of [0.33, 0.68]) {
          const m = g.x0 + (g.x1 - g.x0) * fr;
          fan(B, m - 230, g.y0 - 200, 460, g.fy - g.y0 + 190, 2000, -PI / 2 + 0.25);
        }
        B.flat(420);
      } },
      { id: 'fanplateau', goal: true, essential: true, build(B, c) {
        B.flat(480);
        const H = 1060 + 120 * c.d;
        fan(B, B.x - 250, B.y - H - 240, 240, H + 234, 1650 + 100 * c.d, -PI / 2 + 0.22);
        B.wallUp(H);
        B.flat(220); B.greenFlat(260); B.flat(80); B.wallUp(140); B.flat(60);
      } },
      { id: 'fanglide', essential: true, build(B, c) {
        tunnel(B, c, () => {
          B.flat(160);
          const g = B.pit(1700 + 200 * c.d, 340);
          fan(B, g.x0 - 60, g.y0 - 130, g.x1 - g.x0 - 100, g.fy - g.y0 + 120, 1150, -PI / 2 + 0.7);
          B.flat(240);
        }, { h: 130 });
        B.flat(200);
      } },
      { id: 'fanisle', goal: true, essential: true, build(B, c) {
        // green on a sheer cliff across a gorge; an updraft hugging the cliff face carries you up and over the lip
        B.flat(220);
        const H = 1000 + 100 * c.d;
        const g = B.chasm(900 + 200 * c.d, 400, { dyEnd: -H });
        B.flat(120); B.greenFlat(280, { cupFrac: 0.6 }); B.flat(120);
        fan(B, g.x1 - 230, g.y1 - 380, 220, g.fy - g.y1 + 380, 1750, -PI / 2 + 0.1);
      } },
    ],
  });

  // ======================= WIND =======================
  const windZone = (B, x0, x1, ytop, ybot, ax, ay, c) => B.add({ t: 'wind', x: r(x0), y: r(ytop), w: r(x1 - x0), h: r(ybot - ytop), ax: r(ax), ay: r(ay || 0), gust: 0.2, f: 0.6, ph: f3(c.rng.float(0, 1)) });
  D.register('wind', {
    essential: true,
    pieces: [
      { id: 'breeze', intro: true, build(B, c) {
        B.flat(200);
        const g = B.chasm(1000 + 200 * c.d, 340);
        windZone(B, g.x0 - 200, g.x1 + 100, -900, g.fy, 260, 0, c);
        B.flat(300);
      } },
      { id: 'tailwind', essential: true, build(B, c) {
        B.flat(240);
        const g = B.chasm(2250 + 350 * c.d, 380);
        windZone(B, g.x0 - 220, g.x1 + 60, -900, g.fy, 520 + 120 * c.d, 0, c);
        B.flat(500);
      } },
      { id: 'updraft', essential: true, build(B, c) {
        B.flat(520);
        const H = 1060 + 120 * c.d;
        windZone(B, B.x - 420, B.x + 60, B.y - H - 260, B.y - 60, 140, -1350 - 80 * c.d, c);
        B.wallUp(H);
        B.flat(420);
        B.terrain(600, H * 0.45, null, { amp: 10 });
      } },
      { id: 'windisle', goal: true, essential: true, build(B, c) {
        B.flat(240);
        const g = B.chasm(2900 + 300 * c.d, 380);
        const ix = g.x0 + 2200 + 200 * c.d;
        B.islandGreen(ix - 160, ix + 160, g.y0 - 40, 80);
        windZone(B, g.x0 - 240, ix - 240, -900, g.fy, 500 + 100 * c.d, 0, c);
        B.flat(260);
      } },
      { id: 'windclimb', essential: true, build(B, c) {
        B.flat(240);
        const H = 650 + 100 * c.d;
        const g = B.chasm(1900 + 200 * c.d, 380, { dyEnd: -H });
        windZone(B, g.x0 - 200, g.x1 + 40, -900, g.fy, 360, -520 - 60 * c.d, c);
        B.flat(380);
        B.terrain(620, H * 0.6, null, { amp: 10 });
      } },
      { id: 'windmesa', goal: true, essential: true, build(B, c) {
        B.flat(520);
        const H = 1060 + 120 * c.d;
        windZone(B, B.x - 420, B.x + 60, B.y - H - 260, B.y - 60, 140, -1350 - 80 * c.d, c);
        B.wallUp(H);
        B.flat(200); B.greenFlat(260); B.flat(80); B.wallUp(140); B.flat(60);
      } },
    ],
  });

  // ======================= BREAKABLE =======================
  const brk = (B, x, y, w, h, th) => B.add({ t: 'breakable', x: r(x), y: r(y), w: r(w), h: r(h), th: r(th || 260) });
  D.register('breakable', {
    essential: false,
    pieces: [
      { id: 'crates', intro: true, build(B, c) {
        const t = tunnel(B, c, () => B.flat(600), { h: 150 });
        brk(B, t.x0 + 300, t.top - 4, 40, t.y - t.top + 8, 200);
        B.flat(200);
      } },
      { id: 'breaktunnel', build(B, c) {
        const t = tunnel(B, c, () => B.flat(800 + 200 * c.d));
        brk(B, t.x0 + (t.x1 - t.x0) * 0.55, t.top - 4, 34, t.y - t.top + 8, 260 + 60 * c.d);
        B.flat(200);
      } },
      { id: 'breakdouble', build(B, c) {
        const t = tunnel(B, c, () => { B.flat(500); B.cliff(-40); B.flat(600 + 200 * c.d); }, { h: 150 });
        brk(B, t.x0 + 300, t.top - 4, 30, t.y - t.top + 8, 260);
        brk(B, t.x1 - 260, t.top - 4, 40, t.y - 40 - t.top + 8, 380 + 80 * c.d);
        B.flat(200);
      } },
      { id: 'breakroof', goal: true, build(B, c) {
        B.flat(320);
        const fy = B.y, hgt = 170;
        const x0 = B.x;
        B.to(B.x + 30, B.y, 'r');
        const gx0 = B.x; B.to(B.x + 360, B.y, 'n'); const gx1 = B.x;
        B.to(B.x + 30, B.y, 'r');
        const x1 = B.x, top = fy - hgt;
        B.addSolid([x0 - 30, fy + 40, x0, fy + 40, x0, top, x0 - 30, top]);
        B.addSolid([x1, fy + 40, x1 + 30, fy + 40, x1 + 30, top, x1, top]);
        brk(B, x0 - 40, top - 40, x1 - x0 + 80, 40, 300 + 100 * c.d);
        B.cup = [gx0 + (gx1 - gx0) * 0.55, fy]; B.green = [gx0, gx1, fy];
        B.flat(60);
      } },
      { id: 'breakdam', build(B, c) {
        B.flat(360);
        const H = 1100 + 60 * c.d;
        brk(B, B.x - 140, B.y - H, 50, H + 6, 300 + 80 * c.d);
        B.flat(300);
      } },
      { id: 'breakdoor', goal: true, build(B, c) {
        B.flat(300);
        const v = B.vault(380 + 60 * c.d);
        B.solids.splice(B.solids.length - 3, 1);
        brk(B, v.x0 - 30, v.top, 30, v.y - v.top + 4, 300 + 80 * c.d);
      } },
    ],
  });

  // ======================= STICKY =======================
  const goo = (B, x, y, w, h) => B.add({ t: 'sticky', x: r(x), y: r(y), w: r(w), h: r(h) });
  D.register('sticky', {
    essential: true,
    pieces: [
      { id: 'goopad', intro: true, build(B, c) {
        B.flat(180);
        const g = B.chasm(1100 + 200 * c.d, 320);
        const m = (g.x0 + g.x1) / 2;
        goo(B, m - 70, g.y0 - 30, 140, 40);
        B.flat(260);
      } },
      { id: 'goofloat', essential: true, build(B, c) {
        B.flat(200);
        const g = B.chasm(2250 + 300 * c.d, 380);
        const m = g.x0 + (g.x1 - g.x0) * 0.5;
        goo(B, m - 60, g.y0 - 180, 120, 70);
        B.flat(400);
      } },
      { id: 'goobars', essential: true, build(B, c) {
        B.flat(200);
        const g = B.chasm(2700 + 300 * c.d, 380);
        const a = g.x0 + (g.x1 - g.x0) * 0.33, b = g.x0 + (g.x1 - g.x0) * 0.66;
        goo(B, a - 50, g.y0 - 260, 100, 50);
        goo(B, b - 50, g.y0 - 460, 100, 50);
        B.flat(400);
      } },
      { id: 'goowall', goal: true, essential: true, build(B, c) {
        B.flat(480);
        const H = 1200 + 100 * c.d;
        const wx = B.x;
        goo(B, wx - 26, B.y - 720, 30, 380);
        B.wallUp(H);
        B.flat(160); B.greenFlat(260); B.flat(80); B.wallUp(140); B.flat(60);
      } },
      { id: 'goochimney', essential: true, build(B, c) {
        B.flat(460);
        const H = 1180 + 80 * c.d;
        goo(B, B.x - 26, B.y - 700, 30, 360);
        B.wallUp(H);
        B.flat(380);
        B.terrain(620, H * 0.45, null, { amp: 10 });
      } },
      { id: 'gooisle', goal: true, essential: true, build(B, c) {
        B.flat(220);
        const g = B.chasm(1900 + 200 * c.d, 380);
        const ix = g.x0 + 1150, iy = g.y0 - 960 - 60 * c.d;
        B.islandGreen(ix - 160, ix + 160, iy, 70);
        goo(B, ix - 420, iy + 330, 90, 60);
        B.flat(300);
      } },
    ],
  });

  // ======================= RICOCHET =======================
  const ric = (B, x, y, x2, y2) => B.add({ t: 'ricochet', x: r(x), y: r(y), x2: r(x2), y2: r(y2) });
  D.register('ricochet', {
    essential: false,
    pieces: [
      { id: 'rubberplate', intro: true, build(B, c) {
        B.flat(180);
        const g = B.chasm(900 + 200 * c.d, 340);
        const m = (g.x0 + g.x1) / 2;
        ric(B, m - 110, g.y0 + 130, m + 110, g.y0 + 110);
        B.flat(300);
      } },
      { id: 'trampoline', essential: true, build(B, c) {
        B.flat(200);
        const g = B.chasm(2150 + 250 * c.d, 400);
        const m = g.x0 + (g.x1 - g.x0) * 0.5;
        ric(B, m - 140, g.y0 + 90, m + 140, g.y0 + 90);
        B.flat(420);
      } },
      { id: 'pinballpit', build(B, c) {
        tunnel(B, c, (x0, y) => {
          B.flat(120);
          const g = B.pit(1500 + 200 * c.d, 360);
          const m = (g.x0 + g.x1) / 2;
          ric(B, m - 170, g.y0 + 150, m + 170, g.y0 + 150);
          B.flat(200);
        }, { h: 130 });
        B.flat(160);
      } },
      { id: 'bankshot', goal: true, build(B, c) {
        B.flat(300);
        const y = B.y, x0 = B.x;
        B.to(B.x + 40, y, 'r');
        const gx0 = B.x; B.to(B.x + 300, y, 'n'); const gx1 = B.x;
        B.to(B.x + 110, y, 'r');
        const wx = B.x;
        // closed nook: left wall + roof; open slot at the right next to the cliff
        B.addSolid([x0 - 30, y + 30, x0, y + 30, x0, y - 170, x0 - 30, y - 170]);
        B.addSolid([x0 - 30, y - 200, wx - 130, y - 200, wx - 130, y - 170, x0 - 30, y - 170]);
        ric(B, wx - 8, y - 30, wx - 8, y - 700);
        B.wallUp(1080 + 80 * c.d);
        B.cup = [gx0 + 120, y]; B.green = [gx0, gx1, y];
        B.flat(120);
      } },
      { id: 'trampchain', essential: true, build(B, c) {
        B.flat(200);
        const g = B.chasm(2900 + 200 * c.d, 400);
        for (const fr of [0.36, 0.68]) { const m = g.x0 + (g.x1 - g.x0) * fr; ric(B, m - 130, g.y0 + 90, m + 130, g.y0 + 90); }
        B.flat(420);
      } },
      { id: 'trampisle', goal: true, essential: true, build(B, c) {
        B.flat(200);
        const g = B.chasm(2700 + 200 * c.d, 400);
        const m = g.x0 + 1050;
        ric(B, m - 140, g.y0 + 90, m + 140, g.y0 + 90);
        const ix = g.x0 + 2000 + 100 * c.d;
        B.islandGreen(ix - 170, ix + 170, g.y0 - 20, 80);
        B.flat(260);
      } },
    ],
  });

  // ======================= CUSHION =======================
  const cloud = (B, x0, x1, y) => B.add({ t: 'cushion', x: r(x0), y: r(y), x2: r(x1), y2: r(y) });
  D.register('cushion', {
    essential: true,
    pieces: [
      { id: 'softcloud', intro: true, build(B, c) {
        B.flat(180);
        const g = B.chasm(1000 + 200 * c.d, 320);
        const m = (g.x0 + g.x1) / 2;
        cloud(B, m - 150, m + 150, g.y0 - 40);
        B.flat(260);
      } },
      { id: 'cloudsteps', essential: true, build(B, c) {
        B.flat(200);
        const g = B.chasm(2400 + 300 * c.d, 380);
        const a = g.x0 + (g.x1 - g.x0) * 0.33, b = g.x0 + (g.x1 - g.x0) * 0.67;
        cloud(B, a - 120, a + 120, g.y0 - 160);
        cloud(B, b - 120, b + 120, g.y0 + 40);
        B.flat(400);
      } },
      { id: 'deepdrop', essential: true, build(B, c) {
        B.flat(200);
        const drop = 800 + 120 * c.d;
        const g = B.chasm(2500 + 200 * c.d, drop + 420, { dyEnd: drop - 100 });
        const ix = g.x0 + 1150;
        B.island(ix - 150, ix + 150, g.y0 + drop, 'b', 60);
        cloud(B, ix - 140, ix + 140, g.y0 + drop - 14);
        B.flat(420);
      } },
      { id: 'cushionledge', goal: true, essential: true, build(B, c) {
        B.flat(200);
        const drop = 820 + 120 * c.d;
        const g = B.chasm(900, drop + 320, { dyEnd: drop });
        B.flat(260, 'b');
        cloud(B, g.x1 + 10, g.x1 + 250, B.y - 14);
        B.greenFlat(220, { cupFrac: 0.5 });
        B.chasm(500, 300, { dyEnd: -60 });
        B.flat(200);
      } },
      { id: 'cloudladder', essential: true, build(B, c) {
        B.flat(220);
        const H = 1040 + 80 * c.d;
        const g = B.chasm(1500, 380, { dyEnd: -H });
        cloud(B, g.x0 + 380, g.x0 + 680, g.y0 - 420);
        cloud(B, g.x0 + 900, g.x0 + 1200, g.y0 - 800);
        B.flat(360);
        B.terrain(620, H * 0.5, null, { amp: 10 });
      } },
      { id: 'cloudisle', goal: true, essential: true, build(B, c) {
        B.flat(200);
        const g = B.chasm(2700 + 200 * c.d, 400);
        const a = g.x0 + 1050;
        cloud(B, a - 140, a + 140, g.y0 - 120);
        const ix = g.x0 + 2050 + 100 * c.d;
        B.islandGreen(ix - 160, ix + 160, g.y0 - 60, 80);
        B.flat(260);
      } },
    ],
  });

  // ======================= SPINNER =======================
  const spin = (B, x, y, rad, w) => B.add({ t: 'spinner', x: r(x), y: r(y), r: r(rad), w: f3(w) });
  D.register('spinner', {
    essential: true,
    pieces: [
      { id: 'spinkick', intro: true, build(B, c) {
        B.flat(180);
        const g = B.chasm(1100 + 200 * c.d, 340);
        spin(B, g.x0 + (g.x1 - g.x0) * 0.45, g.y0 + 40, 60, 30);
        B.flat(300);
      } },
      { id: 'spinchasm', essential: true, build(B, c) {
        B.flat(200);
        const g = B.chasm(2250 + 250 * c.d, 400);
        spin(B, g.x0 + (g.x1 - g.x0) * 0.5, g.y0 + 40, 80, 45 + 6 * c.d);
        B.flat(420);
      } },
      { id: 'spinpair', essential: true, build(B, c) {
        B.flat(200);
        const g = B.chasm(2800 + 300 * c.d, 400, { dyEnd: -200 });
        spin(B, g.x0 + (g.x1 - g.x0) * 0.33, g.y0 + 60, 70, 42);
        spin(B, g.x0 + (g.x1 - g.x0) * 0.66, g.y0 - 60, 80, 48);
        B.flat(420);
      } },
      { id: 'spintower', goal: true, essential: true, build(B, c) {
        B.flat(520);
        const H = 1040 + 100 * c.d;
        spin(B, B.x - 230, B.y - 380, 90, 55);
        B.wallUp(H);
        B.flat(220); B.greenFlat(260); B.flat(80); B.wallUp(140); B.flat(60);
      } },
      { id: 'spinlift', essential: true, build(B, c) {
        B.flat(520);
        const H = 1020 + 80 * c.d;
        spin(B, B.x - 230, B.y - 380, 90, 55);
        B.wallUp(H);
        B.flat(420);
        B.terrain(620, H * 0.45, null, { amp: 10 });
      } },
      { id: 'spinisle', goal: true, essential: true, build(B, c) {
        B.flat(200);
        const g = B.chasm(2700 + 200 * c.d, 400);
        spin(B, g.x0 + 1050, g.y0 + 40, 80, 45);
        const ix = g.x0 + 2000 + 100 * c.d;
        B.islandGreen(ix - 170, ix + 170, g.y0 - 20, 80);
        B.flat(260);
      } },
    ],
  });

  // ======================= MOVPLAT =======================
  const plat = (B, x, y, x2, y2, w, T, ph) => B.add({ t: 'movplat', x: r(x), y: r(y), x2: r(x2), y2: r(y2), w: r(w), h: 24, T: f3(T), ph: f3(ph) });
  D.register('movplat', {
    essential: true,
    pieces: [
      { id: 'ferryhop', intro: true, build(B, c) {
        B.flat(180);
        const g = B.chasm(1100 + 200 * c.d, 340);
        plat(B, g.x0 + 80, g.y0, g.x1 - 300, g.y0, 220, 5, c.rng.float(0, 1));
        B.flat(260);
      } },
      { id: 'ferry', essential: true, build(B, c) {
        B.flat(200);
        const g = B.chasm(2400 + 300 * c.d, 380);
        plat(B, g.x0 + 120, g.y0 + 10, g.x1 - 360, g.y0 + 10, 240, 6 + 2 * c.d, c.rng.float(0, 1));
        B.flat(400);
      } },
      { id: 'skylift', essential: true, build(B, c) {
        B.flat(200);
        const H = 1000 + 100 * c.d;
        const g = B.chasm(1900 + 200 * c.d, 380, { dyEnd: -H });
        plat(B, g.x0 + 200, g.y0 + 20, g.x1 - 320, g.y0 - H + 140, 240, 7, c.rng.float(0, 1));
        B.flat(360);
        B.terrain(600, H * 0.45, null, { amp: 10 });
      } },
      { id: 'elevator', goal: true, essential: true, build(B, c) {
        B.flat(520);
        const H = 1050 + 100 * c.d;
        plat(B, B.x - 260, B.y - 60, B.x - 260, B.y - H + 40, 230, 6, c.rng.float(0, 1));
        B.wallUp(H);
        B.flat(200); B.greenFlat(260); B.flat(80); B.wallUp(140); B.flat(60);
      } },
      { id: 'ferrypair', essential: true, build(B, c) {
        B.flat(200);
        const g = B.chasm(3400 + 300 * c.d, 380);
        const m = (g.x0 + g.x1) / 2;
        plat(B, g.x0 + 120, g.y0 + 10, m - 300, g.y0 + 10, 220, 6, c.rng.float(0, 1));
        plat(B, m + 60, g.y0 - 60, g.x1 - 340, g.y0 - 60, 220, 7, c.rng.float(0, 1));
        B.flat(400);
      } },
      { id: 'ferrygreen', goal: true, essential: true, build(B, c) {
        B.flat(200);
        const g = B.chasm(2600 + 200 * c.d, 380);
        plat(B, g.x0 + 120, g.y0 + 10, g.x0 + 1500, g.y0 + 10, 240, 6.5, c.rng.float(0, 1));
        const ix = g.x0 + 2150 + 100 * c.d;
        B.islandGreen(ix - 170, ix + 170, g.y0 - 20, 80);
        B.flat(260);
      } },
    ],
  });

  // ======================= SKIM =======================
  function pond(B, W, opt) {
    opt = opt || {};
    const y = B.y;
    const g = B.pit(W, 70, { dyEnd: opt.dyEnd || 0 });
    B.add({ t: 'skim', x: r(g.x0), y: r(y), w: r(g.x1 - g.x0) });
    return g;
  }
  D.register('skim', {
    essential: true,
    pieces: [
      { id: 'pondhop', intro: true, build(B, c) {
        B.flat(200);
        pond(B, 800 + 200 * c.d);
        B.flat(300);
      } },
      { id: 'skimlake', essential: true, build(B, c) {
        B.flat(240);
        pond(B, 2300 + 500 * c.d);
        B.flat(300, 'r'); B.terrain(300, -60, 'r', { amp: 0 });
      } },
      { id: 'skimtunnel', essential: true, build(B, c) {
        tunnel(B, c, () => { B.flat(160); pond(B, 1500 + 400 * c.d); B.flat(200, 'r'); }, { h: 110 });
        B.flat(200);
      } },
      { id: 'skimshore', goal: true, essential: true, build(B, c) {
        B.flat(240);
        pond(B, 2300 + 400 * c.d);
        B.flat(260, 'r'); B.greenFlat(260); B.flat(60, 'r'); B.wallUp(160); B.flat(60);
      } },
      { id: 'skimsteps', essential: true, build(B, c) {
        B.flat(220);
        pond(B, 1900 + 200 * c.d, { dyEnd: 60 });
        B.flat(260, 'r');
        pond(B, 1900 + 200 * c.d);
        B.flat(300, 'r');
      } },
      { id: 'skimcave', goal: true, essential: true, build(B, c) {
        tunnel(B, c, () => {
          B.flat(160); pond(B, 1700 + 300 * c.d); B.flat(200, 'r'); B.greenFlat(260); B.flat(60, 'r');
        }, { h: 110 });
        B.flat(100);
      } },
    ],
  });

  // ======================= ROTPLAT =======================
  // spin capped at 0.2 rad/s so a ball can actually settle on a plank during its near-level window
  const rot = (B, x, y, L, w, ph) => B.add({ t: 'rotplat', x: r(x), y: r(y), L: r(L), w: f3(Math.sign(w) * Math.min(0.2, Math.abs(w))), ph: f3(ph) });
  D.register('rotplat', {
    essential: true,
    pieces: [
      { id: 'paddle', intro: true, build(B, c) {
        B.flat(180);
        const g = B.chasm(1950 + 100 * c.d, 340);
        rot(B, (g.x0 + g.x1) / 2, g.y0 + 10, 420, 0.15, c.rng.float(0, 3));
        B.flat(260);
      } },
      { id: 'rotstones', essential: true, build(B, c) {
        B.flat(200);
        const g = B.chasm(2300 + 300 * c.d, 380);
        rot(B, g.x0 + (g.x1 - g.x0) * 0.36, g.y0 + 10, 360, 0.55, c.rng.float(0, 3));
        rot(B, g.x0 + (g.x1 - g.x0) * 0.66, g.y0 - 40, 360, -0.6, c.rng.float(0, 3));
        B.parExtra += 1;
        B.flat(400);
      } },
      { id: 'turntable', essential: true, build(B, c) {
        B.flat(200);
        const W = 2100 + 200 * c.d;
        const g = B.chasm(W, 400);
        rot(B, (g.x0 + g.x1) / 2, g.y0 + 30, W - 300, 0.3, c.rng.float(0, 3));
        B.flat(400);
      } },
      { id: 'rotisle', goal: true, essential: true, build(B, c) {
        B.flat(200);
        const g = B.chasm(2600 + 200 * c.d, 380);
        const a = g.x0 + 1050;
        rot(B, a, g.y0 + 10, 360, 0.5, c.rng.float(0, 3));
        const ix = g.x0 + 2050 + 100 * c.d;
        B.islandGreen(ix - 160, ix + 160, g.y0 - 40, 80);
        B.flat(260);
      } },
      { id: 'rotchain', essential: true, build(B, c) {
        B.flat(200);
        const g = B.chasm(2600 + 200 * c.d, 380);
        for (const [fr, w, dy] of [[0.27, 0.16, 10], [0.52, -0.14, -40], [0.77, 0.16, 10]]) rot(B, g.x0 + (g.x1 - g.x0) * fr, g.y0 + dy, 400, w, c.rng.float(0, 3));
        B.parExtra += 2; // three separate landings
        B.flat(400);
      } },
      { id: 'turntablegreen', goal: true, essential: true, build(B, c) {
        B.flat(200);
        const W = 2050 + 150 * c.d;
        const g = B.chasm(W, 400);
        rot(B, (g.x0 + g.x1) / 2, g.y0 + 30, W - 300, 0.3, c.rng.float(0, 3));
        B.flat(160, 'r'); B.greenFlat(260); B.flat(80); B.wallUp(140); B.flat(60);
      } },
    ],
  });

  // ======================= LOWGRAV =======================
  const moon = (B, x0, x1, y0, y1, g) => B.add({ t: 'lowgrav', x: r(x0), y: r(y0), w: r(x1 - x0), h: r(y1 - y0), g: f3(g) });
  D.register('lowgrav', {
    essential: true,
    pieces: [
      { id: 'moonhop', intro: true, build(B, c) {
        B.flat(200);
        const g = B.chasm(1200 + 200 * c.d, 340);
        moon(B, g.x0 - 100, g.x1 + 100, -900, g.fy, 0.6);
        B.flat(300);
      } },
      { id: 'moonchasm', essential: true, build(B, c) {
        B.flat(260);
        const g = B.chasm(2700 + 400 * c.d, 380);
        moon(B, g.x0 - 160, g.x1 + 120, -900, g.fy + 10, 0.45 - 0.05 * c.d);
        B.flat(420, 'r');
      } },
      { id: 'moonband', essential: true, build(B, c) {
        B.flat(240);
        const g = B.chasm(2500 + 300 * c.d, 380);
        moon(B, g.x0 - 100, g.x1 - 200, g.y0 - 900, g.y0 - 380, 0.22);
        B.flat(420, 'r');
      } },
      { id: 'moonwall', goal: true, essential: true, build(B, c) {
        B.flat(520);
        const H = 1250 + 100 * c.d;
        moon(B, B.x - 700, B.x + 500, B.y - H - 700, B.y + 10, 0.45);
        B.wallUp(H);
        B.flat(160); B.greenFlat(260); B.flat(80); B.wallUp(140); B.flat(60);
      } },
      { id: 'moonclimb', essential: true, build(B, c) {
        B.flat(520);
        const H = 1250 + 80 * c.d;
        moon(B, B.x - 700, B.x + 500, B.y - H - 700, B.y + 10, 0.45);
        B.wallUp(H);
        B.flat(420);
        B.terrain(640, H * 0.45, null, { amp: 10 });
      } },
      { id: 'moonisle', goal: true, essential: true, build(B, c) {
        B.flat(240);
        const g = B.chasm(2700 + 300 * c.d, 380);
        const ix = g.x0 + 2000 + 200 * c.d, iy = g.y0 - 500 - 100 * c.d;
        B.islandGreen(ix - 160, ix + 160, iy, 70);
        moon(B, g.x0 - 160, g.x1 + 100, -900, g.fy + 10, 0.4);
        B.flat(300);
      } },
    ],
  });

  // ======================= TOKENS =======================
  D.register('tokens', {
    essential: true,
    pieces: [
      { id: 'tokentrail', intro: true, build(B, c) {
        B.flat(240);
        const pts = [];
        for (let i = 0; i < 3; i++) { B.terrain(300, c.rng.float(-30, 30), null, { amp: 6 }); pts.push(B.x - 150, B.gy(B.x - 150) - 20 - (i === 1 ? 140 : 0)); }
        addTokens(B, pts);
        B.flat(160);
      } },
      { id: 'tokenarc', build(B, c) {
        B.flat(200);
        const g = B.chasm(1200 + 200 * c.d, 360);
        const x0 = g.x0 - 60, x1 = g.x1 + 120, hpk = 520 + 120 * c.d;
        const pts = [];
        for (const t of [0.3, 0.5, 0.7]) pts.push(x0 + (x1 - x0) * t, g.y0 - 10 - 4 * hpk * t * (1 - t));
        addTokens(B, pts, 18);
        B.flat(320);
      } },
      { id: 'tokenpit', build(B, c) {
        B.flat(200);
        const dep = 300 + 100 * c.d;
        B.terrain(220, dep, 'r', { amp: 0, smooth: true, noPatch: true });
        B.flat(120, 'r');
        const px = B.x - 60, py = B.y - 20;
        B.terrain(240, -dep, 'r', { amp: 0, smooth: true, noPatch: true });
        B.flat(260);
        B.wallUp(220); B.flat(140);
        const qx = B.x - 70, qy = B.y - 20;
        B.flat(120); B.cliff(220); B.flat(200);
        addTokens(B, [px, py, qx, qy]);
      } },
      { id: 'tokenbeyond', goal: true, build(B, c) {
        B.flat(220);
        const ax = B.x - 80;
        B.flat(140);
        addTokens(B, [ax, B.y - 380 - 100 * c.d]);
        B.greenFlat(260);
        B.flat(260);
        B.terrain(260, -240 - 80 * c.d, null, { amp: 0 });
        B.flat(160);
        addTokens(B, [B.x - 80, B.y - 20]);
        B.flat(60); B.wallUp(200); B.flat(60);
      } },
      { id: 'tokentower', build(B, c) {
        B.flat(260);
        const pts = [];
        B.flat(200); B.wallUp(260 + 80 * c.d); B.flat(160); pts.push(B.x - 80, B.y - 20); B.cliff(260 + 80 * c.d);
        B.flat(420); pts.push(B.x - 200, B.y - 300 - 80 * c.d);
        B.flat(200);
        addTokens(B, pts);
      } },
      { id: 'tokenring', goal: true, build(B, c) {
        B.flat(200);
        const g = B.chasm(900 + 100 * c.d, 340);
        const m = (g.x0 + g.x1) / 2;
        addTokens(B, [m, g.y0 - 300 - 60 * c.d]);
        B.flat(120); B.greenFlat(260); B.flat(200);
        const px = B.x - 60;
        B.wallUp(300 + 60 * c.d); B.flat(160);
        addTokens(B, [B.x - 80, B.y - 20, px - 180, B.y - 180]);
        B.flat(80); B.wallUp(160); B.flat(60);
      } },
    ],
  });

  // ======================= SEESAW =======================
  const saw = (B, x, y, L, max, k) => B.add({ t: 'seesaw', x: r(x), y: r(y), L: r(L), max: f3(max), k: f3(k || 0.06) });
  D.register('seesaw', {
    essential: true,
    pieces: [
      { id: 'teeter', intro: true, build(B, c) {
        B.flat(220);
        const g = B.chasm(520, 320);
        saw(B, (g.x0 + g.x1) / 2, g.y0 + 6, 470, 0.3);
        B.flat(300);
      } },
      { id: 'teetertunnel', essential: true, build(B, c) {
        tunnel(B, c, () => {
          B.flat(140);
          const g = B.pit(1300, 340);
          saw(B, g.x0 + 330, g.y0 + 6, 620, 0.25);
          saw(B, g.x1 - 330, g.y0 + 6, 620, 0.25);
          B.flat(200);
        }, { h: 95 });
        B.flat(200);
      } },
      { id: 'teeterchasm', essential: true, build(B, c) {
        B.flat(200);
        const g = B.chasm(2300 + 200 * c.d, 380);
        saw(B, g.x0 + (g.x1 - g.x0) * 0.34, g.y0 + 6, 440, 0.16);
        saw(B, g.x0 + (g.x1 - g.x0) * 0.67, g.y0 - 60, 440, 0.16);
        B.flat(400);
      } },
      { id: 'teetergreen', goal: true, essential: true, build(B, c) {
        tunnel(B, c, () => {
          B.flat(140);
          const g = B.pit(1200, 340);
          saw(B, g.x0 + 300, g.y0 + 6, 560, 0.25);
          saw(B, g.x1 - 300, g.y0 + 6, 560, 0.25);
          B.flat(60, 'r'); B.greenFlat(260); B.flat(60, 'r');
        }, { h: 95 });
        B.flat(100);
      } },
      { id: 'teeterdrop', essential: true, build(B, c) {
        tunnel(B, c, () => {
          B.flat(140);
          const g = B.pit(1250, 340, { dyEnd: 60 });
          saw(B, g.x0 + 320, g.y0 + 6, 600, 0.25);
          saw(B, g.x1 - 320, g.y0 + 36, 600, 0.25);
          B.flat(240);
        }, { h: 95 });
        B.flat(200);
      } },
      { id: 'teeterisle', goal: true, essential: true, build(B, c) {
        B.flat(200);
        const g = B.chasm(2600 + 200 * c.d, 380);
        saw(B, g.x0 + 1050, g.y0 + 6, 440, 0.16);
        const ix = g.x0 + 2000 + 100 * c.d;
        B.islandGreen(ix - 170, ix + 170, g.y0 - 20, 80);
        B.flat(260);
      } },
    ],
  });

  // ======================= GLASS =======================
  const glass = (B, x, y, w, h, th) => B.add({ t: 'glass', x: r(x), y: r(y), w: r(w), h: r(h), th: r(th || 380) });
  D.register('glass', {
    essential: true,
    pieces: [
      { id: 'glasspane', intro: true, build(B, c) {
        B.flat(220);
        const g = B.chasm(800 + 200 * c.d, 320);
        glass(B, g.x0, g.y0 + 1, g.x1 - g.x0, 18, 380);
        B.flat(300);
      } },
      { id: 'glassbridge', essential: true, build(B, c) {
        B.flat(260);
        const g = B.chasm(2100 + 250 * c.d, 380);
        glass(B, g.x0, g.y0 + 1, g.x1 - g.x0, 18, 360);
        B.flat(360);
      } },
      { id: 'glassstones', essential: true, build(B, c) {
        B.flat(240);
        const g = B.chasm(2000 + 150 * c.d, 380);
        const n = 3, sw = 200, gap = (g.x1 - g.x0 - n * sw) / (n + 1);
        for (let i = 0; i < n; i++) glass(B, g.x0 + gap + i * (sw + gap), g.y0 - 20 * (i % 2), sw, 22, 520);
        B.flat(360);
      } },
      { id: 'glassroof', goal: true, build(B, c) {
        B.flat(320);
        const fy = B.y, hgt = 160;
        const x0 = B.x;
        B.to(B.x + 30, B.y, 'r');
        const gx0 = B.x; B.to(B.x + 340, B.y, 'n'); const gx1 = B.x;
        B.to(B.x + 30, B.y, 'r');
        const x1 = B.x, top = fy - hgt;
        B.addSolid([x0 - 30, fy + 40, x0, fy + 40, x0, top, x0 - 30, top]);
        B.addSolid([x1, fy + 40, x1 + 30, fy + 40, x1 + 30, top, x1, top]);
        glass(B, x0 - 40, top - 26, x1 - x0 + 80, 26, 560 + 100 * c.d);
        B.cup = [gx0 + (gx1 - gx0) * 0.5, fy]; B.green = [gx0, gx1, fy];
        B.flat(60);
      } },
      { id: 'glasstunnel', essential: true, build(B, c) {
        tunnel(B, c, () => {
          B.flat(140);
          const g = B.pit(1500 + 200 * c.d, 340);
          glass(B, g.x0, g.y0 + 1, g.x1 - g.x0, 18, 360);
          B.flat(200);
        }, { h: 120 });
        B.flat(200);
      } },
      { id: 'glassgreen', goal: true, essential: true, build(B, c) {
        B.flat(260);
        const g = B.chasm(2050 + 200 * c.d, 380);
        glass(B, g.x0, g.y0 + 1, g.x1 - g.x0, 18, 360);
        B.flat(160, 'r'); B.greenFlat(260); B.flat(80); B.wallUp(140); B.flat(60);
      } },
    ],
  });
});
