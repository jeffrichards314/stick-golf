/*
 * GOLF.Render — canvas renderer for the 2D side-view golf game.
 * Vanilla JS, no deps, file:// safe. Attaches window.GOLF.Render.
 *
 *   const R = GOLF.Render.create(canvas);
 *   R.resize(cssW, cssH); R.setHole(hole, theme, cosmetics); R.draw(frame);
 *   R.spawn(kind, x, y, opts); R.trailPush(x, y); R.trailClear();
 *   R.worldToScreen(x, y, cam); R.screenToWorld(sx, sy, cam);
 *   GOLF.Render.COSMETICS; GOLF.Render.drawPreview(ctx, hole, theme, w, h);
 *   GOLF.Render.COSMETIC_CATS; GOLF.Render.drawCosmetic(ctx, cat, id, w, h, t);
 *   cosmetics = { ball, trail, cupEffect, palette, flag, holeNum? }
 *   frame extras: ghost {points, t}, prevAim {angle, power}, a11y {colorblind, reducedFx}
 */
(function (root) {
  'use strict';
  const GOLF = root.GOLF = root.GOLF || {};
  const TAU = Math.PI * 2;
  const BALL_R = 6;
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const frac = (x) => x - Math.floor(x);
  function hash1(n) { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); }
  const rnd = (a, b) => a + (b - a) * Math.random();

  // ---------------------------------------------------------------- colour utils
  const _rgbC = Object.create(null);
  function rgb(c) {
    if (Array.isArray(c)) return c;
    let v = _rgbC[c]; if (v) return v;
    let s = String(c || '#888888').trim();
    if (s[0] === '#') s = s.slice(1);
    if (s.length === 3) s = s[0] + s[0] + s[1] + s[1] + s[2] + s[2];
    const n = parseInt(s.slice(0, 6), 16);
    v = isNaN(n) ? [136, 136, 136] : [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    _rgbC[c] = v; return v;
  }
  function hex(a) {
    let s = '#';
    for (let i = 0; i < 3; i++) { const v = clamp(Math.round(a[i]), 0, 255); s += (v < 16 ? '0' : '') + v.toString(16); }
    return s;
  }
  function mix(a, b, t) { a = rgb(a); b = rgb(b); return hex([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]); }
  function shade(c, t) { return t >= 0 ? mix(c, '#ffffff', t) : mix(c, '#000000', -t); }
  function rgba(c, a) { const v = rgb(c); return 'rgba(' + v[0] + ',' + v[1] + ',' + v[2] + ',' + a + ')'; }
  function lum(c) { const v = rgb(c); return (0.299 * v[0] + 0.587 * v[1] + 0.114 * v[2]) / 255; }
  function gray(c) { const l = lum(c) * 255; return hex([l, l, l]); }
  function hsl(h, s, l) { return 'hsl(' + h + ',' + s + '%,' + l + '%)'; }

  function makeRng(seed) {
    if (GOLF.RNG && GOLF.RNG.makeRng) return GOLF.RNG.makeRng((seed >>> 0) || 1);
    let a = (seed >>> 0) || 0x9e3779b9;
    const next = () => { a = (a + 0x6d2b79f5) | 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    return { next, float: (lo, hi) => lo + (hi - lo) * next(), int: (lo, hi) => lo + Math.floor(next() * (hi - lo + 1)), chance: (p) => next() < p, pick: (arr) => arr[Math.floor(next() * arr.length)] };
  }

  // ---------------------------------------------------------------- cosmetics
  // Every item: { id, name, rarity: common|rare|epic|legendary, unlock: {type, n|id} } + draw params.
  // unlock types: free | stars | cleared | course | swishes | aces | birdies | holes | rounds | daily | endless | gimmicks
  //   v3: achievement (id) | achievements (n earned) | fastrounds (n) | tutorials (n) | remix (n rounds)
  const FREE = { type: 'free' };
  const U = (type, n) => (type === 'course' || type === 'achievement' ? { type, id: n } : { type, n });
  const ACH = (id) => ({ type: 'achievement', id });
  const COSMETICS = {
    balls: [
      { id: 'classic', name: 'Classic', color: '#ffffff', stroke: '#2b2b33', shape: 'circle', rarity: 'common', unlock: FREE },
      { id: 'sunny', name: 'Sunny', color: '#ffd23c', stroke: '#8a5a00', shape: 'circle', rarity: 'common', unlock: FREE },
      { id: 'cherry', name: 'Cherry', color: '#ff4d5e', stroke: '#6e0f1a', shape: 'circle', rarity: 'common', unlock: FREE },
      { id: 'mint', name: 'Mint', color: '#6ff0c0', stroke: '#0f5e45', shape: 'circle', rarity: 'common', unlock: U('holes', 9) },
      { id: 'sky', name: 'Sky Blue', color: '#58b8ff', stroke: '#123c6e', shape: 'circle', rarity: 'common', unlock: U('holes', 27) },
      { id: 'twotone', name: 'Two-Tone', color: '#ffffff', c2: '#ff4d5e', stroke: '#3a1a22', shape: 'twotone', rarity: 'common', unlock: U('cleared', 1) },
      { id: 'grape', name: 'Grape', color: '#a070ff', stroke: '#3b1a6e', shape: 'circle', rarity: 'common', unlock: U('stars', 40) },
      { id: 'stripe', name: 'Stripe Nine', color: '#ffffff', c2: '#ffbf1a', stroke: '#3a2a10', shape: 'stripe', rarity: 'common', unlock: U('birdies', 5) },
      { id: 'polka', name: 'Polka Dot', color: '#ff6fae', c2: '#ffffff', stroke: '#7a1e48', shape: 'dots', rarity: 'common', unlock: U('rounds', 1) },
      { id: 'smiley', name: 'Smiley', color: '#ffd93b', stroke: '#7a5400', shape: 'smiley', rarity: 'common', unlock: U('holes', 54) },
      { id: 'beach', name: 'Beach Ball', color: '#ffffff', stroke: '#333333', shape: 'beach', rarity: 'common', unlock: U('swishes', 1) },
      { id: 'target', name: 'Bullseye', color: '#ffffff', c2: '#ff3a3a', stroke: '#5a0a0a', shape: 'ring', rarity: 'common', unlock: U('cleared', 2) },
      { id: 'checker', name: 'Checkerboard', color: '#ffffff', c2: '#22242c', stroke: '#111111', shape: 'checker', rarity: 'common', unlock: U('course', 'c04') },
      { id: 'tennis', name: 'Tennis', color: '#d8f03a', c2: '#ffffff', stroke: '#5a6a10', shape: 'tennis', rarity: 'common', unlock: U('daily', 1) },
      { id: 'cube', name: 'Cube', color: '#5ab0ff', stroke: '#123c6e', shape: 'square', rarity: 'rare', unlock: U('stars', 100) },
      { id: 'eight', name: 'Eight Ball', color: '#1d1d24', stroke: '#000000', shape: 'eight', rarity: 'rare', unlock: U('rounds', 3) },
      { id: 'donut', name: 'Donut', color: '#ff8fc8', stroke: '#7a3a1a', shape: 'donut', rarity: 'rare', unlock: U('gimmicks', 8) },
      { id: 'melon', name: 'Watermelon', color: '#3aa83a', c2: '#1a5a1e', stroke: '#0e3a10', shape: 'melon', rarity: 'rare', unlock: U('cleared', 5) },
      { id: 'swirl', name: 'Peppermint', color: '#ffffff', c2: '#ff2a3e', stroke: '#6a0a14', shape: 'swirl', rarity: 'rare', unlock: U('birdies', 25) },
      { id: 'bball', name: 'Hoops', color: '#ff8a2a', stroke: '#4a2000', shape: 'bball', rarity: 'rare', unlock: U('swishes', 8) },
      { id: 'eye', name: 'Eyeball', color: '#ffffff', stroke: '#4a1e1e', shape: 'eye', iris: '#3aa0ff', rarity: 'rare', unlock: U('aces', 1) },
      { id: 'star', name: 'Superstar', color: '#ffe066', stroke: '#a06a00', shape: 'star', rarity: 'rare', unlock: U('cleared', 8) },
      { id: 'moon', name: 'Moon', color: '#d8dbe2', stroke: '#4a4f5e', shape: 'moon', rarity: 'rare', unlock: U('course', 'c10') },
      { id: 'pixel', name: '8-Bit', color: '#5adf6a', c2: '#c8ffb0', stroke: '#0f3a14', shape: 'pixel', rarity: 'rare', unlock: U('stars', 250) },
      { id: 'earth', name: 'Earth', color: '#2a7ae0', c2: '#4ac24a', stroke: '#0a2a5a', shape: 'earth', rarity: 'rare', unlock: U('holes', 180) },
      { id: 'glow', name: 'Glow Orb', color: '#7affd8', c2: '#0a9a78', stroke: '#06503e', shape: 'glow', rarity: 'rare', unlock: U('endless', 5) },
      { id: 'planet', name: 'Planet', color: '#b57aff', stroke: '#3b1a6e', shape: 'planet', rarity: 'epic', unlock: U('cleared', 12) },
      { id: 'gem', name: 'Gem', color: '#4ff0ff', stroke: '#0a5a7a', shape: 'gem', rarity: 'epic', unlock: U('birdies', 60) },
      { id: 'sun', name: 'Sun', color: '#ffd23c', c2: '#ff8a2a', stroke: '#a04a00', shape: 'sun', rarity: 'epic', unlock: U('course', 'c20') },
      { id: 'neon', name: 'Neon Ring', color: '#ff3cf0', c2: '#3cf6ff', stroke: '#ff3cf0', shape: 'neon', rarity: 'epic', unlock: U('daily', 7) },
      { id: 'chrome', name: 'Chrome', color: '#c8d0da', stroke: '#3b434e', shape: 'metal', rarity: 'epic', unlock: U('stars', 700) },
      { id: 'disco', name: 'Disco', color: '#b8c0cc', stroke: '#3b434e', shape: 'disco', rarity: 'epic', unlock: U('swishes', 25) },
      { id: 'ghost', name: 'Ghost', color: '#eaf6ff', stroke: '#9ab8d8', shape: 'ghost', rarity: 'epic', unlock: U('gimmicks', 25) },
      { id: 'lava', name: 'Lava', color: '#ff6a14', c2: '#ffd34a', stroke: '#2a0500', shape: 'lava', rarity: 'epic', unlock: U('course', 'c30') },
      { id: 'gold', name: 'Solid Gold', color: '#ffcf3a', stroke: '#7a4a00', shape: 'metal', rarity: 'legendary', unlock: U('aces', 10) },
      { id: 'galaxy', name: 'Galaxy', color: '#2a0a5a', stroke: '#a080ff', shape: 'galaxy', rarity: 'legendary', unlock: U('endless', 25) },
      { id: 'rainbow', name: 'Prism', color: '#ffffff', stroke: '#222222', shape: 'rainbow', rarity: 'legendary', unlock: U('cleared', 50) },
      // ---- v3 progression
      { id: 'notebook', name: 'Notebook', color: '#fbf8ec', c2: '#7ab0ff', stroke: '#3a4a6a', shape: 'ruled', rarity: 'common', unlock: U('tutorials', 10) },
      { id: 'mirror', name: 'Mirror', color: '#dfe8f2', c2: '#6a7a8e', stroke: '#2a3340', shape: 'mirror', rarity: 'rare', unlock: U('remix', 1) },
      { id: 'medal', name: 'Medalist', color: '#ffffff', c2: '#ffcf3a', stroke: '#2a3a7a', shape: 'medal', rarity: 'rare', unlock: U('achievements', 10) },
      { id: 'scholar', name: 'Scholar', color: '#ffffff', c2: '#1d1d2c', stroke: '#2b2b33', shape: 'scholar', rarity: 'rare', unlock: ACH('tutorials_all') },
      { id: 'swish', name: 'Swish', color: '#ff8a2a', c2: '#ffffff', stroke: '#4a2000', shape: 'swish', rarity: 'epic', unlock: ACH('swish_ace') },
      { id: 'spiral', name: 'Spin Doctor', color: '#ffffff', c2: '#ff3c7a', stroke: '#4a0a24', shape: 'spiral', rarity: 'epic', unlock: ACH('spin_doctor') },
      { id: 'speedster', name: 'Speedster', color: '#ff3a3a', c2: '#ffe23a', stroke: '#5a0a0a', shape: 'speedster', rarity: 'epic', unlock: U('fastrounds', 3) },
      { id: 'negative', name: 'Negative', color: '#0a0a12', c2: '#3cf6ff', stroke: '#9af8ff', shape: 'invert', rarity: 'epic', unlock: U('remix', 5) },
      { id: 'champion', name: 'Champion', color: '#ffcf3a', c2: '#3aa84a', stroke: '#7a4a00', shape: 'champion', rarity: 'legendary', unlock: ACH('courses60') },
    ],
    trails: [
      { id: 'none', name: 'None', style: 'none', rarity: 'common', unlock: FREE },
      { id: 'classic', name: 'Streak', style: 'line', color: '#ffffff', rarity: 'common', unlock: FREE },
      { id: 'dotted', name: 'Dotted', style: 'dotted', color: '#ffffff', rarity: 'common', unlock: FREE },
      { id: 'dashes', name: 'Dashes', style: 'dashes', color: '#ffe066', rarity: 'common', unlock: U('holes', 18) },
      { id: 'bubbles', name: 'Bubbles', style: 'bubbles', color: '#bfe8ff', rarity: 'common', unlock: U('stars', 25) },
      { id: 'smoke', name: 'Smoke', style: 'smoke', color: '#d8dce2', rarity: 'common', unlock: U('cleared', 2) },
      { id: 'sparkle', name: 'Sparkle', style: 'sparkle', color: '#fff4a8', rarity: 'common', unlock: U('swishes', 3) },
      { id: 'comet', name: 'Comet', style: 'comet', color: '#6ab8ff', rarity: 'common', unlock: U('birdies', 10) },
      { id: 'hearts', name: 'Hearts', style: 'hearts', color: '#ff4d8d', rarity: 'rare', unlock: U('rounds', 2) },
      { id: 'pixel', name: 'Pixels', style: 'pixel', color: '#5adf6a', rarity: 'rare', unlock: U('stars', 150) },
      { id: 'leaves', name: 'Leaf Fall', style: 'leaves', color: '#8fbf3a', rarity: 'rare', unlock: U('course', 'c08') },
      { id: 'stars', name: 'Star Dust', style: 'stars', color: '#ffd23c', rarity: 'rare', unlock: U('cleared', 6) },
      { id: 'ice', name: 'Frost', style: 'ice', color: '#bfe9ff', rarity: 'rare', unlock: U('gimmicks', 15) },
      { id: 'double', name: 'Twin Neon', style: 'double', color: '#ff3cf0', c2: '#3cf6ff', rarity: 'rare', unlock: U('daily', 3) },
      { id: 'confetti', name: 'Confetti', style: 'confetti', color: '#ffd23c', rarity: 'rare', unlock: U('birdies', 40) },
      { id: 'rainbow', name: 'Rainbow', style: 'rainbow', rarity: 'epic', unlock: U('cleared', 10) },
      { id: 'neon', name: 'Neon', style: 'neon', color: '#3cf6ff', rarity: 'epic', unlock: U('rounds', 6) },
      { id: 'fire', name: 'Fire', style: 'fire', color: '#ff8a2a', rarity: 'epic', unlock: U('aces', 2) },
      { id: 'zap', name: 'Lightning', style: 'zap', color: '#bfe0ff', rarity: 'epic', unlock: U('endless', 10) },
      { id: 'ribbon', name: 'Prism Ribbon', style: 'ribbon', rarity: 'legendary', unlock: U('stars', 1500) },
      { id: 'ghost', name: 'Afterimage', style: 'ghost', color: '#ffffff', rarity: 'legendary', unlock: U('cleared', 40) },
      // ---- v3 progression
      { id: 'chalk', name: 'Chalk Line', style: 'chalk', color: '#f4f6ff', rarity: 'common', unlock: U('tutorials', 5) },
      { id: 'reflect', name: 'Reflection', style: 'reflect', color: '#bfe0ff', rarity: 'rare', unlock: U('remix', 2) },
      { id: 'laurel', name: 'Laurel', style: 'laurel', color: '#6abf4a', rarity: 'rare', unlock: U('achievements', 20) },
      { id: 'flash', name: 'Flashpoint', style: 'flash', color: '#ffe23a', rarity: 'epic', unlock: ACH('lightning_hole') },
      { id: 'speed', name: 'Speed Demon', style: 'speedlines', color: '#ff4a3a', rarity: 'epic', unlock: ACH('speed_18') },
      { id: 'afterburner', name: 'Afterburner', style: 'afterburner', color: '#5ab8ff', rarity: 'epic', unlock: U('fastrounds', 5) },
      { id: 'inferno', name: 'Inferno', style: 'inferno', color: '#ff5a1a', rarity: 'legendary', unlock: ACH('insane_round') },
    ],
    cupEffects: [
      { id: 'classic', name: 'Classic', rarity: 'common', unlock: FREE },
      { id: 'confetti', name: 'Confetti Cannon', rarity: 'common', unlock: FREE },
      { id: 'shockwave', name: 'Shockwave', rarity: 'common', unlock: U('holes', 36) },
      { id: 'hearts', name: 'Hearts', rarity: 'common', unlock: U('birdies', 15) },
      { id: 'bubbles', name: 'Bubble Pop', rarity: 'common', unlock: U('stars', 75) },
      { id: 'petals', name: 'Petal Shower', rarity: 'rare', unlock: U('cleared', 4) },
      { id: 'coins', name: 'Coin Fountain', rarity: 'rare', unlock: U('swishes', 5) },
      { id: 'stars', name: 'Starburst', rarity: 'rare', unlock: U('rounds', 4) },
      { id: 'balloons', name: 'Balloons', rarity: 'rare', unlock: U('daily', 5) },
      { id: 'pixels', name: 'Pixel Blast', rarity: 'rare', unlock: U('course', 'c15') },
      { id: 'fireworks', name: 'Fireworks', rarity: 'epic', unlock: U('cleared', 15) },
      { id: 'lightning', name: 'Thunderstrike', rarity: 'epic', unlock: U('gimmicks', 30) },
      { id: 'rainbow', name: 'Rainbow Arc', rarity: 'epic', unlock: U('aces', 3) },
      { id: 'blackhole', name: 'Black Hole', rarity: 'legendary', unlock: U('endless', 15) },
      { id: 'supernova', name: 'Supernova', rarity: 'legendary', unlock: U('aces', 7) },
      // ---- v3 progression
      { id: 'blur', name: 'Blur', rarity: 'rare', unlock: U('fastrounds', 1) },
      { id: 'diploma', name: 'Graduation', rarity: 'rare', unlock: U('tutorials', 20) },
      { id: 'kaleido', name: 'Kaleidoscope', rarity: 'epic', unlock: U('remix', 3) },
      { id: 'phoenix', name: 'Phoenix', rarity: 'epic', unlock: ACH('comeback') },
      { id: 'trophy', name: "Champion's Cup", rarity: 'legendary', unlock: U('achievements', 30) },
      { id: 'infinity', name: 'Infinity', rarity: 'legendary', unlock: ACH('endless50') },
    ],
    flags: [
      { id: 'classic', name: 'Classic', shape: 'classic', fill: 'accent', rarity: 'common', unlock: FREE },
      { id: 'pennant', name: 'Pennant', shape: 'tri', L: 46, H: 20, fill: 'bands', cols: ['#ffd23c', '#2a6aff', '#ffd23c'], rarity: 'common', unlock: FREE },
      { id: 'striped', name: 'Candy Stripe', shape: 'rect', fill: 'bands', cols: ['#ff4757', '#ffffff', '#ff4757', '#ffffff', '#ff4757'], rarity: 'common', unlock: FREE },
      { id: 'checker', name: 'Chequered', shape: 'rect', fill: 'checker', cols: ['#ffffff', '#1d1d24'], rarity: 'common', unlock: U('holes', 18) },
      { id: 'swallow', name: 'Swallowtail', shape: 'swallow', L: 42, fill: 'bands', cols: ['#14a0a0', '#ffffff', '#14a0a0'], rarity: 'common', unlock: U('stars', 60) },
      { id: 'heart', name: 'Sweetheart', shape: 'rect', fill: 'solid', cols: ['#ffc0da'], emblem: 'heart', ec: '#ff2a6a', rarity: 'common', unlock: U('birdies', 20) },
      { id: 'star', name: 'Star Flag', shape: 'rect', fill: 'solid', cols: ['#2a5ad8'], emblem: 'star', ec: '#ffd23c', rarity: 'rare', unlock: U('cleared', 3) },
      { id: 'banner', name: 'Hole Number', shape: 'rect', L: 34, H: 30, fill: 'border', cols: ['#ffffff', '#ff4757'], emblem: 'num', ec: '#1d1d24', rarity: 'rare', unlock: U('rounds', 2) },
      { id: 'rainbow', name: 'Rainbow', shape: 'rect', fill: 'bands', cols: ['#ff3a3a', '#ff9a2a', '#ffe23a', '#3ad85a', '#3a8aff', '#9a5aff'], rarity: 'rare', unlock: U('course', 'c06') },
      { id: 'pirate', name: 'Jolly Roger', shape: 'rect', fill: 'solid', cols: ['#1d1d24'], emblem: 'skull', ec: '#f4f4f4', rarity: 'rare', unlock: U('swishes', 12) },
      { id: 'bolt', name: 'Thunderbolt', shape: 'swallow', fill: 'solid', cols: ['#1a2a6a'], emblem: 'bolt', ec: '#ffe23a', rarity: 'rare', unlock: U('gimmicks', 20) },
      { id: 'moon', name: 'Night Owl', shape: 'rect', fill: 'solid', cols: ['#141a3a'], emblem: 'moon', ec: '#fff2b0', rarity: 'rare', unlock: U('daily', 10) },
      { id: 'pixel', name: 'Invader', shape: 'rect', fill: 'pixel', cols: ['#0e0e18', '#5adf6a'], rarity: 'epic', unlock: U('stars', 900) },
      { id: 'fish', name: 'Koi Sock', shape: 'fish', L: 44, fill: 'koi', cols: ['#ff7a2a', '#ffffff', '#c03a10'], rarity: 'epic', unlock: U('cleared', 25) },
      { id: 'neon', name: 'Neon', shape: 'tri', fill: 'neon', cols: ['#14081e', '#ff3cf0', '#3cf6ff'], rarity: 'epic', unlock: U('endless', 12) },
      { id: 'golden', name: 'Golden', shape: 'swallow', fill: 'gold', cols: ['#ffcf3a', '#fff2a0', '#a06a00'], emblem: 'star', ec: '#fff6d0', rarity: 'legendary', unlock: U('cleared', 45) },
      // ---- v3 progression
      { id: 'graduate', name: 'Graduate', shape: 'tri', L: 44, fill: 'solid', cols: ['#2a3a8a'], emblem: 'cap', ec: '#ffd23c', rarity: 'rare', unlock: U('tutorials', 30) },
      { id: 'calendar', name: 'Calendar', shape: 'rect', L: 34, H: 30, fill: 'calendar', cols: ['#ffffff', '#ff4757', '#ffffff'], emblem: 'cal', ec: '#1d1d24', rarity: 'rare', unlock: ACH('daily7') },
      { id: 'looking', name: 'Looking Glass', shape: 'rect', fill: 'mirror', flip: true, cols: ['#8ad0ff', '#2a5ab0', '#ffffff'], rarity: 'rare', unlock: U('remix', 4) },
      { id: 'stopwatch', name: 'Stopwatch', shape: 'rect', fill: 'solid', cols: ['#1d1d24'], emblem: 'watch', ec: '#f4f4f4', rarity: 'epic', unlock: U('fastrounds', 2) },
      { id: 'grandmaster', name: 'Grandmaster', shape: 'swallow', fill: 'checker', cols: ['#5a2a9a', '#2a1050'], emblem: 'crown', ec: '#ffd23c', rarity: 'epic', unlock: ACH('gimmick_master') },
      { id: 'perfect', name: 'Perfection', shape: 'rect', L: 42, fill: 'gold', cols: ['#ffcf3a', '#fff6c8', '#a06a00'], emblem: 'crown', ec: '#fff6d0', rarity: 'legendary', unlock: ACH('perfect_round') },
    ],
    palettes: [
      { id: 'default', name: 'Course Colours', override: null, rarity: 'common', unlock: FREE },
      { id: 'pastel', name: 'Pastel', override: { post: { white: 0.38 } }, rarity: 'common', unlock: FREE },
      { id: 'sunset', name: 'Golden Hour', override: { skyTop: '#2b1b4f', skyBottom: '#ff9a62', far: '#a04e7a', mid: '#7a3664', near: '#4e2048', post: { tint: '#ff9a5c', amt: 0.16 } }, rarity: 'common', unlock: U('holes', 36) },
      { id: 'sepia', name: 'Sepia', override: { post: { mono: true, tint: '#b08a5a', amt: 0.42 } }, rarity: 'common', unlock: U('stars', 120) },
      { id: 'autumn', name: 'Autumn', override: { skyTop: '#e8944a', skyBottom: '#ffe2b8', far: '#c8703a', mid: '#a0522a', near: '#7a3a1e', accent: '#ffcf3a', post: { tint: '#d8782a', amt: 0.2 } }, rarity: 'common', unlock: U('cleared', 5) },
      { id: 'ocean', name: 'Deep Blue', override: { skyTop: '#0a3a6a', skyBottom: '#7ad8ee', far: '#2a7aa0', mid: '#1e6a8a', near: '#16506e', accent: '#ffcf3a', post: { tint: '#1aa0c8', amt: 0.18 } }, rarity: 'rare', unlock: U('course', 'c12') },
      { id: 'candy', name: 'Candy', override: { skyTop: '#ff9ad0', skyBottom: '#fff0f8', far: '#ffc0e0', mid: '#c0a0ff', near: '#8ad8c8', accent: '#ff3a8a', post: { white: 0.12, tint: '#ff8ad0', amt: 0.14 } }, rarity: 'rare', unlock: U('daily', 5) },
      { id: 'noir', name: 'Noir', override: { post: { mono: true, keepAccent: true } }, rarity: 'rare', unlock: U('rounds', 6) },
      { id: 'retro', name: 'Retro Handheld', override: { skyTop: '#9bbc0f', skyBottom: '#c4d97a', far: '#8bac0f', mid: '#6b8c22', near: '#306230', ground: '#306230', groundDark: '#0f380f', accent: '#0f380f', text: '#0f380f', post: { tint: '#8bac0f', amt: 0.6 } }, rarity: 'rare', unlock: U('birdies', 30) },
      { id: 'arctic', name: 'Arctic', override: { skyTop: '#8ac8ff', skyBottom: '#f4fbff', far: '#d8ecff', mid: '#b8d8f0', near: '#9ac0e0', accent: '#2a6aff', post: { tint: '#cfe8ff', amt: 0.3 } }, rarity: 'rare', unlock: U('gimmicks', 18) },
      { id: 'desert', name: 'Dune', override: { skyTop: '#ffa850', skyBottom: '#ffe8c0', far: '#e0a070', mid: '#c88050', near: '#a06038', accent: '#2a8aff', post: { tint: '#e8b070', amt: 0.2 } }, rarity: 'rare', unlock: U('stars', 450) },
      { id: 'midnight', name: 'Midnight', override: { skyTop: '#02030c', skyBottom: '#1a2a50', far: '#16203e', mid: '#101830', near: '#0a1022', accent: '#ffd34a', post: { dark: 0.3, tint: '#3050a0', amt: 0.15 } }, rarity: 'epic', unlock: U('cleared', 20) },
      { id: 'blueprint', name: 'Blueprint', override: { skyTop: '#0a3a8a', skyBottom: '#1a5ab0', far: '#2a6ac0', mid: '#2a62b8', near: '#2a5aa8', ground: '#1a4a9a', groundDark: '#0a2a6a', accent: '#ffffff', text: '#ffffff', post: { mono: true, tint: '#2a6ae0', amt: 0.6, keepAccent: true } }, rarity: 'epic', unlock: U('cleared', 30) },
      { id: 'neon', name: 'Neon Night', override: { skyTop: '#05010f', skyBottom: '#2a0a52', far: '#3a0f7a', mid: '#25095a', near: '#140638', ground: '#140630', groundDark: '#05010d', accent: '#00f6ff', text: '#ffffff', post: { sat: 0.25 } }, rarity: 'epic', unlock: U('swishes', 20) },
      { id: 'synthwave', name: 'Synthwave', override: { skyTop: '#12002a', skyBottom: '#ff4fa0', far: '#7a1aa0', mid: '#4a0a7a', near: '#26064a', ground: '#1a0638', groundDark: '#0a0118', accent: '#3cf6ff', post: { sat: 0.3, tint: '#c03aff', amt: 0.18 } }, rarity: 'legendary', unlock: U('endless', 20) },
      { id: 'chalkboard', name: 'Chalkboard', override: { skyTop: '#1c3a2c', skyBottom: '#3a6050', far: '#4a6e5e', mid: '#3e6252', near: '#2e5242', accent: '#ffe066', post: { white: 0.06, tint: '#5a8a70', amt: 0.18 } }, rarity: 'common', unlock: U('tutorials', 15) },
      { id: 'glass', name: 'Through the Glass', override: { skyTop: '#6a5aa8', skyBottom: '#e8e0ff', far: '#b8b0e0', mid: '#9a90c8', near: '#7a70b0', accent: '#3cf6ff', post: { tint: '#c8b8ff', amt: 0.22 } }, rarity: 'rare', unlock: U('remix', 2) },
      { id: 'velocity', name: 'Velocity', override: { skyTop: '#2a0a3a', skyBottom: '#ff7a3a', far: '#c8406a', mid: '#8a2a5a', near: '#5a1a4a', accent: '#ffe23a', post: { sat: 0.2, tint: '#ff6a3a', amt: 0.12 } }, rarity: 'rare', unlock: U('fastrounds', 4) },
      { id: 'daybreak', name: 'Daybreak', override: { skyTop: '#ff9ab0', skyBottom: '#fff0c8', far: '#ffc0b0', mid: '#e8a0a0', near: '#b07a8a', accent: '#ff5a3a', post: { white: 0.05, tint: '#ffd0a0', amt: 0.12 } }, rarity: 'rare', unlock: ACH('daily3') },
      { id: 'mirror', name: 'Mirror World', override: { post: { invert: true, sat: 0.1 } }, rarity: 'epic', unlock: ACH('remix_under_par') },
      { id: 'halloffame', name: 'Hall of Fame', override: { skyTop: '#1a0838', skyBottom: '#6a3aa0', far: '#5a2a8a', mid: '#4a1e78', near: '#341460', ground: '#3a2050', groundDark: '#1a0a2a', accent: '#ffd23c', post: { tint: '#b080ff', amt: 0.12, keepAccent: true } }, rarity: 'legendary', unlock: U('achievements', 25) },
      { id: 'midas', name: 'Midas Touch', override: { accent: '#fff2a0', post: { mono: true, tint: '#e0a820', amt: 0.5, keepAccent: true } }, rarity: 'legendary', unlock: U('stars', 2500) },
    ],
  };
  const COSMETIC_CATS = [
    { key: 'balls', slot: 'ball', name: 'Balls' },
    { key: 'trails', slot: 'trail', name: 'Trails' },
    { key: 'cupEffects', slot: 'cupEffect', name: 'Cup Effects' },
    { key: 'flags', slot: 'flag', name: 'Flags' },
    { key: 'palettes', slot: 'palette', name: 'Palettes' },
  ];
  const COSM_DEFAULT = { ball: 'classic', trail: 'classic', cupEffect: 'classic', palette: 'default', flag: 'classic' };
  const RAINBOW6 = ['#ff3a3a', '#ff9a2a', '#ffe23a', '#3ad85a', '#3a8aff', '#9a5aff'];
  const byId = (list, id) => list.find((e) => e.id === id) || list[0];

  // ---------------------------------------------------------------- themes / colours
  const PAL_KEYS = ['skyTop', 'skyBottom', 'far', 'mid', 'near', 'ground', 'groundDark', 'accent', 'text'];
  const DEFAULT_THEME = {
    id: 'default', name: 'Default',
    palette: { skyTop: '#5fb4ff', skyBottom: '#d8f1ff', far: '#a9cfe6', mid: '#7fb08a', near: '#4f8f5a', ground: '#7a5a3a', groundDark: '#4a3322', accent: '#ff4757', text: '#ffffff' },
    ambient: { particles: 'leaves', bg: 'hills' },
  };
  function resolveTheme(hole, theme) {
    const M = GOLF.Manifest;
    if (typeof theme === 'string' && M && M.byId) theme = M.byId[theme];
    if (!theme && hole && hole.theme && M && M.byId) theme = M.byId[hole.theme];
    return theme || DEFAULT_THEME;
  }
  function makePost(post) {
    if (!post) return (c) => c;
    return (c) => {
      let v = c;
      if (post.invert) { const q = rgb(v); v = hex([255 - q[0], 255 - q[1], 255 - q[2]]); }
      if (post.mono) v = gray(v);
      if (post.sat) { const g = gray(v); v = mix(g, v, 1 + post.sat); }
      if (post.tint) v = mix(v, post.tint, post.amt || 0.3);
      if (post.white) v = mix(v, '#ffffff', post.white);
      if (post.dark) v = mix(v, '#000000', post.dark);
      return v;
    };
  }
  const SURF_BASE = {
    f: { c: '#62c64a', band: 11, top: 3.5 }, r: { c: '#3e8a36', band: 13, top: 4 }, s: { c: '#ead27e', band: 15, top: 3 },
    i: { c: '#bfe9ff', band: 11, top: 3 }, g: { c: '#9a4fd6', band: 13, top: 4 }, b: { c: '#ff5aa5', band: 11, top: 4 },
    k: { c: '#8b909a', band: 7, top: 2.5 }, q: { c: '#cfdcf0', band: 9, top: 4 }, m: { c: '#9aa3ad', band: 8, top: 3 },
    c: { c: '#4a505c', band: 9, top: 3 }, w: { c: '#2a5c9a', band: 6, top: 2 }, l: { c: '#a8401a', band: 6, top: 2 },
    o: { c: '#d23a3a', band: 11, top: 3 }, x: { c: '#7d828c', band: 7, top: 2 },
    n: { c: '#8ff06a', band: 13, top: 4 }, u: { c: '#b48a50', band: 14, top: 3 }, h: { c: '#f1e8ff', band: 12, top: 5 },
    j: { c: '#86d8ff', band: 14, top: 2.5 }, z: { c: '#ff2a4a', band: 7, top: 2.5 }, v: { c: '#1a0f2e', band: 14, top: 2 },
  };
  function buildColors(theme, paletteId) {
    const pc = byId(COSMETICS.palettes, paletteId || 'default');
    const ov = pc.override || null;
    const P0 = Object.assign({}, DEFAULT_THEME.palette, theme.palette || {});
    if (ov) PAL_KEYS.forEach((k) => { if (ov[k]) P0[k] = ov[k]; });
    const post = makePost(ov && ov.post);
    const pal = {}; PAL_KEYS.forEach((k) => { pal[k] = post(P0[k]); });
    if (ov && ov.post && ov.post.keepAccent) pal.accent = P0.accent;
    const fx = post;
    const col = {
      pal, post,
      soil: mix(pal.ground, '#ffffff', 0.06), band: mix(pal.ground, pal.groundDark, 0.55),
      pebble: mix(pal.ground, pal.groundDark, 0.45), pebbleHi: mix(pal.ground, '#ffffff', 0.1),
      solid: mix(pal.groundDark, pal.ground, 0.3), solidBand: mix(pal.groundDark, '#000000', 0.25),
      surf: {},
      metal: fx('#97a1ae'), metalDark: fx('#4b535e'), metalHi: fx('#dfe6ee'),
      wood: fx('#b07a48'), woodDark: fx('#6b4526'), woodHi: fx('#d8a874'),
      water: fx('#3d95f0'), waterDeep: fx('#1d4f9a'), waterHi: fx('#bfe6ff'),
      lava: fx('#ff6a14'), lavaHot: fx('#ffd34a'), lavaDeep: fx('#9e1e06'),
      goo: fx('#9b4fd6'), gooHi: fx('#d19bff'), gooGreen: fx('#8ae05a'),
      pink: fx('#ff5aa5'), pinkHi: fx('#ffc0de'),
      danger: fx('#e03a3a'), ok: fx('#38d46a'), warn: fx('#ffcf3a'),
      bumper: fx('#ff3d6e'), brick: fx(mix('#b0764a', pal.ground, 0.25)), crumble: fx(mix('#b8925e', pal.ground, 0.3)),
      vanish: fx('#6fe3ff'), lowgrav: fx('#4fe0ff'), antigrav: fx('#ff4fd8'), attract: fx('#9a6cff'), repel: fx('#ff8a3c'),
      portalA: fx('#ff9a1f'), portalB: fx('#2fa8ff'),
      tele: ['#3cf0c0', '#ffd23c', '#ff5ad2', '#7c8bff', '#9cff4a'].map(fx),
      fog: mix(fx('#dfe4ec'), pal.skyBottom, 0.25),
      accent: pal.accent,
      dark: lum(pal.skyTop) < 0.3,
      boost: fx('#3cf0ff'), boostHot: fx('#fff27a'), magN: fx('#e8423a'), magS: fx('#3a6ee8'),
      bubble: fx('#bfe8ff'), pipe: fx('#3cba6a'), pipeDark: fx('#1f6e3c'), pipeHi: fx('#9ff0b8'),
      pool: fx('#4fb4ff'), quick: fx('#b48a50'), quickDk: fx('#7a5a30'), hole: fx('#8a4dff'), holeHot: fx('#ff9a3c'),
      sidegrav: fx('#b6ff3c'), slowmo: fx('#7aa8ff'), honey: fx('#f2b630'), laser: fx('#ff2a4a'),
      saw: fx('#e8edf2'), crusher: fx('#5a5f6e'), token: fx('#ffd23c'), tokenDk: fx('#b07a00'),
      glass: fx('#cdefff'), flood: fx('#3d8ff0'), geyser: fx('#d8f4ff'), phase: fx('#c28cff'),
      togA: fx('#ff9a1f'), togB: fx('#2fa8ff'), ring: fx('#ffd23c'), skim: fx('#9fe6ff'), cloud: fx('#ffffff'), cloudDk: fx('#d6c8f0'),
      tornado: fx('#8f98ab'), mine: fx('#3a3d48'), lift: fx('#8d96a3'), green: null,
    };
    for (const k in SURF_BASE) {
      let c = SURF_BASE[k].c;
      if (k === 'f' || k === 'r') c = mix(c, pal.near, 0.2);
      else if (k === 'n') c = shade(mix(c, pal.near, 0.1), 0.06);
      c = fx(c);
      col.surf[k] = { c, hi: shade(c, 0.28), dk: shade(c, -0.22), band: SURF_BASE[k].band, top: SURF_BASE[k].top };
    }
    col.green = col.surf.n;
    col.amb = {
      leaves: ['#d9822b', '#c9a227', '#8fbf3a', '#b5562a'].map(fx), snow: [fx('#ffffff')], embers: [fx('#ff8a2a'), fx('#ffc04a')],
      bubbles: [fx('#ffffff')], stars: [fx('#fffbe0')], dust: [mix(pal.skyBottom, pal.ground, 0.4)], rain: [fx('#b8d4ff')],
      spores: [fx('#b6ff6a'), fx('#6affd8')], sparks: [fx('#ffd34a'), fx('#ffffff')], petals: ['#ffb3d1', '#ffd6e6', '#ff8fb8'].map(fx),
    };
    return col;
  }

  // ---------------------------------------------------------------- path helpers
  function rrectPath(p, x, y, w, h, r) {
    r = Math.max(0, Math.min(r, w / 2, h / 2));
    p.moveTo(x + r, y); p.lineTo(x + w - r, y); p.quadraticCurveTo(x + w, y, x + w, y + r);
    p.lineTo(x + w, y + h - r); p.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    p.lineTo(x + r, y + h); p.quadraticCurveTo(x, y + h, x, y + h - r);
    p.lineTo(x, y + r); p.quadraticCurveTo(x, y, x + r, y); p.closePath();
  }
  function rrect(ctx, x, y, w, h, r) { ctx.beginPath(); rrectPath(ctx, x, y, w, h, r); }
  function circ(p, x, y, r) { p.moveTo(x + r, y); p.arc(x, y, r, 0, TAU); }
  function starPath(p, x, y, r, ri, n, rot) {
    for (let k = 0; k < n * 2; k++) {
      const a = rot + k * Math.PI / n - Math.PI / 2, rr = k & 1 ? ri : r;
      if (k === 0) p.moveTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); else p.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
    }
    p.closePath();
  }
  function heartPath(p, x, y, s, rot) {
    const c = Math.cos(rot), sn = Math.sin(rot);
    const T = (u, v) => [x + (u * c - v * sn) * s, y + (u * sn + v * c) * s];
    let a = T(0, 0.35); p.moveTo(a[0], a[1]);
    let b = T(-1, -0.4), d = T(-0.5, -1.1), e = T(0, -0.45); p.bezierCurveTo(b[0], b[1], d[0], d[1], e[0], e[1]);
    b = T(0.5, -1.1); d = T(1, -0.4); a = T(0, 0.35); p.bezierCurveTo(b[0], b[1], d[0], d[1], a[0], a[1]);
    p.closePath();
  }
  function pointInPoly(p, x, y) {
    let inside = false; const n = p.length >> 1;
    for (let i = 0, j = n - 1; i < n; j = i++) {
      const xi = p[2 * i], yi = p[2 * i + 1], xj = p[2 * j], yj = p[2 * j + 1];
      if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  }
  function groundY(hole, x) {
    const g = hole.ground; let lo = 0, hi = (g.length >> 1) - 1;
    if (x <= g[0]) return g[1];
    if (x >= g[2 * hi]) return g[2 * hi + 1];
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (g[2 * m] <= x) lo = m; else hi = m; }
    const x0 = g[2 * lo], y0 = g[2 * lo + 1], x1 = g[2 * hi], y1 = g[2 * hi + 1];
    return x1 === x0 ? Math.min(y0, y1) : y0 + (y1 - y0) * (x - x0) / (x1 - x0);
  }

  // ---------------------------------------------------------------- background layers
  const BG_P = 2400;
  const PAR = [0.1, 0.25, 0.5];
  const OFF = [10, 90, 170];
  const LH = [380, 260, 170];
  function waveFn(rng, terms) {
    const tt = terms.map((t) => [t[0], t[1], rng.next() * TAU]);
    return (x) => { let y = 0; for (let i = 0; i < tt.length; i++) y += tt[i][1] * Math.sin(TAU * tt[i][0] * x / BG_P + tt[i][2]); return y; };
  }
  function fillFn(p, f, step) {
    p.moveTo(0, 3000); for (let x = 0; x < BG_P; x += step) p.lineTo(x, f(x));
    p.lineTo(BG_P, f(BG_P)); p.lineTo(BG_P, 3000); p.closePath();
  }
  function genLayer(type, rng, li) {
    const H = LH[li];
    const L = { main: new Path2D(), det: null, detKind: 'light', detCol: null, anim: [], drift: 0, bob: 0 };
    const main = L.main;
    const baseHills = (lvl, amp) => { const w = waveFn(rng, [[2, amp], [3, amp * 0.6], [7, amp * 0.25]]); const f = (x) => -(H * lvl + w(x)); fillFn(main, f, 16); return f; };
    switch (type) {
      case 'mountains': case 'volcano': {
        const N = 5 + li * 3, peaks = [];
        for (let i = 0; i < N; i++) peaks.push({ x: (i + rng.float(0.15, 0.85)) * BG_P / N, h: H * rng.float(0.5, 1.05) * (type === 'volcano' && li === 0 ? 0.6 : 1), s: rng.float(0.8, 1.5) });
        const f = (x) => {
          let m = H * 0.12;
          for (const p of peaks) { let d = Math.abs(x - p.x); d = Math.min(d, BG_P - d); const y = p.h - d * p.s; if (y > m) m = y; }
          const j = x > 0 && x < BG_P ? (hash1(x * 0.37 + li * 9) - 0.5) * 7 : 0;
          return -m + j;
        };
        fillFn(main, f, 12);
        if (type === 'volcano' && li === 0) {
          const cx = BG_P * 0.55, Wc = BG_P * 0.45, Hc = H * 1.25;
          main.moveTo(cx - Wc / 2, 20); main.lineTo(cx - 70, -Hc); main.lineTo(cx - 40, -Hc + 18); main.lineTo(cx + 40, -Hc + 18); main.lineTo(cx + 70, -Hc); main.lineTo(cx + Wc / 2, 20); main.closePath();
          L.det = new Path2D(); L.detCol = 'lava';
          for (let k = 0; k < 4; k++) {
            const x0 = cx - 40 + k * 26, sp = rng.float(-0.6, 0.6);
            L.det.moveTo(x0, -Hc + 16); L.det.lineTo(x0 + 8, -Hc + 16);
            L.det.lineTo(x0 + 6 + sp * 120, -Hc + 140 + k * 30); L.det.lineTo(x0 + sp * 120, -Hc + 150 + k * 30); L.det.closePath();
          }
          L.anim.push({ k: 'smoke', x: cx, y: -Hc + 10 });
        } else if (li < 2) {
          L.det = new Path2D();
          for (const p of peaks) {
            const c = p.h * 0.2, w = c / p.s;
            L.det.moveTo(p.x, -p.h); L.det.lineTo(p.x + w, -p.h + c); L.det.lineTo(p.x + w * 0.35, -p.h + c * 0.72);
            L.det.lineTo(p.x - w * 0.15, -p.h + c * 0.95); L.det.lineTo(p.x - w * 0.6, -p.h + c * 0.7); L.det.lineTo(p.x - w, -p.h + c); L.det.closePath();
          }
          L.detCol = type === 'volcano' ? 'darker' : 'snow';
        }
        break;
      }
      case 'city': {
        main.rect(0, -H * 0.08, BG_P, 3000);
        L.det = new Path2D();
        let x = rng.float(0, 30);
        while (x < BG_P - 50) {
          const bw = rng.float(44, 120) * (1 - li * 0.12), bh = H * rng.float(0.35, 1.15);
          if (x + bw > BG_P) break;
          main.rect(x, -bh, bw, bh + 3000);
          if (rng.chance(0.3)) main.rect(x + bw * 0.5 - 1.5, -bh - 34, 3, 36);
          else if (rng.chance(0.3)) { main.moveTo(x, -bh); main.lineTo(x + bw / 2, -bh - bw * 0.35); main.lineTo(x + bw, -bh); main.closePath(); }
          if (li > 0) {
            for (let wy = -bh + 12; wy < -18; wy += 24) for (let wx = x + 8; wx < x + bw - 12; wx += 16) if (rng.chance(0.38)) L.det.rect(wx, wy, 7, 10);
          }
          x += bw + rng.float(2, 24);
        }
        L.detKind = 'window';
        break;
      }
      case 'crystals': {
        const f = baseHills(0.12, H * 0.06);
        L.det = new Path2D();
        const N = 14 + li * 6;
        for (let i = 0; i < N; i++) {
          const x = rng.next() * BG_P, w = rng.float(18, 50) * (1 + (2 - li) * 0.3), h = H * rng.float(0.35, 1.1), tl = rng.float(-0.25, 0.25) * h, by = f(x) + 12;
          main.moveTo(x - w / 2, by); main.lineTo(x - w / 2 + tl * 0.6, by - h * 0.72); main.lineTo(x + tl, by - h); main.lineTo(x + w / 2 + tl * 0.6, by - h * 0.72); main.lineTo(x + w / 2, by); main.closePath();
          L.det.moveTo(x + tl, by - h); L.det.lineTo(x + w / 2 + tl * 0.6, by - h * 0.72); L.det.lineTo(x + w / 2, by); L.det.lineTo(x + w * 0.1, by); L.det.closePath();
        }
        break;
      }
      case 'forest': {
        const f = baseHills(0.14, H * 0.07);
        let x = rng.float(0, 20);
        while (x < BG_P) {
          const h = H * rng.float(0.35, 0.78), w = h * 0.42, by = f(x) + 6;
          if (li === 2 && rng.chance(0.35)) {
            main.rect(x - w * 0.07, by - h * 0.5, w * 0.14, h * 0.5 + 10);
            circ(main, x, by - h * 0.62, w * 0.55); circ(main, x - w * 0.3, by - h * 0.48, w * 0.4); circ(main, x + w * 0.32, by - h * 0.5, w * 0.42);
          } else {
            main.rect(x - w * 0.06, by - h * 0.2, w * 0.12, h * 0.25);
            for (let k = 0; k < 3; k++) {
              const ay = by - h * (1 - k * 0.27), hw = w * (0.32 + k * 0.12);
              main.moveTo(x, ay); main.lineTo(x + hw, ay + h * 0.42); main.lineTo(x - hw, ay + h * 0.42); main.closePath();
            }
          }
          x += rng.float(16, 44) * (1 + li * 0.25);
        }
        break;
      }
      case 'pillars': case 'ruins': {
        const f = baseHills(0.08, H * 0.03);
        L.det = new Path2D(); L.detKind = 'dark';
        let x = rng.float(20, 120);
        while (x < BG_P - 80) {
          const cw = rng.float(26, 50) * (1 + (2 - li) * 0.2), by = f(x) + 8;
          let ch = H * rng.float(0.55, 1.1);
          if (type === 'ruins' && rng.chance(0.35)) {
            const aw = rng.float(110, 190), pw = 22, r = aw / 2 - pw, ah = Math.min(H * 0.95, r + 60 + rng.float(0, 60));
            main.moveTo(x, by); main.lineTo(x, by - ah); main.lineTo(x + aw * 0.6, by - ah); main.lineTo(x + aw * 0.7, by - ah + 14); main.lineTo(x + aw, by - ah + 8);
            main.lineTo(x + aw, by); main.lineTo(x + aw - pw, by); main.lineTo(x + aw - pw, by - ah + 20 + r);
            main.arc(x + aw / 2, by - ah + 20 + r, r, 0, Math.PI, true); main.lineTo(x + pw, by); main.closePath();
            x += aw + rng.float(40, 160); continue;
          }
          const broken = type === 'ruins' ? rng.chance(0.6) : rng.chance(0.2);
          if (broken) {
            ch *= rng.float(0.35, 0.7);
            main.moveTo(x, by); main.lineTo(x, by - ch); main.lineTo(x + cw * 0.3, by - ch - 10); main.lineTo(x + cw * 0.55, by - ch + 5); main.lineTo(x + cw, by - ch - 4); main.lineTo(x + cw, by); main.closePath();
          } else {
            main.rect(x, by - ch, cw, ch); main.rect(x - cw * 0.2, by - ch - 12, cw * 1.4, 12); main.rect(x - cw * 0.25, by - ch - 18, cw * 1.5, 7);
          }
          main.rect(x - cw * 0.15, by - 16, cw * 1.3, 16);
          for (let k = 1; k < 4; k++) L.det.rect(x + cw * k / 4 - 1, by - ch * (broken ? 0.9 : 1) + 6, 2, ch * (broken ? 0.85 : 1) - 26);
          x += rng.float(90, 230);
        }
        break;
      }
      case 'clouds': {
        const f = baseHills(0.22, H * 0.06);
        L.det = new Path2D();
        for (let x = 0; x < BG_P; x += rng.float(40, 80)) {
          const r = H * rng.float(0.1, 0.24), y = f(x) - rng.float(0, H * 0.15);
          circ(main, x, y, r); circ(L.det, x - r * 0.2, y - r * 0.25, r * 0.6);
        }
        L.drift = [4, 9, 16][li];
        break;
      }
      case 'waves': {
        const w = waveFn(rng, [[4, H * 0.05], [7, H * 0.035], [11, H * 0.02], [17, H * 0.012]]);
        const f = (x) => -(H * 0.22 + w(x)); fillFn(main, f, 10);
        L.det = new Path2D();
        for (let x = 0; x < BG_P; x += rng.float(40, 90)) { L.det.moveTo(x + 16, f(x) + 4); L.det.ellipse(x, f(x) + 4, 16, 2.5, 0, 0, TAU); }
        L.drift = [5, 11, 22][li]; L.bob = 3 + li * 2;
        break;
      }
      case 'gears': {
        const f = baseHills(0.1, H * 0.03);
        if (li === 0) {
          let x = 0;
          while (x < BG_P - 60) {
            const bw = rng.float(60, 160), bh = H * rng.float(0.3, 0.7);
            main.rect(x, -bh, bw, bh + 3000);
            for (let s = 0; s + 30 <= bw; s += 30) { main.moveTo(x + s, -bh); main.lineTo(x + s + 30, -bh - 18); main.lineTo(x + s + 30, -bh); main.closePath(); }
            if (rng.chance(0.5)) main.rect(x + bw * 0.7, -bh - H * 0.45, 14, H * 0.5);
            x += bw + rng.float(10, 60);
          }
          L.anim.push({ k: 'smoke', x: BG_P * 0.3, y: -H * 1.1 });
        } else {
          for (let i = 0; i < 4 + li * 2; i++) {
            const x = (i + rng.float(0.1, 0.9)) * BG_P / (4 + li * 2), r = H * rng.float(0.16, 0.34), y = f(x) - r * rng.float(0.4, 1.2);
            L.anim.push({ k: 'gear', x, y, r, n: rng.int(8, 14), sp: rng.float(0.15, 0.5) * (rng.chance(0.5) ? 1 : -1), path: gearPath(r, rng.int(8, 14)) });
          }
          if (li === 2) { L.det = new Path2D(); L.detKind = 'dark'; for (let x = 0; x < BG_P; x += rng.float(160, 320)) { L.det.rect(x, -H * 0.12 - 10, rng.float(80, 200), 10); L.det.rect(x, -H * 0.12 - 60, 10, 60); } }
        }
        break;
      }
      case 'mushrooms': {
        const f = baseHills(0.12, H * 0.05);
        L.det = new Path2D();
        let x = rng.float(10, 60);
        while (x < BG_P) {
          const h = H * rng.float(0.35, 0.95), sw = rng.float(10, 22) * (1 + (2 - li) * 0.3), r = sw * rng.float(2, 3.4), by = f(x) + 8;
          main.moveTo(x - sw / 2, by); main.quadraticCurveTo(x - sw * 0.2, by - h * 0.5, x - sw * 0.35, by - h); main.lineTo(x + sw * 0.35, by - h); main.quadraticCurveTo(x + sw * 0.6, by - h * 0.5, x + sw / 2, by); main.closePath();
          main.moveTo(x - r, by - h + 4); main.ellipse(x, by - h + 4, r, r * 0.72, 0, Math.PI, TAU); main.closePath();
          for (let k = 0; k < 4; k++) circ(L.det, x + rng.float(-0.65, 0.65) * r, by - h - rng.float(0.15, 0.5) * r * 0.72, r * rng.float(0.1, 0.18));
          x += rng.float(60, 170);
        }
        break;
      }
      case 'dunes': {
        const ph = rng.next() * TAU, ph2 = rng.next() * TAU, k1 = 2 + li, k2 = 5 + li;
        const f = (x) => { const a = TAU * k1 * x / BG_P + ph, b = TAU * k2 * x / BG_P + ph2; return -(H * 0.28 + H * 0.12 * (Math.sin(a) + 0.35 * Math.sin(2 * a)) + H * 0.04 * Math.sin(b)); };
        fillFn(main, f, 12);
        break;
      }
      case 'space': {
        if (li === 0) {
          L.noBase = true;
          const pr = H * 0.32; circ(main, BG_P * 0.3, -H * 1.2, pr); circ(main, BG_P * 0.78, -H * 0.8, pr * 0.35);
          L.det = new Path2D(); circ(L.det, BG_P * 0.3 - pr * 0.25, -H * 1.2 - pr * 0.25, pr * 0.55);
          L.anim.push({ k: 'ring', x: BG_P * 0.3, y: -H * 1.2, r: pr * 1.7 });
        } else {
          const w = waveFn(rng, [[3, H * 0.08], [9, H * 0.03], [23, H * 0.012]]);
          const f = (x) => -(H * 0.18 + w(x)); fillFn(main, f, 8);
          L.det = new Path2D(); L.detKind = 'dark';
          for (let x = 0; x < BG_P; x += rng.float(80, 200)) { const r = rng.float(10, 30); L.det.moveTo(x + r, f(x) + 10); L.det.ellipse(x, f(x) + 10, r, r * 0.3, 0, 0, TAU); }
        }
        break;
      }
      default: { // hills
        const f = baseHills(0.32 - li * 0.06, H * 0.12);
        if (li > 0) {
          L.det = new Path2D(); L.detKind = 'dark';
          for (let x = rng.float(0, 80); x < BG_P; x += rng.float(50, 160)) { const r = rng.float(8, 22) * (li === 2 ? 1.2 : 0.8); circ(L.det, x, f(x) + r * 0.4, r); }
        }
      }
    }
    return L;
  }
  function gearPath(r, n) {
    const p = new Path2D();
    for (let i = 0; i < n; i++) {
      const a0 = i / n * TAU, a1 = (i + 0.5) / n * TAU, a2 = (i + 1) / n * TAU, d = 0.08;
      const pt = (a, rr) => [Math.cos(a) * rr, Math.sin(a) * rr];
      let q = pt(a0 + d, r); if (i === 0) p.moveTo(q[0], q[1]); else p.lineTo(q[0], q[1]);
      q = pt(a1 - d, r); p.lineTo(q[0], q[1]);
      q = pt(a1 + d, r * 0.8); p.lineTo(q[0], q[1]);
      q = pt(a2 - d, r * 0.8); p.lineTo(q[0], q[1]);
    }
    p.closePath(); circ(p, 0, 0, r * 0.3);
    return p;
  }

  // ---------------------------------------------------------------- scene build
  function buildScene(hole, theme, cosm, withBg) {
    theme = resolveTheme(hole, theme);
    cosm = cosm || {};
    const col = buildColors(theme, cosm.palette);
    const rng = makeRng((hole.seed >>> 0) || 1);
    const amb = theme.ambient || {};
    const sc = { hole, theme, col, cosm, bgType: amb.bg || 'hills', ambType: amb.particles || 'none', hit: {}, gateAmt: {}, gone: {}, padHit: {} };
    const gp = hole.ground, n = gp.length >> 1, gs = hole.gs || '';
    const EXT = 2200, BOT = hole.h + 4000, XL = gp[0] - EXT, XR = gp[2 * n - 2] + EXT;
    sc.bounds = { XL, XR, BOT };
    let minG = 1e9, maxG = -1e9, sumG = 0;
    for (let i = 0; i < n; i++) { const y = gp[2 * i + 1]; minG = Math.min(minG, y); maxG = Math.max(maxG, y); sumG += y; }
    sc.minG = minG; sc.maxG = maxG; sc.gMean = sumG / n;

    const addGround = (p) => {
      p.moveTo(XL, BOT); p.lineTo(XL, gp[1]);
      for (let i = 0; i < n; i++) p.lineTo(gp[2 * i], gp[2 * i + 1]);
      p.lineTo(XR, gp[2 * n - 1]); p.lineTo(XR, BOT); p.closePath();
    };
    sc.groundPath = new Path2D(); addGround(sc.groundPath);
    sc.airPath = new Path2D(); sc.airPath.rect(XL - 1e5, -1e5, 3e5, 3e5); addGround(sc.airPath);
    sc.topPath = new Path2D(); sc.topPath.moveTo(XL, gp[1]); for (let i = 0; i < n; i++) sc.topPath.lineTo(gp[2 * i], gp[2 * i + 1]); sc.topPath.lineTo(XR, gp[2 * n - 1]);

    const solids = hole.solids || [];
    const inSolid = (x, y, skip) => { for (let k = 0; k < solids.length; k++) if (k !== skip && pointInPoly(solids[k].p, x, y)) return true; return false; };
    const safeExt = (c) => ('wloxzvj'.indexOf(c) >= 0 ? 'k' : c || 'f');
    // ---- edges
    const edges = [];
    const mkEdge = (ax, ay, bx, by, s, owner, poly) => {
      const dx = bx - ax, dy = by - ay, L = Math.hypot(dx, dy);
      if (L < 0.01) return;
      let nx = dy / L, ny = -dx / L;
      const mx = (ax + bx) / 2, my = (ay + by) / 2;
      if (poly) { if (pointInPoly(poly, mx + nx * 0.8, my + ny * 0.8)) { nx = -nx; ny = -ny; } } else if (ny > 0) { nx = -nx; ny = -ny; }
      const ox = mx + nx * 3, oy = my + ny * 3;
      const skip = owner < 0 ? inSolid(ox, oy, -1) : (oy > groundY(hole, ox) + 0.5 || inSolid(ox, oy, owner));
      edges.push({ ax, ay, bx, by, s, nx, ny, L, owner, skip });
    };
    mkEdge(XL, gp[1], gp[0], gp[1], safeExt(gs[0]), -1, null);
    for (let i = 0; i + 1 < n; i++) mkEdge(gp[2 * i], gp[2 * i + 1], gp[2 * i + 2], gp[2 * i + 3], gs[i] || 'f', -1, null);
    mkEdge(gp[2 * n - 2], gp[2 * n - 1], XR, gp[2 * n - 1], safeExt(gs[n - 2]), -1, null);
    sc.solids = solids.map((so, k) => {
      const p = so.p, m = p.length >> 1, path = new Path2D();
      for (let i = 0; i < m; i++) { if (i === 0) path.moveTo(p[0], p[1]); else path.lineTo(p[2 * i], p[2 * i + 1]); }
      path.closePath();
      let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
      for (let i = 0; i < m; i++) {
        const j = (i + 1) % m, s = so.s && so.s.length > 1 ? (so.s[i] || so.s[0]) : (so.s || 'k');
        mkEdge(p[2 * i], p[2 * i + 1], p[2 * j], p[2 * j + 1], s, k, p);
        x0 = Math.min(x0, p[2 * i]); x1 = Math.max(x1, p[2 * i]); y0 = Math.min(y0, p[2 * i + 1]); y1 = Math.max(y1, p[2 * i + 1]);
      }
      return { path, box: [x0, y0, x1, y1] };
    });
    // ---- runs
    const runs = [];
    let cur = null;
    for (const e of edges) {
      if (e.skip) { cur = null; continue; }
      if (!cur || cur.s !== e.s || cur.owner !== e.owner || cur.lx !== e.ax || cur.ly !== e.ay) {
        cur = { s: e.s, owner: e.owner, path: new Path2D(), edges: [] }; cur.path.moveTo(e.ax, e.ay); runs.push(cur);
      }
      cur.path.lineTo(e.bx, e.by); cur.lx = e.bx; cur.ly = e.by; cur.edges.push(e);
    }
    sc.runs = runs;
    // ---- decorations
    const D = { tuftF: new Path2D(), tuftR: new Path2D(), tuftR2: new Path2D(), sandDots: new Path2D(), sandDots2: new Path2D(), iceShine: new Path2D(),
      rockSpecks: new Path2D(), rivets: new Path2D(), spikes: new Path2D(), convMarks: new Path2D(), bouncyDots: new Path2D(),
      greenMarks: new Path2D(), puffs: new Path2D(), puffsDk: new Path2D(), voidStars: new Path2D() };
    sc.deco = D; sc.goo = []; sc.drips = []; sc.glints = []; sc.animEdges = { u: [], j: [], z: [], v: [] };
    for (const e of edges) {
      if (e.skip) continue;
      const tx = (e.bx - e.ax) / e.L, ty = (e.by - e.ay) / e.L, nx = e.nx, ny = e.ny;
      const at = (d, o) => [e.ax + tx * d + nx * o, e.ay + ty * d + ny * o];
      const tri = (p, d0, d1, dt, h) => { let a = at(d0, 0.5); p.moveTo(a[0], a[1]); a = at(dt, h); p.lineTo(a[0], a[1]); a = at(d1, 0.5); p.lineTo(a[0], a[1]); p.closePath(); };
      const band = SURF_BASE[e.s] ? SURF_BASE[e.s].band : 8;
      if (sc.animEdges[e.s]) sc.animEdges[e.s].push({ e, tx, ty, ph: rng.next() * TAU });
      switch (e.s) {
        case 'f': for (let d = rng.float(0, 6); d < e.L - 2; d += rng.float(4, 9)) tri(D.tuftF, d - 1.6, d + 1.6, d + rng.float(-1.5, 1.5), rng.float(2, 5)); break;
        case 'r': for (let d = rng.float(0, 4); d < e.L - 2; d += rng.float(3, 7)) tri(rng.chance(0.5) ? D.tuftR : D.tuftR2, d - 2, d + 2, d + rng.float(-3.5, 3.5), rng.float(4, 10)); break;
        case 's': for (let d = rng.float(0, 4); d < e.L; d += rng.float(2.5, 6)) { const a = at(d, -rng.float(2, band - 1.5)); circ(rng.chance(0.75) ? D.sandDots : D.sandDots2, a[0], a[1], rng.float(0.7, 1.6)); } break;
        case 'i': {
          for (let d = rng.float(0, 20); d < e.L; d += rng.float(26, 60)) { const a = at(d, -3), b = at(Math.min(e.L, d + rng.float(8, 24)), -3); D.iceShine.moveTo(a[0], a[1]); D.iceShine.lineTo(b[0], b[1]); }
          for (let d = rng.float(10, 60); d < e.L; d += rng.float(60, 140)) { const a = at(d, -2); sc.glints.push({ x: a[0], y: a[1], ph: rng.next() * 7 }); }
          break;
        }
        case 'g': {
          for (let d = rng.float(4, 14); d < e.L - 3; d += rng.float(18, 34)) { const a = at(d, 0); sc.goo.push({ x: a[0], y: a[1], nx, ny, r: rng.float(3, 6), ph: rng.next() * TAU }); }
          if (ny > 0.3) for (let d = rng.float(6, 20); d < e.L - 4; d += rng.float(26, 54)) { const a = at(d, 0); sc.drips.push({ x: a[0], y: a[1], len: rng.float(6, 16), ph: rng.next() }); }
          break;
        }
        case 'b': for (let d = 6; d < e.L - 3; d += 12) { const a = at(d, -band * 0.5); circ(D.bouncyDots, a[0], a[1], 1.8); } break;
        case 'k': for (let d = rng.float(0, 8); d < e.L; d += rng.float(7, 18)) { const a = at(d, -rng.float(1, band)); circ(D.rockSpecks, a[0], a[1], rng.float(0.6, 1.5)); } break;
        case 'm': for (let d = 10; d < e.L - 4; d += 22) { const a = at(d, -3.5); circ(D.rivets, a[0], a[1], 1.4); } break;
        case 'x': for (let d = 6; d < e.L - 2; d += 12) tri(D.spikes, d - 5, d + 5, d, 11); break;
        case 'c': for (let d = 4; d < e.L - 6; d += 14) { const a = at(d, -3), b = at(d + 5, -6), c2 = at(d, -9); D.convMarks.moveTo(a[0], a[1]); D.convMarks.lineTo(b[0], b[1]); D.convMarks.lineTo(c2[0], c2[1]); } break;
        case 'n': for (let d = rng.float(0, 8); d < e.L - 2; d += rng.float(9, 16)) tri(D.greenMarks, d - 1, d + 1, d + rng.float(-0.8, 0.8), rng.float(1.2, 2.4)); break;
        case 'h': for (let d = 4; d < e.L - 2; d += rng.float(9, 14)) { const r = rng.float(4, 7), a = at(d, r * 0.1); circ(D.puffs, a[0], a[1], r); const b = at(d - r * 0.2, r * 0.4); circ(D.puffsDk, b[0], b[1], r * 0.72); } break;
        case 'v': for (let d = rng.float(0, 6); d < e.L; d += rng.float(5, 12)) { const a = at(d, -rng.float(2, band * 1.6)); circ(D.voidStars, a[0], a[1], rng.float(0.5, 1.3)); } break;
        default: break;
      }
    }
    // pebbles in the ground
    sc.pebbles = new Path2D(); sc.pebblesHi = new Path2D();
    for (let x = XL + 20; x < XR; x += rng.float(30, 70)) {
      const gy = groundY(hole, x);
      for (let k = 0; k < 2; k++) {
        const d = rng.float(34, 340), r = rng.float(2.5, 8), px = x + rng.float(-20, 20), py = gy + d;
        sc.pebbles.moveTo(px + r, py); sc.pebbles.ellipse(px, py, r, r * 0.7, 0, 0, TAU);
        sc.pebblesHi.moveTo(px - r * 0.2 + r * 0.45, py - r * 0.3); sc.pebblesHi.ellipse(px - r * 0.2, py - r * 0.3, r * 0.45, r * 0.25, 0, 0, TAU);
      }
    }
    // ---- liquids
    sc.liquids = [];
    {
      let i = 0;
      while (i < n - 1) {
        const c = gs[i];
        if (c !== 'w' && c !== 'l') { i++; continue; }
        let j = i; while (j + 1 < n - 1 && gs[j + 1] === c) j++;
        let fy = 1e9, by = -1e9;
        for (let k = i; k <= j + 1; k++) { fy = Math.min(fy, gp[2 * k + 1]); by = Math.max(by, gp[2 * k + 1]); }
        const Lv = fy - 18;
        let xl = gp[2 * i] - 2, xr = gp[2 * (j + 1)] + 2;
        for (let k = i; k >= 1; k--) { const y0 = gp[2 * k - 1], y1 = gp[2 * k + 1]; if (y0 <= Lv) { xl = gp[2 * k - 2] + (Lv - y0) / ((y1 - y0) || 1) * (gp[2 * k] - gp[2 * k - 2]); break; } if (gp[2 * i] - gp[2 * k] > 900) break; }
        for (let k = j + 1; k < n - 1; k++) { const y0 = gp[2 * k + 1], y1 = gp[2 * k + 3]; if (y1 <= Lv) { xr = gp[2 * k] + (Lv - y0) / ((y1 - y0) || 1) * (gp[2 * k + 2] - gp[2 * k]); break; } if (gp[2 * k] - gp[2 * (j + 1)] > 900) break; }
        sc.liquids.push({ k: c, xl: xl - 1, xr: xr + 1, L: Lv, yb: by + 6 });
        i = j + 1;
      }
      for (const e of edges) if (e.owner >= 0 && (e.s === 'w' || e.s === 'l') && e.ny < -0.7) sc.liquids.push({ k: e.s, xl: Math.min(e.ax, e.bx), xr: Math.max(e.ax, e.bx), L: Math.min(e.ay, e.by) - 18, yb: Math.max(e.ay, e.by) + 1 });
    }
    // ---- gimmicks
    const gm = hole.gm || [];
    sc.gBox = []; sc.back = []; sc.front = []; sc.over = []; sc.fogs = []; sc.tokMask = {}; sc.tokFade = {}; sc.catFlick = {}; sc.catWas = {}; sc.floodY = null; sc.shards = {}; sc.teleCol = {}; sc.cracks = {}; sc.spikePaths = {};
    let teleN = 0;
    gm.forEach((g, i) => {
      const box = gimmickBox(hole, g);
      sc.gBox[i] = box;
      switch (g.t) {
        case 'wind': if (g.w !== undefined) sc.back.push(i); else sc.globalWind = true; break;
        case 'fan': case 'windmill': case 'movplat': case 'gate': case 'cannon': sc.back.push(i); sc.front.push(i); break;
        case 'lowgrav': case 'antigrav': case 'gwell': sc.back.push(i); break;
        case 'fog': if (typeof document !== 'undefined') sc.fogs.push({ i, img: makeFog(g, col, rng) }); break;
        case 'movcup': case 'shrinkcup': break;
        case 'sidegrav': case 'slowmo': case 'drag': case 'liftcup': sc.back.push(i); break;
        case 'magnet': case 'saw': case 'crusher': case 'zipline': sc.back.push(i); sc.front.push(i); break;
        case 'bubble': case 'pipe': case 'floatpool': case 'flood': case 'tornado': sc.over.push(i); break;
        case 'geyser': sc.front.push(i); sc.over.push(i); break;
        default: sc.front.push(i);
      }
      if (g.t === 'teleport') sc.teleCol[i] = col.tele[teleN++ % col.tele.length];
      if (g.t === 'breakable' || g.t === 'crumble') {
        const p = new Path2D();
        for (let k = 0; k < 3; k++) {
          let x = g.x + rng.float(0.15, 0.85) * g.w, y = g.y + rng.float(0, 0.3) * g.h; p.moveTo(x, y);
          for (let s = 0; s < 4; s++) { x = clamp(x + rng.float(-0.2, 0.2) * g.w, g.x + 1, g.x + g.w - 1); y = Math.min(g.y + g.h - 1, y + rng.float(0.15, 0.35) * g.h); p.lineTo(x, y); }
        }
        sc.cracks[i] = p;
      }
      if (g.t === 'spikes') {
        const dx = g.x2 - g.x, dy = g.y2 - g.y, L = Math.hypot(dx, dy) || 1, tx = dx / L, ty = dy / L;
        let nx = ty, ny = -tx; if (ny > 0) { nx = -nx; ny = -ny; }
        const p = new Path2D();
        for (let d = 2; d + 8 <= L + 0.5; d += 9) {
          p.moveTo(g.x + tx * d, g.y + ty * d); p.lineTo(g.x + tx * (d + 4.5) + nx * 12, g.y + ty * (d + 4.5) + ny * 12); p.lineTo(g.x + tx * (d + 9), g.y + ty * (d + 9)); p.closePath();
        }
        sc.spikePaths[i] = { p, nx, ny };
      }
    });
    sc.movcup = gm.find((g) => g.t === 'movcup') || null;
    // ---- background
    if (withBg) {
      const brng = makeRng(((hole.seed >>> 0) ^ 0x5bd1e995) >>> 0 || 7);
      sc.layers = [0, 1, 2].map((li) => genLayer(sc.bgType, brng, li));
      sc.stars = [];
      if (col.dark || sc.bgType === 'space') for (let k = 0; k < 120; k++) sc.stars.push({ x: brng.next(), y: brng.next() * 0.75, r: brng.float(0.5, 1.8), ph: brng.next() * TAU });
      sc.sun = { x: brng.float(0.6, 0.85), y: brng.float(0.1, 0.2), r: brng.float(24, 38) };
    }
    return sc;
  }

  function gimmickBox(hole, g) {
    const M = 30;
    switch (g.t) {
      case 'windmill': return [g.x - g.L - M, g.y - g.L - M, g.x + g.L + M, Math.max(g.y + g.L, groundY(hole, g.x) + 40) + M];
      case 'movplat': return [Math.min(g.x, g.x2) - M, Math.min(g.y, g.y2) - M, Math.max(g.x, g.x2) + g.w + M, Math.max(g.y, g.y2) + g.h + M];
      case 'rotplat': case 'pad': return [g.x - g.L - M, g.y - g.L - M, g.x + g.L + M, g.y + g.L + M];
      case 'teleport': case 'portal': { const r = (g.r || 22) + 40; return [Math.min(g.x, g.x2) - r, Math.min(g.y, g.y2) - r, Math.max(g.x, g.x2) + r, Math.max(g.y, g.y2) + r]; }
      case 'conveyor': case 'oneway': case 'ricochet': case 'spikes': return [Math.min(g.x, g.x2) - M, Math.min(g.y, g.y2) - M, Math.max(g.x, g.x2) + M, Math.max(g.y, g.y2) + M];
      case 'gwell': return [g.x - g.r - M, g.y - g.r - M, g.x + g.r + M, g.y + g.r + M];
      case 'cannon': { const r = (g.r || 20) * 5; return [g.x - r, g.y - r, g.x + r, g.y + r]; }
      case 'bumper': return [g.x - g.r - M, g.y - g.r - M, g.x + g.r + M, g.y + g.r + M];
      case 'gate': return [Math.min(g.x, g.sx) - M, Math.min(g.y, g.sy) - M, Math.max(g.x + g.w, g.sx) + M, Math.max(g.y + g.h, g.sy) + M];
      case 'fan': return [g.x - 60, g.y - 60, g.x + g.w + 60, g.y + g.h + 60];
      case 'boost': case 'quicksand': case 'cushion': case 'laser': return [Math.min(g.x, g.x2) - M, Math.min(g.y, g.y2) - M, Math.max(g.x, g.x2) + M, Math.max(g.y, g.y2) + M];
      case 'zipline': return [Math.min(g.x, g.x2) - M, Math.min(g.y, g.y2) - M, Math.max(g.x, g.x2) + M, Math.max(groundY(hole, g.x), groundY(hole, g.x2)) + M];
      case 'magnet': { const r = (g.r || 120) + M; return [Math.min(g.x, g.x2) - r, Math.min(g.y, g.y2) - r, Math.max(g.x, g.x2) + r, Math.max(g.y, g.y2) + r]; }
      case 'saw': { const r = (g.r || 18) + M; return [Math.min(g.x, g.x2) - r, Math.min(g.y, g.y2) - r, Math.max(g.x, g.x2) + r, Math.max(g.y, g.y2) + r]; }
      case 'piston': return [Math.min(g.x, g.x + g.dx) - M - 20, Math.min(g.y, g.y + g.dy) - M - 20, Math.max(g.x, g.x + g.dx) + g.w + M + 20, Math.max(g.y, g.y + g.dy) + g.h + M + 20];
      case 'pendulum': { const r = g.L + (g.r || 22) + M; return [g.x - r, g.y - r, g.x + r, g.y + r]; }
      case 'seesaw': return [g.x - g.L / 2 - M, g.y - g.L / 2 - M, g.x + g.L / 2 + M, Math.max(g.y + g.L / 2, groundY(hole, g.x)) + M];
      case 'pipe': { let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9; for (let k = 0; k < g.p.length; k += 2) { x0 = Math.min(x0, g.p[k]); x1 = Math.max(x1, g.p[k]); y0 = Math.min(y0, g.p[k + 1]); y1 = Math.max(y1, g.p[k + 1]); } return [x0 - 50, y0 - 50, x1 + 50, y1 + 50]; }
      case 'blackhole': case 'spinner': case 'mine': case 'ring': { const r = (g.r || 30) + M + 20; return [g.x - r, g.y - r, g.x + r, g.y + r]; }
      case 'crusher': return [g.x - M, g.y - M - 30, g.x + g.w + M, g.y + g.h + (g.dy || 0) + M];
      case 'tokens': case 'decoy': case 'blinkcup': { let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9; for (let k = 0; k < g.pts.length; k += 2) { x0 = Math.min(x0, g.pts[k]); x1 = Math.max(x1, g.pts[k]); y0 = Math.min(y0, g.pts[k + 1]); y1 = Math.max(y1, g.pts[k + 1]); } return [x0 - 50, y0 - 110, x1 + 70, y1 + 40]; }
      case 'geyser': return [g.x - g.w / 2 - M, g.y - g.h - M - 40, g.x + g.w / 2 + M, g.y + M];
      case 'tornado': { const x2 = g.x2 === undefined ? g.x : g.x2; return [Math.min(g.x, x2) - g.w - M, g.y - g.h - M, Math.max(g.x, x2) + g.w + M, g.y + M]; }
      case 'phase': case 'toggle': {
        let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
        const all = g.t === 'phase' ? g.blocks : (g.a || []).concat(g.b || []);
        for (const r of all) { x0 = Math.min(x0, r[0]); y0 = Math.min(y0, r[1]); x1 = Math.max(x1, r[0] + r[2]); y1 = Math.max(y1, r[1] + r[3]); }
        if (g.t === 'toggle') { x0 = Math.min(x0, g.sx); x1 = Math.max(x1, g.sx); y0 = Math.min(y0, g.sy); y1 = Math.max(y1, g.sy); }
        return [x0 - M, y0 - M, x1 + M, y1 + M];
      }
      case 'skim': return [g.x - M, g.y - M, g.x + g.w + M, Math.max(groundY(hole, g.x), groundY(hole, g.x + g.w), groundY(hole, g.x + g.w / 2)) + M];
      case 'catapult': return [g.x - g.w - M, g.y - g.w - M, g.x + g.w + M, g.y + 40];
      case 'liftcup': return [g.x - g.w / 2 - M, Math.min(g.y1, g.y2) - 120, g.x + g.w / 2 + M, g.yb + M];
      case 'bubble': case 'flood': return null;
      default:
        if (g.w !== undefined && g.h !== undefined) return [g.x - M, g.y - M, g.x + g.w + M, g.y + g.h + M];
        return null;
    }
  }

  function makeFog(g, col, rng) {
    const s = 0.5, pad = 60, W = g.w + pad * 2, H = g.h + pad * 2;
    const c = document.createElement('canvas'); c.width = Math.max(4, Math.ceil(W * s)); c.height = Math.max(4, Math.ceil(H * s));
    const x = c.getContext('2d'); x.scale(s, s); x.translate(pad - g.x, pad - g.y);
    const base = col.fog, dk = shade(base, -0.12), lt = shade(base, 0.35);
    x.fillStyle = base; rrect(x, g.x, g.y, g.w, g.h, 30); x.fill();
    const per = 2 * (g.w + g.h);
    x.beginPath();
    for (let d = 0; d < per; d += rng.float(26, 44)) {
      let px, py;
      if (d < g.w) { px = g.x + d; py = g.y; } else if (d < g.w + g.h) { px = g.x + g.w; py = g.y + d - g.w; } else if (d < 2 * g.w + g.h) { px = g.x + g.w - (d - g.w - g.h); py = g.y + g.h; } else { px = g.x; py = g.y + g.h - (d - 2 * g.w - g.h); }
      circ(x, px + rng.float(-8, 8), py + rng.float(-8, 8), rng.float(24, 48));
    }
    x.fill();
    x.fillStyle = dk; x.globalAlpha = 0.35; x.beginPath();
    for (let k = 0; k < g.w * g.h / 9000 + 4; k++) circ(x, g.x + rng.next() * g.w, g.y + rng.next() * g.h, rng.float(20, 50));
    x.fill();
    x.fillStyle = lt; x.globalAlpha = 0.5; x.beginPath();
    for (let k = 0; k < g.w * g.h / 9000 + 4; k++) circ(x, g.x + rng.next() * g.w, g.y + rng.next() * g.h, rng.float(16, 40));
    x.fill();
    x.globalAlpha = 0.45; x.fillStyle = dk; x.font = 'bold 46px sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillText('?', g.x + g.w / 2, g.y + g.h / 2);
    return { c, x: g.x - pad, y: g.y - pad, w: W, h: H };
  }

  // ---------------------------------------------------------------- terrain drawing
  function drawTerrain(ctx, sc, t, view) {
    const col = sc.col, pal = col.pal;
    // ground fill
    const gr = ctx.createLinearGradient(0, sc.minG + 10, 0, sc.maxG + 520);
    gr.addColorStop(0, pal.ground); gr.addColorStop(1, pal.groundDark);
    ctx.fillStyle = gr; ctx.fill(sc.groundPath);
    ctx.save(); ctx.clip(sc.groundPath);
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    ctx.strokeStyle = col.soil; ctx.lineWidth = 64; ctx.globalAlpha = 0.5; ctx.stroke(sc.topPath);
    ctx.strokeStyle = col.band; ctx.lineWidth = 30; ctx.globalAlpha = 0.35; ctx.stroke(sc.topPath); ctx.globalAlpha = 1;
    ctx.fillStyle = col.pebble; ctx.fill(sc.pebbles); ctx.fillStyle = col.pebbleHi; ctx.globalAlpha = 0.5; ctx.fill(sc.pebblesHi); ctx.globalAlpha = 1;
    for (const r of sc.runs) if (r.owner < 0) strokeBand(ctx, sc, r);
    drawInnerDeco(ctx, sc);
    ctx.restore();
    // solids
    for (let k = 0; k < sc.solids.length; k++) {
      const so = sc.solids[k];
      if (view && (so.box[2] < view.x0 || so.box[0] > view.x1 || so.box[3] < view.y0 || so.box[1] > view.y1)) continue;
      ctx.fillStyle = col.solid; ctx.fill(so.path);
      ctx.save(); ctx.clip(so.path);
      ctx.strokeStyle = col.solidBand; ctx.globalAlpha = 0.45; ctx.lineWidth = 26; ctx.stroke(so.path); ctx.globalAlpha = 1;
      for (const r of sc.runs) if (r.owner === k) strokeBand(ctx, sc, r);
      drawInnerDeco(ctx, sc);
      ctx.restore();
    }
    // top lines + outward deco
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    ctx.strokeStyle = col.solidBand; ctx.globalAlpha = 0.3;
    for (const r of sc.runs) { const S = col.surf[r.s] || col.surf.k; ctx.lineWidth = S.top + 5; ctx.stroke(r.path); }
    ctx.globalAlpha = 1;
    for (const r of sc.runs) {
      const S = col.surf[r.s] || col.surf.k;
      if (r.s === 'o') { ctx.strokeStyle = S.hi; ctx.lineWidth = 2.5; ctx.stroke(r.path); continue; }
      if (r.s === 'x') { ctx.strokeStyle = col.metalDark; ctx.lineWidth = 3; ctx.stroke(r.path); continue; }
      if (r.s === 'z') { ctx.strokeStyle = '#3a0a14'; ctx.lineWidth = 5; ctx.stroke(r.path); if (sc.cb) { ctx.lineCap = 'butt'; ctx.setLineDash([6, 5]); ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 3; ctx.stroke(r.path); ctx.setLineDash([]); ctx.lineCap = 'round'; } continue; }
      if (r.s === 'v') { ctx.strokeStyle = col.hole; ctx.lineWidth = 2; ctx.stroke(r.path); continue; }
      if (r.s === 'n') { ctx.strokeStyle = shade(S.c, 0.1); ctx.lineWidth = S.top + 2.5; ctx.stroke(r.path); ctx.strokeStyle = '#f2ffe0'; ctx.lineWidth = 1.8; ctx.globalAlpha = 0.9; ctx.stroke(r.path); ctx.globalAlpha = 1; continue; }
      ctx.strokeStyle = r.s === 'k' ? S.hi : S.c; ctx.lineWidth = S.top + 1.5; ctx.stroke(r.path);
      ctx.strokeStyle = S.hi; ctx.lineWidth = Math.max(1.2, S.top * 0.45); ctx.globalAlpha = 0.85; ctx.stroke(r.path); ctx.globalAlpha = 1;
    }
    const D = sc.deco;
    ctx.fillStyle = col.surf.f.c; ctx.fill(D.tuftF);
    ctx.fillStyle = col.surf.r.c; ctx.fill(D.tuftR); ctx.fillStyle = col.surf.r.hi; ctx.fill(D.tuftR2);
    ctx.fillStyle = col.metalHi; ctx.fill(D.spikes); ctx.strokeStyle = col.metalDark; ctx.lineWidth = 1.2; ctx.stroke(D.spikes);
    ctx.fillStyle = col.surf.n.hi; ctx.fill(D.greenMarks);
    ctx.fillStyle = col.cloudDk; ctx.fill(D.puffs); ctx.fillStyle = col.cloud; ctx.fill(D.puffsDk);
    drawSurfAnim(ctx, sc, t, view);
    // animated: goo blobs, drips, ice glints
    ctx.fillStyle = col.goo;
    ctx.beginPath();
    for (const b of sc.goo) {
      if (view && (b.x < view.x0 || b.x > view.x1 || b.y < view.y0 || b.y > view.y1)) continue;
      const r = b.r * (0.75 + 0.25 * Math.sin(t * 2 + b.ph));
      circ(ctx, b.x + b.nx * r * 0.3, b.y + b.ny * r * 0.3, r);
    }
    for (const d of sc.drips) {
      if (view && (d.x < view.x0 || d.x > view.x1 || d.y < view.y0 || d.y > view.y1)) continue;
      const s = frac(t * 0.35 + d.ph), L = d.len * s;
      ctx.moveTo(d.x - 3, d.y); ctx.quadraticCurveTo(d.x - 1.5, d.y + L * 0.6, d.x, d.y + L); ctx.quadraticCurveTo(d.x + 1.5, d.y + L * 0.6, d.x + 3, d.y); ctx.closePath();
      circ(ctx, d.x, d.y + L, 2.4 * (0.5 + s * 0.5));
    }
    ctx.fill();
    ctx.fillStyle = col.gooHi; ctx.beginPath();
    for (const b of sc.goo) { if (view && (b.x < view.x0 || b.x > view.x1 || b.y < view.y0 || b.y > view.y1)) continue; const r = b.r * (0.75 + 0.25 * Math.sin(t * 2 + b.ph)); circ(ctx, b.x + b.nx * r * 0.3 - r * 0.3, b.y + b.ny * r * 0.3 - r * 0.3, r * 0.3); }
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    for (const g of sc.glints) {
      if (view && (g.x < view.x0 || g.x > view.x1 || g.y < view.y0 || g.y > view.y1)) continue;
      const a = Math.max(0, Math.sin(t * 1.7 + g.ph)); if (a < 0.7) continue;
      const s = (a - 0.7) / 0.3 * 4; ctx.globalAlpha = 0.9;
      ctx.beginPath(); starPath(ctx, g.x, g.y, s, s * 0.25, 4, 0); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
  let _hatch = null;
  function hatchPattern(ctx, col) {
    if (!_hatch || _hatch.col !== col.surf.o.c) {
      const c = document.createElement('canvas'); c.width = 12; c.height = 12;
      const x = c.getContext('2d'); x.fillStyle = col.surf.o.c; x.fillRect(0, 0, 12, 12);
      x.strokeStyle = '#ffffff'; x.globalAlpha = 0.55; x.lineWidth = 3; x.beginPath();
      x.moveTo(-3, 3); x.lineTo(3, -3); x.moveTo(-3, 15); x.lineTo(15, -3); x.moveTo(9, 15); x.lineTo(15, 9); x.stroke();
      _hatch = { col: col.surf.o.c, c, pats: new WeakMap() };
    }
    let p = _hatch.pats.get(ctx);
    if (!p) { p = ctx.createPattern(_hatch.c, 'repeat'); _hatch.pats.set(ctx, p); }
    return p;
  }
  // ---- colour-blind overlay patterns (transparent tiles, drawn on top of the normal fill)
  // wave = water, zig = lava, dots = void, diag = oob, stripe = green mow, laser = hazard dashes
  const _cbTiles = Object.create(null);
  const CB_TILE = {
    wave: [16, 10, (x) => { x.strokeStyle = 'rgba(255,255,255,0.85)'; x.lineWidth = 1.6; x.beginPath(); for (let k = 0; k <= 16; k++) { const yy = 5 + Math.sin(k / 16 * TAU) * 2.6; if (k) x.lineTo(k, yy); else x.moveTo(k, yy); } x.stroke(); }],
    zig: [12, 12, (x) => { x.strokeStyle = 'rgba(20,0,0,0.85)'; x.lineWidth = 2; x.lineJoin = 'miter'; x.beginPath(); x.moveTo(0, 9); x.lineTo(3, 3); x.lineTo(6, 9); x.lineTo(9, 3); x.lineTo(12, 9); x.stroke(); }],
    dots: [10, 10, (x) => { x.fillStyle = 'rgba(240,230,255,0.95)'; x.fillRect(2, 2, 1.6, 1.6); x.fillRect(7, 6, 1.2, 1.2); x.fillStyle = 'rgba(240,230,255,0.6)'; x.beginPath(); x.moveTo(6, 0.5); x.lineTo(6.6, 2); x.lineTo(8, 2.5); x.lineTo(6.6, 3); x.lineTo(6, 4.5); x.lineTo(5.4, 3); x.lineTo(4, 2.5); x.lineTo(5.4, 2); x.closePath(); x.fill(); }],
    diag: [10, 10, (x) => { x.strokeStyle = 'rgba(255,255,255,0.8)'; x.lineWidth = 2; x.beginPath(); x.moveTo(-2, 2); x.lineTo(2, -2); x.moveTo(-2, 12); x.lineTo(12, -2); x.moveTo(8, 12); x.lineTo(12, 8); x.stroke(); }],
    stripe: [12, 12, (x) => { x.fillStyle = 'rgba(255,255,255,0.55)'; x.fillRect(0, 0, 3, 12); x.fillRect(6, 0, 3, 12); x.fillStyle = 'rgba(0,40,0,0.25)'; x.fillRect(3, 0, 3, 12); x.fillRect(9, 0, 3, 12); }],
  };
  function cbPattern(ctx, kind) {
    if (typeof document === 'undefined') return null;
    let e = _cbTiles[kind];
    if (!e) {
      const d = CB_TILE[kind]; if (!d) return null;
      const c = document.createElement('canvas'); c.width = d[0]; c.height = d[1]; d[2](c.getContext('2d'));
      e = _cbTiles[kind] = { c, pats: new WeakMap() };
    }
    let p = e.pats.get(ctx);
    if (!p) { p = ctx.createPattern(e.c, 'repeat'); e.pats.set(ctx, p); }
    return p;
  }
  const CB_SURF = { w: 'wave', l: 'zig', v: 'dots', o: 'diag', n: 'stripe' };
  function strokeBand(ctx, sc, r) {
    const col = sc.col, S = col.surf[r.s] || col.surf.k;
    ctx.lineWidth = S.band * 2;
    if (r.s === 'o' && typeof document !== 'undefined') ctx.strokeStyle = hatchPattern(ctx, col);
    else if (r.s === 'w') ctx.strokeStyle = col.waterDeep;
    else if (r.s === 'l') ctx.strokeStyle = sc.cb ? shade(col.lavaDeep, -0.35) : col.lavaDeep;
    else ctx.strokeStyle = S.c;
    ctx.stroke(r.path);
    if (sc.cb && CB_SURF[r.s] && r.s !== 'o') {
      const pt = cbPattern(ctx, CB_SURF[r.s]);
      if (pt) { ctx.save(); ctx.strokeStyle = pt; ctx.lineWidth = S.band * 2; ctx.globalAlpha = r.s === 'n' ? 0.7 : 0.9; ctx.stroke(r.path); ctx.restore(); }
      if (r.s === 'n') return;
    }
    if (r.s === 'b') { ctx.setLineDash([7, 7]); ctx.strokeStyle = col.pinkHi; ctx.lineWidth = S.band * 2; ctx.globalAlpha = 0.45; ctx.stroke(r.path); ctx.setLineDash([]); ctx.globalAlpha = 1; }
    else if (r.s === 'q') { ctx.setLineDash([5, 9]); ctx.strokeStyle = shade(S.c, -0.45); ctx.lineWidth = S.band * 2; ctx.globalAlpha = 0.5; ctx.stroke(r.path); ctx.setLineDash([]); ctx.globalAlpha = 1; }
    else if (r.s === 'g') { ctx.strokeStyle = col.gooGreen; ctx.lineWidth = 5; ctx.globalAlpha = 0.6; ctx.stroke(r.path); ctx.globalAlpha = 1; }
    else if (r.s === 'i') { ctx.strokeStyle = shade(S.c, -0.12); ctx.lineWidth = S.band * 0.8; ctx.globalAlpha = 0.6; ctx.setLineDash([2, 10]); ctx.stroke(r.path); ctx.setLineDash([]); ctx.globalAlpha = 1; }
    else if (r.s === 'f' || r.s === 'r') { ctx.strokeStyle = S.dk; ctx.lineWidth = 6; ctx.globalAlpha = 0.25; ctx.stroke(r.path); ctx.globalAlpha = 1; }
    else if (r.s === 'n') {
      // mowed stripes: alternating light / dark bands
      ctx.lineCap = 'butt'; ctx.setLineDash([16, 16]); ctx.strokeStyle = shade(S.hi, 0.15); ctx.lineWidth = S.band * 2; ctx.globalAlpha = 0.75; ctx.stroke(r.path);
      ctx.lineDashOffset = 16; ctx.strokeStyle = S.dk; ctx.globalAlpha = 0.35; ctx.stroke(r.path); ctx.lineDashOffset = 0;
      ctx.setLineDash([]); ctx.strokeStyle = S.dk; ctx.lineWidth = 5; ctx.globalAlpha = 0.3; ctx.stroke(r.path); ctx.globalAlpha = 1; ctx.lineCap = 'round';
    }
    else if (r.s === 'u') { ctx.setLineDash([3, 9]); ctx.strokeStyle = col.quickDk; ctx.lineWidth = S.band * 1.2; ctx.globalAlpha = 0.5; ctx.stroke(r.path); ctx.setLineDash([]); ctx.globalAlpha = 1; }
    else if (r.s === 'h') { ctx.strokeStyle = col.cloudDk; ctx.lineWidth = S.band * 0.8; ctx.globalAlpha = 0.6; ctx.stroke(r.path); ctx.globalAlpha = 1; }
    else if (r.s === 'j') { ctx.strokeStyle = col.waterDeep; ctx.lineWidth = S.band * 0.9; ctx.globalAlpha = 0.45; ctx.stroke(r.path); ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 3; ctx.globalAlpha = 0.35; ctx.stroke(r.path); ctx.globalAlpha = 1; }
    else if (r.s === 'z') { ctx.strokeStyle = '#2a0610'; ctx.lineWidth = S.band * 2; ctx.stroke(r.path); }
    else if (r.s === 'v') { ctx.strokeStyle = '#05010c'; ctx.lineWidth = S.band * 1.2; ctx.stroke(r.path); ctx.strokeStyle = col.hole; ctx.lineWidth = 4; ctx.globalAlpha = 0.5; ctx.stroke(r.path); ctx.globalAlpha = 1; }
  }
  function drawInnerDeco(ctx, sc) {
    const col = sc.col, D = sc.deco;
    ctx.fillStyle = col.surf.s.dk; ctx.fill(D.sandDots); ctx.fillStyle = col.surf.s.hi; ctx.fill(D.sandDots2);
    ctx.strokeStyle = '#ffffff'; ctx.globalAlpha = 0.75; ctx.lineWidth = 2; ctx.stroke(D.iceShine); ctx.globalAlpha = 1;
    ctx.fillStyle = col.surf.k.dk; ctx.fill(D.rockSpecks);
    ctx.fillStyle = col.surf.m.hi; ctx.fill(D.rivets);
    ctx.fillStyle = col.pinkHi; ctx.fill(D.bouncyDots);
    ctx.strokeStyle = col.warn; ctx.lineWidth = 1.5; ctx.stroke(D.convMarks);
    ctx.fillStyle = '#e6d8ff'; ctx.globalAlpha = 0.8; ctx.fill(D.voidStars); ctx.globalAlpha = 1;
  }
  // animated surface effects (quicksand swirls, skim ripples, laser glow, void shimmer)
  function drawSurfAnim(ctx, sc, t, view) {
    const col = sc.col, A = sc.animEdges;
    if (!A) return;
    const vis = (e) => !view || !(Math.max(e.ax, e.bx) < view.x0 || Math.min(e.ax, e.bx) > view.x1 || Math.max(e.ay, e.by) < view.y0 - 30 || Math.min(e.ay, e.by) > view.y1 + 30);
    ctx.lineCap = 'round';
    for (const a of A.u) {
      const e = a.e; if (!vis(e)) continue;
      ctx.strokeStyle = col.quickDk; ctx.lineWidth = 1.4; ctx.globalAlpha = 0.7;
      for (let d = 10; d < e.L - 6; d += 22) {
        const cx = e.ax + a.tx * d - e.nx * 7, cy = e.ay + a.ty * d - e.ny * 7, r0 = t * (1.2 + hash1(d) * 0.8) + d;
        ctx.beginPath();
        for (let k = 0; k <= 14; k++) { const u = k / 14, an = r0 + u * 9, rr = 1 + u * 4.5; const x = cx + Math.cos(an) * rr, y = cy + Math.sin(an) * rr * 0.55; if (k === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y); }
        ctx.stroke();
      }
    }
    for (const a of A.j) {
      const e = a.e; if (!vis(e)) continue;
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.6;
      for (let d = 0; d < e.L; d += 30) {
        const s = frac(t * 0.35 + hash1(d + a.ph)), dd = d + s * 30; if (dd > e.L - 4) continue;
        const x = e.ax + a.tx * dd - e.nx * 4, y = e.ay + a.ty * dd - e.ny * 4;
        ctx.globalAlpha = 0.7 * Math.sin(s * Math.PI); ctx.beginPath(); ctx.moveTo(x - a.tx * 6, y - a.ty * 6); ctx.lineTo(x + a.tx * 6, y + a.ty * 6); ctx.stroke();
      }
      const gl = Math.sin(t * 2 + a.ph); if (gl > 0.6) { const u = frac(a.ph * 3), x = e.ax + a.tx * e.L * u, y = e.ay + a.ty * e.L * u; ctx.fillStyle = '#ffffff'; ctx.globalAlpha = (gl - 0.6) * 2.5; ctx.beginPath(); starPath(ctx, x, y - 2, 4, 1, 4, 0); ctx.fill(); }
    }
    if (A.z.length) {
      ctx.globalCompositeOperation = 'lighter';
      for (const a of A.z) {
        const e = a.e; if (!vis(e)) continue;
        const fl = 0.75 + 0.25 * Math.sin(t * 31 + a.ph) * Math.sin(t * 7);
        ctx.strokeStyle = col.laser; ctx.globalAlpha = 0.25 * fl; ctx.lineWidth = 10; ctx.beginPath(); ctx.moveTo(e.ax, e.ay); ctx.lineTo(e.bx, e.by); ctx.stroke();
        ctx.globalAlpha = 0.9 * fl; ctx.lineWidth = 2.5; ctx.stroke(); ctx.strokeStyle = '#ffd0d8'; ctx.lineWidth = 1; ctx.stroke();
      }
      ctx.globalCompositeOperation = 'source-over';
    }
    for (const a of A.v) {
      const e = a.e; if (!vis(e)) continue;
      ctx.fillStyle = col.hole;
      for (let d = 6; d < e.L; d += 16) {
        const s = frac(t * 0.5 + hash1(d * 1.3 + a.ph)), x = e.ax + a.tx * d, y = e.ay + a.ty * d;
        ctx.globalAlpha = 0.6 * (1 - s); ctx.beginPath(); ctx.arc(x + e.nx * s * 14, y + e.ny * s * 14 - s * 4, 1.5 * (1 - s) + 0.5, 0, TAU); ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }
  function drawLiquids(ctx, sc, t, view) {
    if (!sc.liquids.length) return;
    const col = sc.col;
    ctx.save(); ctx.clip(sc.airPath, 'evenodd');
    for (const q of sc.liquids) {
      if (view && (q.xr < view.x0 || q.xl > view.x1 || q.yb < view.y0 || q.L - 60 > view.y1)) continue;
      const x0 = view ? Math.max(q.xl, view.x0 - 20) : q.xl, x1 = view ? Math.min(q.xr, view.x1 + 20) : q.xr;
      const lava = q.k === 'l';
      const wave = (x) => q.L + Math.sin(x * 0.045 + t * (lava ? 1.3 : 2.4)) * (lava ? 1.6 : 2.2) + Math.sin(x * 0.11 - t * 1.7) * 1.1;
      ctx.beginPath(); ctx.moveTo(x0, q.yb);
      for (let x = x0; x < x1; x += 8) ctx.lineTo(x, wave(x));
      ctx.lineTo(x1, wave(x1)); ctx.lineTo(x1, q.yb); ctx.closePath();
      const g = ctx.createLinearGradient(0, q.L, 0, q.yb);
      if (lava) { const dk = sc.cb ? (c) => shade(c, -0.3) : (c) => c; g.addColorStop(0, dk(col.lavaHot)); g.addColorStop(0.35, dk(col.lava)); g.addColorStop(1, dk(col.lavaDeep)); ctx.globalAlpha = 0.97; }
      else { g.addColorStop(0, rgba(col.water, 0.78)); g.addColorStop(1, rgba(col.waterDeep, 0.95)); }
      ctx.fillStyle = g; ctx.fill(); ctx.globalAlpha = 1;
      if (sc.cb) { const pt = cbPattern(ctx, lava ? 'zig' : 'wave'); if (pt) { ctx.fillStyle = pt; ctx.globalAlpha = lava ? 0.75 : 0.6; ctx.fill(); ctx.globalAlpha = 1; } }
      // surface line
      ctx.beginPath(); for (let x = x0; x < x1; x += 8) { if (x === x0) ctx.moveTo(x, wave(x)); else ctx.lineTo(x, wave(x)); }
      ctx.strokeStyle = lava ? '#fff2b0' : col.waterHi; ctx.lineWidth = 2; ctx.globalAlpha = lava ? 0.8 : 0.7; ctx.stroke(); ctx.globalAlpha = 1;
      if (lava) {
        ctx.globalCompositeOperation = 'lighter';
        const gg = ctx.createLinearGradient(0, q.L - 60, 0, q.L);
        gg.addColorStop(0, 'rgba(255,120,20,0)'); gg.addColorStop(1, rgba(col.lava, 0.32 + 0.08 * Math.sin(t * 3)));
        ctx.fillStyle = gg; ctx.fillRect(x0, q.L - 60, x1 - x0, 60);
        ctx.globalCompositeOperation = 'source-over';
        ctx.fillStyle = col.lavaHot;
        const nb = Math.ceil((q.xr - q.xl) / 50);
        for (let k = 0; k < nb; k++) {
          const s = frac(t * 0.45 + hash1(k * 3.7 + q.xl)), bx = q.xl + hash1(k * 9.1 + q.L) * (q.xr - q.xl);
          if (bx < x0 || bx > x1) continue;
          const r = 1.5 + s * 4; ctx.globalAlpha = s < 0.85 ? 0.9 : (1 - s) / 0.15;
          ctx.beginPath(); ctx.arc(bx, wave(bx) + 4 - s * 5, r, 0, TAU); ctx.fill();
        }
        ctx.globalAlpha = 1;
      } else {
        ctx.fillStyle = '#ffffff';
        const nb = Math.ceil((q.xr - q.xl) / 70);
        for (let k = 0; k < nb; k++) {
          const a = Math.sin(t * 2 + k * 2.3); if (a < 0.6) continue;
          const bx = q.xl + hash1(k * 5.3 + q.L) * (q.xr - q.xl); if (bx < x0 || bx > x1) continue;
          ctx.globalAlpha = (a - 0.6) * 2; ctx.fillRect(bx - 4, wave(bx) + 4, 8, 1.6);
        }
        ctx.globalAlpha = 1;
      }
    }
    ctx.restore();
  }

  // ---------------------------------------------------------------- gimmicks
  function inBox(b, v) { return !v || !b || !(b[2] < v.x0 || b[0] > v.x1 || b[3] < v.y0 || b[1] > v.y1); }
  function rotTo(ctx, x, y, a) { ctx.save(); ctx.translate(x, y); ctx.rotate(a); }

  function drawGimmickBack(ctx, sc, g, i, S, tg, t) {
    const col = sc.col;
    switch (g.t) {
      case 'wind': {
        const mag = Math.hypot(g.ax, g.ay || 0) || 1, f = poses().windFactor(g, tg);
        const ux = g.ax / mag, uy = (g.ay || 0) / mag;
        ctx.fillStyle = '#ffffff'; ctx.globalAlpha = 0.05; rrect(ctx, g.x, g.y, g.w, g.h, 12); ctx.fill();
        ctx.save(); ctx.beginPath(); ctx.rect(g.x, g.y, g.w, g.h); ctx.clip();
        ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2; ctx.lineCap = 'round';
        const N = clamp(Math.round(g.w * g.h / 5000), 6, 60), sp = (80 + mag * 0.5) * Math.max(0.3, f), len = 16 + mag * 0.04;
        for (let k = 0; k < N; k++) {
          const h1 = hash1(i * 17 + k), h2 = hash1(k * 7.7 + i * 3);
          const x = g.x + frac(h1 + t * sp * ux / g.w) * g.w, y = g.y + frac(h2 + t * sp * uy / g.h) * g.h;
          ctx.globalAlpha = 0.25 + 0.2 * Math.sin(t * 3 + k);
          ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - ux * len, y - uy * len); ctx.stroke();
        }
        ctx.restore(); ctx.globalAlpha = 0.25; ctx.strokeStyle = '#ffffff'; ctx.setLineDash([6, 8]); ctx.lineWidth = 1.5;
        rrect(ctx, g.x, g.y, g.w, g.h, 12); ctx.stroke(); ctx.setLineDash([]); ctx.globalAlpha = 1;
        // small arrow in the corner
        ctx.save(); ctx.translate(g.x + 22, g.y + 22); ctx.rotate(Math.atan2(uy, ux)); ctx.globalAlpha = 0.6; ctx.fillStyle = '#ffffff';
        ctx.beginPath(); ctx.moveTo(10, 0); ctx.lineTo(-4, -7); ctx.lineTo(-1, 0); ctx.lineTo(-4, 7); ctx.closePath(); ctx.fill(); ctx.restore(); ctx.globalAlpha = 1;
        break;
      }
      case 'fan': {
        const F = fanGeom(g);
        ctx.fillStyle = '#ffffff'; ctx.globalAlpha = 0.06; ctx.fillRect(g.x, g.y, g.w, g.h); ctx.globalAlpha = 1;
        ctx.save(); ctx.beginPath(); ctx.rect(g.x, g.y, g.w, g.h); ctx.clip();
        ctx.translate(F.bx, F.by); ctx.rotate(g.ang);
        ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2; ctx.lineCap = 'round';
        const N = clamp(Math.round(F.ext * F.hw / 900), 8, 50), sp = 160 + (g.a || 800) * 0.25, L2 = F.ext * 2;
        for (let k = 0; k < N; k++) {
          const s = frac(hash1(i * 31 + k) + t * sp / L2), x = s * L2, y = (hash1(k * 7.3 + i) - 0.5) * 2 * F.hw * 0.9 + Math.sin(t * 4 + k) * 3;
          ctx.globalAlpha = 0.45 * Math.sin(s * Math.PI);
          ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 18 + sp * 0.03, y); ctx.stroke();
        }
        ctx.restore(); ctx.globalAlpha = 1;
        break;
      }
      case 'windmill': {
        const gy = groundY(sc.hole, g.x) + 30;
        if (gy > g.y) {
          ctx.fillStyle = col.woodDark;
          ctx.beginPath(); ctx.moveTo(g.x - 9, g.y); ctx.lineTo(g.x + 9, g.y); ctx.lineTo(g.x + 24, gy); ctx.lineTo(g.x - 24, gy); ctx.closePath(); ctx.fill();
          ctx.strokeStyle = shade(col.woodDark, -0.25); ctx.lineWidth = 2; ctx.beginPath();
          for (let y = g.y + 24; y < gy - 10; y += 26) { const k = (y - g.y) / (gy - g.y); ctx.moveTo(g.x - 9 - 15 * k, y); ctx.lineTo(g.x + 9 + 15 * k, y); }
          ctx.stroke();
          ctx.fillStyle = shade(col.woodDark, -0.4); rrect(ctx, g.x - 6, gy - 46, 12, 18, 6); ctx.fill();
        }
        break;
      }
      case 'movplat': {
        ctx.strokeStyle = col.metalDark; ctx.globalAlpha = 0.35; ctx.lineWidth = 2; ctx.setLineDash([4, 6]);
        ctx.beginPath(); ctx.moveTo(g.x + g.w / 2, g.y + g.h / 2); ctx.lineTo(g.x2 + g.w / 2, g.y2 + g.h / 2); ctx.stroke(); ctx.setLineDash([]);
        ctx.fillStyle = col.metalDark; ctx.beginPath(); circ(ctx, g.x + g.w / 2, g.y + g.h / 2, 4); circ(ctx, g.x2 + g.w / 2, g.y2 + g.h / 2, 4); ctx.fill(); ctx.globalAlpha = 1;
        break;
      }
      case 'gate': {
        if (!S.dyn[i]) {
          ctx.strokeStyle = col.danger; ctx.globalAlpha = 0.3; ctx.lineWidth = 2; ctx.setLineDash([3, 7]);
          ctx.beginPath(); ctx.moveTo(g.sx, g.sy); ctx.lineTo(g.x + g.w / 2, g.y + g.h / 2); ctx.stroke(); ctx.setLineDash([]); ctx.globalAlpha = 1;
        }
        break;
      }
      case 'cannon': {
        const a = poses().cannonAngle(g, tg), r = g.r || 20;
        if (g.amp) {
          ctx.fillStyle = col.warn; ctx.globalAlpha = 0.07;
          ctx.beginPath(); ctx.moveTo(g.x, g.y); ctx.arc(g.x, g.y, r * 4.5, g.ang - g.amp, g.ang + g.amp); ctx.closePath(); ctx.fill();
        }
        ctx.strokeStyle = col.warn; ctx.globalAlpha = 0.45; ctx.lineWidth = 2; ctx.setLineDash([4, 6]); ctx.lineDashOffset = -t * 30;
        ctx.beginPath(); ctx.moveTo(g.x + Math.cos(a) * r * 2.2, g.y + Math.sin(a) * r * 2.2); ctx.lineTo(g.x + Math.cos(a) * r * 4.5, g.y + Math.sin(a) * r * 4.5); ctx.stroke();
        ctx.setLineDash([]); ctx.lineDashOffset = 0; ctx.globalAlpha = 1;
        break;
      }
      case 'lowgrav': case 'antigrav': {
        const anti = g.t === 'antigrav' || g.g < 0, c = anti ? col.antigrav : col.lowgrav;
        ctx.fillStyle = c; ctx.globalAlpha = 0.11; rrect(ctx, g.x, g.y, g.w, g.h, 10); ctx.fill();
        ctx.globalAlpha = 0.45; ctx.strokeStyle = c; ctx.lineWidth = 2; ctx.setLineDash([8, 6]); ctx.lineDashOffset = -t * 12; ctx.stroke(); ctx.setLineDash([]); ctx.lineDashOffset = 0;
        const N = clamp(Math.round(g.w * g.h / 4000), 6, 60), sp = anti ? 45 : 14;
        ctx.fillStyle = c;
        for (let k = 0; k < N; k++) {
          const s = frac(hash1(k * 3.1 + i) + t * sp / g.h);
          const x = g.x + 6 + hash1(i * 13 + k) * (g.w - 12) + Math.sin(t * 1.3 + k) * 4, y = g.y + g.h - s * g.h;
          ctx.globalAlpha = 0.7 * Math.sin(s * Math.PI);
          ctx.beginPath(); ctx.arc(x, y, 1.5 + hash1(k) * 2, 0, TAU); ctx.fill();
        }
        if (anti) {
          ctx.globalAlpha = 0.18; ctx.strokeStyle = c; ctx.lineWidth = 6; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
          const cx = g.x + g.w / 2, cy = g.y + g.h / 2, s = Math.min(g.w, g.h) * 0.12, o = frac(t * 0.8) * s;
          ctx.beginPath(); ctx.moveTo(cx - s, cy - o + s * 0.5); ctx.lineTo(cx, cy - o - s * 0.5); ctx.lineTo(cx + s, cy - o + s * 0.5);
          ctx.moveTo(cx - s, cy - o + s * 1.5); ctx.lineTo(cx, cy - o + s * 0.5); ctx.lineTo(cx + s, cy - o + s * 1.5); ctx.stroke();
        }
        ctx.globalAlpha = 1;
        break;
      }
      case 'gwell': {
        const att = g.k > 0, c = att ? col.attract : col.repel;
        ctx.strokeStyle = c; ctx.globalAlpha = 0.18; ctx.lineWidth = 1.5; ctx.setLineDash([5, 7]);
        ctx.beginPath(); ctx.arc(g.x, g.y, g.r, 0, TAU); ctx.stroke(); ctx.setLineDash([]);
        ctx.fillStyle = c; ctx.globalAlpha = 0.06; ctx.fill();
        ctx.lineWidth = 2.5;
        for (let k = 0; k < 4; k++) {
          const s = frac(t * 0.5 + k / 4), rr = att ? g.r * (1 - s) : g.r * s;
          ctx.globalAlpha = 0.4 * Math.sin(s * Math.PI); ctx.beginPath(); ctx.arc(g.x, g.y, Math.max(1, rr), 0, TAU); ctx.stroke();
        }
        // spiral motes
        ctx.fillStyle = c;
        for (let k = 0; k < 10; k++) {
          const s = frac(t * 0.35 + k / 10), d = (att ? 1 - s : s) * g.r, a = k * 2.4 + (att ? s : -s) * 3;
          ctx.globalAlpha = 0.6 * Math.sin(s * Math.PI); ctx.beginPath(); ctx.arc(g.x + Math.cos(a) * d, g.y + Math.sin(a) * d, 2, 0, TAU); ctx.fill();
        }
        ctx.globalAlpha = 1;
        const cr = 10 + Math.sin(t * 4) * 1.5;
        ctx.fillStyle = att ? '#160b2e' : shade(c, 0.4); ctx.beginPath(); ctx.arc(g.x, g.y, cr, 0, TAU); ctx.fill();
        ctx.strokeStyle = c; ctx.lineWidth = 3; ctx.stroke();
        break;
      }
      default: drawNewBack(ctx, sc, g, i, S, tg, t);
    }
  }
  function fanGeom(g) {
    const dx = Math.cos(g.ang), dy = Math.sin(g.ang), cx = g.x + g.w / 2, cy = g.y + g.h / 2;
    const ext = Math.abs(dx) * g.w / 2 + Math.abs(dy) * g.h / 2, hw = Math.abs(dy) * g.w / 2 + Math.abs(dx) * g.h / 2;
    return { bx: cx - dx * ext, by: cy - dy * ext, ext, hw };
  }

  function drawGimmickFront(ctx, sc, g, i, S, tg, t, dt, R) {
    const col = sc.col, P = poses();
    switch (g.t) {
      case 'fan': {
        const F = fanGeom(g), hw = Math.min(F.hw, 80);
        rotTo(ctx, F.bx, F.by, g.ang);
        ctx.fillStyle = col.metalDark; rrect(ctx, -18, -hw - 5, 16, hw * 2 + 10, 4); ctx.fill();
        ctx.fillStyle = col.metal; rrect(ctx, -6, -hw - 6, 8, hw * 2 + 12, 3); ctx.fill();
        const ph = t * 16;
        ctx.fillStyle = col.metalHi;
        for (let k = 0; k < 3; k++) {
          const c = Math.cos(ph + k * TAU / 3), yy = hw * 0.48 * c;
          ctx.globalAlpha = 0.55 + 0.45 * Math.abs(Math.sin(ph + k * TAU / 3));
          ctx.beginPath(); ctx.ellipse(6, yy, 3.5, Math.max(1, Math.abs(yy)), 0, 0, TAU); ctx.fill();
        }
        ctx.globalAlpha = 1; ctx.fillStyle = col.metalDark; ctx.beginPath(); ctx.arc(6, 0, 5, 0, TAU); ctx.fill();
        ctx.fillStyle = col.warn; ctx.fillRect(-18, -hw - 5, 4, hw * 2 + 10);
        ctx.restore();
        break;
      }
      case 'windmill': {
        const a0 = P.angle(g, tg);
        for (let k = 0; k < g.n; k++) {
          const a = a0 + TAU * k / g.n;
          rotTo(ctx, g.x, g.y, a);
          ctx.fillStyle = col.wood; rrect(ctx, 0, -5, g.L + 1, 10, 4); ctx.fill();
          ctx.strokeStyle = col.woodDark; ctx.lineWidth = 1.5; ctx.stroke();
          ctx.beginPath(); for (let d = 16; d < g.L - 4; d += 14) { ctx.moveTo(d, -5); ctx.lineTo(d, 5); } ctx.stroke();
          ctx.fillStyle = col.woodHi; ctx.fillRect(2, -4, g.L - 4, 2);
          ctx.restore();
        }
        ctx.fillStyle = col.metalDark; ctx.beginPath(); ctx.arc(g.x, g.y, 10, 0, TAU); ctx.fill();
        ctx.fillStyle = col.metalHi; ctx.beginPath(); ctx.arc(g.x, g.y, 4, 0, TAU); ctx.fill();
        break;
      }
      case 'movplat': {
        const p = P.movplat(g, tg);
        platBody(ctx, col, p[0], p[1], g.w, g.h, col.surf.f);
        break;
      }
      case 'rotplat': {
        const a = P.angle(g, tg);
        rotTo(ctx, g.x, g.y, a);
        ctx.fillStyle = col.metalDark; rrect(ctx, -g.L / 2 - 1, -7, g.L + 2, 14, 6); ctx.fill();
        ctx.fillStyle = col.surf.f.c; rrect(ctx, -g.L / 2, -6, g.L, 12, 5); ctx.fill();
        ctx.fillStyle = col.surf.f.hi; ctx.fillRect(-g.L / 2 + 4, -5, g.L - 8, 2); ctx.fillRect(-g.L / 2 + 4, 3, g.L - 8, 2);
        ctx.restore();
        ctx.fillStyle = col.metal; ctx.beginPath(); ctx.arc(g.x, g.y, 5, 0, TAU); ctx.fill(); ctx.strokeStyle = col.metalDark; ctx.lineWidth = 2; ctx.stroke();
        break;
      }
      case 'pad': {
        const h = sc.padHit[i] || 0; if (h) sc.padHit[i] = Math.max(0, h - dt * 3);
        const off = -Math.sin(h * Math.PI) * 5 * h + Math.sin(t * 3 + i) * 0.4;
        rotTo(ctx, g.x, g.y, g.ang);
        const L = g.L;
        ctx.fillStyle = col.metalDark; rrect(ctx, -13, -L / 2, 5, L, 2); ctx.fill();
        ctx.strokeStyle = col.metal; ctx.lineWidth = 2; ctx.beginPath();
        const top = -3 + off;
        for (const yy of [-L / 3, 0, L / 3]) {
          ctx.moveTo(-8, yy);
          for (let z = 1; z <= 4; z++) ctx.lineTo(-8 + (top + 8) * z / 4, yy + (z & 1 ? 4 : -4));
          ctx.lineTo(top, yy);
        }
        ctx.stroke();
        ctx.fillStyle = col.pink; rrect(ctx, top, -L / 2, 6, L, 3); ctx.fill();
        ctx.fillStyle = col.pinkHi; for (let y = -L / 2 + 4; y < L / 2 - 4; y += 10) ctx.fillRect(top + 3.5, y, 2, 5);
        ctx.restore();
        break;
      }
      case 'teleport': {
        const c = sc.teleCol[i] || col.tele[0], r = g.r || 22;
        swirl(ctx, g.x, g.y, r, c, t, 1); swirl(ctx, g.x2, g.y2, r, c, t, -1);
        break;
      }
      case 'portal': {
        const r = g.r || 22;
        portalRing(ctx, g.x, g.y, r, col.portalA, g.a, t); portalRing(ctx, g.x2, g.y2, r, col.portalB, g.a2, t);
        break;
      }
      case 'conveyor': {
        const dx = g.x2 - g.x, dy = g.y2 - g.y, L = Math.hypot(dx, dy) || 1, sg = g.v >= 0 ? 1 : -1;
        rotTo(ctx, g.x, g.y, Math.atan2(dy, dx));
        ctx.fillStyle = col.metalDark; rrect(ctx, -8, -8, L + 16, 16, 8); ctx.fill();
        ctx.fillStyle = shade(col.metalDark, 0.15); rrect(ctx, -4, -5, L + 8, 10, 5); ctx.fill();
        ctx.save(); ctx.beginPath(); ctx.rect(2, -6, L - 4, 12); ctx.clip();
        const off = frac(t * Math.abs(g.v) / 18) * 18 * sg;
        ctx.strokeStyle = col.warn; ctx.lineWidth = 2.2; ctx.lineJoin = 'round'; ctx.beginPath();
        for (let s = -18 + off; s < L + 18; s += 18) { ctx.moveTo(s - 3 * sg, -3.5); ctx.lineTo(s + 3 * sg, 0); ctx.lineTo(s - 3 * sg, 3.5); }
        ctx.stroke(); ctx.restore();
        for (const x of [0, L]) {
          ctx.fillStyle = col.metal; ctx.beginPath(); ctx.arc(x, 0, 6, 0, TAU); ctx.fill();
          const ra = t * g.v / 6; ctx.strokeStyle = col.metalDark; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(x - Math.cos(ra) * 5, -Math.sin(ra) * 5); ctx.lineTo(x + Math.cos(ra) * 5, Math.sin(ra) * 5); ctx.stroke();
        }
        ctx.restore();
        break;
      }
      case 'cannon': {
        const a = P.cannonAngle(g, tg), r = g.r || 20, loaded = S.cannon === i;
        if (loaded) { ctx.fillStyle = col.lavaHot; ctx.globalAlpha = 0.25 + 0.2 * Math.sin(t * 25); ctx.beginPath(); ctx.arc(g.x, g.y, r * 1.5, 0, TAU); ctx.fill(); ctx.globalAlpha = 1; }
        rotTo(ctx, g.x, g.y, a);
        ctx.fillStyle = col.metalDark; rrect(ctx, -2, -r * 0.6, r * 2.0, r * 1.2, 4); ctx.fill();
        ctx.fillStyle = col.metal; rrect(ctx, 0, -r * 0.48, r * 1.9, r * 0.96, 3); ctx.fill();
        ctx.fillStyle = col.metalHi; ctx.fillRect(2, -r * 0.4, r * 1.7, r * 0.18);
        ctx.fillStyle = col.metalDark; rrect(ctx, r * 1.6, -r * 0.68, r * 0.45, r * 1.36, 3); ctx.fill();
        ctx.restore();
        ctx.fillStyle = col.metalDark; ctx.beginPath(); ctx.arc(g.x, g.y, r, 0, TAU); ctx.fill();
        ctx.strokeStyle = col.metal; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(g.x, g.y, r - 3, 0, TAU); ctx.stroke();
        ctx.fillStyle = loaded ? col.lavaHot : col.accent; ctx.beginPath(); ctx.arc(g.x, g.y, r * 0.42, 0, TAU); ctx.fill();
        break;
      }
      case 'bumper': {
        const h = sc.hit[i] || 0; if (h) sc.hit[i] = Math.max(0, h - dt * 4);
        const r = g.r * (1 + h * 0.22 + 0.03 * Math.sin(t * 3 + i));
        if (h > 0) { ctx.strokeStyle = col.bumper; ctx.globalAlpha = h; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(g.x, g.y, r + (1 - h) * 22, 0, TAU); ctx.stroke(); ctx.globalAlpha = 1; }
        ctx.fillStyle = shade(col.bumper, -0.35); ctx.beginPath(); ctx.arc(g.x, g.y + 2, r, 0, TAU); ctx.fill();
        ctx.fillStyle = h > 0.5 ? shade(col.bumper, 0.4) : col.bumper; ctx.beginPath(); ctx.arc(g.x, g.y, r, 0, TAU); ctx.fill();
        ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(g.x, g.y, r * 0.64, 0, TAU); ctx.fill();
        ctx.fillStyle = col.bumper; ctx.beginPath(); ctx.arc(g.x, g.y, r * 0.4, 0, TAU); ctx.fill();
        ctx.fillStyle = '#ffffff'; ctx.globalAlpha = 0.6; ctx.beginPath(); ctx.ellipse(g.x - r * 0.35, g.y - r * 0.5, r * 0.25, r * 0.13, -0.6, 0, TAU); ctx.fill(); ctx.globalAlpha = 1;
        break;
      }
      case 'breakable': {
        if (S.dyn[i]) break;
        ctx.fillStyle = col.brick; ctx.fillRect(g.x, g.y, g.w, g.h);
        ctx.save(); ctx.beginPath(); ctx.rect(g.x, g.y, g.w, g.h); ctx.clip();
        ctx.strokeStyle = shade(col.brick, -0.35); ctx.lineWidth = 1.5; ctx.beginPath();
        let row = 0;
        for (let y = g.y + 10; y < g.y + g.h; y += 10, row++) { ctx.moveTo(g.x, y); ctx.lineTo(g.x + g.w, y); }
        row = 0;
        for (let y = g.y; y < g.y + g.h; y += 10, row++) for (let x = g.x + (row & 1 ? 10 : 0); x < g.x + g.w; x += 20) { ctx.moveTo(x, y); ctx.lineTo(x, Math.min(y + 10, g.y + g.h)); }
        ctx.stroke();
        ctx.strokeStyle = shade(col.brick, -0.55); ctx.lineWidth = 1.2; ctx.stroke(sc.cracks[i]);
        ctx.fillStyle = shade(col.brick, 0.2); ctx.fillRect(g.x, g.y, g.w, 2);
        ctx.restore();
        ctx.strokeStyle = shade(col.brick, -0.5); ctx.lineWidth = 2; ctx.strokeRect(g.x, g.y, g.w, g.h);
        break;
      }
      case 'gate': {
        const tgt = S.dyn[i] ? 1 : 0; let a = sc.gateAmt[i] || 0;
        a += clamp(tgt - a, -dt * 2.5, dt * 2.5); sc.gateAmt[i] = a;
        const vh = g.h * (1 - a);
        if (vh > 0.5) {
          ctx.fillStyle = col.metalDark; ctx.globalAlpha = 0.35; ctx.fillRect(g.x, g.y, g.w, vh); ctx.globalAlpha = 1;
          ctx.fillStyle = col.metal;
          for (let x = g.x + 2; x < g.x + g.w - 1; x += 7) ctx.fillRect(x, g.y, 3.5, vh);
          ctx.fillStyle = col.metalDark; ctx.fillRect(g.x - 1, g.y + vh - 6, g.w + 2, 6);
          ctx.fillStyle = col.warn; for (let x = g.x; x < g.x + g.w - 3; x += 8) ctx.fillRect(x, g.y + vh - 5, 4, 4);
        }
        ctx.fillStyle = col.metalDark; ctx.fillRect(g.x - 3, g.y - 7, g.w + 6, 7);
        ctx.fillStyle = S.dyn[i] ? col.ok : col.danger; ctx.beginPath(); ctx.arc(g.x + g.w / 2, g.y - 3.5, 2.5, 0, TAU); ctx.fill();
        // switch
        const on = !!S.dyn[i];
        if (sc.cb) { padlock(ctx, g.x + g.w / 2, g.y - 20, 9, on); padlock(ctx, g.sx, g.sy - 22, 7, on); }
        ctx.fillStyle = col.metalDark; rrect(ctx, g.sx - 10, g.sy + 3, 20, 7, 2); ctx.fill();
        if (on) { ctx.fillStyle = col.ok; rrect(ctx, g.sx - 7, g.sy, 14, 4, 2); ctx.fill(); }
        else {
          ctx.strokeStyle = col.danger; ctx.globalAlpha = 0.35 + 0.25 * Math.sin(t * 5); ctx.lineWidth = 2; ctx.setLineDash([3, 4]);
          ctx.beginPath(); ctx.arc(g.sx, g.sy, 20, 0, TAU); ctx.stroke(); ctx.setLineDash([]); ctx.globalAlpha = 1;
          ctx.fillStyle = col.danger; ctx.beginPath(); ctx.arc(g.sx, g.sy + 3, 8, Math.PI, TAU); ctx.closePath(); ctx.fill();
          ctx.fillStyle = '#ffffff'; ctx.globalAlpha = 0.5; ctx.beginPath(); ctx.arc(g.sx - 3, g.sy - 1, 2, 0, TAU); ctx.fill(); ctx.globalAlpha = 1;
        }
        break;
      }
      case 'door': {
        const amt = P.doorOpenAmt(g, tg), closed = P.doorClosed(g, tg), vh = g.h * (1 - amt);
        ctx.fillStyle = col.metalDark; ctx.globalAlpha = 0.25; ctx.fillRect(g.x, g.y, g.w, g.h); ctx.globalAlpha = 1;
        if (vh > 0.5) {
          ctx.fillStyle = col.metal; ctx.fillRect(g.x, g.y, g.w, vh);
          ctx.strokeStyle = col.metalDark; ctx.lineWidth = 1.5; ctx.beginPath();
          for (let y = g.y + 12; y < g.y + vh - 4; y += 12) { ctx.moveTo(g.x + 2, y); ctx.lineTo(g.x + g.w - 2, y); }
          ctx.stroke();
          ctx.fillStyle = col.warn; ctx.fillRect(g.x, g.y + vh - 5, g.w, 5);
          ctx.fillStyle = '#222'; for (let x = g.x + 2; x < g.x + g.w - 2; x += 8) ctx.fillRect(x, g.y + vh - 5, 3, 5);
        }
        ctx.fillStyle = col.metalDark; ctx.fillRect(g.x - 4, g.y - 8, g.w + 8, 8);
        ctx.fillStyle = closed ? col.danger : col.ok; ctx.beginPath(); ctx.arc(g.x + g.w / 2, g.y - 4, 2.8, 0, TAU); ctx.fill();
        break;
      }
      case 'oneway': {
        const dx = g.x2 - g.x, dy = g.y2 - g.y, L = Math.hypot(dx, dy) || 1, tx = dx / L, ty = dy / L;
        let nx = ty, ny = -tx; if (ny > 0) { nx = -nx; ny = -ny; }
        ctx.lineCap = 'butt'; ctx.strokeStyle = col.woodDark; ctx.lineWidth = 8; ctx.beginPath(); ctx.moveTo(g.x, g.y); ctx.lineTo(g.x2, g.y2); ctx.stroke();
        ctx.strokeStyle = col.wood; ctx.lineWidth = 6; ctx.setLineDash([12, 5]); ctx.stroke(); ctx.setLineDash([]);
        ctx.strokeStyle = col.woodHi; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(g.x + nx * 2.5, g.y + ny * 2.5); ctx.lineTo(g.x2 + nx * 2.5, g.y2 + ny * 2.5); ctx.stroke();
        ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        const bob = Math.sin(t * 3) * 2;
        for (let d = 20; d < L - 10; d += 40) {
          const cx = g.x + tx * d + nx * (12 + bob), cy = g.y + ty * d + ny * (12 + bob);
          ctx.globalAlpha = 0.6; ctx.beginPath(); ctx.moveTo(cx - tx * 4 - nx * 2, cy - ty * 4 - ny * 2); ctx.lineTo(cx + nx * 3, cy + ny * 3); ctx.lineTo(cx + tx * 4 - nx * 2, cy + ty * 4 - ny * 2); ctx.stroke();
        }
        ctx.globalAlpha = 1;
        break;
      }
      case 'vanish': {
        const on = P.vanishOn(g, tg), left = P.vanishLeft(g, tg);
        if (on) {
          let a = 1; if (left < 0.6) a = 0.25 + 0.75 * (0.5 + 0.5 * Math.cos(t * TAU * (4 + (0.6 - left) * 12)));
          ctx.globalAlpha = a;
          ctx.fillStyle = col.vanish; ctx.globalAlpha = a * 0.85; rrect(ctx, g.x, g.y, g.w, g.h, 3); ctx.fill();
          ctx.globalAlpha = a; ctx.fillStyle = col.surf.f.c; ctx.fillRect(g.x, g.y, g.w, Math.min(4, g.h));
          ctx.strokeStyle = shade(col.vanish, -0.35); ctx.lineWidth = 1.5; rrect(ctx, g.x, g.y, g.w, g.h, 3); ctx.stroke();
          ctx.fillStyle = '#ffffff'; ctx.globalAlpha = a * 0.5; ctx.fillRect(g.x + 4, g.y + 6, Math.max(0, g.w * 0.3), 2);
        } else {
          ctx.globalAlpha = 0.28; ctx.strokeStyle = col.vanish; ctx.lineWidth = 1.5; ctx.setLineDash([4, 4]); rrect(ctx, g.x, g.y, g.w, g.h, 3); ctx.stroke(); ctx.setLineDash([]);
        }
        ctx.globalAlpha = 1;
        break;
      }
      case 'sticky': {
        ctx.fillStyle = shade(col.goo, -0.25); rrect(ctx, g.x, g.y, g.w, g.h, 7); ctx.fill();
        ctx.fillStyle = col.goo; rrect(ctx, g.x + 1.5, g.y + 1.5, g.w - 3, g.h - 3, 6); ctx.fill();
        ctx.beginPath();
        for (let x = g.x + 6; x < g.x + g.w - 4; x += 10) circ(ctx, x, g.y + 1, 3 + 1.5 * Math.sin(t * 2.4 + x * 0.3));
        for (let k = 0; k < Math.max(1, g.w / 18); k++) {
          const x = g.x + 5 + hash1(i * 5 + k) * (g.w - 10), s = frac(t * 0.4 + hash1(k + i)), L = 3 + s * 10;
          ctx.moveTo(x - 2.5, g.y + g.h - 2); ctx.quadraticCurveTo(x, g.y + g.h + L * 0.6, x, g.y + g.h + L); ctx.quadraticCurveTo(x, g.y + g.h + L * 0.6, x + 2.5, g.y + g.h - 2); ctx.closePath();
          circ(ctx, x, g.y + g.h + L, 1.5 + s * 1.5);
        }
        ctx.fill();
        ctx.fillStyle = col.gooHi; ctx.globalAlpha = 0.6; ctx.fillRect(g.x + 5, g.y + 5, Math.max(0, g.w * 0.35), 3); ctx.fillRect(g.x + 5, g.y + 10, 3, Math.max(0, g.h * 0.3)); ctx.globalAlpha = 1;
        ctx.fillStyle = col.gooGreen; ctx.globalAlpha = 0.5; ctx.beginPath();
        for (let k = 0; k < 3; k++) circ(ctx, g.x + g.w * (0.3 + k * 0.2), g.y + g.h * (0.5 + 0.2 * Math.sin(t + k * 2)), 2 + k);
        ctx.fill(); ctx.globalAlpha = 1;
        break;
      }
      case 'ricochet': {
        ctx.lineCap = 'round';
        ctx.strokeStyle = col.metalDark; ctx.lineWidth = 13; ctx.beginPath(); ctx.moveTo(g.x, g.y); ctx.lineTo(g.x2, g.y2); ctx.stroke();
        ctx.strokeStyle = col.surf.q.c; ctx.lineWidth = 9; ctx.stroke();
        ctx.lineCap = 'butt'; ctx.strokeStyle = shade(col.surf.q.c, -0.4); ctx.setLineDash([5, 7]); ctx.lineDashOffset = -t * 20; ctx.stroke(); ctx.setLineDash([]); ctx.lineDashOffset = 0;
        const s = frac(t * 0.4 + i * 0.3);
        if (s < 0.4) {
          const k = s / 0.4, gx = g.x + (g.x2 - g.x) * k, gy = g.y + (g.y2 - g.y) * k;
          ctx.fillStyle = '#ffffff'; ctx.globalAlpha = Math.sin(k * Math.PI); ctx.beginPath(); starPath(ctx, gx, gy, 7, 1.5, 4, 0); ctx.fill(); ctx.globalAlpha = 1;
        }
        break;
      }
      case 'spikes': {
        const sp = sc.spikePaths[i];
        ctx.lineCap = 'round'; ctx.strokeStyle = col.metalDark; ctx.lineWidth = 7; ctx.beginPath(); ctx.moveTo(g.x, g.y); ctx.lineTo(g.x2, g.y2); ctx.stroke();
        ctx.fillStyle = col.metalHi; ctx.fill(sp.p); ctx.strokeStyle = col.metalDark; ctx.lineWidth = 1.2; ctx.lineJoin = 'round'; ctx.stroke(sp.p);
        ctx.strokeStyle = col.danger; ctx.lineWidth = 2; ctx.globalAlpha = 0.6; ctx.beginPath(); ctx.moveTo(g.x, g.y); ctx.lineTo(g.x2, g.y2); ctx.stroke(); ctx.globalAlpha = 1;
        break;
      }
      case 'crumble': {
        const st = S.dyn[i];
        const gone = st === -1 || (st > 0 && S.t >= st);
        if (gone) { if (!sc.gone[i]) { sc.gone[i] = 1; if (R) R._debris(g, col.crumble); } break; }
        sc.gone[i] = 0;
        let ox = 0, oy = 0;
        if (st > 0) {
          const k = clamp(1 - (st - S.t) / (g.delay || 0.6), 0, 1);
          ox = Math.sin(t * 70) * 2.5 * k; oy = Math.cos(t * 53) * 1.2 * k;
          if (R && Math.random() < dt * 14) R.spawn('dust', g.x + Math.random() * g.w, g.y + g.h, { m: 0.3 });
        }
        ctx.save(); ctx.translate(ox, oy);
        ctx.fillStyle = col.crumble; ctx.beginPath();
        ctx.moveTo(g.x, g.y); ctx.lineTo(g.x + g.w, g.y); ctx.lineTo(g.x + g.w, g.y + g.h * 0.6);
        const n = Math.max(2, Math.round(g.w / 14));
        for (let k = n; k >= 0; k--) ctx.lineTo(g.x + g.w * k / n, g.y + g.h * (k & 1 ? 1 : 0.75));
        ctx.closePath(); ctx.fill();
        ctx.strokeStyle = shade(col.crumble, -0.45); ctx.lineWidth = 1.3; ctx.stroke(sc.cracks[i]);
        ctx.fillStyle = col.surf.r.c; ctx.fillRect(g.x, g.y - 1, g.w, 4);
        ctx.restore();
        break;
      }
      default: drawNewFront(ctx, sc, g, i, S, tg, t, dt, R);
    }
    ctx.globalAlpha = 1; ctx.setLineDash([]); ctx.lineDashOffset = 0; ctx.globalCompositeOperation = 'source-over';
  }
  // ---------------------------------------------------------------- new gimmicks (v8 physics)
  function segInfo(ax, ay, bx, by) {
    const dx = bx - ax, dy = by - ay, L = Math.hypot(dx, dy) || 1, tx = dx / L, ty = dy / L;
    let nx = ty, ny = -tx; if (ny > 0) { nx = -nx; ny = -ny; }
    return { dx, dy, L, tx, ty, nx, ny, a: Math.atan2(dy, dx) };
  }
  // rotate into a frame where the segment runs along +x and "up" (outward normal) is -y
  function segFrame(ctx, ax, ay, bx, by) {
    if (bx < ax) { const tx = ax, ty = ay; ax = bx; ay = by; bx = tx; by = ty; }
    const L = Math.hypot(bx - ax, by - ay) || 1;
    rotTo(ctx, ax, ay, Math.atan2(by - ay, bx - ax));
    return L;
  }
  function chevrons(ctx, L, off, gap, h, c, alpha) {
    ctx.strokeStyle = c; ctx.lineWidth = 2.4; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    for (let s = -gap + off; s < L + gap; s += gap) {
      if (s < 2 || s > L - 2) continue;
      ctx.globalAlpha = alpha * (0.45 + 0.55 * Math.sin(Math.PI * s / L));
      ctx.beginPath(); ctx.moveTo(s - h * 0.7, -h); ctx.lineTo(s + h * 0.3, 0); ctx.lineTo(s - h * 0.7, h); ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }
  function zoneBox(ctx, g, c, fillA, t, dash) {
    ctx.fillStyle = c; ctx.globalAlpha = fillA; rrect(ctx, g.x, g.y, g.w, g.h, 10); ctx.fill();
    ctx.globalAlpha = 0.5; ctx.strokeStyle = c; ctx.lineWidth = 2; ctx.setLineDash(dash || [8, 6]); ctx.lineDashOffset = -t * 12; ctx.stroke();
    ctx.setLineDash([]); ctx.lineDashOffset = 0; ctx.globalAlpha = 1;
  }
  function qsStrip(ctx, col, ax, ay, bx, by, t) {
    const L = segFrame(ctx, ax, ay, bx, by);
    ctx.fillStyle = col.quickDk; rrect(ctx, -2, -4, L + 4, 16, 6); ctx.fill();
    ctx.fillStyle = col.quick; rrect(ctx, 0, -3, L, 13, 5); ctx.fill();
    ctx.strokeStyle = col.quickDk; ctx.lineWidth = 1.3; ctx.globalAlpha = 0.8;
    for (let d = 9; d < L - 6; d += 18) {
      const r0 = t * (1.6 + hash1(d) * 0.8) + d; ctx.beginPath();
      for (let k = 0; k <= 14; k++) { const u = k / 14, an = r0 + u * 9, rr = 0.8 + u * 4.2, x = d + Math.cos(an) * rr, y = 3.5 + Math.sin(an) * rr * 0.55; if (k === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y); }
      ctx.stroke();
    }
    ctx.globalAlpha = 0.5; ctx.fillStyle = shade(col.quick, 0.3); ctx.fillRect(2, -3, L - 4, 1.6);
    ctx.globalAlpha = 1; ctx.restore();
  }
  function cloudStrip(ctx, col, ax, ay, bx, by, t, seed) {
    const L = segFrame(ctx, ax, ay, bx, by);
    const bob = Math.sin(t * 1.4 + seed) * 1;
    ctx.translate(0, bob);
    ctx.fillStyle = col.cloudDk; ctx.beginPath();
    for (let d = 0; d <= L; d += 11) circ(ctx, d, 4 + hash1(d + seed) * 2, 7 + hash1(d * 1.7 + seed) * 3);
    ctx.fill();
    ctx.fillStyle = col.cloud; ctx.beginPath();
    for (let d = 0; d <= L; d += 11) circ(ctx, d, 1 - hash1(d * 0.7 + seed) * 2, 6 + hash1(d * 2.3 + seed) * 3);
    ctx.fill();
    ctx.fillStyle = '#ffffff'; ctx.globalAlpha = 0.9; ctx.beginPath();
    for (let d = 6; d <= L - 4; d += 22) circ(ctx, d, -3, 2.2);
    ctx.fill(); ctx.globalAlpha = 1;
    ctx.restore();
  }
  function fakeCup(ctx, sc, x, y, w) {
    ctx.fillStyle = '#0c0b12';
    ctx.beginPath(); ctx.moveTo(x - w / 2, y - 2); ctx.lineTo(x - w / 2, y + 10); ctx.quadraticCurveTo(x - w / 2, y + 15, x - w / 2 + 5, y + 15);
    ctx.lineTo(x + w / 2 - 5, y + 15); ctx.quadraticCurveTo(x + w / 2, y + 15, x + w / 2, y + 10); ctx.lineTo(x + w / 2, y - 2); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#2a2833'; ctx.fillRect(x - w / 2, y - 2, w, 3);
    ctx.fillStyle = '#ffffff'; ctx.globalAlpha = 0.85; ctx.fillRect(x - w / 2 - 2, y - 2.5, 3, 2.5); ctx.fillRect(x + w / 2 - 1, y - 2.5, 3, 2.5); ctx.globalAlpha = 1;
  }
  function blockSolid(ctx, x, y, w, h, c) {
    ctx.fillStyle = shade(c, -0.4); rrect(ctx, x, y, w, h, 3); ctx.fill();
    ctx.fillStyle = c; rrect(ctx, x + 2, y + 2, w - 4, h - 4, 2); ctx.fill();
    ctx.fillStyle = shade(c, 0.35); ctx.fillRect(x + 3, y + 3, w - 6, 2);
    ctx.fillStyle = shade(c, -0.2); ctx.fillRect(x + 3, y + h - 5, w - 6, 2);
  }
  // padlock icon (colour-blind state tell): open = shackle lifted & swung aside
  function padlock(ctx, x, y, s, open) {
    ctx.save(); ctx.translate(x, y); ctx.scale(s / 10, s / 10);
    ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.beginPath(); ctx.arc(0, 0, 11, 0, TAU); ctx.fill();
    ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2; ctx.lineCap = 'round'; ctx.beginPath();
    if (open) { ctx.moveTo(-3.5, -1); ctx.lineTo(-3.5, -6); ctx.arc(0, -6, 3.5, Math.PI, TAU); ctx.lineTo(3.5, -5); }
    else { ctx.moveTo(-3.5, -1); ctx.lineTo(-3.5, -4); ctx.arc(0, -4, 3.5, Math.PI, TAU); ctx.lineTo(3.5, -1); }
    ctx.stroke();
    ctx.fillStyle = '#ffffff'; rrect(ctx, -5.5, -1.5, 11, 8.5, 1.5); ctx.fill();
    ctx.fillStyle = '#222'; ctx.fillRect(-0.9, 1, 1.8, 3.5);
    ctx.restore();
  }
  function blockGhost(ctx, x, y, w, h, c, t) {
    ctx.fillStyle = c; ctx.globalAlpha = 0.08; rrect(ctx, x, y, w, h, 3); ctx.fill();
    ctx.globalAlpha = 0.55; ctx.strokeStyle = c; ctx.lineWidth = 1.6; ctx.setLineDash([5, 5]); ctx.lineDashOffset = -t * 10; ctx.stroke();
    ctx.setLineDash([]); ctx.lineDashOffset = 0; ctx.globalAlpha = 1;
  }

  function drawNewBack(ctx, sc, g, i, S, tg, t) {
    const col = sc.col, P = poses();
    switch (g.t) {
      case 'magnet': {
        const s = segInfo(g.x, g.y, g.x2, g.y2), r = g.r || 120;
        rotTo(ctx, g.x, g.y, s.a);
        ctx.strokeStyle = col.magS; ctx.lineWidth = 2;
        for (let k = 0; k < 4; k++) {
          const u = frac(t * 0.55 + k / 4), rr = r * (1 - u) + 8;
          ctx.globalAlpha = 0.35 * Math.sin(u * Math.PI); ctx.setLineDash([6, 6]); ctx.lineDashOffset = t * 30;
          rrect(ctx, -rr, -rr, s.L + rr * 2, rr * 2, rr); ctx.stroke();
        }
        ctx.setLineDash([]); ctx.lineDashOffset = 0;
        ctx.fillStyle = col.magS; ctx.globalAlpha = 0.05; rrect(ctx, -r, -r, s.L + 2 * r, 2 * r, r); ctx.fill();
        ctx.globalAlpha = 1; ctx.restore();
        break;
      }
      case 'sidegrav': {
        const c = col.sidegrav, L = Math.hypot(g.gx, g.gy) || 1, ux = g.gx / L, uy = g.gy / L, a = Math.atan2(uy, ux);
        zoneBox(ctx, g, c, 0.1, t);
        ctx.save(); ctx.beginPath(); ctx.rect(g.x, g.y, g.w, g.h); ctx.clip();
        ctx.strokeStyle = c; ctx.lineWidth = 3; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        const sp = 46, off = frac(t * 0.8) * sp;
        for (let yy = g.y + sp / 2; yy < g.y + g.h + sp; yy += sp) for (let xx = g.x + sp / 2; xx < g.x + g.w + sp; xx += sp) {
          const cx = xx + ux * off, cy = yy + uy * off;
          ctx.globalAlpha = 0.4; rotTo(ctx, cx, cy, a);
          ctx.beginPath(); ctx.moveTo(-6, -7); ctx.lineTo(2, 0); ctx.lineTo(-6, 7); ctx.stroke(); ctx.restore();
        }
        ctx.restore();
        // big arrow badge
        rotTo(ctx, g.x + g.w / 2, g.y + g.h / 2, a); ctx.globalAlpha = 0.22; ctx.fillStyle = c;
        const k = Math.min(g.w, g.h) * 0.22;
        ctx.beginPath(); ctx.moveTo(k, 0); ctx.lineTo(-k * 0.2, -k * 0.8); ctx.lineTo(-k * 0.2, -k * 0.3); ctx.lineTo(-k, -k * 0.3); ctx.lineTo(-k, k * 0.3); ctx.lineTo(-k * 0.2, k * 0.3); ctx.lineTo(-k * 0.2, k * 0.8); ctx.closePath(); ctx.fill();
        ctx.restore(); ctx.globalAlpha = 1;
        break;
      }
      case 'slowmo': {
        const c = col.slowmo;
        zoneBox(ctx, g, c, 0.13, t * 0.25, [3, 9]);
        const cx = g.x + g.w / 2, cy = g.y + g.h / 2, R0 = Math.min(g.w, g.h) * 0.3;
        ctx.strokeStyle = c; ctx.lineCap = 'round';
        for (let k = 0; k < 12; k++) {
          const a = k * TAU / 12, l = k % 3 === 0 ? 10 : 5;
          ctx.globalAlpha = 0.45; ctx.lineWidth = k % 3 === 0 ? 3 : 2;
          ctx.beginPath(); ctx.moveTo(cx + Math.cos(a) * R0, cy + Math.sin(a) * R0); ctx.lineTo(cx + Math.cos(a) * (R0 - l), cy + Math.sin(a) * (R0 - l)); ctx.stroke();
        }
        ctx.globalAlpha = 0.25; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(cx, cy, R0 + 4, 0, TAU); ctx.stroke();
        const ha = t * 0.25 - Math.PI / 2, ma = t * 0.06 - Math.PI / 2;
        ctx.globalAlpha = 0.5; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(ha) * R0 * 0.75, cy + Math.sin(ha) * R0 * 0.75); ctx.stroke();
        ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(ma) * R0 * 0.5, cy + Math.sin(ma) * R0 * 0.5); ctx.stroke();
        // slow floating motes
        ctx.fillStyle = '#ffffff';
        for (let k = 0; k < 10; k++) {
          const u = frac(hash1(k + i * 7) + t * 0.03), x = g.x + hash1(k * 3.3 + i) * g.w, y = g.y + g.h - u * g.h;
          ctx.globalAlpha = 0.5 * Math.sin(u * Math.PI); ctx.beginPath(); ctx.arc(x, y, 1.6, 0, TAU); ctx.fill();
        }
        ctx.globalAlpha = 1;
        break;
      }
      case 'drag': {
        const c = col.honey;
        ctx.fillStyle = c; ctx.globalAlpha = 0.2; rrect(ctx, g.x, g.y, g.w, g.h, 14); ctx.fill();
        ctx.save(); rrect(ctx, g.x, g.y, g.w, g.h, 14); ctx.clip();
        ctx.fillStyle = shade(c, 0.3);
        for (let k = 0; k < Math.max(5, g.w * g.h / 6000); k++) {
          const x = g.x + frac(hash1(k * 2.1 + i) + t * 0.01 * (1 + hash1(k))) * g.w, y = g.y + hash1(k * 5.7 + i) * g.h + Math.sin(t * 0.4 + k) * 8;
          ctx.globalAlpha = 0.18; ctx.beginPath(); ctx.arc(x, y, 14 + hash1(k * 9) * 22, 0, TAU); ctx.fill();
        }
        ctx.strokeStyle = shade(c, -0.2); ctx.lineWidth = 2; ctx.globalAlpha = 0.25;
        for (let yy = g.y + 18; yy < g.y + g.h; yy += 26) {
          ctx.beginPath(); for (let xx = g.x; xx <= g.x + g.w; xx += 10) { const y = yy + Math.sin(xx * 0.03 + t * 0.6 + yy) * 4; if (xx === g.x) ctx.moveTo(xx, y); else ctx.lineTo(xx, y); } ctx.stroke();
        }
        ctx.restore();
        ctx.globalAlpha = 0.5; ctx.strokeStyle = shade(c, -0.15); ctx.lineWidth = 3; rrect(ctx, g.x, g.y, g.w, g.h, 14); ctx.stroke();
        // honey drips on the bottom edge
        ctx.fillStyle = c; ctx.globalAlpha = 0.45;
        for (let x = g.x + 14; x < g.x + g.w - 10; x += 34) { const s = frac(t * 0.15 + hash1(x)), L = 4 + s * 10; ctx.beginPath(); ctx.ellipse(x, g.y + g.h + L * 0.5, 3, L * 0.5 + 2, 0, 0, TAU); ctx.fill(); }
        ctx.globalAlpha = 1;
        break;
      }
      case 'liftcup': {
        const p = P.liftTop ? P.liftTop(g, tg) : [g.y1, 0], top = p[0], x0 = g.x - g.w / 2;
        const h = Math.max(0, g.yb - top);
        ctx.fillStyle = col.metalDark; ctx.fillRect(x0 - 2, top, g.w + 4, h);
        ctx.fillStyle = col.lift; ctx.fillRect(x0 + 2, top + 6, g.w - 4, h);
        ctx.fillStyle = col.metalHi; ctx.globalAlpha = 0.5; ctx.fillRect(x0 + 5, top + 8, 3, h); ctx.globalAlpha = 1;
        ctx.strokeStyle = col.metalDark; ctx.lineWidth = 2; ctx.beginPath();
        for (let y = top + 26; y < g.yb; y += 22) { ctx.moveTo(x0 + 2, y); ctx.lineTo(x0 + g.w - 2, y); }
        ctx.stroke();
        // moving chevrons showing travel direction
        const dir = p[1] < 0 ? -1 : 1;
        if (Math.abs(p[1]) > 4) {
          ctx.strokeStyle = col.warn; ctx.lineWidth = 2; ctx.globalAlpha = 0.7;
          const cx = g.x, cy = top + 30 + frac(t * 1.5) * 10;
          ctx.beginPath(); ctx.moveTo(cx - 6, cy + dir * 4); ctx.lineTo(cx, cy - dir * 3); ctx.lineTo(cx + 6, cy + dir * 4); ctx.stroke(); ctx.globalAlpha = 1;
        }
        // green cap
        const G = col.green;
        ctx.fillStyle = G.dk; rrect(ctx, x0 - 4, top - 1, g.w + 8, 9, 3); ctx.fill();
        ctx.fillStyle = G.c; rrect(ctx, x0 - 4, top - 1, g.w + 8, 6, 3); ctx.fill();
        ctx.fillStyle = G.hi; for (let x = x0; x < x0 + g.w; x += 12) ctx.fillRect(x, top, 6, 3);
        break;
      }
      case 'saw': {
        ctx.lineCap = 'round'; ctx.strokeStyle = col.metalDark; ctx.lineWidth = 6; ctx.globalAlpha = 0.6;
        ctx.beginPath(); ctx.moveTo(g.x, g.y); ctx.lineTo(g.x2, g.y2); ctx.stroke();
        ctx.strokeStyle = shade(col.metalDark, 0.3); ctx.lineWidth = 2; ctx.setLineDash([2, 6]); ctx.stroke(); ctx.setLineDash([]);
        ctx.globalAlpha = 1; ctx.fillStyle = col.metalDark;
        ctx.beginPath(); circ(ctx, g.x, g.y, 5); circ(ctx, g.x2, g.y2, 5); ctx.fill();
        break;
      }
      case 'crusher': {
        ctx.fillStyle = col.metalDark; ctx.globalAlpha = 0.7;
        const y0 = g.y - 30, y1 = g.y + g.h + (g.dy || 0);
        ctx.fillRect(g.x - 7, y0, 4, y1 - y0); ctx.fillRect(g.x + g.w + 3, y0, 4, y1 - y0);
        ctx.fillStyle = col.metal; for (let y = y0 + 6; y < y1; y += 16) { ctx.fillRect(g.x - 8, y, 6, 2); ctx.fillRect(g.x + g.w + 2, y, 6, 2); }
        ctx.globalAlpha = 1;
        ctx.fillStyle = col.metalDark; ctx.fillRect(g.x - 10, y0 - 8, g.w + 20, 10);
        break;
      }
      case 'zipline': {
        // support poles
        for (const [px, py] of [[g.x, g.y], [g.x2, g.y2]]) {
          const gy = groundY(sc.hole, px);
          if (gy > py + 4 && gy - py < 900) {
            ctx.fillStyle = col.woodDark; ctx.fillRect(px - 3, py - 6, 6, gy - py + 6);
            ctx.fillStyle = col.wood; ctx.fillRect(px - 1.5, py - 6, 2, gy - py + 6);
          }
          ctx.fillStyle = col.metalDark; ctx.fillRect(px - 7, py - 8, 14, 6);
        }
        break;
      }
    }
    ctx.globalAlpha = 1;
  }

  function drawNewFront(ctx, sc, g, i, S, tg, t, dt, R) {
    const col = sc.col, P = poses();
    switch (g.t) {
      case 'boost': {
        const s = segInfo(g.x, g.y, g.x2, g.y2);
        rotTo(ctx, g.x, g.y, s.a);
        ctx.fillStyle = '#1c2230'; rrect(ctx, -4, -6, s.L + 8, 12, 6); ctx.fill();
        ctx.fillStyle = shade(col.boost, -0.45); rrect(ctx, -1, -4, s.L + 2, 8, 4); ctx.fill();
        ctx.save(); ctx.beginPath(); ctx.rect(0, -6, s.L, 12); ctx.clip();
        ctx.globalCompositeOperation = 'lighter';
        chevrons(ctx, s.L, frac(t * 2.2) * 16, 16, 3.6, col.boost, 1);
        ctx.restore();
        ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = col.boost; ctx.globalAlpha = 0.12 + 0.06 * Math.sin(t * 6);
        rrect(ctx, -6, -12, s.L + 12, 24, 10); ctx.fill();
        ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
        ctx.fillStyle = col.boostHot; ctx.beginPath(); ctx.moveTo(s.L + 2, -6); ctx.lineTo(s.L + 9, 0); ctx.lineTo(s.L + 2, 6); ctx.closePath(); ctx.fill();
        ctx.restore();
        break;
      }
      case 'magnet': {
        const s = segInfo(g.x, g.y, g.x2, g.y2);
        rotTo(ctx, g.x, g.y, s.a);
        ctx.fillStyle = '#1e2028'; rrect(ctx, -3, -8, s.L + 6, 16, 6); ctx.fill();
        ctx.fillStyle = col.magN; rrect(ctx, -1, -6, s.L / 2 + 1, 12, 4); ctx.fill();
        ctx.fillStyle = col.magS; rrect(ctx, s.L / 2, -6, s.L / 2 + 1, 12, 4); ctx.fill();
        ctx.fillStyle = '#ffffff'; ctx.globalAlpha = 0.35; ctx.fillRect(2, -5, s.L - 4, 2.5); ctx.globalAlpha = 1;
        ctx.fillStyle = '#ffffff'; ctx.font = 'bold 9px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        if (s.L > 40) { ctx.fillText('N', 10, 0.5); ctx.fillText('S', s.L - 10, 0.5); }
        // crackling sparks
        ctx.strokeStyle = col.metalHi; ctx.lineWidth = 1.2;
        const k = Math.floor(t * 8);
        if (hash1(k + i) > 0.55) {
          const x = hash1(k * 3 + i) * s.L, sg = hash1(k * 5) > 0.5 ? 1 : -1; ctx.globalAlpha = 0.8;
          ctx.beginPath(); ctx.moveTo(x, sg * 8); ctx.lineTo(x + 3, sg * 12); ctx.lineTo(x - 2, sg * 15); ctx.lineTo(x + 2, sg * 19); ctx.stroke(); ctx.globalAlpha = 1;
        }
        ctx.restore();
        break;
      }
      case 'piston': {
        const p = P.piston(g, tg), bx = g.x + p[0], by = g.y + p[1];
        const D = Math.hypot(g.dx, g.dy) || 1, ux = g.dx / D, uy = g.dy / D, a = Math.atan2(uy, ux);
        const ext = Math.abs(ux) * g.w / 2 + Math.abs(uy) * g.h / 2, hw = Math.abs(uy) * g.w / 2 + Math.abs(ux) * g.h / 2;
        const cx0 = g.x + g.w / 2, cy0 = g.y + g.h / 2, cx = bx + g.w / 2, cy = by + g.h / 2;
        const baseX = cx0 - ux * (ext + 8), baseY = cy0 - uy * (ext + 8);
        ctx.lineCap = 'butt';
        ctx.strokeStyle = col.metalDark; ctx.lineWidth = Math.min(14, hw * 1.1); ctx.beginPath(); ctx.moveTo(baseX, baseY); ctx.lineTo(cx, cy); ctx.stroke();
        ctx.strokeStyle = col.metalHi; ctx.lineWidth = Math.min(6, hw * 0.5); ctx.stroke();
        rotTo(ctx, baseX, baseY, a);
        ctx.fillStyle = col.metalDark; rrect(ctx, -8, -hw - 6, 12, hw * 2 + 12, 3); ctx.fill();
        ctx.fillStyle = col.warn; ctx.fillRect(-8, -hw - 6, 3, hw * 2 + 12);
        ctx.restore();
        rotTo(ctx, cx, cy, a);
        ctx.fillStyle = col.metalDark; rrect(ctx, -ext, -hw, ext * 2, hw * 2, 3); ctx.fill();
        ctx.fillStyle = col.metal; rrect(ctx, -ext + 2, -hw + 2, ext * 2 - 4, hw * 2 - 4, 2); ctx.fill();
        ctx.fillStyle = col.metalHi; ctx.fillRect(-ext + 3, -hw + 3, ext * 2 - 6, 2);
        // hazard-striped punching face
        ctx.save(); ctx.beginPath(); ctx.rect(ext - 7, -hw, 7, hw * 2); ctx.clip();
        ctx.fillStyle = col.warn; ctx.fillRect(ext - 7, -hw, 7, hw * 2);
        ctx.fillStyle = '#222'; for (let y = -hw - 8; y < hw; y += 10) { ctx.beginPath(); ctx.moveTo(ext - 7, y); ctx.lineTo(ext, y + 5); ctx.lineTo(ext, y + 10); ctx.lineTo(ext - 7, y + 5); ctx.closePath(); ctx.fill(); }
        ctx.restore();
        ctx.restore();
        break;
      }
      case 'pendulum': {
        const p = P.pendulum(g, tg), r = g.r || 22, ex = g.x + Math.cos(p[0]) * g.L, ey = g.y + Math.sin(p[0]) * g.L;
        // motion smear
        const sw = clamp(p[1] * 0.12, -0.5, 0.5);
        if (Math.abs(sw) > 0.05) {
          ctx.fillStyle = col.metalHi; ctx.globalAlpha = 0.18;
          ctx.beginPath(); ctx.arc(g.x, g.y, g.L + r * 0.7, p[0] - sw, p[0], sw < 0); ctx.arc(g.x, g.y, g.L - r * 0.7, p[0], p[0] - sw, sw > 0); ctx.closePath(); ctx.fill(); ctx.globalAlpha = 1;
        }
        ctx.lineCap = 'round'; ctx.strokeStyle = col.metalDark; ctx.lineWidth = 6; ctx.beginPath(); ctx.moveTo(g.x, g.y); ctx.lineTo(ex, ey); ctx.stroke();
        ctx.strokeStyle = col.metal; ctx.lineWidth = 3; ctx.stroke();
        ctx.fillStyle = col.metalDark; rrect(ctx, g.x - 14, g.y - 10, 28, 8, 3); ctx.fill();
        ctx.beginPath(); ctx.arc(g.x, g.y, 6, 0, TAU); ctx.fill(); ctx.fillStyle = col.metalHi; ctx.beginPath(); ctx.arc(g.x, g.y, 2.5, 0, TAU); ctx.fill();
        // hammer head
        ctx.fillStyle = shade(col.metalDark, -0.3); ctx.beginPath(); ctx.arc(ex, ey + 2, r, 0, TAU); ctx.fill();
        const gr = ctx.createRadialGradient(ex - r * 0.35, ey - r * 0.35, r * 0.1, ex, ey, r);
        gr.addColorStop(0, col.metalHi); gr.addColorStop(1, col.metalDark);
        ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(ex, ey, r, 0, TAU); ctx.fill();
        ctx.strokeStyle = col.danger; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(ex, ey, r * 0.62, 0, TAU); ctx.stroke();
        ctx.fillStyle = col.metalDark; for (let k = 0; k < 6; k++) { const a = k * TAU / 6 + p[0]; ctx.beginPath(); ctx.arc(ex + Math.cos(a) * r * 0.82, ey + Math.sin(a) * r * 0.82, 1.6, 0, TAU); ctx.fill(); }
        break;
      }
      case 'seesaw': {
        const a = (S.dyn && S.dyn[i]) || 0, gy = groundY(sc.hole, g.x) + 4;
        const bw = Math.max(26, Math.min(70, (gy - g.y) * 0.8));
        ctx.fillStyle = col.metalDark; ctx.beginPath(); ctx.moveTo(g.x, g.y); ctx.lineTo(g.x + bw / 2, gy); ctx.lineTo(g.x - bw / 2, gy); ctx.closePath(); ctx.fill();
        ctx.fillStyle = col.metal; ctx.beginPath(); ctx.moveTo(g.x, g.y + 6); ctx.lineTo(g.x + bw / 2 - 5, gy); ctx.lineTo(g.x - bw / 2 + 5, gy); ctx.closePath(); ctx.fill();
        rotTo(ctx, g.x, g.y, a);
        ctx.fillStyle = col.woodDark; rrect(ctx, -g.L / 2 - 1, -7, g.L + 2, 14, 4); ctx.fill();
        ctx.fillStyle = col.wood; rrect(ctx, -g.L / 2, -6, g.L, 12, 3); ctx.fill();
        ctx.fillStyle = col.surf.f.c; ctx.fillRect(-g.L / 2, -6, g.L, 3.5);
        ctx.fillStyle = col.surf.f.hi; ctx.fillRect(-g.L / 2, -6, g.L, 1.2);
        ctx.strokeStyle = col.woodDark; ctx.lineWidth = 1.2; ctx.beginPath(); for (let d = -g.L / 2 + 18; d < g.L / 2 - 6; d += 18) { ctx.moveTo(d, -2); ctx.lineTo(d, 6); } ctx.stroke();
        ctx.fillStyle = col.warn; ctx.fillRect(-g.L / 2, -2, 4, 8); ctx.fillRect(g.L / 2 - 4, -2, 4, 8);
        ctx.restore();
        ctx.fillStyle = col.metalDark; ctx.beginPath(); ctx.arc(g.x, g.y, 5, 0, TAU); ctx.fill(); ctx.fillStyle = col.metalHi; ctx.beginPath(); ctx.arc(g.x, g.y, 2, 0, TAU); ctx.fill();
        break;
      }
      case 'zipline': {
        ctx.lineCap = 'round';
        ctx.strokeStyle = 'rgba(0,0,0,0.3)'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(g.x, g.y + 1); ctx.lineTo(g.x2, g.y2 + 1); ctx.stroke();
        ctx.strokeStyle = col.metalHi; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(g.x, g.y); ctx.lineTo(g.x2, g.y2); ctx.stroke();
        const riding = S.ride === i;
        let hx = g.x, hy = g.y, sway = 0;
        if (riding) { hx = S.x; hy = S.y - 12; }
        else { sway = Math.sin(t * 2 + i) * 0.12; const sI = segInfo(g.x, g.y, g.x2, g.y2); hx = g.x + sI.tx * 4; hy = g.y + sI.ty * 4; }
        // trolley
        ctx.fillStyle = col.metalDark; ctx.beginPath(); ctx.arc(hx, hy - 1, 4, 0, TAU); ctx.fill();
        ctx.fillStyle = col.accent; rrect(ctx, hx - 5, hy - 2, 10, 6, 2); ctx.fill();
        rotTo(ctx, hx, hy + 3, sway);
        ctx.strokeStyle = col.metalDark; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(-3, 0); ctx.lineTo(-7, 7); ctx.moveTo(3, 0); ctx.lineTo(7, 7); ctx.stroke();
        ctx.strokeStyle = col.warn; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(-9, 7); ctx.lineTo(9, 7); ctx.stroke();
        ctx.restore();
        if (!riding) {
          ctx.strokeStyle = col.warn; ctx.globalAlpha = 0.3 + 0.2 * Math.sin(t * 4); ctx.lineWidth = 1.5; ctx.setLineDash([3, 4]);
          ctx.beginPath(); ctx.arc(g.x, g.y + 12, g.r || 22, 0, TAU); ctx.stroke(); ctx.setLineDash([]); ctx.globalAlpha = 1;
        }
        break;
      }
      case 'quicksand': qsStrip(ctx, col, g.x, g.y, g.x2, g.y2, t); break;
      case 'cushion': cloudStrip(ctx, col, g.x, g.y, g.x2, g.y2, t, i * 3.7); break;
      case 'blackhole': {
        const r = g.r || 160, core = g.core || 16;
        ctx.fillStyle = col.hole; ctx.globalAlpha = 0.07; ctx.beginPath(); ctx.arc(g.x, g.y, r, 0, TAU); ctx.fill();
        ctx.globalAlpha = 0.2; ctx.strokeStyle = col.hole; ctx.lineWidth = 1.5; ctx.setLineDash([4, 8]); ctx.lineDashOffset = t * 20; ctx.stroke(); ctx.setLineDash([]); ctx.lineDashOffset = 0;
        // accretion swirl arms
        ctx.lineCap = 'round';
        for (let k = 0; k < 3; k++) {
          ctx.beginPath();
          for (let s = 0; s <= 30; s++) {
            const u = s / 30, d = core + 4 + u * (r * 0.75), a = t * (2.2 - u * 1.4) + k * TAU / 3 + u * 4;
            const x = g.x + Math.cos(a) * d, y = g.y + Math.sin(a) * d * 0.9;
            if (s === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
          }
          ctx.strokeStyle = k === 1 ? col.holeHot : col.hole; ctx.lineWidth = 3; ctx.globalAlpha = 0.4; ctx.stroke();
        }
        ctx.globalAlpha = 1;
        // infalling motes
        ctx.fillStyle = col.holeHot;
        for (let k = 0; k < 14; k++) {
          const u = frac(t * 0.4 + k / 14), d = core + (1 - u) * r * 0.9, a = k * 2.39 + u * 5;
          ctx.globalAlpha = 0.8 * u; ctx.beginPath(); ctx.arc(g.x + Math.cos(a) * d, g.y + Math.sin(a) * d, 1.2 + u * 1.2, 0, TAU); ctx.fill();
        }
        ctx.globalAlpha = 1;
        // glow ring + core
        ctx.globalCompositeOperation = 'lighter';
        const gr = ctx.createRadialGradient(g.x, g.y, core * 0.8, g.x, g.y, core * 2.6);
        gr.addColorStop(0, rgba(col.holeHot, 0.8)); gr.addColorStop(0.4, rgba(col.hole, 0.45)); gr.addColorStop(1, rgba(col.hole, 0));
        ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(g.x, g.y, core * 2.6, 0, TAU); ctx.fill();
        ctx.globalCompositeOperation = 'source-over';
        ctx.fillStyle = '#000000'; ctx.beginPath(); ctx.arc(g.x, g.y, core, 0, TAU); ctx.fill();
        ctx.strokeStyle = shade(col.holeHot, 0.3); ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(g.x, g.y, core + 1, t * 3, t * 3 + 2.2); ctx.stroke();
        break;
      }
      case 'floatpool': break;
      case 'laser': {
        const on = P.laserOn(g, tg), warn = P.laserWarn(g, tg), s = segInfo(g.x, g.y, g.x2, g.y2);
        if (on) {
          const jit = Math.sin(t * 60) * 0.6;
          ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round';
          ctx.strokeStyle = col.laser; ctx.globalAlpha = 0.22; ctx.lineWidth = 14 + jit * 3; ctx.beginPath(); ctx.moveTo(g.x, g.y); ctx.lineTo(g.x2, g.y2); ctx.stroke();
          ctx.globalAlpha = 0.6; ctx.lineWidth = 5; ctx.stroke();
          ctx.strokeStyle = '#ffe0e6'; ctx.globalAlpha = 1; ctx.lineWidth = 1.8; ctx.stroke();
          ctx.globalCompositeOperation = 'source-over';
          if (sc.cb) { ctx.lineCap = 'butt'; ctx.strokeStyle = '#1a0006'; ctx.lineWidth = 4.5; ctx.setLineDash([7, 7]); ctx.lineDashOffset = -t * 40; ctx.stroke(); ctx.strokeStyle = '#ffffff'; ctx.lineDashOffset = -t * 40 + 7; ctx.stroke(); ctx.setLineDash([]); ctx.lineDashOffset = 0; ctx.lineCap = 'round'; }
        } else if (warn) {
          if (Math.sin(t * 50) > -0.2) { ctx.strokeStyle = col.laser; ctx.globalAlpha = 0.5 + 0.3 * Math.sin(t * 90); ctx.lineWidth = 1.2; ctx.setLineDash([6, 4]); ctx.lineDashOffset = -t * 80; ctx.beginPath(); ctx.moveTo(g.x, g.y); ctx.lineTo(g.x2, g.y2); ctx.stroke(); ctx.setLineDash([]); ctx.lineDashOffset = 0; }
        } else {
          ctx.strokeStyle = col.laser; ctx.globalAlpha = 0.14; ctx.lineWidth = 1; ctx.setLineDash([2, 8]); ctx.beginPath(); ctx.moveTo(g.x, g.y); ctx.lineTo(g.x2, g.y2); ctx.stroke(); ctx.setLineDash([]);
        }
        ctx.globalAlpha = 1;
        for (const [ex, ey, a] of [[g.x, g.y, s.a], [g.x2, g.y2, s.a + Math.PI]]) {
          rotTo(ctx, ex, ey, a);
          ctx.fillStyle = col.metalDark; rrect(ctx, -12, -8, 14, 16, 3); ctx.fill();
          ctx.fillStyle = col.metal; ctx.fillRect(-10, -6, 3, 12);
          ctx.fillStyle = on ? '#ffffff' : warn ? (Math.sin(t * 40) > 0 ? col.warn : col.laser) : shade(col.laser, -0.5);
          ctx.beginPath(); ctx.arc(1, 0, 3.5, 0, TAU); ctx.fill();
          if (on || warn) { ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = col.laser; ctx.globalAlpha = 0.4; ctx.beginPath(); ctx.arc(1, 0, 8, 0, TAU); ctx.fill(); ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1; }
          ctx.restore();
        }
        break;
      }
      case 'saw': {
        const p = P.sawPos(g, tg), r = g.r || 18, a = t * 14;
        ctx.fillStyle = col.saw; ctx.globalAlpha = 0.15; ctx.beginPath(); ctx.arc(p[0], p[1], r + 5, 0, TAU); ctx.fill(); ctx.globalAlpha = 1;
        ctx.save(); ctx.translate(p[0], p[1]); ctx.rotate(a);
        ctx.beginPath(); const n = 14;
        for (let k = 0; k < n; k++) { const a0 = k * TAU / n, a1 = (k + 0.6) * TAU / n; ctx.lineTo(Math.cos(a0) * r * 0.82, Math.sin(a0) * r * 0.82); ctx.lineTo(Math.cos(a1) * r * 1.08, Math.sin(a1) * r * 1.08); }
        ctx.closePath(); ctx.fillStyle = col.saw; ctx.fill(); ctx.strokeStyle = col.metalDark; ctx.lineWidth = 1.2; ctx.stroke();
        ctx.fillStyle = shade(col.saw, -0.15); ctx.beginPath(); ctx.arc(0, 0, r * 0.62, 0, TAU); ctx.fill();
        ctx.strokeStyle = shade(col.saw, -0.35); ctx.lineWidth = 1.5; ctx.beginPath(); for (let k = 0; k < 3; k++) { const b = k * TAU / 3; ctx.moveTo(Math.cos(b) * r * 0.2, Math.sin(b) * r * 0.2); ctx.lineTo(Math.cos(b + 0.6) * r * 0.55, Math.sin(b + 0.6) * r * 0.55); } ctx.stroke();
        ctx.fillStyle = col.danger; ctx.beginPath(); ctx.arc(0, 0, r * 0.2, 0, TAU); ctx.fill();
        ctx.restore();
        break;
      }
      case 'crusher': {
        const p = P.crusher(g, tg), warn = P.crusherWarn(g, tg), falling = p[1] > 40;
        const ox = warn ? Math.sin(t * 90) * 2 : 0, y = g.y + p[0];
        ctx.save(); ctx.translate(ox, 0);
        ctx.fillStyle = shade(col.crusher, -0.45); rrect(ctx, g.x, y, g.w, g.h, 4); ctx.fill();
        ctx.fillStyle = col.crusher; rrect(ctx, g.x + 3, y + 3, g.w - 6, g.h - 8, 3); ctx.fill();
        ctx.fillStyle = shade(col.crusher, 0.25); ctx.fillRect(g.x + 5, y + 5, g.w - 10, 3);
        ctx.fillStyle = shade(col.crusher, -0.3); for (const [bx, by] of [[g.x + 7, y + 7], [g.x + g.w - 7, y + 7], [g.x + 7, y + g.h - 10], [g.x + g.w - 7, y + g.h - 10]]) { ctx.beginPath(); ctx.arc(bx, by, 2, 0, TAU); ctx.fill(); }
        // face
        const cx = g.x + g.w / 2, cy = y + g.h * 0.45, ew = Math.min(g.w * 0.16, 12);
        ctx.fillStyle = warn || falling ? col.danger : '#ffffff';
        for (const sx of [-1, 1]) {
          ctx.beginPath(); ctx.moveTo(cx + sx * ew * 0.4, cy - ew * (warn ? 0.1 : 0.35)); ctx.lineTo(cx + sx * ew * 1.9, cy - ew * 0.75); ctx.lineTo(cx + sx * ew * 1.8, cy + ew * 0.5); ctx.lineTo(cx + sx * ew * 0.5, cy + ew * 0.5); ctx.closePath(); ctx.fill();
        }
        ctx.fillStyle = '#111'; for (const sx of [-1, 1]) { ctx.beginPath(); ctx.arc(cx + sx * ew * 1.15, cy + ew * 0.1, ew * 0.28, 0, TAU); ctx.fill(); }
        ctx.fillStyle = '#1a1a1f'; rrect(ctx, cx - ew * 1.6, cy + ew * 1.1, ew * 3.2, ew * 0.8, 2); ctx.fill();
        ctx.fillStyle = '#ffffff'; for (let k = 0; k < 4; k++) ctx.fillRect(cx - ew * 1.5 + k * ew * 0.8, cy + ew * 1.15, ew * 0.5, ew * 0.35);
        // teeth on the bottom edge
        ctx.fillStyle = falling ? col.danger : col.metalHi; ctx.beginPath();
        for (let x = g.x + 2; x + 8 <= g.x + g.w; x += 8) { ctx.moveTo(x, y + g.h - 4); ctx.lineTo(x + 4, y + g.h + 3); ctx.lineTo(x + 8, y + g.h - 4); }
        ctx.fill();
        ctx.restore();
        if (warn && R && Math.random() < dt * 20) R.spawn('dust', g.x + Math.random() * g.w, g.y - 26, { m: 0.2 });
        break;
      }
      case 'tokens': {
        const n = g.pts.length >> 1, mask = (S.dyn && S.dyn[i]) || 0, r = g.r || 16;
        const prev = sc.tokMask[i] || 0;
        if (mask !== prev) {
          if (!sc.tokFade[i]) sc.tokFade[i] = [];
          for (let k = 0; k < n; k++) if ((mask & (1 << k)) && !(prev & (1 << k))) sc.tokFade[i][k] = 1;
          if ((mask & prev) !== prev) sc.tokFade[i] = [];
          sc.tokMask[i] = mask;
        }
        const fade = sc.tokFade[i] || [];
        for (let k = 0; k < n; k++) {
          const x = g.pts[2 * k], y0 = g.pts[2 * k + 1];
          let sc0 = 1, al = 1;
          if (mask & (1 << k)) {
            const f = fade[k] || 0; if (f <= 0) continue;
            fade[k] = Math.max(0, f - dt * 2.5); sc0 = 1 + (1 - f) * 0.9; al = f;
          }
          const y = y0 + Math.sin(t * 2.2 + k) * 2.5, sx = Math.cos(t * 3 + k * 0.7);
          ctx.globalAlpha = al;
          ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = col.token; ctx.globalAlpha = al * (0.18 + 0.08 * Math.sin(t * 5 + k));
          ctx.beginPath(); ctx.arc(x, y, r * 1.25 * sc0, 0, TAU); ctx.fill(); ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = al;
          ctx.save(); ctx.translate(x, y); ctx.scale(Math.max(0.12, Math.abs(sx)) * sc0, sc0);
          const rr = r * 0.78;
          ctx.fillStyle = col.tokenDk; ctx.beginPath(); ctx.arc(0, 0, rr, 0, TAU); ctx.fill();
          ctx.fillStyle = sx > 0 ? col.token : shade(col.token, -0.12); ctx.beginPath(); ctx.arc(0, 0, rr - 2, 0, TAU); ctx.fill();
          ctx.fillStyle = shade(col.token, 0.55); ctx.beginPath(); starPath(ctx, 0, 0, rr * 0.55, rr * 0.24, 5, 0); ctx.fill();
          ctx.restore();
          if (Math.sin(t * 2 + k * 2.1) > 0.9) { ctx.fillStyle = '#ffffff'; ctx.beginPath(); starPath(ctx, x + r * 0.45, y - r * 0.5, 3.5, 0.8, 4, 0); ctx.fill(); }
          ctx.globalAlpha = 1;
        }
        break;
      }
      case 'spinner': {
        const a = P.angle(g, tg), r = g.r, n = 8;
        ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.beginPath(); ctx.arc(g.x + 2, g.y + 3, r, 0, TAU); ctx.fill();
        ctx.save(); ctx.translate(g.x, g.y); ctx.rotate(a);
        for (let k = 0; k < n; k++) { ctx.fillStyle = k & 1 ? '#22252e' : col.warn; ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, r, k * TAU / n, (k + 1) * TAU / n); ctx.closePath(); ctx.fill(); }
        ctx.fillStyle = '#ffffff'; ctx.globalAlpha = 0.25; ctx.beginPath(); ctx.arc(0, 0, r * 0.7, 0, TAU); ctx.fill(); ctx.globalAlpha = 1;
        ctx.restore();
        ctx.strokeStyle = col.metalDark; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(g.x, g.y, r, 0, TAU); ctx.stroke();
        ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2; ctx.globalAlpha = 0.6; const sg = g.w >= 0 ? 1 : -1;
        ctx.beginPath(); ctx.arc(g.x, g.y, r + 6, -Math.PI / 2, -Math.PI / 2 + sg * 1.2, sg < 0); ctx.stroke();
        const ea = -Math.PI / 2 + sg * 1.2, ex = g.x + Math.cos(ea) * (r + 6), ey = g.y + Math.sin(ea) * (r + 6);
        ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.moveTo(ex + Math.cos(ea + sg * Math.PI / 2) * 6, ey + Math.sin(ea + sg * Math.PI / 2) * 6); ctx.lineTo(ex + Math.cos(ea) * 4, ey + Math.sin(ea) * 4); ctx.lineTo(ex - Math.cos(ea) * 4, ey - Math.sin(ea) * 4); ctx.closePath(); ctx.fill();
        ctx.globalAlpha = 1;
        ctx.fillStyle = col.metalDark; ctx.beginPath(); ctx.arc(g.x, g.y, Math.max(4, r * 0.16), 0, TAU); ctx.fill();
        ctx.fillStyle = col.metalHi; ctx.beginPath(); ctx.arc(g.x, g.y, Math.max(1.5, r * 0.06), 0, TAU); ctx.fill();
        break;
      }
      case 'glass': {
        if (S.dyn && S.dyn[i]) break;
        ctx.fillStyle = rgba(col.glass, 0.28); ctx.fillRect(g.x, g.y, g.w, g.h);
        ctx.save(); ctx.beginPath(); ctx.rect(g.x, g.y, g.w, g.h); ctx.clip();
        ctx.fillStyle = '#ffffff'; ctx.globalAlpha = 0.45;
        const sh = frac(t * 0.15 + i * 0.3) * (g.w + g.h) * 2 - g.h;
        ctx.beginPath(); ctx.moveTo(g.x + sh, g.y); ctx.lineTo(g.x + sh + 10, g.y); ctx.lineTo(g.x + sh + 10 - g.h, g.y + g.h); ctx.lineTo(g.x + sh - g.h, g.y + g.h); ctx.closePath(); ctx.fill();
        ctx.globalAlpha = 0.3; ctx.beginPath(); ctx.moveTo(g.x + sh + 16, g.y); ctx.lineTo(g.x + sh + 20, g.y); ctx.lineTo(g.x + sh + 20 - g.h, g.y + g.h); ctx.lineTo(g.x + sh + 16 - g.h, g.y + g.h); ctx.closePath(); ctx.fill();
        ctx.restore();
        ctx.globalAlpha = 0.85; ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.5; ctx.strokeRect(g.x + 0.75, g.y + 0.75, g.w - 1.5, g.h - 1.5);
        ctx.strokeStyle = shade(col.glass, -0.4); ctx.lineWidth = 1; ctx.globalAlpha = 0.6; ctx.strokeRect(g.x - 0.5, g.y - 0.5, g.w + 1, g.h + 1);
        ctx.fillStyle = '#ffffff'; ctx.globalAlpha = 0.7; ctx.fillRect(g.x + 3, g.y + 3, Math.min(g.w - 6, 3), Math.min(g.h - 6, g.h * 0.4));
        ctx.globalAlpha = 1;
        break;
      }
      case 'decoy': {
        for (let k = 0; k < g.pts.length; k += 2) {
          const cup = { x: g.pts[k], y: g.pts[k + 1], w: 30 };
          fakeCup(ctx, sc, cup.x, cup.y, 26);
          drawFlag(ctx, sc, cup, t + k * 0.37, false, sc.rfx ? 0 : 1, null, true);
        }
        break;
      }
      case 'geyser': {
        const T = g.T || 3, f = frac(tg / T + (g.ph || 0)), on = f < (g.on || 0.4), warn = !on && f > 0.82, hw = g.w / 2;
        // vent mound
        ctx.fillStyle = shade(col.solid, -0.15); ctx.beginPath(); ctx.moveTo(g.x - hw - 14, g.y + 4); ctx.quadraticCurveTo(g.x - hw, g.y - 12, g.x - hw * 0.5, g.y - 10); ctx.lineTo(g.x + hw * 0.5, g.y - 10); ctx.quadraticCurveTo(g.x + hw, g.y - 12, g.x + hw + 14, g.y + 4); ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#16131c'; ctx.beginPath(); ctx.ellipse(g.x, g.y - 10, hw * 0.5, 3.5, 0, 0, TAU); ctx.fill();
        ctx.fillStyle = col.surf.k.hi; ctx.globalAlpha = 0.5; ctx.fillRect(g.x - hw - 2, g.y - 9, hw * 0.4, 2); ctx.globalAlpha = 1;
        if (warn || on) {
          ctx.fillStyle = col.geyser;
          const n = warn ? 5 : 3;
          for (let k = 0; k < n; k++) {
            const u = frac(t * 2.5 + k / n), x = g.x + (hash1(k + Math.floor(t * 2.5 + k / n)) - 0.5) * hw, y = g.y - 12 - u * (warn ? 14 + (f - 0.82) * 120 : 10);
            ctx.globalAlpha = 0.8 * (1 - u); ctx.beginPath(); ctx.arc(x, y, 2 + u * 3, 0, TAU); ctx.fill();
          }
          ctx.globalAlpha = 1;
          if (warn && R && Math.random() < dt * 10) R.spawn('pop', g.x + (Math.random() - 0.5) * hw, g.y - 12, { m: 0.2 });
        }
        break;
      }
      case 'phase': {
        const solid = P.phaseSolid(g, S.strokes || 0), c = col.phase;
        for (const r of g.blocks) {
          if (solid) {
            blockSolid(ctx, r[0], r[1], r[2], r[3], mix(c, col.solid, 0.45));
            ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = c; ctx.globalAlpha = 0.4 + 0.15 * Math.sin(t * 3); ctx.lineWidth = 2; ctx.strokeRect(r[0] + 1, r[1] + 1, r[2] - 2, r[3] - 2); ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
          } else blockGhost(ctx, r[0], r[1], r[2], r[3], c, t);
          // parity pip: filled = solid on odd strokes
          const px = r[0] + r[2] - 7, py = r[1] + 7;
          ctx.fillStyle = g.odd ? c : '#ffffff'; ctx.globalAlpha = solid ? 0.9 : 0.5; ctx.beginPath(); ctx.arc(px, py, 2.6, 0, TAU); ctx.fill(); ctx.globalAlpha = 1;
        }
        break;
      }
      case 'toggle': {
        const st = (S.dyn && S.dyn[i]) ? 1 : 0;
        const sets = [[g.a || [], col.togA], [g.b || [], col.togB]];
        sets.forEach(([set, c], k) => { for (const r of set) { if (k === st) blockSolid(ctx, r[0], r[1], r[2], r[3], c); else blockGhost(ctx, r[0], r[1], r[2], r[3], c, t); } });
        if (sc.cb) sets.forEach(([set], k) => { for (const r of set) { padlock(ctx, r[0] + r[2] / 2, r[1] + r[3] / 2, Math.min(7, r[3] * 0.45 + 2), k !== st); ctx.font = '900 9px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#ffffff'; ctx.fillText(k ? 'B' : 'A', r[0] + 7, r[1] + r[3] / 2); } });
        // switch: lever box
        const c = st ? col.togB : col.togA, cool = S.dyn2 && S.dyn2[i] > S.t;
        ctx.fillStyle = col.metalDark; rrect(ctx, g.sx - 12, g.sy + 2, 24, 9, 3); ctx.fill();
        ctx.fillStyle = col.togA; ctx.fillRect(g.sx - 10, g.sy + 4, 8, 5); ctx.fillStyle = col.togB; ctx.fillRect(g.sx + 2, g.sy + 4, 8, 5);
        if (sc.cb) { ctx.font = '900 7px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#111'; ctx.fillText('A', g.sx - 6, g.sy + 6.8); ctx.fillText('B', g.sx + 6, g.sy + 6.8); }
        rotTo(ctx, g.sx, g.sy + 4, (st ? 0.6 : -0.6));
        ctx.strokeStyle = col.metal; ctx.lineWidth = 3; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -14); ctx.stroke();
        ctx.fillStyle = c; ctx.beginPath(); ctx.arc(0, -15, 4.5, 0, TAU); ctx.fill();
        ctx.restore();
        if (!cool) { ctx.strokeStyle = c; ctx.globalAlpha = 0.3 + 0.2 * Math.sin(t * 5); ctx.lineWidth = 2; ctx.setLineDash([3, 4]); ctx.beginPath(); ctx.arc(g.sx, g.sy, 20, 0, TAU); ctx.stroke(); ctx.setLineDash([]); ctx.globalAlpha = 1; }
        break;
      }
      case 'ring': {
        const r = g.r || 30, flash = S.dyn2 && S.dyn2[i] > S.t ? (S.dyn2[i] - S.t) / 0.4 : 0, c = col.ring;
        const rr = r * (1 + flash * 0.15);
        ctx.globalCompositeOperation = 'lighter';
        ctx.strokeStyle = c; ctx.globalAlpha = 0.18 + flash * 0.4 + 0.06 * Math.sin(t * 4); ctx.lineWidth = 14; ctx.beginPath(); ctx.arc(g.x, g.y, rr, 0, TAU); ctx.stroke();
        ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
        ctx.strokeStyle = shade(c, -0.35); ctx.lineWidth = 7; ctx.stroke();
        ctx.strokeStyle = flash > 0 ? '#ffffff' : c; ctx.lineWidth = 4.5; ctx.stroke();
        ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2; ctx.globalAlpha = 0.8; ctx.setLineDash([6, 10]); ctx.lineDashOffset = -t * 40; ctx.stroke(); ctx.setLineDash([]); ctx.lineDashOffset = 0; ctx.globalAlpha = 1;
        rotTo(ctx, g.x, g.y, g.ang);
        ctx.globalAlpha = 0.85; const o = frac(t * 1.6) * r * 0.3;
        ctx.strokeStyle = c; ctx.lineWidth = 3; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        for (let k = 0; k < 2; k++) { const x = -r * 0.25 + k * r * 0.35 + o; ctx.globalAlpha = 0.85 * (1 - o / (r * 0.3) * 0.5); ctx.beginPath(); ctx.moveTo(x - r * 0.18, -r * 0.3); ctx.lineTo(x + r * 0.12, 0); ctx.lineTo(x - r * 0.18, r * 0.3); ctx.stroke(); }
        ctx.globalAlpha = 1; ctx.fillStyle = c; ctx.beginPath(); ctx.moveTo(rr + 14, 0); ctx.lineTo(rr + 4, -7); ctx.lineTo(rr + 4, 7); ctx.closePath(); ctx.fill();
        ctx.restore();
        break;
      }
      case 'skim': {
        const x0 = g.x, x1 = g.x + g.w, wave = (x) => g.y + Math.sin(x * 0.06 + t * 1.8) * 0.8;
        ctx.save(); ctx.clip(sc.airPath, 'evenodd');
        ctx.beginPath(); ctx.moveTo(x0, wave(x0));
        for (let x = x0; x <= x1; x += 8) ctx.lineTo(x, wave(x));
        ctx.lineTo(x1, wave(x1));
        let yb = g.y; for (let x = x1; x >= x0; x -= 12) { const gy = groundY(sc.hole, x); yb = Math.max(yb, gy); ctx.lineTo(x, gy + 2); }
        ctx.lineTo(x0, groundY(sc.hole, x0) + 2); ctx.closePath();
        const gr = ctx.createLinearGradient(0, g.y, 0, Math.max(g.y + 20, yb));
        gr.addColorStop(0, rgba(col.skim, 0.75)); gr.addColorStop(1, rgba(col.water, 0.7));
        ctx.fillStyle = gr; ctx.fill();
        ctx.restore();
        ctx.beginPath(); for (let x = x0; x <= x1; x += 8) { if (x === x0) ctx.moveTo(x, wave(x)); else ctx.lineTo(x, wave(x)); }
        ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2.2; ctx.globalAlpha = 0.85; ctx.stroke();
        // glassy reflections + skipping ripples
        ctx.lineWidth = 1.4;
        for (let k = 0; k < g.w / 40; k++) {
          const s = frac(t * 0.25 + hash1(k * 3.3 + i)), x = x0 + hash1(k * 7.1 + i) * g.w;
          ctx.globalAlpha = 0.6 * Math.sin(s * Math.PI); ctx.beginPath(); ctx.ellipse(x, g.y + 4 + s * 4, 4 + s * 10, 1 + s * 1.2, 0, 0, TAU); ctx.stroke();
        }
        ctx.fillStyle = '#ffffff'; ctx.globalAlpha = 0.35;
        for (let x = x0 + 12; x < x1 - 20; x += 46) ctx.fillRect(x + Math.sin(t + x) * 3, g.y + 7, 16, 1.4);
        ctx.globalAlpha = 1;
        break;
      }
      case 'catapult': {
        const armed = S.supG === i && S.catT > 0, k = armed ? clamp(1 - (S.catT - S.t) / (g.delay || 0.5), 0, 1) : 0;
        if (sc.catWas[i] && !armed && S.contact > 0) sc.catFlick[i] = 1;
        sc.catWas[i] = armed;
        let fl = sc.catFlick[i] || 0; if (fl) { fl = Math.max(0, fl - dt * 3); sc.catFlick[i] = fl; }
        const hw = g.w / 2, gy = Math.max(g.y + 10, groundY(sc.hole, g.x) + 2), dirx = Math.cos(g.ang) >= 0 ? 1 : -1;
        // base + spring
        ctx.fillStyle = col.metalDark; rrect(ctx, g.x - hw + 4, g.y + 4, g.w - 8, gy - g.y, 3); ctx.fill();
        const top = g.y + 2 + k * 3, sh = Math.max(3, (gy - top) * (1 - k * 0.5));
        ctx.strokeStyle = col.warn; ctx.lineWidth = 2; ctx.beginPath();
        for (let z = 0; z <= 6; z++) { const x = g.x + (z & 1 ? 8 : -8), y = top + 3 + sh * z / 6; if (z === 0) ctx.moveTo(g.x, y); else ctx.lineTo(x, y); }
        ctx.stroke();
        // plate (tips toward launch direction while flinging)
        rotTo(ctx, g.x, g.y + k * 3, -dirx * fl * 0.5);
        ctx.fillStyle = col.metalDark; rrect(ctx, -hw - 2, -4, g.w + 4, 8, 3); ctx.fill();
        ctx.fillStyle = armed ? col.danger : col.metal; rrect(ctx, -hw, -3, g.w, 5, 2); ctx.fill();
        ctx.fillStyle = col.metalHi; ctx.fillRect(-hw + 2, -3, g.w - 4, 1.2);
        ctx.restore();
        // launch arrow
        const al = armed ? 0.5 + 0.5 * Math.sin(t * 25) : 0.6;
        rotTo(ctx, g.x, g.y - 8, g.ang);
        ctx.globalAlpha = al; ctx.strokeStyle = armed ? col.danger : col.warn; ctx.lineWidth = 2.5; ctx.setLineDash([5, 5]); ctx.lineDashOffset = -t * 30;
        ctx.beginPath(); ctx.moveTo(10, 0); ctx.lineTo(44 + k * 14, 0); ctx.stroke(); ctx.setLineDash([]); ctx.lineDashOffset = 0;
        ctx.fillStyle = armed ? col.danger : col.warn; ctx.beginPath(); ctx.moveTo(54 + k * 14, 0); ctx.lineTo(44 + k * 14, -6); ctx.lineTo(44 + k * 14, 6); ctx.closePath(); ctx.fill();
        ctx.globalAlpha = 1; ctx.restore();
        break;
      }
      case 'mine': {
        if (S.dyn && S.dyn[i]) {
          const gy = groundY(sc.hole, g.x);
          if (gy - g.y < 60) { ctx.fillStyle = 'rgba(20,14,10,0.45)'; ctx.beginPath(); ctx.ellipse(g.x, gy + 1, 22, 4, 0, 0, TAU); ctx.fill(); }
          break;
        }
        const r = 10, d = S.x !== undefined ? Math.hypot(S.x - g.x, S.y - g.y) : 1e9, near = d < (g.r || 40) * 3;
        ctx.strokeStyle = col.danger; ctx.globalAlpha = near ? 0.35 : 0.12; ctx.lineWidth = 1.2; ctx.setLineDash([3, 6]); ctx.lineDashOffset = t * 10;
        ctx.beginPath(); ctx.arc(g.x, g.y, g.r || 40, 0, TAU); ctx.stroke(); ctx.setLineDash([]); ctx.lineDashOffset = 0; ctx.globalAlpha = 1;
        const bob = Math.sin(t * 2 + i) * 1.5;
        ctx.save(); ctx.translate(g.x, g.y + bob); ctx.rotate(Math.sin(t * 0.8 + i) * 0.2);
        ctx.fillStyle = col.mine; ctx.beginPath();
        for (let k = 0; k < 8; k++) { const a = k * TAU / 8; ctx.moveTo(Math.cos(a - 0.22) * r * 0.9, Math.sin(a - 0.22) * r * 0.9); ctx.lineTo(Math.cos(a) * r * 1.6, Math.sin(a) * r * 1.6); ctx.lineTo(Math.cos(a + 0.22) * r * 0.9, Math.sin(a + 0.22) * r * 0.9); }
        ctx.fill();
        ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.fill();
        ctx.fillStyle = '#ffffff'; ctx.globalAlpha = 0.25; ctx.beginPath(); ctx.arc(-r * 0.35, -r * 0.35, r * 0.35, 0, TAU); ctx.fill(); ctx.globalAlpha = 1;
        ctx.fillStyle = col.warn; ctx.fillRect(-r * 0.9, -1.5, r * 1.8, 3);
        ctx.restore();
        const blink = Math.sin(t * (near ? 22 : 6) + i) > 0.3;
        ctx.fillStyle = blink ? '#ff3a3a' : '#5a1010'; ctx.beginPath(); ctx.arc(g.x, g.y + bob - r * 0.1, 2.8, 0, TAU); ctx.fill();
        if (blink) { ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = 'rgba(255,60,60,0.45)'; ctx.beginPath(); ctx.arc(g.x, g.y + bob, 9, 0, TAU); ctx.fill(); ctx.globalCompositeOperation = 'source-over'; }
        break;
      }
      case 'blinkcup': {
        const n = g.pts.length >> 1, cur = P.blinkIndex ? P.blinkIndex(g, tg) : 0, T = g.T || 3, u = frac(tg / T + (g.ph || 0)), nxt = (cur + 1) % n;
        for (let k = 0; k < n; k++) {
          if (k === cur) continue;
          const x = g.pts[2 * k], y = g.pts[2 * k + 1], soon = k === nxt ? u : 0;
          ctx.strokeStyle = col.pal.accent; ctx.lineWidth = 2;
          for (let q = 0; q < 2; q++) { const s = frac(t * 0.6 + q * 0.5); ctx.globalAlpha = (0.45 + soon * 0.4) * (1 - s); ctx.beginPath(); ctx.ellipse(x, y - 1, 10 + s * 16, 3 + s * 4, 0, 0, TAU); ctx.stroke(); }
          ctx.globalAlpha = 0.55 + soon * 0.45; ctx.lineWidth = 2.5; ctx.setLineDash([4, 3]); ctx.beginPath(); ctx.ellipse(x, y + 1, 13, 3, 0, 0, TAU); ctx.stroke(); ctx.setLineDash([]);
          ctx.globalAlpha = 1;
        }
        // countdown arc above the active cup
        const ax = g.pts[2 * cur], ay = g.pts[2 * cur + 1] - 104;
        ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(ax, ay, 7, 0, TAU); ctx.stroke();
        ctx.strokeStyle = col.pal.accent; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(ax, ay, 7, -Math.PI / 2, -Math.PI / 2 + (1 - u) * TAU); ctx.stroke();
        break;
      }
    }
    ctx.globalAlpha = 1;
  }

  // drawn AFTER the ball (translucent volumes, bubbles, tubes)
  function drawGimmickOver(ctx, sc, g, i, S, tg, t, dt, view, R) {
    const col = sc.col, P = poses();
    switch (g.t) {
      case 'bubble': {
        const r = g.r || 26, held = S.bub === i;
        let x = g.x, y = g.y + Math.sin(t * 2 + i) * 3, al = 1;
        if (held) { x = S.x; y = S.y; }
        else if (S.dyn && S.t < S.dyn[i]) break;
        else if (S.dyn && S.dyn[i] > 0) al = clamp((S.t - S.dyn[i]) / 0.5, 0, 1);
        const left = held ? S.bubT - S.t : 9, wf = left < 0.7 ? 18 : 5, wa = left < 0.7 ? 0.12 : 0.06;
        const rx = r * (1 + wa * Math.sin(t * wf + i)), ry = r * (1 - wa * Math.sin(t * wf + i));
        ctx.globalAlpha = al;
        const gr = ctx.createRadialGradient(x - r * 0.3, y - r * 0.3, r * 0.1, x, y, r);
        gr.addColorStop(0, rgba(col.bubble, 0.06)); gr.addColorStop(0.75, rgba(col.bubble, 0.18)); gr.addColorStop(1, rgba(col.bubble, 0.55));
        ctx.fillStyle = gr; ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, TAU); ctx.fill();
        ctx.strokeStyle = '#ffffff'; ctx.globalAlpha = al * 0.7; ctx.lineWidth = 1.5; ctx.stroke();
        ctx.strokeStyle = held ? hsl(Math.round(t * 120) % 360, 90, 75) : col.bubble; ctx.globalAlpha = al * 0.5; ctx.lineWidth = 1; ctx.beginPath(); ctx.ellipse(x, y, rx - 2.5, ry - 2.5, 0, 0.3, 2.4); ctx.stroke();
        ctx.fillStyle = '#ffffff'; ctx.globalAlpha = al * 0.8; ctx.beginPath(); ctx.ellipse(x - rx * 0.4, y - ry * 0.45, rx * 0.2, ry * 0.1, -0.7, 0, TAU); ctx.fill();
        ctx.beginPath(); ctx.arc(x + rx * 0.45, y + ry * 0.35, 1.6, 0, TAU); ctx.fill();
        ctx.globalAlpha = 1;
        break;
      }
      case 'pipe': {
        const p = g.p, n = p.length >> 1; if (n < 2) break;
        const tw = Math.max(16, (g.r || 22) * 1.1);
        const path = new Path2D(); path.moveTo(p[0], p[1]); for (let k = 1; k < n; k++) path.lineTo(p[2 * k], p[2 * k + 1]);
        ctx.lineJoin = 'round'; ctx.lineCap = 'butt';
        ctx.strokeStyle = col.pipeDark; ctx.lineWidth = tw + 6; ctx.stroke(path);
        ctx.strokeStyle = col.pipe; ctx.lineWidth = tw; ctx.stroke(path);
        ctx.strokeStyle = col.pipeHi; ctx.lineWidth = tw * 0.22; ctx.globalAlpha = 0.6; ctx.stroke(path);
        ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2; ctx.globalAlpha = 0.3; ctx.setLineDash([4, 22]); ctx.lineDashOffset = -t * 60; ctx.stroke(path); ctx.setLineDash([]); ctx.lineDashOffset = 0; ctx.globalAlpha = 1;
        // ball glow travelling inside
        if (S.ride === i) {
          ctx.globalCompositeOperation = 'lighter';
          const gg = ctx.createRadialGradient(S.x, S.y, 1, S.x, S.y, tw);
          gg.addColorStop(0, 'rgba(255,255,220,0.9)'); gg.addColorStop(1, 'rgba(255,255,200,0)');
          ctx.fillStyle = gg; ctx.beginPath(); ctx.arc(S.x, S.y, tw, 0, TAU); ctx.fill();
          ctx.globalCompositeOperation = 'source-over';
        }
        // mouths
        const mouth = (x, y, ax, ay, entry) => {
          const a = Math.atan2(ay, ax);
          rotTo(ctx, x, y, a);
          ctx.fillStyle = col.pipeDark; rrect(ctx, -2, -tw / 2 - 6, 12, tw + 12, 3); ctx.fill();
          ctx.fillStyle = col.pipe; rrect(ctx, 0, -tw / 2 - 4, 8, tw + 8, 2); ctx.fill();
          ctx.fillStyle = col.pipeHi; ctx.fillRect(1, -tw / 2 - 3, 6, 2);
          ctx.fillStyle = '#0a1a10'; ctx.beginPath(); ctx.ellipse(-1, 0, 3, tw / 2 - 1, 0, 0, TAU); ctx.fill();
          ctx.restore();
          if (entry) { ctx.strokeStyle = col.pipeHi; ctx.globalAlpha = 0.3 + 0.25 * Math.sin(t * 4); ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y, (g.r || 22) + 4 + Math.sin(t * 4) * 2, 0, TAU); ctx.stroke(); ctx.globalAlpha = 1; }
        };
        mouth(p[0], p[1], p[0] - p[2], p[1] - p[3], true);
        mouth(p[2 * n - 2], p[2 * n - 1], p[2 * n - 2] - p[2 * n - 4], p[2 * n - 1] - p[2 * n - 3], false);
        break;
      }
      case 'floatpool': {
        const wave = (x) => g.y + Math.sin(x * 0.05 + t * 2.2) * 2 + Math.sin(x * 0.13 - t * 1.4) * 0.8;
        ctx.beginPath(); ctx.moveTo(g.x, g.y + g.h);
        for (let x = g.x; x <= g.x + g.w; x += 8) ctx.lineTo(x, wave(x));
        ctx.lineTo(g.x + g.w, wave(g.x + g.w)); ctx.lineTo(g.x + g.w, g.y + g.h); ctx.closePath();
        const gr = ctx.createLinearGradient(0, g.y, 0, g.y + g.h);
        gr.addColorStop(0, rgba(col.pool, 0.35)); gr.addColorStop(1, rgba(col.waterDeep, 0.6));
        ctx.fillStyle = gr; ctx.fill();
        ctx.beginPath(); for (let x = g.x; x <= g.x + g.w; x += 8) { if (x === g.x) ctx.moveTo(x, wave(x)); else ctx.lineTo(x, wave(x)); }
        ctx.strokeStyle = col.waterHi; ctx.lineWidth = 2; ctx.globalAlpha = 0.85; ctx.stroke(); ctx.globalAlpha = 1;
        // current arrows
        const cur = g.cur || 0;
        if (Math.abs(cur) > 1) {
          ctx.save(); ctx.beginPath(); ctx.rect(g.x, g.y, g.w, g.h); ctx.clip();
          const sg = cur > 0 ? 1 : -1, gap = 48, off = frac(t * Math.abs(cur) / gap) * gap * sg;
          for (let row = 0; row < Math.max(1, Math.floor(g.h / 40)); row++) {
            const yy = g.y + 14 + row * 40;
            ctx.translate(0, 0);
            ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2.2; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
            for (let x = g.x - gap + off + (row & 1) * gap / 2; x < g.x + g.w + gap; x += gap) {
              ctx.globalAlpha = 0.35 * Math.sin(clamp((x - g.x) / g.w, 0, 1) * Math.PI);
              ctx.beginPath(); ctx.moveTo(x - sg * 5, yy - 5); ctx.lineTo(x + sg * 2, yy); ctx.lineTo(x - sg * 5, yy + 5); ctx.stroke();
            }
          }
          ctx.restore();
        }
        // bubbles
        ctx.fillStyle = '#ffffff';
        for (let k = 0; k < Math.max(3, g.w / 50); k++) {
          const u = frac(t * 0.35 + hash1(k * 4.4 + i)), x = g.x + hash1(k * 9.1 + i) * g.w + Math.sin(t * 2 + k) * 3, y = g.y + g.h - u * (g.h - 4);
          ctx.globalAlpha = 0.45 * Math.sin(u * Math.PI); ctx.beginPath(); ctx.arc(x, y, 1.5 + hash1(k) * 1.5, 0, TAU); ctx.fill();
        }
        ctx.globalAlpha = 1;
        break;
      }
      case 'flood': {
        const target = P.floodLevel(g, S.strokes || 0);
        if (sc.floodY === null || !isFinite(sc.floodY) || dt <= 0) sc.floodY = target;
        else sc.floodY += (target - sc.floodY) * Math.min(1, dt * 1.8);
        const L = sc.floodY;
        const x0 = view ? view.x0 - 20 : sc.bounds.XL, x1 = view ? view.x1 + 20 : sc.bounds.XR, yb = view ? Math.max(view.y1, L) + 40 : sc.maxG + 600;
        if (view && L > view.y1) break;
        const wave = (x) => L + Math.sin(x * 0.03 + t * 1.6) * 2.4 + Math.sin(x * 0.09 - t * 2.1) * 1.2;
        ctx.beginPath(); ctx.moveTo(x0, yb);
        for (let x = x0; x < x1; x += 10) ctx.lineTo(x, wave(x));
        ctx.lineTo(x1, wave(x1)); ctx.lineTo(x1, yb); ctx.closePath();
        const gr = ctx.createLinearGradient(0, L, 0, L + 400);
        gr.addColorStop(0, rgba(col.flood, 0.5)); gr.addColorStop(1, rgba(col.waterDeep, 0.82));
        ctx.fillStyle = gr; ctx.fill();
        if (sc.cb) { const pt = cbPattern(ctx, 'wave'); if (pt) { ctx.fillStyle = pt; ctx.globalAlpha = 0.45; ctx.fill(); ctx.globalAlpha = 1; } }
        ctx.beginPath(); for (let x = x0; x < x1; x += 10) { if (x === x0) ctx.moveTo(x, wave(x)); else ctx.lineTo(x, wave(x)); }
        ctx.strokeStyle = col.waterHi; ctx.lineWidth = 2.5; ctx.globalAlpha = 0.85; ctx.stroke();
        ctx.fillStyle = '#ffffff';
        for (let x = Math.floor(x0 / 60) * 60; x < x1; x += 60) { const a = Math.sin(t * 2 + x * 0.7); if (a < 0.5) continue; ctx.globalAlpha = (a - 0.5) * 1.6; ctx.fillRect(x + hash1(x) * 30, wave(x) + 5, 10, 1.6); }
        // next level warning line
        const nxt = P.floodLevel(g, (S.strokes || 0) + 1);
        if (nxt < L - 2) {
          ctx.globalAlpha = 0.35 + 0.15 * Math.sin(t * 3); ctx.strokeStyle = col.waterHi; ctx.lineWidth = 1.5; ctx.setLineDash([10, 8]); ctx.lineDashOffset = -t * 15;
          ctx.beginPath(); ctx.moveTo(x0, nxt); ctx.lineTo(x1, nxt); ctx.stroke(); ctx.setLineDash([]); ctx.lineDashOffset = 0;
        }
        ctx.globalAlpha = 1;
        break;
      }
      case 'geyser': {
        const T = g.T || 3, on = g.on || 0.4, f = frac(tg / T + (g.ph || 0));
        if (f >= on) break;
        const grow = clamp(f / 0.06, 0, 1), fade = clamp((on - f) / 0.06, 0, 1), hh = g.h * grow, hw = g.w / 2, base = g.y - 10;
        ctx.globalAlpha = 0.75 * fade;
        ctx.beginPath(); ctx.moveTo(g.x - hw * 0.45, base);
        for (let k = 0; k <= 12; k++) { const u = k / 12, y = base - hh * u, w = hw * (0.45 + 0.55 * u) + Math.sin(t * 14 + u * 9) * 3; ctx.lineTo(g.x - w, y); }
        for (let k = 12; k >= 0; k--) { const u = k / 12, y = base - hh * u, w = hw * (0.45 + 0.55 * u) + Math.sin(t * 13 + u * 8 + 2) * 3; ctx.lineTo(g.x + w, y); }
        ctx.closePath();
        const gr = ctx.createLinearGradient(0, base, 0, base - hh);
        gr.addColorStop(0, rgba(col.water, 0.85)); gr.addColorStop(1, rgba(col.geyser, 0.5));
        ctx.fillStyle = gr; ctx.fill();
        ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2; ctx.globalAlpha = 0.5 * fade;
        for (let k = 0; k < 4; k++) { const u = frac(t * 2.5 + k / 4), y = base - hh * u, w = hw * (0.45 + 0.55 * u) * 0.6; ctx.beginPath(); ctx.moveTo(g.x - w, y); ctx.lineTo(g.x - w * 0.6, y - 10); ctx.moveTo(g.x + w * 0.3, y + 4); ctx.lineTo(g.x + w * 0.5, y - 8); ctx.stroke(); }
        // spray crown
        ctx.fillStyle = '#ffffff';
        for (let k = 0; k < 10; k++) { const u = frac(t * 1.8 + k / 10), a = -Math.PI / 2 + (hash1(k) - 0.5) * 2.2, d = u * hw * 1.4; ctx.globalAlpha = 0.7 * (1 - u) * fade * grow; ctx.beginPath(); ctx.arc(g.x + Math.cos(a) * d, base - hh + Math.sin(a) * d + u * u * 30, 2.5 * (1 - u) + 1, 0, TAU); ctx.fill(); }
        ctx.globalAlpha = 1;
        break;
      }
      case 'tornado': {
        const cx = P.tornadoX ? P.tornadoX(g, tg) : g.x, hw = g.w / 2, base = g.y, top = g.y - g.h;
        const xAt = (u) => cx + Math.sin(t * 2.2 + u * 3) * 6 * u;
        // body
        ctx.beginPath(); ctx.moveTo(xAt(0) - hw * 0.25, base);
        for (let k = 0; k <= 10; k++) { const u = k / 10; ctx.lineTo(xAt(u) - hw * (0.25 + 0.75 * u), base - g.h * u); }
        for (let k = 10; k >= 0; k--) { const u = k / 10; ctx.lineTo(xAt(u) + hw * (0.25 + 0.75 * u), base - g.h * u); }
        ctx.closePath();
        const gr = ctx.createLinearGradient(0, base, 0, top);
        gr.addColorStop(0, rgba(col.tornado, 0.6)); gr.addColorStop(1, rgba(col.tornado, 0.25));
        ctx.fillStyle = gr; ctx.fill();
        // swirling bands
        ctx.strokeStyle = '#ffffff'; ctx.lineCap = 'round';
        for (let k = 0; k < 9; k++) {
          const u = (k + 0.5) / 9, y = base - g.h * u, w = hw * (0.25 + 0.75 * u), ph = t * (6 - u * 2) + k * 1.3;
          ctx.lineWidth = 1.5 + u * 1.5; ctx.globalAlpha = 0.8; ctx.strokeStyle = '#ffffff';
          ctx.beginPath(); ctx.ellipse(xAt(u), y, w, 3 + u * 5, 0, ph % TAU, ph % TAU + 2.2); ctx.stroke();
          ctx.globalAlpha = 0.5; ctx.strokeStyle = shade(col.tornado, -0.35);
          ctx.beginPath(); ctx.ellipse(xAt(u), y, w * 0.8, 2 + u * 4, 0, (ph + 3) % TAU, (ph + 3) % TAU + 1.6); ctx.stroke();
        }
        // debris
        ctx.fillStyle = shade(col.pal.ground, 0.1);
        for (let k = 0; k < 10; k++) {
          const u = frac(t * 0.3 + k / 10), a = t * 6 + k * 2.1, w = hw * (0.25 + 0.75 * u);
          ctx.globalAlpha = 0.7 * Math.sin(u * Math.PI); ctx.fillRect(xAt(u) + Math.cos(a) * w - 1.5, base - g.h * u + Math.sin(a) * 4, 3, 3);
        }
        // dust at the base
        ctx.fillStyle = rgba(col.pal.ground, 0.25);
        for (let k = 0; k < 5; k++) { const s = frac(t * 0.9 + k / 5); ctx.globalAlpha = 0.6 * (1 - s); ctx.beginPath(); ctx.arc(cx + (k - 2) * 8 + (k - 2) * s * 14, base - 4 - s * 8, 6 + s * 8, 0, TAU); ctx.fill(); }
        ctx.globalAlpha = 1;
        break;
      }
    }
    ctx.globalAlpha = 1; ctx.setLineDash([]); ctx.lineDashOffset = 0; ctx.globalCompositeOperation = 'source-over';
  }
  function platBody(ctx, col, x, y, w, h, top) {
    ctx.fillStyle = col.metalDark; rrect(ctx, x, y, w, h, 3); ctx.fill();
    ctx.fillStyle = col.metal; rrect(ctx, x + 1.5, y + 1.5, w - 3, h - 3, 2); ctx.fill();
    ctx.fillStyle = top.c; ctx.fillRect(x, y, w, Math.min(5, h)); ctx.fillStyle = top.hi; ctx.fillRect(x, y, w, 1.5);
    ctx.fillStyle = col.metalDark; for (let rx = x + 6; rx < x + w - 3; rx += 16) { ctx.beginPath(); ctx.arc(rx, y + h * 0.65, 1.4, 0, TAU); ctx.fill(); }
  }
  function swirl(ctx, x, y, r, c, t, dir) {
    ctx.fillStyle = '#0d0b1a'; ctx.globalAlpha = 0.6; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill(); ctx.globalAlpha = 1;
    ctx.strokeStyle = c; ctx.lineCap = 'round';
    for (let k = 0; k < 3; k++) {
      const rr = r * (0.88 - k * 0.25), a = t * (2.5 + k) * dir + k * 2;
      ctx.lineWidth = 3 - k * 0.6; ctx.globalAlpha = 0.9 - k * 0.2;
      ctx.beginPath(); ctx.arc(x, y, rr, a, a + 3.6); ctx.stroke();
    }
    ctx.globalAlpha = 0.5 + 0.3 * Math.sin(t * 4); ctx.fillStyle = c; ctx.beginPath(); ctx.arc(x, y, r * 0.18, 0, TAU); ctx.fill();
    ctx.globalAlpha = 1;
    for (let k = 0; k < 4; k++) { const a = t * 1.8 * dir + k * TAU / 4; ctx.fillStyle = c; ctx.beginPath(); ctx.arc(x + Math.cos(a) * (r + 5), y + Math.sin(a) * (r + 5), 1.8, 0, TAU); ctx.fill(); }
  }
  function portalRing(ctx, x, y, r, c, a, t) {
    ctx.fillStyle = c; ctx.globalAlpha = 0.18; ctx.beginPath(); ctx.arc(x, y, r + 6 + Math.sin(t * 3) * 2, 0, TAU); ctx.fill();
    ctx.globalAlpha = 0.65; ctx.fillStyle = '#0b0a14'; ctx.beginPath(); ctx.arc(x, y, r - 2, 0, TAU); ctx.fill();
    ctx.globalAlpha = 1; ctx.strokeStyle = c; ctx.lineWidth = 5; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.stroke();
    ctx.strokeStyle = shade(c, 0.5); ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(x, y, r, t * 2, t * 2 + 1.5); ctx.stroke();
    if (a !== undefined) {
      rotTo(ctx, x, y, a);
      const o = frac(t * 1.2) * 4;
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2.5; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.beginPath(); ctx.moveTo(-r * 0.45, 0); ctx.lineTo(r * 0.5 + o, 0); ctx.moveTo(r * 0.2 + o, -r * 0.3); ctx.lineTo(r * 0.5 + o, 0); ctx.lineTo(r * 0.2 + o, r * 0.3); ctx.stroke();
      ctx.fillStyle = c; ctx.beginPath(); ctx.moveTo(r + 4, 0); ctx.lineTo(r + 13, -6); ctx.lineTo(r + 13, 6); ctx.closePath(); ctx.globalAlpha = 0.9; ctx.fill(); ctx.globalAlpha = 1;
      ctx.restore();
    }
  }
  function poses() { return (GOLF.Physics && GOLF.Physics.poses) || FALLBACK_POSES; }
  const FALLBACK_POSES = {
    angle: (g, tg) => (g.ph || 0) + g.w * tg,
    movplat: (g, tg) => { const s = 0.5 - 0.5 * Math.cos(TAU * (tg / (g.T || 4) + (g.ph || 0))); return [g.x + (g.x2 - g.x) * s, g.y + (g.y2 - g.y) * s, 0, 0]; },
    doorClosed: (g, tg) => frac(tg / (g.T || 3) + (g.ph || 0)) >= (g.open || 0.5),
    doorOpenAmt: () => 0, vanishOn: () => true, vanishLeft: () => 1,
    cannonAngle: (g, tg) => g.ang + (g.amp || 0) * Math.sin(tg * (g.f || 1.5)),
    windFactor: () => 1,
    pendulum: (g) => [Math.PI / 2, 0], piston: () => [0, 0, 0, 0], crusher: () => [0, 0], crusherWarn: () => false,
    sawPos: (g) => [g.x, g.y, 0, 0], laserOn: () => true, laserWarn: () => false, geyserOn: () => false,
    tornadoX: (g) => g.x, liftTop: (g) => [g.y2, 0], blinkIndex: () => 0,
    floodLevel: (g, s) => Math.max(g.top, g.y0 - g.dy * Math.max(0, s - 1)), phaseSolid: (g, s) => (s % 2 === 1) === !!g.odd,
  };

  // ---------------------------------------------------------------- cup / flag / tee
  function drawCupNotch(ctx, sc, cup) {
    const { x, y, w } = cup, col = sc.col;
    if (sc.movcup) {
      const m = sc.movcup; ctx.fillStyle = col.pal.accent; ctx.globalAlpha = 0.35;
      for (let xx = Math.min(m.x1, m.x2); xx <= Math.max(m.x1, m.x2); xx += 14) { ctx.beginPath(); ctx.arc(xx, groundY(sc.hole, xx) + 6, 1.6, 0, TAU); ctx.fill(); }
      ctx.globalAlpha = 1;
    }
    ctx.fillStyle = '#0c0b12';
    ctx.beginPath(); ctx.moveTo(x - w / 2, y - 2); ctx.lineTo(x - w / 2, y + 10); ctx.quadraticCurveTo(x - w / 2, y + 15, x - w / 2 + 5, y + 15);
    ctx.lineTo(x + w / 2 - 5, y + 15); ctx.quadraticCurveTo(x + w / 2, y + 15, x + w / 2, y + 10); ctx.lineTo(x + w / 2, y - 2); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#2a2833'; ctx.fillRect(x - w / 2, y - 2, w, 3);
    ctx.fillStyle = '#ffffff'; ctx.globalAlpha = 0.85; ctx.fillRect(x - w / 2 - 2, y - 2.5, 3, 2.5); ctx.fillRect(x + w / 2 - 1, y - 2.5, 3, 2.5); ctx.globalAlpha = 1;
    if (cup.open === false) drawCupLid(ctx, sc, cup);
  }
  // closed lid (tokens not all collected)
  function drawCupLid(ctx, sc, cup) {
    const { x, y, w } = cup, col = sc.col;
    ctx.fillStyle = col.metalDark; rrect(ctx, x - w / 2 - 5, y - 7, w + 10, 7, 3); ctx.fill();
    ctx.fillStyle = col.token; rrect(ctx, x - w / 2 - 3, y - 6, w + 6, 4, 2); ctx.fill();
    ctx.fillStyle = col.tokenDk; for (let xx = x - w / 2; xx < x + w / 2 - 2; xx += 7) ctx.fillRect(xx, y - 6, 3, 4);
    // padlock
    ctx.strokeStyle = col.metalDark; ctx.lineWidth = 2.2; ctx.beginPath(); ctx.arc(x, y - 14, 4, Math.PI, TAU); ctx.lineTo(x + 4, y - 11); ctx.moveTo(x - 4, y - 11); ctx.lineTo(x - 4, y - 14); ctx.stroke();
    ctx.fillStyle = col.token; rrect(ctx, x - 6, y - 12, 12, 9, 2); ctx.fill();
    ctx.strokeStyle = col.tokenDk; ctx.lineWidth = 1; ctx.stroke();
    ctx.fillStyle = col.tokenDk; ctx.fillRect(x - 1, y - 9.5, 2, 4);
  }
  // flag cloth outlines in (u, v) space: u along the cloth (0 = pole), v down (0 = top edge)
  const FLAG_SHAPES = {
    classic: [[0, 0], [1, 0.35], [0, 1]],
    tri: [[0, 0], [1, 0.5], [0, 1]],
    rect: [[0, 0], [1, 0], [1, 1], [0, 1]],
    swallow: [[0, 0], [1, 0], [0.72, 0.5], [1, 1], [0, 1]],
    fish: [[0, 0.18], [0.45, 0], [0.78, 0.22], [1, 0.02], [0.9, 0.5], [1, 0.98], [0.78, 0.78], [0.45, 1], [0, 0.82]],
  };
  const INVADER = ['00100100', '00011000', '01111110', '11011011', '11111111', '10111101', '10100101', '00011000'];
  function boltPath(p, x, y, s) {
    p.moveTo(x + 0.15 * s, y - s); p.lineTo(x - 0.45 * s, y + 0.1 * s); p.lineTo(x - 0.02 * s, y + 0.1 * s);
    p.lineTo(x - 0.2 * s, y + s); p.lineTo(x + 0.45 * s, y - 0.15 * s); p.lineTo(x + 0.02 * s, y - 0.15 * s); p.closePath();
  }
  function drawEmblem(ctx, kind, x, y, s, c, bg, num, t) {
    ctx.fillStyle = c; ctx.strokeStyle = c; t = t || 0;
    switch (kind) {
      case 'crown': {
        ctx.beginPath(); ctx.moveTo(x - s, y + s * 0.6); ctx.lineTo(x - s, y - s * 0.3); ctx.lineTo(x - s * 0.5, y + s * 0.1); ctx.lineTo(x, y - s * 0.7); ctx.lineTo(x + s * 0.5, y + s * 0.1); ctx.lineTo(x + s, y - s * 0.3); ctx.lineTo(x + s, y + s * 0.6); ctx.closePath(); ctx.fill();
        ctx.fillStyle = bg; ctx.fillRect(x - s * 0.8, y + s * 0.3, s * 1.6, s * 0.12);
        const tw = Math.max(0, Math.sin(t * 3)); if (tw > 0.2) { ctx.fillStyle = '#ffffff'; ctx.globalAlpha = tw; ctx.beginPath(); starPath(ctx, x, y - s * 0.75, s * 0.45 * tw, s * 0.08, 4, 0); ctx.fill(); ctx.globalAlpha = 1; }
        break;
      }
      case 'cal': ctx.font = '900 ' + (s * 1.45).toFixed(1) + 'px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('7', x, y + s * 0.35); break;
      case 'watch': {
        ctx.lineWidth = s * 0.2; ctx.beginPath(); ctx.arc(x, y + s * 0.1, s * 0.85, 0, TAU); ctx.stroke();
        ctx.fillRect(x - s * 0.2, y - s * 1.0, s * 0.4, s * 0.22);
        ctx.lineWidth = s * 0.14; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(x, y + s * 0.1); const a = t * 4 - Math.PI / 2; ctx.lineTo(x + Math.cos(a) * s * 0.65, y + s * 0.1 + Math.sin(a) * s * 0.65); ctx.stroke();
        ctx.fillStyle = '#ff4757'; ctx.beginPath(); ctx.arc(x, y + s * 0.1, s * 0.14, 0, TAU); ctx.fill();
        break;
      }
      case 'cap': {
        ctx.beginPath(); ctx.moveTo(x - s, y - s * 0.15); ctx.lineTo(x, y - s * 0.6); ctx.lineTo(x + s, y - s * 0.15); ctx.lineTo(x, y + s * 0.3); ctx.closePath(); ctx.fill();
        ctx.fillRect(x - s * 0.5, y + s * 0.05, s, s * 0.45);
        ctx.lineWidth = s * 0.1; ctx.beginPath(); ctx.moveTo(x + s * 0.7, y - s * 0.25); ctx.lineTo(x + s * 0.75, y + s * 0.6); ctx.stroke();
        break;
      }
      case 'star': ctx.beginPath(); starPath(ctx, x, y, s, s * 0.45, 5, 0); ctx.fill(); break;
      case 'heart': ctx.beginPath(); heartPath(ctx, x, y + s * 0.3, s * 0.95, 0); ctx.fill(); break;
      case 'bolt': ctx.beginPath(); boltPath(ctx, x, y, s); ctx.fill(); break;
      case 'moon': {
        ctx.beginPath(); ctx.arc(x, y, s * 0.8, 0, TAU); ctx.fill();
        ctx.fillStyle = bg; ctx.beginPath(); ctx.arc(x + s * 0.38, y - s * 0.22, s * 0.68, 0, TAU); ctx.fill();
        ctx.fillStyle = c; ctx.beginPath(); starPath(ctx, x + s * 0.9, y + s * 0.45, s * 0.28, s * 0.11, 4, 0); ctx.fill();
        ctx.beginPath(); starPath(ctx, x + s * 0.55, y + s * 0.95, s * 0.18, s * 0.07, 4, 0); ctx.fill();
        break;
      }
      case 'skull': {
        const k = s * 0.95;
        ctx.lineWidth = k * 0.22; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(x - k * 0.9, y + k * 0.15); ctx.lineTo(x + k * 0.9, y + k * 1.0); ctx.moveTo(x + k * 0.9, y + k * 0.15); ctx.lineTo(x - k * 0.9, y + k * 1.0); ctx.stroke();
        ctx.beginPath(); ctx.arc(x, y - k * 0.15, k * 0.58, 0, TAU); ctx.fill();
        rrect(ctx, x - k * 0.32, y + k * 0.15, k * 0.64, k * 0.42, k * 0.1); ctx.fill();
        ctx.fillStyle = bg; ctx.beginPath(); ctx.arc(x - k * 0.22, y - k * 0.15, k * 0.15, 0, TAU); ctx.arc(x + k * 0.22, y - k * 0.15, k * 0.15, 0, TAU); ctx.fill();
        ctx.fillRect(x - k * 0.05, y + k * 0.32, k * 0.1, k * 0.25);
        break;
      }
      case 'num': {
        ctx.font = '900 ' + (s * 1.5).toFixed(1) + 'px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(String(num || 1), x, y + s * 0.08); break;
      }
    }
  }
  // flagSt = COSMETICS.flags entry (null -> classic); decoy = darken every colour slightly (the tell)
  function drawFlag(ctx, sc, cup, t, holed, wave, fcol, decoy) {
    const { x, y } = cup, col = sc.col, top = y - 88;
    const st = decoy === 'plain' ? null : (sc.flagSt || null);
    ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(x, y + 12); ctx.lineTo(x, top); ctx.stroke();
    ctx.strokeStyle = st && st.fill === 'gold' ? '#ffe9a0' : '#f4f4f4'; ctx.lineWidth = 2.5; ctx.stroke();
    const dk = decoy ? (c) => shade(c, -0.13) : (c) => c;
    const L = (st && st.L) || 38, H = (st && st.H) || 24, amp = 3.5 * (wave === undefined ? 1 : wave);
    const wv = (u) => Math.sin(t * 5.5 - u * 3.2) * u * amp;
    const fl = st && st.flip ? -1 : 1;
    const MX = (u) => x + fl * (1 + u * L), MY = (u, v) => top + v * H + wv(u);
    // colour-blind decoy tell: a notch cut from the fly end + a square hole + square finial
    const cbDecoy = decoy && decoy !== 'plain' && sc.cb;
    if (cbDecoy) {
      ctx.save(); ctx.beginPath(); ctx.rect(x - 200, top - 200, 400, 400);
      ctx.moveTo(MX(1.08), MY(1.08, 0.12)); ctx.lineTo(MX(0.62), MY(0.62, 0.5)); ctx.lineTo(MX(1.08), MY(1.08, 0.88)); ctx.closePath();
      const hs = 0.13; ctx.moveTo(MX(0.22), MY(0.22, 0.5 - hs * 1.4)); ctx.lineTo(MX(0.22 + hs), MY(0.22 + hs, 0.5 - hs * 1.4)); ctx.lineTo(MX(0.22 + hs), MY(0.22 + hs, 0.5 + hs * 1.4)); ctx.lineTo(MX(0.22), MY(0.22, 0.5 + hs * 1.4)); ctx.closePath();
      ctx.clip('evenodd');
    }
    const shape = FLAG_SHAPES[st ? st.shape : 'classic'] || FLAG_SHAPES.rect;
    const path = () => {
      ctx.beginPath();
      for (let k = 0; k < shape.length; k++) {
        const a = shape[k], b = shape[(k + 1) % shape.length];
        for (let j = 0; j < 4; j++) { const s = j / 4, u = a[0] + (b[0] - a[0]) * s, v = a[1] + (b[1] - a[1]) * s; if (k === 0 && j === 0) ctx.moveTo(MX(u), MY(u, v)); else ctx.lineTo(MX(u), MY(u, v)); }
      }
      ctx.closePath();
    };
    const quad = (u0, v0, u1, v1) => { ctx.beginPath(); ctx.moveTo(MX(u0), MY(u0, v0)); ctx.lineTo(MX(u1), MY(u1, v0)); ctx.lineTo(MX(u1), MY(u1, v1)); ctx.lineTo(MX(u0), MY(u0, v1)); ctx.closePath(); ctx.fill(); };
    const fillMode = st ? st.fill : 'accent';
    const cols = st && st.cols ? st.cols.map(dk) : null;
    const base = fillMode === 'accent' ? (fcol || dk(col.pal.accent)) : cols[0];
    path(); ctx.fillStyle = base; ctx.fill();
    if (fillMode !== 'accent' && fillMode !== 'solid' && fillMode !== 'neon') {
      ctx.save(); path(); ctx.clip();
      const NU = 8;
      if (fillMode === 'bands') {
        const n = cols.length;
        for (let j = 1; j < n; j++) { ctx.fillStyle = cols[j]; for (let i = 0; i < NU; i++) quad(i / NU, j / n, (i + 1) / NU + 0.002, (j + 1) / n); }
      } else if (fillMode === 'checker') {
        ctx.fillStyle = cols[1];
        for (let i = 0; i < 6; i++) for (let j = 0; j < 4; j++) if ((i + j) & 1) quad(i / 6, j / 4, (i + 1) / 6, (j + 1) / 4);
      } else if (fillMode === 'border') {
        ctx.fillStyle = cols[1];
        for (let i = 0; i < NU; i++) { quad(i / NU, -0.05, (i + 1) / NU + 0.002, 0.14); quad(i / NU, 0.86, (i + 1) / NU + 0.002, 1.05); }
        quad(0.88, -0.05, 1.05, 1.05);
      } else if (fillMode === 'pixel') {
        ctx.fillStyle = cols[1];
        for (let j = 0; j < 8; j++) for (let i = 0; i < 8; i++) if (INVADER[j][i] === '1') quad(0.12 + i * 0.095, 0.08 + j * 0.105, 0.12 + (i + 1) * 0.095 + 0.004, 0.08 + (j + 1) * 0.105 + 0.004);
      } else if (fillMode === 'koi') {
        ctx.fillStyle = cols[2]; for (let i = 0; i < NU; i++) if (i & 1) quad(i / NU + 0.02, 0, (i + 1) / NU - 0.02, 1);
        ctx.fillStyle = cols[1];
        ctx.beginPath(); ctx.ellipse(MX(0.38), MY(0.38, 0.38), L * 0.12, H * 0.2, 0.3, 0, TAU); ctx.fill();
        ctx.beginPath(); ctx.ellipse(MX(0.62), MY(0.62, 0.62), L * 0.1, H * 0.16, -0.3, 0, TAU); ctx.fill();
        ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(MX(0.11), MY(0.11, 0.38), 2.6, 0, TAU); ctx.fill();
        ctx.fillStyle = '#111111'; ctx.beginPath(); ctx.arc(MX(0.11) + 0.5, MY(0.11, 0.38), 1.3, 0, TAU); ctx.fill();
      } else if (fillMode === 'mirror') {
        // diagonal split, reflected colours + a moving glint line along the mirror seam
        const poly = (pts) => { ctx.beginPath(); for (let k = 0; k < pts.length; k++) { const a = pts[k], b = pts[(k + 1) % pts.length]; for (let j = 0; j < 4; j++) { const q = j / 4, u = a[0] + (b[0] - a[0]) * q, v = a[1] + (b[1] - a[1]) * q; if (!k && !j) ctx.moveTo(MX(u), MY(u, v)); else ctx.lineTo(MX(u), MY(u, v)); } } ctx.closePath(); ctx.fill(); };
        ctx.fillStyle = cols[1]; poly([[0, 1.05], [1.05, -0.05], [1.05, 1.05]]);
        ctx.fillStyle = cols[2]; ctx.globalAlpha = 0.9; const q = frac(t * 0.4);
        poly([[q - 0.06, 1.05 - q * 1.1 + 0.06], [q + 0.06, 1.05 - q * 1.1 - 0.06], [q + 0.1, 1.05 - q * 1.1 - 0.02], [q - 0.02, 1.05 - q * 1.1 + 0.1]]);
        ctx.globalAlpha = 1;
      } else if (fillMode === 'calendar') {
        ctx.fillStyle = cols[1]; for (let i = 0; i < NU; i++) quad(i / NU, -0.05, (i + 1) / NU + 0.002, 0.3);
        ctx.fillStyle = cols[2]; for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.arc(MX(0.25 + i * 0.25), MY(0.25 + i * 0.25, 0.08), 1.6, 0, TAU); ctx.fill(); }
      } else if (fillMode === 'gold') {
        ctx.fillStyle = cols[2]; ctx.globalAlpha = 0.35; for (let i = 0; i < NU; i++) quad(i / NU, 0.7, (i + 1) / NU + 0.002, 1.05);
        ctx.globalAlpha = 0.75; ctx.fillStyle = cols[1];
        const sw = frac(t * 0.35) * 1.8 - 0.4;
        ctx.beginPath(); ctx.moveTo(MX(sw), MY(sw, -0.1)); ctx.lineTo(MX(sw + 0.14), MY(sw + 0.14, -0.1)); ctx.lineTo(MX(sw - 0.06), MY(sw - 0.06, 1.1)); ctx.lineTo(MX(sw - 0.2), MY(sw - 0.2, 1.1)); ctx.closePath(); ctx.fill();
        ctx.globalAlpha = 1;
      }
      ctx.restore();
    }
    if (fillMode === 'neon') {
      ctx.globalCompositeOperation = 'lighter';
      path(); ctx.strokeStyle = cols[1]; ctx.lineJoin = 'round';
      ctx.globalAlpha = 0.35; ctx.lineWidth = 4; ctx.stroke(); ctx.globalAlpha = 1; ctx.lineWidth = 1.5; ctx.stroke();
      const pulse = 0.6 + 0.4 * Math.sin(t * 6);
      ctx.strokeStyle = cols[2]; ctx.globalAlpha = pulse; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(MX(0.12), MY(0.12, 0.3)); ctx.lineTo(MX(0.55), MY(0.55, 0.5)); ctx.lineTo(MX(0.12), MY(0.12, 0.7)); ctx.stroke();
      ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    } else {
      path(); ctx.strokeStyle = shade(base, -0.3); ctx.lineWidth = 1; ctx.stroke();
    }
    if (fillMode === 'accent') {
      ctx.fillStyle = shade(base, 0.35); ctx.globalAlpha = 0.6;
      ctx.beginPath(); ctx.moveTo(x + 1, top + 3); for (let k = 1; k <= 5; k++) { const u = k / 8; ctx.lineTo(x + 1 + u * L, top + 3 + wv(u)); } for (let k = 5; k >= 0; k--) { const u = k / 8; ctx.lineTo(x + 1 + u * L, top + 7 + wv(u)); } ctx.closePath(); ctx.fill();
      ctx.globalAlpha = 1;
    }
    if (st && st.emblem && !cbDecoy) {
      const cu = st.shape === 'swallow' ? 0.4 : 0.5;
      drawEmblem(ctx, st.emblem, MX(cu), MY(cu, 0.5), H * 0.36, dk(st.ec || '#ffffff'), base, sc.flagNum, t);
    }
    if (cbDecoy) {
      ctx.restore();
      ctx.fillStyle = '#ffd34a'; ctx.strokeStyle = '#222'; ctx.lineWidth = 1; ctx.fillRect(x - 3.5, top - 6, 7, 7); ctx.strokeRect(x - 3.5, top - 6, 7, 7);
      return;
    }
    ctx.fillStyle = st && (st.fill === 'gold' || st.fill === 'gold2') ? '#fff2a0' : '#ffd34a'; ctx.beginPath(); ctx.arc(x, top - 2, 3, 0, TAU); ctx.fill();
  }
  function drawTee(ctx, sc) {
    const tee = sc.hole.tee; if (!tee) return;
    const gy = groundY(sc.hole, tee[0]);
    for (const dx of [-18, 18]) {
      ctx.fillStyle = 'rgba(0,0,0,0.3)'; rrect(ctx, tee[0] + dx - 3, gy - 6, 7, 7, 2); ctx.fill();
      ctx.fillStyle = dx < 0 ? '#ffffff' : sc.col.pal.accent; rrect(ctx, tee[0] + dx - 3.5, gy - 7, 7, 7, 2); ctx.fill();
    }
  }

  // ---------------------------------------------------------------- ball
  function drawBall(ctx, st, x, y, r, rot, vx, vy, look, t) {
    t = t || 0; look = look || [1, 0]; const A0 = ctx.globalAlpha;
    ctx.save(); ctx.translate(x, y);
    ctx.lineWidth = 1.4; ctx.strokeStyle = st.stroke || '#222';
    const fillC = (c) => { ctx.fillStyle = c; ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.fill(); };
    const shine = () => { ctx.fillStyle = '#ffffff'; ctx.globalAlpha = A0 * 0.65; ctx.beginPath(); ctx.ellipse(-r * 0.35, -r * 0.4, r * 0.32, r * 0.2, -0.6, 0, TAU); ctx.fill(); ctx.globalAlpha = A0 * 1; };
    const outline = () => { ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.stroke(); };
    const clipIn = () => { ctx.save(); ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.clip(); };
    const rim = () => { ctx.fillStyle = 'rgba(0,0,0,0.16)'; ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.arc(-r * 0.12, -r * 0.14, r * 0.86, 0, TAU, true); ctx.fill(); };
    const fin = () => { rim(); ctx.strokeStyle = st.stroke || '#222'; ctx.lineWidth = 1.4; outline(); shine(); };
    switch (st.shape) {
      case 'star': ctx.rotate(rot); ctx.fillStyle = st.color; ctx.beginPath(); starPath(ctx, 0, 0, r * 1.45, r * 0.65, 5, 0); ctx.fill(); ctx.stroke(); ctx.fillStyle = '#ffffff'; ctx.globalAlpha = A0 * 0.5; ctx.beginPath(); ctx.arc(-r * 0.2, -r * 0.3, r * 0.25, 0, TAU); ctx.fill(); ctx.globalAlpha = A0 * 1; break;
      case 'square': ctx.rotate(rot); ctx.fillStyle = st.color; rrect(ctx, -r, -r, r * 2, r * 2, 2); ctx.fill(); ctx.stroke(); ctx.fillStyle = shade(st.color, 0.4); ctx.fillRect(-r + 2, -r + 2, r * 0.8, r * 0.5); break;
      case 'gem': ctx.rotate(rot * 0.5); ctx.fillStyle = st.color; ctx.beginPath(); ctx.moveTo(0, -r * 1.25); ctx.lineTo(r, -r * 0.2); ctx.lineTo(0, r * 1.25); ctx.lineTo(-r, -r * 0.2); ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.fillStyle = '#ffffff'; ctx.globalAlpha = A0 * 0.55; ctx.beginPath(); ctx.moveTo(0, -r * 1.25); ctx.lineTo(r * 0.4, -r * 0.2); ctx.lineTo(-r * 0.4, -r * 0.2); ctx.closePath(); ctx.fill(); ctx.globalAlpha = A0 * 0.25; ctx.beginPath(); ctx.moveTo(0, r * 1.25); ctx.lineTo(r, -r * 0.2); ctx.lineTo(r * 0.4, -r * 0.2); ctx.closePath(); ctx.fill(); ctx.globalAlpha = A0 * 1; break;
      case 'eye': {
        fillC(st.color); ctx.strokeStyle = '#d04040'; ctx.lineWidth = 0.6; ctx.beginPath(); ctx.moveTo(r * 0.9, 0.5); ctx.lineTo(r * 0.5, 1.5); ctx.moveTo(-r * 0.9, -1); ctx.lineTo(-r * 0.4, -1.8); ctx.stroke();
        const L = Math.hypot(look[0], look[1]) || 1, ix = look[0] / L * r * 0.38, iy = look[1] / L * r * 0.38;
        ctx.fillStyle = st.iris || '#3aa0ff'; ctx.beginPath(); ctx.arc(ix, iy, r * 0.5, 0, TAU); ctx.fill();
        ctx.fillStyle = '#111'; ctx.beginPath(); ctx.arc(ix * 1.15, iy * 1.15, r * 0.24, 0, TAU); ctx.fill();
        ctx.strokeStyle = st.stroke; ctx.lineWidth = 1.4; outline(); shine(); break;
      }
      case 'eight': fillC(st.color); ctx.rotate(rot); ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(r * 0.25, -r * 0.1, r * 0.42, 0, TAU); ctx.fill(); ctx.fillStyle = '#111'; ctx.font = 'bold ' + (r * 0.7).toFixed(1) + 'px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('8', r * 0.25, -r * 0.05); ctx.rotate(-rot); outline(); shine(); break;
      case 'beach': {
        fillC('#ffffff'); ctx.save(); ctx.rotate(rot);
        const cs = ['#ff4d4d', '#3aa0ff', '#ffd23c'];
        for (let k = 0; k < 3; k++) { ctx.fillStyle = cs[k]; ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, r, k * TAU / 3, k * TAU / 3 + TAU / 6); ctx.closePath(); ctx.fill(); }
        ctx.restore(); outline(); shine(); break;
      }
      case 'smiley': {
        fillC(st.color); ctx.save(); ctx.rotate(rot); ctx.fillStyle = '#3a2a00';
        ctx.beginPath(); ctx.arc(-r * 0.35, -r * 0.25, r * 0.13, 0, TAU); ctx.arc(r * 0.35, -r * 0.25, r * 0.13, 0, TAU); ctx.fill();
        ctx.strokeStyle = '#3a2a00'; ctx.lineWidth = 1.1; ctx.beginPath(); ctx.arc(0, 0, r * 0.55, 0.3, Math.PI - 0.3); ctx.stroke(); ctx.restore();
        ctx.strokeStyle = st.stroke; outline(); break;
      }
      case 'planet': {
        ctx.save(); ctx.rotate(-0.4); ctx.strokeStyle = '#ffd27a'; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.ellipse(0, 0, r * 1.7, r * 0.45, 0, Math.PI, TAU); ctx.stroke(); ctx.restore();
        fillC(st.color); ctx.save(); ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.clip(); ctx.rotate(rot * 0.3); ctx.fillStyle = shade(st.color, -0.25); ctx.fillRect(-r, -r * 0.2, r * 2, r * 0.35); ctx.fillRect(-r, r * 0.45, r * 2, r * 0.2); ctx.restore();
        ctx.strokeStyle = st.stroke; outline();
        ctx.save(); ctx.rotate(-0.4); ctx.strokeStyle = '#ffd27a'; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.ellipse(0, 0, r * 1.7, r * 0.45, 0, 0, Math.PI); ctx.stroke(); ctx.restore();
        break;
      }
      case 'donut': {
        ctx.rotate(rot); fillC('#d89a5a'); ctx.fillStyle = st.color; ctx.beginPath(); ctx.arc(0, 0, r * 0.88, 0, TAU); ctx.fill();
        ctx.fillStyle = '#5a3a1a'; ctx.beginPath(); ctx.arc(0, 0, r * 0.3, 0, TAU); ctx.fill();
        const sp = ['#fff', '#7cf', '#ff5', '#5f8']; for (let k = 0; k < 6; k++) { ctx.fillStyle = sp[k % 4]; const a = k * 1.05; ctx.fillRect(Math.cos(a) * r * 0.6 - 0.8, Math.sin(a) * r * 0.6 - 0.4, 1.6, 0.9); }
        ctx.strokeStyle = st.stroke; outline(); break;
      }
      case 'twotone': fillC(st.color); clipIn(); ctx.rotate(rot); ctx.fillStyle = st.c2; ctx.fillRect(-r, 0, r * 2, r); ctx.fillStyle = shade(st.c2, -0.3); ctx.fillRect(-r, -r * 0.08, r * 2, r * 0.16); ctx.restore(); fin(); break;
      case 'stripe': fillC(st.color); clipIn(); ctx.rotate(rot); ctx.fillStyle = st.c2; ctx.fillRect(-r, -r * 0.45, r * 2, r * 0.9); ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(0, 0, r * 0.3, 0, TAU); ctx.fill(); ctx.restore(); fin(); break;
      case 'dots': {
        fillC(st.color); clipIn(); ctx.rotate(rot); ctx.fillStyle = st.c2;
        ctx.beginPath(); circ(ctx, 0, 0, r * 0.26); for (let k = 0; k < 6; k++) { const a = k * TAU / 6; circ(ctx, Math.cos(a) * r * 0.74, Math.sin(a) * r * 0.74, r * 0.22); } ctx.fill();
        ctx.restore(); fin(); break;
      }
      case 'checker': {
        fillC(st.color); clipIn(); ctx.rotate(rot); ctx.fillStyle = st.c2; const c = r / 2;
        for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) if ((i + j) & 1) ctx.fillRect(-r + i * c, -r + j * c, c + 0.05, c + 0.05);
        ctx.restore(); fin(); break;
      }
      case 'ring': {
        fillC(st.color); ctx.fillStyle = st.c2; ctx.beginPath(); ctx.arc(0, 0, r * 0.78, 0, TAU); ctx.fill();
        ctx.fillStyle = st.color; ctx.beginPath(); ctx.arc(0, 0, r * 0.54, 0, TAU); ctx.fill();
        ctx.fillStyle = st.c2; ctx.beginPath(); ctx.arc(0, 0, r * 0.28, 0, TAU); ctx.fill(); fin(); break;
      }
      case 'tennis': {
        fillC(st.color); clipIn(); ctx.rotate(rot); ctx.strokeStyle = st.c2; ctx.lineWidth = r * 0.18;
        ctx.beginPath(); ctx.arc(-r * 1.2, 0, r * 0.85, -1.2, 1.2); ctx.stroke(); ctx.beginPath(); ctx.arc(r * 1.2, 0, r * 0.85, Math.PI - 1.2, Math.PI + 1.2); ctx.stroke();
        ctx.restore(); fin(); break;
      }
      case 'melon': {
        fillC(st.color); clipIn(); ctx.rotate(rot); ctx.strokeStyle = st.c2; ctx.lineWidth = r * 0.22;
        for (let k = -1; k <= 1; k++) { ctx.beginPath(); for (let j = 0; j <= 6; j++) { const yy = -r + j * r / 3, xx = k * r * 0.62 + (j & 1 ? r * 0.12 : -r * 0.12); if (j) ctx.lineTo(xx, yy); else ctx.moveTo(xx, yy); } ctx.stroke(); }
        ctx.restore(); fin(); break;
      }
      case 'swirl': {
        fillC(st.color); clipIn(); ctx.rotate(rot); ctx.fillStyle = st.c2;
        for (let k = 0; k < 6; k++) {
          const a = k * TAU / 6; ctx.beginPath(); ctx.moveTo(0, 0);
          ctx.quadraticCurveTo(Math.cos(a + 0.9) * r * 0.7, Math.sin(a + 0.9) * r * 0.7, Math.cos(a) * r * 1.1, Math.sin(a) * r * 1.1);
          ctx.arc(0, 0, r * 1.1, a, a + 0.5); ctx.quadraticCurveTo(Math.cos(a + 1.3) * r * 0.6, Math.sin(a + 1.3) * r * 0.6, 0, 0); ctx.fill();
        }
        ctx.restore(); fin(); break;
      }
      case 'bball': {
        fillC(st.color); clipIn(); ctx.rotate(rot); ctx.strokeStyle = '#3a1a00'; ctx.lineWidth = 0.9;
        ctx.beginPath(); ctx.moveTo(-r, 0); ctx.lineTo(r, 0); ctx.moveTo(0, -r); ctx.lineTo(0, r); ctx.stroke();
        ctx.beginPath(); ctx.arc(-r * 1.25, 0, r * 0.95, -1, 1); ctx.stroke(); ctx.beginPath(); ctx.arc(r * 1.25, 0, r * 0.95, Math.PI - 1, Math.PI + 1); ctx.stroke();
        ctx.restore(); fin(); break;
      }
      case 'moon': {
        fillC(st.color); clipIn(); ctx.rotate(rot); ctx.fillStyle = shade(st.color, -0.22);
        ctx.beginPath(); circ(ctx, r * 0.35, -r * 0.3, r * 0.26); circ(ctx, -r * 0.4, r * 0.25, r * 0.2); circ(ctx, r * 0.25, r * 0.5, r * 0.13); circ(ctx, -r * 0.2, -r * 0.55, r * 0.1); ctx.fill();
        ctx.restore(); ctx.fillStyle = 'rgba(20,24,40,0.22)'; ctx.beginPath(); ctx.arc(0, 0, r, -1.2, 1.9); ctx.arc(-r * 0.35, 0, r * 0.95, 1.9, -1.2, true); ctx.fill(); fin(); break;
      }
      case 'pixel': {
        const c = r / 3, rr = (r + c * 0.3) * (r + c * 0.3), ri = (r - c * 0.7) * (r - c * 0.7);
        for (let i = 0; i < 6; i++) for (let j = 0; j < 6; j++) {
          const cx = -r + (i + 0.5) * c, cy = -r + (j + 0.5) * c, d = cx * cx + cy * cy; if (d > rr) continue;
          ctx.fillStyle = d > ri ? st.stroke : (i + j < 4 ? st.c2 : (i + j > 6 ? shade(st.color, -0.25) : st.color));
          ctx.fillRect(-r + i * c, -r + j * c, c + 0.05, c + 0.05);
        }
        ctx.fillStyle = '#ffffff'; ctx.fillRect(-r + 1.5 * c, -r + 1.5 * c, c * 0.9, c * 0.9); break;
      }
      case 'earth': {
        fillC(st.color); clipIn(); ctx.fillStyle = st.c2;
        const off = ((rot * r * 0.4) % (r * 4) + r * 4) % (r * 4);
        for (let k = -1; k <= 1; k++) {
          const ox = k * r * 4 - off + r;
          ctx.beginPath(); ctx.ellipse(ox - r * 0.3, -r * 0.35, r * 0.55, r * 0.35, 0.4, 0, TAU); ctx.ellipse(ox + r * 0.1, r * 0.3, r * 0.3, r * 0.5, -0.3, 0, TAU); ctx.ellipse(ox + r * 1.9, -r * 0.1, r * 0.4, r * 0.6, 0.2, 0, TAU); ctx.fill();
        }
        ctx.fillStyle = '#ffffff'; ctx.globalAlpha = A0 * 0.8; ctx.fillRect(-r, -r, r * 2, r * 0.22); ctx.fillRect(-r, r * 0.8, r * 2, r * 0.2); ctx.globalAlpha = A0 * 1;
        ctx.restore(); ctx.strokeStyle = 'rgba(140,200,255,0.5)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(0, 0, r + 1, 0, TAU); ctx.stroke(); fin(); break;
      }
      case 'glow': {
        ctx.globalCompositeOperation = 'lighter';
        const pu = 0.85 + 0.15 * Math.sin(t * 4);
        ctx.fillStyle = rgba(st.color, 0.18 * pu); ctx.beginPath(); ctx.arc(0, 0, r * 2.1, 0, TAU); ctx.fill();
        ctx.fillStyle = rgba(st.color, 0.3 * pu); ctx.beginPath(); ctx.arc(0, 0, r * 1.45, 0, TAU); ctx.fill();
        ctx.globalCompositeOperation = 'source-over';
        const g = ctx.createRadialGradient(-r * 0.25, -r * 0.3, 0, 0, 0, r); g.addColorStop(0, '#ffffff'); g.addColorStop(0.45, st.color); g.addColorStop(1, st.c2);
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.fill(); ctx.lineWidth = 0.8; outline(); break;
      }
      case 'sun': {
        ctx.save(); ctx.rotate(rot * 0.3 + t * 0.8); ctx.fillStyle = st.c2;
        ctx.beginPath(); for (let k = 0; k < 10; k++) { const a = k * TAU / 10; ctx.moveTo(Math.cos(a - 0.2) * r * 0.9, Math.sin(a - 0.2) * r * 0.9); ctx.lineTo(Math.cos(a) * r * (1.5 + 0.12 * Math.sin(t * 6 + k)), Math.sin(a) * r * (1.5 + 0.12 * Math.sin(t * 6 + k))); ctx.lineTo(Math.cos(a + 0.2) * r * 0.9, Math.sin(a + 0.2) * r * 0.9); } ctx.fill(); ctx.restore();
        const g = ctx.createRadialGradient(-r * 0.2, -r * 0.25, 0, 0, 0, r); g.addColorStop(0, '#fff8c0'); g.addColorStop(0.6, st.color); g.addColorStop(1, st.c2);
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.fill(); ctx.lineWidth = 1; outline(); break;
      }
      case 'neon': {
        fillC('#12001c');
        ctx.globalCompositeOperation = 'lighter';
        ctx.strokeStyle = st.color; ctx.globalAlpha = A0 * 0.3; ctx.lineWidth = 4; outline(); ctx.globalAlpha = A0 * 1; ctx.lineWidth = 1.5; outline();
        ctx.rotate(rot); ctx.strokeStyle = st.c2; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(0, 0, r * 0.55, 0, Math.PI * 1.2); ctx.stroke();
        ctx.fillStyle = st.c2; ctx.beginPath(); ctx.arc(r * 0.55, 0, 1, 0, TAU); ctx.fill();
        ctx.globalCompositeOperation = 'source-over'; break;
      }
      case 'metal': {
        const g = ctx.createLinearGradient(0, -r, 0, r);
        g.addColorStop(0, shade(st.color, 0.65)); g.addColorStop(0.45, st.color); g.addColorStop(0.52, shade(st.color, -0.45)); g.addColorStop(1, shade(st.color, -0.05));
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.fill(); outline(); shine();
        const tw = Math.max(0, Math.sin(t * 2.5 + rot * 0.2)); if (tw > 0.05) { ctx.fillStyle = '#ffffff'; ctx.globalAlpha = A0 * tw; ctx.beginPath(); starPath(ctx, -r * 0.35, -r * 0.4, r * 0.75 * tw, r * 0.12, 4, 0); ctx.fill(); ctx.globalAlpha = A0 * 1; }
        break;
      }
      case 'disco': {
        fillC(st.color); clipIn(); const c = r / 2.5, fr = Math.floor(t * 5), sh = ((rot * r * 0.3) % c + c) % c;
        for (let i = -1; i < 6; i++) for (let j = 0; j < 5; j++) { const h = hash1(i * 7.1 + j * 13.3 + fr * 0.37 + Math.floor(rot * 0.3 / c)); ctx.fillStyle = h > 0.85 ? '#ffffff' : h > 0.6 ? '#e8f0ff' : h > 0.3 ? '#9aa6b8' : '#6c788a'; ctx.fillRect(-r + i * c + sh + 0.25, -r + j * c + 0.25, c - 0.5, c - 0.5); }
        ctx.restore(); ctx.strokeStyle = st.stroke; outline(); shine();
        const tw = Math.max(0, Math.sin(t * 7)); ctx.fillStyle = '#ffffff'; ctx.globalAlpha = A0 * tw; ctx.beginPath(); starPath(ctx, r * 0.4, -r * 0.5, r * 0.7 * tw + 0.1, r * 0.1, 4, 0); ctx.fill(); ctx.globalAlpha = A0 * 1; break;
      }
      case 'ghost': {
        ctx.globalAlpha = A0 * 0.5 + 0.12 * Math.sin(t * 3); fillC(st.color);
        ctx.globalAlpha = A0 * 0.85; ctx.fillStyle = '#22304a'; ctx.beginPath(); ctx.ellipse(-r * 0.32, -r * 0.15, r * 0.15, r * 0.24, 0, 0, TAU); ctx.ellipse(r * 0.32, -r * 0.15, r * 0.15, r * 0.24, 0, 0, TAU); ctx.fill();
        ctx.beginPath(); ctx.ellipse(0, r * 0.38, r * 0.14, r * 0.18, 0, 0, TAU); ctx.fill();
        ctx.globalAlpha = A0 * 0.6; ctx.lineWidth = 1; outline(); ctx.globalAlpha = A0 * 1; break;
      }
      case 'lava': {
        fillC('#4a0a02'); clipIn(); ctx.rotate(rot * 0.5);
        ctx.fillStyle = st.color;
        for (let k = 0; k < 5; k++) { const a = k * 1.3 + t * 0.6, d = r * (0.25 + 0.45 * hash1(k + 3)); ctx.beginPath(); ctx.arc(Math.cos(a) * d, Math.sin(a * 1.3) * d, r * (0.32 + 0.1 * Math.sin(t * 3 + k)), 0, TAU); ctx.fill(); }
        ctx.fillStyle = st.c2; for (let k = 0; k < 5; k++) { const a = k * 1.3 + t * 0.6, d = r * (0.25 + 0.45 * hash1(k + 3)); ctx.beginPath(); ctx.arc(Math.cos(a) * d, Math.sin(a * 1.3) * d, r * (0.13 + 0.06 * Math.sin(t * 3 + k)), 0, TAU); ctx.fill(); }
        ctx.restore();
        ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = rgba(st.color, 0.22 + 0.1 * Math.sin(t * 5)); ctx.beginPath(); ctx.arc(0, 0, r * 1.6, 0, TAU); ctx.fill(); ctx.globalCompositeOperation = 'source-over';
        ctx.strokeStyle = st.stroke; outline(); break;
      }
      case 'galaxy': {
        const g = ctx.createRadialGradient(0, 0, 0, 0, 0, r); g.addColorStop(0, '#6a3aa0'); g.addColorStop(0.5, st.color); g.addColorStop(1, '#06021a');
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.fill();
        clipIn(); ctx.rotate(rot * 0.3 + t * 0.7); ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round';
        for (let k = 0; k < 2; k++) { ctx.strokeStyle = k ? 'rgba(255,120,220,0.55)' : 'rgba(110,170,255,0.55)'; ctx.lineWidth = r * 0.28; ctx.beginPath(); ctx.arc(k ? r * 0.25 : -r * 0.25, 0, r * 0.6, k ? Math.PI * 0.1 : Math.PI * 1.1, k ? Math.PI * 0.9 : Math.PI * 1.9); ctx.stroke(); }
        ctx.fillStyle = '#ffffff'; for (let k = 0; k < 8; k++) { const a = hash1(k) * TAU, d = r * hash1(k + 9); ctx.globalAlpha = A0 * 0.3 + 0.7 * Math.abs(Math.sin(t * 3 + k * 1.7)); ctx.fillRect(Math.cos(a) * d - 0.5, Math.sin(a) * d - 0.5, 1, 1); }
        ctx.globalAlpha = A0 * 1; ctx.globalCompositeOperation = 'source-over'; ctx.restore();
        ctx.lineWidth = 1; outline(); break;
      }
      case 'rainbow': {
        const h0 = t * 120 + rot * 15;
        for (let k = 0; k < 6; k++) { ctx.fillStyle = hsl(Math.round((h0 + k * 60) % 360), 95, 58); ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, r, rot + k * TAU / 6, rot + (k + 1) * TAU / 6 + 0.02); ctx.closePath(); ctx.fill(); }
        const g = ctx.createRadialGradient(0, 0, 0, 0, 0, r); g.addColorStop(0, 'rgba(255,255,255,0.85)'); g.addColorStop(0.5, 'rgba(255,255,255,0.15)'); g.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.fill(); ctx.lineWidth = 1.2; outline(); shine(); break;
      }
      case 'ruled': {
        fillC(st.color); clipIn(); ctx.rotate(rot); ctx.strokeStyle = st.c2; ctx.lineWidth = 0.6; ctx.globalAlpha = A0 * 0.9;
        ctx.beginPath(); for (let k = -2; k <= 2; k++) { ctx.moveTo(-r, k * r * 0.38); ctx.lineTo(r, k * r * 0.38); } ctx.stroke();
        ctx.strokeStyle = '#ff6a7a'; ctx.beginPath(); ctx.moveTo(-r * 0.45, -r); ctx.lineTo(-r * 0.45, r); ctx.stroke(); ctx.globalAlpha = A0;
        ctx.restore(); fin(); break;
      }
      case 'mirror': {
        // left half reflects right half: chrome gradient mirrored across the vertical axis, with a seam glint
        const g = ctx.createLinearGradient(-r, 0, r, 0); g.addColorStop(0, st.c2); g.addColorStop(0.35, '#ffffff'); g.addColorStop(0.5, st.color); g.addColorStop(0.65, '#ffffff'); g.addColorStop(1, st.c2);
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.fill();
        clipIn(); ctx.fillStyle = st.c2; ctx.globalAlpha = A0 * 0.5; const o = Math.sin(rot * 0.5) * r * 0.5;
        ctx.beginPath(); ctx.arc(o, r * 0.2, r * 0.22, 0, TAU); ctx.arc(-o, r * 0.2, r * 0.22, 0, TAU); ctx.fill();
        ctx.strokeStyle = '#ffffff'; ctx.globalAlpha = A0 * (0.5 + 0.5 * Math.sin(t * 3)); ctx.lineWidth = 0.8; ctx.beginPath(); ctx.moveTo(0, -r); ctx.lineTo(0, r); ctx.stroke(); ctx.globalAlpha = A0;
        ctx.restore(); ctx.strokeStyle = st.stroke; ctx.lineWidth = 1.2; outline(); shine(); break;
      }
      case 'medal': {
        fillC(st.color); ctx.save(); ctx.rotate(rot); ctx.fillStyle = '#3a6aff'; ctx.beginPath(); ctx.moveTo(-r * 0.35, -r); ctx.lineTo(r * 0.35, -r); ctx.lineTo(r * 0.12, -r * 0.2); ctx.lineTo(-r * 0.12, -r * 0.2); ctx.closePath(); ctx.fill();
        ctx.fillStyle = st.c2; ctx.beginPath(); starPath(ctx, 0, r * 0.2, r * 0.55, r * 0.24, 5, 0); ctx.fill(); ctx.restore(); fin(); break;
      }
      case 'scholar': {
        fillC(st.color); ctx.save(); ctx.rotate(Math.sin(rot) * 0.15);
        ctx.fillStyle = st.c2; ctx.fillRect(-r * 0.55, -r * 1.05, r * 1.1, r * 0.5);
        ctx.beginPath(); ctx.moveTo(-r * 1.3, -r * 1.05); ctx.lineTo(0, -r * 1.55); ctx.lineTo(r * 1.3, -r * 1.05); ctx.lineTo(0, -r * 0.65); ctx.closePath(); ctx.fill();
        ctx.strokeStyle = '#ffd23c'; ctx.lineWidth = 0.7; const sw = Math.sin(t * 3) * r * 0.15; ctx.beginPath(); ctx.moveTo(0, -r * 1.1); ctx.lineTo(r * 0.95, -r * 1.05); ctx.lineTo(r * 0.95 + sw, -r * 0.35); ctx.stroke();
        ctx.fillStyle = '#ffd23c'; ctx.beginPath(); ctx.arc(r * 0.95 + sw, -r * 0.3, r * 0.14, 0, TAU); ctx.fill(); ctx.restore();
        ctx.save(); ctx.rotate(rot); ctx.fillStyle = shade(st.color, -0.18); ctx.globalAlpha = A0 * 0.6; for (let k = 0; k < 3; k++) { const a = k * TAU / 3; ctx.beginPath(); ctx.arc(Math.cos(a) * r * 0.55, Math.sin(a) * r * 0.55, r * 0.14, 0, TAU); ctx.fill(); } ctx.restore();
        ctx.globalAlpha = A0; ctx.strokeStyle = st.stroke; outline(); break;
      }
      case 'swish': {
        fillC(st.color); clipIn(); ctx.rotate(rot); ctx.strokeStyle = '#3a1a00'; ctx.lineWidth = 0.8;
        ctx.beginPath(); ctx.moveTo(-r, 0); ctx.lineTo(r, 0); ctx.moveTo(0, -r); ctx.lineTo(0, r); ctx.stroke(); ctx.restore();
        // white swoosh orbiting the ball
        ctx.save(); ctx.rotate(t * 2.5); ctx.strokeStyle = st.c2; ctx.lineCap = 'round';
        for (let k = 0; k < 3; k++) { ctx.globalAlpha = A0 * (0.9 - k * 0.28); ctx.lineWidth = 1.6 - k * 0.4; ctx.beginPath(); ctx.arc(0, 0, r * (1.35 + k * 0.18), -0.2 - k * 0.35, 1.4 - k * 0.35); ctx.stroke(); }
        ctx.restore(); ctx.globalAlpha = A0; fin(); break;
      }
      case 'spiral': {
        fillC(st.color); clipIn(); ctx.rotate(rot + t * 3); ctx.strokeStyle = st.c2; ctx.lineWidth = r * 0.28; ctx.lineCap = 'round';
        ctx.beginPath(); for (let k = 0; k <= 30; k++) { const u = k / 30, a = u * TAU * 1.6, rr = u * r * 1.05; if (k) ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); else ctx.moveTo(0, 0); } ctx.stroke();
        ctx.restore(); fin(); break;
      }
      case 'speedster': {
        // motion blur: ghost copies + speed lines trailing opposite the velocity
        const sp = Math.hypot(vx || 0, vy || 0), k = sp > 0 ? clamp(sp / 500, 0.45, 1) : 0.45;
        const dx = sp > 0 ? -(vx || 0) / sp : -1, dy = sp > 0 ? -(vy || 0) / sp : 0;
        for (let j = 3; j >= 1; j--) { ctx.globalAlpha = A0 * 0.18 * (4 - j) / 3; ctx.fillStyle = st.color; ctx.beginPath(); ctx.arc(dx * r * 0.7 * j * k, dy * r * 0.7 * j * k, r * (1 - j * 0.08), 0, TAU); ctx.fill(); }
        ctx.strokeStyle = st.c2; ctx.lineCap = 'round'; ctx.lineWidth = 1;
        for (let j = -1; j <= 1; j++) { const ox = -dy * j * r * 0.6, oy = dx * j * r * 0.6, L0 = r * (1.2 + 0.2 * Math.sin(t * 20 + j)); ctx.globalAlpha = A0 * 0.8; ctx.beginPath(); ctx.moveTo(ox + dx * L0, oy + dy * L0); ctx.lineTo(ox + dx * (L0 + r * 2.4 * k), oy + dy * (L0 + r * 2.4 * k)); ctx.stroke(); }
        ctx.globalAlpha = A0; fillC(st.color); clipIn(); ctx.rotate(rot); ctx.fillStyle = st.c2;
        ctx.beginPath(); ctx.moveTo(-r, -r * 0.2); ctx.lineTo(r * 0.2, -r * 0.2); ctx.lineTo(-r * 0.1, r * 0.25); ctx.lineTo(r, r * 0.25); ctx.lineTo(r, r * 0.45); ctx.lineTo(-r, r * 0.45); ctx.closePath(); ctx.fill();
        ctx.restore(); fin(); break;
      }
      case 'invert': {
        fillC(st.color); ctx.fillStyle = '#ffffff'; ctx.globalAlpha = A0 * 0.85;
        for (let k = 0; k < 3; k++) { const a = rot + k * TAU / 3; ctx.beginPath(); ctx.arc(Math.cos(a) * r * 0.55, Math.sin(a) * r * 0.55, r * 0.14, 0, TAU); ctx.fill(); }
        ctx.globalCompositeOperation = 'lighter'; const pu = 0.6 + 0.4 * Math.sin(t * 4);
        ctx.strokeStyle = st.c2; ctx.globalAlpha = A0 * 0.35 * pu; ctx.lineWidth = 3.5; outline(); ctx.globalAlpha = A0; ctx.lineWidth = 1.2; outline();
        ctx.globalCompositeOperation = 'source-over';
        ctx.fillStyle = '#000000'; ctx.globalAlpha = A0 * 0.5; ctx.beginPath(); ctx.ellipse(r * 0.35, r * 0.4, r * 0.3, r * 0.18, -0.6, 0, TAU); ctx.fill(); ctx.globalAlpha = A0; break;
      }
      case 'champion': {
        // glowing gold with laurel wreath + orbiting sparkles
        ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = rgba('#ffd23c', 0.18 + 0.08 * Math.sin(t * 3)); ctx.beginPath(); ctx.arc(0, 0, r * 1.9, 0, TAU); ctx.fill(); ctx.globalCompositeOperation = 'source-over';
        const g = ctx.createLinearGradient(0, -r, 0, r); g.addColorStop(0, '#fff6c0'); g.addColorStop(0.45, st.color); g.addColorStop(0.55, '#c08a10'); g.addColorStop(1, '#ffe27a');
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.fill(); outline();
        ctx.fillStyle = st.c2;
        for (let side = -1; side <= 1; side += 2) for (let k = 0; k < 4; k++) { const a = Math.PI / 2 + side * (0.5 + k * 0.42); ctx.save(); ctx.translate(Math.cos(a) * r * 1.12, Math.sin(a) * r * 1.12); ctx.rotate(a + side * 0.9); ctx.beginPath(); ctx.ellipse(0, 0, r * 0.3, r * 0.13, 0, 0, TAU); ctx.fill(); ctx.restore(); }
        shine(); ctx.fillStyle = '#ffffff';
        for (let k = 0; k < 3; k++) { const a = t * 1.8 + k * TAU / 3, tw = 0.5 + 0.5 * Math.sin(t * 6 + k * 2); ctx.globalAlpha = A0 * tw; ctx.beginPath(); starPath(ctx, Math.cos(a) * r * 1.5, Math.sin(a) * r * 1.5, r * 0.4 * tw + 0.3, r * 0.08, 4, 0); ctx.fill(); }
        ctx.globalAlpha = A0; break;
      }
      default: {
        fillC(st.color);
        ctx.fillStyle = shade(st.color, -0.18); ctx.globalAlpha = A0 * 0.6;
        for (let k = 0; k < 3; k++) { const a = rot + k * TAU / 3; ctx.beginPath(); ctx.arc(Math.cos(a) * r * 0.55, Math.sin(a) * r * 0.55, r * 0.14, 0, TAU); ctx.fill(); }
        ctx.globalAlpha = A0 * 1; outline(); shine();
      }
    }
    ctx.restore();
  }

  // ---------------------------------------------------------------- particles
  // shapes: 0 circle, 1 square, 2 streak, 3 ring, 4 star, 5 heart, 6 glow
  const MAXP = 1600;
  function createParticles() {
    const ps = [];
    const add = (o) => {
      if (ps.length >= MAXP) ps.splice(0, 64);
      ps.push({ x: o.x, y: o.y, vx: o.vx || 0, vy: o.vy || 0, g: o.g || 0, drag: o.drag || 0, life: o.life || 1, max: o.life || 1, s: o.s || 3, s2: o.s2 === undefined ? (o.s || 3) : o.s2,
        c: o.c || '#fff', shape: o.shape || 0, rot: o.rot || 0, vr: o.vr || 0, add: !!o.add, delay: o.delay || 0, text: o.text });
    };
    const burst = (x, y, n, o) => {
      if (api.scale < 1) n = Math.max(1, Math.round(n * api.scale));
      for (let k = 0; k < n; k++) {
        const a = (o.ang === undefined ? -Math.PI / 2 : o.ang) + (Math.random() - 0.5) * (o.spread === undefined ? TAU : o.spread);
        const sp = (o.sp || 100) * (0.4 + Math.random() * 0.8);
        const c = Array.isArray(o.c) ? o.c[(Math.random() * o.c.length) | 0] : o.c;
        add({ x: x + (Math.random() - 0.5) * (o.jit || 0), y: y + (Math.random() - 0.5) * (o.jit || 0), vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, g: o.g, drag: o.drag, life: (o.life || 0.8) * (0.6 + Math.random() * 0.7),
          s: (o.s || 3) * (0.6 + Math.random() * 0.8), s2: o.s2, c, shape: o.shape, rot: Math.random() * TAU, vr: (Math.random() - 0.5) * (o.vr || 0), add: o.add, delay: (o.delay || 0) + Math.random() * (o.delayV || 0) });
      }
    };
    const update = (dt) => {
      for (let i = ps.length - 1; i >= 0; i--) {
        const p = ps[i];
        if (p.delay > 0) { p.delay -= dt; continue; }
        p.life -= dt;
        if (p.life <= 0) { ps[i] = ps[ps.length - 1]; ps.pop(); continue; }
        if (p.drag) { const k = Math.max(0, 1 - p.drag * dt); p.vx *= k; p.vy *= k; }
        p.vy += p.g * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.vr * dt;
      }
    };
    const draw = (ctx, view) => {
      for (let pass = 0; pass < 2; pass++) {
        if (pass === 1) ctx.globalCompositeOperation = 'lighter';
        for (let i = 0; i < ps.length; i++) {
          const p = ps[i];
          if (p.delay > 0 || p.add !== (pass === 1)) continue;
          if (view && (p.x < view.x0 - 40 || p.x > view.x1 + 40 || p.y < view.y0 - 40 || p.y > view.y1 + 40)) continue;
          const u = p.life / p.max, s = p.s2 + (p.s - p.s2) * u;
          ctx.globalAlpha = Math.min(1, u * 1.6);
          ctx.fillStyle = p.c; ctx.strokeStyle = p.c;
          switch (p.shape) {
            case 1: ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.fillRect(-s / 2, -s * 0.3, s, s * 0.6); ctx.restore(); break;
            case 2: ctx.lineWidth = s; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - p.vx * 0.035, p.y - p.vy * 0.035); ctx.stroke(); break;
            case 3: ctx.lineWidth = Math.max(0.5, 3 * u); ctx.beginPath(); ctx.arc(p.x, p.y, Math.max(0.1, s), 0, TAU); ctx.stroke(); break;
            case 4: ctx.beginPath(); starPath(ctx, p.x, p.y, s, s * 0.42, 5, p.rot); ctx.fill(); break;
            case 5: ctx.beginPath(); heartPath(ctx, p.x, p.y, s, p.rot * 0.2); ctx.fill(); break;
            case 7: {
              ctx.save(); ctx.translate(p.x, p.y); const k = 1 + (1 - u) * 0.25 + (u > 0.85 ? (u - 0.85) * 3 : 0); ctx.scale(k, k);
              ctx.font = '900 ' + p.s.toFixed(1) + 'px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
              ctx.lineWidth = p.s * 0.16; ctx.strokeStyle = 'rgba(40,20,0,0.85)'; ctx.lineJoin = 'round'; ctx.strokeText(p.text || '', 0, 0);
              ctx.fillStyle = p.c; ctx.fillText(p.text || '', 0, 0); ctx.restore(); break;
            }
            case 8: ctx.lineWidth = Math.max(0.5, 2.5 * u); ctx.beginPath(); ctx.ellipse(p.x, p.y, Math.max(0.1, s), Math.max(0.1, s * 0.28), 0, 0, TAU); ctx.stroke(); break;
            case 9: ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.beginPath(); ctx.moveTo(-s * 0.5, -s * 0.4); ctx.lineTo(s * 0.6, -s * 0.1); ctx.lineTo(-s * 0.1, s * 0.6); ctx.closePath(); ctx.fill(); ctx.globalAlpha *= 0.6; ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 0.8; ctx.stroke(); ctx.restore(); break;
            case 10: { // coin (spinning)
              const cw = Math.max(0.3, Math.abs(Math.cos(p.rot)) * s);
              ctx.fillStyle = '#b07a00'; ctx.beginPath(); ctx.ellipse(p.x, p.y, cw, s, 0, 0, TAU); ctx.fill();
              ctx.fillStyle = p.c; ctx.beginPath(); ctx.ellipse(p.x, p.y, cw * 0.8, s * 0.8, 0, 0, TAU); ctx.fill();
              ctx.fillStyle = '#fff6c0'; ctx.fillRect(p.x - cw * 0.15, p.y - s * 0.45, cw * 0.3, s * 0.9); break;
            }
            case 11: { // balloon with string
              const sw = Math.sin(p.rot) * 0.15;
              ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 0.8; ctx.beginPath(); ctx.moveTo(p.x, p.y + s * 1.2); ctx.quadraticCurveTo(p.x + s * 0.6, p.y + s * 2, p.x - s * 0.1, p.y + s * 2.8); ctx.stroke();
              ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(sw);
              ctx.fillStyle = p.c; ctx.beginPath(); ctx.ellipse(0, 0, s * 0.85, s * 1.05, 0, 0, TAU); ctx.fill();
              ctx.beginPath(); ctx.moveTo(0, s * 0.95); ctx.lineTo(-s * 0.2, s * 1.25); ctx.lineTo(s * 0.2, s * 1.25); ctx.closePath(); ctx.fill();
              ctx.fillStyle = '#ffffff'; ctx.globalAlpha *= 0.6; ctx.beginPath(); ctx.ellipse(-s * 0.32, -s * 0.4, s * 0.18, s * 0.3, 0.4, 0, TAU); ctx.fill(); ctx.restore(); break;
            }
            case 12: { // lightning bolt from (x, y - s) down to (x, y); flickers
              const fr = Math.floor(p.life * 30), N = 9;
              const pts = []; for (let k = 0; k <= N; k++) { const f = k / N; pts.push(p.x + (k && k < N ? (hash1(p.rot * 31 + k * 7.3 + fr) - 0.5) * s * 0.22 : 0), p.y - s + f * s); }
              ctx.lineJoin = 'round';
              for (let pass = 0; pass < 2; pass++) {
                ctx.strokeStyle = pass ? '#ffffff' : p.c; ctx.lineWidth = pass ? 1.6 : 5; if (!pass) ctx.globalAlpha *= 0.5;
                ctx.beginPath(); for (let k = 0; k < pts.length; k += 2) { if (k) ctx.lineTo(pts[k], pts[k + 1]); else ctx.moveTo(pts[k], pts[k + 1]); } ctx.stroke();
                if (!pass) ctx.globalAlpha = Math.min(1, u * 1.6);
              }
              break;
            }
            case 13: ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.scale(1, 0.35 + 0.65 * Math.abs(Math.sin(p.rot * 1.7))); ctx.beginPath(); ctx.moveTo(-s, 0); ctx.quadraticCurveTo(0, -s * 0.8, s, 0); ctx.quadraticCurveTo(0, s * 0.8, -s, 0); ctx.fill(); ctx.restore(); break; // petal
            case 14: { // rainbow arc
              const bw = Math.max(1, s * 0.07);
              for (let k = 0; k < 6; k++) { ctx.strokeStyle = RAINBOW6[k]; ctx.lineWidth = bw + 0.4; ctx.beginPath(); ctx.arc(p.x, p.y, Math.max(0.1, s - k * bw), Math.PI, TAU); ctx.stroke(); }
              break;
            }
            case 15: { // black hole
              ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot);
              ctx.strokeStyle = p.c; ctx.lineWidth = Math.max(1, s * 0.25); ctx.globalAlpha *= 0.8; ctx.beginPath(); ctx.ellipse(0, 0, s * 1.7, s * 0.55, 0, 0, TAU); ctx.stroke();
              ctx.globalAlpha = Math.min(1, u * 1.6); ctx.fillStyle = '#05010c'; ctx.beginPath(); ctx.arc(0, 0, s, 0, TAU); ctx.fill();
              ctx.strokeStyle = '#ffd0ff'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(0, 0, s, 0, TAU); ctx.stroke(); ctx.restore(); break;
            }
            case 17: { // graduation cap (tumbling)
              ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.scale(1, 0.4 + 0.6 * Math.abs(Math.cos(p.rot * 1.3)));
              ctx.fillRect(-s * 0.45, 0, s * 0.9, s * 0.45);
              ctx.beginPath(); ctx.moveTo(-s, 0); ctx.lineTo(0, -s * 0.45); ctx.lineTo(s, 0); ctx.lineTo(0, s * 0.45); ctx.closePath(); ctx.fill(); ctx.strokeStyle = '#c8d4ff'; ctx.lineWidth = 0.8; ctx.stroke(); ctx.fillStyle = '#ffd23c'; ctx.fillRect(s * 0.55, 0, s * 0.12, s * 0.7); ctx.restore(); break;
            }
            case 18: { // trophy
              ctx.save(); ctx.translate(p.x, p.y);
              ctx.lineWidth = s * 0.14; ctx.beginPath(); ctx.arc(-s * 0.55, -s * 0.35, s * 0.3, Math.PI * 0.5, Math.PI * 1.5); ctx.stroke(); ctx.beginPath(); ctx.arc(s * 0.55, -s * 0.35, s * 0.3, -Math.PI * 0.5, Math.PI * 0.5); ctx.stroke();
              ctx.beginPath(); ctx.moveTo(-s * 0.6, -s * 0.75); ctx.lineTo(s * 0.6, -s * 0.75); ctx.quadraticCurveTo(s * 0.55, s * 0.15, 0, s * 0.2); ctx.quadraticCurveTo(-s * 0.55, s * 0.15, -s * 0.6, -s * 0.75); ctx.fill();
              ctx.fillRect(-s * 0.1, s * 0.15, s * 0.2, s * 0.4); ctx.fillRect(-s * 0.4, s * 0.5, s * 0.8, s * 0.18);
              ctx.fillStyle = '#fff6c0'; ctx.globalAlpha *= 0.7; ctx.fillRect(-s * 0.4, -s * 0.65, s * 0.15, s * 0.5); ctx.restore(); break;
            }
            case 16: ctx.fillRect(Math.round(p.x - s / 2), Math.round(p.y - s / 2), Math.ceil(s), Math.ceil(s)); break; // pixel square
            case 6: ctx.globalAlpha *= 0.35; ctx.beginPath(); ctx.arc(p.x, p.y, s * 2.2, 0, TAU); ctx.fill(); ctx.globalAlpha = Math.min(1, u * 1.6); ctx.beginPath(); ctx.arc(p.x, p.y, s * 0.8, 0, TAU); ctx.fill(); break;
            default: ctx.beginPath(); ctx.arc(p.x, p.y, Math.max(0.1, s), 0, TAU); ctx.fill();
          }
        }
      }
      ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
    };
    const api = { ps, add, burst, update, draw, scale: 1 };
    return api;
  }

  // ---------------------------------------------------------------- ambient (screen space)
  function initAmbient(type, w, h) {
    const N = { rain: 150, snow: 110, stars: 0, leaves: 26, petals: 30, embers: 50, bubbles: 34, dust: 45, spores: 40, sparks: 34 }[type] || 0;
    const a = [];
    for (let k = 0; k < N; k++) a.push({ x: Math.random() * w, y: Math.random() * h, z: 0.5 + Math.random() * 0.9, ph: Math.random() * TAU, s: Math.random(), rot: Math.random() * TAU, ci: (Math.random() * 4) | 0 });
    return a;
  }
  function drawAmbient(ctx, type, A, cols, w, h, t, dt, camDX, camDY, windX) {
    if (!A || !A.length) return;
    const add = type === 'embers' || type === 'spores' || type === 'sparks';
    if (add) ctx.globalCompositeOperation = 'lighter';
    for (const p of A) {
      let vx = 0, vy = 0;
      switch (type) {
        case 'leaves': case 'petals': vx = 30 + 25 * Math.sin(t * 0.9 + p.ph) + windX; vy = 32 + 14 * Math.sin(t * 1.3 + p.ph); p.rot += dt * (1.5 + p.s * 2); break;
        case 'snow': vx = 14 * Math.sin(t * 0.8 + p.ph) + windX; vy = 38; break;
        case 'embers': vx = 12 * Math.sin(t * 2 + p.ph) + windX * 0.5; vy = -45; break;
        case 'bubbles': vx = 9 * Math.sin(t * 1.6 + p.ph); vy = -30 - p.s * 30; break;
        case 'dust': vx = 14 + windX; vy = 6 * Math.sin(t * 0.7 + p.ph); break;
        case 'rain': vx = -60 + windX * 2; vy = 720; break;
        case 'spores': vx = 10 * Math.sin(t * 0.6 + p.ph); vy = -10 + 8 * Math.cos(t * 0.8 + p.ph); break;
        case 'sparks': vx = 90 * Math.sin(p.ph * 3); vy = -120 - p.s * 80; break;
      }
      p.x += vx * p.z * dt - camDX * p.z * 0.6; p.y += vy * p.z * dt - camDY * p.z * 0.6;
      if (p.x < -30) p.x += w + 60; else if (p.x > w + 30) p.x -= w + 60;
      if (p.y < -30) p.y += h + 60; else if (p.y > h + 30) p.y -= h + 60;
      const c = cols[p.ci % cols.length];
      ctx.fillStyle = c; ctx.strokeStyle = c;
      switch (type) {
        case 'leaves': case 'petals': {
          ctx.globalAlpha = 0.85; ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.scale(1, Math.abs(Math.sin(p.rot * 0.7)) * 0.7 + 0.3);
          ctx.beginPath(); const s = (type === 'leaves' ? 5 : 4) * p.z; ctx.ellipse(0, 0, s, s * 0.5, 0, 0, TAU); ctx.fill(); ctx.restore(); break;
        }
        case 'snow': ctx.globalAlpha = 0.8; ctx.beginPath(); ctx.arc(p.x, p.y, 1.2 + p.s * 2.2 * p.z, 0, TAU); ctx.fill(); break;
        case 'embers': ctx.globalAlpha = 0.5 + 0.5 * Math.sin(t * 8 + p.ph * 5); ctx.beginPath(); ctx.arc(p.x, p.y, 1 + p.s * 1.8, 0, TAU); ctx.fill(); ctx.globalAlpha *= 0.3; ctx.beginPath(); ctx.arc(p.x, p.y, 4 + p.s * 3, 0, TAU); ctx.fill(); break;
        case 'bubbles': ctx.globalAlpha = 0.45; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(p.x, p.y, 2 + p.s * 5, 0, TAU); ctx.stroke(); ctx.globalAlpha = 0.6; ctx.beginPath(); ctx.arc(p.x - 1, p.y - 1.5, 0.9, 0, TAU); ctx.fill(); break;
        case 'dust': ctx.globalAlpha = 0.3; ctx.beginPath(); ctx.arc(p.x, p.y, 0.8 + p.s * 1.8, 0, TAU); ctx.fill(); break;
        case 'rain': ctx.globalAlpha = 0.35; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x + vx * 0.02, p.y - 16 * p.z); ctx.stroke(); break;
        case 'spores': ctx.globalAlpha = 0.4 + 0.3 * Math.sin(t * 2 + p.ph); ctx.beginPath(); ctx.arc(p.x, p.y, 1.5 + p.s * 2, 0, TAU); ctx.fill(); ctx.globalAlpha *= 0.3; ctx.beginPath(); ctx.arc(p.x, p.y, 5 + p.s * 3, 0, TAU); ctx.fill(); break;
        case 'sparks': ctx.globalAlpha = 0.4 + 0.6 * Math.abs(Math.sin(t * 11 + p.ph * 7)); ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - vx * 0.03, p.y - vy * 0.03); ctx.stroke(); break;
      }
    }
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  }

  // ---------------------------------------------------------------- sky + layers
  function drawSky(ctx, sc, w, h, cam, t) {
    const col = sc.col, pal = col.pal;
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, pal.skyTop); g.addColorStop(1, pal.skyBottom);
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    if (sc.stars && sc.stars.length) {
      ctx.fillStyle = '#ffffff';
      for (const s of sc.stars) {
        const x = frac(s.x - cam.x * 0.00002) * w, y = s.y * h;
        ctx.globalAlpha = 0.35 + 0.55 * Math.abs(Math.sin(t * 0.8 + s.ph)); ctx.fillRect(x, y, s.r, s.r);
      }
      ctx.globalAlpha = 1;
    }
    if (sc.sun) {
      const sx = sc.sun.x * w - cam.x * 0.02 % w, sy = sc.sun.y * h + (sc.gMean - cam.y) * 0.03;
      const sunC = col.dark ? mix(pal.skyBottom, '#ffffff', 0.75) : mix(pal.skyBottom, '#fff7d0', 0.8);
      ctx.fillStyle = sunC; ctx.globalAlpha = 0.18; ctx.beginPath(); ctx.arc(sx, sy, sc.sun.r * 1.9, 0, TAU); ctx.fill();
      ctx.globalAlpha = 0.25; ctx.beginPath(); ctx.arc(sx, sy, sc.sun.r * 1.35, 0, TAU); ctx.fill();
      ctx.globalAlpha = 0.9; ctx.beginPath(); ctx.arc(sx, sy, sc.sun.r, 0, TAU); ctx.fill();
      if (col.dark) { ctx.fillStyle = pal.skyTop; ctx.globalAlpha = 0.9; ctx.beginPath(); ctx.arc(sx + sc.sun.r * 0.4, sy - sc.sun.r * 0.2, sc.sun.r * 0.85, 0, TAU); ctx.fill(); }
      ctx.globalAlpha = 1;
    }
  }
  function drawLayers(ctx, sc, w, h, cam, t, dpr) {
    if (!sc.layers) return;
    const col = sc.col, pal = col.pal, zoom = cam.zoom || 1;
    const lc = [pal.far, pal.mid, pal.near];
    for (let li = 0; li < 3; li++) {
      const L = sc.layers[li], p = PAR[li], z = Math.max(0.3, 1 + (zoom - 1) * p * 0.9);
      const ox = cam.x * p - t * L.drift;
      const baseY = h * 0.5 + ((sc.gMean - cam.y) * p + OFF[li]) * z + (L.bob ? Math.sin(t * 0.8 + li) * L.bob : 0);
      if (baseY - LH[li] * 2 * z > h) continue;
      if (!L.noBase && baseY + 3000 * z < h) { ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.fillStyle = lc[li]; ctx.fillRect(0, baseY, w, h - baseY); }
      const k0 = Math.floor((ox - w / 2 / z) / BG_P) - 1, k1 = Math.floor((ox + w / 2 / z) / BG_P) + 1;
      const c = lc[li];
      let dc;
      if (L.detCol === 'lava') dc = col.lava; else if (L.detCol === 'snow') dc = mix(c, '#ffffff', 0.6); else if (L.detCol === 'darker') dc = shade(c, -0.2);
      else if (L.detKind === 'dark') dc = shade(c, -0.14); else if (L.detKind === 'window') dc = col.dark ? mix(c, '#ffe9a0', 0.6) : shade(c, 0.16); else dc = shade(c, 0.12);
      for (let k = k0; k <= k1; k++) {
        const tx = w / 2 + (k * BG_P - ox) * z;
        ctx.setTransform(dpr * z, 0, 0, dpr * z, dpr * tx, dpr * baseY);
        ctx.fillStyle = c; ctx.fill(L.main);
        if (L.det) { ctx.fillStyle = dc; ctx.fill(L.det); }
        for (const a of L.anim) {
          if (a.k === 'gear') {
            ctx.save(); ctx.translate(a.x, a.y); ctx.rotate(t * a.sp); ctx.fillStyle = shade(c, -0.06); ctx.fill(a.path, 'evenodd'); ctx.restore();
          } else if (a.k === 'smoke') {
            ctx.fillStyle = mix(c, pal.skyBottom, 0.3);
            for (let s = 0; s < 6; s++) { const u = frac(t * 0.07 + s / 6); ctx.globalAlpha = (1 - u) * 0.4; ctx.beginPath(); ctx.arc(a.x + u * 90 + Math.sin(u * 6 + s) * 12, a.y - u * 260, 18 + u * 60, 0, TAU); ctx.fill(); }
            ctx.globalAlpha = 1;
          } else if (a.k === 'ring') {
            ctx.strokeStyle = shade(c, 0.2); ctx.lineWidth = 6; ctx.beginPath(); ctx.ellipse(a.x, a.y, a.r, a.r * 0.22, -0.25, 0, TAU); ctx.stroke();
          }
        }
      }
      // haze between layers
      {
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        const hz = ctx.createLinearGradient(0, baseY - LH[li] * z, 0, h);
        hz.addColorStop(0, rgba(pal.skyBottom, 0)); hz.addColorStop(1, rgba(pal.skyBottom, li < 2 ? 0.22 : 0.3));
        ctx.fillStyle = hz; ctx.fillRect(0, Math.max(0, baseY - LH[li] * z), w, h);
      }
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  // ---------------------------------------------------------------- aim + trail
  function drawAimPath(ctx, aim, z) {
    const pts = aim.points; if (!pts || pts.length < 4) return;
    let total = 0; for (let i = 2; i < pts.length; i += 2) total += Math.hypot(pts[i] - pts[i - 2], pts[i + 1] - pts[i - 1]);
    if (total < 1) return;
    const sp = 13, rr = 2.6 / Math.sqrt(z);
    let acc = 0, next = sp * 0.5;
    for (let i = 2; i < pts.length; i += 2) {
      const x0 = pts[i - 2], y0 = pts[i - 1], x1 = pts[i], y1 = pts[i + 1], L = Math.hypot(x1 - x0, y1 - y0);
      while (next <= acc + L) {
        const u = (next - acc) / (L || 1), x = x0 + (x1 - x0) * u, y = y0 + (y1 - y0) * u, f = 1 - next / total;
        ctx.globalAlpha = 0.9 * f; ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.beginPath(); ctx.arc(x + 0.8, y + 1, rr * (0.6 + 0.4 * f), 0, TAU); ctx.fill();
        ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(x, y, rr * (0.6 + 0.4 * f), 0, TAU); ctx.fill();
        next += sp;
      }
      acc += L;
    }
    ctx.globalAlpha = 1;
  }
  // ghost ball replaying a shot: frame.ghost = { points:[x0,y0,...], t 0..1 } (points sampled on a fixed time grid)
  const GHOST_C = '#bff4ff';
  function drawGhost(ctx, gh, z, time, reduced) {
    const pts = gh.points; if (!pts || pts.length < 2) return;
    const N = pts.length >> 1, f = clamp(+gh.t || 0, 0, 1) * (N - 1), i0 = Math.min(N - 1, Math.floor(f)), i1 = Math.min(N - 1, i0 + 1), u = f - i0;
    const gx = pts[2 * i0] + (pts[2 * i1] - pts[2 * i0]) * u, gy = pts[2 * i0 + 1] + (pts[2 * i1 + 1] - pts[2 * i0 + 1]) * u;
    const k = 1 / Math.sqrt(z);
    ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    // faint dotted path of the whole shot (dots every ~14px of arc length)
    ctx.fillStyle = GHOST_C; ctx.globalAlpha = 0.28;
    let acc = 0, next = 0; ctx.beginPath();
    for (let i = 1; i < N; i++) {
      const x0 = pts[2 * i - 2], y0 = pts[2 * i - 1], x1 = pts[2 * i], y1 = pts[2 * i + 1], L = Math.hypot(x1 - x0, y1 - y0);
      while (next <= acc + L) { const q = (next - acc) / (L || 1); circ(ctx, x0 + (x1 - x0) * q, y0 + (y1 - y0) * q, 1.4 * k); next += 14; }
      acc += L;
    }
    ctx.fill();
    // fading tail over the last ~14 samples
    const T0 = Math.max(0, i0 - 14);
    for (let i = T0 + 1; i <= i0 + 1 && i < N + 1; i++) {
      const ax = pts[2 * (i - 1)], ay = pts[2 * (i - 1) + 1], last = i > i0, bx = last ? gx : pts[2 * i], by = last ? gy : pts[2 * i + 1];
      const w = (i - T0) / (i0 + 1 - T0 + 1e-6);
      ctx.strokeStyle = GHOST_C; ctx.globalAlpha = 0.35 * w; ctx.lineWidth = (1 + 4 * w) * k * 0.9;
      ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
      if (last) break;
    }
    // the ghost: hollow outlined ball, ~40% alpha, no shadow, gentle pulse
    const pu = reduced ? 1 : 0.9 + 0.1 * Math.sin(time * 5);
    ctx.globalAlpha = 0.16; ctx.fillStyle = GHOST_C; ctx.beginPath(); ctx.arc(gx, gy, BALL_R, 0, TAU); ctx.fill();
    ctx.globalAlpha = 0.45 * pu; ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.6; ctx.setLineDash([3, 2.2]); ctx.lineDashOffset = reduced ? 0 : -time * 6; ctx.stroke(); ctx.setLineDash([]); ctx.lineDashOffset = 0;
    ctx.globalAlpha = 0.25 * pu; ctx.strokeStyle = '#5ae0ff'; ctx.lineWidth = 3.5; ctx.beginPath(); ctx.arc(gx, gy, BALL_R + 2.2, 0, TAU); ctx.stroke();
    ctx.restore();
  }
  function drawAimMeter(ctx, aim, z, t, prev, cb) {
    const k = 1 / z, p = clamp(aim.power || 0, 0, 1), c = hsl(Math.round(120 * (1 - p)), 90, 55);
    const R0 = 26 * k;
    ctx.lineCap = 'round';
    ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 6 * k; ctx.beginPath(); ctx.arc(aim.x, aim.y, R0, 0, TAU); ctx.stroke();
    if (p > 0.001) { ctx.strokeStyle = c; ctx.lineWidth = 4.5 * k; ctx.beginPath(); ctx.arc(aim.x, aim.y, R0, -Math.PI / 2, -Math.PI / 2 + p * TAU); ctx.stroke(); }
    if (cb) {
      // tick marks + labels every 25% so power is readable without the colour ramp
      ctx.font = '800 ' + (7 * k).toFixed(1) + 'px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      for (let q = 1; q <= 4; q++) {
        const a = -Math.PI / 2 + q / 4 * TAU, ca2 = Math.cos(a), sa2 = Math.sin(a);
        ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.6 * k; ctx.beginPath(); ctx.moveTo(aim.x + ca2 * (R0 - 4 * k), aim.y + sa2 * (R0 - 4 * k)); ctx.lineTo(aim.x + ca2 * (R0 + 4 * k), aim.y + sa2 * (R0 + 4 * k)); ctx.stroke();
        if (q === 4) continue;
        const lx = aim.x + ca2 * (R0 + 10 * k), ly = aim.y + sa2 * (R0 + 10 * k) - (q !== 2 ? 8 * k : 0), tx = String(q * 25);
        ctx.lineWidth = 2.5 * k; ctx.strokeStyle = 'rgba(0,0,0,0.7)'; ctx.strokeText(tx, lx, ly); ctx.fillStyle = '#ffffff'; ctx.fillText(tx, lx, ly);
      }
      const pl = Math.round(p * 100) + '%';
      ctx.font = '900 ' + (9 * k).toFixed(1) + 'px system-ui, sans-serif'; ctx.lineWidth = 3 * k; ctx.strokeStyle = 'rgba(0,0,0,0.75)';
      ctx.strokeText(pl, aim.x, aim.y + R0 + 20 * k); ctx.fillStyle = '#ffffff'; ctx.fillText(pl, aim.x, aim.y + R0 + 20 * k);
    }
    if (prev && isFinite(prev.angle)) {
      // previous shot: thin dashed ghost arrow + tick on the power ring, labelled "last"
      const pp = clamp(+prev.power || 0, 0, 1), pa = -Math.PI / 2 + pp * TAU;
      ctx.strokeStyle = '#ffffff'; ctx.globalAlpha = 0.75; ctx.lineWidth = 2.2 * k;
      ctx.beginPath(); ctx.moveTo(aim.x + Math.cos(pa) * (R0 - 5 * k), aim.y + Math.sin(pa) * (R0 - 5 * k)); ctx.lineTo(aim.x + Math.cos(pa) * (R0 + 5 * k), aim.y + Math.sin(pa) * (R0 + 5 * k)); ctx.stroke();
      const PL = (20 + 62 * pp) * k, pc = Math.cos(prev.angle), ps = Math.sin(prev.angle);
      const qx0 = aim.x + pc * 10 * k, qy0 = aim.y + ps * 10 * k, qx1 = aim.x + pc * (10 * k + PL), qy1 = aim.y + ps * (10 * k + PL);
      ctx.globalAlpha = 0.45; ctx.lineWidth = 1.5 * k; ctx.setLineDash([4 * k, 4 * k]);
      ctx.beginPath(); ctx.moveTo(qx0, qy0); ctx.lineTo(qx1, qy1); ctx.stroke(); ctx.setLineDash([]);
      ctx.beginPath(); ctx.moveTo(qx1 + pc * 7 * k, qy1 + ps * 7 * k); ctx.lineTo(qx1 - ps * 4.5 * k, qy1 + pc * 4.5 * k); ctx.lineTo(qx1 + ps * 4.5 * k, qy1 - pc * 4.5 * k); ctx.closePath(); ctx.stroke();
      ctx.font = '700 ' + (7.5 * k).toFixed(1) + 'px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      const lx = qx1 + pc * 15 * k, ly = qy1 + ps * 15 * k;
      ctx.globalAlpha = 0.6; ctx.lineWidth = 2.5 * k; ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.strokeText('last', lx, ly); ctx.fillStyle = '#ffffff'; ctx.fillText('last', lx, ly);
      ctx.globalAlpha = 1;
    }
    const L = (20 + 62 * p) * k, ca = Math.cos(aim.angle), sa = Math.sin(aim.angle);
    const x0 = aim.x + ca * 10 * k, y0 = aim.y + sa * 10 * k, x1 = aim.x + ca * (10 * k + L), y1 = aim.y + sa * (10 * k + L);
    ctx.strokeStyle = 'rgba(0,0,0,0.4)'; ctx.lineWidth = 6 * k; ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
    ctx.strokeStyle = c; ctx.lineWidth = 3.5 * k; ctx.stroke();
    ctx.fillStyle = c; ctx.beginPath(); ctx.moveTo(x1 + ca * 9 * k, y1 + sa * 9 * k); ctx.lineTo(x1 - sa * 6 * k, y1 + ca * 6 * k); ctx.lineTo(x1 + sa * 6 * k, y1 - ca * 6 * k); ctx.closePath(); ctx.fill();
    if (p > 0.97) { ctx.strokeStyle = c; ctx.globalAlpha = 0.5 + 0.5 * Math.sin(t * 20); ctx.lineWidth = 2 * k; ctx.beginPath(); ctx.arc(aim.x, aim.y, R0 + 6 * k, 0, TAU); ctx.stroke(); ctx.globalAlpha = 1; }
    const spin = aim.putt ? 0 : clamp(+aim.spin || 0, -1, 1);
    if (Math.abs(spin) > 0.02) {
      // curved arrow around the ball: topspin rolls forward, backspin rolls back (relative to aim direction)
      const fwd = ca >= 0 ? 1 : -1, rotDir = spin * fwd > 0 ? 1 : -1;  // +1 = clockwise on screen
      const sc2 = spin > 0 ? '#ff9a2a' : '#3ad8ff', Rs = 15 * k, span = 0.6 + Math.abs(spin) * 2.4;
      const a0 = -Math.PI / 2 - rotDir * span / 2, a1 = a0 + rotDir * span;
      const wob = Math.sin(t * 6) * 0.08 * rotDir;
      ctx.lineCap = 'round';
      ctx.strokeStyle = 'rgba(0,0,0,0.45)'; ctx.lineWidth = 5 * k; ctx.beginPath(); ctx.arc(aim.x, aim.y, Rs, a0 + wob, a1 + wob, rotDir < 0); ctx.stroke();
      ctx.strokeStyle = sc2; ctx.lineWidth = 3 * k; ctx.stroke();
      const ex = aim.x + Math.cos(a1 + wob) * Rs, ey = aim.y + Math.sin(a1 + wob) * Rs, ta = a1 + wob + rotDir * Math.PI / 2;
      ctx.fillStyle = sc2; ctx.beginPath(); ctx.moveTo(ex + Math.cos(ta) * 6 * k, ey + Math.sin(ta) * 6 * k);
      ctx.lineTo(ex + Math.cos(ta + 2.3) * 5 * k, ey + Math.sin(ta + 2.3) * 5 * k); ctx.lineTo(ex + Math.cos(ta - 2.3) * 5 * k, ey + Math.sin(ta - 2.3) * 5 * k); ctx.closePath(); ctx.fill();
      ctx.font = '800 ' + (9 * k).toFixed(1) + 'px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      const lbl = (spin > 0 ? 'TOP ' : 'BACK ') + Math.round(Math.abs(spin) * 100) + '%';
      ctx.lineWidth = 3 * k; ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.strokeText(lbl, aim.x, aim.y - R0 - 11 * k); ctx.fillStyle = sc2; ctx.fillText(lbl, aim.x, aim.y - R0 - 11 * k);
    }
  }
  // trail points: {x, y, a (age s), i (absolute index, for stable decorations)}
  // preview = also draw the particle-like extras that the in-game trail spawns through the particle system
  function trailNormal(trail, i) {
    const a = trail[Math.max(0, i - 1)], b = trail[Math.min(trail.length - 1, i + 1)];
    const dx = b.x - a.x, dy = b.y - a.y, L = Math.hypot(dx, dy) || 1; return [-dy / L, dx / L];
  }
  function deco0(trail, every, m, lifeOf, fn) { for (const p of trail) { if (p.i % every) continue; const a = lifeOf(p, m); if (a > 0) fn(p, a, hash1(p.i * 1.37)); } }
  const CONF_C = ['#ff4d6d', '#ffd23c', '#3cf0c0', '#3aa0ff', '#b57aff', '#ffffff'];
  const LEAF_C = ['#8fbf3a', '#c9a227', '#d9822b', '#5aa83a'];
  function drawTrail(ctx, trail, st, t, ballSt, preview) {
    const n = trail.length; if (n < 2 || st.style === 'none') return;
    const S = st.style;
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    const lifeOf = (p, m) => Math.max(0, 1 - p.a / (m || 0.6));
    const seg = (p0, p1) => { ctx.beginPath(); ctx.moveTo(p0.x, p0.y); ctx.lineTo(p1.x, p1.y); ctx.stroke(); };
    // ---- puff styles
    if (S === 'smoke' || S === 'bubbles') {
      for (let i = 0; i < n; i++) {
        const p = trail[i], u = i / n, a = Math.max(0, 1 - p.a / 0.7);
        if (a <= 0) continue;
        ctx.globalAlpha = a * 0.45 * u; ctx.fillStyle = st.color; ctx.strokeStyle = st.color;
        ctx.beginPath(); ctx.arc(p.x, p.y, 2 + p.a * 14, 0, TAU);
        if (S === 'smoke') ctx.fill(); else { ctx.lineWidth = 1.2; ctx.globalAlpha = a * 0.7 * u; ctx.stroke(); }
      }
      if (preview && S === 'bubbles') {
        ctx.strokeStyle = st.color; ctx.lineWidth = 1;
        for (const p of trail) { if (p.i % 4) continue; const h = hash1(p.i), a = lifeOf(p, 0.9); if (a <= 0) continue; ctx.globalAlpha = a * 0.9; ctx.beginPath(); ctx.arc(p.x + (h - 0.5) * 12 * p.a, p.y - p.a * 22, 1.5 + p.a * 3, 0, TAU); ctx.stroke(); }
      }
      ctx.globalAlpha = 1; return;
    }
    // ---- dotted / pixels / decorations-only styles
    if (S === 'dotted') {
      ctx.fillStyle = st.color;
      for (let i = 0; i < n; i++) { const p = trail[i]; if (p.i % 2) continue; const a = lifeOf(p, 0.7), u = i / n; if (a <= 0) continue; ctx.globalAlpha = a * 0.85; ctx.beginPath(); ctx.arc(p.x, p.y, 0.8 + 2.2 * u, 0, TAU); ctx.fill(); }
      ctx.globalAlpha = 1; return;
    }
    if (S === 'pixel') {
      const cs = [st.color, '#c8ffb0', '#2a9a3a'];
      for (let i = 0; i < n; i++) { const p = trail[i], a = lifeOf(p, 0.8), u = i / n; if (a <= 0) continue; const s = Math.max(1, Math.round((1 + 4 * u) * (0.4 + 0.6 * a))); ctx.globalAlpha = 0.9; ctx.fillStyle = cs[p.i % 3]; ctx.fillRect(Math.round(p.x / 3) * 3 - s / 2 + ((hash1(p.i) - 0.5) * 6 * p.a | 0), Math.round(p.y / 3) * 3 - s / 2 + (p.a * 8 | 0), s, s); }
      ctx.globalAlpha = 1; return;
    }
    if (S === 'ghost') {
      const bs = ballSt || COSMETICS.balls[0];
      for (let i = 0; i < n - 1; i++) { const p = trail[i]; if (p.i % 5) continue; const a = lifeOf(p, 0.6); if (a <= 0) continue; ctx.globalAlpha = a * 0.35 * (i / n); drawBall(ctx, bs, p.x, p.y, BALL_R, p.i * 0.4, 0, 0, null, t); }
      ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; return;
    }
    if (S === 'zap') {
      const fr = Math.floor(t * 24);
      ctx.globalCompositeOperation = 'lighter';
      for (let pass = 0; pass < 2; pass++) {
        ctx.strokeStyle = pass ? '#ffffff' : st.color; ctx.lineWidth = pass ? 1.2 : 3.5; ctx.globalAlpha = pass ? 0.95 : 0.4;
        ctx.beginPath(); let started = false;
        for (let i = 0; i < n; i++) {
          const p = trail[i]; if (lifeOf(p, 0.45) <= 0) continue; if (p.i % 2 && i !== n - 1) continue;
          const nn = trailNormal(trail, i), j = (hash1(p.i * 3.7 + fr) - 0.5) * 9 * (i / n + 0.2);
          const px = p.x + nn[0] * j, py = p.y + nn[1] * j; if (!started) { ctx.moveTo(px, py); started = true; } else ctx.lineTo(px, py);
        }
        ctx.stroke();
      }
      ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; return;
    }
    if (S === 'ribbon') {
      const B = 5, bw = 1.6;
      for (let b = 0; b < B; b++) {
        ctx.strokeStyle = hsl(Math.round((b * 55 + t * 90) % 360), 95, 60);
        for (let i = 1; i < n; i++) {
          const p0 = trail[i - 1], p1 = trail[i], a = lifeOf(p1, 0.7), u = i / n; if (a <= 0) continue;
          const n0 = trailNormal(trail, i - 1), n1 = trailNormal(trail, i), o = (b - (B - 1) / 2) * bw * (0.35 + 0.65 * u) + Math.sin(p1.i * 0.35 + t * 6) * 1.2 * (1 - u);
          ctx.globalAlpha = a * u * 0.9; ctx.lineWidth = bw * 1.15 * (0.4 + 0.6 * u);
          ctx.beginPath(); ctx.moveTo(p0.x + n0[0] * o, p0.y + n0[1] * o); ctx.lineTo(p1.x + n1[0] * o, p1.y + n1[1] * o); ctx.stroke();
        }
      }
      ctx.globalAlpha = 1; return;
    }
    if (S === 'double') {
      ctx.globalCompositeOperation = 'lighter';
      for (let side = -1; side <= 1; side += 2) {
        const c = side < 0 ? st.color : st.c2;
        for (let i = 1; i < n; i++) {
          const p0 = trail[i - 1], p1 = trail[i], a = lifeOf(p1), u = i / n; if (a <= 0) continue;
          const n0 = trailNormal(trail, i - 1), n1 = trailNormal(trail, i), o = side * (1 + 2.2 * u);
          ctx.strokeStyle = c; ctx.beginPath(); ctx.moveTo(p0.x + n0[0] * o, p0.y + n0[1] * o); ctx.lineTo(p1.x + n1[0] * o, p1.y + n1[1] * o);
          ctx.globalAlpha = a * u * 0.3; ctx.lineWidth = 4; ctx.stroke(); ctx.globalAlpha = a * u; ctx.lineWidth = 1.3; ctx.stroke();
        }
      }
      ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; return;
    }
    // ---- v3 styles
    const line = (m, fnW, fnA, off) => { for (let i = 1; i < n; i++) { const p0 = trail[i - 1], p1 = trail[i], life = lifeOf(p1, m), u = i / n; if (life <= 0) continue; ctx.globalAlpha = fnA(u, life); ctx.lineWidth = fnW(u, life); if (off) { const n0 = trailNormal(trail, i - 1), n1 = trailNormal(trail, i), o0 = off(p0, u), o1 = off(p1, u); ctx.beginPath(); ctx.moveTo(p0.x + n0[0] * o0, p0.y + n0[1] * o0); ctx.lineTo(p1.x + n1[0] * o1, p1.y + n1[1] * o1); ctx.stroke(); } else seg(p0, p1); } };
    if (S === 'chalk') {
      ctx.strokeStyle = st.color; ctx.lineCap = 'butt';
      for (let i = 1; i < n; i++) { const p1 = trail[i]; if ((p1.i >> 1) % 3 === 0) continue; const life = lifeOf(p1, 0.8), u = i / n; if (life <= 0) continue; ctx.globalAlpha = life * u * 0.85; ctx.lineWidth = 2.6; seg(trail[i - 1], p1); }
      ctx.fillStyle = st.color; deco0(trail, 2, 0.9, lifeOf, (p, a, h) => { ctx.globalAlpha = a * 0.6; ctx.fillRect(p.x + (h - 0.5) * 8, p.y + p.a * 18 + (hash1(p.i + 3) - 0.5) * 6, 1.3, 1.3); });
      ctx.globalAlpha = 1; ctx.lineCap = 'round'; return;
    }
    if (S === 'reflect') {
      const hy = trail[n - 1].y;
      ctx.strokeStyle = st.color; line(0.6, (u) => 1 + 3 * u, (u, l) => u * l * 0.85);
      ctx.save(); ctx.setLineDash([3, 4]); ctx.strokeStyle = '#ffffff'; ctx.globalAlpha = 0.35; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(trail[0].x, hy); ctx.lineTo(trail[n - 1].x, hy); ctx.stroke(); ctx.restore();
      ctx.strokeStyle = mix(st.color, '#b57aff', 0.5);
      for (let i = 1; i < n; i++) { const p0 = trail[i - 1], p1 = trail[i], l = lifeOf(p1, 0.6), u = i / n; if (l <= 0) continue; ctx.globalAlpha = u * l * 0.45; ctx.lineWidth = 1 + 2.5 * u; ctx.beginPath(); ctx.moveTo(p0.x, 2 * hy - p0.y); ctx.lineTo(p1.x, 2 * hy - p1.y); ctx.stroke(); }
      ctx.globalAlpha = 1; return;
    }
    if (S === 'laurel') {
      ctx.strokeStyle = '#ffd23c'; line(0.7, (u) => 0.8 + 1.4 * u, (u, l) => u * l * 0.8);
      deco0(trail, 3, 0.8, lifeOf, (p, a, h) => {
        const nn = trailNormal(trail, Math.max(0, Math.min(n - 1, trail.indexOf(p)))); ctx.fillStyle = h < 0.5 ? st.color : shade(st.color, -0.2); ctx.globalAlpha = a * 0.9;
        for (let sd = -1; sd <= 1; sd += 2) { ctx.save(); ctx.translate(p.x + nn[0] * sd * 3.5, p.y + nn[1] * sd * 3.5); ctx.rotate(Math.atan2(nn[1], nn[0]) * sd + 0.6 * sd); ctx.beginPath(); ctx.ellipse(0, 0, 3.6, 1.6, 0, 0, TAU); ctx.fill(); ctx.restore(); }
      });
      ctx.globalAlpha = 1; return;
    }
    if (S === 'flash') {
      ctx.globalCompositeOperation = 'lighter';
      const pulse = frac(t * 2.2);
      for (let pass = 0; pass < 2; pass++) {
        ctx.strokeStyle = pass ? '#ffffff' : st.color; ctx.beginPath(); let started = false;
        for (let i = 0; i < n; i++) { const p = trail[i]; if (lifeOf(p, 0.55) <= 0) continue; if (p.i % 3 && i !== n - 1) continue; const nn = trailNormal(trail, i), j = ((p.i / 3) & 1 ? 1 : -1) * 4 * (i / n); const x = p.x + nn[0] * j, y = p.y + nn[1] * j; if (!started) { ctx.moveTo(x, y); started = true; } else ctx.lineTo(x, y); }
        ctx.globalAlpha = pass ? 0.9 : 0.45; ctx.lineWidth = pass ? 1.3 : 4.5; ctx.stroke();
      }
      const k = Math.floor(pulse * n), pp = trail[Math.min(n - 1, k)]; ctx.fillStyle = '#fff6c0'; ctx.globalAlpha = 0.8 * (1 - pulse); ctx.beginPath(); ctx.arc(pp.x, pp.y, 5, 0, TAU); ctx.fill();
      ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; return;
    }
    if (S === 'speedlines') {
      ctx.strokeStyle = st.color; line(0.45, (u) => 1 + 4 * u, (u, l) => u * l * 0.7);
      ctx.strokeStyle = '#ffffff'; ctx.lineCap = 'round';
      for (let sd = -2; sd <= 2; sd++) { if (!sd) continue; line(0.35, () => 1, (u, l) => u * u * l * 0.75, (p, u) => sd * (2.5 + 3 * u)); }
      ctx.globalAlpha = 1; return;
    }
    if (S === 'afterburner' || S === 'inferno') {
      const inf = S === 'inferno';
      ctx.globalCompositeOperation = 'lighter';
      const layers = inf ? [['#ff2a0a', 16, 0.25], ['#ff7a1a', 9, 0.5], ['#ffd34a', 4, 0.8], ['#ffffff', 1.5, 0.8]] : [['#1a5aff', 10, 0.3], [st.color, 5, 0.6], ['#ffffff', 1.8, 0.9]];
      for (const [c, w0, a0] of layers) { ctx.strokeStyle = c; line(inf ? 0.6 : 0.4, (u, l) => w0 * u * (0.6 + 0.4 * l) * (1 + (inf ? 0.15 * Math.sin(t * 25 + u * 9) : 0)), (u, l) => a0 * u * l); }
      if (!inf) {
        // shock diamonds along the exhaust
        for (let i = n - 4; i > 0; i -= 5) { const p = trail[i], u = i / n, l = lifeOf(p, 0.4); if (l <= 0) continue; const nn = trailNormal(trail, i), s2 = 4 * u * l; ctx.fillStyle = '#e8f4ff'; ctx.globalAlpha = 0.8 * l * u; ctx.beginPath(); ctx.moveTo(p.x - nn[1] * s2 * 1.6, p.y + nn[0] * s2 * 1.6); ctx.lineTo(p.x + nn[0] * s2, p.y + nn[1] * s2); ctx.lineTo(p.x + nn[1] * s2 * 1.6, p.y - nn[0] * s2 * 1.6); ctx.lineTo(p.x - nn[0] * s2, p.y - nn[1] * s2); ctx.closePath(); ctx.fill(); }
      } else if (preview) {
        deco0(trail, 2, 0.6, lifeOf, (p, a, h) => { ctx.fillStyle = h < 0.5 ? '#ffb030' : '#ff3a0a'; ctx.globalAlpha = a; ctx.beginPath(); ctx.arc(p.x + (h - 0.5) * 12, p.y - p.a * 60, 0.6 + 2.4 * a, 0, TAU); ctx.fill(); });
      }
      ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; return;
    }
    // ---- line-based styles
    const glow = S === 'neon' || S === 'comet';
    if (glow) ctx.globalCompositeOperation = 'lighter';
    const thin = S === 'hearts' || S === 'stars' || S === 'ice' || S === 'leaves' || S === 'confetti';
    for (let i = 1; i < n; i++) {
      const p0 = trail[i - 1], p1 = trail[i], u = i / n, life = lifeOf(p1);
      if (life <= 0) continue;
      if (S === 'dashes' && (p1.i >> 2) & 1) continue;
      const a = u * life;
      let c = st.color || '#ffffff', w = 1 + 5 * u, al = 0.85;
      if (S === 'rainbow') c = hsl(Math.round((i * 12 + t * 200) % 360), 95, 60);
      else if (S === 'fire') { c = hsl(Math.round(10 + 45 * u), 100, 50 + 15 * u); w = 2 + 7 * u; }
      else if (S === 'sparkle') w = 1 + 2 * u;
      else if (S === 'line') al = 0.55;
      else if (S === 'dashes') { w = 2.5; al = 0.9; }
      else if (S === 'comet') { c = mix(st.color, '#ffffff', u * u); w = 1 + 10 * u * u; al = 0.55; }
      else if (thin) { w = 1 + 1.2 * u; al = 0.35; }
      if (S === 'neon') { ctx.strokeStyle = c; ctx.globalAlpha = a * 0.25; ctx.lineWidth = w * 2.6; seg(p0, p1); }
      ctx.strokeStyle = c; ctx.globalAlpha = a * al; ctx.lineWidth = w; seg(p0, p1);
    }
    if (S === 'comet') { const h = trail[n - 1]; ctx.fillStyle = st.color; ctx.globalAlpha = 0.35; ctx.beginPath(); ctx.arc(h.x, h.y, 11, 0, TAU); ctx.fill(); }
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    // ---- decorations riding on the points (stable per absolute index)
    const deco = (every, m, fn) => { for (const p of trail) { if (p.i % every) continue; const a = lifeOf(p, m); if (a > 0) fn(p, a, hash1(p.i * 1.37)); } };
    switch (S) {
      case 'hearts': deco(4, 0.9, (p, a, h) => { ctx.globalAlpha = a; ctx.fillStyle = h < 0.5 ? st.color : '#ff9ac0'; ctx.beginPath(); heartPath(ctx, p.x + (h - 0.5) * 10, p.y - p.a * 26, 2.2 + 2.5 * (1 - a) + h, (h - 0.5) * 2); ctx.fill(); }); break;
      case 'stars': deco(3, 0.9, (p, a, h) => { ctx.globalAlpha = a * (0.6 + 0.4 * Math.sin(t * 12 + p.i)); ctx.fillStyle = h < 0.6 ? st.color : '#ffffff'; ctx.beginPath(); starPath(ctx, p.x + (h - 0.5) * 12 * p.a * 2, p.y + (hash1(p.i + 5) - 0.5) * 16 * p.a * 2, 1.5 + 3 * a, 0.6 + 1.2 * a, 5, p.a * 4 + h * 3); ctx.fill(); }); break;
      case 'ice': deco(3, 0.9, (p, a, h) => {
        const s = 2 + 2.5 * h, x = p.x + (h - 0.5) * 8, y = p.y + p.a * 14; ctx.globalAlpha = a; ctx.strokeStyle = h < 0.5 ? '#ffffff' : st.color; ctx.lineWidth = 0.9;
        ctx.beginPath(); for (let k = 0; k < 3; k++) { const an = k * Math.PI / 3 + p.a * 2 + h; ctx.moveTo(x - Math.cos(an) * s, y - Math.sin(an) * s); ctx.lineTo(x + Math.cos(an) * s, y + Math.sin(an) * s); } ctx.stroke();
      }); break;
      case 'leaves': deco(4, 0.9, (p, a, h) => {
        ctx.globalAlpha = a; ctx.fillStyle = LEAF_C[(h * 4) | 0]; ctx.save(); ctx.translate(p.x + Math.sin(p.a * 6 + h * 6) * 6, p.y + p.a * 30); ctx.rotate(p.a * 5 + h * 6); ctx.scale(1, 0.4 + 0.6 * Math.abs(Math.sin(p.a * 7 + h * 3)));
        ctx.beginPath(); ctx.moveTo(-4, 0); ctx.quadraticCurveTo(0, -3.2, 4, 0); ctx.quadraticCurveTo(0, 3.2, -4, 0); ctx.fill(); ctx.restore();
      }); break;
      case 'confetti': deco(2, 0.9, (p, a, h) => { ctx.globalAlpha = a; ctx.fillStyle = CONF_C[(h * 6) | 0]; ctx.save(); ctx.translate(p.x + (h - 0.5) * 14 * p.a * 2, p.y + p.a * p.a * 60 - p.a * 10); ctx.rotate(p.a * 9 + h * 6); ctx.fillRect(-2, -1.2 * Math.abs(Math.cos(p.a * 8 + h * 5)) - 0.3, 4, 2.4 * Math.abs(Math.cos(p.a * 8 + h * 5)) + 0.6); ctx.restore(); }); break;
      case 'sparkle': if (preview) { ctx.globalCompositeOperation = 'lighter'; deco(2, 0.6, (p, a, h) => { ctx.globalAlpha = a; ctx.fillStyle = st.color; ctx.beginPath(); starPath(ctx, p.x + (h - 0.5) * 10, p.y + (hash1(p.i + 2) - 0.5) * 10, 1 + 3 * a, 0.4 + 1.2 * a, 5, p.a * 4); ctx.fill(); }); } break;
      case 'fire': if (preview) { ctx.globalCompositeOperation = 'lighter'; deco(2, 0.5, (p, a, h) => { ctx.fillStyle = h < 0.5 ? '#ffb030' : '#ff5a1a'; ctx.globalAlpha = a * 0.35; ctx.beginPath(); ctx.arc(p.x + (h - 0.5) * 8, p.y - p.a * 50, 1 + 6 * a, 0, TAU); ctx.fill(); ctx.globalAlpha = a; ctx.beginPath(); ctx.arc(p.x + (h - 0.5) * 8, p.y - p.a * 50, 0.5 + 2 * a, 0, TAU); ctx.fill(); }); } break;
    }
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  }

  // ---------------------------------------------------------------- create
  function create(canvas) {
    const ctx = canvas.getContext('2d');
    let dpr = 1, cssW = canvas.clientWidth || canvas.width || 1280, cssH = canvas.clientHeight || canvas.height || 720;
    let sc = null, cosm = Object.assign({}, COSM_DEFAULT), trailN = 0;
    let ballSt = COSMETICS.balls[0], trailSt = COSMETICS.trails[1];
    const P = createParticles();
    const trail = [];
    let amb = null, lastCam = null, ballRot = 0, lastBX = null, lastBY = null;

    const R = {
      canvas, ctx,
      resize(w, h) {
        cssW = Math.max(1, w); cssH = Math.max(1, h);
        dpr = Math.min(root.devicePixelRatio || 1, 2);
        canvas.width = Math.round(cssW * dpr); canvas.height = Math.round(cssH * dpr);
        canvas.style.width = cssW + 'px'; canvas.style.height = cssH + 'px';
        if (sc) amb = initAmbient(sc.ambType, cssW, cssH);
      },
      setHole(hole, theme, cosmetics) {
        cosm = Object.assign({}, COSM_DEFAULT, cosmetics || {});
        ballSt = byId(COSMETICS.balls, cosm.ball); trailSt = byId(COSMETICS.trails, cosm.trail);
        sc = buildScene(hole, theme, cosm, true);
        sc.flagSt = byId(COSMETICS.flags, cosm.flag);
        { const mm = /h(\d+)$/.exec((hole && hole.id) || ''); sc.flagNum = cosm.holeNum || (hole && hole.n) || (mm ? +mm[1] : 1); }
        amb = initAmbient(sc.ambType, cssW, cssH);
        P.ps.length = 0; trail.length = 0; lastCam = null; lastBX = null;
      },
      worldToScreen(x, y, cam) { const z = cam.zoom || 1; return [cssW / 2 + (x - cam.x) * z, cssH / 2 + (y - cam.y) * z]; },
      screenToWorld(sx, sy, cam) { const z = cam.zoom || 1; return [cam.x + (sx - cssW / 2) / z, cam.y + (sy - cssH / 2) / z]; },
      trailPush(x, y) {
        const l = trail[trail.length - 1];
        if (l && Math.hypot(x - l.x, y - l.y) < 2.5) return;
        if (l && Math.hypot(x - l.x, y - l.y) > 200) trail.length = 0;
        trail.push({ x, y, a: 0, i: (trailN = (trailN + 1) & 0xffffff) }); if (trail.length > 48) trail.shift();
        const s = trailSt.style;
        if (s === 'fire' && Math.random() < 0.6 * P.scale) P.add({ x: x + rnd(-2, 2), y: y + rnd(-2, 2), vx: rnd(-15, 15), vy: rnd(-40, -10), life: rnd(0.25, 0.5), s: rnd(2, 4), s2: 0.5, c: Math.random() < 0.5 ? '#ffb030' : '#ff5a1a', shape: 6, add: true });
        else if (s === 'sparkle' && Math.random() < 0.5 * P.scale) P.add({ x: x + rnd(-4, 4), y: y + rnd(-4, 4), vx: rnd(-10, 10), vy: rnd(-10, 10), life: rnd(0.3, 0.6), s: rnd(2, 4), s2: 0, c: trailSt.color, shape: 4, vr: 4, add: true });
        else if (s === 'inferno' && Math.random() < 0.7 * P.scale) P.add({ x: x + rnd(-3, 3), y: y + rnd(-3, 3), vx: rnd(-20, 20), vy: rnd(-70, -20), life: rnd(0.3, 0.7), s: rnd(2.5, 5), s2: 0.5, c: Math.random() < 0.4 ? '#ffd34a' : Math.random() < 0.5 ? '#ff7a1a' : '#ff2a0a', shape: 6, add: true });
        else if (s === 'afterburner' && Math.random() < 0.35 * P.scale) P.add({ x, y, vx: rnd(-10, 10), vy: rnd(-10, 10), life: rnd(0.15, 0.3), s: rnd(2, 3.5), s2: 0.5, c: '#bfe4ff', shape: 6, add: true });
        else if (s === 'bubbles' && Math.random() < 0.25) P.add({ x, y, vx: rnd(-8, 8), vy: rnd(-30, -10), life: rnd(0.5, 0.9), s: rnd(1.5, 3), s2: 4, c: trailSt.color, shape: 3 });
      },
      trailClear() { trail.length = 0; },
      spawn(kind, x, y, o) { if (sc && isFinite(x) && isFinite(y)) spawnFx(kind, x, y, o || {}); },
      _debris(g, c) { P.burst(g.x + g.w / 2, g.y + g.h / 2, clamp(Math.round(g.w * g.h / 150), 8, 30), { sp: 120, g: 900, life: 1.1, s: 5, c: [c, shade(c, -0.3), shade(c, 0.15)], shape: 1, vr: 14, jit: Math.min(g.w, 60) }); spawnFx('dust', g.x + g.w / 2, g.y + g.h, { m: 1 }); },
      get scene() { return sc; },
      draw(frame) {
        if (!sc) { ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.fillStyle = '#000'; ctx.fillRect(0, 0, canvas.width, canvas.height); return; }
        frame = frame || {};
        const cam = frame.cam || { x: sc.hole.w / 2, y: sc.gMean, zoom: 1 }, z = cam.zoom || 1;
        const W = frame.W, S = frame.S || { t: frame.time || 0, dyn: [], cannon: -1 };
        const t = frame.time !== undefined ? frame.time : performance.now() / 1000;
        const dt = clamp(frame.dt !== undefined ? frame.dt : 1 / 60, 0, 0.1);
        const sh = frame.shake || { x: 0, y: 0 };
        const gsp = W && W.opts ? W.opts.gspeed : 1;
        const tg = (S.t || 0) * gsp;
        const camDX = lastCam ? (cam.x - lastCam.x) * z : 0, camDY = lastCam ? (cam.y - lastCam.y) * z : 0;
        lastCam = { x: cam.x, y: cam.y };
        const a11y = frame.a11y || null;
        sc.cb = !!(a11y && a11y.colorblind); sc.rfx = !!(a11y && a11y.reducedFx);
        P.scale = sc.rfx ? 0.25 : 1;

        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
        drawSky(ctx, sc, cssW, cssH, cam, t);
        drawLayers(ctx, sc, cssW, cssH, cam, sc.rfx ? 0 : t, dpr);

        // ---- world
        const ox = cssW / 2 + (sh.x || 0) - cam.x * z, oy = cssH / 2 + (sh.y || 0) - cam.y * z;
        ctx.setTransform(dpr * z, 0, 0, dpr * z, dpr * ox, dpr * oy);
        const m = 40 / z;
        const view = { x0: cam.x - cssW / 2 / z - m, x1: cam.x + cssW / 2 / z + m, y0: cam.y - cssH / 2 / z - m, y1: cam.y + cssH / 2 / z + m };
        const gm = sc.hole.gm || [];
        for (const i of sc.back) if (inBox(sc.gBox[i], view)) drawGimmickBack(ctx, sc, gm[i], i, S, tg, t);
        drawTerrain(ctx, sc, t, view);
        let cup = W && GOLF.Physics ? GOLF.Physics.cupState(W, S) : { x: sc.hole.cup[0], y: sc.hole.cup[1], w: sc.hole.cupW || 30 };
        drawCupNotch(ctx, sc, cup);
        drawTee(ctx, sc);
        for (const i of sc.front) if (inBox(sc.gBox[i], view)) drawGimmickFront(ctx, sc, gm[i], i, S, tg, t, dt, R);
        drawFlag(ctx, sc, cup, t, S.holed, sc.rfx ? 0 : frame.flagWave);
        // trail
        for (const p of trail) p.a += dt;
        while (trail.length && trail[0].a > 0.9) trail.shift();
        drawTrail(ctx, trail, trailSt, t, ballSt);
        if (frame.ghost) drawGhost(ctx, frame.ghost, z, t, sc.rfx);
        // ball
        const inPipe = S.ride >= 0 && gm[S.ride] && gm[S.ride].t === 'pipe';
        if (frame.S && !(S.cannon >= 0) && !inPipe) {
          if (lastBX !== null && Math.abs(S.x - lastBX) < 100) ballRot += (S.x - lastBX) / BALL_R;
          lastBX = S.x; lastBY = S.y;
          const gy = groundY(sc.hole, S.x), d = gy - S.y;
          if (d > 0 && d < 260 && !S.holed) { ctx.fillStyle = 'rgba(0,0,0,' + (0.25 * (1 - d / 260)).toFixed(3) + ')'; ctx.beginPath(); ctx.ellipse(S.x, gy - 1, BALL_R * (1 + d / 200), 2.2, 0, 0, TAU); ctx.fill(); }
          const sp = Math.hypot(S.vx || 0, S.vy || 0);
          const look = sp > 30 ? [S.vx, S.vy] : [cup.x - S.x, cup.y - S.y];
          if (S.holed) { ctx.save(); ctx.beginPath(); ctx.rect(cup.x - 40, cup.y - 60, 80, 60.5); ctx.clip(); }
          drawBall(ctx, ballSt, S.x, S.y, BALL_R, ballRot, S.vx, S.vy, look, t);
          if (S.holed) ctx.restore();
        }
        for (const i of sc.over) if (inBox(sc.gBox[i], view)) drawGimmickOver(ctx, sc, gm[i], i, S, tg, t, dt, view, R);
        P.update(dt);
        P.draw(ctx, view);
        drawLiquids(ctx, sc, t, view);
        if (frame.aim) drawAimPath(ctx, frame.aim, z);
        // fog
        if (sc.fogs.length) {
          const fr = frame.fogReveal;
          for (const f of sc.fogs) {
            const rv = fr ? clamp(+fr[f.i] || 0, 0, 1) : 0;
            const a = 1 - rv; if (a <= 0.01) continue;
            const im = f.img; if (im.x > view.x1 || im.x + im.w < view.x0 || im.y > view.y1 || im.y + im.h < view.y0) continue;
            ctx.globalAlpha = a; ctx.drawImage(im.c, im.x, im.y, im.w, im.h); ctx.globalAlpha = 1;
          }
        }
        if (frame.aim) drawAimMeter(ctx, frame.aim, z, t, frame.prevAim, sc.cb);
        // ---- screen-space ambient
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        let windX = 0;
        if (sc.globalWind && W) {
          for (const g of gm) if (g.t === 'wind' && g.w === undefined) windX += g.ax * poses().windFactor(g, tg) * (W.opts.windMul || 1);
          drawWindStreaks(ctx, windX, cssW, cssH, t);
        }
        if (!sc.rfx) drawAmbient(ctx, sc.ambType, amb, sc.col.amb[sc.ambType] || ['#fff'], cssW, cssH, t, dt, camDX, camDY, windX * 0.12);
      },
    };

    function drawWindStreaks(ctx, wx, w, h, t) {
      const a = clamp(Math.abs(wx) / 400, 0, 1); if (a < 0.05) return;
      const dir = wx > 0 ? 1 : -1, sp = 300 + Math.abs(wx) * 1.5;
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.5; ctx.lineCap = 'round';
      const N = Math.round(6 + a * 14);
      for (let k = 0; k < N; k++) {
        const u = frac(hash1(k * 4.1) + t * sp / (w + 200));
        const x = dir > 0 ? u * (w + 200) - 100 : w + 100 - u * (w + 200), y = hash1(k * 9.7) * h * 0.85 + Math.sin(t * 2 + k) * 6;
        ctx.globalAlpha = 0.18 * a * Math.sin(u * Math.PI) * 2;
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - dir * (30 + 50 * a), y); ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }

    function markHits(x, y) {
      const gm = sc.hole.gm || [];
      for (let i = 0; i < gm.length; i++) {
        const g = gm[i];
        if (g.t === 'bumper') { if (Math.hypot(x - g.x, y - g.y) < g.r + 20) sc.hit[i] = 1; }
        else if (g.t === 'pad') { if (Math.hypot(x - g.x, y - g.y) < g.L / 2 + 20) sc.padHit[i] = 1; }
      }
    }

    function spawnFx(kind, x, y, o) {
      const col = sc.col, B = P.burst;
      const m = o.m !== undefined ? o.m : 1;
      switch (kind) {
        case 'bounce': {
          const s = o.surf || o.s || 'f', mag = o.m || 200, n = clamp(Math.round(mag / 70), 2, 14), sp = clamp(mag * 0.35, 60, 360);
          const S = col.surf[s] || col.surf.k;
          if (s === 'f' || s === 'r') { B(x, y + 3, n, { sp, spread: 2.2, g: 700, life: 0.6, s: 2.4, c: [S.c, S.hi, S.dk], shape: 1, vr: 12 }); B(x, y + 4, Math.ceil(n / 3), { sp: 30, spread: 2.5, g: -10, drag: 2, life: 0.6, s: 3, s2: 8, c: rgba(col.pal.ground, 0.35) }); }
          else if (s === 's') B(x, y + 3, n * 2, { sp: sp * 1.1, spread: 1.8, g: 800, life: 0.7, s: 1.8, c: [S.c, S.hi, S.dk] });
          else if (s === 'i') B(x, y + 2, n, { sp: sp * 0.8, spread: 2.4, g: 200, drag: 2, life: 0.5, s: 1.6, c: ['#ffffff', S.c], shape: 2, add: true });
          else if (s === 'g') B(x, y + 2, n, { sp: sp * 0.6, spread: 2.2, g: 700, life: 0.6, s: 2.8, c: [col.goo, col.gooHi, col.gooGreen] });
          else if (s === 'b') { P.add({ x, y, life: 0.35, s: 3, s2: 24, c: col.pinkHi, shape: 3 }); B(x, y, n, { sp, spread: 2.2, g: 300, life: 0.5, s: 2.2, c: [col.pink, col.pinkHi] }); markHits(x, y); }
          else if (s === 'm' || s === 'q' || s === 'c') B(x, y, n, { sp: sp * 1.3, spread: 2.6, g: 600, life: 0.4, s: 1.6, c: ['#fff6c0', '#ffd34a'], shape: 2, add: true });
          else B(x, y + 3, n, { sp: sp * 0.7, spread: 2.2, g: 500, life: 0.6, s: 2.2, c: [S.c, S.dk, col.pebble], shape: 1, vr: 10 });
          break;
        }
        case 'pad': markHits(x, y); B(x, y, 8, { sp: 160, spread: 2, g: 300, life: 0.5, s: 2.2, c: [col.pink, col.pinkHi] }); break;
        case 'bumper': markHits(x, y); B(x, y, 12, { sp: 260, life: 0.35, s: 1.8, c: ['#ffffff', col.bumper], shape: 2, add: true }); break;
        case 'splash': {
          B(x, y, 22, { sp: 260, spread: 1.4, g: 900, life: 0.9, s: 2.6, c: [col.water, col.waterHi, '#ffffff'] });
          P.add({ x, y: y - 2, life: 0.5, s: 4, s2: 34, c: col.waterHi, shape: 3 }); P.add({ x, y: y - 2, life: 0.7, s: 2, s2: 22, c: col.waterHi, shape: 3, delay: 0.12 });
          break;
        }
        case 'lava': {
          B(x, y, 18, { sp: 240, spread: 1.4, g: 800, life: 0.9, s: 2.8, c: [col.lava, col.lavaHot, '#ffffff'], shape: 6, add: true });
          B(x, y - 6, 8, { sp: 40, spread: 1.2, g: -60, drag: 1.5, life: 1.4, s: 5, s2: 16, c: 'rgba(60,40,40,0.5)' });
          break;
        }
        case 'sand': B(x, y + 3, Math.round(10 + 14 * clamp((o.m || 300) / 500, 0, 1)), { sp: 200, spread: 1.6, g: 850, life: 0.8, s: 2, c: [col.surf.s.c, col.surf.s.hi, col.surf.s.dk] }); break;
        case 'spark': markHits(x, y); B(x, y, Math.round(8 + 10 * clamp(m, 0, 2)), { sp: 280, life: 0.4, g: 400, s: 1.8, c: ['#ffffff', '#ffe27a', '#ffb030'], shape: 2, add: true }); P.add({ x, y, life: 0.2, s: 3, s2: 9, c: '#ffffff', shape: 6, add: true }); break;
        case 'break': {
          const gm = sc.hole.gm || [], g = o.g !== undefined ? gm[o.g] : null;
          if (g && g.t === 'glass') {
            P.burst(g.x + g.w / 2, g.y + g.h / 2, clamp(Math.round(g.w * g.h / 90), 14, 40), { sp: 260, g: 900, life: 1.3, s: 7, c: [rgba(col.glass, 0.85), '#ffffff', rgba(col.glass, 0.6)], shape: 9, vr: 18, jit: Math.min(Math.max(g.w, g.h), 60) });
            B(x, y, 14, { sp: 320, life: 0.3, s: 1.6, c: ['#ffffff', col.glass], shape: 2, add: true });
            P.add({ x, y, life: 0.25, s: 4, s2: 30, c: '#ffffff', shape: 3 });
            break;
          }
          const c = g && g.t === 'breakable' ? col.brick : col.solid;
          if (g && g.w) P.burst(g.x + g.w / 2, g.y + g.h / 2, clamp(Math.round(g.w * g.h / 120), 10, 34), { sp: 220, g: 900, life: 1.2, s: 5, c: [c, shade(c, -0.3), shade(c, 0.2)], shape: 1, vr: 16, jit: Math.min(g.w, 50) });
          else B(x, y, 18, { sp: 220, g: 900, life: 1.1, s: 4.5, c: [c, shade(c, -0.3)], shape: 1, vr: 16 });
          spawnFx('dust', x, y, { m: 1.2 });
          break;
        }
        case 'teleport': {
          const c = col.tele[0];
          P.add({ x, y, life: 0.45, s: 26, s2: 2, c, shape: 3 }); P.add({ x, y, life: 0.5, s: 4, s2: 36, c: '#ffffff', shape: 3, delay: 0.05 });
          B(x, y, 16, { sp: 150, drag: 3, life: 0.6, s: 2.6, s2: 0, c: [c, '#ffffff', col.portalB], shape: 4, vr: 6, add: true });
          if (o.x2 !== undefined) spawnFx('teleport', o.x2, o.y2, {});
          break;
        }
        case 'fire': {
          const a = o.a !== undefined ? o.a : -Math.PI / 2, gm = sc.hole.gm || [];
          let r = 20; for (const g of gm) if (g.t === 'cannon' && Math.hypot(g.x - x, g.y - y) < 4) r = g.r || 20;
          const mx = x + Math.cos(a) * r * 2.1, my = y + Math.sin(a) * r * 2.1;
          P.add({ x: mx, y: my, life: 0.18, s: 6, s2: 12, c: '#fff2b0', shape: 6, add: true });
          B(mx, my, 14, { ang: a, spread: 0.9, sp: 380, drag: 4, life: 0.35, s: 2.2, c: ['#ffd34a', '#ff8a2a', '#ffffff'], shape: 2, add: true });
          B(mx, my, 10, { ang: a, spread: 1.4, sp: 120, drag: 2.5, g: -30, life: 1.1, s: 6, s2: 16, c: ['rgba(200,200,200,0.55)', 'rgba(150,150,150,0.5)'] });
          break;
        }
        case 'confetti': {
          const cs = ['#ff4d6d', '#ffd23c', '#3cf0c0', '#3aa0ff', '#b57aff', '#ffffff', col.pal.accent];
          B(x, y, Math.round(50 * clamp(m, 0.3, 2)), { sp: 420, spread: 1.6, g: 420, drag: 2.2, life: 2.2, s: 4.5, c: cs, shape: 1, vr: 16 });
          break;
        }
        case 'dust': B(x, y, Math.round(4 + 6 * clamp(m, 0, 2)), { sp: 60, spread: 2.6, g: -12, drag: 3, life: 0.7, s: 3, s2: 10, c: rgba(mix(col.pal.ground, '#ffffff', 0.45), 0.45) }); break;
        case 'stick': B(x, y, 12, { sp: 120, g: 400, life: 0.5, s: 2.8, c: [col.goo, col.gooHi, col.gooGreen] }); P.add({ x, y, life: 0.3, s: 3, s2: 14, c: col.gooHi, shape: 3 }); break;
        case 'holed': cupFxOn(P, col.pal.accent, o.effect || cosm.cupEffect || 'classic', x, y); break;
        case 'swish': {
          const cs = ['#ffd23c', '#fff2a0', '#ffffff', col.pal.accent];
          for (let k = 0; k < 4; k++) P.add({ x, y: y - 8, life: 0.8, s: 6, s2: 70 + k * 40, c: k & 1 ? col.pal.accent : '#ffe27a', shape: 3, delay: k * 0.09 });
          P.add({ x, y: y - 8, life: 0.35, s: 10, s2: 40, c: '#fff6c0', shape: 6, add: true });
          B(x, y - 8, 36, { sp: 420, drag: 2.4, g: 120, life: 1.2, s: 6, s2: 1, c: cs, shape: 4, vr: 8, add: true });
          B(x, y - 8, 24, { ang: -Math.PI / 2, spread: 1.2, sp: 520, drag: 2, life: 0.6, s: 2.2, c: ['#ffffff', '#ffe27a'], shape: 2, add: true });
          P.add({ x, y: y - 70, vy: -45, drag: 1.2, life: 1.6, s: 30, c: '#ffe14a', shape: 7, text: 'SWISH!' });
          for (let k = 0; k < 8; k++) P.add({ x: x + rnd(-60, 60), y: y - 70 + rnd(-18, 18), vy: -30, life: rnd(0.4, 0.9), s: rnd(3, 5), s2: 0, c: '#ffffff', shape: 4, vr: 5, add: true, delay: rnd(0, 0.6) });
          break;
        }
        case 'boom': {
          P.add({ x, y, life: 0.22, s: 18, s2: 40, c: '#fff6d0', shape: 6, add: true });
          P.add({ x, y, life: 0.5, s: 6, s2: 110, c: '#ffd34a', shape: 3 });
          B(x, y, 28, { sp: 300, drag: 3, g: -40, life: 0.7, s: 7, s2: 2, c: ['#ffd34a', '#ff8a2a', '#ff4d1a', '#ffffff'], shape: 6, add: true });
          B(x, y, 18, { sp: 420, g: 700, life: 0.9, s: 3, c: ['#3a3d48', '#5a5f6e', '#ffb030'], shape: 1, vr: 16 });
          B(x, y, 14, { sp: 90, drag: 1.8, g: -50, life: 1.6, s: 8, s2: 22, c: ['rgba(60,55,60,0.5)', 'rgba(110,100,100,0.45)'] });
          break;
        }
        case 'token': {
          P.add({ x, y, life: 0.4, s: 4, s2: 30, c: col.token, shape: 3 });
          P.add({ x, y, life: 0.25, s: 8, s2: 18, c: '#fff6c0', shape: 6, add: true });
          B(x, y, 16, { sp: 200, drag: 2.5, g: 60, life: 0.8, s: 4, s2: 0.5, c: [col.token, '#ffffff', '#fff2a0'], shape: 4, vr: 8, add: true });
          break;
        }
        case 'pop': {
          P.add({ x, y, life: 0.25, s: 10, s2: 30 * clamp(m, 0.3, 1.2) + 6, c: col.bubble, shape: 3 });
          B(x, y, Math.round(6 + 10 * clamp(m, 0, 1)), { sp: 160 * clamp(m, 0.4, 1.2), drag: 2, g: 300, life: 0.45, s: 1.8, c: ['#ffffff', col.bubble], add: true });
          break;
        }
        case 'skim': {
          P.add({ x, y: y + 5, life: 0.7, s: 3, s2: 34, c: '#ffffff', shape: 8 });
          P.add({ x, y: y + 5, life: 0.9, s: 2, s2: 22, c: col.waterHi, shape: 8, delay: 0.1 });
          B(x, y + 2, 12, { ang: -Math.PI / 2, spread: 1.6, sp: 180, g: 800, life: 0.55, s: 1.8, c: ['#ffffff', col.skim, col.waterHi] });
          break;
        }
        case 'sink': {
          const c = [col.quick, col.quickDk, shade(col.quick, 0.25)];
          for (let k = 0; k < 3; k++) P.add({ x, y: y + 5, life: 0.8, s: 22 - k * 6, s2: 2, c: col.quickDk, shape: 8, delay: k * 0.15 });
          for (let k = 0; k < 14; k++) { const a = k * TAU / 14; P.add({ x: x + Math.cos(a) * 16, y: y + 4 + Math.sin(a) * 4, vx: -Math.sin(a) * 50 - Math.cos(a) * 20, vy: 10, drag: 2, life: 0.8, s: 2.2, c: c[k % 3] }); }
          break;
        }
        case 'ring': {
          P.add({ x, y, life: 0.45, s: 20, s2: 60, c: col.ring, shape: 3 });
          P.add({ x, y, life: 0.3, s: 10, s2: 26, c: '#fff6c0', shape: 6, add: true });
          B(x, y, 18, { sp: 340, drag: 3, life: 0.45, s: 2, c: ['#ffffff', col.ring], shape: 2, add: true });
          break;
        }
        default: spawnFx('dust', x, y, o);
      }
    }
    R.resize(cssW, cssH);
    return R;
  }

  // ---------------------------------------------------------------- cup effects (shared by game + previews)
  function cupFxOn(P0, acc, id, x, y) {
    // reduced effects: bursts are already scaled; single adds keep rings/text, drop ~70% of the rest
    const P = P0.scale < 1 ? { scale: P0.scale, burst: P0.burst, add: (o) => { if (o.shape === 3 || o.shape === 7 || o.shape === 14 || o.shape === 15 || o.shape === 18 || Math.random() < 0.3) P0.add(o); } } : P0;
    const B = P.burst;
    switch (id) {
      case 'confetti':
        B(x - 10, y - 4, 50, { ang: -Math.PI / 2 - 0.35, spread: 0.6, sp: 650, g: 500, drag: 2.2, life: 2.5, s: 5, c: ['#ff4d6d', '#ffd23c', '#3cf0c0', '#3aa0ff', '#b57aff'], shape: 1, vr: 18 });
        B(x + 10, y - 4, 50, { ang: -Math.PI / 2 + 0.35, spread: 0.6, sp: 650, g: 500, drag: 2.2, life: 2.5, s: 5, c: ['#ff4d6d', '#ffd23c', '#3cf0c0', '#3aa0ff', '#ffffff'], shape: 1, vr: 18 });
        break;
      case 'fireworks':
        for (let k = 0; k < 4; k++) {
          const bx = x + rnd(-90, 90), by = y - rnd(120, 220), d = k * 0.28, c = ['#ff4d6d', '#ffd23c', '#3cf0c0', '#b57aff'][k];
          P.add({ x, y: y - 4, vx: (bx - x) / 0.4, vy: (by - y) / 0.4, life: 0.4, s: 2.4, c: '#fff2c0', shape: 2, add: true, delay: d });
          B(bx, by, 34, { sp: 260, drag: 2.2, g: 160, life: 1.2, s: 2.2, c: [c, '#ffffff'], shape: 2, add: true, delay: d + 0.4 });
          P.add({ x: bx, y: by, life: 0.3, s: 4, s2: 14, c, shape: 6, add: true, delay: d + 0.4 });
        }
        break;
      case 'shockwave':
        for (let k = 0; k < 3; k++) P.add({ x, y: y - 4, life: 0.7, s: 4, s2: 90 + k * 30, c: k === 1 ? acc : '#ffffff', shape: 3, delay: k * 0.12 });
        B(x, y - 2, 20, { ang: -Math.PI / 2, spread: Math.PI, sp: 300, drag: 3, life: 0.6, s: 3, s2: 9, c: rgba('#ffffff', 0.5) });
        break;
      case 'stars':
        B(x, y - 6, 18, { ang: -Math.PI / 2, spread: 1.8, sp: 300, g: 260, drag: 1, life: 1.6, s: 7, s2: 2, c: ['#ffd23c', '#fff2a0', acc], shape: 4, vr: 6 });
        P.add({ x, y: y - 6, life: 0.4, s: 5, s2: 16, c: '#fff2a0', shape: 6, add: true });
        break;
      case 'hearts':
        B(x, y - 6, 16, { ang: -Math.PI / 2, spread: 1.4, sp: 180, g: -60, drag: 1.2, life: 1.8, s: 7, s2: 4, c: ['#ff4d8d', '#ff8fb8', '#ffffff'], shape: 5, vr: 3 });
        break;
      case 'bubbles':
        B(x, y - 6, 22, { ang: -Math.PI / 2, spread: 1.2, sp: 160, g: -90, drag: 1.6, life: 1.8, s: 4, s2: 9, c: ['#bfe8ff', '#ffffff', '#8fd0ff'], shape: 3, delayV: 0.5 });
        P.add({ x, y: y - 4, life: 0.35, s: 3, s2: 30, c: '#dff4ff', shape: 3 });
        break;
      case 'petals':
        B(x, y - 6, 30, { ang: -Math.PI / 2, spread: 1.5, sp: 300, g: 90, drag: 2.2, life: 2.4, s: 4.5, c: ['#ffb3d1', '#ffd6e6', '#ff8fb8', '#ffffff'], shape: 13, vr: 5 });
        P.add({ x, y: y - 6, life: 0.4, s: 4, s2: 14, c: '#ffd6e6', shape: 6, add: true });
        break;
      case 'coins':
        B(x, y - 4, 26, { ang: -Math.PI / 2, spread: 0.7, sp: 480, g: 900, life: 1.6, s: 5, s2: 4, c: ['#ffd23c', '#ffe27a'], shape: 10, vr: 14, delayV: 0.45 });
        P.add({ x, y: y - 4, life: 0.3, s: 4, s2: 14, c: '#fff2a0', shape: 6, add: true });
        break;
      case 'balloons':
        for (let k = 0; k < 7; k++) P.add({ x: x + rnd(-24, 24), y: y - 10, vx: rnd(-25, 25), vy: rnd(-90, -60), g: -40, drag: 0.6, life: 2.6, s: rnd(7, 9), c: ['#ff4d6d', '#ffd23c', '#3cf0c0', '#3aa0ff', '#b57aff', '#ff8a2a', '#ff8fb8'][k], shape: 11, rot: rnd(0, TAU), vr: rnd(2, 4), delay: k * 0.06 });
        break;
      case 'pixels':
        B(x, y - 6, 40, { ang: -Math.PI / 2, spread: 2.2, sp: 360, g: 620, life: 1.4, s: 5, s2: 4, c: ['#ff3a3a', '#ffd23c', '#3ad85a', '#3a8aff', '#ffffff', '#ff3cf0'], shape: 16 });
        P.add({ x, y: y - 8, life: 0.2, s: 22, s2: 6, c: '#ffffff', shape: 16 });
        break;
      case 'lightning':
        for (let k = 0; k < 3; k++) {
          const bx = x + (k - 1) * rnd(10, 30), d = k * 0.18;
          P.add({ x: bx, y: y - 2, life: 0.32, s: 230, s2: 230, c: '#9ad0ff', shape: 12, rot: rnd(0, 99), add: true, delay: d });
          P.add({ x: bx, y: y - 4, life: 0.3, s: 10, s2: 22, c: '#dff0ff', shape: 6, add: true, delay: d });
          B(bx, y - 4, 10, { ang: -Math.PI / 2, spread: 2, sp: 260, g: 600, life: 0.5, s: 1.8, c: ['#ffffff', '#9ad0ff'], shape: 2, add: true, delay: d });
        }
        break;
      case 'rainbow':
        P.add({ x, y: y - 2, life: 1.7, s: 8, s2: 78, c: '#ffffff', shape: 14 });
        B(x, y - 6, 20, { ang: -Math.PI / 2, spread: 2.6, sp: 240, drag: 2.4, life: 1.4, s: 4, s2: 0.5, c: RAINBOW6, shape: 4, vr: 6, add: true });
        break;
      case 'blackhole': {
        const cy = y - 46;
        P.add({ x, y: cy, life: 0.85, s: 2, s2: 16, c: '#c060ff', shape: 15, vr: 9 });
        P.add({ x, y: cy, life: 0.3, s: 16, s2: 0.5, c: '#c060ff', shape: 15, vr: 14, delay: 0.85 });
        for (let k = 0; k < 34; k++) { const a = rnd(0, TAU), d = rnd(55, 95), sp = rnd(100, 160); P.add({ x: x + Math.cos(a) * d, y: cy + Math.sin(a) * d, vx: -Math.cos(a) * sp - Math.sin(a) * 60, vy: -Math.sin(a) * sp + Math.cos(a) * 60, life: d / sp, s: 2.4, s2: 0.6, c: ['#c060ff', '#ffffff', '#6a7aff'][k % 3], shape: 2, add: true, delay: rnd(0, 0.35) }); }
        P.add({ x, y: cy, life: 0.4, s: 2, s2: 70, c: '#ffffff', shape: 3, delay: 1.15 });
        P.add({ x, y: cy, life: 0.3, s: 14, s2: 4, c: '#e0b0ff', shape: 6, add: true, delay: 1.15 });
        B(x, cy, 16, { sp: 260, drag: 2, life: 0.7, s: 3, s2: 0.5, c: ['#ffffff', '#c060ff'], shape: 4, vr: 6, add: true, delay: 1.15 });
        break;
      }
      case 'supernova':
        P.add({ x, y: y - 10, life: 0.5, s: 34, s2: 6, c: '#fff6d0', shape: 6, add: true });
        for (let k = 0; k < 3; k++) P.add({ x, y: y - 10, life: 0.9, s: 6, s2: 120 + k * 40, c: ['#ffd23c', '#ff6ad0', '#7ad0ff'][k], shape: 3, delay: k * 0.1 });
        B(x, y - 10, 46, { sp: 420, drag: 2.2, life: 1.3, s: 2.4, c: ['#ffffff', '#ffd23c', '#ff6ad0', '#7ad0ff'], shape: 2, add: true });
        B(x, y - 10, 24, { sp: 200, drag: 1.5, g: 80, life: 1.8, s: 6, s2: 1, c: ['#ffffff', '#fff2a0'], shape: 4, vr: 6, add: true, delay: 0.15, delayV: 0.3 });
        break;
      case 'blur':
        // horizontal speed streaks + a stretched flash
        for (let k = 0; k < 2; k++) B(x, y - 10 - k * 14, 14, { ang: k ? 0 : Math.PI, spread: 0.25, sp: 700, drag: 3.5, life: 0.6, s: 2, c: ['#ffffff', '#ff4a3a', '#ffe23a'], shape: 2, add: true, jit: 20 });
        B(x, y - 18, 14, { ang: 0, spread: TAU, sp: 520, drag: 4, life: 0.5, s: 1.6, c: ['#ffffff', '#bfe0ff'], shape: 2, add: true });
        P.add({ x, y: y - 10, life: 0.3, s: 6, s2: 60, c: '#ffffff', shape: 8 });
        P.add({ x, y: y - 10, life: 0.25, s: 12, s2: 4, c: '#fff6c0', shape: 6, add: true });
        break;
      case 'diploma':
        B(x, y - 6, 9, { ang: -Math.PI / 2, spread: 1.0, sp: 520, g: 700, drag: 0.6, life: 2.0, s: 7, c: ['#1d1d2c', '#3a4ab8'], shape: 17, vr: 9 });
        B(x, y - 6, 24, { ang: -Math.PI / 2, spread: 1.6, sp: 320, g: 300, drag: 1.5, life: 1.6, s: 3.5, c: ['#ffd23c', '#ffffff'], shape: 1, vr: 14 });
        P.add({ x, y: y - 6, life: 0.4, s: 4, s2: 40, c: '#ffd23c', shape: 3 });
        break;
      case 'kaleido': {
        // 6-fold mirrored bursts
        const cs = ['#3cf6ff', '#ff3cf0', '#ffe23a', '#7aff7a'];
        for (let k = 0; k < 12; k++) { const a = k * TAU / 12, c = cs[k % 4]; for (let j = 0; j < 3; j++) P.add({ x, y: y - 40, vx: Math.cos(a) * (120 + j * 70), vy: Math.sin(a) * (120 + j * 70), drag: 2, life: 1.1, s: 4 - j, s2: 0.5, c, shape: j === 1 ? 4 : 6, rot: a, vr: 3, add: true, delay: j * 0.08 }); }
        for (let k = 0; k < 2; k++) P.add({ x, y: y - 40, life: 0.8, s: 6, s2: 70 + k * 30, c: k ? '#ff3cf0' : '#3cf6ff', shape: 3, delay: k * 0.12 });
        break;
      }
      case 'phoenix':
        B(x, y - 4, 40, { ang: -Math.PI / 2, spread: 0.7, sp: 520, g: -80, drag: 2.2, life: 1.3, s: 6, s2: 1, c: ['#ff2a0a', '#ff7a1a', '#ffd34a', '#ffffff'], shape: 6, add: true });
        for (let sd = -1; sd <= 1; sd += 2) B(x, y - 70, 18, { ang: -Math.PI / 2 + sd * 1.1, spread: 0.5, sp: 380, g: 200, drag: 2.5, life: 1.1, s: 4, s2: 0.5, c: ['#ff7a1a', '#ffd34a'], shape: 13, vr: 4, add: true, delay: 0.25 });
        P.add({ x, y: y - 70, life: 0.4, s: 10, s2: 30, c: '#fff2b0', shape: 6, add: true, delay: 0.25 });
        break;
      case 'trophy':
        P.add({ x, y: y - 20, vy: -70, drag: 1.4, life: 2.0, s: 18, s2: 18, c: '#ffcf3a', shape: 18 });
        P.add({ x, y: y - 40, life: 0.45, s: 12, s2: 40, c: '#fff6c0', shape: 6, add: true });
        for (let k = 0; k < 3; k++) P.add({ x, y: y - 40, life: 0.9, s: 6, s2: 80 + k * 30, c: k === 1 ? '#ffffff' : '#ffd23c', shape: 3, delay: k * 0.12 });
        B(x, y - 40, 30, { sp: 300, drag: 2, g: 120, life: 1.6, s: 5, s2: 1, c: ['#ffd23c', '#fff2a0', '#ffffff'], shape: 4, vr: 8, add: true, delayV: 0.4 });
        B(x, y - 6, 20, { ang: -Math.PI / 2, spread: 0.8, sp: 520, g: 900, life: 1.5, s: 4.5, s2: 4, c: ['#ffd23c'], shape: 10, vr: 14, delayV: 0.4 });
        break;
      case 'infinity': {
        // sparkles traced along a lemniscate, then drifting out
        const cy = y - 60, N = 40;
        for (let k = 0; k < N; k++) { const a = k / N * TAU, d = 1 + Math.sin(a) * Math.sin(a), px = 52 * Math.cos(a) / d, py = 52 * Math.sin(a) * Math.cos(a) / d; P.add({ x: x + px, y: cy + py, vx: px * 0.4, vy: py * 0.4 - 10, drag: 1.5, life: 1.2, s: 3, s2: 0.5, c: k % 2 ? '#b57aff' : '#7ad0ff', shape: 6, add: true, delay: k * 0.018 }); }
        P.add({ x, y: cy, life: 0.4, s: 4, s2: 30, c: '#ffffff', shape: 6, add: true, delay: 0.72 });
        B(x, cy, 18, { sp: 220, drag: 2, life: 1, s: 4, s2: 0.5, c: ['#ffffff', '#b57aff', '#7ad0ff'], shape: 4, vr: 6, add: true, delay: 0.72 });
        break;
      }
      default:
        P.add({ x, y: y - 4, life: 0.5, s: 4, s2: 46, c: '#ffffff', shape: 3 });
        B(x, y - 4, 16, { ang: -Math.PI / 2, spread: 1.6, sp: 260, g: 300, drag: 1, life: 1.0, s: 4, s2: 1, c: ['#ffd23c', '#ffffff', acc], shape: 4, vr: 8, add: true });
    }
  }

  // ---------------------------------------------------------------- cosmetic previews
  const _palCache = Object.create(null);
  const _cupPrev = new Map();
  function previewTrail(n, t, path) {
    // synthetic ball path sampled on a fixed time grid so decorations stay stable
    const step = 1 / 50, i1 = Math.floor(t / step), out = [];
    for (let i = i1 - n + 1; i <= i1; i++) { const ti = i * step, q = path(ti); out.push({ x: q[0], y: q[1], a: Math.max(0, t - ti), i: i & 0x7fffffff }); }
    return out;
  }
  function drawCosmetic(ctx, cat, id, w, h, t) {
    t = t || 0;
    const list = COSMETICS[cat]; if (!list) return;
    const it = byId(list, id);
    ctx.save();
    ctx.beginPath(); ctx.rect(0, 0, w, h); ctx.clip();
    ctx.lineCap = 'butt'; ctx.lineJoin = 'miter'; ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    const m = Math.min(w, h);
    if (cat === 'balls') {
      const k = m * 0.3 / BALL_R, roll = t * 2.2, bob = Math.abs(Math.sin(t * 2.2)) * m * 0.04;
      ctx.fillStyle = 'rgba(0,0,0,0.22)'; ctx.beginPath(); ctx.ellipse(w / 2, h / 2 + BALL_R * k + m * 0.07, BALL_R * k * (0.95 - bob / m), BALL_R * k * 0.2, 0, 0, TAU); ctx.fill();
      ctx.translate(w / 2, h / 2 - bob); ctx.scale(k, k);
      drawBall(ctx, it, 0, 0, BALL_R, roll, 1, 0, [Math.cos(t * 1.3), Math.sin(t * 1.7)], t);
    } else if (cat === 'trails') {
      const k = m / 85, W = w / k, H = h / k;
      ctx.scale(k, k);
      const path = (ti) => [W / 2 + Math.sin(ti * 2.6) * W * 0.38, H / 2 + Math.sin(ti * 5.2) * H * 0.26];
      const tr = previewTrail(40, t, path);
      drawTrail(ctx, tr, it, t, COSMETICS.balls[0], true);
      const hd = tr[tr.length - 1];
      drawBall(ctx, COSMETICS.balls[0], hd.x, hd.y, BALL_R, t * 6, 0, 0, null, t);
    } else if (cat === 'cupEffects') {
      const k = Math.min(w / 160, h / 200), cx = w / 2, gy = h * 0.86;
      ctx.translate(cx, gy); ctx.scale(k, k);
      // ground + cup
      ctx.fillStyle = '#4fae46'; ctx.fillRect(-w / k, 0, 2 * w / k, h / k);
      ctx.fillStyle = '#62c64a'; ctx.fillRect(-w / k, 0, 2 * w / k, 5);
      ctx.fillStyle = '#0c0b12'; rrect(ctx, -15, -1, 30, 16, 4); ctx.fill();
      ctx.strokeStyle = '#f4f4f4'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(0, 8); ctx.lineTo(0, -70); ctx.stroke();
      ctx.fillStyle = '#ff4757'; ctx.beginPath(); ctx.moveTo(1, -70); ctx.lineTo(30, -62); ctx.lineTo(1, -52); ctx.closePath(); ctx.fill();
      const T = 2.8, cyc = Math.floor(t / T), ph = t - cyc * T, key = id + '|' + w + 'x' + h;
      let s = _cupPrev.get(key);
      if (!s || s.cyc !== cyc || ph < s.ph) {
        if (!s) { s = { P: createParticles() }; if (_cupPrev.size > 80) _cupPrev.clear(); _cupPrev.set(key, s); }
        s.P.ps.length = 0; s.cyc = cyc; s.ph = 0; cupFxOn(s.P, '#ff4757', it.id, 0, 0);
      }
      while (s.ph < ph - 1e-6) { const d = Math.min(1 / 30, ph - s.ph); s.P.update(d); s.ph += d; }
      if (ph < 0.25) { const u = ph / 0.25; drawBall(ctx, COSMETICS.balls[0], -40 + 40 * u, -50 + 50 * u * u, BALL_R, u * 6, 0, 0, null, t); }
      s.P.draw(ctx, null);
    } else if (cat === 'palettes') {
      const col = _palCache[it.id] || (_palCache[it.id] = buildColors(DEFAULT_THEME, it.id)), pal = col.pal;
      const g = ctx.createLinearGradient(0, 0, 0, h); g.addColorStop(0, pal.skyTop); g.addColorStop(1, pal.skyBottom);
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = col.dark ? mix(pal.skyBottom, '#ffffff', 0.75) : mix(pal.skyBottom, '#fff7d0', 0.8);
      ctx.globalAlpha = 0.3; ctx.beginPath(); ctx.arc(w * 0.74, h * 0.28, m * 0.17, 0, TAU); ctx.fill(); ctx.globalAlpha = 1;
      ctx.beginPath(); ctx.arc(w * 0.74, h * 0.28, m * 0.11, 0, TAU); ctx.fill();
      const hills = (c, base, amp, f, ph) => { ctx.fillStyle = c; ctx.beginPath(); ctx.moveTo(0, h); for (let x = 0; x <= w + 4; x += 4) ctx.lineTo(x, h * base - amp * h * (0.5 + 0.5 * Math.sin(x / w * f + ph))); ctx.lineTo(w, h); ctx.closePath(); ctx.fill(); };
      hills(pal.far, 0.6, 0.2, 7, 1 + t * 0.15); hills(pal.mid, 0.7, 0.13, 10, 3 + t * 0.3); hills(pal.near, 0.8, 0.08, 13, 0.5 + t * 0.5);
      const gy = h * 0.84, fs = col.surf.f, gs = col.surf.n;
      ctx.fillStyle = col.soil; ctx.fillRect(0, gy, w, h - gy); ctx.fillStyle = col.band; ctx.fillRect(0, gy + (h - gy) * 0.55, w, (h - gy) * 0.2);
      ctx.fillStyle = fs.c; ctx.fillRect(0, gy, w * 0.55, 4); ctx.fillStyle = gs.c; ctx.fillRect(w * 0.55, gy, w * 0.45, 4);
      ctx.fillStyle = fs.hi; ctx.fillRect(0, gy, w * 0.55, 1.5); ctx.fillStyle = col.surf.w.c; ctx.fillRect(w * 0.18, gy + 1, w * 0.16, 3);
      const fx = w * 0.78; ctx.fillStyle = '#0c0b12'; ctx.fillRect(fx - 4, gy - 0.5, 8, 4);
      ctx.strokeStyle = '#f4f4f4'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(fx, gy); ctx.lineTo(fx, gy - h * 0.34); ctx.stroke();
      const wv = Math.sin(t * 5) * 1.2; ctx.fillStyle = pal.accent; ctx.beginPath(); ctx.moveTo(fx + 0.5, gy - h * 0.34); ctx.lineTo(fx + m * 0.17, gy - h * 0.3 + wv); ctx.lineTo(fx + 0.5, gy - h * 0.22); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#ffffff'; ctx.strokeStyle = '#222'; ctx.lineWidth = 0.8; ctx.beginPath(); ctx.arc(w * 0.4, gy - 2.5, 2.5, 0, TAU); ctx.fill(); ctx.stroke();
    } else if (cat === 'flags') {
      const L = it.L || 38, k = Math.min(w / (L + 30), h / 98), cx = w / 2 - (it.flip ? -1 : 1) * (L / 2) * k, gy = h - 4 * k;
      ctx.fillStyle = 'rgba(0,0,0,0.18)'; ctx.beginPath(); ctx.ellipse(cx, gy + 2 * k, 18 * k, 3.5 * k, 0, 0, TAU); ctx.fill();
      ctx.translate(cx, gy); ctx.scale(k, k);
      ctx.fillStyle = '#62c64a'; rrect(ctx, -20, -2, 40, 7, 3); ctx.fill();
      ctx.fillStyle = '#0c0b12'; rrect(ctx, -8, -2.5, 16, 6, 2); ctx.fill();
      const fsc = { col: { pal: { accent: '#ff4757' } }, flagSt: it, flagNum: 1 + (Math.floor(t / 1.5) % 18) };
      drawFlag(ctx, fsc, { x: 0, y: 4 }, t, false, 1);
    }
    ctx.restore();
  }

  // ---------------------------------------------------------------- preview
  const _prevCache = typeof WeakMap !== 'undefined' ? new WeakMap() : null;
  function drawPreview(ctx, hole, theme, w, h) {
    if (!hole || !hole.ground) return;
    const th = resolveTheme(hole, theme);
    let sc = _prevCache && _prevCache.get(hole);
    if (!sc || sc.theme !== th) { sc = buildScene(hole, th, {}, true); if (_prevCache) _prevCache.set(hole, sc); }
    const pal = sc.col.pal;
    let y0 = Math.min(sc.minG, hole.cup[1] - 110, hole.tee[1] - 40), y1 = sc.maxG + 40;
    for (const so of sc.solids) y0 = Math.min(y0, so.box[1]);
    for (const b of sc.gBox) if (b) y0 = Math.min(y0, b[1]);
    y0 -= 30;
    const bw = hole.w, bh = Math.max(200, y1 - y0);
    const s = Math.min(w / bw, h / bh);
    const ox = (w - bw * s) / 2, oy = h - bh * s - (h - bh * s) * 0.35;
    ctx.save();
    ctx.beginPath(); ctx.rect(0, 0, w, h); ctx.clip();
    const g = ctx.createLinearGradient(0, 0, 0, h); g.addColorStop(0, pal.skyTop); g.addColorStop(1, pal.skyBottom);
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    // one simplified silhouette layer
    if (sc.layers) {
      const L = sc.layers[1], z = Math.max(0.15, s * 1.6), base = oy + (sc.gMean - y0) * s - 4;
      ctx.save(); ctx.translate(0, base); ctx.scale(z, z); ctx.fillStyle = mix(pal.mid, pal.skyBottom, 0.35);
      for (let x = 0; x < w / z; x += BG_P) { ctx.save(); ctx.translate(x, 0); ctx.fill(L.main); ctx.restore(); }
      ctx.restore();
    }
    ctx.translate(ox, oy); ctx.scale(s, s); ctx.translate(0, -y0);
    const S = { t: 0, dyn: [], dyn2: [], cannon: -1, ride: -1, bub: -1, strokes: 0 };
    for (const i of sc.back) drawGimmickBack(ctx, sc, hole.gm[i], i, S, 0, 0);
    drawTerrain(ctx, sc, 0, null);
    const cup = { x: hole.cup[0], y: hole.cup[1], w: hole.cupW || 30, open: !(hole.gm || []).some((g) => g.t === 'tokens') };
    const lc = (hole.gm || []).find((g) => g.t === 'liftcup'); if (lc) { cup.x = lc.x; cup.y = lc.y2; }
    const bc = (hole.gm || []).find((g) => g.t === 'blinkcup'); if (bc) { cup.x = bc.pts[0]; cup.y = bc.pts[1]; }
    drawCupNotch(ctx, sc, cup);
    for (const i of sc.front) drawGimmickFront(ctx, sc, hole.gm[i], i, S, 0, 0, 0, null);
    for (const i of sc.over) drawGimmickOver(ctx, sc, hole.gm[i], i, S, 0, 0, 0, null, null);
    drawLiquids(ctx, sc, 0, null);
    for (const f of sc.fogs) { ctx.globalAlpha = 0.85; ctx.drawImage(f.img.c, f.img.x, f.img.y, f.img.w, f.img.h); ctx.globalAlpha = 1; }
    // flag + tee scaled up for legibility
    const k = Math.min(4, 0.5 / s);
    ctx.save(); ctx.translate(cup.x, cup.y); ctx.scale(k, k); ctx.translate(-cup.x, -cup.y); drawFlag(ctx, sc, cup, 0, false, 0.6); ctx.restore();
    ctx.fillStyle = '#ffffff'; ctx.strokeStyle = '#222'; ctx.lineWidth = 1.2 / s;
    ctx.beginPath(); ctx.arc(hole.tee[0], hole.tee[1], Math.max(6, 3.5 / s), 0, TAU); ctx.fill(); ctx.stroke();
    ctx.restore();
  }

  GOLF.Render = { create, drawPreview, drawCosmetic, COSMETICS, COSMETIC_CATS, DEFAULT_THEME, _util: { mix, shade, rgba, buildScene } };
})(typeof window !== 'undefined' ? window : this);
