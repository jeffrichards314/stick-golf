/* localStorage wrapper. All keys prefixed 'sgolf.'; every access guarded. */
(function () {
  'use strict';
  const G = window.GOLF = window.GOLF || {};
  const P = 'sgolf.';
  const mem = {}; // fallback when storage is blocked
  function get(key, def) {
    let raw = null;
    try { raw = window.localStorage.getItem(P + key); } catch (e) { raw = mem[key] !== undefined ? mem[key] : null; }
    if (raw === null || raw === undefined) return def;
    try { return JSON.parse(raw); } catch (e) { return def; }
  }
  function set(key, val) {
    let raw;
    try { raw = JSON.stringify(val); } catch (e) { return false; }
    mem[key] = raw;
    try { window.localStorage.setItem(P + key, raw); return true; } catch (e) { return false; }
  }
  function del(key) {
    delete mem[key];
    try { window.localStorage.removeItem(P + key); } catch (e) { /* ignore */ }
  }
  function clearAll() {
    try {
      const ks = [];
      for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k && k.indexOf(P) === 0) ks.push(k); }
      ks.forEach((k) => localStorage.removeItem(k));
    } catch (e) { /* ignore */ }
    for (const k in mem) delete mem[k];
  }

  const DEFAULT_SETTINGS = {
    difficulty: null, // null => ask on first launch
    mute: false, sfxVol: 0.8,
    cosmetics: { ball: null, trail: null, cupEffect: null, flag: 'classic', palette: null },
    shake: true,
  };
  let settings = null;
  function getSettings() {
    if (!settings) {
      const s = get('settings', {}) || {};
      settings = Object.assign({}, DEFAULT_SETTINGS, s);
      settings.cosmetics = Object.assign({}, DEFAULT_SETTINGS.cosmetics, s.cosmetics || {});
      delete settings.music; delete settings.musicVol; // music was removed
    }
    return settings;
  }
  function saveSettings(patch) {
    const s = getSettings();
    if (patch) Object.assign(s, patch);
    set('settings', s);
    return s;
  }

  // ---------- lifetime stats (cosmetic unlocks + Stats panel) ----------
  // counters: swishes, aces (holes-in-one), birdies (birdie or better), eagles, holes (holes completed),
  // pickups, shots, rounds (full 18-hole course rounds), nines, daily (daily rounds), randoms, endlessRuns, endless (best run holes)
  const STAT_DEFAULTS = { swishes: 0, aces: 0, birdies: 0, eagles: 0, pars: 0, holes: 0, pickups: 0, shots: 0, rounds: 0, nines: 0, daily: 0, randoms: 0, endlessRuns: 0, endless: 0, endlessScore: 0 };
  let stats = null;
  function getStats() {
    if (!stats) { stats = Object.assign({}, STAT_DEFAULTS, get('stats', {}) || {}); }
    return stats;
  }
  function bumpStat(k, n) { const s = getStats(); s[k] = (+s[k] || 0) + (n === undefined ? 1 : n); set('stats', s); return s[k]; }
  function maxStat(k, v) { const s = getStats(); if (!(v <= (+s[k] || 0))) { s[k] = v; set('stats', s); return true; } return false; }
  function resetStats() { stats = Object.assign({}, STAT_DEFAULTS); set('stats', stats); }

  G.Store = { get, set, del, clearAll, getSettings, saveSettings, getStats, bumpStat, maxStat, resetStats };
})();
