<template>
  <section class="hero-section">
    <div class="glowing-accent"></div>
    <h1 class="hero-title">
      {{ store.t('Understand, Visualise-First') }}
      <span class="gradient-text"><br>{{ store.t('AI Codebase Analyzer') }}</span>
    </h1>
    <p class="hero-subtitle">
      {{ store.t('Next-generation codebase analysis powered by Google Gemini ADK, GitLab Duo MCP, and GitHub MCP.') }}
    </p>
    <div class="hero-actions">
      <el-button type="primary" size="large" round class="hero-cta-btn" @click="emit('launch')">
        {{ store.t('Launch Console') }}
        <el-icon class="el-icon--right"><ArrowRight /></el-icon>
      </el-button>

      <el-button size="large" round class="hero-guide-btn" @click="emit('guide')">
        <el-icon style="margin-right: 6px;"><Document /></el-icon>
        {{ store.t('User Guide') }}
      </el-button>

      <el-button size="large" round class="hero-sec-btn" @click="emit('explore')">
        {{ store.t('Explore Features') }}
      </el-button>

      <el-button size="large" round class="hero-github-btn" @click="emit('github')">
        <GitHubIcon :size="20" style="margin-right: 8px;" />
        GitHub
      </el-button>
    </div>
  </section>
</template>

<script setup lang="ts">
import { store } from '../../stores';
import { ArrowRight, Document } from '@element-plus/icons-vue';
import GitHubIcon from '../common/GitHubIcon.vue';

const emit = defineEmits<{
  (e: 'launch'): void;
  (e: 'guide'): void;
  (e: 'explore'): void;
  (e: 'github'): void;
}>();
</script>

<style scoped>
.hero-section {
  position: relative;
  text-align: center;
  padding: 8rem 0 5rem 0;
  display: flex;
  flex-direction: column;
  align-items: center;
}

.glowing-accent {
  position: absolute;
  top: 15%;
  width: 400px;
  height: 250px;
  background: radial-gradient(circle, rgba(13, 148, 136, 0.25) 0%, rgba(0,0,0,0) 70%);
  filter: blur(40px);
  z-index: -1;
  pointer-events: none;
}

.hero-title {
  font-size: 3.5rem;
  font-weight: 900;
  line-height: 1.15;
  letter-spacing: -0.04em;
  margin-bottom: 1.5rem;
  color: var(--text-primary);
}

.gradient-text {
  background: linear-gradient(135deg, #0d9488 0%, #06b6d4 100%);
  background-clip: text;
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
}

.hero-subtitle {
  font-size: 1.25rem;
  color: var(--text-muted);
  max-width: 750px;
  line-height: 1.6;
  margin-bottom: 3rem;
}

.hero-actions {
  display: flex;
  gap: 1rem;
  justify-content: center;
  flex-wrap: wrap;
}

.hero-cta-btn {
  font-weight: 700;
  padding: 0.8rem 2.2rem;
  box-shadow: 0 8px 25px rgba(13, 148, 136, 0.4);
}

.hero-guide-btn {
  font-weight: 600;
  background: rgba(13, 148, 136, 0.15);
  border-color: rgba(13, 148, 136, 0.4);
  color: var(--color-brand);
}

.hero-guide-btn:hover {
  background: rgba(13, 148, 136, 0.25);
  border-color: var(--color-brand);
  color: #fff;
}

.hero-sec-btn {
  font-weight: 600;
  background: rgba(255, 255, 255, 0.03);
  border-color: var(--border-color);
  color: var(--text-primary);
}

.hero-sec-btn:hover {
  background: rgba(255, 255, 255, 0.08);
  color: var(--color-brand);
}

.hero-github-btn {
  font-weight: 600;
  background: rgba(255, 255, 255, 0.03);
  border-color: var(--border-color);
  color: var(--text-primary);
  display: inline-flex;
  align-items: center;
}

.hero-github-btn:hover {
  background: rgba(255, 255, 255, 0.08);
}

@media (max-width: 900px) {
  .hero-title { font-size: 2.5rem; }
}
</style>
