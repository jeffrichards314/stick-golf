/* Pointer + keyboard input. Routes to a handler object (current play session). */
(function () {
  'use strict';
  const G = window.GOLF = window.GOLF || {};

  function create(canvas) {
    const I = {
      handler: null, // { aimStart, aimMove, aimEnd, pan, zoom, tap, keyDown, keyUp }
      keys: {}, lookHeld: false, lookToggle: false,
      ptrs: new Map(), mode: null, // 'aim' | 'pan' | 'pinch'
      pinchD: 0, pinchC: null, downAt: null,
    };
    const call = (fn, ...a) => { const h = I.handler; if (h && typeof h[fn] === 'function') return h[fn](...a); };
    const pos = (e) => { const r = canvas.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
    const looking = () => I.lookHeld || I.lookToggle;

    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    canvas.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      try { canvas.setPointerCapture(e.pointerId); } catch (er) { /* */ }
      const p = pos(e);
      I.ptrs.set(e.pointerId, p);
      if (call('tap', p[0], p[1]) === true) { I.mode = 'none'; return; } // consumed (e.g. skip intro)
      if (I.ptrs.size === 2) {
        if (I.mode === 'aim') call('aimEnd', p[0], p[1], true);
        const a = [...I.ptrs.values()];
        I.mode = 'pinch'; I.pinchD = Math.hypot(a[0][0] - a[1][0], a[0][1] - a[1][1]);
        I.pinchC = [(a[0][0] + a[1][0]) / 2, (a[0][1] + a[1][1]) / 2];
        call('lookStart');
        return;
      }
      if (I.ptrs.size > 2) return;
      if (e.button === 2 || e.button === 1 || looking()) { I.mode = 'pan'; I.last = p; call('lookStart'); return; }
      if (e.button === 0) {
        I.mode = call('aimStart', p[0], p[1]) === false ? 'pan' : 'aim';
        I.last = p;
        if (I.mode === 'pan') call('lookStart');
      }
    });
    canvas.addEventListener('pointermove', (e) => {
      if (!I.ptrs.has(e.pointerId)) return;
      const p = pos(e);
      I.ptrs.set(e.pointerId, p);
      if (I.mode === 'aim') call('aimMove', p[0], p[1]);
      else if (I.mode === 'pan') { call('pan', p[0] - I.last[0], p[1] - I.last[1]); I.last = p; }
      else if (I.mode === 'pinch' && I.ptrs.size >= 2) {
        const a = [...I.ptrs.values()];
        const d = Math.hypot(a[0][0] - a[1][0], a[0][1] - a[1][1]);
        const c = [(a[0][0] + a[1][0]) / 2, (a[0][1] + a[1][1]) / 2];
        if (I.pinchD > 10 && d > 10) call('zoom', d / I.pinchD);
        call('pan', c[0] - I.pinchC[0], c[1] - I.pinchC[1]);
        I.pinchD = d; I.pinchC = c;
      }
    });
    const up = (e) => {
      if (!I.ptrs.has(e.pointerId)) return;
      const p = pos(e);
      I.ptrs.delete(e.pointerId);
      if (I.mode === 'aim') { call('aimEnd', p[0], p[1], e.type === 'pointercancel'); I.mode = null; }
      else if (I.mode === 'pan') { I.mode = null; call('lookEnd'); }
      else if (I.mode === 'pinch') { if (I.ptrs.size === 0) { I.mode = null; call('lookEnd'); } }
      else if (I.ptrs.size === 0) I.mode = null;
    };
    canvas.addEventListener('pointerup', up);
    canvas.addEventListener('pointercancel', up);
    let wheelAcc = 0, wheelT = 0;
    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      if (!e.deltaY) return;
      // while aiming the wheel adjusts spin (one notch per ~100px of scroll; trackpads send many small deltas)
      const now = performance.now();
      if (now - wheelT > 250) wheelAcc = 0;
      wheelT = now; wheelAcc += e.deltaY;
      if (Math.abs(wheelAcc) >= 60 || Math.abs(e.deltaY) >= 60) {
        const dy = wheelAcc; wheelAcc = 0;
        if (call('wheel', dy) === true) return;
      } else if (call('isAimingNow') === true) return;
      call('zoom', e.deltaY > 0 ? 0.9 : 1.11);
    }, { passive: false });

    window.addEventListener('keydown', (e) => {
      const t = e.target;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT')) return;
      I.keys[e.code] = true;
      if (e.code === 'KeyL' && !e.repeat) { I.lookHeld = true; call('lookStart'); }
      if (call('keyDown', e.code, e) === true) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => {
      I.keys[e.code] = false;
      if (e.code === 'KeyL') { I.lookHeld = false; if (!I.lookToggle) call('lookEnd'); }
      call('keyUp', e.code, e);
    });
    window.addEventListener('blur', () => { I.keys = {}; I.lookHeld = false; });
    I.isLooking = looking;
    I.cancel = () => { if (I.mode === 'aim') call('aimEnd', 0, 0, true); I.mode = null; I.ptrs.clear(); };
    return I;
  }
  G.Input = { create };
})();
