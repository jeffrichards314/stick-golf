/* Difficulty modes. */
(function () {
  'use strict';
  const G = window.GOLF = window.GOLF || {};
  const INF = Infinity;
  const DIFFS = {
    chill: { id: 'chill', name: 'Chill', icon: '🌴', desc: 'Unlimited strokes, full trajectory preview, no hazard penalty, unlimited mulligans.',
      limit: null, preview: 'full', hazardPenalty: 0, mulligans: INF, windMul: 1, gspeed: 1 },
    standard: { id: 'standard', name: 'Standard', icon: '⛳', desc: 'Stroke limit par+4, short aim preview, +1 hazard penalty, 3 mulligans per course.',
      limit: 4, preview: 'short', hazardPenalty: 1, mulligans: 3, windMul: 1, gspeed: 1 },
    pro: { id: 'pro', name: 'Pro', icon: '🏆', desc: 'Stroke limit par+3, no preview, stronger wind, 1 mulligan per course.',
      limit: 3, preview: 'none', hazardPenalty: 1, mulligans: 1, windMul: 1.5, gspeed: 1 },
    insane: { id: 'insane', name: 'Insane', icon: '💀', desc: 'Stroke limit par+1, no preview, strong wind, faster gimmicks, no mulligans.',
      limit: 1, preview: 'none', hazardPenalty: 1, mulligans: 0, windMul: 1.5, gspeed: 1.35 },
  };
  const ORDER = ['chill', 'standard', 'pro', 'insane'];
  function get(id) { return DIFFS[id] || DIFFS.standard; }
  function physOpts(id) {
    const d = get(id);
    return { gspeed: d.gspeed, windMul: d.windMul, hazardPenalty: d.hazardPenalty, rec: true };
  }
  // Max strokes allowed on a hole (Infinity = unlimited)
  function strokeLimit(id, par) { const d = get(id); return d.limit === null ? INF : par + d.limit; }
  function current() { return G.Store.getSettings().difficulty || 'standard'; }

  // Score names relative to par. `strokes` is the hole SCORE (raw strokes - swish bonus).
  function scoreLabel(strokes, par) {
    if (strokes <= 0) return { text: 'Swish Ace!', cls: 'ace' };
    if (strokes === 1) return { text: 'Hole-in-one!', cls: 'ace' };
    const d = strokes - par;
    if (d <= -4) return { text: 'Condor!', cls: 'eagle' };
    if (d === -3) return { text: 'Albatross!', cls: 'eagle' };
    if (d === -2) return { text: 'Eagle!', cls: 'eagle' };
    if (d === -1) return { text: 'Birdie!', cls: 'birdie' };
    if (d === 0) return { text: 'Par', cls: 'par' };
    if (d === 1) return { text: 'Bogey', cls: 'bogey' };
    if (d === 2) return { text: 'Double Bogey', cls: 'dbogey' };
    if (d === 3) return { text: 'Triple Bogey', cls: 'dbogey' };
    return { text: '+' + d, cls: 'dbogey' };
  }
  function stars(strokes, par) { if (strokes <= par) return 3; if (strokes === par + 1) return 2; return 1; }

  G.Modes = { DIFFS, ORDER, get, physOpts, strokeLimit, current, scoreLabel, stars };
})();
