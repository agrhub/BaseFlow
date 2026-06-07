<template>
  <aside class="guide-sidebar">
    <div class="sidebar-title">{{ store.t('Chapters') }}</div>
    <nav class="sidebar-nav">
      <a
        v-for="(chap, idx) in chapters"
        :key="idx"
        :href="'#chapter-' + (idx + 1)"
        class="nav-link"
        :class="{ active: activeChapter === idx }"
        @click.prevent="emit('scroll-to', idx)"
      >
        <span class="chapter-num">{{ idx + 1 }}</span>
        <span class="chapter-name">{{ store.t(chap.title) }}</span>
      </a>
    </nav>
  </aside>
</template>

<script setup lang="ts">
import { store } from '../../stores';

interface Chapter {
  title: string;
  [key: string]: any;
}

withDefaults(
  defineProps<{
    chapters: Chapter[];
    activeChapter?: number;
  }>(),
  {
    activeChapter: 0
  }
);

const emit = defineEmits<{
  (e: 'scroll-to', idx: number): void;
}>();
</script>

<style scoped>
.guide-sidebar {
  width: 280px;
  position: sticky;
  top: 100px;
  height: calc(100vh - 160px);
  overflow-y: auto;
  background: rgba(20, 25, 45, 0.3);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
  backdrop-filter: blur(8px);
  padding: 1.5rem;
  flex-shrink: 0;
}

.sidebar-title {
  font-size: 1.1rem;
  font-weight: 800;
  letter-spacing: -0.01em;
  margin-bottom: 1.5rem;
  color: var(--color-brand);
  text-transform: uppercase;
}

.sidebar-nav {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.nav-link {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.75rem 1rem;
  border-radius: var(--radius-sm);
  color: var(--text-muted);
  text-decoration: none;
  font-size: 0.9rem;
  font-weight: 550;
  transition: all 0.25s ease;
  border-left: 2px solid transparent;
}

.nav-link:hover {
  background: rgba(13, 148, 136, 0.08);
  color: var(--text-primary);
}

.nav-link.active {
  background: rgba(13, 148, 136, 0.12);
  color: var(--color-brand);
  border-left-color: var(--color-brand);
}

.chapter-num {
  font-size: 0.75rem;
  font-weight: 800;
  background: rgba(255, 255, 255, 0.08);
  width: 22px;
  height: 22px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.nav-link.active .chapter-num {
  background: var(--color-brand);
  color: #fff;
}

.chapter-name {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

@media (max-width: 900px) {
  .guide-sidebar {
    width: 100%;
    position: relative;
    top: 0;
    height: auto;
    max-height: 250px;
  }
}
</style>
