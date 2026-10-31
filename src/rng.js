/* Seeded RNG + hashing. Shared by game (browser global GOLF.RNG) and Node (require). */
(function (root, factory) {
  const mod = factory();
  if (typeof module === 'object' && module.exports) module.exports = mod;
  else { root.GOLF = root.GOLF || {}; root.GOLF.RNG = mod; }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // FNV-1a 32-bit string hash
  function hashStr(str) {
    let h = 0x811c9dc5;
    str = String(str);
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    return h >>> 0;
  }

  // mulberry32
  function makeRng(seed) {
    let a = (typeof seed === 'string' ? hashStr(seed) : seed >>> 0) || 0x9e3779b9;
    const next = function () {
      a = (a + 0x6d2b79f5) | 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    const r = {
      next,
      float: (lo, hi) => lo + (hi - lo) * next(),
      int: (lo, hi) => lo + Math.floor(next() * (hi - lo + 1)), // inclusive
      chance: (p) => next() < p,
      pick: (arr) => arr[Math.floor(next() * arr.length)],
      sign: () => (next() < 0.5 ? -1 : 1),
      shuffle: (arr) => {
        const a2 = arr.slice();
        for (let i = a2.length - 1; i > 0; i--) {
          const j = Math.floor(next() * (i + 1));
          const t = a2[i]; a2[i] = a2[j]; a2[j] = t;
        }
        return a2;
      },
      fork: (salt) => makeRng((hashStr(String(salt)) ^ Math.floor(next() * 4294967296)) >>> 0),
    };
    return r;
  }

  // Shareable seed codes: 6-char base32-ish from a 30-bit int, and back.
  const ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  function seedToCode(n) {
    n = n >>> 0;
    let s = '';
    for (let i = 0; i < 6; i++) { s += ALPHA[n & 31]; n >>>= 5; }
    return s;
  }
  function codeToSeed(code) {
    code = String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (!code) return 0;
    let ok = code.length === 6;
    for (const ch of code) if (ALPHA.indexOf(ch) < 0) ok = false;
    if (!ok) return hashStr(code) & 0x3fffffff;
    let n = 0;
    for (let i = 5; i >= 0; i--) n = (n << 5) | ALPHA.indexOf(code[i]);
    return n >>> 0;
  }

  return { hashStr, makeRng, seedToCode, codeToSeed };
});
