// Shared build/verify logic (Node only). Used by build.js, verify.js and worker.js.
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const RNG = require('../src/rng.js');
const P = require('../src/physics.js');
const G = require('../src/generator.js');
const M = require('../src/manifest.js');
const Bot = require('../src/bot.js');

const ROOT = path.join(__dirname, '..');
const CACHE = path.join(ROOT, '.cache');
const MAX_ATTEMPTS = 18;

function srcHash() {
  const h = crypto.createHash('sha1');
  const files = ['src/rng.js', 'src/physics.js', 'src/templates.js', 'src/generator.js', 'src/bot.js', 'src/manifest.js', 'tools/lib.js'];
  for (const f of fs.readdirSync(path.join(ROOT, 'src/designs')).sort()) files.push('src/designs/' + f);
  for (const f of files) h.update(fs.readFileSync(path.join(ROOT, f)));
  return h.digest('hex').slice(0, 16);
}
function physHash() {
  const h = crypto.createHash('sha1');
  for (const f of ['src/physics.js', 'src/bot.js']) h.update(fs.readFileSync(path.join(ROOT, f)));
  return h.digest('hex').slice(0, 16);
}
function holeHash(hole) {
  return crypto.createHash('sha1').update(JSON.stringify(hole)).digest('hex').slice(0, 20);
}

function stripPrivate(h) {
  const o = Object.assign({}, h);
  delete o._green;
  return o;
}

// Generate + verify one hole of a course (re-seeding failures). Returns {hole|null, log}
function profileOf(h) {
  const n = 48, out = [];
  for (let i = 0; i < n; i++) out.push(P.groundY(h, h.w * (i + 0.5) / n));
  const m = out.reduce((a, b) => a + b, 0) / n;
  return out.map((v) => v - m);
}
function similar(a, b) {
  let num = 0, da = 0, db = 0;
  for (let i = 0; i < a.length; i++) { num += a[i] * b[i]; da += a[i] * a[i]; db += b[i] * b[i]; }
  return da && db ? num / Math.sqrt(da * db) : (da === db ? 1 : 0);
}
// same gimmick mix + near-identical terrain profile as an earlier hole of the course?
function isNearDup(h, prior) {
  const sig = h.gm.map((g) => g.t).sort().join(), p = profileOf(h);
  return prior.some((o) => o && o.gm.map((g) => g.t).sort().join() === sig && similar(p, profileOf(o)) > 0.965);
}

function buildHole(def, k, plan, prior) {
  const tries = [];
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const hp = G.courseHoleParams(def, k, attempt, plan);
    const hole = G.generateHole(hp);
    const errs = G.validateHole(hole);
    if (errs.length) { tries.push(errs[0]); continue; }
    if (prior && isNearDup(hole, prior)) { tries.push('near-dup'); continue; }
    const res = Bot.solve(hole, attempt >= 4 ? { maxStrokes: hole.par + 2, beam: 8, dense: true } : { maxStrokes: hole.par + 2 });
    if (!res.ok) { tries.push('bot'); continue; }
    const rp = Bot.replay(hole, res.shots, null, true);
    if (!rp.ok) { tries.push('replay'); continue; }
    if (!G.engaged(hole, rp.path)) { tries.push('unengaged'); continue; }
    const out = stripPrivate(hole);
    out.estPar = out.par;
    G.finalizePar(out, res.strokes);
    out.attempt = attempt;
    out.bot = { s: res.strokes, shots: res.shots.map((s) => [s.a, s.p]) };
    return { hole: out, tries };
  }
  return { hole: null, tries };
}

// Generate + verify one course. Returns {id, holes, log}
function buildCourse(def) {
  const plan = G.coursePlan(def);
  const holes = [], log = [];
  for (let k = 0; k < G.HOLES; k++) {
    const r = buildHole(def, k, plan, holes);
    if (!r.hole) log.push(`${def.id} hole ${k + 1}: FAILED after ${MAX_ATTEMPTS} attempts [${plan[k].pieces.map((p) => (p.g || 'basic') + ':' + p.id).join(' + ')}] (${r.tries.slice(-5).join(', ')})`);
    else if (r.hole.attempt) log.push(`${def.id} hole ${k + 1}: passed on attempt ${r.hole.attempt + 1} (${r.tries.join(', ')})`);
    holes.push(r.hole);
  }
  return { id: def.id, holes, log };
}

