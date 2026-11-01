/* Achievements (ids fixed by docs/CONTRACT.md). Persisted as {id: 'YYYY-MM-DD'} under 'achievements'.
 * Stat-based ones are evaluated by check(); event-based ones are granted by the game flow via grant(id). */
(function () {
  'use strict';
  const G = window.GOLF = window.GOLF || {};
  const Store = () => G.Store;
  const nG = () => ((G.Manifest && G.Manifest.GIMMICKS) || []).length || 59;
  const st = (k) => (c) => +c.stats[k] || 0;

  // stat: (ctx) -> current value ; need: target. No stat => event-based.
  const LIST = [
    { id: 'first_hole', icon: '⛳', name: 'First Drop', desc: 'Hole your first ball.', stat: st('holes'), need: 1 },
    { id: 'first_round', icon: '🏌', name: 'Card Signed', desc: 'Finish your first round.', stat: (c) => (+c.stats.rounds || 0) + (+c.stats.nines || 0) + (+c.stats.daily || 0) + (+c.stats.randoms || 0) + (+c.stats.remixRounds || 0), need: 1 },
    { id: 'under_par_round', icon: '📉', name: 'In the Red', desc: 'Finish a round under par.' },
    { id: 'ace', icon: '🎯', name: 'Ace!', desc: 'Make a hole-in-one.', stat: st('aces'), need: 1 },
    { id: 'ace5', icon: '🎯', name: 'Ace Collector', desc: 'Make 5 holes-in-one.', stat: st('aces'), need: 5 },
    { id: 'swish', icon: '💫', name: 'Nothing but Cup', desc: 'Sink a swish (straight in, no green).', stat: st('swishes'), need: 1 },
    { id: 'swish10', icon: '💫', name: 'Swish Machine', desc: 'Sink 10 swishes.', stat: st('swishes'), need: 10 },
    { id: 'swish_ace', icon: '🌠', name: 'Swish Ace', desc: 'A swish hole-in-one.', stat: st('swishAces'), need: 1 },
    { id: 'birdie10', icon: '🐦', name: 'Birdwatcher', desc: 'Make 10 birdies or better.', stat: st('birdies'), need: 10 },
    { id: 'birdie100', icon: '🦜', name: 'Aviary', desc: 'Make 100 birdies or better.', stat: st('birdies'), need: 100 },
    { id: 'eagle', icon: '🦅', name: 'Eagle Eye', desc: 'Make an eagle or better.', stat: st('eagles'), need: 1 },
    { id: 'clean_nine', icon: '🧼', name: 'Clean Nine', desc: 'Play 9 holes in a round without a bogey.' },
    { id: 'perfect_round', icon: '💎', name: 'Perfect Round', desc: 'Finish 18 holes, every hole at par or better.' },
    { id: 'no_mulligan_round', icon: '🙅', name: 'No Takebacks', desc: 'Finish 18 holes without a mulligan.' },
    { id: 'lightning_hole', icon: '⚡', name: 'Lightning', desc: 'Hole out under par in under 8 seconds.' },
    { id: 'speed_nine', icon: '⏱', name: 'Speed Nine', desc: 'Play nine holes under par in under 3 minutes.' },
    { id: 'speed_18', icon: '🏎', name: 'Speed Eighteen', desc: 'Play 18 holes under par in under 8 minutes.' },
    { id: 'courses10', icon: '🥉', name: 'Tourist', desc: 'Clear 10 courses under par.', stat: (c) => c.cleared, need: 10 },
    { id: 'courses30', icon: '🥈', name: 'Tour Pro', desc: 'Clear 30 courses under par.', stat: (c) => c.cleared, need: 30 },
    { id: 'courses60', icon: '🥇', name: 'Grand Tour', desc: 'Clear all 60 courses under par.', stat: (c) => c.cleared, need: 60 },
    { id: 'tutorials_all', icon: '🎓', name: 'Graduate', desc: 'Complete every gimmick tutorial.', stat: (c) => c.tutorials, need: 0 /* = all gimmicks */ },
    { id: 'gimmick_hunter', icon: '🔍', name: 'Gimmick Hunter', desc: 'Meet 30 different gimmicks.', stat: (c) => c.gimmicks, need: 30 },
    { id: 'gimmick_master', icon: '🧠', name: 'Gimmick Master', desc: 'Meet every gimmick.', stat: (c) => c.gimmicks, need: 0 },
    { id: 'daily3', icon: '📅', name: 'Habit', desc: 'Play the Daily 3 days in a row.', stat: (c) => c.streak, need: 3 },
    { id: 'daily7', icon: '🗓', name: 'Devotee', desc: 'Play the Daily 7 days in a row.', stat: (c) => c.streak, need: 7 },
    { id: 'endless10', icon: '♾', name: 'Endurance', desc: 'Clear 10 holes in one Endless run.', stat: st('endless'), need: 10 },
    { id: 'endless25', icon: '♾', name: 'Long Haul', desc: 'Clear 25 holes in one Endless run.', stat: st('endless'), need: 25 },
    { id: 'endless50', icon: '♾', name: 'Unstoppable', desc: 'Clear 50 holes in one Endless run.', stat: st('endless'), need: 50 },
    { id: 'remix_round', icon: '🔁', name: 'Mirror Mirror', desc: 'Finish a Remix round.', stat: st('remixRounds'), need: 1 },
    { id: 'remix_under_par', icon: '🪞', name: 'Through the Looking Glass', desc: 'Finish a Remix round under par.' },
    { id: 'practice50', icon: '🧪', name: 'Range Rat', desc: 'Play 50 practice holes.', stat: st('practice'), need: 50 },
    { id: 'spin_doctor', icon: '🌀', name: 'Spin Doctor', desc: 'Finish 25 holes with a spin shot.', stat: st('spinHoles'), need: 25 },
    { id: 'pro_round', icon: '🏆', name: 'Pro Card', desc: 'Finish a round under par on Pro (or harder).' },
    { id: 'insane_round', icon: '💀', name: 'Certified Insane', desc: 'Finish any round on Insane.' },
    { id: 'comeback', icon: '🔥', name: 'Comeback', desc: 'Score under par on a hole after finding a hazard.' },
    { id: 'marathon', icon: '🥾', name: 'Marathon', desc: 'Take 1,000 shots.', stat: st('shots'), need: 1000 },
  ];
  const byId = {}; LIST.forEach((a) => { byId[a.id] = a; });

  function today() { return G.App && G.App.today ? G.App.today() : new Date().toISOString().slice(0, 10); }
  let data = null;
  function all() { if (!data) data = Store().get('achievements', {}) || {}; return data; }
  function save() { Store().set('achievements', all()); }
  function has(id) { return !!all()[id]; }
  function count() { return Object.keys(all()).filter((k) => byId[k]).length; }
  function need(a) { return a.need === 0 ? nG() : a.need; }
  function ctx() {
    const P = G.Progress;
    return {
      stats: Store().getStats(),
      cleared: P && P.clearedCount ? P.clearedCount() : 0,
      tutorials: P && P.gimmickTutorialsDone ? P.gimmickTutorialsDone() : 0,
      gimmicks: P && P.seenCount ? P.seenCount() : 0,
      streak: P && P.dailyStreak ? Math.max(P.dailyStreak().cur, +Store().getStats().dailyStreak || 0) : 0,
    };
  }
  // {cur, need, frac} for stat-based achievements; null for event ones
  function progress(id, c) {
    const a = byId[id]; if (!a || !a.stat) return null;
    const n = need(a), cur = Math.min(n, a.stat(c || ctx()));
    return { cur: has(id) ? n : cur, need: n, frac: has(id) ? 1 : cur / n };
  }
  let pendingToasts = [];
  function flush(list) {
    if (!list.length) return list;
    save();
    if (G.UI && G.UI.achToasts) G.UI.achToasts(list.map((id) => byId[id]));
    else pendingToasts = pendingToasts.concat(list);
    return list;
  }
  function grant(ids) {
    const fresh = [];
    (Array.isArray(ids) ? ids : [ids]).forEach((id) => { if (byId[id] && !has(id)) { all()[id] = today(); fresh.push(id); } });
    return flush(fresh);
  }
  function check() {
    const c = ctx(), fresh = [];
    LIST.forEach((a) => { if (a.stat && !has(a.id) && a.stat(c) >= need(a)) { all()[a.id] = today(); fresh.push(a.id); } });
    return flush(fresh);
  }
  function state() {
    const c = ctx(), d = all();
    return LIST.map((a) => ({ a, earned: d[a.id] || null, prog: progress(a.id, c) }));
  }
  function reset() { data = {}; save(); }
  G.Achievements = { LIST, byId, has, count, total: () => LIST.length, grant, check, progress, state, reset, earnedDate: (id) => all()[id] || null };
})();
