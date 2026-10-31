/*
 * Gimmick designs (part C): crumble, gwell, sidegrav, spikes, saw, laser, slowmo, mine, crusher, phase,
 * tornado, blackhole, fog, decoy, movcup, liftcup, blinkcup, shrinkcup, flood.
 * Same structure as core.js: each piece builds a self-contained stretch from (B.x, B.y).
 */
(function (root, factory) {
  const isNode = typeof module === 'object' && module.exports;
  const D = isNode ? require('./registry.js') : root.GOLF.Designs;
  factory(D);
})(typeof self !== 'undefined' ? self : this, function (D) {
  'use strict';
  const PI = Math.PI;
  const rd = Math.round;
  const fx = (v, n) => +v.toFixed(n === undefined ? 3 : n);

  // ---------------- shared helpers ----------------
  // Mountain roof over the floor built since point index i0 (tunnel that can't be overflown).
  function roof(B, i0, hgt, peak) {
    const p = B.pts;
    let maxY = -1e9;
    for (let i = i0; i < p.length; i += 2) maxY = Math.max(maxY, Math.min(p[i + 1], Math.max(p[i0 + 1], B.y)));
    const x0 = p[i0], y0 = p[i0 + 1] - hgt, x1 = B.x, y1 = B.y - hgt;
    const mid = (x0 + x1) / 2, sh = Math.min(140, (x1 - x0) / 3), py = maxY - (peak || 1020);
    B.addSolid([x0, y0, x1, y1, x1 + 50, y1 - 110, mid + sh, py, mid - sh, py - 20, x0 - 50, y0 - 110]);
    return { x0, x1, top: Math.min(y0, y1) };
  }
  // flat tunnel: returns {x0,x1,y,top}
  function tunnel(B, len, hgt, c) {
    B.flat(30);
    const i0 = B.pts.length - 2, y = B.y;
    B.flat(len);
    const r = roof(B, i0, hgt, c && c.rng ? c.rng.float(980, 1060) : 1020);
    B.flat(30);
    return { x0: r.x0, x1: r.x1, y, top: y - hgt };
  }
  // cup-modifier mid pieces patch the final green after the hole is built.
  // Own-course modifier runs first; foreign ones are deferred and skip if a conflicting modifier exists.
  const CUPMOVE = { movcup: 1, liftcup: 1, blinkcup: 1 };
  function cupPost(B, type, fn) {
    const own = B.ctx.sig === type;
    const run = (BB, hole) => {
      if (CUPMOVE[type] && B.gm.some((g) => CUPMOVE[g.t])) return;
      if (!CUPMOVE[type] && B.gm.some((g) => g.t === type)) return;
      fn(BB, hole);
    };
    if (own) B.post.push(run); else B.post.push(() => { B.post.push(run); });
  }

  // =====================================================================
  // CRUMBLE — bridges that collapse moments after the ball touches them
  // =====================================================================
  function tiles(B, x0, x1, y, opt) {
    opt = opt || {};
    const w = opt.w || 110, h = opt.h || 36, dl = opt.delay || 0.6, step = opt.step || 0;
    const n = Math.max(1, Math.round((x1 - x0) / w)), tw = (x1 - x0) / n;
    for (let i = 0; i < n; i++) B.add({ t: 'crumble', x: rd(x0 + i * tw), y: rd(y + i * step), w: rd(tw), h, delay: fx(dl, 2) });
  }
  const crDelay = (c) => 0.65 - 0.25 * c.d;
  D.register('crumble', {
    essential: true,
    pieces: [
      { id: 'crumblebridge', intro: true, build(B, c) {
        B.flat(200);
        const g = B.chasm(2000 + 150 * c.d, 380);
        tiles(B, g.x0 + 560, g.x1, g.y0, { delay: crDelay(c) + 0.1 });
        B.flat(320);
      } },
      { id: 'crumblechute', build(B, c) {
        // a stepped bridge that drops toward a lower far bank: keep rolling or fall
        B.flat(220);
        const drop = 160 + 80 * c.d;
        const g = B.chasm(2100 + 200 * c.d, 420, { dyEnd: drop });
        const x0 = g.x0 + 520, n = Math.round((g.x1 - x0) / 110);
        tiles(B, x0, g.x1, g.y0 + 10, { delay: crDelay(c), step: drop / n - 0.5 });
        B.flat(300);
      } },
      { id: 'crumbletunnel', build(B, c) {
        // tunnel whose floor is a lava trench covered by crumbling slabs
        B.flat(60);
        const i0 = B.pts.length - 2, fy = B.y;
        B.flat(220);
        const g = B.pit(1180 + 200 * c.d, 260);
        B.flat(260);
        roof(B, i0, 110, c.rng.float(980, 1060));
        tiles(B, g.x0, g.x1, fy, { delay: crDelay(c) + 0.15, w: 90 });
        B.flat(40);
      } },
      { id: 'crumblegreen', goal: true, build(B, c) {
        B.flat(200);
        const g = B.chasm(2000 + 200 * c.d, 400);
        tiles(B, g.x0 + 600, g.x1, g.y0, { delay: crDelay(c) + 0.05 });
        B.greenFlat(280, { cupFrac: 0.55 }); B.flat(160);
      } },
      { id: 'crumbleisland', goal: true, build(B, c) {
        // island green out in a vast chasm, only reachable over a crumbling causeway
        B.flat(200);
        const g = B.chasm(2700 + 200 * c.d, 420);
        const ix0 = g.x0 + 2050 + 100 * c.d, ix1 = ix0 + 300;
        B.islandGreen(ix0, ix1, g.y0, 80);
        B.cup[0] = (ix0 + ix1) / 2 + 30;
        tiles(B, g.x0 + 640, ix0, g.y0, { delay: crDelay(c) + 0.05 });
        B.flat(200);
      } },

      { id: 'crumbleplug', build(B, c) {
        // tunnel sealed by crumbling plugs: knock one, wait for it to fall, go on
        const t = tunnel(B, 900 + 300 * c.d, 130, c);
        const n = 1 + (c.d > 0.45 ? 1 : 0);
        for (let i = 0; i < n; i++) {
          const x = t.x0 + (t.x1 - t.x0) * (i + 1) / (n + 1);
          B.add({ t: 'crumble', x: rd(x - 22), y: rd(t.top - 4), w: 44, h: rd(t.y - t.top + 4), delay: fx(crDelay(c), 2) });
        }
        B.flat(160);
      } },
    ],
  });

  // =====================================================================
  // GWELL — attract (k>0) / repel (k<0) orbs
  // =====================================================================
  D.register('gwell', {
    essential: true,
    pieces: [
      { id: 'gwellbounce', intro: true, build(B, c) {
        // a repulsor deep in a chasm acts as a soft trampoline
        B.flat(220);
        const g = B.chasm(2050 + 150 * c.d, 520);
        const mx = (g.x0 + g.x1) / 2 - 80;
        B.add({ t: 'gwell', x: rd(mx), y: rd(g.fy - 40), r: 420, k: -12000 });
        B.flat(320);
      } },
      { id: 'gwelltwin', build(B, c) {
        // two repulsors: bounce-bounce across a vast pit
        B.flat(220);
        const g = B.chasm(3000 + 300 * c.d, 520);
        const w = g.x1 - g.x0;
        B.add({ t: 'gwell', x: rd(g.x0 + w * 0.3), y: rd(g.fy - 40), r: 420, k: -12000 });
        B.add({ t: 'gwell', x: rd(g.x0 + w * 0.68), y: rd(g.fy - 40), r: 420, k: -12000 });
        B.flat(320);
      } },
      { id: 'gwellsling', build(B, c) {
        // a "planet" sitting on a towering mesa pulls lofted shots up onto it; roll off the far side
        B.flat(420);
        const h = 1000 + 60 * c.d;
        const wx = B.x;
        B.wallUp(h);
        const top = B.y;
        B.flat(420);
        B.cliff(h - 60);
        B.flat(360);
        B.add({ t: 'gwell', x: rd(wx + 190), y: rd(top - 30), r: 1200, k: 5000 });
      } },
      { id: 'gwellperch', goal: true, build(B, c) {
        // green on a high perch; a planet beside the cup hauls lobbed shots up onto it
        B.flat(420);
        const h = 1000 + 80 * c.d;
        const wx = B.x;
        B.wallUp(h);
        B.flat(60); B.greenFlat(320, { cupFrac: 0.6 }); B.flat(160);
        B.add({ t: 'gwell', x: rd(wx + 170), y: rd(B.y - 30), r: 1200, k: 6000 });
      } },

      { id: 'gwellspring', build(B, c) {
        // repulsor trampoline in a chasm springs the ball up onto a higher far bank
        B.flat(220);
        const up = 300 + 150 * c.d;
        const g = B.chasm(2000 + 150 * c.d, 520, { dyEnd: -up });
        B.add({ t: 'gwell', x: rd(g.x0 + (g.x1 - g.x0) * 0.55), y: rd(g.fy - 40), r: 440, k: -13000 });
        B.flat(320);
      } },
      { id: 'gwellislegreen', goal: true, build(B, c) {
        // bounce off a repulsor onto an island green out in a vast chasm
        B.flat(220);
        const g = B.chasm(2500 + 200 * c.d, 520);
        const w = g.x1 - g.x0;
        B.add({ t: 'gwell', x: rd(g.x0 + w * 0.42), y: rd(g.fy - 40), r: 420, k: -12000 });
        const ix = g.x0 + w * 0.8;
        B.islandGreen(ix - 160, ix + 160, g.y0 - 40, 80);
        B.flat(260);
      } },
    ],
  });

  // =====================================================================
  // SIDEGRAV — zones where gravity points along (gx, gy)
  // =====================================================================
  D.register('sidegrav', {
    essential: true,
    pieces: [
      { id: 'sgwall', intro: true, build(B, c) {
        // an "upfall" lane hugging a sheer wall: gravity points up and to the right
        B.flat(360);
        const wx = B.x, gy0 = B.y, h = 1000 + 60 * c.d;
        B.wallUp(h);
        const top = B.y;
        B.flat(380);
        B.add({ t: 'sidegrav', x: rd(wx - 230), y: rd(top - 110), w: 230 + 150, h: rd(gy0 - top + 110), gx: 380, gy: -900 });
      } },
      { id: 'sgceiling', build(B, c) {
        // a tunnel over a lava trench: inside, gravity flips — roll along the ceiling
        B.flat(60);
        const i0 = B.pts.length - 2, fy = B.y, hgt = 150;
        B.flat(160);
        const g = B.pit(1400 + 300 * c.d, 240);
        B.flat(200);
        roof(B, i0, hgt, 1040);
        B.flat(30);
        B.add({ t: 'sidegrav', x: rd(g.x0 - 100), y: rd(fy - hgt - 20), w: rd(g.x1 - g.x0 + 110), h: rd(hgt + 140), gx: 520, gy: -900 });
      } },
      { id: 'sgriver', build(B, c) {
        // gravity points sideways over a vast chasm: the ball "falls" across it
        B.flat(260);
        const g = B.chasm(2300 + 300 * c.d, 420);
        B.add({ t: 'sidegrav', x: rd(g.x0 + 300), y: rd(g.y0 - 520), w: rd(g.x1 - g.x0 - 650), h: 520 + 300, gx: 900, gy: -120 });
        B.flat(320);
      } },
      { id: 'sgmesa', goal: true, build(B, c) {
        // a chimney of upward gravity, capped by a sideways band that tips the ball onto a mesa green
        B.flat(380);
        const wx = B.x, gy0 = B.y, h = 1040 + 80 * c.d;
        B.wallUp(h);
        const top = B.y;
        B.flat(120); B.greenFlat(280, { cupFrac: 0.55 }); B.flat(160);
        B.add({ t: 'sidegrav', x: rd(wx - 200), y: rd(top - 40), w: 200, h: rd(gy0 - top + 40), gx: 0, gy: -900 });
        B.add({ t: 'sidegrav', x: rd(wx - 200), y: rd(top - 170), w: 330, h: 130, gx: 900, gy: 0 });
      } },

      { id: 'sgupfall', build(B, c) {
        // a pit where gravity points up-and-over: fall in, fall out the far side
        B.flat(240);
        const g = B.chasm(2100 + 200 * c.d, 460);
        const w = g.x1 - g.x0;
        B.add({ t: 'sidegrav', x: rd(g.x0 + w * 0.35), y: rd(g.y0 - 120), w: rd(w * 0.5), h: rd(g.fy - g.y0 + 100), gx: 700, gy: -700 });
        B.flat(320);
      } },
      { id: 'sgsky', goal: true, build(B, c) {
        // a floating green high over a chasm: ride the up-gravity chimney, then get tipped onto it
        B.flat(260);
        const g = B.chasm(1500 + 200 * c.d, 420);
        const ix0 = g.x0 + 900, ix1 = ix0 + 320, iy = g.y0 - (980 + 60 * c.d);
        B.islandGreen(ix0, ix1, iy, 70);
        B.add({ t: 'sidegrav', x: rd(ix0 - 430), y: rd(iy - 30), w: 420, h: rd(g.fy - iy), gx: -160, gy: -900 });
        B.add({ t: 'sidegrav', x: rd(ix0 - 430), y: rd(iy - 170), w: 500, h: 140, gx: 420, gy: 0 });
        B.flat(260);
      } },
    ],
  });

  // =====================================================================
  // SPIKES — hazard strips
  // =====================================================================
  const spike = (B, x0, y0, x1, y1) => B.add({ t: 'spikes', x: rd(x0), y: rd(y0), x2: rd(x1), y2: rd(y1) });
  // lay spikes on the terrain just built from index i0 (skipping vertical-ish segments)
  function spikeGround(B, i0, xa, xb) {
    const p = B.pts;
    for (let i = i0; i + 3 < p.length; i += 2) {
      const a = Math.max(xa, p[i]), b = Math.min(xb, p[i + 2]);
      if (b - a < 8) continue;
      const ya = B.gy(a) - 3, yb = B.gy(b) - 3;
      spike(B, a, ya, b, yb);
    }
  }
  D.register('spikes', {
    essential: false,
    pieces: [
      { id: 'spikestones', intro: true, build(B, c) {
        // a spike bed with a couple of safe stepping pads
        B.flat(140);
        const n = 2 + (c.d > 0.5 ? 1 : 0);
        for (let i = 0; i < n; i++) {
          const L = 340 + 120 * c.d;
          const i0 = B.pts.length - 2, xa = B.x;
          B.terrain(L, c.rng.float(-30, 30), null, { amp: 8, noPatch: true });
          spikeGround(B, i0, xa + 4, B.x - 4);
          B.flat(170 - 30 * c.d);
        }
        B.flat(120);
      } },
      { id: 'spiketeeth', build(B, c) {
        // a low tunnel with spike stalactites and floor patches
        const t = tunnel(B, 800 + 300 * c.d, 110, c);
        const n = 3 + Math.round(2 * c.d);
        for (let i = 0; i < n; i++) {
          const x = t.x0 + 120 + (t.x1 - t.x0 - 240) * i / (n - 1);
          spike(B, x, t.top, x, t.y - 34);
        }
        B.flat(140);
      } },
      { id: 'spikehill', build(B, c) {
        // a thorny hill: the only safe ground is its summit and the far foot
        B.flat(120);
        const h = 220 + 200 * c.d;
        let i0 = B.pts.length - 2, xa = B.x;
        B.terrain(420, -h, null, { amp: 0, smooth: true, noPatch: true });
        spikeGround(B, i0, xa + 6, B.x - 4);
        B.flat(140 - 30 * c.d);
        i0 = B.pts.length - 2; xa = B.x;
        B.terrain(420, h, null, { amp: 0, smooth: true, noPatch: true });
        spikeGround(B, i0, xa + 4, B.x - 6);
        B.flat(200);
      } },
      { id: 'spikenest', goal: true, build(B, c) {
        // green in a hollow ringed by spikes: land soft or bounce into thorns
        const i0 = B.pts.length - 2, xa = B.x;
        B.terrain(300, -60, null, { amp: 0, noPatch: true });
        spikeGround(B, i0, xa + 30, B.x - 4);
        B.flat(20);
        B.greenFlat(240 - 40 * c.d, { cupFrac: 0.5 });
        B.flat(20);
        const j0 = B.pts.length - 2, xb = B.x;
        B.terrain(260, -(120 + 80 * c.d), null, { amp: 0, smooth: true, noPatch: true });
        spikeGround(B, j0, xb + 4, B.x - 4);
        B.flat(60);
      } },
      { id: 'spikeshelf', goal: true, build(B, c) {
        // green tucked under a low, spiked overhang: only a running approach gets in
        B.flat(260);
        const t0 = B.pts.length - 2, fy = B.y, hgt = 44;
        B.flat(140);
        B.greenFlat(300, { cupFrac: 0.6 });
        B.flat(60);
        const r = roof(B, t0, hgt, 1040);
        spike(B, r.x0 + 10, fy - hgt + 4, r.x1 - 10, fy - hgt + 4);
        B.flat(60);
      } },

      { id: 'spikeposts', build(B, c) {
        // thorn-capped pillars: land in the gaps between them
        B.flat(160);
        const n = 3;
        for (let i = 0; i < n; i++) {
          const h = c.rng.float(140, 220) + 80 * c.d;
          const x0 = B.x;
          B.to(B.x + 14, B.y - h, 'k'); B.to(B.x + 50, B.y, 'k'); B.to(B.x + 14, B.y + h, 'k');
          spike(B, x0 + 2, B.y - 3, x0 + 14, B.y - h - 3);
          spike(B, x0 + 14, B.y - h - 3, x0 + 64, B.y - h - 3);
          spike(B, x0 + 64, B.y - h - 3, x0 + 76, B.y - 3);
          B.flat(c.rng.float(300, 380) - 60 * c.d);
        }
        B.flat(100);
      } },
    ],
  });
  // =====================================================================
  // SAW — discs sliding along tracks
  // =====================================================================
  const saw = (B, x, y, x2, y2, r, T, ph) => B.add({ t: 'saw', x: rd(x), y: rd(y), x2: rd(x2), y2: rd(y2), r, T: fx(T, 2), ph: fx(ph, 2) });
  D.register('saw', {
    essential: false,
    pieces: [
      { id: 'sawgate', intro: true, build(B, c) {
        const hgt = 130, r = 28, t = tunnel(B, 700 + 200 * c.d, hgt, c);
        const x = (t.x0 + t.x1) / 2;
        saw(B, x, t.top + r + 4, x, t.y - r, r, 2.4 - 0.6 * c.d, c.rng.float(0, 1));
        B.flat(160);
      } },
      { id: 'sawgauntlet', build(B, c) {
        const hgt = 130, r = 28, t = tunnel(B, 1100 + 300 * c.d, hgt, c);
        const n = 3, T = 2.4 - 0.6 * c.d, ph0 = c.rng.float(0, 1);
        for (let i = 0; i < n; i++) {
          const x = t.x0 + 200 + (t.x1 - t.x0 - 400) * i / (n - 1);
          saw(B, x, t.top + r + 4, x, t.y - r, r, T, ph0 + 0.33 * i);
        }
        B.flat(160);
      } },
      { id: 'sawrail', build(B, c) {
        // a saw races back and forth along the tunnel floor: hop it or slip past at the far end
        const hgt = 150, r = 30, t = tunnel(B, 1000 + 300 * c.d, hgt, c);
        saw(B, t.x0 + 140, t.y - r, t.x1 - 140, t.y - r, r, 3.4 - 0.8 * c.d, c.rng.float(0, 1));
        B.flat(160);
      } },
      { id: 'sawcave', goal: true, build(B, c) {
        // green in a cave whose mouth is guarded by a dropping blade
        const hgt = 140, r = 30;
        B.flat(40);
        const i0 = B.pts.length - 2, fy = B.y;
        B.flat(200);
        B.greenFlat(300, { cupFrac: 0.6 });
        B.flat(80);
        const rf = roof(B, i0, hgt, 1040);
        B.flat(40);
        saw(B, rf.x0 + 110, fy - hgt + r + 4, rf.x0 + 110, fy - r, r, 2.2 - 0.5 * c.d, c.rng.float(0, 1));
      } },
      { id: 'sawpit', goal: true, build(B, c) {
        // green on a ledge across a pit; a blade patrols the pit lip on a low ceiling
        B.flat(200);
        const g = B.pit(360 + 120 * c.d, 280);
        const i0 = B.pts.length - 2;
        B.flat(60);
        B.greenFlat(280, { cupFrac: 0.6 });
        B.flat(60);
        const rf = roof(B, i0, 150, 1040);
        B.flat(40);
        const r = 28;
        saw(B, g.x0 + 10, g.y0 - 40, g.x1 + 30, g.y0 - 40, r, 2.6 - 0.6 * c.d, c.rng.float(0, 1));
        // short brow over the pit so lobs can't drop in from above
        B.addSolid([g.x0 + 60, rf.top - 0, rf.x0, rf.top, rf.x0, rf.top - 120, g.x0 + 60, rf.top - 60]);
      } },

      { id: 'sawslope', build(B, c) {
        // a downhill shaft with blades rising and falling across it
        B.flat(40);
        const i0 = B.pts.length - 2, y0 = B.y, len = 1000 + 300 * c.d, drop = 200 + 120 * c.d, hgt = 140, r = 28;
        B.to(B.x + len, B.y + drop, B.sMain);
        const rf = roof(B, i0, hgt, 1040);
        B.flat(60);
        const ph0 = c.rng.float(0, 1);
        for (let i = 0; i < 3; i++) {
          const x = rf.x0 + 200 + (len - 400) * i / 2, fy = y0 + drop * (x - rf.x0) / len;
          saw(B, x, fy - hgt + r + 4, x, fy - r, r, 2.2 - 0.5 * c.d, ph0 + 0.37 * i);
        }
        B.flat(160);
      } },
    ],
  });

  // =====================================================================
  // LASER — beams that switch on and off
  // =====================================================================
  const laser = (B, x, y, x2, y2, T, on, ph) => B.add({ t: 'laser', x: rd(x), y: rd(y), x2: rd(x2), y2: rd(y2), T: fx(T, 2), on: fx(on, 2), ph: fx(ph, 2) });
  D.register('laser', {
    essential: false,
    pieces: [
      { id: 'laserdoor', intro: true, build(B, c) {
        const t = tunnel(B, 700 + 200 * c.d, 130, c);
        const x = (t.x0 + t.x1) / 2;
        laser(B, x, t.top + 2, x, t.y + 2, 2.2, 0.45 + 0.1 * c.d, c.rng.float(0, 1));
        B.flat(160);
      } },
      { id: 'lasergrid', build(B, c) {
        const t = tunnel(B, 1100 + 300 * c.d, 130, c);
        const n = 3 + (c.d > 0.6 ? 1 : 0), ph0 = c.rng.float(0, 1);
        for (let i = 0; i < n; i++) {
          const x = t.x0 + 160 + (t.x1 - t.x0 - 320) * i / (n - 1);
          laser(B, x, t.top + 2, x, t.y + 2, 1.6 + 0.4 * (i % 2), 0.5 + 0.1 * c.d, ph0 + 0.29 * i);
        }
        B.flat(160);
      } },
      { id: 'laserlid', build(B, c) {
        // the only resting spot over a vast chasm is a bowl capped by a pulsing beam
        B.flat(200);
        const g = B.chasm(2700 + 200 * c.d, 420);
        const cx = (g.x0 + g.x1) / 2, iy = g.y0 - c.rng.float(0, 60), hw = 210 - 30 * c.d;
        B.island(cx - hw, cx + hw, iy, B.sMain, 90);
        B.addSolid([cx - hw, iy, cx - hw + 26, iy, cx - hw + 20, iy - 60, cx - hw, iy - 64]);
        B.addSolid([cx + hw - 26, iy, cx + hw, iy, cx + hw, iy - 64, cx + hw - 20, iy - 60]);
        laser(B, cx - hw + 22, iy - 56, cx + hw - 22, iy - 56, 2.4, 0.5 + 0.1 * c.d, c.rng.float(0, 1));
        B.flat(300);
      } },
      { id: 'laservault', goal: true, build(B, c) {
        // green in a lab vault behind two beams that pulse out of step
        const hgt = 130;
        B.flat(40);
        const i0 = B.pts.length - 2, fy = B.y;
        B.flat(240);
        B.greenFlat(300, { cupFrac: 0.65 });
        B.flat(60);
        const rf = roof(B, i0, hgt, 1040);
        B.flat(40);
        const ph = c.rng.float(0, 1);
        laser(B, rf.x0 + 70, fy - hgt + 2, rf.x0 + 70, fy + 2, 2, 0.5, ph);
        laser(B, rf.x0 + 190, fy - hgt + 2, rf.x0 + 190, fy + 2, 2, 0.5, ph + 0.5);
      } },
      { id: 'laserfloor', goal: true, build(B, c) {
        // a beam skims just above the green surface: roll in only while it's dark
        B.flat(260);
        const gx = B.x;
        B.greenFlat(320, { cupFrac: 0.5 });
        B.flat(30); B.cliff(-80); B.flat(120);
        const ph = c.rng.float(0, 1), y = B.green[2];
        laser(B, gx - 120, y - 7, B.cup[0] - 40, y - 7, 2.4 - 0.4 * c.d, 0.5, ph);
        laser(B, B.cup[0] + 40, y - 7, B.green[1] + 30, y - 7, 2.4 - 0.4 * c.d, 0.5, ph + 0.5);
      } },

      { id: 'laserclimb', build(B, c) {
        // an uphill shaft cut by beams: roll up between pulses
        B.flat(40);
        const i0 = B.pts.length - 2, y0 = B.y, len = 900 + 300 * c.d, rise = 160 + 100 * c.d, hgt = 130;
        B.to(B.x + len, B.y - rise, B.sMain);
        const rf = roof(B, i0, hgt, 1040);
        B.flat(60);
        const ph0 = c.rng.float(0, 1);
        for (let i = 0; i < 3; i++) {
          const x = rf.x0 + 180 + (len - 360) * i / 2, fy = y0 - rise * (x - rf.x0) / len;
          laser(B, x, fy - hgt + 2, x, fy + 2, 2.0, 0.5, ph0 + 0.31 * i);
        }
        B.flat(160);
      } },
    ],
  });

  // =====================================================================
  // SLOWMO — inside the zone the ball lives in slow motion, so the
  // fast-blinking platforms around it look (almost) solid
  // =====================================================================
  function blinkTiles(B, x0, x1, y, c, opt) {
    opt = opt || {};
    const w = opt.w || 140, n = Math.max(1, Math.round((x1 - x0) / w)), tw = (x1 - x0) / n;
    const T = opt.T || (1.0 - 0.2 * c.d), ph0 = c.rng.float(0, 1);
    for (let i = 0; i < n; i++) B.add({ t: 'vanish', x: rd(x0 + i * tw), y: rd(y), w: rd(tw), h: 30, T: fx(T, 2), on: 0.5, ph: fx(ph0 + i * 0.5, 2) });
  }
  const slow = (B, x, y, w, h, f) => B.add({ t: 'slowmo', x: rd(x), y: rd(y), w: rd(w), h: rd(h), f: f || 0.3 });
  D.register('slowmo', {
    // slow-mo is path-invariant (only timing changes), so it can't strictly be required by the bot
    essential: false,
    pieces: [
      { id: 'slowbridge', intro: true, build(B, c) {
        B.flat(200);
        const g = B.chasm(2400 + 150 * c.d, 420);
        const x0 = g.x0 + 460;
        blinkTiles(B, x0, g.x1, g.y0, c);
        slow(B, x0 - 40, g.y0 - 260, g.x1 - x0 + 120, 330, 0.3);
        B.flat(320);
      } },
      { id: 'slowtrench', build(B, c) {
        // tunnel over lava, floored by flickering slabs
        B.flat(60);
        const i0 = B.pts.length - 2, fy = B.y;
        B.flat(200);
        const g = B.pit(1600 + 200 * c.d, 260);
        B.flat(240);
        roof(B, i0, 110, c.rng.float(980, 1060));
        B.flat(40);
        blinkTiles(B, g.x0, g.x1, fy, c, { w: 120 });
        slow(B, g.x0 - 140, fy - 110, g.x1 - g.x0 + 280, 150, 0.3);
      } },
      { id: 'slowchute', build(B, c) {
        // a flickering stair down to a low far bank
        B.flat(220);
        const drop = 180 + 80 * c.d;
        const g = B.chasm(2400 + 200 * c.d, 460, { dyEnd: drop });
        const x0 = g.x0 + 460, n = Math.round((g.x1 - x0) / 140);
        for (let i = 0; i < n; i++) {
          const tw = (g.x1 - x0) / n;
          B.add({ t: 'vanish', x: rd(x0 + i * tw), y: rd(g.y0 + 10 + drop * i / n), w: rd(tw), h: 30, T: fx(1.0 - 0.2 * c.d, 2), on: 0.5, ph: fx(i * 0.5, 2) });
        }
        slow(B, x0 - 40, g.y0 - 260, g.x1 - x0 + 120, 330 + drop, 0.3);
        B.flat(320);
      } },
      { id: 'slowspan', build(B, c) {
        // a very long flicker-bridge with a slow-mo zone only over its far half
        B.flat(200);
        const g = B.chasm(2600 + 200 * c.d, 420);
        const x0 = g.x0 + 480, xm = x0 + (g.x1 - x0) * 0.35;
        B.addSolid([x0 - 20, g.y0, xm, g.y0, xm, g.y0 + 30, x0 - 20, g.y0 + 30], B.sMain + 'kkk');
        blinkTiles(B, xm, g.x1, g.y0, c);
        slow(B, xm - 40, g.y0 - 260, g.x1 - xm + 120, 330, 0.28);
        B.flat(320);
      } },
      { id: 'slowisland', goal: true, build(B, c) {
        // island green in a vast chasm; the causeway out to it flickers
        B.flat(200);
        const g = B.chasm(2900 + 200 * c.d, 420);
        const ix0 = g.x0 + 2350 + 100 * c.d, ix1 = ix0 + 300;
        B.islandGreen(ix0, ix1, g.y0, 80);
        B.cup[0] = (ix0 + ix1) / 2 + 30;
        blinkTiles(B, g.x0 + 500, ix0, g.y0, c);
        slow(B, g.x0 + 460, g.y0 - 260, ix0 - g.x0 - 460 + 40, 330, 0.3);
        B.flat(200);
      } },
      { id: 'slowledge', goal: true, build(B, c) {
        B.flat(200);
        const g = B.chasm(2400 + 200 * c.d, 420);
        const x0 = g.x0 + 480;
        blinkTiles(B, x0, g.x1, g.y0, c);
        slow(B, x0 - 40, g.y0 - 260, g.x1 - x0 + 160, 330, 0.3);
        B.greenFlat(300, { cupFrac: 0.6 }); B.flat(160);
      } },
    ],
  });

  // =====================================================================
  // MINE — proximity mines: one blast each
  // =====================================================================
  const mine = (B, x, y, r, imp) => B.add({ t: 'mine', x: rd(x), y: rd(y), r: r || 40, imp: imp || 900 });
  D.register('mine', {
    essential: false,
    pieces: [
      { id: 'minewell', intro: true, build(B, c) {
        // drop the ball into the shaft: the buried mine blasts it up over the cliff
        B.flat(320);
        const sx = B.x;
        B.to(B.x + 6, B.y + 90, 'k'); B.to(B.x + 90, B.y, 'k'); B.to(B.x + 6, B.y - 90, 'k');
        mine(B, sx + 34, B.y + 96, 46, 2100);
        B.flat(30);
        B.wallUp(1000 + 60 * c.d);
        B.flat(520);
      } },
      { id: 'minetunnel', build(B, c) {
        // mines line the tunnel floor: each blast throws you back — clear them one at a time
        const t = tunnel(B, 900 + 300 * c.d, 140, c);
        const n = 2 + (c.d > 0.5 ? 1 : 0);
        for (let i = 0; i < n; i++) mine(B, t.x0 + 250 + (t.x1 - t.x0 - 400) * i / Math.max(1, n - 1), t.y + 10, 40, 800);
        B.flat(160);
      } },
      { id: 'minefield', build(B, c) {
        // a valley strewn with mines in front of a bank
        B.flat(100);
        B.terrain(260, 120, null, { amp: 0, smooth: true, noPatch: true });
        const x0 = B.x, n = 3 + Math.round(2 * c.d), L = 700 + 200 * c.d;
        B.flat(L);
        for (let i = 0; i < n; i++) mine(B, x0 + 60 + (L - 120) * (i + 0.5) / n + c.rng.float(-30, 30), B.y - 8, 44, 900);
        B.terrain(300, -(160 + 80 * c.d), null, { amp: 0, smooth: true, noPatch: true });
        B.flat(200);
      } },
      { id: 'minemesa', goal: true, build(B, c) {
        B.flat(320);
        const sx = B.x;
        B.to(B.x + 6, B.y + 90, 'k'); B.to(B.x + 90, B.y, 'k'); B.to(B.x + 6, B.y - 90, 'k');
        mine(B, sx + 34, B.y + 96, 46, 2200);
        B.flat(30);
        B.wallUp(1000 + 80 * c.d);
        B.flat(200); B.greenFlat(320, { cupFrac: 0.5 }); B.flat(200);
      } },

      { id: 'minehop', build(B, c) {
        // a mine buried in a shaft at the chasm lip: drop in and get blasted across
        B.flat(320);
        const sx = B.x;
        B.to(B.x + 6, B.y + 90, 'k'); B.to(B.x + 90, B.y, 'k'); B.to(B.x + 6, B.y - 90, 'k');
        mine(B, sx + 34, B.y + 96, 46, 1900);
        B.flat(60);
        B.chasm(2000 + 150 * c.d, 420);
        B.flat(420);
      } },
      { id: 'minebowl', goal: true, build(B, c) {
        // green in a hollow whose banks are mined: land on the green, not the rim
        B.flat(120);
        const dep = 90 + 60 * c.d;
        B.terrain(220, dep, null, { amp: 0, smooth: true, noPatch: true });
        const gx = B.x;
        B.greenFlat(280, { cupFrac: 0.5 });
        const gx1 = B.x;
        B.terrain(220, -dep - 40, null, { amp: 0, smooth: true, noPatch: true });
        B.flat(140);
        mine(B, gx - 70, B.gy(gx - 70) - 10, 44, 1000);
        mine(B, gx1 + 70, B.gy(gx1 + 70) - 10, 44, 1000);
        if (c.d > 0.4) mine(B, gx - 170, B.gy(gx - 170) - 10, 44, 1000);
      } },
    ],
  });

  // =====================================================================
  // CRUSHER — blocks slamming down from tunnel roofs
  // =====================================================================
  function crusher(B, x, w, top, c, ph) {
    const bot = Math.min(B.gy(x), B.gy(x + w));
    return B.add({ t: 'crusher', x: rd(x), y: rd(top - 60), w: rd(w), h: 70, dy: rd(bot - top - 10), T: fx(2.8 - 0.8 * c.d, 2), ph: fx(ph, 2) });
  }
  D.register('crusher', {
    essential: false,
    pieces: [
      { id: 'crushone', intro: true, build(B, c) {
        const t = tunnel(B, 700 + 200 * c.d, 130, c);
        crusher(B, (t.x0 + t.x1) / 2 - 60, 120, t.top, c, c.rng.float(0, 1));
        B.flat(160);
      } },
      { id: 'crushrow', build(B, c) {
        const t = tunnel(B, 1100 + 300 * c.d, 130, c);
        const n = 3, ph0 = c.rng.float(0, 1);
        for (let i = 0; i < n; i++) crusher(B, t.x0 + 160 + (t.x1 - t.x0 - 440) * i / (n - 1), 120, t.top, c, ph0 + 0.3 * i);
        B.flat(160);
      } },
      { id: 'crushslope', build(B, c) {
        // a sloping mine shaft: the ball accelerates under a line of hammers
        B.flat(40);
        const i0 = B.pts.length - 2, y0 = B.y, len = 1000 + 300 * c.d, drop = 220 + 120 * c.d;
        B.to(B.x + len, B.y + drop, B.sMain);
        const rf = roof(B, i0, 140, 1040);
        B.flat(60);
        const n = 3, ph0 = c.rng.float(0, 1), x0 = rf.x0;
        for (let i = 0; i < n; i++) {
          const x = x0 + 180 + (len - 420) * i / (n - 1);
          const top = y0 - 140 + drop * (x - x0) / len;
          crusher(B, x, 110, top, c, ph0 + 0.25 * i);
        }
        B.flat(160);
      } },
      { id: 'crushcave', goal: true, build(B, c) {
        const hgt = 130;
        B.flat(40);
        const i0 = B.pts.length - 2, fy = B.y;
        B.flat(300);
        B.greenFlat(300, { cupFrac: 0.65 });
        B.flat(60);
        const rf = roof(B, i0, hgt, 1040);
        B.flat(40);
        const ph = c.rng.float(0, 1);
        crusher(B, rf.x0 + 60, 110, fy - hgt, c, ph);
        crusher(B, rf.x0 + 200, 100, fy - hgt, c, ph + 0.45);
      } },

      { id: 'crushclimb', build(B, c) {
        // an uphill shaft under hammers: keep the ball rolling up between drops
        B.flat(40);
        const i0 = B.pts.length - 2, y0 = B.y, len = 900 + 300 * c.d, rise = 140 + 80 * c.d;
        B.to(B.x + len, B.y - rise, B.sMain);
        const rf = roof(B, i0, 140, 1040);
        B.flat(60);
        const ph0 = c.rng.float(0, 1);
        for (let i = 0; i < 2 + (c.d > 0.5 ? 1 : 0); i++) {
          const x = rf.x0 + 200 + (len - 420) * i / 2;
          const top = y0 - 140 - rise * (x + 110 - rf.x0) / len;
          crusher(B, x, 100, top, c, ph0 + 0.3 * i);
        }
        B.flat(160);
      } },
      { id: 'crushforge', goal: true, build(B, c) {
        // down a hammer-lined ramp into a cave green
        B.flat(40);
        const i0 = B.pts.length - 2, y0 = B.y, len = 700 + 200 * c.d, drop = 160 + 60 * c.d, hgt = 140;
        B.to(B.x + len, B.y + drop, B.sMain);
        B.flat(120); B.greenFlat(280, { cupFrac: 0.6 }); B.flat(60);
        const fy = B.y;
        // roof: sloped over the ramp, flat over the green
        B.addSolid([B.pts[i0], y0 - hgt, B.pts[i0] + len, fy - hgt, B.x, fy - hgt, B.x + 50, fy - hgt - 110, B.x - 200, fy - 1060, B.pts[i0] + 100, y0 - 1040, B.pts[i0] - 50, y0 - hgt - 110]);
        const ph0 = c.rng.float(0, 1);
        for (let i = 0; i < 2; i++) {
          const x = B.pts[i0] + 160 + (len - 360) * i;
          const top = y0 - hgt + drop * (x - B.pts[i0]) / len;
          crusher(B, x, 100, top, c, ph0 + 0.4 * i);
        }
        B.flat(40);
      } },
    ],
  });

  // =====================================================================
  // PHASE — blocks solid only on odd (or even) strokes
  // =====================================================================
  const phase = (B, blocks, odd) => B.add({ t: 'phase', blocks: blocks.map((b) => b.map(rd)), odd: !!odd });
  D.register('phase', {
    essential: false,
    pieces: [
      { id: 'phasegate', intro: true, build(B, c) {
        // a ghost wall seals the tunnel on odd strokes
        const t = tunnel(B, 700 + 200 * c.d, 130, c);
        const x = (t.x0 + t.x1) / 2;
        phase(B, [[x - 20, t.top - 10, 40, t.y - t.top + 14]], true);
        B.flat(160);
      } },
      { id: 'phasebridge', build(B, c) {
        // a ghost causeway across a vast chasm — solid on odd strokes only
        B.flat(200);
        const g = B.chasm(2050 + 200 * c.d, 420);
        const x0 = g.x0 + 560, blocks = [];
        for (let x = x0; x < g.x1 - 10; x += 160) blocks.push([x, g.y0, Math.min(160, g.x1 - x), 34]);
        phase(B, blocks, true);
        B.flat(300);
      } },
      { id: 'phaselock', build(B, c) {
        // airlock: the first wall is open on odd strokes, the second on even ones
        const t = tunnel(B, 1000 + 200 * c.d, 130, c);
        const xa = t.x0 + 260, xb = t.x1 - 260;
        phase(B, [[xa - 20, t.top - 10, 40, t.y - t.top + 14]], false);
        phase(B, [[xb - 20, t.top - 10, 40, t.y - t.top + 14]], true);
        B.flat(160);
      } },
      { id: 'phasecage', goal: true, build(B, c) {
        // green sealed in a cage whose ghost roof is only solid on odd strokes:
        // land on the roof, then drop through it on the next stroke
        B.flat(340);
        B.flat(20);
        const x0 = B.x, fy = B.y, hgt = 170 + 40 * c.d;
        B.to(B.x + 30, B.y, 'r');
        const gx0 = B.x;
        B.to(B.x + 360, B.y, 'n');
        const gx1 = B.x;
        B.to(B.x + 30, B.y, 'r');
        const x1 = B.x, top = fy - hgt;
        B.addSolid([x0 - 30, fy + 40, x0, fy + 40, x0, top, x0 - 30, top]);
        B.addSolid([x1, fy + 40, x1 + 30, fy + 40, x1 + 30, top, x1, top]);
        B.cup = [gx0 + 360 * 0.6, fy]; B.green = [gx0, gx1, fy];
        phase(B, [[x0 - 30, top - 40, x1 - x0 + 60, 40]], true);
        B.flat(120);
      } },

      { id: 'phasefloor', build(B, c) {
        // tunnel over lava: on odd strokes the gate is shut, on even strokes the floor exists
        B.flat(60);
        const i0 = B.pts.length - 2, fy = B.y;
        B.flat(260);
        const g = B.pit(1300 + 200 * c.d, 260);
        B.flat(220);
        const rf = roof(B, i0, 120, c.rng.float(980, 1060));
        B.flat(40);
        phase(B, [[g.x0 - 80, fy - 124, 36, 128]], true);
        const blocks = [];
        for (let x = g.x0; x < g.x1 - 5; x += 160) blocks.push([x, fy, Math.min(160, g.x1 - x), 30]);
        phase(B, blocks, false);
      } },
      { id: 'phaseisland', goal: true, build(B, c) {
        // a ghost causeway (solid on even strokes) out to an island green
        B.flat(200);
        const g = B.chasm(2600 + 200 * c.d, 420);
        const ix0 = g.x0 + 2100 + 80 * c.d, ix1 = ix0 + 300;
        B.islandGreen(ix0, ix1, g.y0, 80);
        B.cup[0] = (ix0 + ix1) / 2 + 30;
        const blocks = [];
        for (let x = g.x0 + 520; x < ix0 - 5; x += 160) blocks.push([x, g.y0, Math.min(160, ix0 - x), 34]);
        phase(B, blocks, false);
        B.flat(200);
      } },
    ],
  });
  // =====================================================================
  // TORNADO — roaming vortices that lift the ball
  // =====================================================================
  const torn = (B, x, x2, y, h, c, o) => B.add(Object.assign({ t: 'tornado', x: rd(x), y: rd(y), w: 150, h: rd(h), x2: rd(x2), T: fx(6 - 1.5 * c.d, 2), ph: fx(c.rng.float(0, 1), 2), a: 1700 }, o || {}));
  D.register('tornado', {
    essential: true,
    pieces: [
      { id: 'tornwall', intro: true, build(B, c) {
        B.flat(200);
        const ax = B.x; B.flat(520);
        const h = 1000 + 60 * c.d;
        torn(B, ax + 80, B.x - 60, B.y, h + 220, c);
        B.wallUp(h); B.flat(420);
      } },
      { id: 'torncross', build(B, c) {
        // a twister roams the floor of a vast chasm and ferries the ball across
        B.flat(240);
        const g = B.chasm(2100 + 200 * c.d, 460);
        torn(B, g.x0 + 380, g.x1 - 380, g.fy - 12, g.fy - g.y0 + 420, c, { a: 2800 });
        B.flat(320);
      } },
      { id: 'torndouble', build(B, c) {
        // two twisters, two halves of a huge gorge, and a ledge to rest on between
        B.flat(240);
        const g = B.chasm(3400 + 200 * c.d, 460);
        const m = (g.x0 + g.x1) / 2;
        B.island(m - 160, m + 160, g.y0 - 40, B.sMain, 70);
        torn(B, g.x0 + 380, m - 340, g.fy - 12, g.fy - g.y0 + 420, c, { a: 2800 });
        torn(B, m + 340, g.x1 - 380, g.fy - 12, g.fy - g.y0 + 420, c, { a: 2800 });
        B.flat(320);
      } },
      { id: 'tornladder', build(B, c) {
        // two tall terraces, a twister patrolling each apron
        for (let i = 0; i < 2; i++) {
          B.flat(160);
          const ax = B.x; B.flat(420);
          const h = i ? 980 + 60 * c.d : 620 + 100 * c.d;
          torn(B, ax + 60, B.x - 60, B.y, h + 220, c);
          B.wallUp(h);
        }
        B.flat(360);
      } },
      { id: 'tornmesa', goal: true, build(B, c) {
        B.flat(200);
        const ax = B.x; B.flat(500);
        const h = 1020 + 80 * c.d;
        torn(B, ax + 80, B.x - 60, B.y, h + 220, c);
        B.wallUp(h); B.flat(160); B.greenFlat(300, { cupFrac: 0.55 }); B.flat(160);
      } },
      { id: 'tornisland', goal: true, build(B, c) {
        // a sky island green, only a twister reaches it
        B.flat(240);
        const g = B.chasm(1700 + 200 * c.d, 460);
        const ix0 = g.x1 - 560, ix1 = ix0 + 320, iy = g.y0 - (960 + 60 * c.d);
        B.islandGreen(ix0, ix1, iy, 70);
        torn(B, g.x0 + 380, ix0 + 40, g.fy - 12, g.fy - iy + 160, c, { a: 2800 });
        B.flat(260);
      } },
    ],
  });

  // =====================================================================
  // BLACKHOLE — pull field with a deadly core
  // =====================================================================
  const bh = (B, x, y, r, k, core) => B.add({ t: 'blackhole', x: rd(x), y: rd(y), r: rd(r), k: rd(k), core: core || 18 });
  D.register('blackhole', {
    essential: false,
    pieces: [
      { id: 'bhvalley', intro: true, build(B, c) {
        // a black hole squats in a valley: carry it, don't roll through
        B.flat(120);
        const dep = 160 + 80 * c.d;
        B.terrain(360, dep, null, { amp: 0, smooth: true, noPatch: true });
        const mx = B.x; B.flat(120);
        B.terrain(360, -dep, null, { amp: 0, smooth: true, noPatch: true });
        B.flat(200);
        bh(B, mx + 60, B.y + dep - 70, 380 + 80 * c.d, 2400, 20);
      } },
      { id: 'bhhover', build(B, c) {
        // a black hole hangs in the sky over the fairway — bend around it
        B.flat(300);
        const x = B.x + 300;
        B.terrain(900, c.rng.float(-40, 40), null, { amp: 10 });
        bh(B, x, B.gy(x) - 260 - 60 * c.d, 420, 1900 + 600 * c.d, 22);
        B.flat(200);
      } },
      { id: 'bhgap', build(B, c) {
        // tunnel with a gap in the floor; a black hole lurks in the gap
        const hgt = 130;
        B.flat(40);
        const i0 = B.pts.length - 2, fy = B.y;
        B.flat(360);
        const g = B.pit(160 + 60 * c.d, 300, { floor: 'k' });
        B.flat(360);
        roof(B, i0, hgt, 1040);
        B.flat(40);
        bh(B, (g.x0 + g.x1) / 2, fy + 150, 300, 3200, 22);
      } },
      { id: 'bhchasm', build(B, c) {
        // a black hole under a chasm drags short shots down
        B.flat(220);
        const g = B.chasm(1100 + 200 * c.d, 520);
        bh(B, (g.x0 + g.x1) / 2, g.y0 + 180, 560, 1600 + 600 * c.d, 24);
        B.flat(300);
      } },
      { id: 'bhpitgreen', goal: true, build(B, c) {
        // carry a black-hole pit onto the green; overshoot drops into a second pit
        B.flat(200);
        const g = B.pit(380 + 80 * c.d, 320, { floor: 'k' });
        B.flat(30);
        B.greenFlat(340, { cupFrac: 0.75 });
        B.pit(300, 300);
        B.flat(200);
        bh(B, (g.x0 + g.x1) / 2, g.y0 + 130, 380, 1800 + 600 * c.d, 22);
      } },
      { id: 'bhhalo', goal: true, build(B, c) {
        // a black hole hovers over the green's front edge: land past it or run it in low
        B.flat(200);
        B.cliff(-(120 + 60 * c.d));
        B.flat(40);
        const gx = B.x;
        B.greenFlat(360, { cupFrac: 0.72 });
        B.flat(140);
        bh(B, gx + 40, B.y - 345, 300, 2200, 20);
      } },
    ],
  });

  // =====================================================================
  // FOG — render-only cover hiding part of the course (passive)
  // =====================================================================
  const fog = (B, x, y, w, h) => B.add({ t: 'fog', x: rd(x), y: rd(y), w: rd(w), h: rd(h) });
  D.register('fog', {
    essential: false, passive: true,
    pieces: [
      { id: 'fogpeek', intro: true, goal: true, build(B, c) {
        // a plateau green lost in the mist
        B.flat(200);
        const fx0 = B.x;
        B.cliff(-(140 + 100 * c.d));
        B.flat(60 + c.rng.float(0, 160)); B.greenFlat(260); B.flat(160);
        fog(B, fx0 - 200, B.y - 500, B.x - fx0 + 200, 700);
      } },
      { id: 'fogisland', goal: true, build(B, c) {
        B.flat(160);
        const g = B.pit(620 + 260 * c.d, 320);
        const cx = (g.x0 + g.x1) / 2 + c.rng.float(-80, 80);
        B.islandGreen(cx - 140, cx + 140, g.y - c.rng.float(20, 120), 80);
        B.flat(200);
        fog(B, g.x0 - 60, g.y - 520, g.x1 - g.x0 + 120, 900);
      } },
      { id: 'fogledge', goal: true, build(B, c) {
        // green on a hidden shelf below a drop-off; overshoot into the hidden pit beyond
        B.flat(220);
        const fx0 = B.x;
        B.cliff(200 + 100 * c.d);
        B.flat(40); B.greenFlat(260); B.flat(40);
        B.pit(220, 260);
        B.flat(220);
        fog(B, fx0 - 60, B.y - 600, B.x - fx0, 1000);
      } },
      { id: 'fogchasm', build(B, c) {
        // a chasm with an unseen landing island in the murk
        B.flat(160);
        const g = B.chasm(1900 + 200 * c.d, 380);
        const cx = g.x0 + (g.x1 - g.x0) * c.rng.float(0.4, 0.6);
        B.island(cx - 150, cx + 150, g.y0 - c.rng.float(0, 80), B.sMain, 70);
        B.flat(260);
        fog(B, g.x0 + 200, g.y0 - 600, g.x1 - g.x0 - 100, 1000);
      } },
      { id: 'fogpits', build(B, c) {
        // rolling ground hiding a couple of water traps
        const fx0 = B.x;
        for (let i = 0; i < 2 + (c.d > 0.5 ? 1 : 0); i++) {
          B.terrain(c.rng.float(220, 340), c.rng.float(-40, 40), null, { amp: 14, noPatch: true });
          B.pit(c.rng.float(120, 200), 140);
        }
        B.flat(200);
        fog(B, fx0, B.y - 600, B.x - fx0, 900);
      } },
      { id: 'fogsteps', build(B, c) {
        // a misty staircase down into a gully and up again
        const fx0 = B.x;
        for (let i = 0; i < 2; i++) { B.flat(c.rng.float(150, 220)); B.cliff(90 + 40 * c.d); }
        B.pit(160 + 80 * c.d, 200);
        for (let i = 0; i < 2; i++) { B.flat(c.rng.float(150, 220)); B.cliff(-(90 + 40 * c.d)); }
        B.flat(200);
        fog(B, fx0, B.y - 600, B.x - fx0, 1100);
      } },
    ],
  });

  // =====================================================================
  // DECOY — fake cups with flags (passive)
  // =====================================================================
  const decoy = (B, pts) => B.add({ t: 'decoy', pts: pts.map(rd) });
  function patch(B, len) { const x0 = B.x; B.to(B.x + len, B.y, 'n'); return [x0 + len / 2, B.y]; }
  D.register('decoy', {
    essential: false, passive: true,
    pieces: [
      { id: 'decoytrio', intro: true, goal: true, build(B, c) {
        // three identical greens across three pits — only one flag is real
        const real = c.rng.int(0, 2), fake = [];
        for (let i = 0; i < 3; i++) {
          B.flat(100); B.pit(220 + 80 * c.d, 260); B.flat(30);
          const x0 = B.x; B.to(B.x + 240, B.y, 'n');
          const cx = x0 + 120 + c.rng.float(-30, 30);
          if (i === real) { B.cup = [cx, B.y]; B.green = [x0, B.x, B.y]; } else fake.push(cx, B.y);
          B.flat(30);
        }
        B.flat(140);
        decoy(B, fake);
      } },
      { id: 'decoytwins', goal: true, build(B, c) {
        // twin ledge greens either side of a chasm
        B.flat(160);
        const y = B.y, xa = B.x; B.to(B.x + 260, y, 'n');
        B.pit(420 + 200 * c.d, 300);
        const xb = B.x; B.to(B.x + 260, B.y, 'n');
        const pa = [xa + 130, y], pb = [xb + 130, B.y];
        const realB = c.rng.chance(0.6);
        B.cup = realB ? pb : pa; B.green = realB ? [xb, xb + 260, B.y] : [xa, xa + 260, y];
        decoy(B, realB ? pa : pb);
        B.flat(200);
      } },
      { id: 'decoyline', goal: true, build(B, c) {
        // one long green, a row of flags: putt to the true one
        B.flat(200);
        const x0 = B.x, L = 640;
        B.to(B.x + L, B.y, 'n');
        const n = 4, k = c.rng.int(0, n - 1), fake = [];
        for (let i = 0; i < n; i++) {
          const x = x0 + 80 + (L - 160) * i / (n - 1);
          if (i === k) { B.cup = [x, B.y]; B.green = [x0, B.x, B.y]; } else fake.push(x, B.y);
        }
        decoy(B, fake);
        B.flat(160);
      } },
      { id: 'decoyfairway', build(B, c) {
        // fake mini-greens dotted down the fairway
        const fake = [];
        for (let i = 0; i < 2 + (c.d > 0.5 ? 1 : 0); i++) {
          B.terrain(c.rng.float(260, 380), c.rng.float(-40, 40), null, { amp: 10, noPatch: true });
          fake.push(...patch(B, 140));
        }
        B.flat(160);
        decoy(B, fake);
      } },
      { id: 'decoyledges', build(B, c) {
        // a raised "green" on a plateau looks like the target — it's a trap
        B.flat(160);
        B.cliff(-(150 + 80 * c.d)); B.flat(60);
        const p = patch(B, 220);
        B.flat(60); B.cliff(150 + 80 * c.d); B.flat(220);
        decoy(B, p);
      } },
      { id: 'decoybunker', build(B, c) {
        // a fake green ringed with sand
        B.flat(140); B.bunker(120); B.flat(20);
        const p = patch(B, 180);
        B.flat(20); B.bunker(120); B.flat(200);
        decoy(B, p);
      } },
    ],
  });

  // =====================================================================
  // MOVCUP — the cup slides along a long green (passive)
  // =====================================================================
  const movcup = (B, x1, x2, c) => B.add({ t: 'movcup', x1: rd(x1), x2: rd(x2), T: fx(7 - 2.5 * c.d, 2), ph: fx(c.rng.float(0, 1), 2) });
  const movPost = (B, c) => cupPost(B, 'movcup', (BB, hole) => {
    if (!hole.green) return;
    const [a, b] = hole.green, m = 40;
    if (b - a < 2 * m + 60 && B.ctx.sig !== 'movcup') return;
    const lo = Math.min(hole.cup[0], a + m), hi = Math.max(hole.cup[0], b - m);
    B.add({ t: 'movcup', x1: rd(lo), x2: rd(hi), T: fx(7 - 2.5 * c.d, 2), ph: 0 });
  });
  D.register('movcup', {
    essential: false, passive: true,
    pieces: [
      { id: 'movflat', intro: true, goal: true, build(B, c) {
        B.flat(200); B.greenFlat(560); B.flat(200);
        movcup(B, B.green[0] + 60, B.green[1] - 60, c);
      } },
      { id: 'movisland', goal: true, build(B, c) {
        B.flat(160);
        const g = B.pit(900 + 200 * c.d, 320);
        const cx = (g.x0 + g.x1) / 2;
        B.islandGreen(cx - 280, cx + 280, g.y - c.rng.float(0, 80), 90);
        B.flat(220);
        movcup(B, cx - 220, cx + 220, c);
      } },
      { id: 'movshelf', goal: true, build(B, c) {
        // green on a shelf with a backstop wall; the cup glides toward and away from you
        B.flat(220); B.cliff(-(140 + 80 * c.d)); B.flat(40);
        B.greenFlat(520); B.flat(30); B.cliff(-260); B.flat(160);
        movcup(B, B.green[0] + 50, B.green[1] - 50, c);
      } },
      { id: 'movbowl', goal: true, build(B, c) {
        const dep = 120 + 80 * c.d;
        B.terrain(280, dep, null, { amp: 0, smooth: true, noPatch: true });
        B.greenFlat(500);
        B.terrain(280, -dep, null, { amp: 0, smooth: true, noPatch: true });
        movcup(B, B.green[0] + 50, B.green[1] - 50, c);
      } },
      { id: 'movglide', build(B, c) { B.terrain(600 + 300 * c.d, c.rng.float(40, 120), null, { amp: 20 }); B.flat(120); movPost(B, c); } },
      { id: 'movrise', build(B, c) { B.flat(200); B.cliff(-(120 + 80 * c.d)); B.terrain(500, c.rng.float(-30, 30)); movPost(B, c); } },
      { id: 'movcarry', build(B, c) { B.flat(160); B.pit(300 + 200 * c.d, 260); B.flat(260); movPost(B, c); } },
    ],
  });

  // =====================================================================
  // LIFTCUP — the cup rides a rising/falling column (passive)
  // =====================================================================
  const liftPost = (B, c) => cupPost(B, 'liftcup', (BB, hole) => {
    const [x, y] = hole.cup;
    B.add({ t: 'liftcup', x: rd(x), w: 56, y1: rd(y - 100 - 80 * c.d), y2: rd(y), yb: rd(y + 70), T: fx(5 - 1.5 * c.d, 2), ph: 0 });
  });
  // column in a slot: lips are green, the slot floor is hazard
  function liftSlot(B, c, o) {
    o = o || {};
    const lip = o.lip || 180, sw = o.sw || 120, cw = o.cw || 80, dep = o.dep || 300;
    const gx0 = B.x, y = B.y;
    B.to(B.x + lip, y, 'n');
    const sx0 = B.x;
    B.to(B.x + 2, y + dep, 'k'); B.to(sx0 + sw - 2, y + dep, B.hz); B.to(sx0 + sw, y, 'k');
    B.to(B.x + lip, y, 'n');
    const x = sx0 + sw / 2, y1 = y - (o.rise || (140 + 100 * c.d)), y2 = y + (o.sink || 0);
    B.add({ t: 'liftcup', x: rd(x), w: cw, y1: rd(y1), y2: rd(y2), yb: rd(y + dep - 4), T: fx(o.T || (5 - 1.5 * c.d), 2), ph: 0 });
    B.cup = [x, y2]; B.green = [gx0, B.x, y];
  }
  D.register('liftcup', {
    essential: false, passive: true,
    pieces: [
      { id: 'liftslot', intro: true, goal: true, build(B, c) { B.flat(200); liftSlot(B, c); B.flat(200); } },
      { id: 'lifttower', goal: true, build(B, c) {
        // a broad column rising out of a chasm, between two ledges
        B.flat(200);
        const g = B.chasm(640 + 120 * c.d, 380);
        const x = (g.x0 + g.x1) / 2;
        B.add({ t: 'liftcup', x: rd(x), w: 160, y1: rd(g.y0 - 260 - 120 * c.d), y2: rd(g.y0 + 60), yb: rd(g.fy - 4), T: fx(5.5 - 1.5 * c.d, 2), ph: 0 });
        B.cup = [x, g.y0 + 60]; B.green = [x - 80, x + 80, g.y0];
        B.flat(260);
      } },
      { id: 'liftstairs', goal: true, build(B, c) {
        // the column shuttles between a low green and a high ledge
        B.flat(200);
        const y = B.y, gx0 = B.x;
        B.to(B.x + 200, y, 'n');
        const sx0 = B.x, sw = 120, dep = 300, up = 220 + 80 * c.d;
        B.to(B.x + 2, y + dep, 'k'); B.to(sx0 + sw - 2, y + dep, B.hz); B.to(sx0 + sw, y - up, 'k');
        B.flat(260);
        const x = sx0 + sw / 2;
        B.add({ t: 'liftcup', x: rd(x), w: 90, y1: rd(y - up), y2: rd(y), yb: rd(y + dep - 4), T: fx(5 - 1.2 * c.d, 2), ph: 0 });
        B.cup = [x, y]; B.green = [gx0, sx0, y];
      } },
      { id: 'liftrun', build(B, c) { B.terrain(600 + 300 * c.d, c.rng.float(-60, 60)); liftPost(B, c); } },
      { id: 'liftstep', build(B, c) { B.flat(220); B.cliff(-(150 + 100 * c.d)); B.flat(300); liftPost(B, c); } },
      { id: 'liftdip', build(B, c) { B.flat(120); B.pit(260 + 200 * c.d, 260); B.terrain(320, c.rng.float(-40, 40)); liftPost(B, c); } },
    ],
  });

  // =====================================================================
  // BLINKCUP — the cup jumps between spots (passive)
  // =====================================================================
  const blinkPost = (B, c) => cupPost(B, 'blinkcup', (BB, hole) => {
    const [x, y] = hole.cup, pts = [x, y];
    if (hole.green) {
      const [a, b] = hole.green;
      for (const px of [a + 36, b - 36]) if (Math.abs(px - x) > 70) pts.push(px, y);
    }
    if (pts.length < 4) return;
    B.add({ t: 'blinkcup', pts: pts.map(rd), T: fx(2.4 - 0.6 * c.d, 2), ph: 0 });
  });
  D.register('blinkcup', {
    essential: false, passive: true,
    pieces: [
      { id: 'blinkline', intro: true, goal: true, build(B, c) {
        B.flat(200); B.greenFlat(560); B.flat(200);
        const [a, b, y] = B.green, pts = [];
        for (let i = 0; i < 3; i++) pts.push(a + 70 + (b - a - 140) * i / 2, y);
        B.cup = [pts[0], pts[1]];
        B.add({ t: 'blinkcup', pts: pts.map(rd), T: fx(2.4 - 0.6 * c.d, 2), ph: 0 });
      } },
      { id: 'blinkledges', goal: true, build(B, c) {
        // three island greens at different heights; the cup hops between them
        B.flat(160);
        const g = B.pit(1300 + 200 * c.d, 320);
        const pts = [], span = g.x1 - g.x0;
        for (let i = 0; i < 3; i++) {
          const cx = g.x0 + span * (i + 0.5) / 3, iy = g.y - [20, 160, 70][i] - 60 * c.d * (i % 2);
          B.island(cx - 120, cx + 120, iy, 'n', 70);
          pts.push(cx, iy);
        }
        B.cup = [pts[0], pts[1]]; B.green = [pts[0] - 120, pts[0] + 120, pts[1]];
        B.add({ t: 'blinkcup', pts: pts.map(rd), T: fx(2.6 - 0.6 * c.d, 2), ph: 0 });
        B.flat(200);
      } },
      { id: 'blinkterrace', goal: true, build(B, c) {
        // a staircase of green terraces with a spot on each step
        B.flat(200);
        const pts = [];
        for (let i = 0; i < 3; i++) {
          const x0 = B.x; B.to(B.x + 220, B.y, 'n'); pts.push(x0 + 110, B.y);
          if (i < 2) B.cliff(-(90 + 40 * c.d));
        }
        B.flat(30); B.cliff(-200); B.flat(160);
        B.cup = [pts[0], pts[1]]; B.green = [pts[0] - 110, pts[0] + 110, pts[1]];
        B.add({ t: 'blinkcup', pts: pts.map(rd), T: fx(2.6 - 0.6 * c.d, 2), ph: 0 });
      } },
      { id: 'blinkhills', build(B, c) { B.terrain(500, -(80 + 60 * c.d)); B.terrain(500, 80 + 60 * c.d); blinkPost(B, c); } },
      { id: 'blinkstep', build(B, c) { B.flat(200); B.cliff(140 + 80 * c.d); B.flat(320); blinkPost(B, c); } },
      { id: 'blinkcarry', build(B, c) { B.flat(140); B.pit(340 + 200 * c.d, 280); B.flat(240); blinkPost(B, c); } },
    ],
  });

  // =====================================================================
  // SHRINKCUP — the cup shrinks every stroke (passive)
  // =====================================================================
  const shrink = (B, c) => { if (!B.gm.some((g) => g.t === 'shrinkcup')) B.add({ t: 'shrinkcup', per: rd(3 + 3 * c.d), min: 14 }); };
  D.register('shrinkcup', {
    essential: false, passive: true,
    pieces: [
      { id: 'shrinkplateau', intro: true, goal: true, build(B, c) {
        B.flat(200); B.cliff(-(120 + 120 * c.d)); B.flat(80); B.greenFlat(260); B.flat(160); shrink(B, c);
      } },
      { id: 'shrinkisland', goal: true, build(B, c) {
        B.flat(140);
        const g = B.pit(560 + 260 * c.d, 320);
        const cx = (g.x0 + g.x1) / 2;
        B.islandGreen(cx - 130, cx + 130, g.y - c.rng.float(20, 120), 80);
        B.flat(220); shrink(B, c);
      } },
      { id: 'shrinkicy', goal: true, build(B, c) {
        // a slick ice shelf runs up to a small green with a drop behind it
        B.flat(160); B.to(B.x + 420, B.y, 'i'); B.flat(30);
        B.greenFlat(220); B.flat(20);
        B.pit(240, 280); B.flat(200); shrink(B, c);
      } },
      { id: 'shrinkcarry', build(B, c) { B.flat(140); B.pit(500 + 300 * c.d, 300); B.flat(200); shrink(B, c); } },
      { id: 'shrinkhill', build(B, c) { const h = 220 + 160 * c.d; B.terrain(380, -h, null, { smooth: true }); B.flat(60); B.terrain(380, h, null, { smooth: true }); shrink(B, c); } },
      { id: 'shrinkbunkers', build(B, c) { for (let i = 0; i < 3; i++) { B.terrain(c.rng.float(160, 240), c.rng.float(-30, 30)); B.bunker(c.rng.float(110, 160)); } B.flat(120); shrink(B, c); } },
    ],
  });

  // =====================================================================
  // FLOOD — water rises every stroke: climb (passive)
  // =====================================================================
  const HZ = { w: 1, l: 1, o: 1, x: 1, z: 1, v: 1 };
  const floodPost = (B, c, n) => cupPost(B, 'flood', (BB, hole) => {
    const g = hole.ground, cx = hole.cup[0];
    let low = hole.tee[1] + 6;
    for (let i = 0; i + 3 < g.length; i += 2) {
      if (HZ[hole.gs[i >> 1]] || g[i] > cx) continue;
      low = Math.max(low, Math.min(g[i + 1], g[i + 3]));
    }
    const base = low + 50, top = Math.min(base, hole.cup[1] + 50), dy = Math.max(30, (base - top) / (n || 3));
    // the water first reaches the lowest ground on stroke 3
    B.add({ t: 'flood', y0: rd(base + dy), dy: rd(dy), top: rd(top) });
  });
  function floodSteps(B, c, k, up, run) {
    for (let i = 0; i < k; i++) { B.flat(run); B.cliff(-up); }
  }
  D.register('flood', {
    essential: false, passive: true,
    pieces: [
      { id: 'floodstairs', intro: true, goal: true, build(B, c) {
        floodSteps(B, c, 3, 150 + 60 * c.d, 280);
        B.flat(60); B.greenFlat(260); B.flat(160); floodPost(B, c, 3);
      } },
      { id: 'floodtower', goal: true, build(B, c) {
        // two tall cliffs to the summit green
        floodSteps(B, c, 2, 300 + 100 * c.d, 380);
        B.flat(80); B.greenFlat(260); B.flat(160); floodPost(B, c, 2.5);
      } },
      { id: 'floodislands', goal: true, build(B, c) {
        // islands rising out of a flooding lagoon, green on the highest
        B.flat(160);
        const g = B.pit(1500 + 200 * c.d, 280);
        const span = g.x1 - g.x0;
        for (let i = 0; i < 2; i++) { const cx = g.x0 + span * (i + 0.6) / 3; B.island(cx - 120, cx + 120, g.y - 120 * (i + 1) - 40 * c.d, B.sMain, 70); }
        const cx = g.x0 + span * 0.86;
        B.islandGreen(cx - 130, cx + 130, g.y - 380 - 80 * c.d, 80);
        B.flat(200); floodPost(B, c, 3);
      } },
      { id: 'floodclimb', build(B, c) { B.terrain(600, -(220 + 120 * c.d), null, { smooth: true }); B.flat(160); floodPost(B, c, 4); } },
      { id: 'floodsteps', build(B, c) { floodSteps(B, c, 2, 120 + 60 * c.d, 240); B.flat(160); floodPost(B, c, 4); } },
      { id: 'floodledge', build(B, c) { B.flat(160); B.pit(260 + 120 * c.d, 260, { dyEnd: -(160 + 80 * c.d) }); B.flat(260); floodPost(B, c, 4); } },
    ],
  });
});