// Is the signature gimmick essential? (bot cannot finish within par+2 without it)
function essentialCheck(hole) {
  if (!hole.sig || G.PASSIVE[hole.sig]) return null;
  const des = require('../src/designs/index.js').get(hole.sig);
  if (!des || !des.essential) return null;
  const h = G.withoutSig(hole);
  if (h.sig === 'tokens') return true;
  const errs = G.validateHole(Object.assign({}, h, { sig: null }));
  if (errs.length) return true;
  const res = Bot.solve(h, { maxStrokes: hole.par + 2 });
  return !res.ok;
}

// Replays the stored bot solution (full-precision doubles) — deterministic physics must reproduce it exactly.
function verifyHole(hole, opts) {
  const errs = G.validateHole(hole);
  const r = { id: hole.id, par: hole.par, errs, ok: false, strokes: 0, replay: false };
  if (hole.bot) {
    const rp = Bot.replay(hole, hole.bot.shots.map(([a, p]) => ({ a, p })), null, true);
    r.replay = rp.ok && rp.strokes <= hole.par + 2;
    r.engaged = rp.path ? G.engaged(hole, rp.path) : false;
    if (r.replay) { r.ok = !errs.length && r.engaged; r.strokes = rp.strokes; }
  }
  if (!r.ok && !errs.length && !r.replay) {
    const res = Bot.solve(hole, { maxStrokes: hole.par + 2, beam: 8, dense: true });
    if (res.ok) { const rp = Bot.replay(hole, res.shots, null, true); r.engaged = G.engaged(hole, rp.path); r.ok = r.engaged; r.strokes = res.strokes; }
  }
  if (opts && opts.essential) r.essential = essentialCheck(hole);
  return r;
}

// Endless / daily / random robustness case: mirrors the client's generate→bot→reseed loop.
function runtimeCase(c) {
  let firstOk = false, attempts = 0, final = null, info = '';
  for (let attempt = 0; attempt < 12; attempt++) {
    attempts++;
    let hole;
    if (c.kind === 'endless') hole = G.endlessHole(Object.assign({}, c.settings, { seed: (c.settings.seed + attempt * 7919) >>> 0 }), c.index);
    else {
      const course = c.kind === 'daily' ? G.dailyCourse(c.date) : G.randomCourse(c.seed);
      const hp = attempt ? G.retryParams(course.holeParams[c.index], attempt) : course.holeParams[c.index];
      hole = G.generateHole(hp);
    }
    const errs = G.validateHole(hole);
    if (errs.length) { info = errs[0]; continue; }
    const res = Bot.solve(hole, { maxStrokes: hole.par + 2 });
    if (res.ok) { if (attempt === 0) firstOk = true; final = { strokes: res.strokes, par: hole.par, tpl: hole.tpl, gm: hole.gk.length, sig: hole.sig }; break; }
    info = 'bot';
  }
  return { name: c.name, firstOk, ok: !!final, attempts, final, info };
}

function writeCourseFile(id, holes) {
  const dir = path.join(ROOT, 'data', 'courses');
  fs.mkdirSync(dir, { recursive: true });
  const json = JSON.stringify(holes);
  const js = `/* baked by tools/build.js — ${id} */\n(function(){var d=${json};\nif(typeof module!=='undefined'&&module.exports)module.exports=d;else GOLF.registerCourse(${JSON.stringify(id)},d);})();\n`;
  fs.writeFileSync(path.join(dir, id + '.js'), js);
}
function writeIndex(map) {
  const js = `/* baked course index — tools/build.js */\n(function(root){var d=${JSON.stringify(map)};\nif(typeof module!=='undefined'&&module.exports)module.exports=d;else{root.GOLF=root.GOLF||{};root.GOLF.BAKED=d;}})(typeof self!=='undefined'?self:this);\n`;
  fs.writeFileSync(path.join(ROOT, 'data', 'index.js'), js);
}
function loadCourse(id) {
  const f = path.join(ROOT, 'data', 'courses', id + '.js');
  if (!fs.existsSync(f)) return null;
  delete require.cache[require.resolve(f)];
  return require(f);
}

function readJSON(f, dflt) { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return dflt; } }
function writeJSON(f, v) { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, JSON.stringify(v)); }

module.exports = { RNG, P, G, M, Bot, ROOT, CACHE, srcHash, physHash, holeHash, buildCourse, buildHole, essentialCheck, verifyHole, runtimeCase, writeCourseFile, writeIndex, loadCourse, readJSON, writeJSON };
