<template>
  <div class="login-wrapper" @mousemove="handleMouseMove" @mouseleave="handleMouseLeave">
    <canvas ref="bgCanvas" class="login-canvas-bg"></canvas>
    
    <el-card class="login-card">
      <div class="login-header">
        <div class="login-actions-container">
          <!-- Theme selector dropdown -->
          <el-dropdown trigger="click" @command="handleThemeChange" size="small">
            <el-button
              text bg round size="small">
              <el-icon>
                <Sunny v-if="store.theme === 'light'" />
                <Moon v-else-if="store.theme === 'dark'" />
                <Monitor v-else />
              </el-icon>
              {{ store.t(themeLabel) }}
            </el-button>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item command="light" :class="{ 'is-active': store.theme === 'light' }">
                  <el-icon><Sunny /></el-icon> {{ store.t('Light') }}
                </el-dropdown-item>
                <el-dropdown-item command="dark" :class="{ 'is-active': store.theme === 'dark' }">
                  <el-icon><Moon /></el-icon> {{ store.t('Dark') }}
                </el-dropdown-item>
                <el-dropdown-item command="system" :class="{ 'is-active': store.theme === 'system' }">
                  <el-icon><Monitor /></el-icon> {{ store.t('System') }}
                </el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>

          <!-- Language selector dropdown -->
          <el-dropdown trigger="click" @command="handleLocaleChange" size="small">
            <el-button
              text bg round size="small">
              <el-icon><Location /></el-icon>
              {{ store.activeLocale.toUpperCase() }}
            </el-button>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item 
                  v-for="(label, code) in availableLocales" 
                  :key="code" 
                  :command="code"
                  :class="{ 'is-active': store.activeLocale === code }"
                >
                  {{ label }}
                </el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </div>
        <div class="logo-circle">
          <el-image src="/logo.png" style="width: 48px; height: 48px;" class="brand-logo" />
        </div>
        <h1 class="logo-title">BaseFlow</h1>
        <p class="logo-subtitle">{{ store.t('Minimalist Git Repository Analyzer') }}</p>
      </div>

      <el-form :model="loginForm" @submit.prevent="handleLogin" label-position="top">
        <el-form-item :label="store.t('Password')">
          <el-input 
            v-model="loginForm.password" 
            type="password" 
            show-password 
            placeholder="••••••••"
            size="large"
            :prefix-icon="Lock"
          />
        </el-form-item>

        <div class="form-actions">
          <el-button 
            type="primary" round
            native-type="submit" 
            size="large" 
            :loading="loggingIn"
            class="submit-btn"
          >
            {{ store.t('Sign In') }}
          </el-button>
        </div>
      </el-form>
    </el-card>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted, onBeforeUnmount } from 'vue';
import { useRouter } from 'vue-router';
import { store } from '../stores';
import { Lock, Location, Grid, Sunny, Moon, Monitor } from '@element-plus/icons-vue';
import { ElMessage } from 'element-plus';

// --- Particle Background Animation ---
const bgCanvas = ref(null);
let animationFrameId = null;
let particles = [];
let mouse = { x: null, y: null, radius: 150 };

const handleMouseMove = (e) => {
  mouse.x = e.x;
  mouse.y = e.y;
};
const handleMouseLeave = () => {
  mouse.x = null;
  mouse.y = null;
};

class Particle {
  constructor(canvas) {
    this.canvas = canvas;
    this.x = Math.random() * canvas.width;
    this.y = Math.random() * canvas.height;
    this.size = Math.random() * 2 + 1;
    this.speedX = (Math.random() * 2) - 1;
    this.speedY = (Math.random() * 2) - 1;
  }
  update() {
    this.x += this.speedX;
    this.y += this.speedY;

    if (this.x < 0 || this.x > this.canvas.width) this.speedX *= -1;
    if (this.y < 0 || this.y > this.canvas.height) this.speedY *= -1;

    // Mouse interaction
    if (mouse.x && mouse.y) {
      let dx = mouse.x - this.x;
      let dy = mouse.y - this.y;
      let distance = Math.sqrt(dx * dx + dy * dy);
      if (distance < mouse.radius) {
        const forceDirectionX = dx / distance;
        const forceDirectionY = dy / distance;
        const force = (mouse.radius - distance) / mouse.radius;
        // Push particles away slightly
        this.x -= forceDirectionX * force * 2;
        this.y -= forceDirectionY * force * 2;
      }
    }
  }
  draw(ctx, baseColor) {
    ctx.fillStyle = baseColor;
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
    ctx.fill();
  }
}

