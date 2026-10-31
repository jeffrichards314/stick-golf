// Node-only loader: registers every design file (browser loads them via <script> tags in index.html).
'use strict';
const D = require('./registry.js');
for (const f of ['core.js', 'a.js', 'b.js', 'c.js']) {
  try { require('./' + f); } catch (e) { if (e.code !== 'MODULE_NOT_FOUND' || !String(e.message).includes(f)) throw e; }
}
module.exports = D;
