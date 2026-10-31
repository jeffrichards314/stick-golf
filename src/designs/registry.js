/*
 * Gimmick design registry. Each gimmick registers hole "pieces" (set-pieces built around it):
 *   GOLF.Designs.register('cannon', {
 *     essential: true,   // pieces generally can't be finished without the gimmick (verified by the bot)
 *     passive: false,    // true for cup/visibility modifiers that always affect play (fog, movcup, ...)
 *     pieces: [ { id, goal?: true (builds green + cup), build(B, c) { ... B.add({t:'cannon', ...}) } }, ... ]
 *   });
 * B = terrain builder (src/templates.js), c = { rng, d (difficulty 0..1), intro, sig, hzChar, ... }.
 */
(function (root, factory) {
  const mod = factory();
  if (typeof module === 'object' && module.exports) module.exports = mod;
  else { root.GOLF = root.GOLF || {}; root.GOLF.Designs = mod; }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const defs = {};
  return {
    register(type, def) { def.type = type; def.pieces = def.pieces || []; defs[type] = def; return def; },
    get(type) { return defs[type] || null; },
    all() { return defs; },
    // choose a "mixer" piece (non-goal) used when this gimmick appears as an earlier gimmick in a later course
    mixPiece(type, rng) {
      const d = defs[type]; if (!d) return null;
      const list = d.pieces.filter((p) => !p.goal && !p.introOnly);
      return list.length ? (rng ? rng.pick(list) : list[0]) : null;
    },
  };
});
