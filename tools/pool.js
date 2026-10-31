// Minimal worker_threads pool: run(tasks) -> results in order.
'use strict';
const { Worker } = require('worker_threads');
const os = require('os');
const path = require('path');

function runPool(tasks, onDone) {
  const n = Math.max(1, Math.min(tasks.length, (os.cpus().length || 4) - 0));
  const results = new Array(tasks.length);
  let next = 0, finished = 0;
  return new Promise((resolve, reject) => {
    if (!tasks.length) return resolve(results);
    const workers = [];
    const feed = (w) => {
      if (next >= tasks.length) { w.terminate(); return; }
      const i = next++;
      w._i = i;
      w.postMessage(tasks[i]);
    };
    for (let k = 0; k < n; k++) {
      const w = new Worker(path.join(__dirname, 'worker.js'));
      w.on('message', (res) => {
        results[w._i] = res; finished++;
        if (onDone) onDone(res, finished, tasks.length);
        if (finished === tasks.length) { workers.forEach((x) => x.terminate()); resolve(results); }
        else feed(w);
      });
      w.on('error', reject);
      workers.push(w);
      feed(w);
    }
  });
}
module.exports = { runPool };
