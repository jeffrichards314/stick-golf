#!/usr/bin/env node
// Design iteration tool: build one course in memory (no files baked), bot-verify every hole,
// check signature-gimmick engagement + essentialness, and write debug SVG/PNG previews.
// Usage: node tools/try.js <courseId | gimmickType> [--holes 1,2,9] [--png] [--no-ess]
'use strict';
const fs = require('fs'), path = require('path');
const L = require('./lib.js');

function holeSvg(h) {
  const COL = { f: '#3a3', n: '#7e7', r: '#262', s: '#db5', i: '#9df', g: '#a4c', b: '#f6a', k: '#777', w: '#33f', l: '#f60', o: '#f00', x: '#f00', q: '#0ff', m: '#aaa', c: '#555', u: '#a85', h: '#eef', j: '#6cf', z: '#f0f', v: '#000' };
  const top = -900, H = Math.max(h.h - top, h.w * 0.5);
  let s = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 ${top} ${h.w} ${H}" width="${Math.round(h.w / 2.5)}" height="${Math.round(H / 2.5)}"><rect x="0" y="${top}" width="${h.w}" height="${H}" fill="#cef"/>`;
  const g = h.ground;
  s += `<polygon fill="#694" points="${g.join(' ')} ${h.w},${h.h} 0,${h.h}"/>`;
  for (let i = 0; i + 3 < g.length; i += 2) s += `<line x1="${g[i]}" y1="${g[i + 1]}" x2="${g[i + 2]}" y2="${g[i + 3]}" stroke="${COL[h.gs[i >> 1]] || '#000'}" stroke-width="10"/>`;
  for (const so of h.solids) s += `<polygon fill="#875" stroke="#432" stroke-width="3" points="${so.p.join(' ')}"/>`;
  for (const o of h.gm) {
    for (const b of L.G.gimmickBoxes(o)) s += `<rect x="${b[0]}" y="${b[1]}" width="${b[2] - b[0]}" height="${b[3] - b[1]}" fill="rgba(255,0,200,.22)" stroke="#f0c" stroke-width="3"/>`;
    const b = L.G.gimmickBox(o);
    if (b) s += `<text x="${b[0]}" y="${b[1] - 6}" font-size="44" fill="#000">${o.t}</text>`;
    if (o.x2 !== undefined && o.y2 !== undefined && o.t !== 'movplat') s += `<line x1="${o.x}" y1="${o.y}" x2="${o.x2}" y2="${o.y2}" stroke="#f0c" stroke-width="5"/>`;
  }
  if (h.bot) {
    const rp = L.Bot.replay(h, h.bot.shots.map(([a, p]) => ({ a, p })), null, true);
    const pts = []; for (let i = 0; i < rp.path.length; i += 8) pts.push(rp.path[i].toFixed(0) + ',' + rp.path[i + 1].toFixed(0));
    s += `<polyline fill="none" stroke="#c00" stroke-width="5" stroke-dasharray="14 8" points="${pts.join(' ')}"/>`;
  }
  s += `<circle cx="${h.tee[0]}" cy="${h.tee[1]}" r="16" fill="#fff" stroke="#000" stroke-width="3"/><rect x="${h.cup[0] - 4}" y="${h.cup[1] - 130}" width="8" height="130" fill="#000"/><polygon points="${h.cup[0]},${h.cup[1] - 130} ${h.cup[0] + 60},${h.cup[1] - 110} ${h.cup[0]},${h.cup[1] - 90}" fill="red"/>`;
  s += `<text x="20" y="${top + 60}" font-size="54">${h.id} par ${h.par} bot ${h.bot ? h.bot.s : '-'} | ${h.tpl}</text></svg>`;
  return s;
}

function courseFor(arg) {
  if (L.M.byId[arg]) return L.M.byId[arg];
  const c = L.M.COURSES.find((x) => x.gimmick === arg);
  if (!c) throw new Error('unknown course/gimmick ' + arg);
  return c;
}

function tryHole(id, k, opts) {
  const def = courseFor(id), plan = L.G.coursePlan(def);
  const t0 = Date.now();
  const r = L.buildHole(def, k, plan);
  const out = { k, pieces: plan[k].pieces.map((p) => (p.g || 'basic') + ':' + p.id).join(' + '), wrapper: plan[k].wrapper, tries: r.tries, ms: Date.now() - t0 };
  if (r.hole) {
    out.hole = r.hole;
    const des = def.gimmick && require('../src/designs/index.js').get(def.gimmick);
    out.ess = opts && opts.noEss || !(des && des.essential) ? null : L.essentialCheck(r.hole);
  }
  return out;
}

if (require.main === module) {
  const { runPool } = require('./pool.js');
  const args = process.argv.slice(2);
  const def = courseFor(args[0] || 'c02');
  const hi = args.indexOf('--holes');
  const ks = hi >= 0 ? args[hi + 1].split(',').map((n) => +n - 1) : Array.from({ length: L.G.HOLES }, (_, i) => i);
  const opts = { noEss: args.includes('--no-ess') };
  (async () => {
    const res = await runPool(ks.map((k) => ({ type: 'try', id: def.id, k, opts })));
    const dir = path.join(L.CACHE, 'try', def.id);
    fs.mkdirSync(dir, { recursive: true });
    console.log(`${def.id} ${def.name} — gimmick: ${def.gimmick} (${def.style}/${def.surface})`);
    let pass = 0, ess = 0, essN = 0;
    for (const r of res) {
      if (r.error) { console.log('ERROR', r.error); continue; }
      const h = r.hole;
      const status = h ? `OK  bot ${h.bot.s}/par ${h.par} (est ${h.estPar}) att ${h.attempt + 1}` : 'FAIL';
      if (h) pass++;
      if (r.ess !== null && r.ess !== undefined) { essN++; if (r.ess) ess++; }
      console.log(`  h${r.k + 1} ${status.padEnd(34)} ess:${r.ess === null || r.ess === undefined ? '-' : r.ess ? 'Y' : 'n'}  ${r.wrapper} | ${r.pieces}  ${(r.ms / 1000).toFixed(1)}s ${r.tries.length ? '[' + r.tries.join(',') + ']' : ''}`);
      if (h) {
        const f = path.join(dir, `h${r.k + 1}.svg`);
        fs.writeFileSync(f, holeSvg(h));
        if (args.includes('--png')) require('child_process').spawnSync('qlmanage', ['-t', '-s', '1600', '-o', dir, f], { stdio: 'ignore' });
      }
    }
    console.log(`  ${pass}/${res.length} pass, essential ${ess}/${essN}. previews: ${dir}`);
  })();
}

module.exports = { tryHole, holeSvg, courseFor };
