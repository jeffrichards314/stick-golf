#!/usr/bin/env node
// Share-code tests: base64url, built-in LZ + inflate (vs zlib), sanitiser coverage of every baked/tutorial hole,
// canonical round trips (encode -> decode -> identical, still verified), and malformed / hostile input.
'use strict';
const fs = require('fs'), path = require('path'), zlib = require('zlib');
const HS = require('../game/holeschema.js');
const HC = require('../game/holecode.js');
const Bot = require('../src/bot.js');
const M = require('../src/manifest.js');

let fails = 0;
const ok = (c, msg) => { if (!c) { fails++; console.log('  FAIL ' + msg); } };
const section = (s) => console.log(s);

(async () => {
  section('base64url / LZ / inflate');
  const rnd = (n, seed) => { const u = new Uint8Array(n); let s = seed; for (let i = 0; i < n; i++) { s = (s * 1664525 + 1013904223) >>> 0; u[i] = (s >>> 24) % (seed % 2 ? 256 : 20); } return u; };
  for (const n of [0, 1, 2, 3, 4, 5, 100, 1000, 70000]) {
    const u = rnd(n, n + 3);
    ok(Buffer.from(HC._b64.dec(HC._b64.enc(u))).equals(Buffer.from(u)), 'b64 roundtrip n=' + n);
    ok(Buffer.from(HC._b64.enc(u), 'utf8').toString() === Buffer.from(u).toString('base64url'), 'b64 matches node base64url n=' + n);
    ok(Buffer.from(HC._lz.decompress(HC._lz.compress(u), 1e7)).equals(Buffer.from(u)), 'lz roundtrip n=' + n);
    ok(Buffer.from(HC._inflate(zlib.deflateRawSync(u), 1e7)).equals(Buffer.from(u)), 'inflate(zlib deflateRaw) n=' + n);
    ok(Buffer.from(HC._inflate(zlib.deflateRawSync(u, { level: 0 }), 1e7)).equals(Buffer.from(u)), 'inflate stored n=' + n);
    ok(Buffer.from(HC._inflate(zlib.deflateRawSync(u, { strategy: zlib.constants.Z_FIXED }), 1e7)).equals(Buffer.from(u)), 'inflate fixed n=' + n);
  }
  { // text-like data
    const t = Buffer.from(JSON.stringify(require('../data/tutorials.js')));
    ok(Buffer.from(HC._inflate(zlib.deflateRawSync(t), 1e8)).equals(t), 'inflate big json');
    const lz = HC._lz.compress(t);
    ok(Buffer.from(HC._lz.decompress(lz, 1e8)).equals(t), 'lz big json');
    console.log('  lz ratio on tutorials json: ' + (lz.length / t.length).toFixed(3) + ', deflate: ' + (zlib.deflateRawSync(t).length / t.length).toFixed(3));
  }

  section('sanitiser keeps every baked + tutorial hole intact');
  const holes = [];
  for (const f of fs.readdirSync(path.join(__dirname, '../data/courses'))) for (const h of require('../data/courses/' + f)) holes.push(h);
  const T = require('../data/tutorials.js'); for (const k of Object.keys(T)) holes.push(T[k]);
  ok(holes.length === 1080 + 60, 'hole count ' + holes.length);
  const themes = M.byId;
  let nChanged = 0, nGm = 0;
  for (const h of holes) {
    const r = HS.sanitizeHole(h, { themes });
    const c = r.hole;
    ok(c.gm.length === h.gm.length, h.id + ': gimmick count ' + c.gm.length + ' vs ' + h.gm.length);
    ok(c.ground.length === h.ground.length && c.gs === h.gs, h.id + ': ground');
    ok(c.solids.length === h.solids.length, h.id + ': solids');
    ok(JSON.stringify(c.tee) === JSON.stringify(h.tee) && JSON.stringify(c.cup) === JSON.stringify(h.cup), h.id + ': tee/cup');
    ok(c.w === h.w, h.id + ': w ' + c.w + ' vs ' + h.w);
    h.gm.forEach((g, i) => {
      nGm++;
      for (const k of Object.keys(g)) {
        const a = g[k], b = c.gm[i][k];
        if (JSON.stringify(a) !== JSON.stringify(b)) {
          const same = typeof a === 'number' && typeof b === 'number' && Math.abs(a - b) < 0.0006;
          if (!same) { ok(false, h.id + ' gm' + i + ' ' + g.t + '.' + k + ': ' + JSON.stringify(a) + ' -> ' + JSON.stringify(b)); }
        }
      }
      for (const k of Object.keys(c.gm[i])) ok(k in g || (HS.SPEC[g.t].zone), h.id + ' gm' + i + ' gained key ' + k);
    });
    if (JSON.stringify(HS.geoKey(c)) !== JSON.stringify(HS.geoKey(h))) nChanged++;
  }
  console.log('  ' + holes.length + ' holes, ' + nGm + ' gimmicks, geometry altered by rounding in ' + nChanged);

  section('all 60 tutorials: canon -> encode -> decode round trip, still verified');
  const tutorialsToTest = Object.keys(T);
  for (const k of tutorialsToTest) {
    const h0 = T[k];
    const h = HC.canon(h0);
    ok(!!h.bot, k + ': bot dropped by canon (geometry changed by rounding)');
    for (const mode of ['sync', 'native', 'lzOnly']) {
      let code;
      if (mode === 'sync') code = HC.encodeSync(h); else code = await HC.encode(h, { noNative: mode === 'lzOnly' });
      ok(/^[dz][A-Za-z0-9_-]+$/.test(code), k + ' code charset');
      const forced = mode === 'native' ? [false, true] : [false];
      for (const noNative of forced) {
        const d = await HC.decode(code, { noNative });
        ok(JSON.stringify(d.hole) === JSON.stringify(h), k + ' [' + mode + (noNative ? '/inflate' : '') + ']: decode differs from original');
        if (h.bot) ok(d.verified, k + ' [' + mode + ']: lost verification');
      }
    }
  }
  { const h = HC.canon(T.wind), c1 = await HC.encode(h), c2 = HC.encodeSync(h), c3 = await HC.encode(h, { bot: false });
    console.log('  wind tutorial code lengths: native ' + c1.length + ', lz ' + c2.length + ', without solution ' + c3.length + ', url ' + HC.url(c1).length);
    const biggest = holes.reduce((a, b) => (JSON.stringify(b).length > JSON.stringify(a).length ? b : a));
    const cb = await HC.encode(HC.canon(biggest)); console.log('  biggest baked hole (' + biggest.id + ') code: ' + cb.length + ' chars'); }

  section('sample of baked holes: canon -> encode -> decode, bot solution replays');
  let nb = 0, nOk = 0, nKeep = 0;
  for (let i = 0; i < holes.length; i += 23) {
    const h0 = holes[i]; nb++;
    const h = HC.canon(h0);
    if (h.bot) nKeep++;
    const code = await HC.encode(h);
    const d = await HC.decode(code);
    ok(JSON.stringify(d.hole) === JSON.stringify(h), h0.id + ': roundtrip differs');
    if (d.verified) nOk++; else if (h.bot) ok(false, h0.id + ': verified lost');
  }
  console.log('  ' + nb + ' sampled, ' + nKeep + ' kept their solution, ' + nOk + ' re-verified after decode');

  section('canon is idempotent, blank hole is valid');
  { const b = HS.blankHole(); const c1 = HC.canon(b), c2 = HC.canon(c1); ok(JSON.stringify(c1) === JSON.stringify(c2), 'canon idempotent');
    const G = require('../src/generator.js'); ok(G.validateHole(c1).length === 0, 'blank hole validates: ' + G.validateHole(c1).join(', '));
    const s = Bot.solve(c1, { maxStrokes: c1.par + 2 }); ok(s.ok, 'bot solves blank hole'); console.log('  blank hole solved in ' + s.strokes + ' strokes'); }

  section('every gimmick make() is physically loadable + survives sanitise');
  { const P = require('../src/physics.js'); const G = require('../src/generator.js');
    ok(HS.TYPES.length === 59 && HS.TYPES.every((t) => P.GIMMICK_TYPES.indexOf(t) >= 0) && P.GIMMICK_TYPES.every((t) => HS.TYPES.indexOf(t) >= 0), 'schema covers exactly the 59 physics gimmicks');
    for (const t of HS.TYPES) {
      const g = HS.makeGimmick(t, 1500, 900), s = HS.sanitizeGm(g);
      ok(s && JSON.stringify(s) === JSON.stringify(g), t + ': make() changes under sanitise: ' + JSON.stringify(g) + ' vs ' + JSON.stringify(s));
      const h = HC.canon(Object.assign(HS.blankHole(), {})); h.gm = [g];
      try { const W = P.createWorld(h); const S = P.initState(W); for (let i = 0; i < 240; i++) P.step(W, S); G.gimmickBoxes(g); } catch (e) { ok(false, t + ': physics threw ' + e.message); }
      HS.SPEC[t].parts.forEach((p) => { if (p.from) { const o = p.from(g); ok(o.every(Number.isFinite), t + ' part origin'); } });
    } }

  section('hostile / malformed input');
  const bad = [
    '', 'x', 'dzzzzzzzz', 'd', 'z' + 'A'.repeat(20), 'd' + 'A'.repeat(30), 'dAAAAAAAAAAAA', 'z////', 'hello world, not a code', 'z' + '_'.repeat(70000),
    'd' + Buffer.from(zlib.deflateRawSync(Buffer.from('{"v":1}'))).toString('base64url'),
    'd' + Buffer.from(zlib.deflateRawSync(Buffer.from('not json'))).toString('base64url'),
    'd' + Buffer.from(zlib.deflateRawSync(Buffer.from('{"v":99,"g":[]}'))).toString('base64url'),
    'd' + Buffer.from(zlib.deflateRawSync(Buffer.from(JSON.stringify({ v: 1, g: [0, 0, 5, 5], gs: 'f', m: [{ t: 'nuke' }, null, 5], o: [{ p: 'x' }], t: 'a', c: [1], n: { a: 1 } })))).toString('base64url'),
  ];
  for (const b of bad) {
    let threw = false, res = null;
    try { res = await HC.decode(b); } catch (e) { threw = true; ok(typeof e.message === 'string' && e.message.length < 80, 'error message ok'); }
    if (!threw) { ok(res && res.hole && Array.isArray(res.hole.ground), 'decode of odd-but-parseable input gives a clean hole'); try { require('../src/physics.js').createWorld(res.hole); } catch (e) { ok(false, 'odd input produced unloadable hole'); } }
  }
  { // zip bomb: tiny code, huge output
    const bomb = zlib.deflateRawSync(Buffer.alloc(8 * 1024 * 1024, 32), { level: 9 });
    let threw = false; try { await HC.decode('d' + bomb.toString('base64url')); } catch (e) { threw = /large/.test(e.message); }
    ok(threw, 'zip bomb rejected (native)');
    threw = false; try { await HC.decode('d' + bomb.toString('base64url'), { noNative: true }); } catch (e) { threw = /large/.test(e.message); }
    ok(threw, 'zip bomb rejected (inflate)');
    const lzb = Buffer.concat([Buffer.from([0xff, 0xff, 0xff, 0x7f]), Buffer.alloc(10)]);
    threw = false; try { await HC.decode('z' + lzb.toString('base64url')); } catch (e) { threw = /large|Corrupt/.test(e.message); }
    ok(threw, 'lz length bomb rejected');
  }
  // fuzz: flip bytes in a valid code; must either decode to a loadable hole or throw cleanly (never hang / crash)
  { const base = await HC.encode(HC.canon(T.pipe)); const raw = Buffer.from(base.slice(1), 'base64url'); let n = 0, good = 0;
    for (let i = 0; i < 400; i++) { const c = Buffer.from(raw); const k = (i * 7919) % c.length; c[k] ^= 1 << (i % 8); if (i % 3 === 0) c[(k * 3 + 1) % c.length] ^= 0xff;
      for (const f of ['d', 'z']) { n++; try { const d = await HC.decode(f + c.toString('base64url'), { noNative: i % 2 === 0 }); require('../src/physics.js').createWorld(d.hole); good++; } catch (e) { ok(/^[\w .,'-]+$/.test(e.message) && e.message.length < 80, 'fuzz error is friendly: ' + e.message); } } }
    console.log('  fuzz: ' + n + ' corrupted codes, ' + good + ' still decoded to a loadable hole'); }
  ok(HC.parseInput('https://jeffrichards314.github.io/stick-golf/#hole=dABC123_-x') === 'dABC123_-x', 'parse url');
  ok(HC.parseInput('  dABC123_-x \n') === 'dABC123_-x', 'parse bare');
  ok(HC.parseInput('hole=zABCDEFGHI') === 'zABCDEFGHI', 'parse hole=');
  ok(HC.parseInput('<script>') === null && HC.parseInput('') === null, 'parse junk');

  console.log(fails ? '\n' + fails + ' FAILED' : '\nall holecode tests passed');
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
