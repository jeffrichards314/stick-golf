/* Hole share codes: hole -> compact JSON -> deflate-raw (CompressionStream when available, else a small built-in LZ) -> base64url.
 *   code = <fmt><base64url>      fmt 'd' = deflate-raw, 'z' = built-in LZ
 * Decoding never trusts the input: size limits everywhere, then HoleSchema.sanitizeHole() rebuilds a clean hole.
 * The "verified" flag of a hole is never taken from the code: the embedded bot solution is replayed on the physics.
 * UMD: browser GOLF.HoleCode, Node require() (tests).  */
(function (root, factory) {
  const isNode = typeof module === 'object' && module.exports;
  const mod = isNode ? factory(require('./holeschema.js'), require('../src/physics.js'), require('../src/bot.js'), global)
    : factory(root.GOLF.HoleSchema, root.GOLF.Physics, root.GOLF.Bot, root);
  if (isNode) module.exports = mod;
  else { root.GOLF = root.GOLF || {}; root.GOLF.HoleCode = mod; }
})(typeof self !== 'undefined' ? self : this, function (HS, Ph, Bot, env) {
  'use strict';
  const VERSION = 1;
  class CodeError extends Error {}
  const bad = (m) => new CodeError(m);
  const MAX_CODE = 60000;        // characters
  const MAX_JSON = 600000;       // decompressed bytes
  const URL_WARN = 7500;         // very long links may not survive chat apps
  const BASE_URL = 'https://jeffrichards314.github.io/stick-golf/';

  // ---------------- base64url ----------------
  const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  const B64I = new Int16Array(128).fill(-1); for (let i = 0; i < 64; i++) B64I[B64.charCodeAt(i)] = i;
  function b64enc(u8) {
    let s = '', i = 0;
    for (; i + 2 < u8.length; i += 3) { const n = (u8[i] << 16) | (u8[i + 1] << 8) | u8[i + 2]; s += B64[n >> 18] + B64[(n >> 12) & 63] + B64[(n >> 6) & 63] + B64[n & 63]; }
    if (i + 1 === u8.length) { const n = u8[i] << 16; s += B64[n >> 18] + B64[(n >> 12) & 63]; }
    else if (i + 2 === u8.length) { const n = (u8[i] << 16) | (u8[i + 1] << 8); s += B64[n >> 18] + B64[(n >> 12) & 63] + B64[(n >> 6) & 63]; }
    return s;
  }
  function b64dec(s) {
    const n = s.length; if (n % 4 === 1) throw bad('Bad code');
    const out = new Uint8Array(Math.floor(n * 3 / 4)); let o = 0, buf = 0, bits = 0;
    for (let i = 0; i < n; i++) {
      const c = s.charCodeAt(i), v = c < 128 ? B64I[c] : -1; if (v < 0) throw bad('Bad character in code');
      buf = (buf << 6) | v; bits += 6;
      if (bits >= 8) { bits -= 8; out[o++] = (buf >> bits) & 255; buf &= (1 << bits) - 1; }
    }
    return out.subarray(0, o);
  }

  // ---------------- built-in LZ (fallback compressor) ----------------
  // varint(outLen), then groups of: flag byte (bit i = item i is a match) + up to 8 items; literal = 1 byte, match = off16le + (len-4)
  function lzCompress(src) {
    const n = src.length, out = [];
    let v = n; while (v >= 128) { out.push((v & 127) | 128); v >>>= 7; } out.push(v);
    const HB = 15, head = new Int32Array(1 << HB).fill(-1), prev = new Int32Array(n).fill(-1);
    const hash = (i) => ((src[i] * 506832829 + src[i + 1] * 2654435 + src[i + 2] * 40503 + src[i + 3]) >>> 0) >>> (32 - HB);
    let flagPos = -1, flags = 0, nItems = 0;
    const startGroup = () => { flagPos = out.length; out.push(0); flags = 0; nItems = 0; };
    const endItem = () => { if (++nItems === 8) { out[flagPos] = flags; flagPos = -1; } };
    let i = 0;
    const ins = (p) => { if (p + 3 < n) { const h = hash(p); prev[p] = head[h]; head[h] = p; } };
    while (i < n) {
      if (flagPos < 0) startGroup();
      let bl = 0, bo = 0;
      if (i + 3 < n) {
        let c = head[hash(i)], tries = 48;
        while (c >= 0 && tries-- > 0 && i - c <= 65535) {
          let l = 0; const max = Math.min(259, n - i);
          while (l < max && src[c + l] === src[i + l]) l++;
          if (l > bl) { bl = l; bo = i - c; if (l === max) break; }
          c = prev[c];
        }
      }
      if (bl >= 4) {
        flags |= 1 << nItems; out.push(bo & 255, bo >> 8, bl - 4); endItem();
        for (let k = 0; k < bl; k++) ins(i + k);
        i += bl;
      } else { out.push(src[i]); endItem(); ins(i); i++; }
    }
    if (flagPos >= 0) out[flagPos] = flags;
    return Uint8Array.from(out);
  }
  function lzDecompress(src, maxOut) {
    let p = 0, n = 0, sh = 0;
    for (;;) { if (p >= src.length || sh > 28) throw bad('Corrupt code'); const b = src[p++]; n |= (b & 127) << sh; if (b < 128) break; sh += 7; }
    if (n > maxOut) throw bad('Code is too large');
    const out = new Uint8Array(n); let o = 0;
    while (o < n) {
      if (p >= src.length) throw bad('Corrupt code');
      const fl = src[p++];
      for (let k = 0; k < 8 && o < n; k++) {
        if (fl & (1 << k)) {
          if (p + 3 > src.length) throw bad('Corrupt code');
          const off = src[p] | (src[p + 1] << 8), l = src[p + 2] + 4; p += 3;
          if (off === 0 || off > o || o + l > n) throw bad('Corrupt code');
          for (let q = 0; q < l; q++) { out[o] = out[o - off]; o++; }
        } else { if (p >= src.length) throw bad('Corrupt code'); out[o++] = src[p++]; }
      }
    }
    return out;
  }

  // ---------------- built-in inflate (decoder for deflate-raw when DecompressionStream is missing) ----------------
  const LBASE = [3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31, 35, 43, 51, 59, 67, 83, 99, 115, 131, 163, 195, 227, 258];
  const LEXT = [0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0];
  const DBASE = [1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193, 257, 385, 513, 769, 1025, 1537, 2049, 3073, 4097, 6145, 8193, 12289, 16385, 24577];
  const DEXT = [0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13];
  const CLORD = [16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15];
  function huff(lengths, n) {
    const count = new Uint16Array(16), symbol = new Uint16Array(n), offs = new Uint16Array(16);
    for (let i = 0; i < n; i++) count[lengths[i]]++;
    let left = 1; for (let l = 1; l < 16; l++) { left <<= 1; left -= count[l]; if (left < 0) throw bad('Corrupt code'); }
    for (let l = 1; l < 15; l++) offs[l + 1] = offs[l] + count[l];
    for (let i = 0; i < n; i++) if (lengths[i]) symbol[offs[lengths[i]]++] = i;
    return { count, symbol };
  }
  function inflateRaw(src, maxOut) {
    let pos = 0, bb = 0, bc = 0, out = new Uint8Array(Math.min(maxOut, Math.max(1024, src.length * 4))), o = 0;
    const bits = (n) => {
      while (bc < n) { if (pos >= src.length) throw bad('Corrupt code'); bb |= src[pos++] << bc; bc += 8; }
      const v = bb & ((1 << n) - 1); bb >>>= n; bc -= n; return v;
    };
    const dec = (h) => {
      let code = 0, first = 0, index = 0;
      for (let l = 1; l < 16; l++) {
        code |= bits(1); const c = h.count[l];
        if (code - c < first) return h.symbol[index + (code - first)];
        index += c; first += c; first <<= 1; code <<= 1;
      }
      throw bad('Corrupt code');
    };
    const put = (b) => {
      if (o >= out.length) { if (o >= maxOut) throw bad('Code is too large'); const g = new Uint8Array(Math.min(maxOut, out.length * 2)); g.set(out); out = g; }
      out[o++] = b;
    };
    let fixedL = null, fixedD = null;
    let last;
    do {
      last = bits(1); const type = bits(2);
      if (type === 0) {
        bb = 0; bc = 0;
        if (pos + 4 > src.length) throw bad('Corrupt code');
        const len = src[pos] | (src[pos + 1] << 8), nlen = src[pos + 2] | (src[pos + 3] << 8); pos += 4;
        if ((len ^ 0xffff) !== nlen || pos + len > src.length) throw bad('Corrupt code');
        for (let i = 0; i < len; i++) put(src[pos++]);
      } else if (type === 1 || type === 2) {
        let hl, hd;
        if (type === 1) {
          if (!fixedL) {
            const l = new Uint8Array(288); for (let i = 0; i < 144; i++) l[i] = 8; for (let i = 144; i < 256; i++) l[i] = 9; for (let i = 256; i < 280; i++) l[i] = 7; for (let i = 280; i < 288; i++) l[i] = 8;
            fixedL = huff(l, 288); fixedD = huff(new Uint8Array(30).fill(5), 30);
          }
          hl = fixedL; hd = fixedD;
        } else {
          const nlen = bits(5) + 257, ndist = bits(5) + 1, ncode = bits(4) + 4;
          if (nlen > 286 || ndist > 30) throw bad('Corrupt code');
          const cl = new Uint8Array(19); for (let i = 0; i < ncode; i++) cl[CLORD[i]] = bits(3);
          const hc = huff(cl, 19), lens = new Uint8Array(nlen + ndist);
          let idx = 0;
          while (idx < nlen + ndist) {
            const sym = dec(hc);
            if (sym < 16) lens[idx++] = sym;
            else {
              let rep, v = 0;
              if (sym === 16) { if (idx === 0) throw bad('Corrupt code'); v = lens[idx - 1]; rep = 3 + bits(2); }
              else if (sym === 17) rep = 3 + bits(3); else rep = 11 + bits(7);
              if (idx + rep > nlen + ndist) throw bad('Corrupt code');
              while (rep--) lens[idx++] = v;
            }
          }
          if (lens[256] === 0) throw bad('Corrupt code');
          hl = huff(lens.subarray(0, nlen), nlen); hd = huff(lens.subarray(nlen), ndist);
        }
        for (;;) {
          const sym = dec(hl);
          if (sym < 256) put(sym);
          else if (sym === 256) break;
          else {
            const s = sym - 257; if (s >= 29) throw bad('Corrupt code');
            const l = LBASE[s] + bits(LEXT[s]), ds = dec(hd); if (ds >= 30) throw bad('Corrupt code');
            const d = DBASE[ds] + bits(DEXT[ds]); if (d > o) throw bad('Corrupt code');
            for (let i = 0; i < l; i++) put(out[o - d]);
          }
        }
      } else throw bad('Corrupt code');
    } while (!last);
    return out.slice(0, o);
  }

  // ---------------- native streams ----------------
  const hasNative = (k) => { try { return typeof env[k] === 'function' && !!new env[k]('deflate-raw'); } catch (e) { return false; } };
  const nativeOK = () => hasNative('CompressionStream');
  const nativeInflateOK = () => hasNative('DecompressionStream');
  async function nativeDeflate(bytes) {
    const cs = new env.CompressionStream('deflate-raw'), w = cs.writable.getWriter();
    w.write(bytes).catch(() => {}); w.close().catch(() => {});
    const r = cs.readable.getReader(), parts = []; let tot = 0;
    for (;;) { const { done, value } = await r.read(); if (done) break; parts.push(value); tot += value.length; }
    const out = new Uint8Array(tot); let o = 0; for (const p of parts) { out.set(p, o); o += p.length; }
    return out;
  }
  async function nativeInflate(bytes, maxOut) {
    const ds = new env.DecompressionStream('deflate-raw'), w = ds.writable.getWriter();
    w.write(bytes).catch(() => {}); w.close().catch(() => {});
    const r = ds.readable.getReader(), parts = []; let tot = 0;
    for (;;) {
      const { done, value } = await r.read(); if (done) break;
      tot += value.length; if (tot > maxOut) { try { r.cancel(); } catch (e) { /* */ } throw bad('Code is too large'); }
      parts.push(value);
    }
    const out = new Uint8Array(tot); let o = 0; for (const p of parts) { out.set(p, o); o += p.length; }
    return out;
  }

  // ---------------- hole <-> payload ----------------
  const themes = () => {
    const M = env.GOLF && env.GOLF.Manifest;
    if (M && M.byId) return M.byId;
    try { return require('../src/manifest.js').byId; } catch (e) { return null; }
  };
  const delta = (p) => { const o = []; let px = 0, py = 0; for (let i = 0; i < p.length; i += 2) { o.push(p[i] - px, p[i + 1] - py); px = p[i]; py = p[i + 1]; } return o; };
  const undelta = (d) => { const o = []; let px = 0, py = 0; for (let i = 0; i + 1 < d.length; i += 2) { px += d[i]; py += d[i + 1]; o.push(px, py); } return o; };
  function pack(hole, withBot) {
    const o = { v: VERSION, n: hole.name, th: hole.theme, s: hole.seed, p: hole.par, h: hole.h, t: hole.tee, c: hole.cup, g: delta(hole.ground), gs: hole.gs };
    if (hole.cupW) o.cw = hole.cupW;
    if (hole.auto) o.a = 1;
    if (hole.solids.length) o.o = hole.solids.map((so) => ({ p: delta(so.p), s: so.s }));
    if (hole.gm.length) o.m = hole.gm;
    if (withBot && hole.bot) { const f = []; hole.bot.shots.forEach((q) => f.push(q[0], q[1])); o.b = f; }
    return o;
  }
  function unpack(o) {
    if (!o || typeof o !== 'object' || Array.isArray(o)) throw bad('Not a hole code');
    if (o.v !== VERSION) throw bad(o.v > VERSION ? 'This hole was made with a newer version of the game' : 'Unknown hole format');
    if (!Array.isArray(o.g)) throw bad('Not a hole code');
    const raw = { name: o.n, theme: o.th, seed: o.s, par: o.p, h: o.h, tee: o.t, cup: o.c, ground: undelta(o.g), gs: o.gs, cupW: o.cw, auto: !!o.a,
      solids: Array.isArray(o.o) ? o.o.map((so) => ({ p: so && Array.isArray(so.p) ? undelta(so.p) : [], s: so && so.s })) : [], gm: Array.isArray(o.m) ? o.m : [] };
    if (Array.isArray(o.b) && o.b.length % 2 === 0) { const shots = []; for (let i = 0; i < o.b.length; i += 2) shots.push([o.b[i], o.b[i + 1]]); raw.bot = { shots }; }
    return raw;
  }

  // clean + canonical (rounded) copy of a hole; the bot solution survives only when the geometry did not change
  function canon(hole) {
    const before = HS.geoKey(hole);
    const r = HS.sanitizeHole(hole, { themes: themes() });
    const h = r.hole;
    if (hole.bot && HS.geoKey(h) !== before) delete h.bot;
    return h;
  }
  // does the stored solution still beat the hole in <= par+2 strokes on this machine's physics?
  function check(hole) {
    if (!hole || !hole.bot || !hole.bot.shots || !Bot || !Bot.replay) return { verified: false, strokes: 0 };
    try {
      const r = Bot.replay(hole, hole.bot.shots.map((q) => ({ a: q[0], p: q[1] })));
      return { verified: !!(r.ok && r.strokes <= hole.par + 2), strokes: r.strokes };
    } catch (e) { return { verified: false, strokes: 0 }; }
  }
  // round shots so the code stays short, but only as far as the solution still holds
  function compactShots(hole, shots) {
    for (const dp of [3, 4, 5]) {
      const f = Math.pow(10, dp), q = shots.map((s) => ({ a: Math.round(s.a * f) / f, p: Math.max(0.02, Math.min(1, Math.round(s.p * f) / f)) }));
      const r = Bot.replay(hole, q);
      if (r.ok) return q.map((s) => [s.a, s.p]);
    }
    return shots.map((s) => [s.a, s.p]);
  }

  // ---------------- encode / decode ----------------
  function toBytes(hole, withBot) { return new TextEncoder().encode(JSON.stringify(pack(canon(hole), withBot))); }
  // sync, built-in LZ only (tests + fallback)
  function encodeSync(hole, withBot) { return 'z' + b64enc(lzCompress(toBytes(hole, withBot !== false))); }
  async function encode(hole, opts) {
    opts = opts || {};
    const bytes = toBytes(hole, opts.bot !== false);
    if (!opts.noNative && nativeOK()) { try { return 'd' + b64enc(await nativeDeflate(bytes)); } catch (e) { /* fall through to LZ */ } }
    return 'z' + b64enc(lzCompress(bytes));
  }
  // -> { hole, warn:[], verified, strokes }   (rejects with Error(message) for anything malformed)
  async function decode(code, opts) {
    try { return await decodeInner(code, opts); } catch (e) { throw e instanceof CodeError ? e : bad('Corrupt code'); }
  }
  async function decodeInner(code, opts) {
    opts = opts || {};
    if (typeof code !== 'string') throw bad('No code');
    code = code.trim();
    if (code.length < 8) throw bad('That code is too short');
    if (code.length > MAX_CODE) throw bad('That code is too long');
    const fmt = code.charAt(0);
    if (fmt !== 'd' && fmt !== 'z') throw bad('Not a hole code');
    const data = b64dec(code.slice(1));
    let bytes;
    if (fmt === 'z') bytes = lzDecompress(data, MAX_JSON);
    else if (!opts.noNative && nativeInflateOK()) bytes = await nativeInflate(data, MAX_JSON);
    else bytes = inflateRaw(data, MAX_JSON);
    if (bytes.length > MAX_JSON) throw bad('Code is too large');
    let text; try { text = new TextDecoder('utf-8', { fatal: true }).decode(bytes); } catch (e) { throw bad('Corrupt code'); }
    let obj; try { obj = JSON.parse(text); } catch (e) { throw bad('Corrupt code'); }
    let r; try { r = HS.sanitizeHole(unpack(obj), { themes: themes() }); } catch (e) { throw bad(e.message); }
    const hole = r.hole;
    let verified = false, strokes = 0;
    if (hole.bot) { const c = check(hole); verified = c.verified; strokes = c.strokes; if (!verified) delete hole.bot; }
    return { hole, warn: r.warn, verified, strokes };
  }
  // accept a bare code, a full share URL, or text containing one
  function parseInput(text) {
    let t = String(text === undefined || text === null ? '' : text).trim();
    if (!t) return null;
    const m = /[#?&]hole=([A-Za-z0-9_-]+)/.exec(t) || /^hole=([A-Za-z0-9_-]+)$/.exec(t);
    if (m) return m[1];
    t = t.replace(/^["'`]+|["'`]+$/g, '').replace(/\s+/g, '');
    return /^[dz][A-Za-z0-9_-]{7,}$/.test(t) ? t : null;
  }
  const url = (code, base) => (base || BASE_URL) + '#hole=' + code;

  return {
    VERSION, MAX_CODE, MAX_JSON, URL_WARN, BASE_URL, encode, encodeSync, decode, parseInput, url, canon, check, compactShots, pack, unpack,
    nativeSupported: nativeOK, _lz: { compress: lzCompress, decompress: lzDecompress }, _inflate: inflateRaw, _b64: { enc: b64enc, dec: b64dec },
  };
});
