/* Runs: a sequence of holes (baked course, generated daily/random course, endless).
 * Generated holes are produced by incremental jobs: generate -> bot-verify -> retry with bumped seed. */
(function () {
  'use strict';
  const G = window.GOLF = window.GOLF || {};
  const MAX_ATTEMPTS = 12;

  // makeHole(attempt) -> hole ; job.step(ms) -> true when done (job.hole set)
  function makeJob(makeHole, label) {
    const job = { attempt: 0, hole: null, solver: null, done: false, ok: false, phase: 'gen', label, t0: performance.now(), err: null, prog: 0 };
    job.step = function (ms) {
      if (job.done) return true;
      const tEnd = performance.now() + ms;
      while (!job.done && performance.now() < tEnd) {
        if (job.phase === 'gen') {
          let h = null;
          try { h = makeHole(job.attempt); } catch (e) { job.err = e; console.error('[gen]', e); }
          if (!h) { job.attempt++; if (job.attempt >= MAX_ATTEMPTS) { job.done = true; } continue; }
          job.hole = h;
          if (!G.Bot || !G.Bot.createSolver) { job.done = true; job.ok = true; break; }
          try { job.solver = G.Bot.createSolver(h, { maxStrokes: h.par + 2 }); } catch (e) { console.error('[bot]', e); job.done = true; job.ok = true; break; }
          job.phase = 'verify';
        } else {
          let res = null;
          try { res = job.solver.run(Math.max(1, tEnd - performance.now())); } catch (e) { console.error('[bot]', e); res = { ok: true }; }
          if (job.solver && typeof job.solver.progress === 'number') job.prog = job.solver.progress;
          if (res) {
            if (res.ok) {
              job.done = true; job.ok = true; job.solution = res;
              try { if (G.Generator && G.Generator.finalizePar) G.Generator.finalizePar(job.hole, res.strokes); } catch (e) { console.warn('[gen] finalizePar', e); }
            }
            else {
              job.attempt++;
              if (job.attempt >= MAX_ATTEMPTS) { job.done = true; console.warn('[gen] accepting unverified hole after', job.attempt, 'attempts'); }
              else { job.phase = 'gen'; job.solver = null; }
            }
          }
        }
      }
      return job.done;
    };
    job.status = function () {
      return { phase: job.phase, attempt: job.attempt, prog: job.prog, elapsed: (performance.now() - job.t0) / 1000 };
    };
    return job;
  }

  function themeFor(hole, fallbackDef) {
    const M = G.Manifest;
    return (hole && hole.theme && M && M.byId && M.byId[hole.theme]) || fallbackDef || (M && M.COURSES && M.COURSES[0]) || (G.Dev && G.Dev.DEV_THEME);
  }

  // Base run
  function base(kind, def, n, diff) {
    const d = G.Modes.get(diff);
    return {
      kind, def, n, diff, idx: 0, holes: [], jobs: {}, scores: [],
      mulligans: { left: d.mulligans },
      theme(i) { return themeFor(this.holes[i], this.def); },
      ready(i) { return !!this.holes[i]; },
      ensure(i) {},
      pump(ms) {
        // priority: current hole, then next
        for (const i of [this.idx, this.idx + 1]) {
          if (i >= this.n || this.holes[i]) continue;
          this.ensure(i);
          const j = this.jobs[i];
          if (!j) continue;
          if (j.step(ms)) { if (j.hole) this.holes[i] = j.hole; delete this.jobs[i]; }
          return;
        }
      },
      jobStatus(i) { const j = this.jobs[i]; return j ? j.status() : null; },
      // hole score = raw strokes - swish bonus (scores[i] = {strokes, bonus, score, par, failed?})
      totalStrokes() { return this.scores.reduce((a, s) => a + (s ? (s.score !== undefined ? s.score : s.strokes) : 0), 0); },
      totalRaw() { return this.scores.reduce((a, s) => a + (s ? s.strokes : 0), 0); },
      totalBonus() { return this.scores.reduce((a, s) => a + (s && s.bonus ? s.bonus : 0), 0); },
      totalPar() { let p = 0; for (let i = 0; i < Math.min(this.n, this.holes.length); i++) if (this.holes[i]) p += this.holes[i].par; return p; },
    };
  }

  function fromHoles(kind, def, holes, diff) {
    const r = base(kind, def, holes.length, diff);
    r.holes = holes.slice();
    return r;
  }

  function generated(kind, def, holeParams, diff) {
    const r = base(kind, def, holeParams.length, diff);
    r.ensure = function (i) {
      if (this.holes[i] || this.jobs[i] || i >= this.n) return;
      const hp = holeParams[i];
      this.jobs[i] = makeJob((attempt) => {
        // same re-seed/simplify loop the verifier tests (tools/lib.js runtimeCase)
        const p = attempt ? G.Generator.retryParams(hp, attempt) : hp;
        const h = G.Generator.generateHole(p);
        if (h && !h.name) h.name = (def && def.name ? def.name : 'Hole') + ' ' + (i + 1);
        return h;
      }, 'Hole ' + (i + 1));
    };
    return r;
  }

  function endless(settings, diff) {
    const r = base('endless', null, Infinity, diff);
    r.settings = settings; r.score = 0; r.cleared = 0; r.underPar = 0;
    r.ensure = function (i) {
      if (this.holes[i] || this.jobs[i]) return;
      this.jobs[i] = makeJob((attempt) => {
        const s = Object.assign({}, settings, { seed: (settings.seed >>> 0) + attempt * 7919 });
        const h = G.Generator.endlessHole(s, i);
        if (h && !h.name) h.name = 'Endless #' + (i + 1);
        return h;
      }, 'Hole ' + (i + 1));
    };
    // free memory of old holes
    const pump0 = r.pump;
    r.pump = function (ms) { for (let k = 0; k < this.idx - 1; k++) this.holes[k] = this.holes[k] ? { par: this.holes[k].par, gone: true } : null; pump0.call(this, ms); };
    return r;
  }

  // ---- endless leaderboard ----
  function settingsKey(s) {
    if (s.preset && s.preset !== 'custom') return s.preset;
    const c = Object.assign({}, s); delete c.seed; delete c.preset;
    const keys = Object.keys(c).sort(), o = {};
    keys.forEach((k) => { o[k] = Array.isArray(c[k]) ? c[k].slice().sort() : c[k]; });
    return 'c' + (G.RNG ? G.RNG.hashStr(JSON.stringify(o)).toString(36) : '0');
  }
  function leaderboard(key) { const all = G.Store.get('endless.lb', {}) || {}; return all[key] || []; }
  function addScore(key, entry) {
    const all = G.Store.get('endless.lb', {}) || {};
    const list = all[key] || [];
    entry.date = entry.date || (G.App && G.App.today ? G.App.today() : new Date().toISOString().slice(0, 10));
    entry.id = Date.now();
    list.push(entry);
    list.sort((a, b) => b.score - a.score || b.holes - a.holes);
    all[key] = list.slice(0, 10);
    G.Store.set('endless.lb', all);
    const rank = all[key].findIndex((e) => e.id === entry.id);
    return rank; // -1 if not in top 10
  }

  G.Run = { makeJob, fromHoles, generated, endless, themeFor, settingsKey, leaderboard, addScore };
})();
