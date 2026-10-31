#!/usr/bin/env node
// Full verification: manifest rules, every baked hole (bot ≤ par+2, tee/cup validity), near-duplicates,
// signature-gimmick engagement/essentialness, and 500 Endless/Daily/Random generator cases. Results cached in .cache/.
// Usage: node tools/verify.js [--no-runtime] [--fresh]
'use strict';
const path = require('path');
const L = require('./lib.js');
const { runPool } = require('./pool.js');
const { M, G, RNG } = L;

const args = process.argv.slice(2);
const fresh = args.includes('--fresh');
let failures = 0;
const fail = (msg) => { failures++; console.log('  FAIL ' + msg); };
const pass = (msg) => console.log('  ok   ' + msg);

function holeSignature(h) {
  return h.tpl;
}
function profile(h) {
  const n = 48, out = [];
  for (let i = 0; i < n; i++) out.push(L.P.groundY(h, h.w * (i + 0.5) / n));
  const m = out.reduce((a, b) => a + b, 0) / n;
  return out.map((v) => v - m);
}
function similarity(a, b) {
  let num = 0, da = 0, db = 0;
  for (let i = 0; i < a.length; i++) { num += a[i] * b[i]; da += a[i] * a[i]; db += b[i] * b[i]; }
  return da && db ? num / Math.sqrt(da * db) : (da === db ? 1 : 0);
}

function runtimeCases() {
  const cases = [];
  const rng = RNG.makeRng('verify-runtime-v1');
  const all = G.ALL_GIMMICKS, styles = M.STYLES, surfs = M.SURFACES;
  const P = G.ENDLESS_PRESETS;
  // presets across many seeds/indices
  for (const k of Object.keys(P)) for (let i = 0; i < 25; i++)
    cases.push({ kind: 'endless', name: `preset:${k}#${i}`, settings: Object.assign({}, P[k], { seed: rng.int(1, 1e9) }), index: rng.int(0, 30) });
  // extreme: each gimmick alone at max difficulty
  for (const g of all) cases.push({ kind: 'endless', name: `solo:${g}@10`, settings: Object.assign({}, P.random, { gimmicks: [g], difficulty: 10, ramp: 0, hazardDensity: 3, wind: 3, seed: rng.int(1, 1e9) }), index: 5 });
  // extreme: each gimmick alone at min difficulty
  for (const g of all) cases.push({ kind: 'endless', name: `solo:${g}@1`, settings: Object.assign({}, P.random, { gimmicks: [g], difficulty: 1, ramp: 0, hazardDensity: 0, wind: 0, seed: rng.int(1, 1e9) }), index: 0 });
  // extreme: everything on, many per hole
  for (let i = 0; i < 20; i++) cases.push({ kind: 'endless', name: `all-on#${i}`, settings: Object.assign({}, P.random, { gimmicks: all.slice(), gimmicksPerHole: 6, difficulty: 10, ramp: 1, wind: 3, hazardDensity: 3, seed: rng.int(1, 1e9) }), index: rng.int(0, 40) });
  // extreme: nothing on
  for (let i = 0; i < 10; i++) cases.push({ kind: 'endless', name: `none#${i}`, settings: Object.assign({}, P.random, { gimmicks: [], surfaces: [], styles: [], wind: 0, hazardDensity: 0, seed: rng.int(1, 1e9) }), index: i });
  // extreme: single surface
  for (const s of surfs) for (let i = 0; i < 4; i++) cases.push({ kind: 'endless', name: `surf:${s}#${i}`, settings: Object.assign({}, P.random, { surfaces: [s], difficulty: rng.int(5, 10), seed: rng.int(1, 1e9) }), index: rng.int(0, 20) });
  // each style
  for (const st of styles) for (let i = 0; i < 4; i++) cases.push({ kind: 'endless', name: `style:${st}#${i}`, settings: Object.assign({}, P.random, { styles: [st], seed: rng.int(1, 1e9) }), index: rng.int(0, 20) });
  // random combos
  while (cases.length < 380) {
    const gs = rng.shuffle(all).slice(0, rng.int(0, all.length));
    cases.push({ kind: 'endless', name: `combo#${cases.length}`, settings: {
      preset: 'custom', difficulty: rng.int(1, 10), ramp: rng.pick([0, 0.15, 0.3, 0.6]), gimmicks: gs,
      surfaces: rng.shuffle(surfs).slice(0, rng.int(1, 6)), styles: rng.shuffle(styles).slice(0, rng.int(1, 10)),
      wind: rng.int(0, 3), hazardDensity: rng.int(0, 3), strokeRule: 'par+2', seed: rng.int(1, 1e9) }, index: rng.int(0, 40) });
  }
  // daily
  const d0 = Date.UTC(2026, 0, 1);
  for (let i = 0; i < 60; i++) {
    const dt = new Date(d0 + rng.int(0, 2000) * 86400000).toISOString().slice(0, 10);
    cases.push({ kind: 'daily', name: `daily:${dt}#${i % 9}`, date: dt, index: i % 9 });
  }
  // random course
  for (let i = 0; i < 60; i++) cases.push({ kind: 'random', name: `random#${i}`, seed: rng.int(1, 1e9), index: i % 9 });
  return cases;
}

