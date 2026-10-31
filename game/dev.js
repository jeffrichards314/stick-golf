/* Dev helpers: a hard-coded test hole (?dev=1) and a minimal fallback renderer
 * used ONLY when game/render.js (GOLF.Render) is not available. */
(function () {
  'use strict';
  const G = window.GOLF = window.GOLF || {};

  const DEV_HOLE = {
    v: 1, id: 'dev1', name: 'Dev Test Hole', par: 3, seed: 1, tpl: 'valley', role: 'intro', theme: 'c01',
    w: 2400, h: 1100, tee: [150, 794], cup: [2000, 800], cupW: 30,
    ground: [0, 800, 400, 800, 600, 760, 800, 700, 1000, 700, 1050, 900, 1250, 900, 1300, 720, 1500, 720, 1700, 800, 1850, 800, 2150, 800, 2300, 800, 2400, 600],
    gs: 'ffrfkwkfffnfk',
    solids: [{ p: [1450, 520, 1520, 520, 1520, 560, 1450, 560], s: 'k' }],
    gm: [
      { t: 'wind', ax: -40, ay: 0, gust: 0.3, f: 0.8, ph: 0 },
      { t: 'bumper', x: 1380, y: 600, r: 22, boost: 600 },
      { t: 'pad', x: 700, y: 724, L: 50, ang: -Math.PI / 2 - 0.3, boost: 700 },
      { t: 'fog', x: 1650, y: 480, w: 500, h: 320 },
      { t: 'movplat', x: 1060, y: 650, x2: 1170, y2: 650, w: 80, h: 14, T: 4, ph: 0 },
    ],
  };
  const DEV_THEME = {
    id: 'c01', name: 'Dev Meadow', index: 0, concept: 'Dev test course', gimmick: null, unlock: { prev: null },
    palette: { skyTop: '#5fb0ff', skyBottom: '#d8f1ff', far: '#9cc9a5', mid: '#6fae6f', near: '#4c8f4c', ground: '#5aa846', groundDark: '#3a6e2f', accent: '#ffcf3a', text: '#ffffff' },
    surface: 'fairway', altSurface: 'rough', hazard: 'water', style: 'rolling',
    ambient: { particles: 'leaves', bg: 'hills' },
  };

  // Extra dev holes (?dev=1&hole=3 / 4): rising flood + star tokens, and a putting/swish range
  const DEV_EXTRA = [
    {
      v: 1, id: 'dev3', name: 'Dev Flood + Stars', par: 4, seed: 3, tpl: 'valley', role: 'intro', theme: 'c01',
      w: 2400, h: 1100, tee: [150, 594], cup: [2150, 600], cupW: 30,
      ground: [0, 600, 350, 600, 450, 800, 1800, 800, 1900, 600, 2050, 600, 2250, 600, 2400, 600],
      gs: 'fffffnf',
      solids: [],
      gm: [
        { t: 'flood', y0: 860, dy: 40, top: 560 },
        { t: 'tokens', pts: [900, 700, 1400, 690], r: 14 },
      ],
    },
    {
      v: 1, id: 'dev4', name: 'Dev Putting Range', par: 3, seed: 4, tpl: 'valley', role: 'intro', theme: 'c01',
      w: 1800, h: 1000, tee: [150, 694], cup: [1300, 700], cupW: 30,
      ground: [0, 700, 1050, 700, 1550, 700, 1800, 700],
      gs: 'fnf',
      solids: [],
      gm: [],
    },
  ];

  // ---------------- fallback renderer ----------------
  const SC = { f: '#5bbf4a', r: '#3e8a35', s: '#e8d38a', i: '#bfeaff', g: '#a64fd1', b: '#ff5fa2', k: '#7a7468', q: '#ffd84a', m: '#9aa7b5', c: '#555', w: '#2f7de1', l: '#ff5a1f', o: '#222', x: '#c33' };
  function create(canvas) {
    const ctx = canvas.getContext('2d');
    let hole = null, theme = null, vw = 800, vh = 600, dpr = 1;
    const parts = [], trail = [];
    const R = {
      resize(w, h) { vw = w; vh = h; dpr = canvas.width / Math.max(1, w); },
      setHole(h, th) { hole = h; theme = th; parts.length = 0; trail.length = 0; },
      worldToScreen(x, y, cam) { return [(x - cam.x) * cam.zoom + vw / 2, (y - cam.y) * cam.zoom + vh / 2]; },
      screenToWorld(sx, sy, cam) { return [(sx - vw / 2) / cam.zoom + cam.x, (sy - vh / 2) / cam.zoom + cam.y]; },
      spawn(kind, x, y) { for (let i = 0; i < 10; i++) parts.push({ x, y, vx: (Math.random() - 0.5) * 300, vy: -Math.random() * 300, t: 0.6, c: kind === 'splash' ? '#6af' : kind === 'confetti' ? `hsl(${Math.random() * 360},90%,60%)` : '#fff' }); },
      trailPush(x, y) { trail.push([x, y]); if (trail.length > 80) trail.shift(); },
      trailClear() { trail.length = 0; },
      draw(o) {
        const cam = o.cam, W = o.W, S = o.S, z = cam.zoom, pal = (theme && theme.palette) || DEV_THEME.palette;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        const g = ctx.createLinearGradient(0, 0, 0, vh); g.addColorStop(0, pal.skyTop); g.addColorStop(1, pal.skyBottom);
        ctx.fillStyle = g; ctx.fillRect(0, 0, vw, vh);
        if (!hole) return;
        ctx.save();
        ctx.translate(vw / 2 + (o.shake ? o.shake.x : 0), vh / 2 + (o.shake ? o.shake.y : 0)); ctx.scale(z, z); ctx.translate(-cam.x, -cam.y);
        const gp = hole.ground;
        ctx.beginPath(); ctx.moveTo(gp[0], hole.h + 400);
        for (let i = 0; i < gp.length; i += 2) ctx.lineTo(gp[i], gp[i + 1]);
        ctx.lineTo(gp[gp.length - 2], hole.h + 400); ctx.closePath(); ctx.fillStyle = pal.groundDark; ctx.fill();
        ctx.lineWidth = 6;
        for (let i = 0; i + 3 < gp.length; i += 2) { ctx.strokeStyle = SC[hole.gs[i >> 1]] || '#5b5'; ctx.beginPath(); ctx.moveTo(gp[i], gp[i + 1]); ctx.lineTo(gp[i + 2], gp[i + 3]); ctx.stroke(); }
        for (const so of hole.solids || []) { ctx.beginPath(); for (let i = 0; i < so.p.length; i += 2) ctx[i ? 'lineTo' : 'moveTo'](so.p[i], so.p[i + 1]); ctx.closePath(); ctx.fillStyle = SC[so.s[0]] || '#776'; ctx.fill(); }
        const tg = S.t * W.opts.gspeed, PZ = G.Physics.poses;
        (hole.gm || []).forEach((m, gi) => {
          ctx.lineWidth = 4; ctx.strokeStyle = '#333'; ctx.fillStyle = 'rgba(255,255,255,0.3)';
          if (m.t === 'bumper') { ctx.fillStyle = '#f44'; ctx.beginPath(); ctx.arc(m.x, m.y, m.r, 0, 7); ctx.fill(); }
          else if (m.t === 'pad') { const dx = Math.cos(m.ang + Math.PI / 2) * m.L / 2, dy = Math.sin(m.ang + Math.PI / 2) * m.L / 2; ctx.strokeStyle = '#f5a'; ctx.lineWidth = 8; ctx.beginPath(); ctx.moveTo(m.x - dx, m.y - dy); ctx.lineTo(m.x + dx, m.y + dy); ctx.stroke(); }
          else if (m.t === 'movplat') { const p = PZ.movplat(m, tg); ctx.fillStyle = '#c96'; ctx.fillRect(p[0], p[1], m.w, m.h); }
          else if (m.t === 'fog') { const rv = o.fogReveal ? o.fogReveal[gi] || 0 : 0; ctx.fillStyle = `rgba(230,235,245,${0.95 * (1 - rv)})`; ctx.fillRect(m.x, m.y, m.w, m.h); }
          else if (m.x2 !== undefined && m.y2 !== undefined && m.w === undefined) { ctx.beginPath(); ctx.moveTo(m.x, m.y); ctx.lineTo(m.x2, m.y2); ctx.stroke(); }
          else if (m.w !== undefined && m.h !== undefined) { if (m.t !== 'wind') ctx.strokeRect(m.x, m.y, m.w, m.h); }
          else if (m.r) { ctx.beginPath(); ctx.arc(m.x, m.y, m.r, 0, 7); ctx.stroke(); }
        });
        const cup = G.Physics.cupState(W, S);
        ctx.fillStyle = '#111'; ctx.fillRect(cup.x - cup.w / 2, cup.y - 2, cup.w, 14);
        ctx.strokeStyle = '#eee'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(cup.x, cup.y); ctx.lineTo(cup.x, cup.y - 90); ctx.stroke();
        ctx.fillStyle = '#f33'; ctx.beginPath(); ctx.moveTo(cup.x, cup.y - 90); ctx.lineTo(cup.x + 34, cup.y - 78); ctx.lineTo(cup.x, cup.y - 66); ctx.fill();
        if (trail.length > 1) { ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 3; ctx.beginPath(); trail.forEach((p, i) => ctx[i ? 'lineTo' : 'moveTo'](p[0], p[1])); ctx.stroke(); }
        if (o.aim) {
          const a = o.aim; ctx.fillStyle = 'rgba(255,255,255,0.85)';
          const pp = a.points || []; for (let i = 0; i + 1 < pp.length; i += 4) { ctx.beginPath(); ctx.arc(pp[i], pp[i + 1], 3 / z, 0, 7); ctx.fill(); }
          ctx.strokeStyle = `hsl(${120 - a.power * 120},90%,50%)`; ctx.lineWidth = 5 / z;
          ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(a.x + Math.cos(a.angle) * (30 + 90 * a.power) / z, a.y + Math.sin(a.angle) * (30 + 90 * a.power) / z); ctx.stroke();
        }
        ctx.fillStyle = '#fff'; ctx.strokeStyle = '#000'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(S.x, S.y, 6, 0, 7); ctx.fill(); ctx.stroke();
        const dt = o.dt || 0.016;
        for (let i = parts.length - 1; i >= 0; i--) { const p = parts[i]; p.t -= dt; p.vy += 600 * dt; p.x += p.vx * dt; p.y += p.vy * dt; if (p.t <= 0) { parts.splice(i, 1); continue; } ctx.fillStyle = p.c; ctx.fillRect(p.x - 2, p.y - 2, 4, 4); }
        ctx.restore();
      },
    };
    return R;
  }
  function drawPreview(ctx, hole, theme, w, h) {
    const pal = (theme && theme.palette) || DEV_THEME.palette;
    const g = ctx.createLinearGradient(0, 0, 0, h); g.addColorStop(0, pal.skyTop); g.addColorStop(1, pal.skyBottom);
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    const s = Math.min(w / hole.w, h / hole.h), ox = (w - hole.w * s) / 2, oy = (h - hole.h * s) / 2;
    ctx.beginPath(); ctx.moveTo(ox, h);
    for (let i = 0; i < hole.ground.length; i += 2) ctx.lineTo(ox + hole.ground[i] * s, oy + hole.ground[i + 1] * s);
    ctx.lineTo(ox + hole.w * s, h); ctx.closePath(); ctx.fillStyle = pal.ground; ctx.fill();
    ctx.fillStyle = '#f33'; ctx.fillRect(ox + hole.cup[0] * s - 1, oy + hole.cup[1] * s - 12, 2, 12);
  }
  const COSMETICS = {
    balls: [{ id: 'white', name: 'Classic' }, { id: 'gold', name: 'Gold' }, { id: 'red', name: 'Red' }, { id: 'eye', name: 'Eyeball' }],
    trails: [{ id: 'none', name: 'None' }, { id: 'line', name: 'Line' }, { id: 'rainbow', name: 'Rainbow' }],
    cupEffects: [{ id: 'confetti', name: 'Confetti' }, { id: 'fireworks', name: 'Fireworks' }],
    palettes: [{ id: 'default', name: 'Course' }, { id: 'night', name: 'Night' }],
  };
  G.Dev = { DEV_HOLE, DEV_THEME, DEV_EXTRA, FallbackRender: { create, drawPreview, COSMETICS, fallback: true } };
})();
