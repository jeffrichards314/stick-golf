/*
 * Headless shot-search bot. Uses the exact shared physics module.
 * Beam search over strokes; per state: coarse angle/power grid + local refinement, scored by
 * geodesic distance fields (free space + gimmick "shortcut" edges such as teleporters, pipes,
 * cannons). Closed gates/toggles block fields; when the cup is sealed the bot heads for switches,
 * and with token holes it collects tokens first.
 */
(function (root, factory) {
  const isNode = typeof module === 'object' && module.exports;
  const P = isNode ? require('./physics.js') : root.GOLF.Physics;
  const mod = factory(P);
  if (isNode) module.exports = mod;
  else { root.GOLF = root.GOLF || {}; root.GOLF.Bot = mod; }
})(typeof self !== 'undefined' ? self : this, function (P) {
  'use strict';
  const now = (typeof performance !== 'undefined' && performance.now) ? () => performance.now() : () => Date.now();
  const FCELL = 24, TOP = -900, UNREACH = 1e6;

  function makeGrid(hole) {
    const cols = Math.ceil(hole.w / FCELL) + 1, rows = Math.ceil((hole.h - TOP) / FCELL) + 1;
    const free = new Uint8Array(cols * rows);
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++)
      free[r * cols + c] = P.insideSolid(hole, c * FCELL + FCELL / 2, TOP + r * FCELL + FCELL / 2) ? 0 : 1;
    return { cols, rows, free };
  }
  const cellOf = (G, x, y) => {
    const c = Math.max(0, Math.min(G.cols - 1, Math.floor(x / FCELL))), r = Math.max(0, Math.min(G.rows - 1, Math.floor((y - TOP) / FCELL)));
    return r * G.cols + c;
  };

  // shortcut edges: [fromCell, toCell, cost] meaning "from A you can get to B"
  function shortcutEdges(hole, G) {
    const edges = [];
    const W = P.createWorld(hole);
    const flight = (x, y, vx, vy) => {
      const S = P.initState(W); S.x = x; S.y = y; S.hold = false; S.rest = false; S.vx = vx; S.vy = vy; S.shotT = 0; S.lastX = x; S.lastY = y;
      let px = x, py = y;
      for (let i = 0; i < 900; i++) { const r = P.step(W, S); if (r === 2 || r === 4) break; px = S.x; py = S.y; if (r) break; }
      return [px, py];
    };
    (hole.gm || []).forEach((g) => {
      switch (g.t) {
        case 'teleport': case 'portal':
          edges.push([cellOf(G, g.x, g.y), cellOf(G, g.x2, g.y2), 80], [cellOf(G, g.x2, g.y2), cellOf(G, g.x, g.y), 80]); break;
        case 'zipline': edges.push([cellOf(G, g.x, g.y + 12), cellOf(G, g.x2, g.y2 + 12), 80]); break;
        case 'pipe': { const p = g.p; edges.push([cellOf(G, p[0], p[1]), cellOf(G, p[p.length - 2], p[p.length - 1]), 80]); break; }
        case 'cannon': { const e = flight(g.x, g.y, Math.cos(g.ang) * g.sp, Math.sin(g.ang) * g.sp); edges.push([cellOf(G, g.x, g.y), cellOf(G, e[0], e[1]), 120]); break; }
        case 'catapult': { const e = flight(g.x, g.y - 8, Math.cos(g.ang) * g.sp, Math.sin(g.ang) * g.sp); edges.push([cellOf(G, g.x, g.y - 8), cellOf(G, e[0], e[1]), 120]); break; }
      }
    });
    return edges;
  }

  function field(G, edges, blocked, gx, gy) {
    const { cols, rows } = G;
    const free = blocked ? G.free.slice() : G.free;
    if (blocked) for (const b of blocked) {
      const c0 = Math.max(0, Math.floor(b[0] / FCELL)), c1 = Math.min(cols - 1, Math.floor((b[0] + b[2]) / FCELL));
      const r0 = Math.max(0, Math.floor((b[1] - TOP) / FCELL)), r1 = Math.min(rows - 1, Math.floor((b[1] + b[3] - TOP) / FCELL));
      for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) free[r * cols + c] = 0;
    }
    const dist = new Float32Array(cols * rows).fill(1e9);
    const rev = new Map(); // toCell -> [[fromCell, cost]]
    for (const [a, b, w] of edges) { if (!rev.has(b)) rev.set(b, []); rev.get(b).push([a, w]); }
    let start = cellOf(G, gx, gy);
    if (!free[start]) start = cellOf(G, gx, gy - FCELL);
    dist[start] = 0;
    const q = [start], inq = new Uint8Array(cols * rows); inq[start] = 1;
    const nb = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, 1.414], [1, -1, 1.414], [-1, 1, 1.414], [-1, -1, 1.414]];
    let head = 0;
    while (head < q.length) {
      const k = q[head++]; inq[k] = 0;
      const r = (k / cols) | 0, c = k - r * cols, d0 = dist[k];
      for (const [dc, dr, w] of nb) {
        const c2 = c + dc, r2 = r + dr;
        if (c2 < 0 || r2 < 0 || c2 >= cols || r2 >= rows) continue;
        const k2 = r2 * cols + c2;
        if (!free[k2]) continue;
        const nd = d0 + w * FCELL;
        if (nd < dist[k2]) { dist[k2] = nd; if (!inq[k2]) { inq[k2] = 1; q.push(k2); } }
      }
      const rs = rev.get(k);
      if (rs) for (const [a, w] of rs) { const nd = d0 + w; if (nd < dist[a]) { dist[a] = nd; if (!inq[a]) { inq[a] = 1; q.push(a); } } }
      if (head > 6000000) break;
    }
    return (x, y) => {
      let best = 1e9;
      for (const oy of [0, -12, -24, 12]) {
        const c = Math.floor(x / FCELL), r = Math.floor((y + oy - TOP) / FCELL);
        if (c < 0 || r < 0 || c >= cols || r >= rows) continue;
        const v = dist[r * cols + c]; if (v < best) best = v;
      }
      return best >= 1e9 ? UNREACH + Math.hypot(x - gx, y - gy) : best;
    };
  }

  // Scorer: lower is better.
  function makeScorer(hole) {
    const G = makeGrid(hole), edges = shortcutEdges(hole, G), cache = new Map();
    const gm = hole.gm || [];
    const gates = [], tokIdx = gm.findIndex((g) => g.t === 'tokens');
    gm.forEach((g, i) => { if (g.t === 'gate' || g.t === 'toggle') gates.push(i); });
    const get = (key, blocked, x, y) => { if (!cache.has(key)) cache.set(key, field(G, edges, blocked, x, y)); return cache.get(key); };
    const cup = hole.cup;
    // blocked rects + signature for a given switch state vector (dyn values of gates/toggles)
    const blockFor = (st) => {
      const blocked = []; let sig = '';
      gates.forEach((i, j) => {
        const g = gm[i], v = st[j];
        if (g.t === 'gate') { if (!v) { blocked.push([g.x, g.y, g.w, g.h]); sig += i + 'c'; } }
        else { for (const r of (v ? g.b : g.a)) blocked.push(r); sig += i + (v ? 'b' : 'a'); }
      });
      return { blocked, sig };
    };
    return function score(S) {
      let blocked = null, sig = '';
      const st = gates.map((i) => S.dyn[i] ? 1 : 0);
      if (gates.length) ({ blocked, sig } = blockFor(st));
      if (tokIdx >= 0) {
        const g = gm[tokIdx], n = g.pts.length >> 1;
        let left = 0, best = 1e12;
        for (let i = 0; i < n; i++) if (!(S.dyn[tokIdx] & (1 << i))) {
          left++;
          const f = get('t' + i + sig, blocked, g.pts[2 * i], g.pts[2 * i + 1]);
          best = Math.min(best, f(S.x, S.y));
        }
        if (left) return 20000 * left + best;
      }
      const fc = get('cup' + sig, blocked, cup[0], cup[1] - 10);
      const v = fc(S.x, S.y);
      if (v < UNREACH || !gates.length) return v;
      // cup sealed off. Prefer a switch whose flip would connect the ball to the cup; each closed gate costs a lot.
      let closed = 0, bestUseful = 1e12, bestAny = 1e12;
      gates.forEach((i, j) => {
        const g = gm[i];
        if (g.t === 'gate' && S.dyn[i]) return;
        if (g.t === 'gate') closed++;
        const f = get('s' + i + sig, blocked, g.sx, g.sy), dsw = f(S.x, S.y);
        bestAny = Math.min(bestAny, dsw);
        const st2 = st.slice(); st2[j] = st2[j] ? 0 : 1;
        const b2 = blockFor(st2), f2 = get('cup' + b2.sig, b2.blocked, cup[0], cup[1] - 10);
        if (f2(S.x, S.y) < UNREACH || f2(g.sx, g.sy) < UNREACH) bestUseful = Math.min(bestUseful, dsw);
      });
      const best = bestUseful < 1e12 ? bestUseful : 8000 + bestAny;
      return 40000 + 12000 * closed + Math.min(best, 11000);
    };
  }

  const COARSE_A = 26, COARSE_P = [0.05, 0.08, 0.12, 0.16, 0.21, 0.27, 0.34, 0.42, 0.5, 0.59, 0.68, 0.78, 0.89, 1.0];
  const DENSE_P = [0.04, 0.06, 0.08, 0.1, 0.12, 0.14, 0.17, 0.2, 0.23, 0.27, 0.31, 0.35, 0.4, 0.45, 0.5, 0.56, 0.62, 0.68, 0.75, 0.82, 0.9, 1.0];
  const FULL_CIRCLE = { antigrav: 1, sidegrav: 1, magnet: 1, sticky: 1 };

  function* solveGen(hole, o) {
    o = Object.assign({ maxStrokes: hole.par + 2, beam: 5, worldOpts: {} }, o || {});
    const W = P.createWorld(hole, Object.assign({ gspeed: 1, windMul: 1, hazardPenalty: 1, rec: false }, o.worldOpts));
    const score = makeScorer(hole);
    yield;
    const full = (hole.gm || []).some((g) => FULL_CIRCLE[g.t]);
    const S0 = P.initState(W);
    let frontier = [{ S: S0, shots: [], score: score(S0) }];
    let sims = 0;
    for (let stroke = 1; stroke <= o.maxStrokes; stroke++) {
      const cands = [];
      const lastStroke = stroke === o.maxStrokes;
      for (const node of frontier) {
        const results = [];
        const tryShot = function (a, p) {
          const S = P.cloneState(node.S);
          const r = P.simulateShot(W, S, a, p, 0);
          sims++;
          if (r === 'holed') return { holed: true, a, p, S };
          if (r === 'hazard' || r === 'fail') return null;
          const sc = score(S) + (P.SURF_LIST[S.supS] && P.SURF_LIST[S.supS].c === 's' ? 40 : 0);
          return { a, p, S, score: sc };
        };
        const CA = o.dense ? 40 : COARSE_A, CP = o.dense ? DENSE_P : COARSE_P;
        const a0 = -Math.PI, a1 = full ? Math.PI : 0, na = full ? CA * 2 : CA;
        for (let ia = 0; ia <= na; ia++) {
          const a = a0 + ((a1 - a0) * ia) / na;
          for (const p of CP) {
            const res = tryShot(a, p);
            if (res && res.holed) return finish(node, res);
            if (res) results.push(res);
            if ((sims & 15) === 0) yield;
          }
        }
        results.sort((x, y) => x.score - y.score);
        const seeds = results.slice(0, lastStroke ? 6 : 4);
        let rng = (hole.seed || 1) * 7 + stroke * 131 + sims;
        const rnd = () => { rng = (rng * 1103515245 + 12345) & 0x7fffffff; return rng / 0x7fffffff; };
        for (let round = 0; round < 2; round++) {
          const pool = round === 0 ? seeds : results.slice(0, 3);
          const span = round === 0 ? 1 : 0.4;
          for (const sd of pool) {
            const nTry = (lastStroke ? 36 : 22) * (o.dense ? 2 : 1);
            for (let k = 0; k < nTry; k++) {
              const a = sd.a + (rnd() - 0.5) * 0.13 * span;
              const p = Math.max(0.02, Math.min(1, sd.p * (1 + (rnd() - 0.5) * 0.22 * span) + (rnd() - 0.5) * 0.02));
              const res = tryShot(a, p);
              if (res && res.holed) return finish(node, res);
              if (res) results.push(res);
              if ((sims & 15) === 0) yield;
            }
          }
          results.sort((x, y) => x.score - y.score);
        }
        for (const r of results) cands.push({ S: r.S, shots: node.shots.concat([{ a: r.a, p: r.p }]), score: r.score });
      }
      if (!cands.length) break;
      cands.sort((x, y) => x.score - y.score);
      const seen = new Set(), next = [];
      for (const c of cands) {
        const key = Math.floor(c.S.x / 90) + ',' + Math.floor(c.S.y / 90) + ',' + c.S.dyn.join('');
        if (seen.has(key)) continue;
        seen.add(key); next.push(c);
        if (next.length >= o.beam) break;
      }
      frontier = next;
      if (o.debug) o.debug(stroke, next.map((n) => [Math.round(n.S.x), Math.round(n.S.y), Math.round(n.score), n.S.dyn.join('')]));
    }
    return { ok: false, strokes: 0, shots: [], sims };

    function finish(node, res) {
      const shots = node.shots.concat([{ a: res.a, p: res.p }]);
      return { ok: true, strokes: shots.length, shots, sims };
    }
  }

  function solve(hole, o) {
    const g = solveGen(hole, o);
    let r;
    do { r = g.next(); } while (!r.done);
    return r.value;
  }

  function createSolver(hole, o) {
    const g = solveGen(hole, o);
    let result = null;
    return {
      run(ms) {
        if (result) return result;
        const t0 = now();
        while (now() - t0 < (ms || 10)) { const r = g.next(); if (r.done) { result = r.value; return result; } }
        return null;
      },
      get result() { return result; },
    };
  }

  // Replay recorded shots from the start; returns {ok, strokes, path:[x,y,...] (optional)}
  function replay(hole, shots, worldOpts, wantPath) {
    const W = P.createWorld(hole, Object.assign({ gspeed: 1, windMul: 1, hazardPenalty: 1 }, worldOpts || {}));
    const S = P.initState(W);
    const path = wantPath ? [] : null;
    for (let i = 0; i < shots.length; i++) {
      P.shoot(W, S, shots[i].a, shots[i].p, 0);
      if (S.failed) return { ok: false, strokes: S.strokes, path };
      let r = 0;
      for (let k = 0; k < Math.ceil((P.C.MAX_SHOT_TIME + 2) / P.C.DT); k++) {
        r = P.step(W, S);
        if (path) path.push(S.x, S.y);
        if (r) break;
      }
      if (r === 1) return { ok: i === shots.length - 1, strokes: S.strokes, bonus: S.bonus, path, S };
      if (r === 2 || r === 4) return { ok: false, strokes: S.strokes, path };
    }
    return { ok: false, strokes: S.strokes, path };
  }

  return { solve, createSolver, replay, makeScorer };
});