(async () => {
  const t0 = Date.now();
  // ---- 1. manifest ----
  console.log('\n[1] Manifest rules');
  const merr = M.validate();
  if (merr.length) merr.forEach(fail); else pass('validate(): 60 courses, unique (primary,surface) pairs, primary use <= 3');
  {
    const seen = new Set(), pairs = new Set(), cnt = {};
    M.COURSES.forEach((c, i) => {
      if (i === 0) { if (c.gimmick) fail('c01 must be plain golf'); return; }
      if (!c.gimmick) fail(c.id + ' introduces no gimmick');
      if (seen.has(c.gimmick)) fail(c.id + ' re-introduces ' + c.gimmick);
      seen.add(c.gimmick); cnt[c.gimmick] = (cnt[c.gimmick] || 0) + 1;
      const k = c.gimmick + '|' + c.surface; if (pairs.has(k)) fail('duplicate gimmick+surface ' + k); pairs.add(k);
    });
    const missing = L.P.GIMMICK_TYPES.filter((g) => !seen.has(g));
    if (missing.length) fail('gimmicks never introduced: ' + missing.join(','));
    const D = require('../src/designs/index.js');
    const noDesign = L.P.GIMMICK_TYPES.filter((g) => !D.get(g) || D.get(g).pieces.length < 4);
    if (noDesign.length) fail('gimmicks without >=4 design pieces: ' + noDesign.join(','));
    if (!missing.length && !noDesign.length) pass(`c01 plain golf + ${seen.size} courses each introducing one new gimmick (${L.P.GIMMICK_TYPES.length} total), every gimmick has >=4 set-pieces, max signature use ${Math.max(...Object.values(cnt))}`);
  }

  // ---- 2. baked holes ----
  console.log('\n[2] Baked holes (structure + bot <= par+2)');
  const courses = M.COURSES.map((c) => ({ def: c, holes: L.loadCourse(c.id) }));
  const missing = courses.filter((c) => !c.holes || c.holes.length !== L.G.HOLES || c.holes.some((h) => !h));
  if (missing.length) fail('missing/incomplete baked courses: ' + missing.map((c) => c.def.id).join(','));
  const ph = L.physHash();
  const cacheFile = path.join(L.CACHE, 'verify.json');
  const cache = fresh ? {} : L.readJSON(cacheFile, {});
  const tasks = [], idx = [];
  const results = {};
  for (const c of courses) for (const h of c.holes || []) {
    if (!h) continue;
    const key = ph + ':' + L.holeHash(h);
    if (cache[key]) results[h.id] = cache[key];
    else { tasks.push({ type: 'verify', hole: h, opts: { essential: true } }); idx.push(key); }
  }
  console.log(`  ${tasks.length} holes to verify (${Object.keys(results).length} cached)`);
  const vres = await runPool(tasks);
  vres.forEach((r, i) => { if (r.error) { results[tasks[i].hole.id] = { ok: false, errs: [r.error] }; return; } results[r.id] = r; cache[idx[i]] = r; });
  L.writeJSON(cacheFile, cache);
  // table
  let okHoles = 0, total = 0;
  const pad = (s, n) => (s + ' '.repeat(n)).slice(0, n);
  console.log('\n  ' + pad('course', 9) + pad('name', 28) + Array.from({ length: L.G.HOLES }, (_, i) => pad(' h' + (i + 1), 7)).join('') + ' result');
  for (const c of courses) {
    if (!c.holes) continue;
    let row = '  ' + pad(c.def.id, 9) + pad(c.def.name, 28), allOk = true;
    for (const h of c.holes) {
      total++;
      const r = h && results[h.id];
      const ok = r && r.ok && !(r.errs && r.errs.length);
      if (ok) okHoles++; else allOk = false;
      row += pad(ok ? ` ${r.strokes}/${h.par}✓` : ' FAIL', 7);
      if (!ok) fail(`${h ? h.id : c.def.id}: ${r ? (r.errs || []).join(';') || (r.replay && !r.engaged ? 'bot solution never engages ' + h.sig : 'bot could not finish in par+2') : 'no result'}`);
    }
    console.log(row + (allOk ? ' PASS' : ' FAIL'));
  }
  console.log(`\n  ${okHoles}/${total} holes pass (strokes shown as bot/par)`);
  if (total !== L.M.COURSES.length * L.G.HOLES) fail(`expected ${L.M.COURSES.length * L.G.HOLES} holes, found ${total}`);

  // ---- 3. near-duplicates ----
  console.log('\n[3] Near-duplicate holes within each course');
  let dupes = 0;
  for (const c of courses) {
    if (!c.holes) continue;
    const hs = c.holes.filter(Boolean);
    const wr = new Set(hs.map((h) => h.wrapper));
    if (wr.size !== hs.length) { fail(`${c.def.id}: lead-in layout reused within course`); dupes++; }
    for (let i = 0; i < hs.length; i++) for (let j = i + 1; j < hs.length; j++) {
      const sameSig = holeSignature(hs[i]) === holeSignature(hs[j]);
      const sim = similarity(profile(hs[i]), profile(hs[j]));
      if (sameSig || (sim > 0.97 && hs[i].gm.map((g) => g.t).sort().join() === hs[j].gm.map((g) => g.t).sort().join())) { dupes++; fail(`${hs[i].id} ~ ${hs[j].id} near-duplicate (sim ${sim.toFixed(3)})`); }
    }
  }
  if (!dupes) pass('no near-duplicates; lead-in layouts drawn without replacement and every (layout + set-piece) combination unique in all 60 courses');

  // ---- 4. signature gimmicks ----
  console.log('\n[4] Signature gimmick: in every hole, engaged by every bot solution, essential where it is an enabler');
  {
    const Dz = require('../src/designs/index.js');
    let engagedN = 0, totalN = 0, essY = 0, essN = 0, weak = [];
    for (const c of courses) {
      if (!c.holes || !c.def.gimmick) continue;
      const des = Dz.get(c.def.gimmick);
      let cy = 0, cn = 0;
      c.holes.forEach((h, k) => {
        const r = h && results[h.id]; if (!r) return;
        totalN++; if (r.engaged) engagedN++; else fail(`${h.id}: signature ${c.def.gimmick} not engaged`);
        if (des && des.essential && k > 0 && r.essential !== null && r.essential !== undefined) { cn++; essN++; if (r.essential) { cy++; essY++; } }
      });
      if (des && des.essential && cn && cy < Math.ceil(cn / 2)) weak.push(`${c.def.id}(${c.def.gimmick} ${cy}/${cn})`);
    }
    console.log(`  engaged: ${engagedN}/${totalN} holes;  essential (enabler gimmicks, holes 2-18): ${essY}/${essN}`);
    if (weak.length) fail('courses where the enabler gimmick is essential on fewer than half of holes 2-18: ' + weak.join(', '));
    else pass('every enabler course needs its gimmick on at least half of holes 2-18');
  }

  // ---- 5. runtime generators ----
  if (!args.includes('--no-runtime')) {
    console.log('\n[5] Endless / Daily / Random generators — 500 seeds & settings combos');
    const cases = runtimeCases();
    const sh = L.srcHash();
    const rcacheFile = path.join(L.CACHE, 'runtime.json');
    const rcache = fresh ? {} : L.readJSON(rcacheFile, {});
    const todo = [], tkeys = [], rres = new Array(cases.length);
    cases.forEach((c, i) => { const k = sh + ':' + JSON.stringify(c); if (rcache[k]) rres[i] = rcache[k]; else { todo.push({ type: 'runtime', c }); tkeys.push([k, i]); } });
    console.log(`  ${cases.length} cases, ${todo.length} to run`);
    const out = await runPool(todo);
    out.forEach((r, j) => { rres[tkeys[j][1]] = r; if (!r.error) rcache[tkeys[j][0]] = r; });
    L.writeJSON(rcacheFile, rcache);
    const by = {};
    for (const r of rres) {
      const kind = r.name ? r.name.split(/[:#]/)[0] : 'error';
      const b = by[kind] || (by[kind] = { n: 0, ok: 0, first: 0, att: 0 });
      b.n++; if (r.ok) b.ok++; if (r.firstOk) b.first++; b.att += r.attempts || 0;
      if (!r.ok) fail(`runtime ${r.name}: ${r.error || r.info}`);
    }
    console.log('  ' + pad('group', 10) + pad('cases', 7) + pad('pass', 7) + pad('1st-try', 9) + 'avg attempts');
    for (const [k, b] of Object.entries(by)) console.log('  ' + pad(k, 10) + pad(String(b.n), 7) + pad(String(b.ok), 7) + pad((100 * b.first / b.n).toFixed(0) + '%', 9) + (b.att / b.n).toFixed(2));
    const tot = rres.length, okc = rres.filter((r) => r.ok).length;
    console.log(`  ${okc}/${tot} runtime cases produce a bot-verified hole (client re-seeds on failure, as here)`);
  }

  console.log(`\nverify: ${failures ? failures + ' FAILURE(S)' : 'ALL CHECKS PASSED'} in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  process.exit(failures ? 1 : 0);
})();
