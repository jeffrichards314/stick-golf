/*
 * Seeded hole generator. A hole = tee → lead-in wrapper → gimmick set-pieces (src/designs/*) → green.
 * Courses: c01 plain golf; course n introduces one gimmick: holes 1-5 explore it, 6-8 mix it with
 * earlier gimmicks, 9 is a finale.
 */
(function (root, factory) {
  const isNode = typeof module === 'object' && module.exports;
  const deps = isNode
    ? [require('./rng.js'), require('./physics.js'), require('./templates.js'), require('./manifest.js'), require('./designs/index.js')]
    : [root.GOLF.RNG, root.GOLF.Physics, root.GOLF.Templates, root.GOLF.Manifest, root.GOLF.Designs];
  const mod = factory.apply(null, deps);
  if (isNode) module.exports = mod;
  else { root.GOLF = root.GOLF || {}; root.GOLF.Generator = mod; }
})(typeof self !== 'undefined' ? self : this, function (RNG, P, TPL, M, D) {
  'use strict';
  const R = P.C.R;
  const SURF_CHAR = { fairway: 'f', rough: 'r', sand: 's', ice: 'i', goo: 'g', bouncy: 'b' };
  const HZ_CHAR = { water: 'w', lava: 'l', oob: 'o', spikes: 'x' };
  const ALL_GIMMICKS = P.GIMMICK_TYPES.slice();
  const PASSIVE = { fog: 1, movcup: 1, shrinkcup: 1, liftcup: 1, blinkcup: 1, decoy: 1, flood: 1 };

  // ---------------- bounding boxes (validation + engagement) ----------------
  function gimmickBoxes(o) {
    const seg = (x, y, x2, y2, m) => [Math.min(x, x2) - m, Math.min(y, y2) - m, Math.max(x, x2) + m, Math.max(y, y2) + m];
    const pt = (x, y, r) => [x - r, y - r, x + r, y + r];
    const rc = (x, y, w, h) => [x, y, x + w, y + h];
    switch (o.t) {
      case 'wind': return o.w === undefined ? [] : [rc(o.x, o.y, o.w, o.h)];
      case 'fan': case 'antigrav': case 'lowgrav': case 'sidegrav': case 'slowmo': case 'drag': case 'floatpool':
      case 'breakable': case 'door': case 'vanish': case 'sticky': case 'crumble': case 'glass': case 'fog':
        return [rc(o.x, o.y, o.w, o.h)];
      case 'gate': return [rc(o.x, o.y, o.w, o.h), pt(o.sx, o.sy, 16)];
      case 'piston': return [[Math.min(o.x, o.x + o.dx), Math.min(o.y, o.y + o.dy), Math.max(o.x, o.x + o.dx) + o.w, Math.max(o.y, o.y + o.dy) + o.h]];
      case 'crusher': return [[o.x, o.y, o.x + o.w, o.y + o.h + o.dy]];
      case 'skim': return [rc(o.x, o.y - 10, o.w, 20)];
      case 'movplat': return [[Math.min(o.x, o.x2), Math.min(o.y, o.y2), Math.max(o.x, o.x2) + o.w, Math.max(o.y, o.y2) + o.h]];
      case 'windmill': return [pt(o.x, o.y, o.L)];
      case 'rotplat': case 'seesaw': return [pt(o.x, o.y, o.L / 2)];
      case 'pendulum': return [pt(o.x, o.y, o.L + (o.r || 22))];
      case 'pad': return [pt(o.x, o.y, (o.L || 70) / 2 + 6)];
      case 'teleport': case 'portal': return [pt(o.x, o.y, o.r || 22), pt(o.x2, o.y2, o.r || 22)];
      case 'zipline': return [seg(o.x, o.y, o.x2, o.y2 + 12, 22)];
      case 'pipe': { const p = o.p, n = p.length; return [pt(p[0], p[1], o.r || 22), pt(p[n - 2], p[n - 1], o.r || 22)]; }
      case 'gwell': case 'blackhole': return [pt(o.x, o.y, o.r)];
      case 'cannon': return [pt(o.x, o.y, o.r || 20)];
      case 'bumper': case 'spinner': case 'mine': case 'ring': return [pt(o.x, o.y, o.r || 30)];
      case 'bubble': return [[o.x - (o.r || 26), o.y + (o.vy || -150) * (o.T || 3) - 10, o.x + (o.r || 26) + Math.max(0, (o.dx || 0) * (o.T || 3)), o.y + (o.r || 26)]];
      case 'conveyor': case 'oneway': case 'ricochet': case 'spikes': case 'boost': case 'quicksand': case 'laser': case 'cushion':
        return [seg(o.x, o.y, o.x2, o.y2, 6)];
      case 'magnet': return [seg(o.x, o.y, o.x2, o.y2, Math.min(60, o.r || 60))];
      case 'saw': return [seg(o.x, o.y, o.x2, o.y2, o.r || 18)];
      case 'catapult': return [[o.x - o.w / 2, o.y - 12, o.x + o.w / 2, o.y + 4]];
      case 'geyser': return [[o.x - o.w / 2, o.y - o.h, o.x + o.w / 2, o.y]];
      case 'tornado': { const x2 = o.x2 === undefined ? o.x : o.x2; return [[Math.min(o.x, x2) - o.w / 2, o.y - o.h, Math.max(o.x, x2) + o.w / 2, o.y]]; }
      case 'tokens': { const out = []; for (let i = 0; i < o.pts.length; i += 2) out.push(pt(o.pts[i], o.pts[i + 1], (o.r || 16) + 4)); return out; }
      case 'toggle': return o.a.concat(o.b).map((r) => rc(r[0], r[1], r[2], r[3])).concat([pt(o.sx, o.sy, 16)]);
      case 'phase': return o.blocks.map((r) => rc(r[0], r[1], r[2], r[3]));
      case 'liftcup': return [[o.x - o.w / 2, o.y1, o.x + o.w / 2, o.yb]];
      case 'decoy': { const out = []; for (let i = 0; i < o.pts.length; i += 2) out.push(pt(o.pts[i], o.pts[i + 1] - 6, 16)); return out; }
      default: return [];
    }
  }
  const CLEAR_EXEMPT = { wind: 1, fog: 1, lowgrav: 1, antigrav: 1, sidegrav: 1, slowmo: 1, drag: 1, movcup: 1, shrinkcup: 1, blinkcup: 1, flood: 1, liftcup: 1, gwell: 1, tornado: 1, floatpool: 1, magnet: 1 };
  function gimmickBox(o) {
    const b = gimmickBoxes(o); if (!b.length) return null;
    return [Math.min(...b.map((v) => v[0])), Math.min(...b.map((v) => v[1])), Math.max(...b.map((v) => v[2])), Math.max(...b.map((v) => v[3]))];
  }

  // ---------------- hole generation ----------------
  function pieceDef(spec) {
    if (!spec.g) return TPL.BASIC.find((p) => p.id === spec.id) || TPL.BASIC[0];
    const d = D.get(spec.g);
    if (!d || !d.pieces.length) return null;
    return d.pieces.find((p) => p.id === spec.id) || d.pieces[0];
  }

  function generateHole(params) {
    const p = Object.assign({ difficulty: 0.3, style: 'rolling', surfaces: { main: 'fairway', alt: 'rough' }, hazard: 'water',
      hazardDensity: 0.5, wind: 0, role: 'endless', theme: 'c01', pieces: [], sig: null, wrapper: null }, params);
    const seed = p.seed >>> 0, rng = RNG.makeRng(seed);
    const d = Math.max(0, Math.min(1, p.difficulty));
    const wrapper = TPL.WRAP[p.wrapper] || rng.pick(TPL.WRAPPERS);
    const ctx = {
      rng: rng.fork('terrain'), d, style: p.style,
      sMain: SURF_CHAR[p.surfaces.main] || 'f', sAlt: SURF_CHAR[p.surfaces.alt] || 'r',
      hzChar: p.hazardDensity <= 0 ? 'r' : (HZ_CHAR[p.hazard] || 'w'), hazardDensity: p.hazardDensity,
      hard: p.role === 'combo' || p.role === 'boss', sig: p.sig, intro: p.role === 'intro',
      wideGreen: p.pieces.some((s) => s.g === 'movcup'), role: p.role,
      tuneLaunch: (h, gi, key, lo, hi, x0, x1, ymax) => tuneLaunch(h, gi, key, lo, hi, x0, x1, ymax),
    };
    if (ctx.sAlt === ctx.sMain) ctx.sAlt = ctx.sMain === 'r' ? 'f' : 'r';
    const B = TPL.makeBuilder(ctx);
    B.post = [];
    B.teeBox(TPL.Y0 + (wrapper.ty || 0));
    wrapper.lead(B, ctx);
    const used = [];
    p.pieces.forEach((spec, i) => {
      const pd = pieceDef(spec);
      if (!pd || B.cup) return; // a goal piece already placed the cup
      if (i > 0) wrapper.mid(B, ctx);
      ctx.piece = spec; ctx.pieceG = spec.g;
      pd.build(B, ctx);
      used.push((spec.g || 'basic') + ':' + pd.id);
    });
    if (!B.cup) { B.terrain(220, ctx.rng.float(-40, 40), null, { amp: 10 }); B.greenFlat(260); }
    B.end();
    const hole = finalize(B, p, wrapper, used);
    hole.gm = B.gm;
    for (const fn of B.post) fn(B, hole);
    hole.gm = B.gm;
    hole.sigIdx = B.sigIdx.slice();
    if (p.wind > 0 && !hole.gm.some((g) => g.t === 'wind' && g.w === undefined)) {
      const mag = [0, 45, 100, 170][Math.min(3, Math.round(p.wind))];
      hole.gm.push({ t: 'wind', ax: Math.round(rng.sign() * mag * rng.float(0.7, 1.1)), ay: 0, gust: 0.3, f: 0.7, ph: +rng.next().toFixed(2) });
    }
    hole.gk = hole.gm.map((g) => g.t);
    hole.par = estimatePar(hole, B);
    return hole;
  }

  // Simulate a launch from gimmick gi (cannon/catapult) or a free ball; returns resting point or null on hazard.
  function launchLanding(hole, gi, set) {
    const W = P.createWorld(hole), S = P.initState(W);
    const g = hole.gm[gi];
    S.hold = false; S.rest = false; S.shotT = 0; S.lastX = g.x; S.lastY = g.y;
    if (g.t === 'cannon') { S.x = g.x; S.y = g.y; S.cannon = gi; S.cannonT = 0; }
    else { S.x = set.x; S.y = set.y; S.vx = set.vx; S.vy = set.vy; }
    for (let i = 0; i < 2400; i++) {
      const r = P.step(W, S);
      if (r === 1) return { x: S.x, y: S.y, holed: true };
      if (r === 2 || r === 4) return null;
      if (r === 3) return { x: S.x, y: S.y };
    }
    return { x: S.x, y: S.y };
  }
  // Tune numeric field `key` of gimmick gi within [lo,hi] so its launch comes to rest within [x0,x1] (closest to centre).
  function tuneLaunch(hole, gi, key, lo, hi, x0, x1, ymax) {
    const g = hole.gm[gi], mid = (x0 + x1) / 2;
    let best = null, bestD = 1e9;
    for (let i = 0; i <= 48; i++) {
      g[key] = Math.round(lo + (hi - lo) * i / 48);
      const l = launchLanding(hole, gi);
      if (!l) continue;
      if (l.holed) { best = g[key]; bestD = -1; break; }
      if (l.x >= x0 && l.x <= x1 && (ymax === undefined || l.y <= ymax)) { const dd = Math.abs(l.x - mid); if (dd < bestD) { bestD = dd; best = g[key]; } }
    }
    g[key] = best !== null ? best : Math.round((lo + hi) / 2);
    return best !== null;
  }

  function finalize(B, p, wrapper, used) {
    const g = B.pts.map((v) => Math.round(v));
    for (let i = 2; i < g.length; i += 2) if (g[i] <= g[i - 2]) g[i] = g[i - 2] + 1;
    let maxY = -1e9; for (let i = 1; i < g.length; i += 2) maxY = Math.max(maxY, g[i]);
    const hole = {
      v: 2, id: p.id || ('h' + p.seed), name: p.name || '', par: 3, seed: p.seed >>> 0, role: p.role, theme: p.theme,
      sig: p.sig || null, tpl: wrapper.id + '|' + used.join('+'), wrapper: wrapper.id, pieces: used,
      w: g[g.length - 2], h: Math.round(maxY + 380),
      tee: [B.tee[0], B.tee[1]], cup: [Math.round(B.cup[0]), Math.round(B.cup[1])],
      green: B.green ? [Math.round(B.green[0]), Math.round(B.green[1])] : null,
      ground: g, gs: B.gs.join(''), solids: B.solids, gm: [],
    };
    if (p.cupW) hole.cupW = p.cupW;
    return hole;
  }

  function estimatePar(hole, B) {
    const dx = Math.abs(hole.cup[0] - hole.tee[0]), dy = hole.tee[1] - hole.cup[1];
    const par = 1 + Math.ceil(dx / 1400) + (dy > 300 ? 1 : 0) + (B.parExtra || 0);
    return Math.max(2, Math.min(10, par));
  }

  // Final par blends the layout estimate with the bot's best (bot <= par+1 always).
  function finalizePar(hole, botStrokes) {
    const dx = Math.abs(hole.cup[0] - hole.tee[0]);
    hole.par = Math.max(dx > 1800 ? 3 : 2, Math.floor((hole.par + botStrokes + 1) / 2));
    return hole;
  }

  // ---------------- structural validation ----------------
  function validateHole(hole) {
    const errs = [];
    const W = P.createWorld(hole);
    const [tx, ty] = hole.tee;
    if (P.insideSolid(hole, tx, ty)) errs.push('tee inside solid');
    if (P.clearance(W, tx, ty) < R - 0.6) errs.push('tee overlaps terrain');
    if (!(P.clearance(W, tx, ty + R + 2) < 3)) errs.push('tee not supported');
    const S = P.initState(W);
    const cup = P.cupState(W, S), cx = cup.x, cy = cup.y;
    if (W.liftcup < 0 && !W.blinkcup && !W.movcup) {
      if (P.insideSolid(hole, cx, cy - R - 1)) errs.push('cup inside solid');
      if (P.clearance(W, cx, cy - R) < R - 0.6) errs.push('cup overlaps terrain');
      if (!(P.clearance(W, cx, cy) < 2)) errs.push('cup not on surface');
    }
    hole.gm.forEach((o) => {
      if (CLEAR_EXEMPT[o.t]) return;
      for (const b of gimmickBoxes(o)) for (const [x, y] of [[tx, ty], [cx, cy - R]])
        if (x > b[0] - 20 && x < b[2] + 20 && y > b[1] - 20 && y < b[3] + 20) { errs.push(o.t + ' overlaps tee/cup'); return; }
    });
    for (let i = 2; i < hole.ground.length; i += 2) if (hole.ground[i] <= hole.ground[i - 2]) { errs.push('ground x not increasing'); break; }
    if (hole.gs.length !== hole.ground.length / 2 - 1) errs.push('gs length mismatch');
    if (hole.sig && !hole.gm.some((g) => g.t === hole.sig)) errs.push('signature gimmick missing');
    return errs;
  }

  // did a bot path (flat [x,y,...]) engage the hole's signature gimmick?
  function engaged(hole, path) {
    if (!hole.sig || PASSIVE[hole.sig] || hole.sig === 'tokens') return true;
    if (hole.sig === 'wind' && hole.gm.some((g) => g.t === 'wind' && g.w === undefined)) return true;
    const boxes = [];
    hole.gm.forEach((g) => { if (g.t === hole.sig) for (const b of gimmickBoxes(g)) boxes.push(b); });
    const m = 26;
    for (let i = 0; i < path.length; i += 2) {
      const x = path[i], y = path[i + 1];
      for (const b of boxes) if (x > b[0] - m && x < b[2] + m && y > b[1] - m && y < b[3] + m) return true;
    }
    return false;
  }

  function withoutSig(hole) {
    const h = JSON.parse(JSON.stringify(hole));
    h.gm = h.gm.filter((g) => g.t !== hole.sig);
    return h;
  }

  // ---------------- courses ----------------
  // 18 holes: front nine (1-9) easier, back nine (10-18) harder
  const HOLES = 18;
  const ROLES = ['intro', 'vary', 'vary', 'vary', 'vary', 'combo', 'combo', 'combo', 'boss',
                 'vary', 'combo', 'combo', 'combo', 'combo', 'combo', 'combo', 'combo', 'boss'];

  function courseDifficulty(def, k) {
    const base = 0.05 + 0.7 * (def.index / 59);
    const boost = [-0.05, 0, 0.03, 0.05, 0.07, 0.06, 0.09, 0.12, 0.15,
                   0.13, 0.15, 0.17, 0.19, 0.2, 0.22, 0.24, 0.26, 0.3][k];
    return Math.max(0, Math.min(1, base + boost));
  }

  function earlierGimmicks(def) {
    return M.COURSES.filter((c) => c.index < def.index && c.gimmick && D.mixPiece(c.gimmick)).map((c) => c.gimmick);
  }

  // Plan a course: HOLES x {wrapper, pieces:[{g, id}]}, lead-in wrappers drawn without replacement.
  function coursePlan(def, salt, nHoles) {
    const N = nHoles || HOLES;
    const rng = RNG.makeRng('plan3:' + def.id + ':' + (salt || 0));
    const wrappers = rng.shuffle(TPL.WRAPPERS.map((w) => w.id));
    const W = (k) => wrappers[k % wrappers.length];
    const plan = [];
    if (!def.gimmick || !D.get(def.gimmick)) {
      const bs = rng.shuffle(TPL.BASIC.filter((b) => !b.goal).map((b) => b.id)), gs = rng.shuffle(TPL.BASIC.filter((b) => b.goal).map((b) => b.id));
      for (let k = 0; k < N; k++) {
        const pieces = [];
        const back = k >= 9;
        if (k > 0) pieces.push({ g: null, id: bs[k % bs.length] });
        if (k >= 5) pieces.push({ g: null, id: bs[(k + 3) % bs.length] });
        if (back && k % 3 === 0) pieces.push({ g: null, id: bs[(k + 5) % bs.length] });
        if (k % 2 === 1 || k === 8 || back) pieces.push({ g: null, id: gs[k % gs.length] });
        plan.push({ wrapper: W(k), pieces });
      }
      return plan;
    }
    const sp = D.get(def.gimmick).pieces;
    const intro = sp.find((p) => p.intro) || sp[0];
    const rest = sp.filter((p) => !p.introOnly && p !== intro);
    const order = rest.length ? rng.shuffle(rest) : [intro];
    const goals = sp.filter((p) => p.goal && !p.introOnly);
    let mids = sp.filter((p) => !p.goal && !p.introOnly && p !== intro);
    if (!mids.length) mids = sp.filter((p) => !p.goal && !p.introOnly);
    const cyc = (i) => order[i % order.length];
    const midc = (i) => (mids.length ? mids[i % mids.length] : cyc(i));
    const goalc = (i) => (goals.length ? goals[i % goals.length] : null);
    const earlier = earlierGimmicks(def), recent = earlier.slice(-8);
    const pickEarlier = (n) => rng.shuffle(recent.concat(rng.shuffle(earlier).slice(0, 4))).filter((g, i, a) => a.indexOf(g) === i && g !== def.gimmick).slice(0, n);
    const S = (pd) => ({ g: def.gimmick, id: pd.id });
    const E = (g) => ({ g, id: D.mixPiece(g, rng).id });
    for (let k = 0; k < N; k++) {
      const pieces = [];
      if (k === 0) pieces.push(S(intro));
      else if (k <= 4) {
        const pd = cyc(k - 1);
        pieces.push(S(pd));
        if (k === 4 && !pd.goal && goals.length) pieces.push(S(goalc(k + 1)));
      } else if (k <= 7) {
        const e = pickEarlier(k === 7 ? 2 : 1);
        if (e[0]) pieces.push(E(e[0]));
        const pd = cyc(k);
        pieces.push(S(pd));
        if (e[1] && !pd.goal) pieces.push(E(e[1]));
      } else if (k === 8) {
        const e = pickEarlier(1), m = midc(k);
        pieces.push(S(m));
        if (e[0] && !m.goal) pieces.push(E(e[0]));
        if (!m.goal) { const fin = goalc(k) || cyc(k + 1); if (fin !== m) pieces.push(S(fin)); }
      } else {
        // back nine: longer, multi-piece, harder
        const j = k - 9;
        const e = pickEarlier(j >= 4 ? 2 : 1);
        if (j === 0) { pieces.push(S(midc(j))); const gl = goalc(j); if (gl) pieces.push(S(gl)); }
        else if (j <= 3) { pieces.push(S(midc(j + 1))); if (e[0]) pieces.push(E(e[0])); const gl = goalc(j + 1); if (gl) pieces.push(S(gl)); else pieces.push(S(cyc(j + 2))); }
        else if (j <= 6) { if (e[0]) pieces.push(E(e[0])); pieces.push(S(midc(j))); if (e[1]) pieces.push(E(e[1])); const gl = goalc(j); if (gl) pieces.push(S(gl)); }
        else if (j === 7) { pieces.push(S(midc(j))); pieces.push(S(midc(j + 1))); const gl = goalc(j); if (gl) pieces.push(S(gl)); }
        else { pieces.push(S(midc(j))); if (e[0]) pieces.push(E(e[0])); pieces.push(S(midc(j + 1))); const gl = goalc(j + 1); if (gl) pieces.push(S(gl)); }
      }
      plan.push({ wrapper: W(k), pieces });
    }
    return plan;
  }

  const ADJ = ['Lucky', 'Crooked', 'Whispering', 'Sly', 'Grand', 'Little', 'Wicked', 'Hidden', 'Rusty', 'Silver', 'Hollow', 'Restless', 'Gentle', 'Broken', 'Tall', 'Lonely', 'Merry', 'Sunken', 'Burning', 'Frozen'];
  const NOUN = ['Hop', 'Gulch', 'Ledge', 'Run', 'Drop', 'Bend', 'Leap', 'Climb', 'Pass', 'Trap', 'Gate', 'Hollow', 'Rise', 'Plunge', 'Steps', 'Crossing', 'Spur', 'Nook', 'Chute', 'Bluff'];
  function holeName(def, k, rng) {
    if (k === 8) return 'Turn: The ' + rng.pick(['Gauntlet', 'Crucible', 'Summit', 'Reckoning', 'Labyrinth', 'Colossus', 'Maelstrom', 'Grand Tour']);
    if (k === 17) return 'Finale: The ' + rng.pick(['Grand Gauntlet', 'Last Crucible', 'High Summit', 'Final Reckoning', 'Great Labyrinth', 'Colossus', 'Maelstrom', 'Long Way Home']);
    return 'The ' + rng.pick(ADJ) + ' ' + rng.pick(NOUN);
  }

  // last-resort simple hole: one signature mid piece (+ maybe a goal piece), rotating with the attempt number
  function rotatePieces(def, attempt) {
    const sp = D.get(def.gimmick).pieces.filter((p) => !p.introOnly);
    const mids = sp.filter((p) => !p.goal), goals = sp.filter((p) => p.goal);
    const out = [];
    if (mids.length) out.push({ g: def.gimmick, id: mids[attempt % mids.length].id });
    if (goals.length && attempt % 2) out.push({ g: def.gimmick, id: goals[(attempt >> 1) % goals.length].id });
    return out.length ? out : [{ g: def.gimmick, id: sp[0].id }];
  }

  function courseHoleParams(def, k, attempt, plan) {
    attempt = attempt || 0;
    plan = plan || coursePlan(def);
    const role = def.gimmick ? ROLES[k] : (k === 0 ? 'intro' : (k === 8 || k === 17) ? 'boss' : k >= 9 ? 'combo' : 'vary');
    const seed = RNG.hashStr(def.id + ':' + k + ':' + attempt);
    const rng = RNG.makeRng(seed ^ 0x51ed);
    let d = courseDifficulty(def, k);
    if (attempt >= 6) d = Math.max(0, d - 0.05 * (attempt - 5));
    let hp = plan[k];
    // automated fix-ups for stubborn holes: swap earlier-gimmick pieces, then strip to the signature pieces only
    if (attempt >= 6 && def.gimmick && hp.pieces.some((p) => p.g && p.g !== def.gimmick)) {
      const er = RNG.makeRng(seed ^ 0xbeef), earlier = earlierGimmicks(def);
      let pieces = hp.pieces.map((p) => {
        if (!p.g || p.g === def.gimmick) return p;
        if (attempt >= 10 || !earlier.length) return null;
        const g = er.pick(earlier), mp = D.mixPiece(g, er);
        return mp ? { g, id: mp.id } : null;
      }).filter(Boolean);
      if (attempt >= 13) pieces = rotatePieces(def, attempt);
      hp = { wrapper: hp.wrapper, pieces };
    } else if (attempt >= 13 && def.gimmick && D.get(def.gimmick)) {
      hp = { wrapper: hp.wrapper, pieces: rotatePieces(def, attempt) };
    }
    return {
      id: def.id + 'h' + (k + 1), name: holeName(def, k, rng), seed, difficulty: d, style: def.style,
      surfaces: { main: def.surface, alt: def.altSurface }, hazard: def.hazard,
      hazardDensity: Math.min(1, 0.3 + 0.5 * def.index / 59 + (role === 'combo' || role === 'boss' ? 0.15 : 0)), wind: 0,
      role, theme: def.theme || def.id, sig: def.gimmick || null, wrapper: hp.wrapper, pieces: hp.pieces,
    };
  }

  // ---------------- endless / daily / random ----------------
  const ENDLESS_PRESETS = {
    beginner: { preset: 'beginner', name: 'Beginner', difficulty: 2, ramp: 0.15, gimmicks: ['pad', 'conveyor', 'boost', 'bumper', 'oneway', 'fan', 'teleport', 'cushion'], surfaces: ['fairway', 'rough', 'sand'], styles: ['rolling', 'hills', 'terraces', 'mesa'], wind: 0, hazardDensity: 1, strokeRule: 'par+3', seed: 1001 },
    gauntlet: { preset: 'gauntlet', name: 'Gimmick Gauntlet', difficulty: 5, ramp: 0.3, gimmicks: ALL_GIMMICKS.slice(), surfaces: ['fairway', 'rough'], styles: Object.keys(TPL.STYLE), wind: 1, hazardDensity: 1, strokeRule: 'par+2', seed: 2002, gimmicksPerHole: 3 },
    hazard: { preset: 'hazard', name: 'Hazard Hell', difficulty: 6, ramp: 0.3, gimmicks: ['spikes', 'crumble', 'vanish', 'windmill', 'saw', 'laser', 'crusher', 'mine', 'pendulum', 'quicksand', 'blackhole'], surfaces: ['fairway', 'sand', 'ice'], styles: ['canyon', 'cliffs', 'islands', 'spires'], wind: 1, hazardDensity: 3, strokeRule: 'par+2', seed: 3003 },
    random: { preset: 'random', name: 'Random Mix', difficulty: 4, ramp: 0.3, gimmicks: ALL_GIMMICKS.slice(), surfaces: ['fairway', 'rough', 'sand', 'ice', 'bouncy'], styles: Object.keys(TPL.STYLE), wind: 2, hazardDensity: 2, strokeRule: 'par+2', seed: 4004 },
  };

  function piecesFor(types, rng) {
    const out = [];
    types.forEach((t, i) => {
      const des = D.get(t); if (!des || !des.pieces.length) return;
      const last = i === types.length - 1;
      const pool = des.pieces.filter((p) => !p.introOnly && (last || !p.goal));
      if (pool.length) out.push({ g: t, id: rng.pick(pool).id });
    });
    out.sort((a, b) => (pieceDef(a).goal ? 1 : 0) - (pieceDef(b).goal ? 1 : 0));
    return out;
  }

  function endlessHole(settings, index) {
    const s = Object.assign({}, ENDLESS_PRESETS.random, settings || {});
    const seed = RNG.hashStr('endless2:' + (s.seed >>> 0) + ':' + index);
    const rng = RNG.makeRng(seed);
    const Dv = Math.min(10, Math.max(1, s.difficulty + (s.ramp || 0) * index)), d = (Dv - 1) / 9;
    const pool = (s.gimmicks || []).filter((g) => D.get(g) && D.get(g).pieces.length);
    let pieces;
    if (pool.length) {
      const n = s.gimmicksPerHole ? Math.min(pool.length, s.gimmicksPerHole) : Math.min(pool.length, 1 + Math.floor(rng.next() * (1 + d * 2)));
      pieces = piecesFor(rng.shuffle(pool).slice(0, n), rng);
    } else {
      const b = rng.shuffle(TPL.BASIC);
      pieces = [{ g: null, id: b.find((x) => !x.goal).id }, { g: null, id: b.find((x) => x.goal).id }];
    }
    const surfs = (s.surfaces && s.surfaces.length) ? s.surfaces : ['fairway'];
    const main = rng.pick(surfs), alt = rng.pick(surfs.length > 1 ? surfs.filter((x) => x !== main) : ['rough']);
    const styles = (s.styles && s.styles.length) ? s.styles : ['rolling'];
    const hd = [0, 0.35, 0.7, 1][Math.max(0, Math.min(3, Math.round(s.hazardDensity)))];
    return generateHole({
      id: 'endless' + index, name: 'Endless #' + (index + 1), seed, difficulty: d, style: rng.pick(styles),
      surfaces: { main, alt }, hazard: rng.pick(['water', 'lava', 'oob']), hazardDensity: hd, wind: s.wind || 0, role: 'endless',
      theme: rng.pick(M.COURSES).id, sig: pieces.length && pieces[0].g ? pieces[0].g : null, pieces,
    });
  }

  function adHocCourse(seed, label, dmin, dmax) {
    const rng = RNG.makeRng(seed);
    const base = rng.pick(M.COURSES.filter((c) => c.gimmick && D.get(c.gimmick)));
    const def = Object.assign({}, base, { id: label, name: label, theme: base.id });
    const plan = coursePlan(def, seed, 9);
    const holeParams = [];
    for (let k = 0; k < 9; k++) {
      const hp = courseHoleParams(def, k, 0, plan);
      hp.seed = RNG.hashStr(label + ':' + seed + ':' + k);
      hp.difficulty = dmin + (dmax - dmin) * k / 8;
      hp.id = label + 'h' + (k + 1);
      holeParams.push(hp);
    }
    return { def, holeParams, plan };
  }
  function dailyCourse(dateStr) { return adHocCourse(RNG.hashStr('daily:' + dateStr), 'daily-' + dateStr, 0.2, 0.6); }
  function randomCourse(seed) { return adHocCourse((seed >>> 0) ^ 0x2545f491, 'random-' + RNG.seedToCode(seed), 0.15, 0.65); }
  // Daily/Random retry: re-seed, then drop mixed-in earlier gimmicks, then keep a single signature piece, then ease.
  function retryParams(hp, attempt) {
    const q = Object.assign({}, hp);
    q.seed = RNG.hashStr(hp.seed + ':retry:' + attempt);
    if (attempt >= 3 && hp.sig) q.pieces = hp.pieces.filter((p) => p.g === hp.sig);
    if (attempt >= 4) q.wrapper = undefined;
    if (attempt >= 6 && hp.sig && D.get(hp.sig)) q.pieces = rotatePieces({ gimmick: hp.sig }, attempt);
    if (attempt >= 5) q.difficulty = Math.max(0, hp.difficulty - 0.05 * (attempt - 4));
    return q;
  }

  return {
    generateHole, validateHole, finalizePar, engaged, withoutSig, courseHoleParams, coursePlan, courseDifficulty,
    endlessHole, dailyCourse, randomCourse, retryParams, ENDLESS_PRESETS, ROLES, HOLES, ALL_GIMMICKS, PASSIVE,
    gimmickBoxes, gimmickBox, pieceDef, launchLanding, tuneLaunch,
  };
});
