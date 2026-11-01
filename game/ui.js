/* DOM screens + HUD over the canvas. */
(function () {
  'use strict';
  const G = window.GOLF = window.GOLF || {};
  const $ = (s, r) => (r || document).querySelector(s);
  const esc = (s) => String(s === undefined || s === null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const A = () => G.Audio;
  const App = () => G.App;
  const SURFACES = ['fairway', 'rough', 'sand', 'ice', 'goo', 'bouncy'];
  const TAU = Math.PI * 2;

  // ---------- icons (inline SVG, 24×24, stroke = currentColor) ----------
  const F = ' fill="currentColor" stroke="none"';
  const ICONS = {
    play: '<path d="M7.5 4.6v14.8a1 1 0 0 0 1.52.85l12-7.4a1 1 0 0 0 0-1.7l-12-7.4A1 1 0 0 0 7.5 4.6z"' + F + '/>',
    pause: '<rect x="6" y="4.5" width="4.2" height="15" rx="1.3"' + F + '/><rect x="13.8" y="4.5" width="4.2" height="15" rx="1.3"' + F + '/>',
    sound: '<path d="M11 5 6.5 9H3.5v6h3L11 19z"' + F + '/><path d="M15.5 9a4.5 4.5 0 0 1 0 6M18.5 6a8.5 8.5 0 0 1 0 12"/>',
    mute: '<path d="M11 5 6.5 9H3.5v6h3L11 19z"' + F + '/><path d="m16 9.5 5 5M21 9.5l-5 5"/>',
    settings: '<path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/>',
    back: '<path d="m15 18-6-6 6-6"/>',
    next: '<path d="m9 18 6-6-6-6"/>',
    star: '<path d="M12 2.6l2.85 5.95 6.5.82-4.78 4.5 1.2 6.45L12 17.2l-5.77 3.12 1.2-6.45-4.78-4.5 6.5-.82z"' + F + '/>',
    lock: '<rect x="4.5" y="10.5" width="15" height="10.5" rx="2.6"' + F + '/><path d="M8 10.5V7.6a4 4 0 0 1 8 0v2.9"/>',
    trophy: '<path d="M7.5 4h9v5.5a4.5 4.5 0 0 1-9 0z"/><path d="M7.5 6H4.8A2.6 2.6 0 0 0 7.6 11M16.5 6h2.7A2.6 2.6 0 0 1 16.4 11M12 14v3.5M8.5 20.5h7M9.5 17.5h5"/>',
    flag: '<path d="M5.5 21.5V3.5"/><path d="M5.5 4h11.5l-2.6 4.2L17 12.5H5.5z"' + F + '/>',
    calendar: '<rect x="3.5" y="5" width="17" height="15.5" rx="3"/><path d="M3.5 10h17M8 3v4M16 3v4"/><circle cx="8.5" cy="14.5" r="1.1"' + F + '/><circle cx="12" cy="14.5" r="1.1"' + F + '/>',
    dice: '<rect x="3.5" y="3.5" width="17" height="17" rx="4.2"/><circle cx="8.4" cy="8.4" r="1.45"' + F + '/><circle cx="15.6" cy="8.4" r="1.45"' + F + '/><circle cx="12" cy="12" r="1.45"' + F + '/><circle cx="8.4" cy="15.6" r="1.45"' + F + '/><circle cx="15.6" cy="15.6" r="1.45"' + F + '/>',
    infinity: '<path d="M12 12c-2-2.6-3.9-4-5.9-4a4 4 0 0 0 0 8c2 0 3.9-1.4 5.9-4zm0 0c2 2.6 3.9 4 5.9 4a4 4 0 0 0 0-8c-2 0-3.9 1.4-5.9 4z"/>',
    shirt: '<path d="M20.38 3.46 16 2a4 4 0 0 1-8 0L3.62 3.46a2 2 0 0 0-1.34 2.23l.58 3.47a1 1 0 0 0 .99.84H6v10c0 1.1.9 2 2 2h8a2 2 0 0 0 2-2V10h2.15a1 1 0 0 0 .99-.84l.58-3.47a2 2 0 0 0-1.34-2.23z"/>',
    chart: '<path d="M3.5 20.5h17"/><rect x="5" y="11" width="3.4" height="6.5" rx="1"/><rect x="10.3" y="5.5" width="3.4" height="12" rx="1"/><rect x="15.6" y="13.5" width="3.4" height="4" rx="1"/>',
    replay: '<path d="M3.5 12a8.5 8.5 0 1 0 2.6-6.1L3.5 8.5"/><path d="M3.5 3.5v5h5"/>',
    undo: '<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>',
    eye: '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
    x: '<path d="M18 6 6 18M6 6l12 12"/>',
    check: '<path d="M20 6.5 9.5 17 4 11.5"/>',
    copy: '<rect x="9" y="9" width="12" height="12" rx="2.5"/><path d="M5 15H4.5A2.5 2.5 0 0 1 2 12.5v-8A2.5 2.5 0 0 1 4.5 2h8A2.5 2.5 0 0 1 15 4.5V5"/>',
    card: '<rect x="4" y="3" width="16" height="18" rx="2.5"/><path d="M8 8h8M8 12h8M8 16h5"/>',
    home: '<path d="M3.5 10.5 12 3.5l8.5 7"/><path d="M5.5 9v11.5h13V9"/><path d="M10 20.5v-6h4v6"/>',
    arrow: '<path d="M4 12h15M13 6l6 6-6 6"/>',
    sparkle: '<path d="M12 2.5l2 6.2 6.5 2.1-6.5 2.1-2 6.6-2-6.6-6.5-2.1 6.5-2.1z"' + F + '/><path d="M19 15.5l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z"' + F + '/>',
    spinB: '<path d="m11 17-5-5 5-5M18 17l-5-5 5-5"/>',
    spinT: '<path d="m13 17 5-5-5-5M6 17l5-5-5-5"/>',
    leaf: '<path d="M5 19.5C5 11 10.5 5 20 4.5c-.5 9.5-6.5 15-15 15z"/><path d="M5 19.5 13.5 11"/>',
    skull: '<path d="M12 3a8 8 0 0 0-8 8c0 2.7 1.3 4.6 3 5.8V20.5h10v-3.7c1.7-1.2 3-3.1 3-5.8a8 8 0 0 0-8-8z"/><circle cx="9" cy="11.5" r="1.7"' + F + '/><circle cx="15" cy="11.5" r="1.7"' + F + '/><path d="M10.5 20.5v-2.5M13.5 20.5v-2.5"/>',
    medal: '<circle cx="12" cy="9" r="6"/><path d="m8.6 13.8-1.6 8 5-3 5 3-1.6-8"/><path d="m12 6.3.9 1.8 2 .3-1.45 1.4.35 2-1.8-.95-1.8.95.35-2L9.1 8.4l2-.3z"' + F + '/>',
    trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
    save: '<path d="M5 3.5h11l3.5 3.5v13.5h-15z"/><path d="M8 3.5v5h7M8 20.5v-6.5h8v6.5"/>',
    wind: '<path d="M3 8.5h10a3 3 0 1 0-3-3M3 12.5h15a3 3 0 1 1-3 3M3 16.5h7"/>',
    target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.5"' + F + '/>',
    swish: '<path d="M3 17c4-1 8-5 10-10"/><path d="M9 19c4-1.5 7-4.5 9-9"/><circle cx="18" cy="5.5" r="2.5"' + F + '/>',
    golf: '<circle cx="12" cy="12" r="8.5"/><circle cx="9" cy="9.5" r=".9"' + F + '/><circle cx="12.5" cy="8" r=".9"' + F + '/><circle cx="15.2" cy="10.5" r=".9"' + F + '/><circle cx="10.5" cy="13" r=".9"' + F + '/><circle cx="14" cy="14" r=".9"' + F + '/>',
    bolt: '<path d="M13 2.5 4.5 13.5H12l-1 8 8.5-11H12z"' + F + '/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/>',
    grid: '<rect x="3.5" y="3.5" width="7" height="7" rx="1.8"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.8"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.8"/><rect x="13.5" y="13.5" width="7" height="7" rx="1.8"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    grad: '<path d="M2.5 9 12 4.5 21.5 9 12 13.5z"/><path d="M6.5 11v4.5c0 1.4 2.5 3 5.5 3s5.5-1.6 5.5-3V11M21.5 9v5"/>',
    mirror: '<path d="M12 3v18"/><path d="M9 7 4 12l5 5z"' + F + '/><path d="m15 7 5 5-5 5z"/>',
    share: '<circle cx="18" cy="5.5" r="2.5"/><circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="18.5" r="2.5"/><path d="m8.2 10.8 7.6-4M8.2 13.2l7.6 4"/>',
    music: '<path d="M9 18V5.5l11-2V16"/><circle cx="6.5" cy="18" r="2.5"' + F + '/><circle cx="17.5" cy="16" r="2.5"' + F + '/>',
    phone: '<rect x="6.5" y="2.5" width="11" height="19" rx="2.5"/><path d="M11 18.5h2M2.5 9v6M21.5 9v6"/>',
    access: '<circle cx="12" cy="4.5" r="2"' + F + '/><path d="M4.5 8.5 12 10l7.5-1.5M12 10v5l-3 6M12 15l3 6"/>',
    bulb: '<path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z"/>',
    users: '<circle cx="9" cy="8" r="3.4"/><path d="M2.5 20.5v-1.2A5.3 5.3 0 0 1 7.8 14h2.4a5.3 5.3 0 0 1 5.3 5.3v1.2"/><path d="M16 4.8a3.4 3.4 0 0 1 0 6.4M18.3 14.3a5.3 5.3 0 0 1 3.2 5v1.2"/>',
    fire: '<path d="M12 21c-4 0-6.5-2.6-6.5-6.2 0-3.7 3-5.6 4-9.3 2.1 1.4 3 3.3 3 5.1 1-.6 1.6-1.6 1.8-3 2 1.7 4.2 4.2 4.2 7.2 0 3.6-2.5 6.2-6.5 6.2z"/>',
    // hole editor
    redo: '<path d="m15 14 5-5-5-5"/><path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13"/>',
    cursor: '<path d="M5.5 3.5 19 10.5l-6 2L10.2 19z"' + F + '/>',
    mountain: '<path d="M2.5 19.5 9 8l4 6.5 2.5-4 6 9z"/><path d="M2.5 19.5h19"/>',
    shape: '<path d="M4.5 8.5 12 3.5l7.5 5-2 10.5h-11z"/>',
    tee: '<circle cx="12" cy="7.5" r="3.8"/><path d="M8.8 13.5h6.4l-2 7.5h-2.4z"/>',
    minus: '<path d="M5 12h14"/>',
    expand: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>',
    edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="m13.5 6.5 4 4"/>',
    folder: '<path d="M3 6.5A1.5 1.5 0 0 1 4.5 5H9l2 2.5h8.5A1.5 1.5 0 0 1 21 9v9a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 18z"/>',
    download: '<path d="M12 4v11M7.5 10.5 12 15l4.5-4.5M5 19.5h14"/>',
    warn: '<path d="M12 3.5 2.8 19.5h18.4z"/><path d="M12 10v4.5M12 17.4v.1"/>',
    shield: '<path d="M12 3 4.5 6v5.5c0 4.5 3 7.7 7.5 9.5 4.5-1.8 7.5-5 7.5-9.5V6z"/><path d="m8.5 12 2.5 2.5 4.5-5"/>',
    layers: '<path d="m12 3.5 9 5-9 5-9-5z"/><path d="m3 12.5 9 5 9-5"/>',
    link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
    down: '<path d="m6 9 6 6 6-6"/>',
    up: '<path d="m6 15 6-6 6 6"/>',
    ruler: '<path d="m3 17 14-14 4 4L7 21z"/><path d="m8 8 2 2M11 5l2 2M5 11l2 2M14 14l2 2M11 17l2 2"/>',
  };
  const ic = (n, cls) => '<svg class="ico ' + (cls || '') + '" viewBox="0 0 24 24" aria-hidden="true">' + (ICONS[n] || '') + '</svg>';
  const DIFF_ICON = { chill: 'leaf', standard: 'flag', pro: 'trophy', insane: 'skull' };
  const diffIc = (id, cls) => ic(DIFF_ICON[id] || 'flag', cls);

  let root, hud, toasts, current = null, curArgs = null, acts = {}, lastName = null;

  function init() {
    root = $('#ui'); hud = $('#hud'); toasts = $('#toasts');
    root.addEventListener('click', onClick);
    root.addEventListener('dblclick', (e) => { const el = e.target.closest('[data-dbl]'); if (el && acts[el.dataset.dbl]) acts[el.dataset.dbl](el.dataset, el, e); });
    root.addEventListener('keydown', (e) => {
      if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('[data-act]:not(button):not(input)')) { e.preventDefault(); e.stopPropagation(); onClick({ target: e.target, preventDefault() {}, stopPropagation() {} }); }
    });
    hud.addEventListener('click', hudClick);
    hud.addEventListener('pointerdown', (e) => e.stopPropagation());
    root.addEventListener('input', onInput);
    root.addEventListener('change', onInput);
    buildHud();
  }
  function onClick(e) {
    const el = e.target.closest('[data-act]');
    if (!el || el.classList.contains('disabled') || el.closest('.leaving')) return;
    const fn = acts[el.dataset.act];
    if (fn) { e.preventDefault(); e.stopPropagation(); fn(el.dataset, el, e); }
  }
  function onInput(e) {
    const el = e.target.closest('[data-in]');
    if (!el) return;
    const fn = acts['in:' + el.dataset.in];
    if (fn) fn(el, e);
  }
  const scr = () => root.querySelector('.screen:not(.leaving)');
  // Screens cross-fade: the new screen slides in underneath while the old one fades out on top (click-through).
  function leave(el) {
    if (!el) return;
    el.classList.add('leaving');
    el.querySelectorAll('[autofocus]').forEach((x) => x.blur());
    setTimeout(() => { el.remove(); if (!scr()) root.classList.add('hidden'); }, 200);
  }
  function render(html, cls) {
    const old = scr();
    const same = !!old && lastName === current;
    lastName = current;
    if (!html) { leave(old); return; }
    const el = document.createElement('div');
    el.className = 'screen ' + (cls || '') + (same ? '' : ' enter');
    el.innerHTML = html;
    if (old) { if (same) old.remove(); else leave(old); }
    root.insertBefore(el, root.firstChild);
    root.classList.remove('hidden');
    el.scrollTop = 0;
  }
  function show(name, args) {
    acts = {};
    current = name; curArgs = args || {};
    if (App()) App().state = name;
    stopAnims();
    const fn = SCREENS[name];
    if (!fn) { render(''); return; }
    fn(curArgs);
    if (!acts.settings) acts.settings = () => { click(); show('settings', { ret: name, retArgs: curArgs }); };
    if (!acts.mute) acts.mute = () => { App().toggleMute(); show(name, Object.assign({}, curArgs, { scroll: scr() ? scr().scrollTop : 0 })); };
  }
  function hide() { acts = {}; current = null; lastName = null; stopAnims(); leave(scr()); }
  function on(map) { Object.assign(acts, map); }
  function click() { A() && A().sfx('ui'); }
  function keepScroll(args) { const s = scr(); if (s && args && args.scroll) s.scrollTop = args.scroll; }

  // ---------- small helpers ----------
  const starIc = (on, cls) => '<span class="st ' + (on ? 'on ' : '') + (cls || '') + '">' + ic('star') + '</span>';
  const stars = (n, max) => { let s = ''; for (let i = 0; i < (max || 3); i++) s += starIc(i < n); return s; };
  const relPar = (strokes, par) => { const d = strokes - par; return d === 0 ? 'E' : (d > 0 ? '+' + d : String(d)); };
  const relCls = (strokes, par) => { const d = strokes - par; return d < 0 ? 'under' : d > 0 ? 'over' : 'even'; };
  const relTag = (strokes, par) => '<em class="rel ' + relCls(strokes, par) + '">' + relPar(strokes, par) + '</em>';
  // the plain-golf controls tutorial ('basics') is not a gimmick but uses the same tutorial plumbing
  const BASICS = { name: 'Golf basics', desc: 'Aiming, power, spin, putting and the swish — everything you need for course 1.', tip: 'Drag back anywhere, release to shoot.' };
  const BASICS_STEPS = [
    ['Aim & shoot', 'Drag back anywhere and release. The ball flies <b>opposite</b> your drag; drag length = power. Drag back to the start to cancel. Keyboard: arrows/WASD aim, Space shoots.'],
    ['Read the shot', 'Watch the trajectory preview while aiming, and the wind arrow at the top when there is wind. The faint ghost replays your last shot.'],
    ['Spin', 'Full shots can carry spin: <b>B</b>/<b>T</b>, the mouse wheel or the spin control. Backspin lifts and bites; topspin dives and runs on.'],
    ['The green', 'The light-striped green: shots from it are <b>putts</b> — no spin' + '<span class="pp-note">, and precision putting gives you a finer power scale</span>' + '.'],
    ['Swish!', 'Drop the ball straight into the cup without touching the green and you get a <b>Swish</b>: −1 stroke.'],
    ['Tools', '<b>Look</b> (or hold L) scans the hole; <b>Mulligan</b> undoes a shot; the ❚❚ menu pauses, restarts and opens settings.'],
  ];
  function gimName(t) {
    if (!t) return '';
    if (t === 'basics') return BASICS.name;
    const I = G.Manifest && G.Manifest.GIMMICK_INFO;
    const info = I && I[t];
    if (typeof info === 'string') return info;
    if (info && (info.name || info.title)) return info.name || info.title;
    return t.replace(/^mov/, 'moving ').replace(/^rot/, 'rotating ').replace(/^g/, (m) => (t === 'gwell' ? 'gravity ' : m)).replace(/(^|\s)\S/g, (m) => m.toUpperCase());
  }
  function gimInfo(t) { if (t === 'basics') return BASICS; const I = G.Manifest && G.Manifest.GIMMICK_INFO; const info = I && I[t]; return info && typeof info === 'object' ? info : {}; }
  function gimDesc(t) { const i = gimInfo(t); return i.desc || i.description || ''; }
  function gimTip(t) { return gimInfo(t).tip || ''; }
  const GIM_ICON = {
    wind: '🌬', fan: '🪭', windmill: '🌀', movplat: '↔', rotplat: '🔄', pad: '⤴', teleport: '🌀', portal: '🚪', conveyor: '⏩', gwell: '🧲',
    lowgrav: '🪶', antigrav: '🙃', cannon: '💥', bumper: '🔴', breakable: '🧱', gate: '🔒', door: '🚪', oneway: '⬆', vanish: '👻', sticky: '🍯',
    ricochet: '↯', fog: '🌫', movcup: '⛳', shrinkcup: '🔻', spikes: '🔺', crumble: '🪨', boost: '⏫', magnet: '🧲', bubble: '🫧', piston: '🔩',
    pendulum: '🔨', seesaw: '⚖', zipline: '🚡', pipe: '🚇', floatpool: '🏊', quicksand: '⏳', blackhole: '🕳', sidegrav: '↪', slowmo: '🐌', drag: '🍯',
    laser: '🔦', saw: '⚙', crusher: '🗜', tokens: '⭐', spinner: '💫', glass: '🪟', flood: '🌊', decoy: '🚩', geyser: '⛲', phase: '👁',
    toggle: '🔀', ring: '⭕', skim: '🪨', cushion: '☁', tornado: '🌪', catapult: '🏹', mine: '💣', liftcup: '🛗', blinkcup: '✨',
  };
  const gimIcon = (t) => (t === 'basics' ? '⛳' : GIM_ICON[t] || '✦');
  function gimBadge(t) { return t ? '<span class="gbadge" title="' + esc(gimDesc(t)) + '"><i>' + gimIcon(t) + '</i>' + esc(gimName(t)) + '</span>' : '<span class="gbadge plain">' + ic('flag') + 'Classic golf</span>'; }
  function allGimmicksList() {
    const M = G.Manifest;
    const a = (M && Array.isArray(M.GIMMICKS) && M.GIMMICKS.length ? M.GIMMICKS : null) || (G.Physics && G.Physics.GIMMICK_TYPES) || [];
    return a.slice();
  }
  function surfaceList() { const S = G.Manifest && G.Manifest.SURFACES; return Array.isArray(S) && S.length ? S.slice() : SURFACES.slice(); }
  const courseGim = (c) => (c ? (c.gimmick !== undefined ? c.gimmick : c.primary || null) : null);
  const cap = (s) => String(s).charAt(0).toUpperCase() + String(s).slice(1);
  function styleList() {
    const S = (G.Manifest && G.Manifest.STYLES) || ['rolling', 'hills', 'cliffs', 'caves', 'islands', 'canyon', 'dunes', 'terraces', 'spires', 'mesa'];
    return (Array.isArray(S) ? S : Object.keys(S)).map((s) => (typeof s === 'string' ? { id: s, name: cap(s) } : { id: s.id, name: s.name || cap(s.id) }));
  }
  // little CSS landscape in the course's palette
  function swatch(def, cls) {
    const p = (def && def.palette) || {};
    return '<div class="swatch ' + (cls || '') + '" style="--sk1:' + (p.skyTop || '#68b') + ';--sk2:' + (p.skyBottom || '#cdf') + ';--far:' + (p.far || p.mid || '#8a8') +
      ';--mid:' + (p.mid || '#6a6') + ';--near:' + (p.near || p.mid || '#585') + ';--gr:' + (p.ground || '#5a4') + ';--grd:' + (p.groundDark || '#353') + ';--acc:' + (p.accent || '#fc3') + '">' +
      '<i class="sw-sun"></i><i class="sw-far"></i><i class="sw-mid"></i><i class="sw-ground"></i><i class="sw-flag"></i></div>';
  }
  const iconBtn = (act, icon, label, cls, extra) => '<button class="ibtn ' + (cls || '') + '" data-act="' + act + '" aria-label="' + esc(label) + '" title="' + esc(label) + '"' + (extra || '') + '>' + ic(icon) + '</button>';
  function starPill() { return '<span class="pill star-pill" title="Total stars">' + ic('star') + '<b>' + G.Progress.totalStars() + '</b></span>'; }
  function topbar(title, sub, opt) {
    opt = opt || {};
    return '<header class="topbar"><button class="ibtn back" data-act="back" aria-label="Back" title="Back">' + ic('back') + '</button>' +
      '<div class="tb-t"><h1>' + esc(title) + '</h1>' + (sub ? '<div class="tb-sub">' + sub + '</div>' : '') + '</div>' +
      '<div class="tb-r">' + (opt.right || '') + (opt.noStars ? '' : starPill()) + '</div></header>';
  }
  function diffChip() { const d = G.Modes.get(G.Modes.current()); return '<button class="pill diff ' + d.id + '" data-act="settings" title="Difficulty — tap to change" aria-label="Difficulty: ' + d.name + '">' + diffIc(d.id) + '<span class="pl-t">' + d.name + '</span></button>'; }
  const section = (title, body, opt) => '<section class="panel ' + ((opt && opt.cls) || '') + '">' + (title ? '<div class="panel-h"><h3>' + title + '</h3>' + ((opt && opt.right) || '') + '</div>' : '') + body + '</section>';

  // ---------- toasts / labels ----------
  function toast(text, cls, ms) {
    const el = document.createElement('div');
    el.className = 'toast ' + (cls || '');
    const icn = { warn: 'lock', hz: 'x', unlock: 'sparkle', info: null }[cls || 'info'];
    el.innerHTML = (icn ? ic(icn) : '') + '<span>' + esc(text) + '</span>';
    toasts.appendChild(el);
    setTimeout(() => el.classList.add('out'), ms || 1800);
    setTimeout(() => el.remove(), (ms || 1800) + 500);
  }
  function bigLabel(text, cls) {
    const el = document.createElement('div');
    el.className = 'biglabel ' + (cls || '');
    el.innerHTML = String(text).split('').map((c, i) => '<span style="animation-delay:' + (i * 0.035) + 's">' + (c === ' ' ? '&nbsp;' : esc(c)) + '</span>').join('');
    toasts.appendChild(el);
    setTimeout(() => el.classList.add('out'), 1500);
    setTimeout(() => el.remove(), 2100);
  }

  // "New gimmick" intro card (shown during the pre-shot pan)
  function introCard(t, info) {
    info = info || gimInfo(t);
    const el = document.createElement('div');
    el.className = 'introcard';
    el.innerHTML = '<div class="ic-k">' + ic('sparkle') + 'New gimmick</div><div class="ic-ic">' + gimIcon(t) + '</div><div class="ic-b"><div class="ic-n">' + esc(info.name || gimName(t)) + '</div>' +
      (info.desc ? '<div class="ic-d">' + esc(info.desc) + '</div>' : '') + (info.tip ? '<div class="ic-t"><b>Tip</b> ' + esc(info.tip) + '</div>' : '') + '</div>';
    toasts.appendChild(el);
    if (A()) A().sfx('intro');
    setTimeout(() => el.classList.add('out'), 4200);
    setTimeout(() => el.remove(), 4800);
  }
  function clearIntro() { toasts.querySelectorAll('.introcard').forEach((el) => el.remove()); }
  function swishBanner(bonus) {
    const el = document.createElement('div');
    el.className = 'swishbanner';
    el.innerHTML = '<span class="sw-t">SWISH!</span><span class="sw-b">−' + (bonus || 1) + '</span>';
    toasts.appendChild(el);
    setTimeout(() => el.classList.add('out'), 1500);
    setTimeout(() => el.remove(), 2100);
  }

  // ---------- cosmetic previews (renderer-provided when available, else a built-in fallback) ----------
  const cosFail = {};
  function findItem(cat, id) { return ((G.Render && G.Render.COSMETICS && G.Render.COSMETICS[cat]) || []).find((x) => x.id === id) || { id }; }
  function drawCos(ctx, cat, item, w, h, t) {
    const Rn = G.Render;
    ctx.clearRect(0, 0, w, h);
    if (Rn && typeof Rn.drawCosmetic === 'function' && !cosFail[cat + ':' + item.id]) {
      try { ctx.save(); Rn.drawCosmetic(ctx, cat, item.id, w, h, t); ctx.restore(); return; } catch (e) { ctx.restore(); cosFail[cat + ':' + item.id] = true; console.warn('[locker] drawCosmetic failed for', cat, item.id, e); ctx.clearRect(0, 0, w, h); }
    }
    ctx.save();
    try { fallbackCos(ctx, cat, item, w, h, t); } catch (e) { /* never break the UI over a preview */ }
    ctx.restore();
  }
  function starP(c, x, y, r, ri, n, rot) { c.beginPath(); for (let i = 0; i < n * 2; i++) { const a = rot + i * Math.PI / n, rr = i % 2 ? ri : r; c.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); } c.closePath(); }
  function heartP(c, x, y, s) { c.beginPath(); c.moveTo(x, y + s * 0.35); c.bezierCurveTo(x - s, y - s * 0.4, x - s * 0.4, y - s, x, y - s * 0.35); c.bezierCurveTo(x + s * 0.4, y - s, x + s, y - s * 0.4, x, y + s * 0.35); c.fill(); }
  function fbBall(c, it, x, y, r, rot) {
    const col = it.color || '#fff', st = it.stroke || '#223';
    c.save(); c.translate(x, y); c.rotate(rot || 0);
    c.lineWidth = Math.max(1.2, r * 0.12); c.strokeStyle = st; c.fillStyle = col;
    const sh = it.shape || 'circle';
    if (sh === 'star') { starP(c, 0, 0, r * 1.25, r * 0.6, 5, -Math.PI / 2); c.fill(); c.stroke(); }
    else if (sh === 'square') { c.beginPath(); c.rect(-r, -r, r * 2, r * 2); c.fill(); c.stroke(); }
    else if (sh === 'gem') { c.beginPath(); c.moveTo(0, -r * 1.2); c.lineTo(r, -r * 0.2); c.lineTo(0, r * 1.2); c.lineTo(-r, -r * 0.2); c.closePath(); c.fill(); c.stroke(); }
    else {
      c.beginPath(); c.arc(0, 0, r, 0, TAU); c.fill();
      if (sh === 'beach') { ['#ff4d5e', '#3aa0ff', '#ffd23c'].forEach((k, i) => { c.fillStyle = k; c.beginPath(); c.moveTo(0, 0); c.arc(0, 0, r, i * TAU / 3, i * TAU / 3 + TAU / 6); c.fill(); }); }
      if (sh === 'eye') { c.fillStyle = it.iris || '#3aa0ff'; c.beginPath(); c.arc(r * 0.3, 0, r * 0.45, 0, TAU); c.fill(); c.fillStyle = '#000'; c.beginPath(); c.arc(r * 0.38, 0, r * 0.2, 0, TAU); c.fill(); }
      if (sh === 'eight') { c.fillStyle = '#fff'; c.beginPath(); c.arc(0, 0, r * 0.48, 0, TAU); c.fill(); c.fillStyle = '#111'; c.font = 'bold ' + Math.round(r * 0.75) + 'px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('8', 0, r * 0.05); }
      if (sh === 'smiley') { c.fillStyle = st; c.beginPath(); c.arc(-r * 0.32, -r * 0.2, r * 0.12, 0, TAU); c.arc(r * 0.32, -r * 0.2, r * 0.12, 0, TAU); c.fill(); c.beginPath(); c.arc(0, r * 0.05, r * 0.5, 0.2, Math.PI - 0.2); c.stroke(); }
      if (sh === 'planet') { c.save(); c.rotate(-0.4); c.beginPath(); c.ellipse(0, 0, r * 1.6, r * 0.45, 0, 0, TAU); c.strokeStyle = '#ffd9a8'; c.lineWidth = r * 0.16; c.stroke(); c.restore(); }
      if (sh === 'donut') { c.fillStyle = '#c98a4b'; c.beginPath(); c.arc(0, 0, r * 0.38, 0, TAU); c.fill(); }
      c.beginPath(); c.arc(0, 0, r, 0, TAU); c.stroke();
      c.fillStyle = 'rgba(255,255,255,.45)'; c.beginPath(); c.arc(-r * 0.35, -r * 0.4, r * 0.25, 0, TAU); c.fill();
    }
    c.restore();
  }
  function fallbackCos(c, cat, it, w, h, t) {
    const m = Math.min(w, h);
    if (cat === 'balls') {
      const b = Math.abs(Math.sin(t * 3)) * h * 0.14, r = m * 0.2;
      c.fillStyle = 'rgba(0,0,0,.28)'; c.beginPath(); c.ellipse(w / 2, h * 0.8, r * (1 - b / h), r * 0.25, 0, 0, TAU); c.fill();
      fbBall(c, it, w / 2, h * 0.8 - r - b - 2, r, t * 1.5);
    } else if (cat === 'trails') {
      const n = 28, pts = [];
      const T = (t * 0.45) % 1;
      for (let i = 0; i < n; i++) { const u = T - i * 0.018; const x = (((u % 1) + 1) % 1) * (w + 40) - 20; pts.push([x, h * 0.55 - Math.sin(x / w * Math.PI * 2 + 0.5) * h * 0.22]); }
      const st = it.style || 'line', col = it.color || '#fff';
      for (let i = n - 1; i > 0; i--) {
        const a = pts[i], b = pts[i - 1]; if (b[0] < a[0] - 5) continue;
        const f = 1 - i / n;
        if (st === 'none') break;
        if (st === 'sparkle' || st === 'bubbles' || st === 'smoke') {
          if (i % 2) continue;
          c.globalAlpha = f; c.fillStyle = col; c.strokeStyle = col;
          if (st === 'sparkle') { starP(c, a[0], a[1] + Math.sin(i * 7 + t * 9) * 4, m * 0.05 * f + 1, m * 0.02, 4, t * 3 + i); c.fill(); }
          else if (st === 'bubbles') { c.lineWidth = 1.2; c.beginPath(); c.arc(a[0], a[1] - i * 0.6, m * 0.035 + (1 - f) * m * 0.04, 0, TAU); c.stroke(); }
          else { c.globalAlpha = f * 0.5; c.beginPath(); c.arc(a[0], a[1] - i * 0.8, m * 0.04 + (1 - f) * m * 0.07, 0, TAU); c.fill(); }
          continue;
        }
        c.globalAlpha = f; c.lineCap = 'round'; c.lineWidth = m * 0.07 * (0.3 + f * 0.7);
        c.strokeStyle = st === 'rainbow' ? 'hsl(' + ((i * 14 + t * 200) % 360) + ',95%,60%)' : st === 'fire' ? 'hsl(' + (10 + f * 40) + ',100%,' + (45 + f * 20) + '%)' : col;
        if (st === 'neon') { c.shadowColor = col; c.shadowBlur = 10; }
        c.beginPath(); c.moveTo(a[0], a[1]); c.lineTo(b[0], b[1]); c.stroke();
      }
      c.globalAlpha = 1; c.shadowBlur = 0;
      const eq = G.Progress && G.Progress.equipped ? findItem('balls', G.Progress.equipped().ball) : {};
      fbBall(c, eq, pts[0][0], pts[0][1], m * 0.07, t * 4);
    } else if (cat === 'cupEffects') {
      const gy = h * 0.74, cx = w / 2;
      c.fillStyle = '#3f8f45'; c.fillRect(0, gy, w, h - gy);
      c.fillStyle = '#111'; c.fillRect(cx - m * 0.09, gy, m * 0.18, m * 0.08);
      c.strokeStyle = '#ddd'; c.lineWidth = 2; c.beginPath(); c.moveTo(cx + m * 0.02, gy); c.lineTo(cx + m * 0.02, gy - m * 0.45); c.stroke();
      c.fillStyle = '#ff4757'; c.beginPath(); c.moveTo(cx + m * 0.02, gy - m * 0.45); c.lineTo(cx + m * 0.22, gy - m * 0.38); c.lineTo(cx + m * 0.02, gy - m * 0.31); c.fill();
      const P = 1.8, k = (t % P) / P, id = it.id;
      const rnd = (i) => { const x = Math.sin(i * 91.7 + Math.floor(t / P) * 13.1) * 43758.5; return x - Math.floor(x); };
      c.globalAlpha = Math.max(0, 1 - k);
      if (id === 'shockwave') { c.strokeStyle = '#bff'; c.lineWidth = 3 * (1 - k) + 1; c.beginPath(); c.ellipse(cx, gy, k * w * 0.5, k * h * 0.25, 0, 0, TAU); c.stroke(); }
      for (let i = 0; i < (id === 'shockwave' ? 0 : 18); i++) {
        const a = -Math.PI / 2 + (rnd(i) - 0.5) * (id === 'fireworks' ? TAU : 2.2), sp = (0.4 + rnd(i + 50) * 0.6) * m * 0.75;
        const x = cx + Math.cos(a) * sp * k, y = (id === 'fireworks' ? gy - m * 0.45 : gy) + Math.sin(a) * sp * k + k * k * m * 0.5;
        c.fillStyle = id === 'hearts' ? '#ff6fa8' : id === 'stars' ? '#ffd23c' : id === 'classic' ? '#fff' : 'hsl(' + Math.floor(rnd(i + 9) * 360) + ',90%,60%)';
        if (id === 'stars') { starP(c, x, y, m * 0.045, m * 0.02, 5, k * 4); c.fill(); }
        else if (id === 'hearts') heartP(c, x, y, m * 0.045);
        else if (id === 'fireworks') { c.beginPath(); c.arc(x, y, m * 0.018, 0, TAU); c.fill(); }
        else { c.save(); c.translate(x, y); c.rotate(k * 9 + i); c.fillRect(-m * 0.02, -m * 0.01, m * 0.04, m * 0.02); c.restore(); }
      }
      c.globalAlpha = 1;
    } else if (cat === 'flags') {
      const px = w * 0.34, top = h * 0.12, bot = h * 0.9, fw = w * 0.4, fh = h * 0.3;
      c.fillStyle = 'rgba(0,0,0,.25)'; c.beginPath(); c.ellipse(px, bot, w * 0.12, h * 0.03, 0, 0, TAU); c.fill();
      c.strokeStyle = it.pole || '#e8e8ee'; c.lineWidth = Math.max(2, m * 0.03); c.beginPath(); c.moveTo(px, top); c.lineTo(px, bot); c.stroke();
      const cols = Array.isArray(it.colors) ? it.colors : [it.color || it.c || '#ff4757'];
      const N = 14;
      for (let s = 0; s < cols.length; s++) {
        c.fillStyle = cols[s]; c.beginPath();
        const y0 = top + fh * s / cols.length, y1 = top + fh * (s + 1) / cols.length;
        for (let i = 0; i <= N; i++) { const u = i / N; c.lineTo(px + u * fw, y0 + Math.sin(u * 5 - t * 6) * u * fh * 0.12); }
        for (let i = N; i >= 0; i--) { const u = i / N; c.lineTo(px + u * fw, y1 + Math.sin(u * 5 - t * 6) * u * fh * 0.12); }
        c.closePath(); c.fill();
      }
    } else if (cat === 'palettes') {
      const base = (G.Render && G.Render.DEFAULT_THEME && G.Render.DEFAULT_THEME.palette) || { skyTop: '#5fb4ff', skyBottom: '#d8f1ff', far: '#a9cfe6', mid: '#7fb08a', near: '#4f8f5a', ground: '#7a5a3a', accent: '#ff4757' };
      const o = it.override || it.palette || {}, p = Object.assign({}, base, o), post = o.post || {};
      if (post.mono) c.filter = 'grayscale(1) contrast(1.1)';
      const g = c.createLinearGradient(0, 0, 0, h); g.addColorStop(0, p.skyTop); g.addColorStop(1, p.skyBottom); c.fillStyle = g; c.fillRect(0, 0, w, h);
      const hill = (col, y, amp, f, sp) => { c.fillStyle = col; c.beginPath(); c.moveTo(0, h); for (let x = 0; x <= w; x += 4) c.lineTo(x, y + Math.sin(x / w * f + t * sp) * amp); c.lineTo(w, h); c.fill(); };
      hill(p.far, h * 0.5, h * 0.08, 5, 0.2); hill(p.mid, h * 0.62, h * 0.07, 7, 0.35); hill(p.near || p.mid, h * 0.72, h * 0.05, 9, 0.5);
      c.fillStyle = p.ground; c.fillRect(0, h * 0.82, w, h);
      c.fillStyle = p.accent; c.fillRect(w * 0.7, h * 0.56, 2, h * 0.26); c.beginPath(); c.moveTo(w * 0.7 + 2, h * 0.56); c.lineTo(w * 0.7 + 14, h * 0.6); c.lineTo(w * 0.7 + 2, h * 0.64); c.fill();
      c.filter = 'none';
      if (post.white) { c.fillStyle = 'rgba(255,255,255,' + post.white + ')'; c.fillRect(0, 0, w, h); }
      if (post.tint) { c.globalAlpha = post.amt || 0.2; c.fillStyle = post.tint; c.fillRect(0, 0, w, h); c.globalAlpha = 1; }
    } else {
      c.fillStyle = it.color || '#ffd23c'; starP(c, w / 2, h / 2, m * 0.3, m * 0.13, 5, t); c.fill();
    }
  }
  // one shared rAF loop for every live preview canvas; small tiles are throttled + skipped when off-screen
  let anims = [], animRaf = 0;
  const DPR = () => Math.min(2, window.devicePixelRatio || 1);
  function animate(cv, cat, item, fps) { anims.push({ cv, cat, item, fps: fps || 12, last: -1 }); if (!animRaf) animRaf = requestAnimationFrame(animTick); }
  function stopAnims(keepToasts) { anims = keepToasts ? anims.filter((a) => a.toast) : anims.filter((a) => a.toast); }
  function animTick(ts) {
    animRaf = 0;
    anims = anims.filter((a) => a.cv.isConnected);
    if (!anims.length) return;
    const t = ts / 1000, vh = window.innerHeight;
    for (const a of anims) {
      if (a.last >= 0 && t - a.last < 1 / a.fps) continue;
      const cv = a.cv, w = cv.clientWidth, h = cv.clientHeight;
      if (!w || !h) continue;
      const r = cv.getBoundingClientRect();
      if (a.last >= 0 && (r.bottom < 0 || r.top > vh)) continue;
      a.last = t;
      const d = DPR(), W = Math.round(w * d), H = Math.round(h * d);
      if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; }
      const ctx = cv.getContext('2d');
      ctx.setTransform(d, 0, 0, d, 0, 0);
      drawCos(ctx, a.cat, a.item, w, h, t);
    }
    animRaf = requestAnimationFrame(animTick);
  }
  function bindPreviews(container, cat, fps) {
    container.querySelectorAll('canvas[data-cos]').forEach((cv) => animate(cv, cv.dataset.cat || cat, findItem(cv.dataset.cat || cat, cv.dataset.cos), +cv.dataset.fps || fps));
  }
  const cosCanvas = (cat, id, cls, fps) => '<canvas class="' + (cls || '') + '" data-cat="' + esc(cat) + '" data-cos="' + esc(id) + '"' + (fps ? ' data-fps="' + fps + '"' : '') + '></canvas>';

  // ---------- unlock toasts (queued, each with an animated mini preview) ----------
  const unlockQ = []; let unlockBusy = false;
  function unlockToasts(items) {
    (items || []).forEach((x) => unlockQ.push(x));
    if (!unlockBusy) nextUnlock();
  }
  function achToasts(list) {
    (list || []).forEach((a) => { if (a) unlockQ.push({ ach: a }); });
    if (!unlockBusy) nextUnlock();
  }
  function nextUnlock() {
    const x = unlockQ.shift();
    if (!x) { unlockBusy = false; return; }
    unlockBusy = true;
    if (G.Haptics) G.Haptics.buzz('unlock');
    if (x.ach) {
      const el = document.createElement('div');
      el.className = 'utoast r-legendary atoast';
      el.innerHTML = '<div class="ut-cv ach-ic">' + esc(x.ach.icon || '🏅') + '</div><div class="ut-b"><div class="ut-k">' + ic('medal') + 'Achievement unlocked</div>' +
        '<div class="ut-n">' + esc(x.ach.name) + '</div><div class="ut-r">' + esc(x.ach.desc) + '</div></div>';
      toasts.appendChild(el);
      if (A()) A().sfx('fanfare');
      setTimeout(() => el.classList.add('out'), 3000);
      setTimeout(() => { el.remove(); nextUnlock(); }, 3400);
      return;
    }
    const el = document.createElement('div');
    el.className = 'utoast r-' + (x.rarity || 'common');
    el.innerHTML = '<div class="ut-cv">' + cosCanvas(x.cat, x.id, '', 30) + '</div><div class="ut-b"><div class="ut-k">' + ic('sparkle') + 'Unlocked · ' + esc(x.catName || '') + '</div>' +
      '<div class="ut-n">' + esc(x.name) + '</div><div class="ut-r">' + esc(cap(x.rarity || 'common')) + ' · equip it in the Locker</div></div>';
    toasts.appendChild(el);
    const cv = el.querySelector('canvas'); anims.push({ cv, cat: x.cat, item: x.item || findItem(x.cat, x.id), fps: 30, last: -1, toast: true }); if (!animRaf) animRaf = requestAnimationFrame(animTick);
    if (A()) A().sfx('tokensAll');
    setTimeout(() => el.classList.add('out'), 3000);
    setTimeout(() => { el.remove(); nextUnlock(); }, 3400);
  }

  // ---------- HUD ----------
  let hudEls = {}, hudKey = '';
  function buildHud() {
    hud.innerHTML =
      '<div class="hud-top">' +
        '<div class="hud-left">' +
          '<div class="hcard h-player hidden" aria-live="polite"><canvas class="hp-cv"></canvas><span class="hp-t"><b class="hp-name"></b><small class="hp-sub"></small></span></div>' +
          '<div class="hcard hud-hole"><div class="h-kick"><span class="h-kicker"></span><span class="h-par"></span></div><div class="h-name"></div><div class="h-mode"></div></div>' +
        '</div>' +
        '<div class="hud-mid">' +
          '<div class="hcard h-strokes"><small>Strokes</small><div class="hs-v"><b></b><span class="hs-lim"></span></div></div>' +
          '<div class="hud-chips"><span class="hchip h-total hidden"></span><span class="hchip h-bonus hidden"></span><span class="hchip h-tokens hidden"></span>' +
          '<span class="hchip h-wind hidden"><span class="warrow">' + ic('arrow') + '</span><span class="wtxt"></span></span>' +
          '<span class="hchip h-clock hidden" title="Hole time (round time)">' + ic('clock') + '<b class="ck-h"></b><small class="ck-r"></small></span></div>' +
        '</div>' +
        '<div class="hud-btns">' +
          '<button class="hbtn" data-act="hud-mute" title="Mute (M)" aria-label="Toggle sound"><span class="i-mute">' + ic('sound') + '</span></button>' +
          '<button class="hbtn" data-act="hud-pause" title="Pause (Esc)" aria-label="Pause">' + ic('pause') + '</button></div>' +
      '</div>' +
      '<div class="hud-bl">' +
        '<div class="spinsel" title="Spin: B = more backspin, T = more topspin, mouse wheel while aiming">' +
          '<button class="hbtn sp-b" data-act="hud-spin" data-dir="-1" title="More backspin (B)" aria-label="More backspin">' + ic('spinB') + '</button>' +
          '<div class="sp-mid"><div class="sp-dots">' + [-1, -0.5, 0, 0.5, 1].map((v) => '<i data-v="' + v + '"></i>').join('') + '</div><div class="sp-lbl">No spin</div></div>' +
          '<button class="hbtn sp-t" data-act="hud-spin" data-dir="1" title="More topspin (T)" aria-label="More topspin">' + ic('spinT') + '</button>' +
        '</div>' +
        '<button class="hbtn lbl" data-act="hud-look" title="Look around (hold L / right-drag)">' + ic('eye') + '<small>Look</small></button>' +
      '</div>' +
      '<div class="hud-br">' +
        '<button class="hbtn lbl hidden" data-act="hud-editcopy" title="Open a copy of this hole in the editor">' + ic('edit') + '<small>Edit copy</small></button>' +
        '<button class="hbtn lbl hidden" data-act="hud-showme" title="Show me: watch the bot solve this hole">' + ic('bulb') + '<small class="sm-t">Show me</small></button>' +
        '<button class="hbtn lbl" data-act="hud-restart" title="Restart hole (R)">' + ic('replay') + '<small>Restart</small></button>' +
        '<button class="hbtn lbl mull" data-act="hud-mull" title="Mulligan: take the last shot again">' + ic('undo') + '<small class="mtxt">Mulligan</small><span class="mcount"></span></button>' +
      '</div>' +
      '<div class="hud-power hidden"><div class="pw-top"><span class="pw-pct"></span><span class="pw-txt"></span></div><div class="pw-bar"><div class="pw-fill"></div><i class="pw-last"></i></div>' +
        '<div class="pw-scale"><span>0</span><span>10</span><span>20</span><span>30</span><span>40%</span><span class="pw-ext">→ drag further for more</span></div><div class="pw-prev"></div></div>' +
      '<div class="hud-coach hidden"></div>' +
      '<div class="hud-hint hidden">' + ic('target') + 'Drag back anywhere to aim · release to shoot</div>' +
      '<div class="hud-skip hidden">Tap to skip</div>';
    ['h-kicker', 'h-par', 'h-name', 'h-mode', 'h-strokes', 'h-total', 'h-bonus', 'h-tokens', 'spinsel', 'sp-lbl', 'h-wind', 'warrow', 'wtxt', 'hud-power', 'pw-fill', 'pw-txt', 'pw-pct', 'mtxt', 'mcount', 'hud-hint', 'hud-skip', 'i-mute', 'h-clock', 'ck-h', 'ck-r', 'pw-last', 'pw-prev', 'pw-scale', 'hud-coach', 'sm-t', 'h-player', 'hp-name', 'hp-sub', 'hp-cv'].forEach((c) => { hudEls[c] = hud.querySelector('.' + c); });
    hudEls.sv = hud.querySelector('.hs-v b'); hudEls.slim = hud.querySelector('.hs-lim');
    hudEls.spinBtns = hud.querySelectorAll('[data-act="hud-spin"]');
    hudEls.spinDots = hud.querySelectorAll('.sp-dots i');
    hudEls.mull = hud.querySelector('[data-act="hud-mull"]');
    hudEls.restart = hud.querySelector('[data-act="hud-restart"]');
    hudEls.look = hud.querySelector('[data-act="hud-look"]');
    hudEls.showme = hud.querySelector('[data-act="hud-showme"]');
    hudEls.editcopy = hud.querySelector('[data-act="hud-editcopy"]');
    acts0 = {
      'hud-pause': () => App().pause(),
      'hud-mute': () => App().toggleMute(),
      'hud-spin': (d) => { const s = App().session; if (s) s.adjSpin(+d.dir); },
      'hud-look': () => App().toggleLook(),
      'hud-mull': () => { const s = App().session; if (s && s.mulligan()) toast('Mulligan!', 'info'); },
      'hud-restart': () => App().restartHole(),
      'hud-editcopy': () => { if (G.MyHoles) G.MyHoles.editRunCopy(); },
      'hud-showme': () => { const v = App().showMe(); if (v) toast('Watch the ghost — that\'s one way to do it', 'info', 1600); },
      'coach-min': () => { coachMin = !coachMin; renderCoach(); },
      'coach-show': () => { const v = App().showMe(); if (v) { coachMin = true; renderCoach(); } },
      'coach-restart': () => App().restartHole(),
      'coach-step': (d) => { if (!coach) return; coach.step = Math.max(0, Math.min(BASICS_STEPS.length - 1, (coach.step || 0) + (+d.d))); renderCoach(); },
    };
  }
  let acts0 = {};
  function hudClick(e) {
    const el = e.target.closest('[data-act]');
    if (!el) return;
    const fn = acts0[el.dataset.act];
    if (fn) { e.preventDefault(); e.stopPropagation(); click(); fn(el.dataset, el); el.blur(); }
  }
  function showHud(v) { hud.classList.toggle('hidden', !v); hudKey = ''; }
  // Multiplayer: whose turn it is (name + ball) in the top-left of the HUD; null hides it.
  // The ball preview is a "toast"-type anim so it survives screen changes (stopAnims keeps those).
  function setHudPlayer(p) {
    const el = hudEls['h-player']; if (!el) return;
    anims = anims.filter((a) => !a.hudp);
    el.classList.toggle('hidden', !p);
    hud.classList.toggle('mp', !!p);
    if (!p) return;
    hudEls['hp-name'].textContent = p.name;
    hudEls['hp-sub'].innerHTML = 'Player ' + (p.idx + 1) + '/' + p.count + '<span class="hp-yt"> · your turn</span>';
    el.setAttribute('aria-label', p.name + ', player ' + (p.idx + 1) + ' of ' + p.count + ', your turn');
    anims.push({ cv: hudEls['hp-cv'], cat: 'balls', item: findItem('balls', p.ball), fps: 12, last: -1, toast: true, hudp: true });
    if (!animRaf) animRaf = requestAnimationFrame(animTick);
  }
  // ---- coach card (tutorial) ----
  let coach = null, coachMin = false;
  function setCoach(o) { coach = o; coachMin = false; if (o) { o.step = 0; o.seen = 0; } renderCoach(); }
  // basics: advance the walkthrough with what the player is doing
  function coachAdvance(info) {
    if (!coach || coach.type !== 'basics') return;
    let st = coach.step;
    if (info.strokes > coach.seen && info.canShoot) { coach.seen = info.strokes; st = Math.max(st, Math.min(2, st + 1)); }
    if (info.putt && info.canShoot && st < 3) st = 3;
    if (st !== coach.step) { coach.step = st; coachMin = false; renderCoach(); }
  }
  function renderCoach() {
    const el = hudEls['hud-coach']; if (!el) return;
    if (!coach || coach.kind !== 'tutorial') { el.classList.add('hidden'); el.innerHTML = ''; return; }
    const t = coach.type, info = gimInfo(t);
    el.classList.remove('hidden'); el.classList.toggle('min', coachMin);
    if (coachMin) {
      el.innerHTML = '<button class="coach-chip" data-act="coach-min" aria-label="Show tutorial tips"><span class="gi">' + gimIcon(t) + '</span><b>' + esc(info.name || gimName(t)) + '</b>' + ic('bulb') + '</button>';
      return;
    }
    if (t === 'basics') {
      const k = coach.step || 0, stp = BASICS_STEPS[k];
      el.innerHTML = '<div class="coach-card basics"><div class="cc-k">' + ic('grad') + 'Basics · ' + (k + 1) + '/' + BASICS_STEPS.length + '</div><button class="coach-x" data-act="coach-min" aria-label="Minimise">' + ic('x') + '</button>' +
        '<div class="coach-h"><span class="gi">⛳</span><b>' + esc(stp[0]) + '</b></div><div class="coach-d">' + stp[1] + '</div>' +
        '<div class="coach-dots">' + BASICS_STEPS.map((x, i) => '<i class="' + (i === k ? 'on' : i < k ? 'done' : '') + '"></i>').join('') + '</div>' +
        '<div class="coach-b">' + (k > 0 ? '<button class="btn sm ghost" data-act="coach-step" data-d="-1">' + ic('back') + 'Back</button>' : '') +
        (k < BASICS_STEPS.length - 1 ? '<button class="btn sm" data-act="coach-step" data-d="1">Next' + ic('next') + '</button>' : '') +
        (coach.hint ? '<button class="btn sm ghost" data-act="coach-show">' + ic('bulb') + 'Show me</button>' : '') + '<button class="btn sm ghost" data-act="coach-min">Got it</button></div></div>';
      el.querySelectorAll('.pp-note').forEach((x) => { if (G.Store.getSettings().precisionPutt === false) x.remove(); });
      return;
    }
    el.innerHTML = '<div class="coach-card"><div class="cc-k">' + ic('grad') + 'Tutorial</div><button class="coach-x" data-act="coach-min" aria-label="Minimise">' + ic('x') + '</button>' +
      '<div class="coach-h"><span class="gi">' + gimIcon(t) + '</span><b>' + esc(info.name || gimName(t)) + '</b></div>' +
      (info.desc ? '<div class="coach-d">' + esc(info.desc) + '</div>' : '') + (info.tip ? '<div class="coach-t"><b>Tip</b> ' + esc(info.tip) + '</div>' : '') +
      '<div class="coach-b">' + (coach.hint ? '<button class="btn sm" data-act="coach-show">' + ic('bulb') + 'Show me</button>' : '') +
      '<button class="btn sm ghost" data-act="coach-restart">' + ic('replay') + 'Restart</button><button class="btn sm ghost" data-act="coach-min">Got it</button></div>' +
      '<div class="coach-n">Unlimited strokes — hole it to complete the tutorial.</div></div>';
  }
  const fmtTime = (sec) => { sec = Math.max(0, +sec || 0); const m = Math.floor(sec / 60), s2 = sec - m * 60; return m + ':' + (s2 < 10 ? '0' : '') + s2.toFixed(sec < 600 ? 1 : 0); };
  const fmtTimeS = (sec) => { sec = Math.max(0, Math.round(+sec || 0)); const m = Math.floor(sec / 60), s2 = sec % 60; return m + ':' + (s2 < 10 ? '0' : '') + s2; };
  let hintShown = 0;
  function updateHud(info, extra) {
    if (!info) return;
    extra = extra || {};
    const key = [info.name, info.par, info.strokes, info.bonus, info.limit, info.mull, info.canMull, info.spin, info.putt, info.tokens ? info.tokens.got + '/' + info.tokens.n : '', extra.sub, extra.kicker, extra.mode, extra.total && extra.total.value, G.Audio.isMuted(), extra.allowRestart, extra.editCopy, App().lookToggle].join('|');
    if (key !== hudKey) {
      hudKey = key;
      hudEls['h-kicker'].textContent = extra.kicker || 'Hole';
      hudEls['h-par'].textContent = 'Par ' + info.par;
      hudEls['h-name'].textContent = info.name || '';
      hudEls['h-mode'].textContent = extra.mode || '';
      hudEls.sv.textContent = info.strokes;
      hudEls.slim.textContent = info.limit === Infinity ? '' : '/' + info.limit;
      hudEls['h-strokes'].classList.toggle('warn', info.limit !== Infinity && info.strokes >= info.limit - 1);
      const tot = extra.total;
      hudEls['h-total'].classList.toggle('hidden', !tot);
      if (tot) { hudEls['h-total'].innerHTML = '<small>' + esc(tot.label) + '</small><b>' + esc(tot.value) + '</b>'; hudEls['h-total'].className = 'hchip h-total' + (/^-/.test(tot.value) ? ' under' : /^\+/.test(tot.value) ? ' over' : ''); }
      hudEls['h-bonus'].classList.toggle('hidden', !info.bonus);
      if (info.bonus) hudEls['h-bonus'].innerHTML = ic('swish') + '<b>Swish −' + info.bonus + '</b>';
      const tk = info.tokens;
      hudEls['h-tokens'].classList.toggle('hidden', !tk);
      if (tk) { hudEls['h-tokens'].innerHTML = ic('star') + '<b>' + tk.got + '/' + tk.n + '</b>' + (tk.got >= tk.n ? '<small>cup open</small>' : ''); hudEls['h-tokens'].classList.toggle('done', tk.got >= tk.n); }
      // spin selector
      const sp = info.putt ? 0 : info.spin;
      hudEls.spinsel.classList.toggle('putt', !!info.putt);
      hudEls.spinBtns.forEach((b) => b.classList.toggle('disabled', !!info.putt || (+b.dataset.dir < 0 ? info.spin <= -1 : info.spin >= 1)));
      hudEls.spinDots.forEach((d) => { const v = +d.dataset.v; d.className = (v === sp ? 'on' : '') + (v < 0 ? ' bk' : v > 0 ? ' tp' : ''); });
      hudEls['sp-lbl'].textContent = info.putt ? 'Putt · no spin' : sp === 0 ? 'No spin' : (Math.abs(sp) === 1 ? 'Full ' : 'Half ') + (sp < 0 ? 'backspin' : 'topspin');
      hudEls.mcount.textContent = info.mull === Infinity ? '∞' : String(info.mull);
      hudEls.mull.classList.toggle('disabled', !info.canMull);
      hudEls.mull.classList.toggle('hidden', info.mull === 0);
      hudEls.restart.classList.toggle('hidden', !extra.allowRestart);
      hudEls['i-mute'].innerHTML = ic(G.Audio.isMuted() ? 'mute' : 'sound');
      hudEls.look.classList.toggle('on', !!App().lookToggle);
    }
    // wind
    const w = info.wind;
    if (w && w.strength > 1) {
      hudEls['h-wind'].classList.remove('hidden');
      hudEls.warrow.style.transform = 'rotate(' + w.angle.toFixed(2) + 'rad)';
      hudEls.wtxt.textContent = (w.strength / 10).toFixed(1);
    } else hudEls['h-wind'].classList.add('hidden');
    // power
    const a = info.aim;
    if (a && info.canShoot) {
      hudEls['hud-power'].classList.remove('hidden');
      hudEls['pw-fill'].style.width = Math.round(a.power * 100) + '%';
      hudEls['pw-fill'].style.setProperty('--pw', String(Math.round(120 - a.power * 120)));
      let deg = Math.round(-a.angle * 180 / Math.PI); deg = ((deg % 360) + 360) % 360;
      hudEls['pw-pct'].textContent = Math.round(a.power * 100) + '%';
      hudEls['pw-txt'].textContent = deg + '°' + (info.putt ? ' · putt' : info.spin ? ' · ' + (Math.abs(info.spin) === 1 ? '' : '½ ') + (info.spin < 0 ? 'backspin' : 'topspin') : '');
      // precision putting: the bar shows the fine 0-40% zone
      const pz = G.Play && G.Play.PUTT_ZONE || 0.4, prec = !!info.precise;
      hudEls['hud-power'].classList.toggle('precise', prec);
      if (prec) hudEls['pw-fill'].style.width = Math.round(Math.min(1, a.power / pz) * 100) + '%';
      hudEls['hud-power'].classList.toggle('over', prec && a.power > pz + 1e-6);
      // previous shot marker + readout
      const L = info.last;
      if (L) {
        let ld = Math.round(-L.angle * 180 / Math.PI); ld = ((ld % 360) + 360) % 360;
        const lp = prec ? Math.min(1, L.power / pz) : L.power;
        hudEls['pw-last'].style.left = (lp * 100).toFixed(1) + '%'; hudEls['pw-last'].style.display = '';
        hudEls['pw-prev'].textContent = 'Last shot: ' + ld + '° · ' + Math.round(L.power * 100) + '%' + (L.spin ? ' · ' + (L.spin < 0 ? 'back' : 'top') + 'spin' : '');
      } else { hudEls['pw-last'].style.display = 'none'; hudEls['pw-prev'].textContent = ''; }
    } else hudEls['hud-power'].classList.add('hidden');
    // clock
    const ck = extra.clock;
    if (ck && (ck.hole > 0 || ck.round)) {
      hudEls['h-clock'].classList.remove('hidden');
      hudEls['ck-h'].textContent = fmtTime(ck.hole);
      hudEls['ck-r'].textContent = ck.round ? fmtTimeS(ck.round) : '';
    } else hudEls['h-clock'].classList.add('hidden');
    hudEls.editcopy.classList.toggle('hidden', !extra.editCopy);
    hudEls.showme.classList.toggle('hidden', !extra.showMe);
    hudEls.showme.classList.toggle('on', !!info.showMe);
    hudEls['sm-t'].textContent = info.showMe ? 'Hide' : 'Show me';
    if (coach && coach.type === 'basics') coachAdvance(info);
    else if (coach && coach.kind === 'tutorial' && !coachMin && info.strokes > 0) { coachMin = true; renderCoach(); }
    const showHint = info.canShoot && !a && info.strokes === 0 && hintShown < 3;
    hudEls['hud-hint'].classList.toggle('hidden', !showHint);
    hudEls['hud-skip'].classList.toggle('hidden', !info.intro);
  }

  // ---------- SCREENS ----------
  const SCREENS = {};

  function logoHtml(small) {
    return '<div class="logo' + (small ? ' small' : '') + '"><div class="logo-ball"></div><div class="logo-t">' +
      'STICK GOLF'.split('').map((c, i) => '<span style="animation-delay:' + (i * 0.06) + 's">' + (c === ' ' ? '&nbsp;' : c) + '</span>').join('') + '</div></div>';
  }
  function nextCourse() {
    const Pg = G.Progress, list = Pg.courses();
    return list.find((c) => Pg.unlocked(c) && Pg.baked(c.id) && !Pg.courseInfo(c.id).cleared) || null;
  }

  function streakTxt() { const s2 = G.Progress.dailyStreak ? G.Progress.dailyStreak() : { cur: 0 }; return s2.cur > 1 ? s2.cur + '-day streak' : 'Under par keeps your streak'; }
  function tutTxt() { return G.Progress.hasTutorials() ? G.Progress.tutorialsDoneCount() + '/' + G.Progress.tutorialTotal() + ' done' : 'Coming soon'; }
  function achTxt() { const Ac = G.Achievements; return Ac ? Ac.count() + '/' + Ac.total() + ' earned' : ''; }

  SCREENS.notice = function () {
    render('<div class="center-col"><div class="card pop"><div class="card-k">' + ic('sparkle') + 'Welcome back</div>' +
      '<h2 class="ttl">The tour has been reshuffled</h2>' +
      '<div class="sub">The 60 courses now come in a new order, each teaching one gimmick. Your course progress has been reset so the unlocks make sense — ' +
      'your <b>settings, cosmetics, stats and achievements are all kept</b>.</div>' +
      '<div class="sub">New: tutorials for every gimmick, Practice mode, Remix rounds, achievements, a daily streak and a share card.</div>' +
      '<div class="menu"><button class="btn big primary" data-act="ok">' + ic('play') + 'Let\'s play</button></div></div></div>', 'dim');
    on({ ok: () => { click(); show('title'); }, back: () => show('title') });
  };

  // ----- achievements -----
  SCREENS.achievements = function (args) {
    const Ac = G.Achievements;
    if (!Ac) { show('title'); return; }
    const list = Ac.state();
    const got = list.filter((x) => x.earned).length;
    let html = topbar('Achievements', got + '/' + list.length + ' earned') + '<div class="page">';
    html += '<div class="prog-strip"><div class="ps-bar"><i style="width:' + (got / list.length * 100).toFixed(1) + '%"></i></div><span>' + Math.round(got / list.length * 100) + '% complete</span></div>';
    html += '<div class="ach-grid">' + list.map((x, i) => {
      const a = x.a, p = x.prog;
      return '<div class="ach' + (x.earned ? ' got' : '') + '" style="--d:' + Math.min(0.4, i * 0.012) + 's"><div class="ach-ic">' + esc(a.icon) + (x.earned ? '<span class="ach-ok">' + ic('check') + '</span>' : '') + '</div>' +
        '<div class="ach-b"><b>' + esc(a.name) + '</b><small>' + esc(a.desc) + '</small>' +
        (x.earned ? '<span class="ach-d">' + ic('check') + 'Earned ' + esc(x.earned) + '</span>'
          : p ? '<span class="ach-p"><span class="bar"><i style="width:' + Math.round(p.frac * 100) + '%"></i></span><small>' + p.cur + '/' + p.need + '</small></span>' : '<span class="ach-d dim">' + ic('lock') + 'Not yet</span>') +
        '</div></div>';
    }).join('') + '</div></div>';
    render(html, 'list');
    on({ back: () => show(args.ret || 'title', args.retArgs) });
  };

  // ----- tutorials -----
  function tutorialGroups() {
    const packs = ((G.Manifest && G.Manifest.PACKS) || []).filter((p) => p && Array.isArray(p.gimmicks));
    const seen = new Set(); const out = packs.map((p) => { p.gimmicks.forEach((g) => seen.add(g)); return { name: p.name || p.id, gimmicks: p.gimmicks.slice() }; });
    const rest = allGimmicksList().filter((g) => !seen.has(g));
    if (rest.length) out.push({ name: 'Other', gimmicks: rest });
    return out;
  }
  SCREENS.tutorials = function (args) {
    const Pg = G.Progress, n = Pg.tutorialTotal(), done = Pg.tutorialsDoneCount();
    let html = topbar('Tutorials', Pg.hasTutorials() ? done + '/' + n + ' completed' : 'Coming soon', { right: iconBtn('practice', 'target', 'Practice') }) + '<div class="page">';
    if (!Pg.hasTutorials()) html += '<div class="panel hero-panel"><div class="hp-ic">' + ic('grad') + '</div><h2>Tutorials coming soon</h2><p class="sub">A short teaching hole for every gimmick is on its way. Completing a tutorial unlocks that gimmick in Endless.</p></div>';
    else html += '<div class="note">' + ic('bulb') + 'A short hole for each gimmick, with unlimited strokes and a “Show me” hint. Completing one unlocks that gimmick in Endless.</div>';
    if (Pg.tutorialHole('basics')) {
      const dn = Pg.tutorialDone('basics');
      html += '<button class="panel basics-card' + (dn ? ' done' : '') + '" data-act="tut" data-t="basics"><span class="big-gi">⛳</span><span class="bc-b"><b>Golf basics</b><small>Start here: aiming, power, spin, putting and the swish.</small></span>' +
        (dn ? '<span class="tut-ok" aria-label="Completed">' + ic('check') + '</span>' : ic('next')) + '</button>';
    }
    tutorialGroups().forEach((g) => {
      const nd = g.gimmicks.filter((t) => Pg.tutorialDone(t)).length;
      html += section(esc(g.name) + ' <small>' + nd + '/' + g.gimmicks.length + '</small>', '<div class="tut-grid">' + g.gimmicks.map((t) => {
        const has = !!Pg.tutorialHole(t), dn = Pg.tutorialDone(t);
        return '<button class="tut' + (dn ? ' done' : '') + (has ? '' : ' na') + '" data-act="tut" data-t="' + esc(t) + '" title="' + esc(gimDesc(t)) + '"><span class="gi">' + gimIcon(t) + '</span><span class="tut-n">' + esc(gimName(t)) + '</span>' +
          (dn ? '<span class="tut-ok" aria-label="Completed">' + ic('check') + '</span>' : '') + '</button>';
      }).join('') + '</div>');
    });
    html += '</div>';
    render(html, 'list');
    keepScroll(args);
    on({
      back: () => show(args.ret || 'title', args.retArgs),
      practice: () => { click(); show('practice'); },
      tut: (d) => { if (!G.Progress.tutorialHole(d.t)) { toast(G.Progress.hasTutorials() ? 'No tutorial for this gimmick yet' : 'Tutorials coming soon', 'info'); return; } click(); App().startTutorial(d.t, { ret: { screen: 'tutorials', args: Object.assign({}, args, { scroll: scr().scrollTop }) } }); },
    });
  };
  // offered once before a course's first round
  function offered(t) { return (G.Store.get('tutOffered', []) || []).indexOf(t) >= 0; }
  function offerMark(t) { const o = G.Store.get('tutOffered', []) || []; if (o.indexOf(t) < 0) { o.push(t); G.Store.set('tutOffered', o); } }
  SCREENS.tutOffer = function (args) {
    const t = args.type, info = gimInfo(t);
    render('<div class="center-col"><div class="card pop"><div class="card-k">' + ic('grad') + 'New gimmick</div>' +
      '<div class="ic-ic big-gi">' + gimIcon(t) + '</div><h2 class="ttl">' + esc(info.name || gimName(t)) + '</h2>' +
      (info.desc && t !== 'basics' ? '<div class="sub">' + esc(info.desc) + '</div>' : '') +
      '<div class="sub">' + (t === 'basics' ? 'New to Stick Golf? Play a quick practice hole that walks you through the controls. Unlimited strokes.' : 'Try a quick tutorial hole first? Unlimited strokes, and it unlocks this gimmick in Endless.') + '</div>' +
      '<div class="menu"><button class="btn big primary" data-act="tut">' + ic('grad') + 'Play the tutorial</button>' +
      '<button class="btn big ghost" data-act="skip">' + (args.first ? 'Skip for now' : 'Skip — start the round') + ic('next') + '</button></div></div></div>', 'dim');
    on({
      tut: () => { click(); App().startTutorial(t, args.first ? { ret: { screen: 'title' }, then: { id: 'c01', round: 'all' } } : { ret: { screen: 'course', args: { id: args.id, round: args.round } }, then: { id: args.id, round: args.round, remix: args.remix } }); },
      skip: () => { click(); if (args.first) show('title'); else if (args.remix) App().startRemix(args.id, args.round); else App().startCourse(args.id, args.start || 0, args.round); },
      back: () => (args.first ? show('title') : show('course', { id: args.id })),
    });
  };
  SCREENS.tutorialDone = function (args) {
    const run = App().run, t = run && run.tutorial, info = gimInfo(t), o = (run && run.opts) || {};
    const next = (() => { const all = allGimmicksList(), i = all.indexOf(t); for (let k = 1; k <= all.length; k++) { const g = all[(i + k) % all.length]; if (G.Progress.tutorialHole(g) && !G.Progress.tutorialDone(g)) return g; } return null; })();
    render('<div class="center-col"><div class="card pop"><div class="card-k">' + ic('grad') + 'Tutorial</div>' +
      '<div class="hd-label birdie">Tutorial complete!</div>' +
      '<div class="ic-ic big-gi">' + gimIcon(t) + '</div><h2 class="ttl">' + esc(info.name || gimName(t)) + '</h2>' +
      scoreTiles([['Strokes', args.res.strokes], ['Par', args.res.par], ['Time', fmtTime(args.time)]]) +
      '<div class="badges">' + (t === 'basics' ? '<span class="badge">' + ic('check') + 'Controls mastered — course 1 awaits</span>' : args.first ? '<span class="badge">' + ic('infinity') + 'Now unlocked in Endless</span>' : '<span class="badge">' + ic('check') + 'Already completed</span>') + '</div>' +
      '<div class="menu">' + (o.then ? '<button class="btn big primary" data-act="then">' + ic('play') + 'Start the round</button>' : '') +
      (next && !o.then ? '<button class="btn big primary" data-act="next">Next tutorial: ' + esc(gimName(next)) + ic('next') + '</button>' : '') +
      '<div class="menu-2"><button class="btn" data-act="again">' + ic('replay') + 'Play again</button><button class="btn ghost" data-act="done">' + ic('back') + 'Back</button></div></div></div></div>', 'dim');
    on({
      then: () => { click(); const th = o.then; G.UI.setCoach(null); if (th.remix) App().startRemix(th.id, th.round); else App().startCourse(th.id, 0, th.round); },
      next: () => { click(); App().startTutorial(next, o); },
      again: () => { click(); App().replayRun(); },
      done: () => { click(); App().quitToMenu(); }, back: () => App().quitToMenu(),
    });
  };

  // ----- practice -----
  SCREENS.practice = function (args) {
    const Pg = G.Progress, list = Pg.courses().filter((c) => Pg.unlocked(c) && Pg.baked(c.id));
    let html = topbar('Practice', 'Play any hole — nothing is recorded', { right: iconBtn('tuts', 'grad', 'Tutorials') }) + '<div class="page">';
    html += '<div class="note">' + ic('target') + 'Unlimited strokes and restarts, plus a “Show me” ghost of the bot\'s solution. Practice holes count toward the Range Rat achievement only.</div>';
    html += '<div class="panel prac-tut" role="button" tabindex="0" data-act="tuts"><span class="tile-ic">' + ic('grad') + '</span><div><b>Gimmick tutorials</b><small>' + esc(tutTxt()) + '</small></div>' + ic('next') + '</div>';
    if (!list.length) html += '<div class="empty small">No courses unlocked yet.</div>';
    html += '<div class="cgrid">' + list.map((c, k) => '<div class="ccard" role="button" tabindex="0" data-act="pc" data-id="' + esc(c.id) + '" style="--d:' + Math.min(0.4, k * 0.015) + 's"><div class="cc-art">' + swatch(c) + '<span class="cc-num">' + Pg.courseNumber(c) + '</span></div>' +
      '<div class="cc-body"><div class="cc-name">' + esc(c.name) + '</div><div class="cc-gim">' + gimBadge(courseGim(c)) + '</div></div></div>').join('') + '</div></div>';
    render(html, 'list');
    keepScroll(args);
    on({ back: () => show(args.ret || 'title'), tuts: () => { click(); show('tutorials', { ret: 'practice' }); }, pc: (d) => { click(); show('practiceCourse', { id: d.id }); } });
  };
  SCREENS.practiceCourse = function (args) {
    const Pg = G.Progress, c = Pg.def(args.id);
    if (!c) { show('practice'); return; }
    const pars = Pg.pars(c.id) || [], names = (G.BAKED && G.BAKED[c.id] && G.BAKED[c.id].names) || [];
    const N = Pg.holeCount(c.id);
    let html = topbar('#' + Pg.courseNumber(c) + ' ' + c.name, 'Practice · pick a hole') + '<div class="page">';
    if (courseGim(c) && Pg.tutorialHole(courseGim(c))) html += '<button class="btn" data-act="tut">' + ic('grad') + 'Tutorial: ' + esc(gimName(courseGim(c))) + (Pg.tutorialDone(courseGim(c)) ? ' ' + ic('check') : '') + '</button>';
    html += '<div class="hole-grid">';
    for (let i = 0; i < N; i++) {
      const r = Pg.holeRec(c.id, i);
      html += '<button class="hg" data-act="hole" data-i="' + i + '"><canvas class="hg-cv" data-i="' + i + '"></canvas><span class="hg-b"><b>' + (i + 1) + '</b><span class="hg-n">' + esc(names[i] || 'Hole ' + (i + 1)) + '</span><small>Par ' + (pars[i] || '?') + (r ? ' · best ' + r.b : '') + '</small></span></button>';
    }
    html += '</div></div>';
    render(html, 'list');
    keepScroll(args);
    const sc = scr();
    // thumbnails once the course data is loaded
    Pg.loadCourse(c.id, (holes) => {
      if (!holes || !sc.isConnected || !G.Render || !G.Render.drawPreview) return;
      const theme = G.Run.themeFor(holes[0], c);
      const cvs = [...sc.querySelectorAll('canvas.hg-cv')];
      let k = 0;
      const step = () => { // a few per frame to keep the UI responsive
        const t0 = performance.now();
        while (k < cvs.length && performance.now() - t0 < 12) {
          const cv = cvs[k++], h = holes[+cv.dataset.i]; if (!h) continue;
          const w = cv.clientWidth || 160, hh = cv.clientHeight || 90, d = DPR();
          cv.width = Math.round(w * d); cv.height = Math.round(hh * d);
          const ctx = cv.getContext('2d'); ctx.setTransform(d, 0, 0, d, 0, 0);
          try { G.Render.drawPreview(ctx, h, G.Run.themeFor(h, theme), w, hh); } catch (e) { /* preview optional */ }
        }
        if (k < cvs.length && sc.isConnected) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    });
    on({
      back: () => show('practice'),
      tut: () => { click(); App().startTutorial(courseGim(c), { ret: { screen: 'practiceCourse', args: { id: c.id } } }); },
      hole: (d) => { click(); App().startPractice(c.id, +d.i); },
    });
  };
  SCREENS.practiceDone = function (args) {
    const run = App().run, r = args.res;
    const lbl = G.Modes.scoreLabel(args.score, r.par);
    const N = run.courseHoles || 18, i = run.offset || 0;
    render('<div class="center-col"><div class="card pop"><div class="card-k">' + ic('target') + 'Practice · ' + esc(args.name || '') + '</div>' +
      '<div class="hd-label ' + lbl.cls + '">' + esc(lbl.text) + '</div>' +
      scoreTiles([['Strokes', r.strokes], ['Par', r.par], ['Time', fmtTime(args.time)]]) +
      '<div class="note">' + ic('check') + 'Practice — nothing recorded except your practice count (' + (G.Store.getStats().practice || 0) + ').</div>' +
      '<div class="menu"><button class="btn big primary" data-act="again">' + ic('replay') + 'Again</button>' +
      '<div class="menu-2">' + (i > 0 ? '<button class="btn" data-act="prev">' + ic('back') + 'Hole ' + i + '</button>' : '') +
      (i < N - 1 ? '<button class="btn" data-act="next">Hole ' + (i + 2) + ic('next') + '</button>' : '') +
      '<button class="btn ghost" data-act="list">' + ic('grid') + 'Holes</button></div></div></div></div>', 'dim');
    on({
      again: () => { click(); App().startPractice(run.courseId, i); },
      prev: () => { click(); App().startPractice(run.courseId, i - 1); },
      next: () => { click(); App().startPractice(run.courseId, i + 1); },
      list: () => { click(); App().quitToMenu(); }, back: () => App().quitToMenu(),
    });
  };

  SCREENS.title = function () {
    const Pg = G.Progress;
    const nc = nextCourse(), nNew = Pg.newCount ? Pg.newCount() : 0;
    const tile = (to, icon, label, sub, i, badge) => '<button class="tile" style="--d:' + (0.18 + i * 0.05) + 's" data-act="go" data-to="' + to + '"><span class="tile-ic">' + ic(icon) + '</span><span class="tile-l">' + label + '</span>' + (sub ? '<span class="tile-s">' + sub + '</span>' : '') + (badge ? '<span class="dot-badge">' + badge + '</span>' : '') + '</button>';
    const cleared = Pg.clearedCount ? Pg.clearedCount() : Pg.completedCount();
    render(
      '<div class="title-wrap">' + logoHtml() +
        '<div class="tagline">' + (Pg.courses().length || 60) + ' courses · ' + (allGimmicksList().length || 59) + ' gimmicks · infinite holes</div>' +
        '<div class="tmenu">' +
          '<button class="tile hero" style="--d:.1s" data-act="go" data-to="courses"><span class="tile-ic">' + ic('play') + '</span><span class="hero-b"><span class="tile-l">Play courses</span>' +
            '<span class="tile-s">' + (nc ? 'Up next: #' + Pg.courseNumber(nc) + ' ' + esc(nc.name) : cleared + ' courses cleared') + '</span></span><span class="hero-go">' + ic('next') + '</span></button>' +
          '<div class="tgrid">' +
            '<div class="tile-pair"><button class="tile mp-tile" style="--d:.14s" data-act="go" data-to="mpSetup"><span class="tile-ic">' + ic('users') + '</span><span class="mp-tile-b"><span class="tile-l">Multiplayer</span><span class="tile-s">Pass &amp; play · 2–4 players</span></span></button>' +
            '<button class="tile mp-tile ed-tile" style="--d:.16s" data-act="go" data-to="editorHub"><span class="tile-ic">' + ic('edit') + '</span><span class="mp-tile-b"><span class="tile-l">Editor</span><span class="tile-s">' + (G.MyHoles ? G.MyHoles.summary() : 'Make &amp; share holes') + '</span></span></button></div>' +
            tile('endless', 'infinity', 'Endless', 'Survival run', 0) + tile('daily', 'calendar', 'Daily', streakTxt(), 1) +
            tile('random', 'dice', 'Random', 'Shareable seeds', 2) + tile('practice', 'target', 'Practice', 'Any hole, any time', 3) +
            tile('tutorials', 'grad', 'Tutorials', tutTxt(), 4) + tile('achievements', 'medal', 'Achievements', achTxt(), 5) +
            tile('locker', 'shirt', 'Locker', 'Cosmetics', 6, nNew ? nNew : '') +
            tile('stats', 'chart', 'Stats', 'Lifetime records', 7) + tile('settings', 'settings', 'Settings', 'Sound, feel & access', 8) +
          '</div>' +
        '</div>' +
        '<div class="title-foot">' + starPill() + diffChip() +
          '<button class="pill" data-act="mute" aria-label="Toggle sound">' + ic(G.Audio.isMuted() ? 'mute' : 'sound') + (G.Audio.isMuted() ? 'Muted' : 'Sound on') + '</button></div>' +
        (G._missing && G._missing.length ? '<div class="devnote">Missing modules: ' + esc(G._missing.join(', ')) + '</div>' : '') +
      '</div>', 'title');
    on({
      go: (d) => { click(); show(d.to); },
      mute: () => { App().toggleMute(); show('title'); },
      back: () => {},
    });
  };

  SCREENS.difficulty = function (args) {
    const cur = G.Store.getSettings().difficulty;
    render(
      (args.first ? '' : topbar('Difficulty', '', { noStars: true })) +
      '<div class="center-col">' +
        (args.first ? logoHtml(true) : '') +
        '<h2 class="ttl">' + (args.first ? 'Choose your difficulty' : 'Difficulty') + '</h2>' +
        '<div class="sub">You can change this any time in Settings.</div>' +
        '<div class="diff-grid">' + G.Modes.ORDER.map((id, i) => { const d = G.Modes.DIFFS[id]; return '<button class="dcard pop ' + id + (cur === id ? ' sel' : '') + '" style="animation-delay:' + (i * 0.06) + 's" data-act="pick" data-id="' + id + '"><span class="dic">' + diffIc(id) + '</span><span class="dn">' + d.name + '</span><span class="dd">' + esc(d.desc) + '</span>' + (cur === id ? '<span class="dsel">' + ic('check') + '</span>' : '') + '</button>'; }).join('') + '</div>' +
      '</div>', 'diff');
    on({
      pick: (d) => {
        click(); G.Store.saveSettings({ difficulty: d.id }); toast('Difficulty: ' + G.Modes.get(d.id).name, 'info');
        if (args.first && G.Progress.tutorialHole('basics') && !G.Progress.tutorialDone('basics')) { offerMark('basics'); show('tutOffer', { type: 'basics', first: true }); return; }
        show(args.ret || 'title', args.retArgs);
      },
      back: () => { show(args.ret || 'title', args.retArgs); },
      settings: () => {},
    });
  };

  SCREENS.courses = function (args) {
    const Pg = G.Progress, list = Pg.courses();
    if (!list.length) { render(topbar('Courses') + '<div class="empty">No course manifest loaded yet.<br><small>(src/manifest.js missing)</small><br><br><button class="btn" data-act="dev">Play dev test hole</button></div>', 'list'); on({ back: () => show('title'), dev: () => App().startDev() }); return; }
    const cleared = Pg.clearedCount ? Pg.clearedCount() : Pg.completedCount();
    let html = topbar('Courses', cleared + '/' + list.length + ' cleared', { right: diffChip() });
    const anyBaked = list.some((c) => Pg.baked(c.id));
    html += '<div class="page">';
    html += '<div class="prog-strip"><div class="ps-bar"><i style="width:' + (cleared / list.length * 100).toFixed(1) + '%"></i></div><span>' + Math.round(cleared / list.length * 100) + '% of the tour cleared</span></div>';
    if (!anyBaked) html += '<div class="empty small">No courses baked yet. Try Endless, Daily or Random.</div>';
    let nextId = null;
    html += '<div class="cgrid">';
    if (Pg.tutorialHole('basics')) {
      const dn = Pg.tutorialDone('basics');
      html += '<div class="ccard basics-cc' + (dn ? ' done' : ' next') + '" role="button" tabindex="0" data-act="basics" id="cc-basics"><div class="cc-art basics-art"><span class="big-gi">⛳</span>' +
        (dn ? '<span class="cc-done" title="Completed">' + ic('check') + '</span>' : '<span class="cc-next">Start here</span>') + '</div>' +
        '<div class="cc-body"><div class="cc-name">Basics tutorial</div><div class="cc-gim"><span class="gbadge plain">' + ic('grad') + 'Learn the controls</span></div>' +
        '<div class="cc-foot"><span class="dim">1 hole · unlimited strokes</span></div></div></div>';
    }
    list.forEach((c, k) => {
      const info = Pg.courseInfo(c.id), unl = Pg.unlocked(c), bk = Pg.baked(c.id), gt = courseGim(c);
      if (!nextId && unl && bk && !info.cleared) nextId = c.id;
      const num = Pg.courseNumber(c) || k + 1;
      const br = info.bestRound || {};
      const best = br.all !== undefined ? '<span class="cc-best"><small>Best</small> ' + br.all + ' ' + relTag(br.all, info.par) + '</span>'
        : br.front !== undefined ? '<span class="cc-best"><small>Front</small> ' + br.front + ' ' + relTag(br.front, info.front.par) + '</span>'
        : '<span class="cc-best dim"><small>Par</small> ' + info.par + '</span>';
      const isNext = nextId === c.id;
      html += '<div class="ccard' + (unl ? '' : ' locked') + (bk ? '' : ' unbaked') + (info.cleared ? ' done' : '') + (isNext ? ' next' : '') + '" role="button" tabindex="0" data-act="course" data-id="' + esc(c.id) + '" id="cc-' + esc(c.id) + '" style="--d:' + Math.min(0.4, k * 0.015) + 's">' +
        '<div class="cc-art">' + swatch(c) + '<span class="cc-num">' + num + '</span>' +
          (info.cleared ? '<span class="cc-done" title="Cleared under par">' + ic('check') + '</span>' : isNext ? '<span class="cc-next">Up next</span>' : '') +
          (!unl ? '<span class="cc-lockic">' + ic('lock') + '</span>' : '') + '</div>' +
        '<div class="cc-body"><div class="cc-name">' + esc(c.name || c.id) + '</div>' +
          '<div class="cc-gim">' + gimBadge(gt) + '</div>' +
          (unl ? '<div class="cc-foot"><span class="cc-stars">' + ic('star') + info.stars + '<small>/' + info.maxStars + '</small></span>' + best + '</div>'
            : '<div class="cc-lock">' + ic('lock') + '<span>' + esc(Pg.unlockText(c)) + '</span></div>') +
          (unl && !bk ? '<div class="cc-lock nb">Not baked yet</div>' : '') +
        '</div></div>';
    });
    html += '</div></div>';
    render(html, 'list');
    const target = (args && args.focus) || nextId;
    if (target) { const el = root.querySelector('.screen:not(.leaving) #cc-' + CSS.escape(target)); if (el) { const s = scr(); const top = el.offsetTop - s.clientHeight / 2 + el.offsetHeight / 2; if (top > 60) s.scrollTop = top; } }
    on({
      back: () => show('title'),
      basics: () => { click(); App().startTutorial('basics', { ret: { screen: 'courses', args: { focus: 'basics' } } }); },
      course: (d) => {
        const c = G.Progress.def(d.id);
        if (!G.Progress.unlocked(c)) { A().sfx('uiback'); toast('Locked: ' + G.Progress.unlockText(c), 'warn'); return; }
        click(); show('course', { id: d.id });
      },
    });
  };

  // golf scorecard notation: circle = birdie, double circle = eagle+, square = bogey, double square = double bogey+
  const scv = (v, cls, title) => '<span class="scv ' + cls + '"' + (title ? ' title="' + esc(title) + '"' : '') + '>' + v + '</span>';
  // Course scorecard of personal bests: par + best score per hole, Out / In / Tot, plus best rounds.
  function bestCardHtml(id, info, pars, rng) {
    const Pg = G.Progress, N = info.holes, br = info.bestRound || {};
    let h1 = '<tr><th>Hole</th>', h2 = '<tr class="par-row"><th>Par</th>', h3 = '<tr><th>Best</th>';
    let np = 0, nb = 0, nOk = true, tp = 0, tb = 0, tOk = true;
    const sub = (label) => {
      h1 += '<th class="sum">' + label + '</th>'; h2 += '<td class="sum">' + np + '</td>';
      h3 += '<td class="sum"><b>' + (nOk ? nb : '–') + '</b></td>';
      np = 0; nb = 0; nOk = true;
    };
    for (let i = 0; i < N; i++) {
      const r = Pg.holeRec(id, i), par = r && r.p ? r.p : pars && pars[i] ? pars[i] : 0;
      const cl = rng && i >= rng[0] && i < rng[1] ? 'inr' : 'outr';
      h1 += '<td class="' + cl + '">' + (i + 1) + '</td>';
      h2 += '<td class="' + cl + '">' + par + '</td>';
      np += par; tp += par;
      if (r) { nb += r.b; tb += r.b; h3 += '<td class="' + cl + '">' + scv(r.b, G.Modes.scoreLabel(r.b, par).cls) + '</td>'; }
      else { nOk = false; tOk = false; h3 += '<td class="' + cl + ' none">·</td>'; }
      if (i === 8 && N > 9) sub('Out');
    }
    sub(N > 9 ? 'In' : 'Out');
    if (N > 9) { h1 += '<th class="sum tot">Tot</th>'; h2 += '<td class="sum tot">' + tp + '</td>'; h3 += '<td class="sum tot"><b>' + (tOk ? tb : '–') + '</b></td>'; }
    h1 += '</tr>'; h2 += '</tr>'; h3 += '</tr>';
    const rb = (r, label, par) => '<div class="pb' + (br[r] !== undefined ? '' : ' empty') + '"><small>' + label + '</small><b>' + (br[r] !== undefined ? br[r] + ' ' + relTag(br[r], par) : '—') + '</b></div>';
    const pbs = N > 9
      ? rb('all', 'Best 18', info.par) + rb('front', 'Best front 9', info.front.par) + rb('back', 'Best back 9', info.back.par)
      : rb('front', 'Best round', info.front.par);
    return section(ic('card') + 'Scorecard <small>personal bests</small>',
      '<div class="scroll-x"><table class="scorecard bestcard">' + h1 + h2 + h3 + '</table></div><div class="pbs">' + pbs + '</div>' +
      '<div class="note">' + (info.cleared ? ic('check') + 'Finished under par — next course unlocked.' : ic('lock') + 'Finish an 18-hole round under par to unlock the next course.') + '</div>', { cls: 'sc-panel' });
  }

  SCREENS.course = function (args) {
    const Pg = G.Progress, c = Pg.def(args.id);
    if (!c) { show('courses'); return; }
    const info = Pg.courseInfo(c.id), pars = Pg.pars(c.id), gt = courseGim(c), num = Pg.courseNumber(c);
    const N = info.holes, rounds = Pg.roundsFor(c.id);
    const canRemix = !!(G.Generator && G.Generator.mirrorHole), remixOk = canRemix && Pg.remixAvailable(c.id);
    const remix = !!args.remix && remixOk;
    const br = remix ? Pg.remixBests(c.id) : (info.bestRound || {}), bt = Pg.bestTimes(c.id);
    const hasTut = !!(gt && Pg.tutorialHole(gt)), tutDone = gt && Pg.tutorialDone(gt);
    let round = args.round || G.Store.get('roundChoice', 'all');
    if (rounds.indexOf(round) < 0) round = rounds[0];
    const rng = Pg.roundRange(c.id, round) || [0, N];
    const roundPar = (r) => { const q = Pg.roundRange(c.id, r); return q ? (r === 'back' ? info.back.par : r === 'front' ? info.front.par : info.par) : 0; };
    const rdesc = { all: 'Full round', front: 'Easier half', back: 'Harder half' };
    let html = topbar((num ? '#' + num + ' ' : '') + (c.name || c.id), gt ? 'Introduces ' + esc(gimName(gt)) : 'Classic golf', { right: diffChip() });
    html += '<div class="page course-page"><div class="cd-grid">';
    html += '<div class="panel cd-hero">' + swatch(c, 'big') + '<div class="cd-hero-b">' +
      '<div class="cd-num">Course ' + num + ' of ' + Pg.courses().length + '</div><h2>' + esc(c.name || c.id) + '</h2>' +
      (c.concept ? '<p class="cd-concept">' + esc(c.concept) + '</p>' : '') +
      (gt ? '<div class="cd-gim"><div class="cd-gn"><span class="gi">' + gimIcon(gt) + '</span><b>' + esc(gimName(gt)) + '</b><span class="tag">New gimmick</span></div>' +
        (gimDesc(gt) ? '<div>' + esc(gimDesc(gt)) + '</div>' : '') + (gimTip(gt) ? '<div class="cd-tip"><b>Tip</b> ' + esc(gimTip(gt)) + '</div>' : '') +
        '<div class="cd-tut"><button class="btn sm' + (hasTut ? '' : ' disabled') + '" data-act="tut">' + ic('grad') + (hasTut ? 'Tutorial' : 'Tutorial coming soon') + (tutDone ? ' ' + ic('check') : '') + '</button>' +
        '<span class="dim">' + (tutDone ? 'Done · unlocked in Endless' : 'Unlocks it in Endless') + '</span></div></div>'
        : '<div class="cd-gim"><div>Just you, the ball and the cup. Drag back to aim, release to shoot, and use backspin/topspin on full shots.</div>' +
          (Pg.tutorialHole('basics') ? '<div class="cd-tut"><button class="btn sm" data-act="basics">' + ic('grad') + 'Basics tutorial' + (Pg.tutorialDone('basics') ? ' ' + ic('check') : '') + '</button><span class="dim">Learn the controls</span></div>' : '') + '</div>') +
      '<div class="cd-stats"><span>' + ic('star') + '<b>' + info.stars + '</b>/' + info.maxStars + '</span>' + (info.bonus ? '<span>Bonus <b>+' + info.bonus + '</b></span>' : '') +
        '<span>Par <b>' + info.par + '</b>' + (info.back ? ' <small>(' + info.front.par + ' + ' + info.back.par + ')</small>' : '') + '</span>' +
        (info.cleared ? '<span class="ok">' + ic('check') + 'Cleared</span>' : '') + '</div>' +
      '</div></div>';
    const modeSeg = canRemix ? '<div class="seg mode-seg"><button class="segb ' + (remix ? '' : 'on') + '" data-act="mode" data-v="0">' + ic('flag') + 'Normal</button>' +
      '<button class="segb ' + (remix ? 'on' : '') + (remixOk ? '' : ' locked') + '" data-act="mode" data-v="1" title="' + (remixOk ? 'Mirrored holes, tee on the right' : 'Clear this course under par to unlock Remix') + '">' + ic(remixOk ? 'mirror' : 'lock') + 'Remix</button></div>' : '';
    html += '<div class="panel cd-play' + (remix ? ' remix' : '') + '"><div class="panel-h"><h3>' + ic(remix ? 'mirror' : 'flag') + (remix ? 'Remix round' : 'Choose a round') + '</h3>' + modeSeg + '</div>' +
      (remix ? '<div class="note">' + ic('mirror') + 'Every hole mirrored — the tee is on the right. Separate personal bests.</div>' : '') + '<div class="rounds">' + rounds.map((r) => {
      const b2 = br[r], rp = roundPar(r), tm = bt[(remix ? 'rx-' : '') + r];
      return '<button class="rbtn ' + (r === round ? 'on' : '') + '" data-act="round" data-r="' + r + '"><span class="rb-n">' + esc(N <= 9 ? '9 holes' : Pg.ROUND_NAMES[r]) + '</span>' +
        '<span class="rb-d">' + (N <= 9 ? 'Par ' + rp : rdesc[r] + ' · Par ' + rp) + '</span><span class="rb-b">' + (b2 !== undefined ? 'Best ' + b2 + ' ' + relTag(b2, rp) : 'Not played') + '</span>' +
        (tm !== undefined ? '<span class="rb-t">' + ic('clock') + fmtTimeS(tm) + '</span>' : '') +
        (r === round ? '<span class="rb-chk">' + ic('check') + '</span>' : '') + '</button>';
    }).join('') + '</div>' +
      '<button class="btn big primary" data-act="play" data-i="-1">' + ic(remix ? 'mirror' : 'play') + (remix ? 'Play Remix ' : 'Play ') + esc(N <= 9 ? '' : Pg.ROUND_NAMES[round]) + '</button>' +
      '<div class="note">Holes are played in order. Hit the stroke limit and the hole is picked up.' + (canRemix && !remixOk ? ' Clear the course under par to unlock its Remix.' : '') + '</div></div>';
    html += '</div>';
    html += bestCardHtml(c.id, info, pars, rng);
    if (!Pg.baked(c.id)) html += '<div class="empty small">This course has not been baked yet.</div>';
    html += '</div>';
    render(html, 'list');
    keepScroll(args);
    on({
      back: () => show('courses', { focus: c.id }),
      round: (d) => { click(); G.Store.set('roundChoice', d.r); show('course', { id: c.id, round: d.r, remix, scroll: scr().scrollTop }); },
      mode: (d) => {
        if (d.v === '1' && !remixOk) { A().sfx('uiback'); toast('Clear this course under par to unlock its Remix', 'warn'); return; }
        click(); show('course', { id: c.id, round, remix: d.v === '1', scroll: scr().scrollTop });
      },
      tut: () => { if (!hasTut) { toast('Tutorials coming soon', 'info'); return; } click(); App().startTutorial(gt, { ret: { screen: 'course', args: { id: c.id, round, remix } } }); },
      basics: () => { click(); App().startTutorial('basics', { ret: { screen: 'course', args: { id: c.id, round, remix } } }); },
      // a round is always played in order from its first hole
      play: () => {
        if (!Pg.baked(c.id)) { toast('Course not baked yet', 'warn'); return; }
        click();
        // offer the gimmick tutorial once, before the course's first round
        const ot = gt || (num === 1 ? 'basics' : null);
        if (ot && Pg.tutorialHole(ot) && !Pg.tutorialDone(ot) && info.done === 0 && !offered(ot) && !remix) {
          offerMark(ot);
          show('tutOffer', { type: ot, id: c.id, round, start: rng[0], remix });
          return;
        }
        if (remix) App().startRemix(c.id, round); else App().startCourse(c.id, rng[0], round);
      },
    });
  };

  SCREENS.loading = function (args) {
    render('<div class="center-col loader"><div class="ball-spin"><i></i></div><h2 class="ttl" id="ld-t">' + esc(args.title || 'Loading…') + '</h2>' +
      '<div class="sub" id="ld-s">' + esc(args.sub || '') + '</div><div class="pbar"><div class="pfill" id="ld-p"></div></div>' +
      '<button class="btn ghost" data-act="cancel">' + ic('x') + 'Cancel</button></div>', 'loading');
    on({ cancel: () => App().quitToMenu(), back: () => App().quitToMenu() });
  };
  function loaderUpdate(st, label) {
    const t = $('#ld-t'), s = $('#ld-s'), p = $('#ld-p');
    if (!t) return;
    if (!st) { t.textContent = 'Loading…'; return; }
    t.textContent = st.phase === 'gen' ? 'Generating ' + (label || 'hole') + '…' : 'Verifying ' + (label || 'hole') + '…';
    s.textContent = st.attempt ? 'Attempt ' + (st.attempt + 1) + ' — making sure it is playable' : 'The bot is test-playing it';
    const f = st.prog ? st.prog : 1 - Math.exp(-st.elapsed / 2.5);
    p.style.width = Math.round(Math.min(0.97, f) * 100) + '%';
  }

  SCREENS.pause = function () {
    const s = App().session, run = App().run;
    const m = s ? s.mull.left : 0;
    const mp = !!(run && run.kind === 'multi' && run.mp);
    const ex = run ? (run.kind === 'course' ? (G.Progress.ROUND_NAMES[run.round] || '') : run.kind === 'endless' ? 'Endless' : mp ? 'Multiplayer' : run.kind === 'custom' ? (run.custom && run.custom.mode === 'shared' ? 'Shared hole' : 'Test play') : cap(run.kind)) : '';
    render('<div class="center-col"><div class="card pop pause-card"><div class="card-k">' + ic('pause') + 'Paused' + (mp ? ' · ' + esc(run.mp.players[run.mp.turn].name) + '\'s turn' : '') + '</div>' +
      (s ? '<h2 class="ttl">' + esc(s.hole.name) + '</h2><div class="kv-row"><span><small>Par</small><b>' + s.hole.par + '</b></span><span><small>Strokes</small><b>' + s.S.strokes + '</b></span>' + (ex ? '<span><small>Mode</small><b>' + esc(ex) + '</b></span>' : '') + '</div>' : '<h2 class="ttl">Paused</h2>') +
      '<div class="menu">' +
      '<button class="btn big primary" data-act="resume">' + ic('play') + 'Resume</button>' +
      (run && (run.kind === 'dev' || run.kind === 'practice' || run.kind === 'tutorial' || run.kind === 'custom') ? '<button class="btn big" data-act="restart">' + ic('replay') + 'Restart hole</button>' : '') +
      (s && (run.kind === 'practice' || run.kind === 'tutorial' || run.kind === 'custom') && s.hasBotHint() ? '<button class="btn big" data-act="showme">' + ic('bulb') + (s.botGhost ? 'Hide hint' : 'Show me') + '</button>' : '') +
      (run && run.kind === 'custom' && run.custom.mode === 'shared' ? '<button class="btn big" data-act="editcopy">' + ic('edit') + 'Edit a copy</button>' : '') +
      (m !== 0 ? '<button class="btn big ' + (s && s.canMulligan() ? '' : 'disabled') + '" data-act="mull">' + ic('undo') + 'Mulligan <small>' + (m === Infinity ? 'unlimited' : m + ' left') + '</small></button>' : '') +
      (run && (mp || (run.kind !== 'endless' && run.kind !== 'custom' && run.scores.length)) ? '<button class="btn big" data-act="card">' + ic('card') + 'Scorecard</button>' : '') +
      '<div class="menu-2"><button class="btn" data-act="settings">' + ic('settings') + 'Settings</button>' +
      '<button class="btn danger" data-act="quit">' + ic('home') + (run && (run.kind === 'practice' || run.kind === 'tutorial') ? 'Quit' : run && run.kind === 'custom' ? (run.custom.mode === 'test' ? 'Back to editor' : 'Quit') : mp ? 'Quit game' : 'Quit round') + '</button></div></div>' +
      '<div class="keys"><span><kbd>Drag</kbd> aim</span><span><kbd>←→↑↓</kbd><kbd>Space</kbd> shoot</span><span><kbd>B</kbd><kbd>T</kbd> spin</span><span><kbd>L</kbd> look</span><span><kbd>M</kbd> mute</span></div></div></div>', 'pause dim');
    on({
      resume: () => { click(); App().resume(); }, back: () => App().resume(),
      restart: () => { click(); App().resume(); App().restartHole(); },
      showme: () => { click(); App().resume(); App().showMe(); },
      editcopy: () => { click(); if (G.MyHoles) G.MyHoles.editRunCopy(); },
      mull: () => { click(); App().resume(); if (s && s.mulligan()) toast('Mulligan!', 'info'); },
      settings: () => { click(); show('settings', { ret: 'pause' }); },
      card: () => { click(); show(mp ? 'mpScorecard' : 'scorecard', { ret: 'pause' }); },
      quit: (d, el) => {
        if (!el.classList.contains('armed')) { el.classList.add('armed'); el.innerHTML = ic('home') + 'Tap again to quit'; A().sfx('uiback'); return; }
        click(); App().quitToMenu();
      },
    });
  };

  const sw = (on, act, extra) => '<button class="switch ' + (on ? 'on' : '') + '" role="switch" aria-checked="' + (on ? 'true' : 'false') + '" data-act="' + act + '"' + (extra || '') + '><i></i></button>';
  SCREENS.settings = function (args) {
    const st = G.Store.getSettings();
    const cur = st.difficulty || 'standard';
    const inPlay = !!App().session && args.ret === 'pause';
    let html = topbar('Settings', inPlay ? 'Paused' : '', { noStars: true }) + '<div class="page narrow">';
    html += section(ic('flag') + 'Difficulty', '<div class="seg-cards">' + G.Modes.ORDER.map((id) => '<button class="segc ' + id + (id === cur ? ' on' : '') + '" data-act="diff" data-id="' + id + '">' + diffIc(id) + '<span>' + G.Modes.DIFFS[id].name + '</span></button>').join('') + '</div>' +
      '<div class="note">' + esc(G.Modes.get(cur).desc) + (inPlay ? ' <em>Applies from the next hole.</em>' : '') + '</div>');
    html += section(ic('sound') + 'Audio',
      '<div class="srow"><div class="sl"><b>Sound effects</b><small>' + (st.mute ? 'Muted' : 'On') + ' · M toggles</small></div>' + sw(!st.mute, 'mute') + '</div>' +
      '<div class="srow"><div class="sl"><b>Volume</b><small class="vol-v">' + Math.round(st.sfxVol * 100) + '%</small></div><input type="range" min="0" max="1" step="0.05" value="' + st.sfxVol + '" data-in="sfx" style="--v:' + (st.sfxVol * 100) + '%"></div>' +
      '<div class="srow"><div class="sl"><b>' + ic('music') + ' Ambient music</b><small>Gentle generative pads, varies by course</small></div>' + sw(!!st.bgm, 'bgm') + '</div>' +
      (st.bgm ? '<div class="srow"><div class="sl"><b>Music volume</b><small class="bgm-v">' + Math.round(st.bgmVol * 100) + '%</small></div><input type="range" min="0" max="1" step="0.05" value="' + st.bgmVol + '" data-in="bgmv" style="--v:' + (st.bgmVol * 100) + '%"></div>' : ''));
    const rfx = G.Store.reducedFx();
    html += section(ic('phone') + 'Feel',
      '<div class="srow"><div class="sl"><b>Haptics</b><small>' + (G.Haptics && G.Haptics.supported ? 'Vibration on shots, bounces, holes and hazards' : 'Not supported on this device') + '</small></div>' + sw(st.haptics !== false && !!(G.Haptics && G.Haptics.supported), 'haptics', G.Haptics && G.Haptics.supported ? '' : ' disabled') + '</div>' +
      '<div class="srow"><div class="sl"><b>Ghost ball</b><small>Replays your previous shot while you aim</small></div>' + sw(st.ghost !== false, 'ghost') + '</div>' +
      '<div class="srow"><div class="sl"><b>Screen shake</b><small>' + (rfx ? 'Off while reduced effects is on' : 'Impacts, cannons, explosions') + '</small></div>' + sw(st.shake !== false && !rfx, 'shake', rfx ? ' disabled' : '') + '</div>');
    const sens = (name, label, v) => '<div class="srow"><div class="sl"><b>' + label + '</b><small class="sv-' + name + '">' + Math.round(v * 100) + '%</small></div><input type="range" min="0.5" max="2" step="0.05" value="' + v + '" data-in="' + name + '" style="--v:' + ((v - 0.5) / 1.5 * 100) + '%"></div>';
    html += section(ic('target') + 'Aiming',
      sens('sensTouch', 'Touch drag sensitivity', +st.sensTouch || 1) + sens('sensMouse', 'Mouse drag sensitivity', +st.sensMouse || 1) +
      '<div class="srow"><div class="sl"><b>Precision putting</b><small>On the green the drag covers 0–40% power (with a scale); drag further for more</small></div>' + sw(st.precisionPutt !== false, 'precise') + '</div>');
    html += section(ic('access') + 'Accessibility',
      '<div class="srow"><div class="sl"><b>Color-blind mode</b><small>Safer colors plus patterns and shapes for hazards and scores</small></div>' + sw(!!st.colorblind, 'cb') + '</div>' +
      '<div class="srow"><div class="sl"><b>Reduced effects</b><small>No shake, fewer particles and animations' + (st.reducedFx === null || st.reducedFx === undefined ? ' · following your system setting' : '') + '</small></div>' + sw(rfx, 'rfx') + '</div>' +
      '<div class="srow"><div class="sl"><b>Larger touch targets</b><small>Bigger HUD buttons and controls</small></div>' + sw(!!st.bigTouch, 'bigt') + '</div>' +
      '<div class="srow"><div class="sl"><b>High-contrast UI</b><small>Solid panels, stronger outlines and text</small></div>' + sw(!!st.highContrast, 'hc') + '</div>');
    html += section(ic('target') + 'Controls', '<div class="ctl-list">' +
      [['Drag back', 'Aim + power (slingshot); drag to the start to cancel'], ['R', 'Restart hole (practice & tutorials)'], ['← → / A D', 'Angle'], ['↑ ↓ / W S', 'Power (Shift = fine)'], ['Space', 'Shoot'], ['B / T / wheel', 'More backspin / topspin (full shots only)'], ['L / right-drag', 'Look around; wheel or pinch zooms'], ['Esc / P', 'Pause'], ['M', 'Mute']]
        .map((r) => '<div class="ctl"><kbd>' + esc(r[0]) + '</kbd><span>' + esc(r[1]) + '</span></div>').join('') + '</div>' +
      '<div class="note">Rounds play straight through: no hole restarts. Hitting the stroke limit picks the hole up and moves on.</div>');
    html += section(ic('trash') + 'Data', '<div class="srow"><div class="sl"><b>Reset all progress</b><small>Stars, bests, stats, tutorials, achievements and unlocks</small></div><button class="btn danger sm" data-act="reset">Reset</button></div>');
    html += '</div>';
    render(html, 'list');
    keepScroll(args);
    const back = () => show(args.ret || 'title', args.retArgs);
    let resetArm = false;
    const re = () => show('settings', Object.assign({}, args, { scroll: scr().scrollTop }));
    on({
      back,
      diff: (d) => { click(); G.Store.saveSettings({ difficulty: d.id }); re(); },
      mute: () => { App().toggleMute(); re(); },
      shake: () => { click(); G.Store.saveSettings({ shake: st.shake === false }); re(); },
      bgm: () => { click(); G.Store.saveSettings({ bgm: !st.bgm }); App().applyAudio(); re(); },
      haptics: () => { click(); G.Store.saveSettings({ haptics: st.haptics === false }); if (st.haptics !== false && G.Haptics) G.Haptics.buzz('shot'); re(); },
      ghost: () => { click(); G.Store.saveSettings({ ghost: st.ghost === false }); re(); },
      precise: () => { click(); G.Store.saveSettings({ precisionPutt: st.precisionPutt === false }); re(); },
      cb: () => { click(); G.Store.saveSettings({ colorblind: !st.colorblind }); App().applyA11y(); re(); },
      rfx: () => { click(); G.Store.saveSettings({ reducedFx: !G.Store.reducedFx() }); App().applyA11y(); re(); },
      bigt: () => { click(); G.Store.saveSettings({ bigTouch: !st.bigTouch }); App().applyA11y(); re(); },
      hc: () => { click(); G.Store.saveSettings({ highContrast: !st.highContrast }); App().applyA11y(); re(); },
      'in:bgmv': (el) => { G.Store.saveSettings({ bgmVol: +el.value }); el.style.setProperty('--v', (el.value * 100) + '%'); const v = scr().querySelector('.bgm-v'); if (v) v.textContent = Math.round(el.value * 100) + '%'; App().applyAudio(); },
      'in:sensTouch': (el) => { G.Store.saveSettings({ sensTouch: +el.value }); el.style.setProperty('--v', ((el.value - 0.5) / 1.5 * 100) + '%'); const v = scr().querySelector('.sv-sensTouch'); if (v) v.textContent = Math.round(el.value * 100) + '%'; },
      'in:sensMouse': (el) => { G.Store.saveSettings({ sensMouse: +el.value }); el.style.setProperty('--v', ((el.value - 0.5) / 1.5 * 100) + '%'); const v = scr().querySelector('.sv-sensMouse'); if (v) v.textContent = Math.round(el.value * 100) + '%'; },
      reset: (d, el) => {
        if (!resetArm) { resetArm = true; el.textContent = 'Tap again to confirm'; el.classList.add('armed'); return; }
        G.Progress.resetAll(); G.Store.del('seenUnlocks'); toast('Progress reset', 'warn'); re();
      },
      'in:sfx': (el) => { G.Store.saveSettings({ sfxVol: +el.value }); el.style.setProperty('--v', (el.value * 100) + '%'); const v = root.querySelector('.screen:not(.leaving) .vol-v'); if (v) v.textContent = Math.round(el.value * 100) + '%'; App().applyAudio(); if (G.Audio) G.Audio.sfx('tick'); },
      settings: () => {},
    });
  };

  // ----- locker -----
  const RAR_NAME = { common: 'Common', rare: 'Rare', epic: 'Epic', legendary: 'Legendary' };
  SCREENS.locker = function (args) {
    const Pg = G.Progress;
    const groups = Pg.cosmeticsState();
    const eq = Pg.equipped();
    const tot = groups.reduce((a, g) => a + g.items.length, 0), got = groups.reduce((a, g) => a + g.items.filter((x) => x.ok).length, 0);
    let html = topbar('Locker', got + '/' + tot + ' unlocked', { right: iconBtn('stats', 'chart', 'Stats') });
    if (!groups.some((g) => g.items.length)) { render(html + '<div class="empty">No cosmetics available (renderer not loaded).</div>', 'list'); on({ back: () => show(args.ret || 'title'), stats: () => show('stats', { ret: 'locker' }) }); return; }
    const g = groups.find((x) => x.cat.key === args.tab) || groups[0];
    const tab = g.cat.key;
    const sel0 = args.sel && g.items.find((x) => x.item.id === args.sel) ? args.sel : eq[g.cat.slot];
    html += '<div class="page wide locker">';
    html += '<div class="lk-tabs" role="tablist">' + groups.map((x) => {
      const n = x.items.filter((y) => y.ok).length, nn = x.items.filter((y) => y.isNew).length;
      return '<button class="lk-tab ' + (x.cat.key === tab ? 'on' : '') + '" role="tab" data-act="tab" data-k="' + x.cat.key + '">' + cosCanvas(x.cat.key, eq[x.cat.slot] || (x.items[0] && x.items[0].item.id), 'lk-tab-cv', 8) +
        '<span class="lk-tab-n">' + esc(x.cat.name) + '</span><small>' + n + '/' + x.items.length + '</small>' + (nn ? '<span class="dot-badge">' + nn + '</span>' : '') + '</button>';
    }).join('') + '</div>';
    html += '<div class="lk-main"><div class="lk-stage panel"></div><div class="lk-grid">' + g.items.map((x, i) => {
      const it = x.item, isEq = eq[g.cat.slot] === it.id;
      return '<button class="lt r-' + x.rarity + (x.ok ? '' : ' locked') + (isEq ? ' eq' : '') + (it.id === sel0 ? ' sel' : '') + '" style="--d:' + Math.min(0.3, i * 0.02) + 's" data-act="pick" data-dbl="equipdbl" data-id="' + esc(it.id) + '" title="' + esc((it.name || it.id) + (x.ok ? '' : ' — ' + x.text)) + '">' +
        '<span class="lt-art">' + cosCanvas(tab, it.id, 'lt-cv') + (x.ok ? '' : '<span class="lt-lock">' + ic('lock') + '</span>') + '</span>' +
        '<span class="lt-name">' + esc(it.name || it.id) + '</span>' +
        (x.ok ? '<span class="lt-sub">' + (isEq ? ic('check') + 'Equipped' : RAR_NAME[x.rarity]) + '</span>'
          : '<span class="lt-prog"><span class="bar"><i style="width:' + Math.round(x.frac * 100) + '%"></i></span><small>' + esc(x.single ? (x.req.type === 'course' ? 'Course' : 'Achv.') : x.cur + '/' + x.need) + '</small></span>') +
        (x.isNew ? '<span class="lt-new">New</span>' : '') + '</button>';
    }).join('') + '</div></div></div>';
    render(html, 'list locker-screen');
    keepScroll(args);
    const sc = scr();
    const stage = sc.querySelector('.lk-stage');
    let selId = sel0;
    function drawStage() {
      const x = g.items.find((y) => y.item.id === selId) || g.items[0];
      if (!x) return;
      const it = x.item, isEq = eq[g.cat.slot] === it.id;
      anims = anims.filter((a) => !a.stage);
      stage.className = 'lk-stage panel r-' + x.rarity + (x.ok ? '' : ' locked');
      stage.innerHTML = '<div class="lk-view">' + cosCanvas(tab, it.id, 'lk-cv') + '<span class="rar-tag">' + RAR_NAME[x.rarity] + '</span></div>' +
        '<div class="lk-info"><div class="lk-cat">' + esc(g.cat.name.replace(/s$/, '')) + '</div><h2>' + esc(it.name || it.id) + '</h2>' +
        (it.desc ? '<p class="lk-desc">' + esc(it.desc) + '</p>' : '') +
        (x.ok ? (isEq ? '<button class="btn big eqd disabled">' + ic('check') + 'Equipped</button>' : '<button class="btn big primary" data-act="equip" data-id="' + esc(it.id) + '">Equip</button>')
          : '<div class="lk-req">' + ic('lock') + '<div><b>' + esc(x.text) + '</b>' + (!x.single ? '<div class="bar big"><i style="width:' + Math.round(x.frac * 100) + '%"></i></div><small>' + esc(x.prog) + '</small>' : '<small>' + esc(x.prog) + '</small>') + '</div></div>') +
        '</div>';
      const cv = stage.querySelector('canvas'); anims.push({ cv, cat: tab, item: it, fps: 60, last: -1, stage: true }); if (!animRaf) animRaf = requestAnimationFrame(animTick);
      if (x.isNew) { Pg.markSeen(tab, it.id); x.isNew = false; const b = sc.querySelector('.lt[data-id="' + CSS.escape(it.id) + '"] .lt-new'); if (b) b.remove(); }
    }
    drawStage();
    bindPreviews(sc.querySelector('.lk-grid'), tab, 12);
    bindPreviews(sc.querySelector('.lk-tabs'), tab, 6);
    const doEquip = (id) => {
      const x = g.items.find((y) => y.item.id === id);
      if (!x) return;
      if (!x.ok) { A().sfx('uiback'); toast('Locked: ' + x.text, 'warn'); return; }
      A().sfx('star', { i: 0 });
      Pg.equip(g.cat.slot, id); eq[g.cat.slot] = id;
      sc.querySelectorAll('.lt').forEach((el) => {
        const on = el.dataset.id === id, y = g.items.find((z) => z.item.id === el.dataset.id);
        el.classList.toggle('eq', on);
        const s2 = el.querySelector('.lt-sub'); if (s2 && y) s2.innerHTML = on ? ic('check') + 'Equipped' : RAR_NAME[y.rarity];
      });
      const tc = sc.querySelector('.lk-tab.on canvas'); if (tc) { const a = anims.find((z) => z.cv === tc); if (a) { a.item = x.item; a.last = -1; } }
      drawStage();
    };
    on({
      back: () => { show(args.ret || 'title', args.retArgs); },
      stats: () => { click(); show('stats', { ret: 'locker', retArgs: { tab } }); },
      tab: (d) => { if (d.k === tab) return; click(); show('locker', { tab: d.k, ret: args.ret, retArgs: args.retArgs }); },
      pick: (d) => {
        if (d.id === selId) { const x = g.items.find((y) => y.item.id === d.id); if (x && x.ok && eq[g.cat.slot] !== d.id) { doEquip(d.id); } return; }
        click(); selId = d.id;
        sc.querySelectorAll('.lt').forEach((el) => el.classList.toggle('sel', el.dataset.id === selId));
        drawStage();
        if (window.innerWidth < 760) stage.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      },
      equipdbl: (d) => doEquip(d.id),
      equip: (d) => doEquip(d.id),
    });
  };

  // ----- stats -----
  SCREENS.stats = function (args) {
    const Pg = G.Progress, s = Pg.stats(), list = Pg.courses();
    const nG = allGimmicksList().length || 59;
    const tile = (icon, v, l, cls) => '<div class="stat ' + (cls || '') + '"><span class="stat-ic">' + ic(icon) + '</span><b>' + v + '</b><small>' + l + '</small></div>';
    let html = topbar('Stats', 'Lifetime records', { right: iconBtn('locker', 'shirt', 'Locker') }) + '<div class="page">';
    html += '<div class="stat-hero">' +
      tile('star', s.stars, 'Total stars', 'gold') + tile('trophy', s.cleared + '<small>/' + list.length + '</small>', 'Courses cleared', 'green') +
      tile('flag', s.holes, 'Holes completed', 'blue') + tile('medal', s.rounds, 'Full 18-hole rounds', 'violet') + '</div>';
    html += section(ic('golf') + 'Scoring', '<div class="stat-grid">' +
      tile('swish', s.swishes, 'Swishes') + tile('target', s.aces, 'Holes-in-one') + tile('sparkle', s.birdies, 'Birdies or better') + tile('bolt', s.eagles, 'Eagles or better') +
      tile('check', s.pars, 'Par or better') + tile('golf', s.shots, 'Shots taken') + tile('x', s.pickups, 'Holes picked up') + tile('card', s.nines, 'Nine-hole rounds') + '</div>');
    html += section(ic('grid') + 'Modes', '<div class="stat-grid">' +
      tile('calendar', s.daily, 'Daily rounds') + tile('dice', s.randoms, 'Random courses') + tile('infinity', s.endless, 'Best Endless run (holes)') + tile('trophy', s.endlessScore, 'Best Endless score') +
      tile('replay', s.endlessRuns, 'Endless runs') + tile('sparkle', s.gimmicks + '<small>/' + nG + '</small>', 'Gimmicks discovered') + '</div>');
    // collection + next unlocks
    const groups = Pg.cosmeticsState();
    const tot = groups.reduce((a, g) => a + g.items.length, 0), got = groups.reduce((a, g) => a + g.items.filter((x) => x.ok).length, 0);
    html += section(ic('shirt') + 'Collection <small>' + got + '/' + tot + '</small>', '<div class="coll">' + groups.map((g) => {
      const n = g.items.filter((x) => x.ok).length;
      return '<div class="coll-r"><span>' + esc(g.cat.name) + '</span><span class="bar"><i style="width:' + (g.items.length ? n / g.items.length * 100 : 0).toFixed(1) + '%"></i></span><small>' + n + '/' + g.items.length + '</small></div>';
    }).join('') + '</div>');
    const locked = [];
    groups.forEach((g) => g.items.forEach((x) => { if (!x.ok) locked.push({ g, x }); }));
    locked.sort((a, b) => b.x.frac - a.x.frac);
    if (locked.length) {
      html += section(ic('medal') + 'Closest unlocks', '<div class="goals">' + locked.slice(0, 6).map(({ g, x }) =>
        '<button class="goal r-' + x.rarity + '" data-act="goal" data-k="' + g.cat.key + '" data-id="' + esc(x.item.id) + '"><span class="goal-cv">' + cosCanvas(g.cat.key, x.item.id, '', 10) + '</span><span class="goal-b"><b>' + esc(x.item.name || x.item.id) + '</b><small>' + esc(x.text) + '</small>' +
        '<span class="bar"><i style="width:' + Math.round(x.frac * 100) + '%"></i></span></span><span class="goal-p">' + esc(x.single ? '' : x.cur + '/' + x.need) + '</span></button>').join('') + '</div>');
    }
    html += '</div>';
    render(html, 'list');
    bindPreviews(scr(), null, 10);
    on({
      back: () => show(args.ret || 'title', args.retArgs),
      locker: () => { click(); show('locker', { ret: 'stats', retArgs: args }); },
      goal: (d) => { click(); show('locker', { tab: d.k, sel: d.id, ret: 'stats', retArgs: args }); },
    });
  };

  // ----- hole complete / fail -----
  function scoreTiles(list) { return '<div class="kv-row big">' + list.filter(Boolean).map((x) => '<span class="' + (x[2] || '') + '"><small>' + x[0] + '</small><b>' + x[1] + '</b></span>').join('') + '</div>'; }
  SCREENS.holeDone = function (args) {
    const r = args.res, run = App().run, last = args.last;
    const score = r.score !== undefined ? r.score : r.strokes, bonus = r.bonus || 0;
    const lbl = G.Modes.scoreLabel(score, r.par);
    const st = G.Modes.stars(score, r.par);
    const endless = run && run.kind === 'endless';
    const tp = run ? run.scores.reduce((a, s) => a + (s ? s.par : 0), 0) : 0;
    render('<div class="center-col"><div class="card pop holedone' + (endless ? '' : ' wide') + '">' +
      '<div class="card-k">' + esc(args.name || '') + '</div>' +
      '<div class="hd-label ' + lbl.cls + '">' + esc(lbl.text) + '</div>' +
      (endless ? '' : '<div class="hd-stars">' + [0, 1, 2].map((i) => '<span class="st big ' + (i < st ? 'on' : '') + '" style="animation-delay:' + (0.25 + i * 0.2) + 's">' + ic('star') + '</span>').join('') + '</div>') +
      scoreTiles([bonus ? ['Strokes', r.strokes] : null, bonus ? ['Swish', '−' + bonus, 'swb'] : null, [bonus ? 'Score' : 'Strokes', score], ['Par', r.par], r.time && !endless ? ['Time', fmtTime(r.time)] : null,
        [endless ? 'Run score' : 'Total', endless ? run.score : relPar(run.totalStrokes(), tp), endless ? '' : 'rel ' + relCls(run.totalStrokes(), tp)]]) +
      '<div class="badges">' + (args.newBest ? '<span class="badge">' + ic('trophy') + 'New best</span>' : '') +
      (r.swish ? '<span class="badge swish">' + ic('swish') + 'Swish — straight in, −' + bonus + '</span>' : '') +
      (endless && score < r.par ? '<span class="badge">Under-par bonus +' + (r.par - score) + '</span>' : '') + '</div>' +
      (!endless && run ? scorecardHtml(run) : '') +
      '<div class="menu row">' +
      '<button class="btn ghost" data-act="quit">' + ic('home') + 'Quit</button>' +
      '<button class="btn big primary grow" data-act="next">' + (last ? 'Finish round' : 'Next hole') + ic('next') + '</button></div></div></div>', 'dim');
    if (!endless) for (let i = 0; i < st; i++) setTimeout(() => G.Audio.sfx('star', { i }), 300 + i * 200);
    on({
      next: () => { click(); App().nextHole(); },
      quit: (d, el) => { if (!el.classList.contains('armed')) { el.classList.add('armed'); el.innerHTML = ic('home') + 'Quit round?'; return; } click(); App().quitToMenu(); }, back: () => {},
    });
  };

  // Stroke limit (or the flood) ends the hole: it is picked up and scored, and the round carries on.
  SCREENS.holeFail = function (args) {
    const s = App().session, run = App().run, r = args.res;
    const why = r.reason === 'flood'
      ? 'The rising tide swamped your ball.'
      : 'Stroke limit reached (' + (s && s.limit !== Infinity ? s.limit : r.strokes) + ' on a par ' + r.par + ').';
    render('<div class="center-col"><div class="card pop wide">' +
      '<div class="card-k">' + esc(args.name || '') + '</div>' +
      '<div class="hd-label fail">' + (r.reason === 'flood' ? 'Swamped!' : 'Picked up') + '</div>' +
      '<div class="sub">' + esc(why) + ' Scored <b>' + args.score + '</b> — on to the ' + (args.last ? 'clubhouse' : 'next tee') + '.</div>' +
      (run ? scorecardHtml(run) : '') +
      '<div class="menu row"><button class="btn ghost" data-act="quit">' + ic('home') + 'Quit</button><button class="btn big primary grow" data-act="next">' + (args.last ? 'Finish round' : 'Next hole') + ic('next') + '</button></div></div></div>', 'dim');
    on({
      next: () => { click(); App().nextHole(); },
      quit: (d, el) => { if (!el.classList.contains('armed')) { el.classList.add('armed'); el.innerHTML = ic('home') + 'Quit round?'; return; } click(); App().quitToMenu(); }, back: () => {},
    });
  };

  function scorecardHtml(run) {
    const n = Math.min(run.kind === 'course' ? 18 : 9, run.n), off = run.offset || 0;
    const course = run.kind === 'course';
    let h1 = '<tr><th>Hole</th>', h2 = '<tr class="par-row"><th>Par</th>', h3 = '<tr><th>Score</th>', h4 = '<tr class="time-row"><th>' + ic('clock') + '</th>';
    let tp = 0, ts = 0, np = 0, ns = 0, nt = 0, tt = 0;
    const timed = (run.times || []).some((x) => x > 0);
    const sub = (label) => { h1 += '<th class="sum">' + label + '</th>'; h2 += '<td class="sum">' + np + '</td>'; h3 += '<td class="sum"><b>' + ns + '</b></td>'; h4 += '<td class="sum">' + (nt ? fmtTimeS(nt) : '') + '</td>'; np = 0; ns = 0; nt = 0; };
    for (let i = 0; i < n; i++) {
      const hole = run.holes[i], s = run.scores[i], num = off + i + 1;
      const par = s ? s.par : hole ? hole.par : '';
      const curH = i === run.idx && !s;
      h1 += '<td' + (curH ? ' class="cur"' : '') + '>' + num + '</td>'; h2 += '<td>' + par + '</td>';
      if (s) {
        const sc = s.score !== undefined ? s.score : s.strokes;
        tp += s.par; ts += sc; np += s.par; ns += sc;
        const lb = G.Modes.scoreLabel(sc, s.par), cls = s.failed ? 'x' : lb.cls;
        h3 += '<td>' + scv(sc + (s.bonus ? '<sup class="swsup">−' + s.bonus + '</sup>' : ''), cls, (s.failed ? 'Picked up' : lb.text) + (s.bonus ? ' · ' + s.strokes + ' strokes, swish −' + s.bonus : '')) + '</td>';
        nt += s.time || 0; tt += s.time || 0;
        h4 += '<td>' + (s.time ? fmtTimeS(s.time) : '–') + '</td>';
      } else { h3 += '<td class="none">·</td>'; h4 += '<td class="none">·</td>'; }
      if (course && num === 9 && i < n - 1) sub('Out');
    }
    if (course) {
      const lastNum = off + n;
      if (off === 0 && lastNum <= 9) { h1 += '<th class="sum tot">Out</th>'; } else if (off >= 9) { h1 += '<th class="sum tot">In</th>'; } else { sub('In'); h1 += '<th class="sum tot">Tot</th>'; }
    } else h1 += '<th class="sum tot">Tot</th>';
    h1 += '</tr>'; h2 += '<td class="sum tot">' + tp + '</td></tr>'; h3 += '<td class="sum tot"><b>' + ts + '</b>' + (tp ? ' ' + relTag(ts, tp) : '') + '</td></tr>';
    h4 += '<td class="sum tot">' + (tt ? fmtTimeS(tt) : '') + '</td></tr>';
    return '<div class="scroll-x"><table class="scorecard">' + h1 + h2 + h3 + (timed ? h4 : '') + '</table></div>';
  }
  const LEGEND = '<div class="legend">' + scv(3, 'eagle') + 'eagle ' + scv(3, 'birdie') + 'birdie ' + scv(4, 'par') + 'par ' + scv(5, 'bogey') + 'bogey ' + scv(6, 'dbogey') + 'double+ ' + scv(7, 'x') + 'picked up</div>';
  SCREENS.scorecard = function (args) {
    const run = App().run;
    render('<div class="center-col"><div class="card pop wide"><div class="card-k">' + ic('card') + 'Scorecard</div><h2 class="ttl">' + esc(run && run.def ? run.def.name : '') + '</h2>' +
      (run ? scorecardHtml(run) : '') + LEGEND +
      '<div class="menu row"><button class="btn primary big grow" data-act="back">' + ic('back') + 'Back</button></div></div></div>', 'dim');
    on({ back: () => show(args.ret || 'pause', args.retArgs) });
  };

  function unlockStrip(items) {
    if (!items || !items.length) return '';
    return '<div class="unl"><div class="unl-h">' + ic('sparkle') + 'Unlocked this round</div><div class="unl-list">' + items.map((x) =>
      '<div class="unl-i r-' + (x.rarity || 'common') + '">' + cosCanvas(x.cat, x.id, '', 20) + '<span><b>' + esc(x.name) + '</b><small>' + esc(x.catName || '') + '</small></span></div>').join('') + '</div></div>';
  }
  SCREENS.courseDone = function (args) {
    const run = App().run;
    const ts = run.totalStrokes(), tp = run.scores.reduce((a, s) => a + (s ? s.par : 0), 0);
    const tb = run.totalBonus ? run.totalBonus() : 0;
    const d = ts - tp, birdies = run.scores.filter((s) => s && !s.failed && (s.score !== undefined ? s.score : s.strokes) < s.par).length;
    const items = (args.unlocks || []).filter((x) => x && typeof x === 'object');
    let badges = '';
    if (args.newBest) badges += '<span class="badge">' + ic('trophy') + 'New best round</span>';
    if (args.dailyBest) badges += '<span class="badge">' + ic('trophy') + 'New daily best</span>';
    if (args.bonus) badges += '<span class="badge">' + ic('star') + 'Completion bonus +' + args.bonus + '</span>';
    if (tb) badges += '<span class="badge swish">' + ic('swish') + tb + ' swish' + (tb > 1 ? 'es' : '') + ' · −' + tb + '</span>';
    if (args.fast) badges += '<span class="badge">' + ic('bolt') + 'Fast round</span>';
    if (args.newBestTime) badges += '<span class="badge">' + ic('clock') + 'New best time</span>';
    if (args.streak && args.streak.cur > 1) badges += '<span class="badge">' + ic('fire') + args.streak.cur + '-day streak</span>';
    const rn = args.round && G.Progress.ROUND_NAMES[args.round] ? G.Progress.ROUND_NAMES[args.round] : '';
    render('<div class="center-col"><div class="card pop wide result">' +
      '<div class="card-k">' + (args.remix ? ic('mirror') + 'Remix · ' : '') + esc(run.def ? run.def.name : '') + (rn ? ' · ' + esc(rn) : '') + '</div>' +
      '<div class="hd-label eagle">' + esc(args.title || 'Course complete!') + '</div>' +
      '<div class="res-big ' + relCls(ts, tp) + '"><b>' + relPar(ts, tp) + '</b><small>' + (d < 0 ? 'under par' : d > 0 ? 'over par' : 'level par') + '</small></div>' +
      scoreTiles([['Total', ts], ['Par', tp], args.stars !== undefined ? ['Stars', args.stars, 'gold'] : null, ['Birdies+', birdies], tb ? ['Swishes', tb, 'swb'] : null, args.time ? ['Time', fmtTimeS(args.time)] : null]) +
      (badges ? '<div class="badges">' + badges + '</div>' : '') +
      scorecardHtml(run) + (args.share ? shareCard(args.share) : '') + unlockStrip(items) +
      (args.code ? '<div class="code-row"><span>Course code</span><b class="code">' + esc(args.code) + '</b><button class="btn sm ghost" data-act="copy">' + ic('copy') + 'Copy</button></div>' : '') +
      '<div class="menu row">' + (args.replay !== false ? '<button class="btn ghost" data-act="replay">' + ic('replay') + 'Play again</button>' : '') +
      '<button class="btn big primary grow" data-act="done">Continue' + ic('next') + '</button></div></div></div>', 'dim');
    bindPreviews(scr(), null, 20);
    setTimeout(() => G.Audio.sfx('fanfare'), 200);
    on({
      replay: () => { click(); App().replayRun(); },
      copy: () => copyText(args.code),
      scopy: () => copyText(args.share, 'Share card copied'),
      sshare: () => shareNative(args.share),
      done: () => { click(); App().quitToMenu(args.after); }, back: () => App().quitToMenu(args.after),
    });
  };

  // ----- daily -----
  SCREENS.daily = function () {
    const date = App().today();
    const best = G.Progress.dailyBest(date);
    const ok = !!(G.Generator && G.Generator.dailyCourse);
    const hist = G.Progress.dailyHistory(), streak = G.Progress.dailyStreak();
    const bestEver = hist.reduce((b, h) => (!b || h.total - h.par < b.total - b.par ? h : b), null);
    const EM = { A: '🟪', B: '🟩', P: '⬜', O: '🟨', D: '🟥', X: '⬛' };
    const row = (codes) => (codes || []).map((c) => (EM[c.charAt(0)] || '⬜') + (c.indexOf('*') > 0 ? '✨' : '')).join('');
    const share = best && best.res ? App().shareText(date, best.total, best.par, best.res) : null;
    const pretty = (() => { try { return new Date(date + 'T12:00:00').toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' }); } catch (e) { return date; } })();
    let html = topbar('Daily', esc(pretty), { right: diffChip() }) + '<div class="page narrow">';
    html += '<div class="panel hero-panel"><div class="hp-ic cal">' + ic('calendar') + '<b>' + date.slice(8) + '</b></div>' +
      '<h2>Today\'s course</h2><p class="sub">A fresh 9-hole course every day — the same course for everyone.</p>' +
      (best ? '<div class="kv-row"><span><small>Today\'s best</small><b>' + best.total + '</b></span><span><small>vs par</small><b>' + relTag(best.total, best.par) + '</b></span></div>' : '<div class="chip-note">Not played yet today</div>') +
      (ok ? '<button class="btn big primary" data-act="play">' + ic('play') + (best ? 'Play again' : 'Play today\'s course') + '</button>' : '<div class="empty small">Generator not loaded.</div>') + '</div>';
    html += '<div class="stat-hero daily-stats"><div class="stat gold"><span class="stat-ic">' + ic('fire') + '</span><b>' + streak.cur + '</b><small>Day streak (under par)</small></div>' +
      '<div class="stat violet"><span class="stat-ic">' + ic('trophy') + '</span><b>' + streak.best + '</b><small>Best streak</small></div>' +
      '<div class="stat blue"><span class="stat-ic">' + ic('calendar') + '</span><b>' + hist.length + '</b><small>Days played</small></div>' +
      '<div class="stat green"><span class="stat-ic">' + ic('medal') + '</span><b>' + (bestEver ? relPar(bestEver.total, bestEver.par) : '–') + '</b><small>Best ever' + (bestEver ? ' · ' + esc(bestEver.date.slice(5)) : '') + '</small></div></div>';
    if (share) html += section(ic('share') + 'Today\'s card', shareCard(share));
    if (hist.length) html += section(ic('clock') + 'Your daily history', '<div class="lb dlb">' + hist.slice(0, 30).map((h) => '<div class="lbr' + (h.date === date ? ' hl' : '') + (bestEver && h.date === bestEver.date ? ' best' : '') + '"><span>' + esc(h.date) + '</span><span><b>' + h.total + '</b> ' + relTag(h.total, h.par) + '</span><span class="emo">' + row(h.res) + '</span><span class="dim">' + (h.time ? fmtTimeS(h.time) : '') + '</span></div>').join('') + '</div>');
    html += '</div>';
    render(html, 'list');
    on({ back: () => show('title'), play: () => { click(); App().startDaily(); }, scopy: () => copyText(share, 'Share card copied'), sshare: () => shareNative(share) });
  };

  // ----- random course -----
  SCREENS.random = function (args) {
    const R = G.RNG;
    let seed = args.seed !== undefined ? args.seed : Math.floor(Math.random() * 0x3fffffff);
    const ok = !!(G.Generator && G.Generator.randomCourse);
    render(topbar('Random Course', 'A seeded 9-hole course you can share', { right: diffChip() }) + '<div class="page narrow"><div class="panel hero-panel">' +
      '<div class="hp-ic">' + ic('dice') + '</div><h2>Course code</h2>' +
      '<div class="seedbox"><input class="seed" maxlength="12" value="' + R.seedToCode(seed) + '" data-in="code" spellcheck="false" autocomplete="off" aria-label="Course code">' +
      iconBtn('rand', 'dice', 'New random code') + iconBtn('copy', 'copy', 'Copy code') + '</div>' +
      '<p class="sub">Enter a friend\'s code to play exactly the same course.</p>' +
      (ok ? '<button class="btn big primary" data-act="play">' + ic('play') + 'Play</button>' : '<div class="empty small">Generator not loaded.</div>') +
      '</div></div>', 'list');
    on({
      back: () => show('title'),
      rand: () => { click(); show('random', { seed: Math.floor(Math.random() * 0x3fffffff) }); },
      copy: () => { const el = scr().querySelector('.seed'); copyText(el ? el.value.toUpperCase() : R.seedToCode(seed)); },
      'in:code': (el) => { seed = R.codeToSeed(el.value); },
      play: () => { click(); const el = scr().querySelector('.seed'); seed = R.codeToSeed(el.value); App().startRandom(seed); },
    });
  };
  function copyText(t, msg) {
    const ok = () => toast(msg || ('Copied ' + t), 'info');
    try { if (!navigator.clipboard || !window.isSecureContext) throw new Error('no clipboard'); navigator.clipboard.writeText(t).then(ok, () => fallbackCopy(t, msg)); } catch (e) { fallbackCopy(t, msg); }
  }
  function fallbackCopy(t, msg) {
    const ta = document.createElement('textarea'); ta.value = t; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0'; document.body.appendChild(ta); ta.select();
    let ok = false; try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
    if (ok) toast(msg || ('Copied ' + t), 'info'); else toast('Copy failed — select the text and copy it', 'warn', 3000);
    ta.remove();
  }
  function shareNative(t) {
    if (navigator.share) { navigator.share({ text: t }).catch(() => { /* cancelled */ }); return; }
    copyText(t, 'Share card copied');
  }
  function shareCard(text) {
    const lines = String(text).split('\n');
    return '<div class="share"><div class="share-h">' + ic('share') + 'Share your round</div><pre class="share-t" aria-label="Share text">' + esc(lines.slice(0, 2).join('\n')) + '\n<span class="dim">' + esc(lines.slice(2).join('\n')) + '</span></pre>' +
      '<div class="share-b"><button class="btn sm" data-act="scopy">' + ic('copy') + 'Copy</button>' + (navigator.share ? '<button class="btn sm primary" data-act="sshare">' + ic('share') + 'Share</button>' : '') + '</div></div>';
  }

  // ----- endless setup -----
  function presets() {
    const P = G.Generator && G.Generator.ENDLESS_PRESETS;
    if (!P) return [];
    const arr = Array.isArray(P) ? P : Object.keys(P).map((k) => Object.assign({ id: k }, P[k]));
    return arr.map((p) => ({ id: p.id || p.preset, name: p.name || cap(p.id || p.preset), desc: p.desc || '', settings: Object.assign({}, p.settings || p, { preset: p.id || p.preset }) }));
  }
  function allGimmicks() { return allGimmicksList(); }
  const gUnl = (g) => G.Progress.gimmickUnlocked(g);
  function cleanSettings(s) {
    const o = {
      preset: s.preset || 'custom', difficulty: +s.difficulty || 3, ramp: +s.ramp || 0,
      gimmicks: (s.gimmicks || []).filter((g) => (allGimmicks().indexOf(g) >= 0 || !allGimmicks().length) && gUnl(g)), surfaces: (s.surfaces || surfaceList().slice(0, 3)).filter((x) => surfaceList().indexOf(x) >= 0), styles: (s.styles || styleList().map((x) => x.id)).slice(),
      wind: +s.wind || 0, hazardDensity: s.hazardDensity === undefined ? 1 : +s.hazardDensity, strokeRule: s.strokeRule || 'par+2',
      seed: (s.seed >>> 0) || Math.floor(Math.random() * 0x3fffffff),
    };
    if (s.gimmicksPerHole) o.gimmicksPerHole = s.gimmicksPerHole;
    if (!o.surfaces.length) o.surfaces = surfaceList().slice(0, 1);
    return o;
  }
  function defaultEndless() {
    const ps = presets();
    const last = G.Store.get('endless.last', null);
    if (last) return cleanSettings(last);
    if (ps[0]) return cleanSettings(Object.assign({}, ps[0].settings, { seed: Math.floor(Math.random() * 0x3fffffff) }));
    return cleanSettings({ difficulty: 3, gimmicks: ['wind', 'pad', 'bumper'], surfaces: ['fairway', 'rough', 'sand'] });
  }
  const RAMPS = [['Off', 0], ['Slow', 0.15], ['Medium', 0.3], ['Fast', 0.6]];
  const RULES = ['par+1', 'par+2', 'par+3', 'unlimited'];
  const LEVELS = ['None', 'Light', 'Medium', 'Heavy'];
  const openPacks = new Set();
  SCREENS.endless = function (args) {
    const s = args.s ? cleanSettings(args.s) : defaultEndless();
    const ps = presets(), custom = G.Store.get('endless.presets', []) || [];
    const gset = new Set(s.gimmicks), sset = new Set(s.surfaces), yset = new Set(s.styles);
    const packs = ((G.Manifest && G.Manifest.PACKS) || []).filter((p) => p && Array.isArray(p.gimmicks));
    const ok = !!(G.Generator && G.Generator.endlessHole);
    const chip = (on, act, val, label, title) => '<button class="chip ' + (on ? 'on' : '') + '" data-act="' + act + '" data-v="' + esc(val) + '"' + (title ? ' title="' + esc(title) + '"' : '') + '>' + label + '</button>';
    const gchip = (g) => gUnl(g) ? chip(gset.has(g), 'gim', g, '<i class="ge">' + gimIcon(g) + '</i>' + esc(gimName(g)), gimDesc(g))
      : '<button class="chip locked" data-act="glock" data-v="' + esc(g) + '" title="Complete its tutorial to unlock">' + ic('lock') + '<i class="ge">' + gimIcon(g) + '</i>' + esc(gimName(g)) + '<small>Complete its tutorial</small></button>';
    const nUnl = allGimmicks().filter(gUnl).length;
    const key = G.Run.settingsKey(s), lb = G.Run.leaderboard(key);
    const slider = (label, name, min, max, v, txt) => '<div class="srow"><div class="sl"><b>' + label + '</b><small class="sv-' + name + '">' + txt + '</small></div><input type="range" min="' + min + '" max="' + max + '" step="1" value="' + v + '" data-in="' + name + '" style="--v:' + ((v - min) / (max - min) * 100) + '%"></div>';
    let html = topbar('Endless', 'Survive as many holes as you can', { right: diffChip() }) + '<div class="page narrow endless">';
    html += section(ic('sparkle') + 'Presets', '<div class="preset-row">' +
      ps.map((p) => '<button class="preset ' + (s.preset === p.id ? 'on' : '') + '" data-act="preset" data-v="' + esc(p.id) + '"><b>' + esc(p.name) + '</b>' + (p.desc ? '<small>' + esc(p.desc) + '</small>' : '') + '</button>').join('') +
      (s.preset === 'custom' ? '<span class="preset on ghost"><b>Custom</b><small>Your own mix</small></span>' : '') + '</div>' +
      (custom.length ? '<div class="sub-h">Saved</div><div class="chips">' + custom.map((p, i) => chip(false, 'cpreset', i, ic('star') + esc(p.name))).join('') + '</div>' : '') +
      '<div class="inline-form"><input class="txt" placeholder="Name this setup…" maxlength="24" data-in="pname" aria-label="Preset name"><button class="btn sm" data-act="savep">' + ic('save') + 'Save</button>' + (custom.length ? '<button class="btn sm ghost" data-act="delp">' + ic('trash') + 'Clear saved</button>' : '') + '</div>');
    html += section(ic('target') + 'Rules',
      slider('Difficulty', 'diff', 1, 10, s.difficulty, s.difficulty + ' / 10') +
      '<div class="srow"><div class="sl"><b>Ramp</b><small>Gets harder each hole</small></div><div class="seg">' + RAMPS.map((r) => '<button class="segb ' + (Math.abs(s.ramp - r[1]) < 0.01 ? 'on' : '') + '" data-act="ramp" data-v="' + r[1] + '">' + r[0] + '</button>').join('') + '</div></div>' +
      slider('Wind', 'wind', 0, 3, s.wind, LEVELS[s.wind] || s.wind) +
      slider('Hazards', 'hz', 0, 3, s.hazardDensity, LEVELS[s.hazardDensity] || s.hazardDensity) +
      '<div class="srow"><div class="sl"><b>Stroke limit</b><small>Miss it and the run ends</small></div><div class="seg">' + RULES.map((r) => '<button class="segb ' + (s.strokeRule === r ? 'on' : '') + '" data-act="rule" data-v="' + r + '">' + (r === 'unlimited' ? '∞' : r.replace('par', 'Par ')) + '</button>').join('') + '</div></div>');
    let gh = '';
    if (packs.length) {
      gh += '<div class="packs">' + packs.map((p, i) => {
        const all = p.gimmicks || [], gs = all.filter(gUnl), n = gs.filter((g) => gset.has(g)).length, open = openPacks.has(i);
        return '<div class="pack' + (open ? ' open' : '') + '"><div class="pack-h"><button class="pack-t" data-act="popen" data-v="' + i + '" aria-expanded="' + open + '">' + ic('next', 'chev') + '<b>' + esc(p.name || p.id) + '</b><small>' + n + '/' + gs.length + (gs.length < all.length ? ' · ' + (all.length - gs.length) + ' locked' : '') + '</small></button>' +
          '<button class="tri ' + (n === gs.length && gs.length ? 'on' : n ? 'part' : '') + (gs.length ? '' : ' disabled') + '" data-act="pack" data-v="' + i + '" aria-label="Toggle all in ' + esc(p.name || p.id) + '">' + (n === gs.length && gs.length ? ic('check') : n ? '<i></i>' : '') + '</button></div>' +
          (open ? '<div class="chips">' + all.map(gchip).join('') + '</div>' : '') + '</div>';
      }).join('') + '</div>';
      const inPack = new Set(); packs.forEach((p) => (p.gimmicks || []).forEach((g) => inPack.add(g)));
      const rest = allGimmicks().filter((g) => !inPack.has(g));
      if (rest.length) gh += '<div class="sub-h">Other</div><div class="chips">' + rest.map(gchip).join('') + '</div>';
    } else gh += '<div class="chips">' + allGimmicks().map(gchip).join('') + '</div>';
    gh = '<div class="note">' + ic('grad') + (nUnl ? nUnl + ' of ' + allGimmicks().length + ' gimmicks unlocked. Complete a gimmick\'s tutorial to add it to Endless.' : 'No gimmicks unlocked yet — runs use classic golf holes. Complete gimmick tutorials to add them.') +
      ' <button class="mini" data-act="tuts">Tutorials</button></div>' + gh;
    html += section(ic('grid') + 'Gimmicks <small>' + gset.size + '/' + nUnl + '</small>', gh, { right: '<span class="h-acts"><button class="mini" data-act="gall">All</button><button class="mini" data-act="gnone">None</button></span>' });
    html += section(ic('flag') + 'Terrain', '<div class="sub-h">Surfaces</div><div class="chips">' + surfaceList().map((x) => chip(sset.has(x), 'surf', x, esc(cap(x)))).join('') + '</div>' +
      '<div class="sub-h">Styles</div><div class="chips">' + styleList().map((x) => chip(yset.has(x.id), 'style', x.id, esc(x.name))).join('') + '</div>');
    html += section(ic('dice') + 'Seed', '<div class="seedbox"><input class="seed" maxlength="12" value="' + G.RNG.seedToCode(s.seed) + '" data-in="seed" spellcheck="false" autocomplete="off" aria-label="Seed code">' +
      iconBtn('rseed', 'dice', 'New random seed') + iconBtn('copy', 'copy', 'Copy seed') + '</div><div class="note">Same seed + same settings = the same holes. Share it to race a friend.</div>');
    html += section(ic('trophy') + 'Leaderboard <small>' + esc(s.preset !== 'custom' ? s.preset : 'custom ' + key) + '</small>', lbHtml(lb));
    html += '</div><div class="sticky-go">' + (ok ? '<button class="btn big primary" data-act="start">' + ic('play') + 'Start run</button>' : '<div class="empty small">Generator not loaded.</div>') + '</div>';
    render(html, 'list');
    keepScroll(args);
    const redraw = (patch, keepPreset) => {
      const n = Object.assign({}, s, patch);
      if (!keepPreset) n.preset = 'custom';
      G.Store.set('endless.last', n);
      show('endless', { s: n, scroll: scr().scrollTop });
    };
    const toggle = (arr, v) => { const st = new Set(arr); if (st.has(v)) st.delete(v); else st.add(v); return [...st]; };
    let pname = '';
    const live = (el, name, txt) => { el.style.setProperty('--v', ((el.value - el.min) / (el.max - el.min) * 100) + '%'); const v = scr().querySelector('.sv-' + name); if (v) v.textContent = txt; };
    on({
      back: () => show('title'),
      preset: (d) => { click(); const p = ps.find((x) => x.id === d.v); redraw(Object.assign({}, cleanSettings(p.settings), { seed: s.seed, preset: p.id }), true); },
      cpreset: (d) => { click(); const p = custom[+d.v]; redraw(Object.assign({}, cleanSettings(p.settings), { preset: 'custom' }), true); },
      savep: () => {
        const nm = (pname || '').trim() || 'Preset ' + (custom.length + 1);
        custom.push({ name: nm, settings: Object.assign({}, s, { preset: 'custom' }) });
        G.Store.set('endless.presets', custom.slice(-12)); toast('Saved preset ' + nm, 'info'); redraw({}, true);
      },
      delp: () => { G.Store.set('endless.presets', []); redraw({}, true); },
      'in:pname': (el) => { pname = el.value; },
      'in:diff': (el, e) => { if (e.type === 'change') redraw({ difficulty: +el.value }); else live(el, 'diff', el.value + ' / 10'); },
      'in:wind': (el, e) => { if (e.type === 'change') redraw({ wind: +el.value }); else live(el, 'wind', LEVELS[+el.value]); },
      'in:hz': (el, e) => { if (e.type === 'change') redraw({ hazardDensity: +el.value }); else live(el, 'hz', LEVELS[+el.value]); },
      ramp: (d) => { click(); redraw({ ramp: +d.v }); },
      rule: (d) => { click(); redraw({ strokeRule: d.v }); },
      gim: (d) => { click(); redraw({ gimmicks: toggle(s.gimmicks, d.v) }); },
      gall: () => { click(); redraw({ gimmicks: allGimmicks().filter(gUnl) }); },
      glock: (d) => {
        if (!G.Progress.tutorialHole(d.v)) { A().sfx('uiback'); toast('Locked — complete its tutorial (' + (G.Progress.hasTutorials() ? 'not available yet' : 'coming soon') + ')', 'warn'); return; }
        click(); App().startTutorial(d.v, { ret: { screen: 'endless', args: { s, scroll: scr().scrollTop } } });
      },
      tuts: () => { click(); show('tutorials', { ret: 'endless', retArgs: { s } }); },
      gnone: () => { click(); redraw({ gimmicks: [] }); },
      popen: (d) => { click(); const i = +d.v; if (openPacks.has(i)) openPacks.delete(i); else openPacks.add(i); show('endless', { s, scroll: scr().scrollTop }); },
      pack: (d) => {
        click(); const p = packs[+d.v]; if (!p) return; const gs = p.gimmicks || [];
        const allOn = gs.filter(gUnl).every((g) => gset.has(g));
        const st = new Set(s.gimmicks); gs.filter(gUnl).forEach((g) => (allOn ? st.delete(g) : st.add(g)));
        const sf = new Set(s.surfaces); if (!allOn) (p.surfaces || []).forEach((x) => sf.add(x));
        redraw({ gimmicks: [...st], surfaces: [...sf] });
      },
      surf: (d) => { click(); const n = toggle(s.surfaces, d.v); if (!n.length) { toast('Need at least one surface', 'warn'); return; } redraw({ surfaces: n }); },
      style: (d) => { click(); const n = toggle(s.styles, d.v); if (!n.length) { toast('Need at least one style', 'warn'); return; } redraw({ styles: n }); },
      'in:seed': (el, e) => { if (e.type === 'change') { s.seed = G.RNG.codeToSeed(el.value) || s.seed; G.Store.set('endless.last', s); } },
      rseed: () => { click(); redraw({ seed: Math.floor(Math.random() * 0x3fffffff) }, true); },
      copy: () => copyText(G.RNG.seedToCode(s.seed)),
      start: () => {
        click();
        const el = scr().querySelector('.seed'); if (el) s.seed = G.RNG.codeToSeed(el.value) || s.seed;
        G.Store.set('endless.last', s);
        App().startEndless(cleanSettings(s));
      },
    });
  };
  function lbHtml(lb) {
    if (!lb || !lb.length) return '<div class="chip-note">No runs yet — be the first.</div>';
    return '<div class="lb">' + lb.map((e, i) => '<div class="lbr ' + (e.hl ? 'hl' : '') + '"><span class="rk">' + (i + 1) + '</span><span><b>' + e.score + '</b> pts</span><span>' + e.holes + ' holes</span><span class="dim">' + esc(e.diff || '') + '</span><span class="dim">' + esc(e.date || '') + '</span></div>').join('') + '</div>';
  }

  SCREENS.gameOver = function (args) {
    const run = App().run;
    const key = G.Run.settingsKey(run.settings);
    const lb = G.Run.leaderboard(key).map((e) => Object.assign({}, e, { hl: e.id === args.entryId }));
    const best = G.Store.getStats ? G.Store.getStats().endless : 0;
    render('<div class="center-col"><div class="card pop wide result">' +
      '<div class="card-k">' + ic('infinity') + 'Endless</div>' +
      '<div class="hd-label fail">Run over</div>' +
      '<div class="res-big"><b>' + run.score + '</b><small>points</small></div>' +
      scoreTiles([['Holes', run.cleared], ['Under par', run.underPar], ['Best run', best + ' holes']]) +
      (args.rank >= 0 ? '<div class="badges"><span class="badge">' + ic('trophy') + '#' + (args.rank + 1) + ' on the leaderboard</span></div>' : '') +
      '<div class="code-row"><span>Seed</span><b class="code">' + G.RNG.seedToCode(run.settings.seed) + '</b><button class="btn sm ghost" data-act="copy">' + ic('copy') + 'Copy</button></div>' +
      lbHtml(lb) +
      '<div class="menu row"><button class="btn ghost" data-act="menu">' + ic('home') + 'Menu</button><button class="btn ghost" data-act="setup">' + ic('settings') + 'Setup</button><button class="btn" data-act="same">' + ic('replay') + 'Same seed</button><button class="btn primary grow" data-act="again">' + ic('dice') + 'New run</button></div></div></div>', 'dim');
    on({
      again: () => { click(); App().startEndless(Object.assign({}, run.settings, { seed: Math.floor(Math.random() * 0x3fffffff) })); },
      same: () => { click(); App().startEndless(Object.assign({}, run.settings)); },
      copy: () => copyText(G.RNG.seedToCode(run.settings.seed)),
      setup: () => { click(); App().quitToMenu('endless'); }, menu: () => { click(); App().quitToMenu(); }, back: () => App().quitToMenu(),
    });
  };

  function back() { const fn = acts.back; if (fn) { A() && A().sfx('uiback'); fn({}); return true; } return false; }

  G.UI = {
    init, show, hide, toast, bigLabel, setHudPlayer, introCard, clearIntro, swishBanner, gimIcon, showHud, updateHud, loaderUpdate, back, unlockToasts, achToasts, setCoach, icon: ic, drawCosmetic: drawCos, fmtTime,
    get current() { return current; }, get args() { return curArgs; }, hudClick,
    // building blocks for screens that live in other files (game/multi.js)
    kit: {
      SCREENS, render, on, show, click, scr, keepScroll, esc, cap, ic, iconBtn, topbar, section, diffChip, swatch, gimBadge, courseGim, scv, relPar, relCls, relTag,
      scoreTiles, fmtTime, fmtTimeS, cosCanvas, bindPreviews, toast, copyText, A, gimIcon,
    },
  };
})();
