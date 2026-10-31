/* Camera: cam.x/cam.y = world point at the screen CENTRE, zoom = screen px per world px. */
(function () {
  'use strict';
  const G = window.GOLF = window.GOLF || {};
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

  function create() {
    const cam = {
      x: 0, y: 0, zoom: 0.8, vw: 800, vh: 600, baseZoom: 0.8, userMul: 1,
      hole: null, intro: null, look: { x: 0, y: 0, on: false }, lookAmt: 0, lax: 0, lay: 0,
      setViewport(w, h) {
        this.vw = w; this.vh = h;
        // show at least ~1500x800 world px (about one full-power shot) on any screen shape
        this.baseZoom = clamp(Math.min(w / 1500, h / 800), 0.28, 1.0);
      },
      targetZoom() { return clamp(this.baseZoom * this.userMul, 0.3, 1.6); },
      zoomBy(f) { this.userMul = clamp(this.userMul * f, 0.5, 2.5); },
      setHole(hole, intro) {
        this.hole = hole;
        this.look.x = 0; this.look.y = 0; this.look.on = false; this.lookAmt = 0; this.lax = 0; this.lay = 0;
        this.zoom = this.targetZoom();
        if (intro && hole) {
          this.intro = { t: 0, hold: 0.8, pan: 1.2 };
          this.x = hole.cup[0]; this.y = hole.cup[1] - 60;
        } else { this.intro = null; if (hole) { this.x = hole.tee[0]; this.y = hole.tee[1] - 40; } }
        const c = this.clampPt(this.x, this.y); this.x = c[0]; this.y = c[1];
      },
      skipIntro() { if (this.intro) { this.intro = null; return true; } return false; },
      inIntro() { return !!this.intro; },
      clampPt(x, y) {
        const h = this.hole; if (!h) return [x, y];
        const hw = this.vw / 2 / this.zoom, hh = this.vh / 2 / this.zoom;
        if (h.w + 300 > hw * 2) x = clamp(x, hw - 150, h.w - hw + 150); else x = h.w / 2;
        y = clamp(y, -2600 + hh, Math.max(-2600 + hh, h.h - hh + 90));
        return [x, y];
      },
      pan(dsx, dsy) { this.look.x -= dsx / this.zoom; this.look.y -= dsy / this.zoom; },
      update(dt, ball) {
        const tz = this.targetZoom();
        this.zoom += (tz - this.zoom) * (1 - Math.exp(-dt * 6));
        const h = this.hole;
        if (!h) return;
        if (this.intro) {
          const I = this.intro; I.t += dt;
          const cx = h.cup[0], cy = h.cup[1] - 60, tx = h.tee[0], ty = h.tee[1] - 40;
          let k = I.t < I.hold ? 0 : ease(clamp((I.t - I.hold) / I.pan, 0, 1));
          const a = this.clampPt(cx, cy), b = this.clampPt(tx, ty);
          this.x = a[0] + (b[0] - a[0]) * k; this.y = a[1] + (b[1] - a[1]) * k;
          if (I.t >= I.hold + I.pan) this.intro = null;
          return;
        }
        // look-ahead in velocity direction
        let vx = ball ? ball.vx || 0 : 0, vy = ball ? ball.vy || 0 : 0;
        const hw = this.vw / 2 / this.zoom, hh = this.vh / 2 / this.zoom;
        const lx = clamp(vx * 0.35, -hw * 0.45, hw * 0.45), ly = clamp(vy * 0.25, -hh * 0.4, hh * 0.4);
        const kl = 1 - Math.exp(-dt * 2.2);
        this.lax += (lx - this.lax) * kl; this.lay += (ly - this.lay) * kl;
        // when looking, offset stays; otherwise decays
        if (!this.look.on) { const kd = 1 - Math.exp(-dt * 3); this.look.x -= this.look.x * kd; this.look.y -= this.look.y * kd; }
        const bx = ball ? ball.x : h.tee[0], by = ball ? ball.y : h.tee[1];
        let tx = bx + this.lax + this.look.x, ty = by - 40 / this.zoom + this.lay + this.look.y;
        if (this.look.on) {
          // keep look offset within the world
          const c = this.clampPt(tx, ty); this.look.x += c[0] - tx; this.look.y += c[1] - ty; tx = c[0]; ty = c[1];
        } else { const c = this.clampPt(tx, ty); tx = c[0]; ty = c[1]; }
        const sp = Math.hypot(vx, vy);
        const k = 1 - Math.exp(-dt * (this.look.on ? 14 : 3.5 + Math.min(4, sp / 400)));
        this.x += (tx - this.x) * k; this.y += (ty - this.y) * k;
      },
      view() { return { x: this.x, y: this.y, zoom: this.zoom }; },
    };
    return cam;
  }
  G.Camera = { create };
})();