const initCanvas = () => {
  const canvas = bgCanvas.value;
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;

  particles = [];
  const numberOfParticles = (canvas.width * canvas.height) / 10000;
  for (let i = 0; i < numberOfParticles; i++) {
    particles.push(new Particle(canvas));
  }

  const animate = () => {
    // Semi-transparent clear to allow trails
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    const isDark = store.theme === 'dark' || (store.theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    const baseColor = isDark ? 'rgba(13, 148, 136, 0.4)' : 'rgba(13, 148, 136, 0.2)';
    const lineColor = isDark ? 'rgba(13, 148, 136,' : 'rgba(13, 148, 136,';

    for (let i = 0; i < particles.length; i++) {
      particles[i].update();
      particles[i].draw(ctx, isDark ? '#0d9488' : '#0f766e');
      
      // Connect points
      for (let j = i; j < particles.length; j++) {
        const dx = particles[i].x - particles[j].x;
        const dy = particles[i].y - particles[j].y;
        const distance = dx * dx + dy * dy;
        
        if (distance < 15000) {
          const opacity = 1 - (distance / 15000);
          ctx.strokeStyle = `${lineColor}${opacity * 0.5})`;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(particles[i].x, particles[i].y);
          ctx.lineTo(particles[j].x, particles[j].y);
          ctx.stroke();
        }
      }

      // Connect to mouse
      if (mouse.x && mouse.y) {
        const dx = particles[i].x - mouse.x;
        const dy = particles[i].y - mouse.y;
        const distance = dx * dx + dy * dy;
        if (distance < mouse.radius * mouse.radius) {
          const opacity = 1 - (distance / (mouse.radius * mouse.radius));
          ctx.strokeStyle = `${lineColor}${opacity * 0.8})`;
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.moveTo(particles[i].x, particles[i].y);
          ctx.lineTo(mouse.x, mouse.y);
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
// --- End Animation ---

const themeLabel = computed(() => {
  if (store.theme === 'light') return 'Light';
  if (store.theme === 'dark') return 'Dark';
  return 'System';
});

const handleThemeChange = (theme) => {
  store.setTheme(theme);
  ElMessage.success(store.t('Theme changed successfully'));
};

const router = useRouter();
const loggingIn = ref(false);

const loginForm = reactive({
  password: ''
});

import { useLocale } from '../hooks/useLocale';
const { availableLocales, handleLocaleChange } = useLocale();

const handleLogin = async () => {
  if (!loginForm.password) {
    ElMessage.warning(store.t('Password is required'));
    return;
  }

  loggingIn.value = true;
  const result = await store.login(loginForm.password);
  loggingIn.value = false;

  if (result.success) {
    ElMessage.success(store.t('Logged in successfully'));
    router.push('/');
  } else {
    ElMessage.error(result.msg || store.t('Incorrect password'));
  }
};
</script>

<style scoped>
.login-canvas-bg {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  z-index: 0;
  pointer-events: none; /* Let events pass to the wrapper */
}

.login-wrapper {
  position: relative;
  width: 100vw;
  height: 100vh;
  display: flex;
  justify-content: center;
  align-items: center;
  background-color: var(--bg-primary);
  overflow: hidden;
}

.login-card {
  position: relative;
  z-index: 1;
  width: 100%;
  max-width: 420px;
  padding: 1.5rem;
  border-radius: var(--radius-lg) !important;
  box-shadow: 0 20px 40px rgba(0,0,0,0.2) !important;
  background: var(--bg-primary);
  border: 1px solid var(--border-color);
  backdrop-filter: blur(10px);
}

.login-card:hover {
  transform: none; /* Turn off float on hover for login card */
}

.login-header {
  text-align: center;
  margin-bottom: 2.5rem;
  position: relative;
}

.login-actions-container {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: -0.5rem;
  margin-right: -0.5rem;
  margin-bottom: 0.5rem;
}

.action-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--text-muted);
  cursor: pointer;
  padding: 4px 8px;
  border-radius: var(--radius-sm);
  background: var(--bg-primary);
  border: 1px solid var(--border-color);
  transition: all 0.2s ease;
}

.action-btn:hover {
  color: var(--color-brand);
  border-color: var(--color-brand-light);
}

.logo-circle {
  width: 64px;
  height: 64px;
  border-radius: 50%;
  background: var(--color-brand-light);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 1rem;
}

.logo-icon {
  font-size: 2rem;
  color: var(--color-brand);
}

.logo-title {
  font-size: 1.75rem;
  font-weight: 700;
  letter-spacing: -0.03em;
  color: var(--text-primary);
  margin-bottom: 0.25rem;
}

.logo-subtitle {
  font-size: 0.875rem;
  color: var(--text-muted);
}

.submit-btn {
  width: 100%;
  margin-top: 1rem;
  font-weight: 600;
  letter-spacing: 0.01em;
}
</style>

