'use strict';
const { parentPort } = require('worker_threads');
const L = require('./lib.js');

parentPort.on('message', (task) => {
  try {
    if (task.type === 'course') parentPort.postMessage(L.buildCourse(L.M.byId[task.id]));
    else if (task.type === 'try') parentPort.postMessage(require('./try.js').tryHole(task.id, task.k, task.opts));
    else if (task.type === 'verify') parentPort.postMessage(L.verifyHole(task.hole, task.opts));
    else if (task.type === 'runtime') parentPort.postMessage(L.runtimeCase(task.c));
    else parentPort.postMessage({ error: 'unknown task' });
  } catch (e) {
    parentPort.postMessage({ error: String(e && e.stack || e), task: task.type, id: task.id || (task.hole && task.hole.id) || (task.c && task.c.name) });
  }
});
