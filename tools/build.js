#!/usr/bin/env node
// Generate all 60 courses, verify every hole with the bot (re-seeding failures), bake to data/.
// Usage: node tools/build.js [--force] [courseId ...]
'use strict';
const path = require('path');
const L = require('./lib.js');
const { runPool } = require('./pool.js');

(async () => {
  const args = process.argv.slice(2);
  const force = args.includes('--force');
  const only = args.filter((a) => !a.startsWith('--'));
  const key = L.srcHash();
  const cacheFile = path.join(L.CACHE, 'build.json');
  const cache = L.readJSON(cacheFile, {});
  const ids = L.M.COURSES.map((c) => c.id).filter((id) => !only.length || only.includes(id));
  const todo = ids.filter((id) => force || !cache[id] || cache[id].key !== key + JSON.stringify(L.M.byId[id]).length || !L.loadCourse(id));
  console.log(`build: ${ids.length} courses, ${todo.length} to (re)generate, ${ids.length - todo.length} cached`);
  const t0 = Date.now();
  const res = await runPool(todo.map((id) => ({ type: 'course', id })), (r, n, tot) => {
    if (r.error) console.log('ERROR', r.id, r.error);
    else process.stdout.write(`\r  ${n}/${tot} ${r.id}   `);
  });
  console.log(`\n  generated in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  let failed = 0;
  for (const r of res) {
    if (!r || r.error) { failed++; continue; }
    for (const line of r.log) console.log('  ' + line);
    if (r.holes.some((h) => !h)) { failed++; continue; }
    L.writeCourseFile(r.id, r.holes);
    cache[r.id] = { key: key + JSON.stringify(L.M.byId[r.id]).length, at: Date.now() };
  }
  L.writeJSON(cacheFile, cache);
  // drop stale course files from older manifests
  const fs = require('fs'), dir = path.join(L.ROOT, 'data', 'courses');
  if (fs.existsSync(dir)) for (const f of fs.readdirSync(dir)) if (!L.M.byId[f.replace(/\.js$/, '')]) fs.unlinkSync(path.join(dir, f));
  // index of baked courses
  const index = {};
  for (const c of L.M.COURSES) {
    const holes = L.loadCourse(c.id);
    if (holes && holes.length === L.G.HOLES && holes.every(Boolean)) index[c.id] = { pars: holes.map((h) => h.par), names: holes.map((h) => h.name), gimmick: c.gimmick };
  }
  L.writeIndex(index);
  console.log(`build: ${Object.keys(index).length}/60 courses baked${failed ? `, ${failed} FAILED` : ''}`);
  process.exit(failed ? 1 : 0);
})();
