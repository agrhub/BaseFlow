<template>
  <div class="welcome-wrapper" @mousemove="handleMouseMove" @mouseleave="handleMouseLeave">
    <!-- Particle Canvas background -->
    <canvas ref="bgCanvas" class="welcome-canvas-bg"></canvas>

    <!-- Shared Nav Header -->
    <PublicNavHeader
      :show-guide-link="true"
      @guide="goToGuide"
      @launch="launchConsole"
    />

    <!-- Main Content -->
    <main class="content-container">

      <!-- Hero Section -->
      <HeroSection
        @launch="launchConsole"
        @guide="goToGuide"
        @explore="scrollToFeatures"
        @github="openGitHub"
      />

      <!-- Stats Overview Row -->
      <section class="stats-grid">
        <div class="stat-card" @click="goToGuide">
          <span class="stat-value">10</span>
          <span class="stat-label">{{ store.t('Core Capabilities') }}</span>
        </div>
        <div class="stat-card">
          <span class="stat-value">8</span>
          <span class="stat-label">{{ store.t('Global Languages') }}</span>
        </div>
        <div class="stat-card">
          <span class="stat-value">&lt; 100ms</span>
          <span class="stat-label">{{ store.t('Real-time OTel Tracing') }}</span>
        </div>
      </section>
      
      <!-- Feature Grid with Category Tabs -->
      <FeatureGrid />

      <!-- Visual Showcase Carousel -->
      <ShowcaseCarousel />
    </main>

    <!-- Shared Footer -->
    <PublicFooter :show-guide-link="true" @guide="goToGuide" />
  </div>
</template>

<script setup>
import { useRouter } from 'vue-router';
import { store } from '../stores';
import { useParticleCanvas } from '../hooks/useParticleCanvas';

import PublicNavHeader   from '../components/common/PublicNavHeader.vue';
import PublicFooter      from '../components/common/PublicFooter.vue';
import HeroSection       from '../components/welcome/HeroSection.vue';
import FeatureGrid       from '../components/welcome/FeatureGrid.vue';
import ShowcaseCarousel  from '../components/welcome/ShowcaseCarousel.vue';

const router = useRouter();

// Particle canvas animation (shared composable)
const { bgCanvas, handleMouseMove, handleMouseLeave } = useParticleCanvas();

const goToGuide = () => router.push('/guide');
const launchConsole = () => router.push('/login');
const openGitHub = () => window.open('https://github.com/agrhub/baseflow/', '_blank');
const scrollToFeatures = () => {
  const el = document.getElementById('features');
  if (el) el.scrollIntoView({ behavior: 'smooth' });
};
</script>

<style scoped>
.welcome-wrapper {
  position: relative;
  width: 100%;
  min-height: 100vh;
  background-color: var(--bg-primary);
  color: var(--text-primary);
  font-family: var(--font-family);
}

.welcome-canvas-bg {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  z-index: 0;
  pointer-events: none;
}

.content-container {
  max-width: 1200px;
  margin: 0 auto;
  padding: 0 1.5rem;
  position: relative;
  margin-top: 63px;
  z-index: 1;
}

/* Stats Overview */
.stats-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 2rem;
  margin-bottom: 6rem;
  padding-top: 3rem;
}

.stat-card {
  padding: 2rem;
  background: rgba(15, 20, 35, 0.3);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
  backdrop-filter: blur(8px);
  text-align: center;
  transition: all 0.3s;
}

.stat-card:first-child {
  cursor: pointer;
}

.stat-card:first-child:hover {
  border-color: var(--color-brand);
  transform: translateY(-4px);
}

.stat-value {
  display: block;
  font-size: 2.25rem;
  font-weight: 900;
  color: var(--color-brand);
  margin-bottom: 0.5rem;
}

.stat-label {
  font-size: 0.875rem;
  color: var(--text-muted);
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

@media (max-width: 900px) {
  .stats-grid { grid-template-columns: 1fr; gap: 1rem; }
}
</style>
