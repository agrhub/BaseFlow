<template>
  <section class="showcase-section">
    <div class="section-header">
      <span class="section-tag">{{ store.t('VISUAL OBSERVABILITY') }}</span>
      <h2 class="section-title">{{ store.t('High-Fidelity Telemetry Preview') }}</h2>
    </div>

    <el-carousel :interval="6000" type="card" height="420px" class="showcase-carousel">
      <el-carousel-item v-for="(item, idx) in showcaseImages" :key="idx">
        <div class="carousel-card">
          <el-image :src="item.src" fit="cover" class="carousel-img" />
          <div class="carousel-info">
            <h4>{{ store.t(item.title) }}</h4>
            <p>{{ store.t(item.desc) }}</p>
          </div>
        </div>
      </el-carousel-item>
    </el-carousel>
  </section>
</template>

<script setup lang="ts">
import { store } from '../../stores';

interface ShowcaseItem {
  src: string;
  title: string;
  desc: string;
}

const showcaseImages: ShowcaseItem[] = [
  {
    src: '/docs/images/02_mindmap_full.png',
    title: 'Interactive Codebase Mindmaps',
    desc: 'Visualize package directories, focus class nodes, and switch between Mindmap and Neural Map layouts.'
  },
  {
    src: '/docs/images/07_devops_tab.png',
    title: 'AI DevOps Workspace & Auditing',
    desc: 'Generate onboarding documents, dev reports, security audits, and view vulnerability highlight states.'
  },
  {
    src: '/docs/images/09_architecture_tab.png',
    title: 'System Architecture & Diagrams',
    desc: 'Browse class flow interactions and system components rendered dynamically using Mermaid diagrams.'
  },
  {
    src: '/docs/images/10b_OpenCut_class_inspector_code.png',
    title: 'Source Code Inspector & Selection Chat',
    desc: 'Traverse directories, inspect methods, highlight lines, and select code snippets to explain with Gemini.'
  }
];
</script>

<style scoped>
.showcase-section { padding: 5rem 0; }

.section-header {
  text-align: center;
  margin-bottom: 3.5rem;
}

.section-tag {
  font-size: 0.75rem;
  font-weight: 800;
  color: var(--color-brand);
  letter-spacing: 0.15em;
  text-transform: uppercase;
}

.section-title {
  font-size: 2.25rem;
  font-weight: 900;
  letter-spacing: -0.03em;
  margin: 0.5rem 0 0 0;
  color: var(--text-primary);
  display: block !important;
}

.showcase-carousel { margin-top: 2rem; }

.carousel-card {
  position: relative;
  width: 100%;
  height: 100%;
  border-radius: var(--radius-lg);
  overflow: hidden;
  border: 1px solid var(--border-color);
  background: rgba(15, 20, 35, 0.7);
}

.carousel-img {
  width: 100%;
  height: calc(100% - 90px);
}

.carousel-info {
  height: 90px;
  padding: 1rem 1.5rem;
  background: rgba(10, 15, 30, 0.85);
  border-top: 1px solid var(--border-color);
}

.carousel-info h4 {
  font-size: 1rem;
  font-weight: 700;
  color: var(--text-primary);
  margin-bottom: 0.25rem;
}

.carousel-info p {
  font-size: 0.75rem;
  color: var(--text-muted);
}
</style>
