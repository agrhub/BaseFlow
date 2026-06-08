<template>
  <section id="features" class="features-section">
    <div class="section-header">
      <span class="section-tag">{{ store.t('INTELLIGENT OPERATION') }}</span>
      <h2 class="section-title">{{ store.t('Engineered for High-Performance Teams') }}</h2>
    </div>

    <!-- Glassmorphic Category Switcher Tabs -->
    <div class="category-tabs">
      <button
        class="tab-btn"
        :class="{ active: activeCategory === 'core' }"
        @click="activeCategory = 'core'"
      >
        <el-icon><Link /></el-icon>
        <span>{{ store.t('Core Administration') }}</span>
      </button>
      <button
        class="tab-btn"
        :class="{ active: activeCategory === 'ai' }"
        @click="activeCategory = 'ai'"
      >
        <el-icon><Compass /></el-icon>
        <span>{{ store.t('Premium AI SRE') }}</span>
      </button>
    </div>

    <!-- Core Features Grid -->
    <div class="features-grid" v-if="activeCategory === 'core'">
      <div v-for="item in coreFeatures" :key="item.key" class="feature-card">
        <div class="icon-box" :class="item.color">
          <el-icon><component :is="item.icon" /></el-icon>
        </div>
        <h3>{{ store.t(item.title) }}</h3>
        <p>{{ store.t(item.desc) }}</p>
      </div>
    </div>

    <!-- AI Features Grid -->
    <div class="features-grid" v-else-if="activeCategory === 'ai'">
      <div v-for="item in aiFeatures" :key="item.key" class="feature-card">
        <div class="icon-box" :class="item.color">
          <el-icon><component :is="item.icon" /></el-icon>
        </div>
        <h3>{{ store.t(item.title) }}</h3>
        <p>{{ store.t(item.desc) }}</p>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { store } from '../../stores';
import {
  Link, FolderOpened, Document, Key,
  Compass
} from '@element-plus/icons-vue';
import type { Component } from 'vue';

const activeCategory = ref('core');

interface FeatureItem {
  key: string;
  color: string;
  icon: Component;
  title: string;
  desc: string;
}

const coreFeatures: FeatureItem[] = [
  {
    key: 'connections', color: 'blue', icon: Link,
    title: 'Connection Manager',
    desc: 'Manage and test Git repository connection profiles. Supports local folder paths and remote repository configurations.'
  },
  {
    key: 'mindmaps', color: 'purple', icon: Compass,
    title: 'Interactive Codebase Mindmaps',
    desc: 'Traverse folder structures visually using G6 Mindmap or Neural layouts. Search classes by name to center and focus nodes.'
  },
  {
    key: 'explorer', color: 'cyan', icon: FolderOpened,
    title: 'Directory & Class Explorer',
    desc: 'Browse logical file trees, inspect properties and methods lists, view syntax-highlighted source code, and trigger explain-code selection bubbles.'
  },
  {
    key: 'indexes', color: 'green', icon: Key,
    title: 'Git Commit & Activity Logs',
    desc: 'Monitor repository timelines, review commit distributions, and track line additions, deletions, and active changes.'
  }
];

const aiFeatures: FeatureItem[] = [
  {
    key: 'devops', color: 'red', icon: Document,
    title: 'AI DevOps Workspace & Audits',
    desc: 'Generate onboarding docs, DevOps reports, codebase security audits, and highlight vulnerable classes in red on the mindmap.'
  },
  {
    key: 'architecture', color: 'blue', icon: Compass,
    title: 'AI System Architecture Flows',
    desc: 'Deconstruct class interactions and system architecture automatically, rendered into interactive Mermaid diagrams.'
  },
  {
    key: 'playbooks', color: 'orange', icon: Document,
    title: 'AI Document Playbooks',
    desc: 'Browse Markdown files, ask chatbot queries contextually, and publish custom playbook agents directly to Copilot or Duo catalog.'
  },
  {
    key: 'chatbot', color: 'purple', icon: Compass,
    title: 'Conversational SRE Assistant',
    desc: 'Sliding chatbot sidebar with context-aware suggestions, custom queries, code optimization triggers, and code copying.'
  }
];
</script>

<style scoped>
.features-section { padding: 5rem 0; }

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

.category-tabs {
  display: flex;
  justify-content: center;
  gap: 1rem;
  margin-bottom: 3rem;
}

.tab-btn {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.75rem 2rem;
  border-radius: 40px;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid var(--border-color);
  color: var(--text-muted);
  cursor: pointer;
  font-size: 0.95rem;
  font-weight: 700;
  transition: all 0.3s ease;
  backdrop-filter: blur(8px);
}

.tab-btn:hover {
  background: rgba(255, 255, 255, 0.07);
  color: var(--text-primary);
}

.tab-btn.active {
  background: rgba(13, 148, 136, 0.15);
  border-color: var(--color-brand);
  color: var(--color-brand);
  box-shadow: 0 4px 15px rgba(13, 148, 136, 0.15);
}

.features-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 2rem;
}

.feature-card {
  padding: 2.5rem 2rem;
  border-radius: var(--radius-lg);
  background: rgba(15, 20, 35, 0.4);
  border: 1px solid var(--border-color);
  backdrop-filter: blur(8px);
  transition: all 0.3s ease;
}

.feature-card:hover {
  transform: translateY(-8px);
  border-color: var(--color-brand);
  box-shadow: 0 12px 30px rgba(13, 148, 136, 0.15);
}

.icon-box {
  width: 48px;
  height: 48px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.5rem;
  margin-bottom: 1.5rem;
}

.icon-box.purple { background: rgba(168, 85, 247, 0.12); color: #a855f7; }
.icon-box.cyan   { background: rgba(6, 182, 212, 0.12);  color: #06b6d4; }
.icon-box.blue   { background: rgba(59, 130, 246, 0.12); color: #3b82f6; }
.icon-box.green  { background: rgba(34, 197, 94, 0.12);  color: #22c55e; }
.icon-box.orange { background: rgba(249, 115, 22, 0.12); color: #f97316; }
.icon-box.red    { background: rgba(239, 68, 68, 0.12);  color: #ef4444; }

.feature-card h3 {
  font-size: 1.25rem;
  font-weight: 700;
  margin-bottom: 0.75rem;
  letter-spacing: -0.01em;
}

.feature-card p {
  font-size: 0.875rem;
  color: var(--text-muted);
  line-height: 1.5;
}

@media (max-width: 900px) {
  .features-grid { grid-template-columns: repeat(2, 1fr); }
}

@media (max-width: 600px) {
  .features-grid { grid-template-columns: 1fr; }
}
</style>
