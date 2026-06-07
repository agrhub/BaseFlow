<template>
  <footer class="public-footer">
    <div class="footer-divider"></div>
    <div class="footer-links">
      <el-link
        v-if="showGuideLink"
        class="footer-guide-link"
        @click="emit('guide')"
        style="margin-right: 1.5rem;"
      >
        {{ store.t('User Guide') }}
      </el-link>

      <el-link
        href="https://github.com/agrhub/baseflow/"
        target="_blank"
        :underline="false"
        class="github-footer-link"
      >
        <GitHubIcon :size="18" style="margin-right: 6px;" />
      </el-link>
    </div>
    <p style="margin-top: 1rem;">&copy; 2026 BaseFlow. {{ store.t('All rights reserved.') }}</p>
  </footer>
</template>

<script setup lang="ts">
import { store } from '../../stores';
import GitHubIcon from './GitHubIcon.vue';

withDefaults(
  defineProps<{
    showGuideLink?: boolean;
  }>(),
  {
    showGuideLink: false
  }
);

const emit = defineEmits<{
  (e: 'guide'): void;
}>();
</script>

<style scoped>
.public-footer {
  text-align: center;
  padding: 3rem 0;
  z-index: 1;
  position: relative;
}

.footer-divider {
  max-width: 1200px;
  margin: 0 auto 2rem auto;
  border-top: 1px solid var(--border-color);
}

.footer-links {
  display: flex;
  justify-content: center;
  align-items: center;
}

.footer-guide-link {
  font-weight: 600;
  color: var(--text-muted) !important;
  font-size: 0.9rem;
  transition: color 0.3s;
}

.footer-guide-link:hover {
  color: var(--color-brand) !important;
}

.public-footer p {
  font-size: 0.875rem;
  color: var(--text-muted);
}

.github-footer-link {
  color: var(--text-muted);
  font-size: 0.9rem;
  transition: color 0.3s;
  display: inline-flex;
  align-items: center;
}

.github-footer-link:hover {
  color: var(--color-brand);
}
</style>
