<template>
  <section
    :id="'chapter-' + (index + 1)"
    class="chapter-card"
  >
    <div class="chapter-header">
      <span class="chapter-badge">{{ store.t('Chapter') }} {{ index + 1 }}</span>
      <h2>{{ store.t(chapter.title) }}</h2>
    </div>

    <p class="chapter-desc">{{ store.t(chapter.desc) }}</p>

    <!-- Step-by-step instructions -->
    <div class="chapter-steps">
      <h4>{{ store.t('Operational Guide') }}</h4>
      <ul>
        <li v-for="(step, sIdx) in chapter.steps" :key="sIdx">
          <el-icon class="step-bullet"><Check /></el-icon>
          <span>{{ store.t(step) }}</span>
        </li>
      </ul>
    </div>

    <!-- Screenshot illustration -->
    <div class="chapter-image-box" v-if="chapter.img">
      <el-image :src="chapter.img" fit="cover" class="chapter-img" lazy>
        <template #placeholder>
          <div class="image-slot-loading">
            <el-icon class="is-loading"><Loading /></el-icon>
          </div>
        </template>
      </el-image>
      <div class="image-caption">
        {{ store.t('System Visual Snapshot') }} - {{ store.t(chapter.title) }}
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { store } from '../../stores';
import { Check, Loading } from '@element-plus/icons-vue';

interface Chapter {
  title: string;
  desc: string;
  steps: string[];
  img?: string;
  [key: string]: any;
}

defineProps<{
  chapter: Chapter;
  index: number;
}>();
</script>

<style scoped>
.chapter-card {
  background: rgba(15, 20, 35, 0.4);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
  padding: 3rem 2.5rem;
  backdrop-filter: blur(8px);
  transition: all 0.3s ease;
}

.chapter-card:hover {
  border-color: var(--color-brand);
  box-shadow: 0 10px 30px rgba(13, 148, 136, 0.08);
}

.chapter-header {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  margin-bottom: 1.5rem;
}

.chapter-badge {
  font-size: 0.75rem;
  font-weight: 700;
  letter-spacing: 0.1em;
  color: var(--color-brand);
  text-transform: uppercase;
}

.chapter-card h2 {
  font-size: 2rem;
  font-weight: 800;
  letter-spacing: -0.03em;
  margin: 0;
}

.chapter-desc {
  font-size: 1.05rem;
  color: var(--text-muted);
  line-height: 1.6;
  margin-bottom: 2rem;
}

.chapter-steps { margin-bottom: 2.5rem; }

.chapter-steps h4 {
  font-size: 1rem;
  font-weight: 700;
  margin-bottom: 1rem;
  color: var(--text-primary);
}

.chapter-steps ul {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.chapter-steps li {
  display: flex;
  align-items: flex-start;
  gap: 0.75rem;
  font-size: 0.95rem;
  color: var(--text-muted);
  line-height: 1.5;
}

.step-bullet {
  color: var(--color-brand);
  margin-top: 0.2rem;
  flex-shrink: 0;
}

.chapter-image-box {
  border-radius: var(--radius-md);
  overflow: hidden;
  border: 1px solid var(--border-color);
  background: rgba(10, 15, 30, 0.6);
  padding: 1rem;
}

.chapter-img {
  width: 100%;
  max-height: 480px;
  border-radius: var(--radius-sm);
  display: block;
}

.image-slot-loading {
  height: 300px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(255, 255, 255, 0.02);
  color: var(--color-brand);
  font-size: 2rem;
}

.image-caption {
  font-size: 0.75rem;
  color: var(--text-muted);
  text-align: center;
  margin-top: 0.75rem;
  font-style: italic;
}
</style>
