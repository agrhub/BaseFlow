<template>
  <div class="guide-wrapper" @mousemove="handleMouseMove" @mouseleave="handleMouseLeave">
    <!-- Particle Canvas background -->
    <canvas ref="bgCanvas" class="guide-canvas-bg"></canvas>

    <!-- Shared Nav Header -->
    <PublicNavHeader
      :badge-text="store.t('Manual')"
      :brand-clickable="true"
      :show-back-btn="true"
      @brand-click="goHome"
      @back="goHome"
      @launch="launchConsole"
    />

    <!-- Main Container -->
    <div class="guide-container">
      <!-- Sticky Sidebar -->
      <GuideSidebar
        :chapters="chapters"
        :active-chapter="activeChapter"
        @scroll-to="scrollToChapter"
      />

      <!-- Chapter Content -->
      <main class="guide-main">
        <ChapterCard
          v-for="(chap, idx) in chapters"
          :key="idx"
          :chapter="chap"
          :index="idx"
        />
      </main>
    </div>

    <!-- Shared Footer -->
    <PublicFooter />
  </div>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount, computed } from 'vue';
import { useRouter } from 'vue-router';
import { useParticleCanvas } from '../hooks/useParticleCanvas';
import { store } from '../stores';

import PublicNavHeader from '../components/common/PublicNavHeader.vue';
import PublicFooter    from '../components/common/PublicFooter.vue';
import GuideSidebar    from '../components/guide/GuideSidebar.vue';
import ChapterCard     from '../components/guide/ChapterCard.vue';

const router = useRouter();

// Particle canvas animation (shared composable)
const { bgCanvas, handleMouseMove, handleMouseLeave } = useParticleCanvas();

const activeChapter = ref(0);

const chapters = computed(() => [
  {
    title: store.t('Connection Manager'),
    desc: store.t('Manage and test Git repository connection profiles. Supports local folder paths and remote repository configurations.'),
    img: '/docs/images/connections.png',
    steps: [
      store.t('Navigate to Repository Connection Dashboard.'),
      store.t('Click New Connection button to register local paths.'),
      store.t('Verify directory access and state before saving.'),
      store.t('Modify or delete inactive repository connections safely.')
    ]
  },
  {
    title: store.t('Directory & Class Explorer'),
    desc: store.t('Perform high-level project catalog audits. Browse folders and classes dynamically. Features a lightweight structure scanner that parses logical packages and source code units.'),
    img: '/docs/images/db_explorer.png',
    steps: [
      store.t('Select any active repository to open its Explorer.'),
      store.t('Traverse directories and browse structural files.'),
      store.t('Inspect class counts and line distributions across components.'),
      store.t('Visualize directory trees and file metadata.')
    ]
  },
  {
    title: store.t('Class Inspector & Relations'),
    desc: store.t('Inspect logical class details, field declarations, and method signatures. Analyze inheritance paths, class relationships, and internal dependency links in the code.'),
    img: '/docs/images/documents.png',
    steps: [
      store.t('Open a class details panel to view its variables and methods.'),
      store.t('Trace parent classes and child implementations.'),
      store.t('Identify implicit relations between logical models.'),
      store.t('Review structural warnings and complexity scores.')
    ]
  },
  {
    title: store.t('Git Commit & Activity Logs'),
    desc: store.t('Advanced repository activity monitor. View commit log timelines, author distributions, and file edit histories. Prevent technical debt by monitoring active repository states.'),
    img: '/docs/images/indexes.png',
    steps: [
      store.t('Open the Monitoring tab in the repository dashboard.'),
      store.t('Inspect commit timelines, author names, and timestamps.'),
      store.t('Track lines of code additions, deletions, and active changes.'),
      store.t('Scan file modify events to detect potential hotspots.')
    ]
  },
  {
    title: store.t('BaseFlow AI SRE Assistant'),
    desc: store.t('Premium AI SRE automation copilot. Chat naturally to analyze repository schemas, request code visualizations, generate documentation, or ask the SRE SRE-specific performance questions.'),
    img: '/docs/images/agent_welcome.png',
    steps: [
      store.t('Open the BaseFlow AI SRE chatbot sidebar on the right.'),
      store.t('Ask the assistant to query classes, summarize code, or write scripts.'),
      store.t('Ask the assistant to render real-time interactive ECharts graphs.'),
      store.t('Trigger automated code health evaluations directly in chat.')
    ]
  }
]);

const goHome = () => router.push('/welcome');
const launchConsole = () => router.push('/login');

const scrollToChapter = (idx) => {
  activeChapter.value = idx;
  const el = document.getElementById(`chapter-${idx + 1}`);
  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
};

const handleScroll = () => {
  const scrollPosition = window.scrollY + 120;
  for (let i = 0; i < chapters.value.length; i++) {
    const el = document.getElementById(`chapter-${i + 1}`);
    if (el) {
      const top = el.offsetTop;
      const height = el.offsetHeight;
      if (scrollPosition >= top && scrollPosition < top + height) {
        activeChapter.value = i;
        break;
      }
    }
  }
};

onMounted(() => window.addEventListener('scroll', handleScroll));
onBeforeUnmount(() => window.removeEventListener('scroll', handleScroll));
</script>

<style scoped>
.guide-wrapper {
  position: relative;
  width: 100%;
  min-height: 100vh;
  background-color: var(--bg-primary);
  color: var(--text-primary);
  font-family: var(--font-family);
}

.guide-canvas-bg {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  z-index: 0;
  pointer-events: none;
}

.guide-container {
  display: flex;
  max-width: 1200px;
  margin: 0 auto;
  padding: 3rem 1.5rem;
  gap: 3rem;
  position: relative;
  z-index: 1;
  margin-top: 63px;
}

.guide-main {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 4rem;
}

@media (max-width: 900px) {
  .guide-container { flex-direction: column; }
}
</style>
