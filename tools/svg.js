#!/usr/bin/env node
// Debug: render baked holes to SVG (ground, solids, gimmick boxes, bot path). node tools/svg.js t1c01 [outdir]
'use strict';
const fs = require('fs'), path = require('path');
const L = require('./lib.js');
const id = process.argv[2] || 't1c01', out = process.argv[3] || path.join(L.ROOT, '.cache', 'svg');
fs.mkdirSync(out, { recursive: true });
const holes = L.loadCourse(id);
const COL = { f: '#3a3', r: '#262', s: '#db5', i: '#9df', g: '#a4c', b: '#f6a', k: '#777', w: '#33f', l: '#f60', o: '#f00', x: '#f00', q: '#0ff', m: '#aaa', c: '#555' };
holes.forEach((h, k) => {
  const top = -700, H = Math.max(h.h - top, h.w);
  let s = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 ${top} ${h.w} ${H}" width="${Math.round(h.w / 3)}" height="${Math.round(H / 3)}"><rect x="0" y="${top}" width="${h.w}" height="${H}" fill="#cef"/>`;
  const g = h.ground;
  s += `<polygon fill="#694" points="${g.join(' ')} ${h.w},${h.h} 0,${h.h}"/>`;
  for (let i = 0; i + 3 < g.length; i += 2) s += `<line x1="${g[i]}" y1="${g[i + 1]}" x2="${g[i + 2]}" y2="${g[i + 3]}" stroke="${COL[h.gs[i >> 1]]}" stroke-width="8"/>`;
  for (const so of h.solids) s += `<polygon fill="#875" stroke="#432" stroke-width="3" points="${so.p.join(' ')}"/>`;
  for (const o of h.gm) {
    const b = L.G.gimmickBox(o) || (o.x !== undefined ? [o.x - 20, o.y - 20, o.x + 20, o.y + 20] : null);
    if (b) s += `<rect x="${b[0]}" y="${b[1]}" width="${b[2] - b[0]}" height="${b[3] - b[1]}" fill="rgba(255,0,200,.25)" stroke="#f0c"/><text x="${b[0]}" y="${b[1] - 4}" font-size="40" fill="#000">${o.t}</text>`;
    if (o.x2 !== undefined && o.y2 !== undefined) s += `<line x1="${o.x}" y1="${o.y}" x2="${o.x2}" y2="${o.y2}" stroke="#f0c" stroke-width="6"/>`;
  }
  // bot path
  const W = L.P.createWorld(h), S = L.P.initState(W);
  for (const [a, p] of h.bot.shots) {
    L.P.shoot(W, S, a, p, 0); let pts = [];
    for (let i = 0; i < 3000; i++) { const r = L.P.step(W, S); if (i % 4 === 0) pts.push(S.x.toFixed(0) + ',' + S.y.toFixed(0)); if (r) break; }
    s += `<polyline fill="none" stroke="#c00" stroke-width="4" stroke-dasharray="10 6" points="${pts.join(' ')}"/>`;
  }
  s += `<circle cx="${h.tee[0]}" cy="${h.tee[1]}" r="14" fill="#fff" stroke="#000"/><rect x="${h.cup[0] - 4}" y="${h.cup[1] - 120}" width="8" height="120" fill="#000"/><polygon points="${h.cup[0]},${h.cup[1] - 120} ${h.cup[0] + 60},${h.cup[1] - 100} ${h.cup[0]},${h.cup[1] - 80}" fill="red"/>`;
  s += `<text x="20" y="${top + 60}" font-size="50">${h.id} ${h.tpl} par ${h.par} bot ${h.bot.s} [${h.gk.join(',')}] ${h.boss || ''}</text></svg>`;
  fs.writeFileSync(path.join(out, `${h.id}.svg`), s);
});
console.log('wrote', holes.length, 'svgs to', out);
