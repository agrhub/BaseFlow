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
    title: store.t('Repository Connections & Overview'),
    desc: store.t('Configure, test, and sync Git repository profiles. Support both local workspace folders and remote repositories (GitHub/GitLab). View high-level metrics, language breakdowns, and commit activity trends.'),
    img: '/docs/images/01_dashboard_generate.png',
    steps: [
      store.t('Connect your local or remote codebase in the manager.'),
      store.t('Browse dashboard summary statistics (total classes, relationships).'),
      store.t('Review Git commit activity charts showing history over time.'),
      store.t('Toggle between Light and Dark visual modes.')
    ]
  },
  {
    title: store.t('Interactive Codebase Mindmaps'),
    desc: store.t('Visualize package directories and logical class hierarchies inside an interactive G6 canvas. Switch layouts dynamically and focus nodes instantly.'),
    img: '/docs/images/02_mindmap_full.png',
    steps: [
      store.t('Navigate to the Maps tab in your repository dashboard.'),
      store.t('Use autocomplete search bar to locate specific classes.'),
      store.t('Toggle camera centering and reset zoom levels.'),
      store.t('Switch between Mindmap tree layout and Force-Directed Neural Map.')
    ]
  },
  {
    title: store.t('Class Inspector & UML ERDs'),
    desc: store.t('Drill down into logical class details, property visibility flags, field declarations, and method signatures. Launch class Entity-Relationship diagrams to map data flow.'),
    img: '/docs/images/03_mindmap_inspector.png',
    steps: [
      store.t('Single-click any G6 node to slide open the Inspector drawer.'),
      store.t('Check member properties, signatures, and AI structural details.'),
      store.t('Double-click a G6 class node to render a UML ERD diagram dialog.'),
      store.t('Scroll columns and check foreign class implementation lines.')
    ]
  },
  {
    title: store.t('AI DevOps Workspace & Audits'),
    desc: store.t('Automate DevOps operations. Compute health scores, generate custom onboarding playbooks, DevOps reports, and codebase security audits with Google Gemini.'),
    img: '/docs/images/07_devops_tab.png',
    steps: [
      store.t('Load the DevOps tab to see open issues, MRs/PRs, and pipelines.'),
      store.t('Click Generate Onboarding Guide to stream developer walkthroughs.'),
      store.t('Click Run Security Audit to find vulnerabilities.'),
      store.t('See code warnings highlighted in RED directly on your codebase mindmap.')
    ]
  },
  {
    title: store.t('System Architecture & Flows'),
    desc: store.t('Automatically deconstruct systems and class flows. Render dependency maps dynamically in the browser using Mermaid.'),
    img: '/docs/images/09_architecture_tab.png',
    steps: [
      store.t('Navigate to the Architecture tab to view software maps.'),
      store.t('Use zoom controls to zoom in, out, and reset Mermaid charts.'),
      store.t('Click Fullscreen to expand graphs for deep architectural reviews.'),
      store.t('Trace imports and system dependencies easily.')
    ]
  },
  {
    title: store.t('AI Document Playbooks'),
    desc: store.t('Read repository documents and Markdown files contextually. Ask queries directly related to the documents, and publish playbooks to AI catalogs.'),
    img: '/docs/images/10_documents_readme.png',
    steps: [
      store.t('Open the Documents tab to see markdown documentation files.'),
      store.t('Select a document to render its content and view AI summaries.'),
      store.t('Click Ask Agent to trigger a contextual Q&A chat drawer.'),
      store.t('Publish playbooks directly to GitHub Copilot or GitLab Duo.')
    ]
  },
  {
    title: store.t('Sidebar Explorer & Selection Chat'),
    desc: store.t('Explore code trees in the sidebar, view source files with line numbers and syntax highlighting, and select code blocks to explain.'),
    img: '/docs/images/10b_OpenCut_class_inspector_code.png',
    steps: [
      store.t('Expand/collapse folder trees in the Codebase Explorer sidebar.'),
      store.t('Select any file to launch the Class Inspector view.'),
      store.t('Click properties or methods to auto-scroll and highlight lines.'),
      store.t('Highlight code snippets in the editor to prompt the floating SRE chatbot.')
    ]
  },
  {
    title: store.t('Conversational Chatbot Assistant'),
    desc: store.t('Chat directly with Google Gemini in a sliding sidebar. Access context-aware suggestion chips, optimize code, and copy AI code blocks.'),
    img: '/docs/images/12_chatbot_sidebar.png',
    steps: [
      store.t('Trigger the sliding assistant sidebar from the bottom-right.'),
      store.t('Select suggested contextual queries for rapid coding actions.'),
      store.t('Write freeform questions to search files and optimize classes.'),
      store.t('Copy generated code snippets instantly for development.')
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
