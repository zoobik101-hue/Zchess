/* =============================================
   ZChess - Hero Particle System (lightweight)
   ============================================= */

(function() {
'use strict';

window.ZChess = window.ZChess || {};

const Particles = {
  canvas: null,
  ctx: null,
  particles: [],
  animationId: null,
  running: false,
  mouseX: -9999,
  mouseY: -9999,
  frame: 0,

  CONFIG: {
    count: 28,
    speed: 0.25,
    maxRadius: 2,
    minRadius: 0.8,
    connectionDistance: 100,
    mouseRadius: 90,
    colors: [
      'rgba(124, 58, 237,',
      'rgba(168, 85, 247,',
      'rgba(201, 162, 77,'
    ]
  },

  _shouldRun() {
    if (document.hidden) return false;
    if (document.documentElement.getAttribute('data-no-animations') === 'true') return false;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return false;
    const pageHome = document.getElementById('page-home');
    if (!pageHome || !pageHome.classList.contains('active')) return false;
    return true;
  },

  init(canvasId) {
    if (!this._shouldRun()) return;

    this.stop();
    this.canvas = document.getElementById(canvasId);
    if (!this.canvas) return;

    this.ctx = this.canvas.getContext('2d', { alpha: true });
    this.resize();
    this.createParticles();
    if (!this._eventsBound) {
      this.bindEvents();
      this._eventsBound = true;
    }
    this.running = true;
    this.animate();
  },

  resize() {
    if (!this.canvas) return;
    const parent = this.canvas.parentElement;
    const w = parent ? parent.offsetWidth : window.innerWidth;
    const h = parent ? parent.offsetHeight : 480;
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
  },

  createParticles() {
    this.particles = [];
    const { count, minRadius, maxRadius, colors } = this.CONFIG;
    const { width, height } = this.canvas;

    for (let i = 0; i < count; i++) {
      const color = colors[i % colors.length];
      this.particles.push({
        x: Math.random() * width,
        y: Math.random() * height,
        vx: (Math.random() - 0.5) * this.CONFIG.speed * 2,
        vy: (Math.random() - 0.5) * this.CONFIG.speed * 2,
        radius: minRadius + Math.random() * (maxRadius - minRadius),
        color,
        opacity: 0.25 + Math.random() * 0.35
      });
    }
  },

  _eventsBound: false,

  bindEvents() {
    let resizeTimer;
    window.addEventListener('resize', () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        if (!this.running) return;
        this.resize();
        this.createParticles();
      }, 200);
    }, { passive: true });

    document.addEventListener('visibilitychange', () => {
      if (!this._shouldRun()) this.stop();
      else if (!this.running && document.getElementById('page-home')?.classList.contains('active')) {
        this.init('hero-canvas');
      }
    });

    const parent = this.canvas?.parentElement;
    if (parent) {
      parent.addEventListener('mousemove', (e) => {
        const rect = this.canvas.getBoundingClientRect();
        this.mouseX = e.clientX - rect.left;
        this.mouseY = e.clientY - rect.top;
      }, { passive: true });
    }
  },

  animate() {
    if (!this.running) return;

    if (!this._shouldRun()) {
      this.stop();
      return;
    }

    this.animationId = requestAnimationFrame(() => this.animate());
    this.update();
    this.draw();
  },

  update() {
    const { width, height } = this.canvas;
    const { speed, mouseRadius } = this.CONFIG;

    for (const p of this.particles) {
      const dx = p.x - this.mouseX;
      const dy = p.y - this.mouseY;
      const distSq = dx * dx + dy * dy;
      const mr = mouseRadius;

      if (distSq < mr * mr && distSq > 1) {
        const dist = Math.sqrt(distSq);
        const force = (mr - dist) / mr;
        p.vx += (dx / dist) * force * 0.4;
        p.vy += (dy / dist) * force * 0.4;
      }

      p.vx *= 0.99;
      p.vy *= 0.99;

      const spd = p.vx * p.vx + p.vy * p.vy;
      const maxSpd = speed * 4;
      if (spd > maxSpd * maxSpd) {
        const s = Math.sqrt(spd);
        p.vx = (p.vx / s) * maxSpd;
        p.vy = (p.vy / s) * maxSpd;
      }

      p.x += p.vx;
      p.y += p.vy;

      if (p.x < -10) p.x = width + 10;
      if (p.x > width + 10) p.x = -10;
      if (p.y < -10) p.y = height + 10;
      if (p.y > height + 10) p.y = -10;
    }
  },

  draw() {
    const { ctx, canvas } = this;
    const { connectionDistance } = this.CONFIG;
    const distSqMax = connectionDistance * connectionDistance;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    this.frame++;
    const drawLines = this.frame % 2 === 0;

    if (drawLines) {
      for (let i = 0; i < this.particles.length; i++) {
        for (let j = i + 1; j < this.particles.length; j++) {
          const a = this.particles[i];
          const b = this.particles[j];
          const dx = a.x - b.x;
          const dy = a.y - b.y;
          const d2 = dx * dx + dy * dy;
          if (d2 < distSqMax) {
            const alpha = (1 - Math.sqrt(d2) / connectionDistance) * 0.12;
            ctx.beginPath();
            ctx.strokeStyle = `rgba(124, 58, 237, ${alpha})`;
            ctx.lineWidth = 0.5;
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
            ctx.stroke();
          }
        }
      }
    }

    for (const p of this.particles) {
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
      ctx.fillStyle = `${p.color}${p.opacity})`;
      ctx.fill();
    }
  },

  stop() {
    this.running = false;
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }
    if (this.ctx && this.canvas) {
      this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    }
  },

  destroy() {
    this.stop();
    this.particles = [];
  }
};

window.ZChess.Particles = Particles;

console.log('[ZChess] Particles module loaded');

})();
