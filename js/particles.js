/* =============================================
   ZChess - Hero Particle System
   Canvas-based particle animation
   ============================================= */

(function() {
'use strict';

window.ZChess = window.ZChess || {};

const Particles = {
  canvas: null,
  ctx: null,
  particles: [],
  animationId: null,
  mouseX: 0,
  mouseY: 0,

  CONFIG: {
    count: 60,
    speed: 0.3,
    maxRadius: 2.5,
    minRadius: 0.5,
    connectionDistance: 120,
    mouseRadius: 100,
    colors: [
      'rgba(124, 58, 237,',
      'rgba(168, 85, 247,',
      'rgba(219, 39, 119,',
      'rgba(99, 102, 241,'
    ]
  },

  init(canvasId) {
    this.canvas = document.getElementById(canvasId);
    if (!this.canvas) return;

    this.ctx = this.canvas.getContext('2d');
    this.resize();
    this.createParticles();
    this.bindEvents();
    this.animate();
  },

  resize() {
    if (!this.canvas) return;
    const parent = this.canvas.parentElement;
    this.canvas.width = parent ? parent.offsetWidth : window.innerWidth;
    this.canvas.height = parent ? parent.offsetHeight : window.innerHeight;
  },

  createParticles() {
    this.particles = [];
    const { count, minRadius, maxRadius, colors } = this.CONFIG;
    const { width, height } = this.canvas;

    for (let i = 0; i < count; i++) {
      const color = colors[Math.floor(Math.random() * colors.length)];
      this.particles.push({
        x: Math.random() * width,
        y: Math.random() * height,
        vx: (Math.random() - 0.5) * this.CONFIG.speed * 2,
        vy: (Math.random() - 0.5) * this.CONFIG.speed * 2,
        radius: minRadius + Math.random() * (maxRadius - minRadius),
        color,
        opacity: 0.2 + Math.random() * 0.6,
        pulse: Math.random() * Math.PI * 2,
        pulseSpeed: 0.02 + Math.random() * 0.03
      });
    }
  },

  bindEvents() {
    window.addEventListener('resize', () => {
      this.resize();
      this.createParticles();
    });

    if (this.canvas.parentElement) {
      this.canvas.parentElement.addEventListener('mousemove', (e) => {
        const rect = this.canvas.getBoundingClientRect();
        this.mouseX = e.clientX - rect.left;
        this.mouseY = e.clientY - rect.top;
      });
    }
  },

  animate() {
    this.animationId = requestAnimationFrame(() => this.animate());
    this.update();
    this.draw();
  },

  update() {
    const { width, height } = this.canvas;
    const { speed, mouseRadius } = this.CONFIG;

    for (const p of this.particles) {
      // Mouse repulsion
      const dx = p.x - this.mouseX;
      const dy = p.y - this.mouseY;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist < mouseRadius) {
        const force = (mouseRadius - dist) / mouseRadius;
        p.vx += (dx / dist) * force * 0.5;
        p.vy += (dy / dist) * force * 0.5;
      }

      // Velocity damping
      p.vx *= 0.99;
      p.vy *= 0.99;

      // Speed limit
      const spd = Math.sqrt(p.vx * p.vx + p.vy * p.vy);
      if (spd > speed * 4) {
        p.vx = (p.vx / spd) * speed * 4;
        p.vy = (p.vy / spd) * speed * 4;
      }

      p.x += p.vx;
      p.y += p.vy;

      // Pulse
      p.pulse += p.pulseSpeed;

      // Wrap around edges
      if (p.x < -10) p.x = width + 10;
      if (p.x > width + 10) p.x = -10;
      if (p.y < -10) p.y = height + 10;
      if (p.y > height + 10) p.y = -10;
    }
  },

  draw() {
    const { ctx, canvas } = this;
    const { connectionDistance } = this.CONFIG;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw connections
    for (let i = 0; i < this.particles.length; i++) {
      for (let j = i + 1; j < this.particles.length; j++) {
        const a = this.particles[i];
        const b = this.particles[j];
        const dx = a.x - b.x;
        const dy = a.y - b.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < connectionDistance) {
          const alpha = (1 - dist / connectionDistance) * 0.15;
          ctx.beginPath();
          ctx.strokeStyle = `rgba(124, 58, 237, ${alpha})`;
          ctx.lineWidth = 0.5;
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.stroke();
        }
      }
    }

    // Draw particles
    for (const p of this.particles) {
      const pulseRadius = p.radius + Math.sin(p.pulse) * 0.5;
      const opacity = p.opacity * (0.8 + Math.sin(p.pulse) * 0.2);

      ctx.beginPath();
      ctx.arc(p.x, p.y, pulseRadius, 0, Math.PI * 2);
      ctx.fillStyle = `${p.color}${opacity})`;
      ctx.fill();

      // Glow
      const gradient = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, pulseRadius * 3);
      gradient.addColorStop(0, `${p.color}${opacity * 0.3})`);
      gradient.addColorStop(1, `${p.color}0)`);
      ctx.beginPath();
      ctx.arc(p.x, p.y, pulseRadius * 3, 0, Math.PI * 2);
      ctx.fillStyle = gradient;
      ctx.fill();
    }
  },

  stop() {
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
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
