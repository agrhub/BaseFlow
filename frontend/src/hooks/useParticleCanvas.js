/**
 * useParticleCanvas — Shared composable for interactive particle background animation.
 * Used by Welcome.vue and Guide.vue to avoid code duplication.
 */
import { ref, onMounted, onBeforeUnmount } from 'vue';
import { store } from '../stores';

class Particle {
  constructor(canvas) {
    this.canvas = canvas;
    this.x = Math.random() * canvas.width;
    this.y = Math.random() * canvas.height;
    this.size = Math.random() * 2 + 1;
    this.speedX = (Math.random() * 1.5) - 0.75;
    this.speedY = (Math.random() * 1.5) - 0.75;
  }

  update(mouse) {
    this.x += this.speedX;
    this.y += this.speedY;

    if (this.x < 0 || this.x > this.canvas.width) this.speedX *= -1;
    if (this.y < 0 || this.y > this.canvas.height) this.speedY *= -1;

    if (mouse.x && mouse.y) {
      const dx = mouse.x - this.x;
      const dy = mouse.y - this.y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      if (distance < mouse.radius) {
        const forceDirectionX = dx / distance;
        const forceDirectionY = dy / distance;
        const force = (mouse.radius - distance) / mouse.radius;
        this.x -= forceDirectionX * force * 1.5;
        this.y -= forceDirectionY * force * 1.5;
      }
    }
  }

  draw(ctx) {
    const isDark = store.theme === 'dark' || (store.theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    ctx.fillStyle = isDark ? '#0d9488' : '#0f766e';
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
    ctx.fill();
  }
}

export function useParticleCanvas() {
  const bgCanvas = ref(null);
  let animationFrameId = null;
  let particles = [];
  const mouse = { x: null, y: null, radius: 160 };

  const handleMouseMove = (e) => {
    mouse.x = e.x;
    mouse.y = e.y;
  };

  const handleMouseLeave = () => {
    mouse.x = null;
    mouse.y = null;
  };

  const initCanvas = () => {
    const canvas = bgCanvas.value;
    if (!canvas) return;

    // Cancel any existing animation loop before re-init
    if (animationFrameId) {
      cancelAnimationFrame(animationFrameId);
    }

    const ctx = canvas.getContext('2d');
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    particles = [];
    const count = (canvas.width * canvas.height) / 11000;
    for (let i = 0; i < count; i++) {
      particles.push(new Particle(canvas));
    }

    const isDark = () =>
      store.theme === 'dark' || (store.theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);

    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const lineColor = 'rgba(13, 148, 136,';

      for (let i = 0; i < particles.length; i++) {
        particles[i].update(mouse);
        particles[i].draw(ctx);

        for (let j = i + 1; j < particles.length; j++) {
          const dx = particles[i].x - particles[j].x;
          const dy = particles[i].y - particles[j].y;
          const dist2 = dx * dx + dy * dy;

          if (dist2 < 16000) {
            const opacity = 1 - dist2 / 16000;
            ctx.strokeStyle = `${lineColor}${opacity * 0.4})`;
            ctx.lineWidth = 0.8;
            ctx.beginPath();
            ctx.moveTo(particles[i].x, particles[i].y);
            ctx.lineTo(particles[j].x, particles[j].y);
            ctx.stroke();
          }
        }
      }
      animationFrameId = requestAnimationFrame(animate);
    };

    animate();
  };

  const handleResize = () => {
    if (bgCanvas.value) {
      bgCanvas.value.width = window.innerWidth;
      bgCanvas.value.height = window.innerHeight;
      initCanvas();
    }
  };

  onMounted(() => {
    initCanvas();
    window.addEventListener('resize', handleResize);
  });

  onBeforeUnmount(() => {
    window.removeEventListener('resize', handleResize);
    if (animationFrameId) cancelAnimationFrame(animationFrameId);
  });

  return { bgCanvas, handleMouseMove, handleMouseLeave };
}
