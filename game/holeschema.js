/* Hole editor schema: for every gimmick type its default instance, parameter fields (with ranges), and the
 * "parts" the canvas editor draws handles for (rects, segments, points, radii, angles, point lists...).
 * Also the surface list and the sanitiser that turns any untrusted JSON into a well-formed hole.
 * UMD: browser GOLF.HoleSchema, Node require().  */
(function (root, factory) {
  const isNode = typeof module === 'object' && module.exports;
  const mod = factory(isNode ? require('../src/physics.js') : root.GOLF.Physics);
  if (isNode) module.exports = mod;
  else { root.GOLF = root.GOLF || {}; root.GOLF.HoleSchema = mod; }
})(typeof self !== 'undefined' ? self : this, function (Ph) {
  'use strict';
  const HP = 1.571; // a quarter turn, pre-rounded to the 3 decimals gimmick angles are stored with

  // ---------------- limits ----------------
  const LIM = {
    W_MIN: 800, W_MAX: 24000, H_MIN: 700, H_MAX: 6000,
    X_MIN: -3000, X_MAX: 26000, Y_MIN: -6000, Y_MAX: 9000,
    GROUND_PTS: 600, SOLIDS: 60, SOLID_PTS: 200, GIMMICKS: 150, LIST_PTS: 64, LIST_RECTS: 64,
    NAME: 40, PAR_MIN: 1, PAR_MAX: 12, BOT_SHOTS: 14,
  };

  // ---------------- surfaces ----------------
  const SURFS = [
    { c: 'f', name: 'Fairway', col: '#5fae4e', g: 'Ground' }, { c: 'n', name: 'Green', col: '#86e07a', g: 'Ground' },
    { c: 'r', name: 'Rough', col: '#8a9a3c', g: 'Ground' }, { c: 's', name: 'Sand', col: '#e6d28c', g: 'Ground' },
    { c: 'i', name: 'Ice', col: '#b4e8fa', g: 'Ground' }, { c: 'g', name: 'Goo', col: '#a57be0', g: 'Ground' },
    { c: 'b', name: 'Bouncy', col: '#ff74b0', g: 'Ground' }, { c: 'k', name: 'Rock', col: '#7d8190', g: 'Ground' },
    { c: 'q', name: 'Ricochet', col: '#ffd23c', g: 'Special' }, { c: 'm', name: 'Metal', col: '#9aa7ba', g: 'Special' },
    { c: 'u', name: 'Quicksand', col: '#c9a45a', g: 'Special' }, { c: 'h', name: 'Cushion', col: '#eef0ff', g: 'Special' },
    { c: 'j', name: 'Skim water', col: '#5cc9ff', g: 'Special' },
    { c: 'w', name: 'Water', col: '#2f86ff', g: 'Hazard' }, { c: 'l', name: 'Lava', col: '#ff5a1f', g: 'Hazard' },
    { c: 'o', name: 'Out of bounds', col: '#33343f', g: 'Hazard' }, { c: 'x', name: 'Spikes', col: '#ee4455', g: 'Hazard' },
    { c: 'z', name: 'Laser', col: '#ff3366', g: 'Hazard' }, { c: 'v', name: 'Void', col: '#6d2fc7', g: 'Hazard' },
  ];
  const SURF_OK = {}; SURFS.forEach((s) => { SURF_OK[s.c] = true; }); SURF_OK.c = true;
  const SURF_BY = {}; SURFS.forEach((s) => { SURF_BY[s.c] = s; });

  // ---------------- field helpers ----------------
  const num = (k, label, min, max, step, o) => Object.assign({ k, label, t: 'n', min, max, step }, o || {});
  const ang = (k, label) => ({ k, label, t: 'ang', min: -100, max: 100 });
  const phs = (k, label) => ({ k: k || 'ph', label: label || 'Phase', t: 'ph', min: 0, max: 8, step: 0.01, hint: 'Where in its cycle it starts (0 – 1)' });
  const bool = (k, label) => ({ k, label, t: 'bool' });
  const I = (f) => Object.assign(f, { int: true });

  // ---------------- parts (what the canvas edits) ----------------
  const RECT = { p: 'rect' }, SEG = { p: 'seg' };
  const pt = (kx, ky, o) => Object.assign({ p: 'pt', kx, ky }, o || {});
  const len = (from, k, dir, scale, o) => Object.assign({ p: 'len', from, k, dir: dir || [1, 0], scale: scale || 1 }, o || {});
  const angle = (from, k, o) => Object.assign({ p: 'ang', from, k }, o || {});
  const vec = (from, kx, ky, scale, o) => Object.assign({ p: 'vec', from, kx, ky, scale }, o || {});
  const pts = (k, o) => Object.assign({ p: 'pts', k }, o || {});
  const rects = (k, o) => Object.assign({ p: 'rects', k }, o || {});
  const C = (g) => [g.x, g.y];
  const C2 = (g) => [g.x2, g.y2];
  const RC = (g) => [g.x + g.w / 2, g.y + g.h / 2];
  const rad = (r) => pt('x', 'y', { r: 'r', rMin: r });

  // ---------------- gimmick table ----------------
  // make(x,y): default instance around (x,y);  parts: canvas handles;  fields: parameter panel;  cup: exclusive cup-changing gimmick
  const S = {};
  const def = (t, make, parts, fields, o) => { S[t] = Object.assign({ t, make, parts: parts || [], fields: fields || [] }, o || {}); };

  def('wind', (x, y) => ({ t: 'wind', ax: 140, ay: 0, gust: 0.3, f: 0.7, ph: 0, x: x - 400, y: y - 500, w: 800, h: 900 }),
    [Object.assign({ when: (g) => g.w !== undefined }, RECT), vec(RC, 'ax', 'ay', 0.5, { when: (g) => g.w !== undefined })],
    [num('ax', 'Wind →', -1500, 1500, 5), num('ay', 'Wind ↓', -1500, 1500, 5), num('gust', 'Gustiness', 0, 1, 0.05), num('f', 'Gust speed', 0.1, 3, 0.05), phs()],
    { zone: { keys: ['x', 'y', 'w', 'h'], make: (g) => ({ x: g.x !== undefined ? g.x : 0, y: g.y !== undefined ? g.y : -500, w: 800, h: 1400 }) } });
  def('fan', (x, y) => ({ t: 'fan', x: x - 130, y: y - 420, w: 260, h: 520, a: 1900, ang: -HP }),
    [RECT, angle(RC, 'ang')], [num('a', 'Strength', 200, 4500, 50), ang('ang', 'Blows toward')]);
  def('windmill', (x, y) => ({ t: 'windmill', x, y, n: 4, L: 130, w: 1.2, ph: 0 }),
    [pt('x', 'y', { r: 'L' }), len(C, 'L', [1, 0], 1, { min: 40, max: 900 })],
    [I(num('n', 'Blades', 2, 8, 1)), num('L', 'Blade length', 40, 900, 2), num('w', 'Spin (rad/s)', -6, 6, 0.05), ang('ph', 'Start angle')]);
  def('movplat', (x, y) => ({ t: 'movplat', x: x - 110, y, x2: x + 300, y2: y, w: 220, h: 24, T: 5, ph: 0 }),
    [RECT, pt('x2', 'y2', { name: 'moves to', ghost: ['w', 'h'], topleft: true })],
    [num('T', 'Period (s)', 1, 20, 0.1), phs()]);
  def('rotplat', (x, y) => ({ t: 'rotplat', x, y, L: 320, w: 0.3, ph: 0 }),
    [pt('x', 'y'), len(C, 'L', [1, 0], 0.5, { min: 100, max: 3000 })],
    [num('L', 'Plank length', 100, 3000, 5), num('w', 'Spin (rad/s)', -1.5, 1.5, 0.01), ang('ph', 'Start angle')]);
  def('pad', (x, y) => ({ t: 'pad', x, y, L: 80, ang: -HP, boost: 1200 }),
    [pt('x', 'y'), angle(C, 'ang', { len: 56 })], [num('L', 'Width', 40, 400, 2), num('boost', 'Bounce power', 300, 3500, 10), ang('ang', 'Faces')]);
  def('teleport', (x, y) => ({ t: 'teleport', x, y, x2: x + 420, y2: y, r: 24 }),
    [pt('x', 'y', { r: 'r', name: 'in' }), pt('x2', 'y2', { r: 'r', name: 'out' })], [num('r', 'Size', 12, 70, 1)]);
  def('portal', (x, y) => ({ t: 'portal', x, y, a: -HP, x2: x + 420, y2: y, a2: -HP, r: 26 }),
    [pt('x', 'y', { r: 'r', name: 'A' }), pt('x2', 'y2', { r: 'r', name: 'B' }), angle(C, 'a', { len: 50 }), angle(C2, 'a2', { len: 50 })],
    [num('r', 'Size', 12, 70, 1), ang('a', 'Exit direction A'), ang('a2', 'Exit direction B')]);
  def('conveyor', (x, y) => ({ t: 'conveyor', x: x - 160, y, x2: x + 160, y2: y, v: 420 }), [SEG], [num('v', 'Belt speed', -1500, 1500, 10)]);
  def('gwell', (x, y) => ({ t: 'gwell', x, y, r: 420, k: 6000 }), [pt('x', 'y'), len(C, 'r', [1, 0], 1, { min: 40, max: 2500 })],
    [num('r', 'Range', 40, 2500, 5), num('k', 'Pull (– pushes)', -30000, 30000, 100)]);
  def('lowgrav', (x, y) => ({ t: 'lowgrav', x: x - 300, y: y - 300, w: 600, h: 600, g: 0.5 }), [RECT], [num('g', 'Gravity ×', 0.05, 1, 0.01)]);
  def('antigrav', (x, y) => ({ t: 'antigrav', x: x - 300, y: y - 300, w: 600, h: 600, g: -1 }), [RECT], [num('g', 'Gravity ×', -4, -0.1, 0.05)]);
  def('cannon', (x, y) => ({ t: 'cannon', x, y, r: 24, ang: -0.9, amp: 0, f: 1.2, sp: 1000 }),
    [pt('x', 'y', { r: 'r' }), angle(C, 'ang', { len: 62 })],
    [num('sp', 'Launch speed', 300, 3200, 10), ang('ang', 'Aim'), num('amp', 'Sway', 0, 1, 0.01), num('f', 'Sway speed', 0.2, 4, 0.05), num('r', 'Size', 12, 50, 1)]);
  def('bumper', (x, y) => ({ t: 'bumper', x, y, r: 40, boost: 900 }), [rad(14), len(C, 'r', [1, 0], 1, { min: 14, max: 120 })],
    [num('r', 'Size', 14, 120, 1), num('boost', 'Kick', 300, 3000, 10)]);
  def('breakable', (x, y) => ({ t: 'breakable', x: x - 20, y: y - 80, w: 40, h: 160, th: 300 }), [RECT], [num('th', 'Breaks above speed', 50, 1200, 5)]);
  def('gate', (x, y) => ({ t: 'gate', x: x - 12, y: y - 60, w: 24, h: 120, sx: x - 220, sy: y }),
    [RECT, pt('sx', 'sy', { name: 'switch', r: 16 })], []);
  def('door', (x, y) => ({ t: 'door', x: x - 12, y: y - 60, w: 24, h: 120, T: 3, open: 0.5, ph: 0 }), [RECT],
    [num('T', 'Period (s)', 0.5, 12, 0.1), num('open', 'Open fraction', 0.1, 0.9, 0.01), phs()]);
  def('oneway', (x, y) => ({ t: 'oneway', x: x - 160, y, x2: x + 160, y2: y }), [SEG], []);
  def('vanish', (x, y) => ({ t: 'vanish', x: x - 120, y, w: 240, h: 30, T: 3, on: 0.6, ph: 0 }), [RECT],
    [num('T', 'Period (s)', 0.5, 12, 0.1), num('on', 'Solid fraction', 0.1, 0.9, 0.01), phs()]);
  def('sticky', (x, y) => ({ t: 'sticky', x: x - 70, y: y - 20, w: 140, h: 40 }), [RECT], []);
  def('ricochet', (x, y) => ({ t: 'ricochet', x: x - 110, y: y + 10, x2: x + 110, y2: y - 10 }), [SEG], []);
  def('fog', (x, y) => ({ t: 'fog', x: x - 400, y: y - 300, w: 800, h: 600 }), [RECT], []);
  def('movcup', (x, y) => ({ t: 'movcup', x1: x - 150, x2: x + 150, T: 6, ph: 0 }), [{ p: 'xrange', k1: 'x1', k2: 'x2' }],
    [num('T', 'Period (s)', 1, 20, 0.1), phs()], { cup: true });
  def('shrinkcup', () => ({ t: 'shrinkcup', per: 3, min: 14 }), [], [num('per', 'Cycle (s)', 1, 12, 0.1), num('min', 'Smallest width', 8, 30, 1)], { cup: true });
  def('spikes', (x, y) => ({ t: 'spikes', x: x - 25, y, x2: x + 25, y2: y }), [SEG], []);
  def('crumble', (x, y) => ({ t: 'crumble', x: x - 55, y, w: 110, h: 36, delay: 0.6 }), [RECT], [num('delay', 'Collapse delay (s)', 0.1, 3, 0.05)]);
  def('boost', (x, y) => ({ t: 'boost', x: x - 200, y, x2: x + 200, y2: y, v: 1500, a: 20000 }), [SEG],
    [num('v', 'Target speed', 300, 3200, 10), num('a', 'Acceleration', 1000, 40000, 500)]);
  def('magnet', (x, y) => ({ t: 'magnet', x: x - 300, y, x2: x + 300, y2: y, r: 150, k: 2500 }), [SEG],
    [num('r', 'Range', 40, 700, 5), num('k', 'Strength', 200, 9000, 50)]);
  def('bubble', (x, y) => ({ t: 'bubble', x, y, r: 26, dx: 160, vy: -80, T: 6 }), [rad(14), len(C, 'r', [1, 0], 1, { min: 14, max: 80 })],
    [num('r', 'Size', 14, 80, 1), num('vy', 'Rise speed', -500, -10, 5), num('dx', 'Drift', -500, 500, 5), num('T', 'Lifetime (s)', 1, 20, 0.1)]);
  def('piston', (x, y) => ({ t: 'piston', x: x - 30, y: y - 60, w: 60, h: 120, dx: 0, dy: -110, T: 2.6, ph: 0 }),
    [RECT, vec(RC, 'dx', 'dy', 1, { name: 'punch' })],
    [num('dx', 'Punch →', -900, 900, 2), num('dy', 'Punch ↓', -900, 900, 2), num('T', 'Period (s)', 0.5, 10, 0.05), phs()]);
  def('pendulum', (x, y) => ({ t: 'pendulum', x, y, L: 240, A: 0.7, w: 1.9, ph: 0, r: 22 }),
    [pt('x', 'y'), len(C, 'L', [0, 1], 1, { min: 60, max: 900 })],
    [num('L', 'Rod length', 60, 900, 2), num('A', 'Swing angle', 0.1, 1.6, 0.01), num('w', 'Swing speed', 0.3, 6, 0.05), phs(), num('r', 'Head size', 8, 70, 1)]);
  def('seesaw', (x, y) => ({ t: 'seesaw', x, y, L: 480, max: 0.3, k: 0.06 }),
    [pt('x', 'y'), len(C, 'L', [1, 0], 0.5, { min: 100, max: 1200 })],
    [num('L', 'Plank length', 100, 1200, 5), num('max', 'Max tilt', 0.05, 0.7, 0.01), num('k', 'Tilt speed', 0.01, 0.25, 0.005)]);
  def('zipline', (x, y) => ({ t: 'zipline', x: x - 300, y: y - 60, x2: x + 400, y2: y + 20, sp: 420, r: 24 }), [SEG],
    [num('sp', 'Ride speed', 100, 1400, 10), num('r', 'Grab size', 12, 60, 1)]);
  def('pipe', (x, y) => ({ t: 'pipe', p: [x, y, x + 70, y + 46, x + 500, y + 46, x + 570, y], sp: 420, r: 22 }),
    [{ p: 'poly', k: 'p', label: 'Tube path', min: 2 }], [num('sp', 'Travel speed', 100, 1400, 10), num('r', 'Tube size', 10, 50, 1)]);
  def('floatpool', (x, y) => ({ t: 'floatpool', x: x - 400, y, w: 800, h: 300, cur: 140, b: 1900 }), [RECT],
    [num('cur', 'Current →', -700, 700, 5), num('b', 'Buoyancy', 200, 4500, 50)]);
  def('quicksand', (x, y) => ({ t: 'quicksand', x: x - 300, y, x2: x + 300, y2: y }), [SEG], []);
  def('blackhole', (x, y) => ({ t: 'blackhole', x, y, r: 380, k: 2400, core: 20 }), [pt('x', 'y'), len(C, 'r', [1, 0], 1, { min: 80, max: 1200 })],
    [num('r', 'Range', 80, 1200, 5), num('k', 'Pull', 500, 12000, 50), num('core', 'Core size', 8, 70, 1)]);
  def('sidegrav', (x, y) => ({ t: 'sidegrav', x: x - 200, y: y - 300, w: 400, h: 600, gx: 500, gy: -400 }),
    [RECT, vec(RC, 'gx', 'gy', 0.25, { name: 'gravity' })], [num('gx', 'Gravity →', -1600, 1600, 10), num('gy', 'Gravity ↓', -1600, 1600, 10)]);
  def('slowmo', (x, y) => ({ t: 'slowmo', x: x - 300, y: y - 150, w: 600, h: 300, f: 0.3 }), [RECT], [num('f', 'Time speed ×', 0.1, 1, 0.01)]);
  def('drag', (x, y) => ({ t: 'drag', x: x - 200, y: y - 250, w: 400, h: 500, k: 3 }), [RECT], [num('k', 'Thickness', 0.2, 10, 0.1)]);
  def('laser', (x, y) => ({ t: 'laser', x, y: y - 70, x2: x, y2: y + 60, T: 2.2, on: 0.5, ph: 0 }), [SEG],
    [num('T', 'Period (s)', 0.5, 10, 0.05), num('on', 'On fraction', 0.1, 0.9, 0.01), phs()]);
  def('saw', (x, y) => ({ t: 'saw', x, y: y - 60, x2: x, y2: y + 60, r: 28, T: 2.4, ph: 0 }), [SEG],
    [num('r', 'Blade size', 10, 70, 1), num('T', 'Period (s)', 0.5, 10, 0.05), phs()]);
  def('crusher', (x, y) => ({ t: 'crusher', x: x - 60, y: y - 220, w: 120, h: 70, dy: 150, T: 2.8, ph: 0 }),
    [RECT, len((g) => [g.x + g.w / 2, g.y + g.h], 'dy', [0, 1], 1, { min: 20, max: 900 })],
    [num('dy', 'Drop distance', 20, 900, 5), num('T', 'Period (s)', 0.8, 10, 0.05), phs()]);
  def('tokens', (x, y) => ({ t: 'tokens', pts: [x - 160, y - 40, x, y - 120, x + 160, y - 40], r: 16 }),
    [pts('pts', { label: 'Stars', r: 16, min: 1 })], [num('r', 'Star size', 8, 40, 1)], { cup: true });
  def('spinner', (x, y) => ({ t: 'spinner', x, y, r: 60, w: 30 }), [rad(20), len(C, 'r', [1, 0], 1, { min: 20, max: 250 })],
    [num('r', 'Size', 20, 250, 1), num('w', 'Spin (rad/s)', -90, 90, 1)]);
  def('glass', (x, y) => ({ t: 'glass', x: x - 300, y, w: 600, h: 18, th: 380 }), [RECT], [num('th', 'Shatters above speed', 100, 1800, 10)]);
  def('flood', (x, y) => ({ t: 'flood', y0: y + 300, dy: 150, top: y - 500 }),
    [{ p: 'hline', k: 'y0', label: 'water starts' }, { p: 'hline', k: 'top', label: 'rises no higher' }], [num('dy', 'Rise per stroke', 10, 700, 1)], { cup: false });
  def('decoy', (x, y) => ({ t: 'decoy', pts: [x - 100, y, x + 100, y] }), [pts('pts', { label: 'Decoy cups', ground: true, min: 1 })], []);
  def('geyser', (x, y) => ({ t: 'geyser', x, y, w: 260, h: 660, a: 2500, T: 2.6, on: 0.6, ph: 0 }),
    [pt('x', 'y'), len(C, 'w', [1, 0], 0.5, { min: 60, max: 800 }), len(C, 'h', [0, -1], 1, { min: 100, max: 2500 })],
    [num('a', 'Blast power', 500, 5500, 50), num('T', 'Period (s)', 0.8, 10, 0.05), num('on', 'Erupting fraction', 0.1, 0.9, 0.01), phs()]);
  def('phase', (x, y) => ({ t: 'phase', blocks: [[x - 20, y - 70, 40, 140]], odd: false }), [rects('blocks', { label: 'Blocks', color: '#b26bff' })],
    [bool('odd', 'Solid on odd strokes')]);
  def('toggle', (x, y) => ({ t: 'toggle', sx: x - 220, sy: y, a: [[x + 100, y - 70, 24, 140]], b: [[x - 100, y - 70, 24, 140]] }),
    [pt('sx', 'sy', { name: 'switch', r: 16 }), rects('a', { label: 'Solid at start', color: '#ff9a2e' }), rects('b', { label: 'Solid after flip', color: '#4ea8ff' })], []);
  def('ring', (x, y) => ({ t: 'ring', x, y, r: 30, ang: -0.75, mul: 1, min: 1100 }),
    [pt('x', 'y', { r: 'r' }), len(C, 'r', [1, 0], 1, { min: 14, max: 120 }), angle(C, 'ang', { len: 60 })],
    [num('r', 'Size', 14, 120, 1), ang('ang', 'Sends ball toward'), num('mul', 'Speed ×', 0.5, 3, 0.05), num('min', 'Minimum speed', 300, 4000, 10)]);
  def('skim', (x, y) => ({ t: 'skim', x: x - 400, y, w: 800 }), [pt('x', 'y'), len(C, 'w', [1, 0], 1, { min: 100, max: 6000 })], [num('w', 'Width', 100, 6000, 10)]);
  def('cushion', (x, y) => ({ t: 'cushion', x: x - 160, y, x2: x + 160, y2: y }), [SEG], []);
  def('tornado', (x, y) => ({ t: 'tornado', x, y, w: 150, h: 900, x2: x + 420, T: 6, ph: 0, a: 1700 }),
    [pt('x', 'y'), pt('x2', 'y', { name: 'travels to', lockY: true }), len(C, 'w', [1, 0], 0.5, { min: 60, max: 600 }), len(C, 'h', [0, -1], 1, { min: 100, max: 2500 })],
    [num('a', 'Lift power', 500, 4500, 50), num('T', 'Period (s)', 2, 20, 0.1), phs()]);
  def('catapult', (x, y) => ({ t: 'catapult', x, y, w: 90, ang: -0.8, sp: 1150, delay: 0.5 }),
    [pt('x', 'y'), len(C, 'w', [1, 0], 0.5, { min: 40, max: 400 }), angle(C, 'ang', { len: 62 })],
    [num('sp', 'Launch speed', 400, 3200, 10), ang('ang', 'Aim'), num('delay', 'Arm delay (s)', 0.1, 3, 0.05), num('w', 'Plate width', 40, 400, 2)]);
  def('mine', (x, y) => ({ t: 'mine', x, y, r: 46, imp: 2100 }), [rad(20), len(C, 'r', [1, 0], 1, { min: 20, max: 160 })],
    [num('r', 'Trigger radius', 20, 160, 1), num('imp', 'Blast power', 300, 4500, 10)]);
  def('liftcup', (x, y) => ({ t: 'liftcup', x, w: 80, y1: y - 100, y2: y + 60, yb: y + 320, T: 5, ph: 0 }),
    [pt('x', 'y1', { name: 'top (high)' }), pt('x', 'y2', { name: 'top (low)', lockX: true }), pt('x', 'yb', { name: 'bottom', lockX: true }),
      len((g) => [g.x, g.y2], 'w', [1, 0], 0.5, { min: 40, max: 400 })],
    [num('w', 'Width', 40, 400, 2), num('T', 'Period (s)', 1.5, 15, 0.1), phs()], { cup: true });
  def('blinkcup', (x, y) => ({ t: 'blinkcup', pts: [x - 210, y, x, y, x + 210, y], T: 2.4, ph: 0 }),
    [pts('pts', { label: 'Cup spots', ground: true, min: 1 })], [num('T', 'Seconds per spot', 0.8, 10, 0.05), phs()], { cup: true });

  const TYPES = Object.keys(S);

  // key kinds: which keys are positions (rounded to ints, wide range) vs params (3 decimals, field range)
  Object.keys(S).forEach((t) => {
    const sp = S[t], keys = {}, lists = {};
    const posX = {}, posY = {};
    (sp.fields || []).forEach((f) => { keys[f.k] = f; });
    const ax = (k) => { if (k) { posX[k] = 1; keys[k] = keys[k] || { k, t: 'n', pos: 1, axis: 'x' }; } };
    const ay = (k) => { if (k) { posY[k] = 1; keys[k] = keys[k] || { k, t: 'n', pos: 1, axis: 'y' }; } };
    sp.parts.forEach((p) => {
      if (p.p === 'rect') { ax('x'); ay('y'); keys.w = keys.w || { k: 'w', t: 'n', pos: 1, axis: 'w' }; keys.h = keys.h || { k: 'h', t: 'n', pos: 1, axis: 'h' }; }
      else if (p.p === 'seg') { ax('x'); ay('y'); ax('x2'); ay('y2'); }
      else if (p.p === 'pt') { ax(p.kx); ay(p.ky); }
      else if (p.p === 'xrange') { ax(p.k1); ax(p.k2); }
      else if (p.p === 'hline') ay(p.k);
      else if (p.p === 'len') keys[p.k] = keys[p.k] || { k: p.k, t: 'n', min: p.min, max: p.max };
      else if (p.p === 'pts' || p.p === 'poly') lists[p.k] = { kind: 'pts', min: (p.min || 1) * 2, ground: !!p.ground };
      else if (p.p === 'rects') lists[p.k] = { kind: 'rects' };
    });
    sp.keys = keys; sp.lists = lists; sp.posX = posX; sp.posY = posY;
    if (sp.zone) sp.zone.keys.forEach((k) => { keys[k] = keys[k] || { k, t: 'n', pos: 1, axis: k === 'x' ? 'x' : k === 'y' ? 'y' : k }; });
  });

  // ---------------- rounding / sanitising ----------------
  const fin = (v) => typeof v === 'number' && isFinite(v);
  const r3 = (v) => Math.round(v * 1000) / 1000;
  const clampN = (v, a, b) => (v < a ? a : v > b ? b : v);
  function numFor(info, v, dflt) {
    if (!fin(v)) return dflt;
    if (info && info.pos) {
      const ax = info.axis;
      if (ax === 'w' || ax === 'h') return Math.round(clampN(v, 1, 30000));
      if (ax === 'y') return Math.round(clampN(v, LIM.Y_MIN, LIM.Y_MAX));
      return Math.round(clampN(v, LIM.X_MIN, LIM.X_MAX));
    }
    if (info && info.t === 'bool') return !!v;
    const lo = info && fin(info.min) ? info.min : -1e5, hi = info && fin(info.max) ? info.max : 1e5;
    let o = r3(clampN(v, lo, hi));
    if (info && info.int) o = Math.round(o);
    return o;
  }
  // returns a clean gimmick, or null (unknown type / unusable)
  function sanitizeGm(raw) {
    if (!raw || typeof raw !== 'object' || typeof raw.t !== 'string' || !S[raw.t]) return null;
    const sp = S[raw.t], base = sp.make(1000, 800), out = { t: raw.t };
    const optional = sp.zone && raw.w === undefined;
    for (const k of Object.keys(base)) {
      if (k === 't') continue;
      if (optional && sp.zone.keys.indexOf(k) >= 0) continue;
      const bv = base[k], info = sp.keys[k], lst = sp.lists[k];
      if (lst) {
        const arr = raw[k];
        if (!Array.isArray(arr)) { out[k] = JSON.parse(JSON.stringify(bv)); continue; }
        if (lst.kind === 'pts') {
          const o = [];
          for (let i = 0; i + 1 < arr.length && o.length < LIM.LIST_PTS * 2; i += 2) {
            if (!fin(arr[i]) || !fin(arr[i + 1])) continue;
            o.push(Math.round(clampN(arr[i], LIM.X_MIN, LIM.X_MAX)), Math.round(clampN(arr[i + 1], LIM.Y_MIN, LIM.Y_MAX)));
          }
          out[k] = o.length >= lst.min ? o : JSON.parse(JSON.stringify(bv));
        } else {
          const o = [];
          for (const r of arr) {
            if (!Array.isArray(r) || r.length < 4 || !r.slice(0, 4).every(fin) || o.length >= LIM.LIST_RECTS) continue;
            o.push([Math.round(clampN(r[0], LIM.X_MIN, LIM.X_MAX)), Math.round(clampN(r[1], LIM.Y_MIN, LIM.Y_MAX)), Math.round(clampN(r[2], 1, 30000)), Math.round(clampN(r[3], 1, 30000))]);
          }
          out[k] = o;
        }
      } else if (typeof bv === 'boolean') out[k] = !!raw[k];
      else out[k] = numFor(info, raw[k], bv);
    }
    return out;
  }

  // sanitise a whole hole (untrusted) -> clean hole; throws Error(message) when it cannot be salvaged
  function sanitizeHole(raw, opts) {
    opts = opts || {};
    const warn = [];
    if (!raw || typeof raw !== 'object') throw new Error('Not a hole');
    // ground
    const rg = raw.ground;
    if (!Array.isArray(rg) || rg.length < 4) throw new Error('Hole has no ground');
    let gp = [];
    for (let i = 0; i + 1 < rg.length && gp.length < LIM.GROUND_PTS; i += 2) {
      if (!fin(rg[i]) || !fin(rg[i + 1])) throw new Error('Bad ground data');
      gp.push([Math.round(clampN(rg[i], 0, LIM.W_MAX)), Math.round(clampN(rg[i + 1], LIM.Y_MIN, LIM.Y_MAX))]);
    }
    if (gp.length < 2) throw new Error('Hole has no ground');
    const rgs = typeof raw.gs === 'string' ? raw.gs : '';
    let gs = [];
    for (let i = 0; i < gp.length - 1; i++) { const c = rgs.charAt(i); gs.push(SURF_OK[c] ? c : 'f'); }
    // x strictly increasing (sort + nudge), starting at 0
    const idx = gp.map((p, i) => i);
    let sorted = true; for (let i = 1; i < gp.length; i++) if (gp[i][0] <= gp[i - 1][0]) sorted = false;
    if (!sorted) { warn.push('ground points were re-ordered'); gp = gp.map((p, i) => ({ p, i })).sort((a, b) => a.p[0] - b.p[0] || a.i - b.i).map((o) => o.p); for (let i = 1; i < gp.length; i++) if (gp[i][0] <= gp[i - 1][0]) gp[i][0] = gp[i - 1][0] + 1; }
    const w = Math.round(clampN(gp[gp.length - 1][0], LIM.W_MIN, LIM.W_MAX));
    if (gp[gp.length - 1][0] !== w) gp[gp.length - 1][0] = w;
    const ground = []; gp.forEach((p) => ground.push(p[0], p[1]));
    // solids
    const solids = [];
    for (const so of Array.isArray(raw.solids) ? raw.solids : []) {
      if (!so || !Array.isArray(so.p) || solids.length >= LIM.SOLIDS) continue;
      const p = [];
      for (let i = 0; i + 1 < so.p.length && p.length < LIM.SOLID_PTS * 2; i += 2) {
        if (!fin(so.p[i]) || !fin(so.p[i + 1])) { p.length = 0; break; }
        p.push(Math.round(clampN(so.p[i], LIM.X_MIN, LIM.X_MAX)), Math.round(clampN(so.p[i + 1], LIM.Y_MIN, LIM.Y_MAX)));
      }
      if (p.length < 6) continue;
      const n = p.length / 2, ss = typeof so.s === 'string' ? so.s : 'k';
      let s;
      if (ss.length > 1) { s = ''; for (let i = 0; i < n; i++) s += SURF_OK[ss.charAt(i)] ? ss.charAt(i) : 'k'; } else s = SURF_OK[ss] ? ss : 'k';
      solids.push({ p, s });
    }
    // gimmicks
    const gm = []; let dropped = 0;
    for (const g of Array.isArray(raw.gm) ? raw.gm : []) {
      if (gm.length >= LIM.GIMMICKS) { dropped++; continue; }
      const c = sanitizeGm(g); if (c) gm.push(c); else dropped++;
    }
    if (dropped) warn.push(dropped + ' unknown gimmick' + (dropped > 1 ? 's were' : ' was') + ' removed');
    const xy = (v, dx, dy) => (Array.isArray(v) && fin(v[0]) && fin(v[1]) ? [Math.round(clampN(v[0], LIM.X_MIN, LIM.X_MAX)), Math.round(clampN(v[1], LIM.Y_MIN, LIM.Y_MAX))] : [dx, dy]);
    const tee = xy(raw.tee, 200, 800), cup = xy(raw.cup, w - 200, 800);
    const theme = typeof raw.theme === 'string' && (!opts.themes || opts.themes[raw.theme]) ? raw.theme.slice(0, 12) : (opts.defaultTheme || 'c01');
    let maxY = -1e9; for (let i = 1; i < ground.length; i += 2) maxY = Math.max(maxY, ground[i]);
    for (const so of solids) for (let i = 1; i < so.p.length; i += 2) maxY = Math.max(maxY, so.p[i]);
    const h = Math.round(clampN(fin(raw.h) ? raw.h : maxY + 380, Math.max(LIM.H_MIN, Math.min(LIM.H_MAX, maxY + 120)), LIM.H_MAX));
    let name = typeof raw.name === 'string' ? raw.name.replace(/[\u0000-\u001f\u007f<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, LIM.NAME) : '';
    if (!name) name = 'Untitled hole';
    const hole = {
      v: 2, id: 'custom', name, par: Math.round(clampN(fin(raw.par) ? raw.par : 3, LIM.PAR_MIN, LIM.PAR_MAX)), seed: (fin(raw.seed) ? Math.abs(Math.round(raw.seed)) : 1) % 2147483647 || 1,
      theme, w, h, tee, cup, ground, gs: gs.join(''), solids, gm,
    };
    if (fin(raw.cupW) && Math.round(raw.cupW) !== 30) hole.cupW = Math.round(clampN(raw.cupW, 16, 80));
    if (raw.auto) hole.auto = true;
    // verified solution (only kept when well-formed; the caller re-checks it by replaying)
    const b = raw.bot;
    if (b && Array.isArray(b.shots) && b.shots.length && b.shots.length <= LIM.BOT_SHOTS && b.shots.every((q) => Array.isArray(q) && fin(q[0]) && fin(q[1]) && q[1] > 0 && q[1] <= 1)) {
      hole.bot = { s: b.shots.length, shots: b.shots.map((q) => [q[0], q[1]]) };
    }
    return { hole, warn };
  }

  // ---------------- misc helpers shared by editor + codec ----------------
  const clone = (o) => JSON.parse(JSON.stringify(o));
  function makeGimmick(t, x, y) { const sp = S[t]; return sp ? sp.make(Math.round(x), Math.round(y)) : null; }
  // the geometry that bot verification depends on (anything but name/theme/par/seed)
  function stable(v) {
    if (Array.isArray(v)) return '[' + v.map(stable).join(',') + ']';
    if (v && typeof v === 'object') return '{' + Object.keys(v).sort().map((k) => JSON.stringify(k) + ':' + stable(v[k])).join(',') + '}';
    return JSON.stringify(v);
  }
  function geoKey(h) { return stable([h.w, h.tee, h.cup, h.cupW || 0, h.ground, h.gs, h.solids, h.gm]); }
  function estimatePar(h) {
    const dx = Math.abs(h.cup[0] - h.tee[0]), dy = h.tee[1] - h.cup[1];
    return Math.max(2, Math.min(10, 1 + Math.ceil(dx / 1400) + (dy > 300 ? 1 : 0)));
  }
  // flat blank hole: walls at both ends, a fairway and a green around the cup
  function blankHole(w) {
    w = w || 3200;
    const gy = 1000, cx = w - 220;
    return {
      v: 2, id: 'custom', name: 'Untitled hole', par: 3, seed: 1 + Math.floor(Math.random() * 2000000000), theme: 'c01', w, h: 1400,
      tee: [200, gy - Ph.C.R], cup: [cx, gy], ground: [0, 500, 14, gy, cx - 70, gy, cx + 70, gy, w - 14, gy, w, 500], gs: 'kfnfk', solids: [], gm: [], auto: true,
    };
  }

  return { LIM, stable, SURFS, SURF_BY, SURF_OK, SPEC: S, TYPES, sanitizeGm, sanitizeHole, makeGimmick, geoKey, estimatePar, blankHole, clone, r3 };
});
