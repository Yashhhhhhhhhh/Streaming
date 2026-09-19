// ==========================================================================
// SYNCWATCH — ATMOSPHERIC PARTICLE ENGINE (AOT PHYSICS)
// Theme-Adaptive Ambient Shaders: Molten Embers, Forest Spores, Stardust
// ==========================================================================

class ParticleSystem {
  constructor(canvasId) {
    this.canvas = document.getElementById(canvasId);
    if (!this.canvas) return;
    this.ctx = this.canvas.getContext('2d');
    this.particles = [];
    this.animationId = null;

    this.mouse = { x: null, y: null, radius: 120 };
    this.currentMode = 'scout';

    this.init();
    this.setupEvents();
    this.animate();
  }

  init() {
    this.resize();
    this.detectMode();
    this.createParticles();
  }

  detectMode() {
    const theme = document.documentElement.getAttribute('data-theme') || 'scout';
    if (theme === 'rumbling') {
      this.currentMode = 'rumbling';
    } else if (theme === 'coordinate') {
      this.currentMode = 'coordinate';
    } else if (theme === 'wall') {
      this.currentMode = 'wall';
    } else {
      this.currentMode = 'scout';
    }
  }

  setTheme(theme) {
    this.detectMode();
    this.createParticles();
  }

  resize() {
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
  }

  createParticles() {
    this.particles = [];
    const count = this.currentMode === 'rumbling' ? 80 : 50;

    for (let i = 0; i < count; i++) {
      this.particles.push(this.generateParticle());
    }
  }

  generateParticle() {
    const w = this.canvas.width;
    const h = this.canvas.height;

    if (this.currentMode === 'rumbling') {
      // Upward rising molten embers
      return {
        x: Math.random() * w,
        y: h + Math.random() * 50,
        size: Math.random() * 2.5 + 0.8,
        speedY: -(Math.random() * 1.8 + 0.6),
        speedX: (Math.random() - 0.5) * 0.8,
        alpha: Math.random() * 0.8 + 0.2,
        decay: Math.random() * 0.003 + 0.001,
        color: Math.random() > 0.4 ? '234, 88, 12' : '249, 115, 22' // Amber / Molten
      };
    } else if (this.currentMode === 'coordinate') {
      // Celestial Stardust
      return {
        x: Math.random() * w,
        y: Math.random() * h,
        size: Math.random() * 2.0 + 0.5,
        speedX: (Math.random() - 0.5) * 0.3,
        speedY: (Math.random() - 0.5) * 0.3,
        alpha: Math.random() * 0.7 + 0.2,
        pulse: Math.random() * 0.02,
        color: Math.random() > 0.3 ? '56, 189, 248' : '186, 230, 253' // Cyan / Sky
      };
    } else if (this.currentMode === 'wall') {
      // Torchlit dust motes
      return {
        x: Math.random() * w,
        y: Math.random() * h,
        size: Math.random() * 2.2 + 0.6,
        speedX: (Math.random() - 0.5) * 0.25,
        speedY: Math.random() * 0.2 + 0.05,
        alpha: Math.random() * 0.5 + 0.15,
        color: '217, 119, 6' // Torch bronze
      };
    } else {
      // Scout / Recon: Forest Spores & Fireflies
      return {
        x: Math.random() * w,
        y: Math.random() * h,
        size: Math.random() * 2.2 + 0.7,
        speedX: (Math.random() - 0.5) * 0.4,
        speedY: (Math.random() - 0.5) * 0.4,
        alpha: Math.random() * 0.6 + 0.2,
        color: '59, 138, 90' // Scout green
      };
    }
  }

  setupEvents() {
    window.addEventListener('resize', () => {
      this.resize();
      this.createParticles();
    });

    window.addEventListener('mousemove', (e) => {
      this.mouse.x = e.clientX;
      this.mouse.y = e.clientY;
    });

    window.addEventListener('mouseleave', () => {
      this.mouse.x = null;
      this.mouse.y = null;
    });
  }

  animate() {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    for (let i = 0; i < this.particles.length; i++) {
      const p = this.particles[i];

      // Update position
      p.x += p.speedX;
      p.y += p.speedY;

      // Mode-specific physics & resets
      if (this.currentMode === 'rumbling') {
        p.alpha -= p.decay;
        p.speedX += (Math.random() - 0.5) * 0.05; // Gentle turbulence
        if (p.y < -10 || p.alpha <= 0) {
          Object.assign(p, this.generateParticle());
        }
      } else {
        // Wrap around boundaries
        if (p.x < 0) p.x = this.canvas.width;
        if (p.x > this.canvas.width) p.x = 0;
        if (p.y < 0) p.y = this.canvas.height;
        if (p.y > this.canvas.height) p.y = 0;
      }

      // Draw particle glow
      this.ctx.save();
      this.ctx.beginPath();
      this.ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      this.ctx.fillStyle = `rgba(${p.color}, ${Math.max(0, p.alpha)})`;
      this.ctx.shadowBlur = this.currentMode === 'rumbling' ? 8 : 4;
      this.ctx.shadowColor = `rgba(${p.color}, 0.8)`;
      this.ctx.fill();
      this.ctx.restore();

      // Scout & Coordinate mode: subtle constellation connection lines
      if (this.currentMode === 'scout' || this.currentMode === 'coordinate') {
        for (let j = i + 1; j < this.particles.length; j++) {
          const p2 = this.particles[j];
          const dx = p.x - p2.x;
          const dy = p.y - p2.y;
          const dist = Math.sqrt(dx * dx + dy * dy);

          if (dist < 110) {
            const lineAlpha = (1 - dist / 110) * 0.12;
            this.ctx.beginPath();
            this.ctx.moveTo(p.x, p.y);
            this.ctx.lineTo(p2.x, p2.y);
            this.ctx.strokeStyle = `rgba(${p.color}, ${lineAlpha})`;
            this.ctx.lineWidth = 0.75;
            this.ctx.stroke();
          }
        }
      }
    }

    this.animationId = requestAnimationFrame(() => this.animate());
  }
}

// Global instance
let particleSystem = null;
document.addEventListener('DOMContentLoaded', () => {
  window.particleSystem = new ParticleSystem('particles-canvas');
  particleSystem = window.particleSystem;
});
