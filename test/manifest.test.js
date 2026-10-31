'use strict';
const assert = require('node:assert');
const M = require('../src/manifest.js');

const errs = M.validate();
assert.deepStrictEqual(errs, [], 'validate() errors:\n' + errs.join('\n'));

assert.strictEqual(M.COURSES.length, 60);
assert.strictEqual(M.GIMMICKS.length, 59);
assert.strictEqual(M.COURSES[0].gimmick, null);

// one new gimmick per course from c02; all 59 covered exactly once
const seen = new Set();
for (let i = 1; i < 60; i++) {
  const c = M.COURSES[i];
  assert.ok(M.GIMMICKS.includes(c.gimmick), c.id + ' unknown gimmick ' + c.gimmick);
  assert.ok(!seen.has(c.gimmick), c.id + ' re-introduces ' + c.gimmick);
  seen.add(c.gimmick);
  assert.strictEqual(M.introducedBy[c.gimmick], c.id);
  assert.strictEqual(c.unlock.prev, M.COURSES[i - 1].id);
}
assert.strictEqual(seen.size, 59);
for (const g of M.GIMMICKS) assert.ok(seen.has(g), g + ' never introduced');

// (gimmick, surface) unique; signature count <= 3
const pairs = new Set();
const sig = {};
for (const c of M.COURSES) {
  const key = c.gimmick + '|' + c.surface;
  assert.ok(!pairs.has(key), 'duplicate (gimmick,surface): ' + key);
  pairs.add(key);
  if (c.gimmick) sig[c.gimmick] = (sig[c.gimmick] || 0) + 1;
}
for (const g of M.GIMMICKS) assert.ok((sig[g] || 0) <= 3, g + ' signature ' + sig[g] + ' times');

// packs partition gimmicks
const packed = M.PACKS.flatMap((p) => p.gimmicks);
assert.strictEqual(M.PACKS.length, 7);
assert.strictEqual(packed.length, 59);
assert.deepStrictEqual([...packed].sort(), [...M.GIMMICKS].sort());

// misc
assert.strictEqual(new Set(M.COURSES.map((c) => c.id)).size, 60);
assert.strictEqual(new Set(M.COURSES.map((c) => c.name)).size, 60);
for (const c of M.COURSES) assert.strictEqual(M.byId[c.id], c);
for (const g of M.GIMMICKS) assert.ok(M.GIMMICK_INFO[g] && M.GIMMICK_INFO[g].tip, g + ' info');
assert.deepStrictEqual(M.TIERS, ['Courses']);
assert.strictEqual(M.THEME_PACKS.length, 7);

const pad = (s, n) => String(s).padEnd(n).slice(0, n);
console.log(pad('id', 4) + ' ' + pad('name', 24) + ' ' + pad('gimmick', 10) + ' ' + pad('style', 9) + ' surface');
for (const c of M.COURSES) {
  console.log(pad(c.id, 4) + ' ' + pad(c.name, 24) + ' ' + pad(c.gimmick || '-', 10) + ' ' + pad(c.style, 9) + ' ' + c.surface + '/' + c.altSurface);
}
console.log('manifest.test.js: OK');
