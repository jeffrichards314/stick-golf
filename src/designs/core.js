/*
 * Exemplar gimmick designs: pad, cannon, gate, teleport.
 * Pattern for every design file: each piece builds a self-contained stretch of terrain starting at
 * (B.x, B.y) and places gimmicks with B.add({...}). Goal pieces also build the green (B.greenFlat,
 * B.islandGreen, B.vault...) which sets the cup. Make the gimmick *the point* of the piece:
 * walls > 950px, chasms > 1900px, sealed vaults and corridors make it mandatory.
 */
(function (root, factory) {
  const isNode = typeof module === 'object' && module.exports;
  const D = isNode ? require('./registry.js') : root.GOLF.Designs;
  factory(D);
})(typeof self !== 'undefined' ? self : this, function (D) {
  'use strict';
  const PI = Math.PI;

  // ---------------- PAD ----------------
  D.register('pad', {
    essential: true,
    pieces: [
      { id: 'padhop', intro: true, build(B, c) {
        B.flat(160);
        const g = B.chasm(480 + 200 * c.d, 340);
        B.add({ t: 'pad', x: Math.round((g.x0 + g.x1) / 2), y: Math.round(g.y + 140), L: 80, ang: +(-PI / 2 + 0.42).toFixed(3), boost: 1000 });
        B.flat(220);
      } },
      { id: 'padwall', goal: true, essential: true, build(B, c) {
        B.flat(360);
        const px = B.x - 150;
        B.add({ t: 'pad', x: Math.round(px), y: Math.round(B.y - 4), L: 70, ang: +(-PI / 2 + 0.2).toFixed(3), boost: Math.round(1480 + 120 * c.d) });
        B.wallUp(1000 + 120 * c.d);
        B.flat(140); B.greenFlat(260); B.flat(160);
      } },
      { id: 'padchain', essential: true, build(B, c) {
        B.flat(200);
        const g = B.chasm(2000 + 300 * c.d, 380);
        const n = 2 + (c.d > 0.5 ? 1 : 0);
        for (let i = 0; i < n; i++) {
          const x = g.x0 + (g.x1 - g.x0) * (i + 1) / (n + 1);
          B.add({ t: 'pad', x: Math.round(x), y: Math.round(g.y + 160 + 30 * (i % 2)), L: 80, ang: +(-PI / 2 + 0.5).toFixed(3), boost: 1100 });
        }
        B.flat(260);
      } },
      { id: 'padshaft', essential: true, build(B, c) {
        // a deep shaft you must cross: pad springboards at the bottom bounce you up and over the far lip
        B.flat(220);
        const g = B.chasm(560, 760 + 120 * c.d, { dyEnd: -(700 + 120 * c.d), floor: 'k' });
        B.add({ t: 'pad', x: Math.round(g.x0 + 180), y: Math.round(g.fy - 8), L: 120, ang: +(-PI / 2 + 0.38).toFixed(3), boost: 1650 });
        B.add({ t: 'pad', x: Math.round(g.x1 - 160), y: Math.round(g.fy - 8), L: 120, ang: +(-PI / 2 + 0.12).toFixed(3), boost: 1750 });
        B.flat(320);
      } },
      { id: 'padsteps', essential: true, build(B, c) {
        // three sheer steps; a pad at the foot of each
        for (let i = 0; i < 3; i++) {
          B.flat(320);
          B.add({ t: 'pad', x: Math.round(B.x - 140), y: Math.round(B.y - 4), L: 70, ang: +(-PI / 2 + 0.22).toFixed(3), boost: Math.round(1180 + 80 * c.d) });
          B.wallUp(560 + 80 * c.d);
        }
        B.flat(260);
      } },
      { id: 'padledge', goal: true, essential: true, build(B, c) {
        // green on a high ledge over a chasm; only a pad in the pit reaches it
        B.flat(200);
        const g = B.chasm(900, 360, { dyEnd: -(900 + 100 * c.d) });
        B.add({ t: 'pad', x: Math.round(g.x1 - 180), y: Math.round(g.y0 + 150), L: 80, ang: +(-PI / 2 + 0.12).toFixed(3), boost: 1650 });
        B.flat(120); B.greenFlat(240); B.flat(160);
      } },
    ],
  });

  // ---------------- CANNON ----------------
  const cannonTo = (B, x, y, tx, ty, th) => {
    const sp = B.ballistic(x, y, tx, ty, th);
    return { t: 'cannon', x: Math.round(x), y: Math.round(y), r: 24, ang: +(-th).toFixed(3), amp: 0, f: 1.2, sp: Math.round(sp) };
  };
  D.register('cannon', {
    essential: true,
    pieces: [
      { id: 'cannonhop', intro: true, build(B, c) {
        B.flat(320);
        const cx = B.x - 120, cy = B.y - 20;
        const g = B.chasm(800, 360);
        const fx = B.x; B.flat(500);
        const gi = B.add(cannonTo(B, cx, cy, B.x - 250, B.y - 6, 0.85));
        B.tune(gi, 'sp', 700, 1600, fx + 60, B.x - 40, B.y + 2);
        B.flat(100);
      } },
      { id: 'cannonwall', goal: true, essential: true, build(B, c) {
        B.flat(380);
        const cx = B.x - 200, cy = B.y - 20;
        B.wallUp(1050 + 150 * c.d);
        const tx = B.x; B.flat(200); B.greenFlat(300); B.flat(160);
        const gi = B.add(cannonTo(B, cx, cy, B.cup[0] - 60, B.cup[1] - 8, 1.4));
        B.gm[gi].ang = -1.4;
        B.tune(gi, 'sp', 1500, 2580, tx + 40, B.x - 20, B.cup[1] + 2);
      } },
      { id: 'cannonchasm', essential: true, build(B, c) {
        B.flat(320);
        const cx = B.x - 120, cy = B.y - 20;
        B.chasm(2000 + 300 * c.d, 380);
        const fx = B.x; B.flat(200, 'r'); B.flat(520, 'r'); B.flat(120);
        const gi = B.add(cannonTo(B, cx, cy, B.x - 400, B.y - 6, 1.05));
        B.gm[gi].ang = -1.05;
        B.tune(gi, 'sp', 1000, 2400, fx + 60, B.x - 40, B.y + 2);
        B.flat(100);
      } },
      { id: 'cannonrelay', essential: true, build(B, c) {
        // cannon to an island cannon to the far shore
        B.flat(320);
        const cx = B.x - 120, cy = B.y - 20;
        const g = B.chasm(3000 + 300 * c.d, 380);
        const ix = g.x0 + (g.x1 - g.x0) * 0.48, iy = g.y - 80;
        B.island(ix - 160, ix + 160, iy, 'r', 70);
        const fx = B.x; B.flat(700, 'r'); B.flat(100);
        const a = B.add(cannonTo(B, cx, cy, ix - 40, iy - 6, 1.0)); B.gm[a].ang = -1.0;
        B.tune(a, 'sp', 900, 2200, ix - 150, ix + 60, iy + 2);
        const b = B.add(cannonTo(B, ix + 90, iy - 20, fx + 300, B.y - 6, 1.0)); B.gm[b].ang = -1.0;
        B.tune(b, 'sp', 900, 2400, fx + 40, B.x - 60, B.y + 2);
      } },
      { id: 'cannonmountain', essential: true, build(B, c) {
        // a mountain too tall to loft over; the cannon at its foot lobs you across
        B.flat(360);
        const cx = B.x - 180, cy = B.y - 20, y0 = B.y;
        B.flat(120);
        const mx0 = B.x; B.flat(700); const mx1 = B.x;
        const peak = y0 - 1150 - 120 * c.d;
        B.addSolid([mx0, y0 + 30, mx0 + 160, y0 - 600, (mx0 + mx1) / 2, peak, mx1 - 160, y0 - 600, mx1, y0 + 30], 'k');
        const fx = B.x; B.flat(700, 'r'); B.flat(80);
        const gi = B.add(cannonTo(B, cx, cy, fx + 300, y0 - 6, 1.3)); B.gm[gi].ang = -1.3;
        B.tune(gi, 'sp', 1500, 2580, fx + 40, B.x - 40, y0 + 2);
      } },
      { id: 'cannonsweep', goal: true, essential: true, build(B, c) {
        B.flat(320);
        const cx = B.x - 120, cy = B.y - 20;
        const g = B.chasm(2200 + 200 * c.d, 380);
        const ix = g.x1 - 700, iy = g.y - 220;
        B.islandGreen(ix - 150, ix + 150, iy, 80);
        const cn = cannonTo(B, cx, cy, B.cup[0], iy - 6, 1.1);
        cn.ang = -1.1;
        cn.amp = +(0.04 + 0.05 * c.d).toFixed(3); cn.f = 1.3;
        const gi = B.add(cn);
        B.tune(gi, 'sp', 1000, 2400, ix - 140, ix + 140, iy + 2);
        B.flat(300);
      } },
    ],
  });

  // ---------------- GATE ----------------
  D.register('gate', {
    essential: false,
    pieces: [
      { id: 'gatecorridor', intro: true, build(B, c) {
        const t = B.corridor(700 + 200 * c.d);
        B.add({ t: 'gate', x: Math.round(t.x0 + (t.x1 - t.x0) * 0.62), y: Math.round(t.top), w: 24, h: Math.round(t.y - t.top + 4), sx: Math.round(t.x0 + 140), sy: Math.round(t.y - 12) });
        B.flat(200);
      } },
      { id: 'gateperch', build(B, c) {
        // switch sits on a little perch before the corridor: hit it first, then roll through
        B.flat(260);
        const px = B.x - 130, py = B.y - 140 - 60 * c.d;
        B.addSolid([px - 40, py, px + 40, py, px + 30, py + 30, px - 30, py + 30], 'kkkk');
        B.flat(160);
        const t = B.corridor(600 + 200 * c.d);
        B.add({ t: 'gate', x: Math.round(t.x0 + 60), y: Math.round(t.top), w: 24, h: Math.round(t.y - t.top + 4), sx: Math.round(px), sy: Math.round(py - 12) });
        B.flat(200);
      } },
      { id: 'gatevault', goal: true, build(B, c) {
        // green in a vault; the gate is its door; the switch is up on a ledge beside it
        B.flat(300);
        const sx = B.x - 140, sy = B.y - 230 - 80 * c.d;
        B.addSolid([sx - 50, sy, sx + 50, sy, sx + 40, sy + 34, sx - 40, sy + 34], 'kkkk');
        B.flat(60);
        const v = B.vault(380);
        B.add({ t: 'gate', x: Math.round(v.x0 - 30), y: Math.round(v.top), w: 30, h: Math.round(v.y - v.top + 4), sx: Math.round(sx), sy: Math.round(sy - 12) });
        // vault left wall becomes the gate: remove it (gate drawn there instead)
        B.solids.splice(B.solids.length - 3, 1);
        B.parExtra += 1;
      } },
      { id: 'gatecage', goal: true, build(B, c) {
        // the green sits in a cage whose ROOF is the gate; hit the switch, then lob in
        B.flat(260);
        const sx = B.x - 120, sy = B.y - 12;
        B.flat(260 + 200 * c.d);
        const v = B.vault(360, { h: 150 });
        const roof = B.solids.pop();
        B.add({ t: 'gate', x: Math.round(v.x0 - 40), y: Math.round(v.top - 30), w: Math.round(v.x1 - v.x0 + 80), h: 30, sx: Math.round(sx), sy: Math.round(sy) });
        B.parExtra += 1;
      } },
      { id: 'gatestack', build(B, c) {
        // switch on a high shelf above the corridor mouth: pop it, drop down, roll through
        B.flat(200);
        const t0x = B.x;
        B.flat(220);
        const sy = B.y - 260 - 100 * c.d;
        B.addSolid([t0x - 20, sy, t0x + 200, sy, t0x + 190, sy + 30, t0x - 10, sy + 30], 'kkkk');
        const t = B.corridor(620 + 200 * c.d);
        B.add({ t: 'gate', x: Math.round(t.x0 + (t.x1 - t.x0) * 0.4), y: Math.round(t.top), w: 24, h: Math.round(t.y - t.top + 4), sx: Math.round(t0x + 120), sy: Math.round(sy - 12) });
        B.flat(200);
      } },
      { id: 'gatepair', build(B, c) {
        const t = B.corridor(900 + 200 * c.d);
        const mid = (t.x0 + t.x1) / 2;
        B.add({ t: 'gate', x: Math.round(mid - 40), y: Math.round(t.top), w: 24, h: Math.round(t.y - t.top + 4), sx: Math.round(t.x0 + 120), sy: Math.round(t.y - 12) });
        B.add({ t: 'gate', x: Math.round(t.x1 - 80), y: Math.round(t.top), w: 24, h: Math.round(t.y - t.top + 4), sx: Math.round(mid + 80), sy: Math.round(t.y - 12) });
        B.flat(200);
      } },
    ],
  });

  // ---------------- TELEPORT ----------------
  D.register('teleport', {
    essential: true,
    pieces: [
      { id: 'telehop', intro: true, build(B, c) {
        B.flat(340);
        const ax = B.x - 160, ay = B.y - 22;
        B.chasm(900 + 200 * c.d, 360);
        B.flat(420);
        B.add({ t: 'teleport', x: Math.round(ax), y: Math.round(ay), x2: Math.round(B.x - 260), y2: Math.round(B.y - 50), r: 24 });
        B.flat(100);
      } },
      { id: 'televault', goal: true, essential: true, build(B, c) {
        B.flat(420);
        const ax = B.x - 200, ay = B.y - 22;
        const v = B.vault(420 + 100 * c.d);
        B.add({ t: 'teleport', x: Math.round(ax), y: Math.round(ay), x2: Math.round(v.gx0 + 20), y2: Math.round(v.y - 40), r: 24 });
        B.parExtra += 1;
      } },
      { id: 'telewall', goal: true, essential: true, build(B, c) {
        B.flat(380);
        const ax = B.x - 180, ay = B.y - 22 - (c.d > 0.4 ? 90 : 0);
        B.wallUp(1050 + 120 * c.d);
        B.flat(140);
        const ex = B.x + 30, ey = B.y - 50;
        B.greenFlat(320, { cupFrac: 0.7 }); B.flat(160);
        B.add({ t: 'teleport', x: Math.round(ax), y: Math.round(ay), x2: Math.round(ex), y2: Math.round(ey), r: 24 });
      } },
      { id: 'telemountain', essential: true, build(B, c) {
        // a mountain no shot clears: the teleporter at its foot puts you on the far side
        B.flat(360);
        const ax = B.x - 170, y0 = B.y;
        B.flat(80);
        const mx0 = B.x; B.flat(800); const mx1 = B.x;
        B.addSolid([mx0, y0 + 30, mx0 + 200, y0 - 700, (mx0 + mx1) / 2, y0 - 1200, mx1 - 200, y0 - 700, mx1, y0 + 30], 'k');
        B.flat(460);
        B.add({ t: 'teleport', x: Math.round(ax), y: Math.round(y0 - 22), x2: Math.round(B.x - 300), y2: Math.round(B.y - 50), r: 24 });
        B.flat(120);
      } },
      { id: 'telepit', essential: true, build(B, c) {
        // drop into a deep canyon; the only way out is the teleporter on its floor
        B.flat(220);
        const y0 = B.y;
        B.cliff(900 + 100 * c.d);
        B.flat(520, 'r');
        const ax = B.x - 260, ay = B.y - 22;
        B.cliff(-(900 + 100 * c.d));
        B.flat(480);
        B.add({ t: 'teleport', x: Math.round(ax), y: Math.round(ay), x2: Math.round(B.x - 300), y2: Math.round(B.y - 50), r: 24 });
        B.flat(100);
      } },
      { id: 'telechain', essential: true, build(B, c) {
        B.flat(300);
        const ax = B.x - 150;
        const g = B.chasm(2200 + 200 * c.d, 380);
        const ix = (g.x0 + g.x1) / 2;
        B.island(ix - 110, ix + 110, g.y - 60, B.sMain, 60);
        B.flat(420);
        B.add({ t: 'teleport', x: Math.round(ax), y: Math.round(g.y0 - 22), x2: Math.round(ix - 60), y2: Math.round(g.y - 110), r: 24 });
        B.add({ t: 'teleport', x: Math.round(ix + 70), y: Math.round(g.y - 60 - 22), x2: Math.round(B.x - 260), y2: Math.round(B.y - 50), r: 24 });
        B.flat(100);
      } },
    ],
  });
});
