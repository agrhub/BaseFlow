<template>
  <header class="nav-header">
    <!-- Brand -->
    <div class="brand" :class="{ clickable: brandClickable }" @click="onBrandClick">
      <el-image src="/logo.png" class="brand-logo-small" />
      <span class="brand-name">BaseFlow</span>
      <span v-if="badgeText" class="brand-badge">{{ badgeText }}</span>
    </div>

    <!-- Nav Actions -->
    <div class="nav-actions">
      <!-- Optional User Guide link (Welcome page) -->
      <el-link
        v-if="showGuideLink"
        class="nav-guide-link"
        @click="emit('guide')"
        :underline="false"
      >
        {{ store.t('User Guide') }}
      </el-link>

      <!-- Language selector -->
      <el-dropdown trigger="click" @command="handleLocaleChange" size="default">
        <el-button text bg round class="lang-btn">
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

      <!-- GitHub link -->
      <el-link
        href="https://github.com/agrhub/baseflow/"
        target="_blank"
        class="github-nav-link"
        :underline="false"
      >
        <GitHubIcon :size="24" />
      </el-link>

      <!-- Optional Back button (Guide page) -->
      <el-button v-if="showBackBtn" round class="back-btn" @click="emit('back')">
        {{ store.t('Back') }}
      </el-button>

      <!-- Launch Console button -->
      <el-button type="primary" round class="nav-launch-btn" @click="emit('launch')">
        {{ store.t('Launch Console') }}
      </el-button>
    </div>
  </header>
</template>

<script setup lang="ts">
import { store } from '../../stores';
import { Location } from '@element-plus/icons-vue';
import { useLocale } from '../../hooks/useLocale';
import GitHubIcon from './GitHubIcon.vue';

const props = withDefaults(
  defineProps<{
    showGuideLink?: boolean;
    showBackBtn?: boolean;
    badgeText?: string;
    brandClickable?: boolean;
  }>(),
  {
    showGuideLink: false,
    showBackBtn: false,
    badgeText: '',
    brandClickable: false
  }
);

const emit = defineEmits<{
  (e: 'guide'): void;
  (e: 'back'): void;
  (e: 'launch'): void;
  (e: 'brand-click'): void;
}>();

const { availableLocales, handleLocaleChange } = useLocale();

const onBrandClick = () => {
  if (props.brandClickable) emit('brand-click');
};
</script>

<style scoped>
.nav-header {
  position: sticky;
  top: 0;
  z-index: 100;
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1rem 2.5rem;
  backdrop-filter: blur(12px);
  background: var(--bg-header, rgba(10, 15, 30, 0.4));
  border-bottom: 1px solid var(--border-color);
}

.brand {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.brand.clickable {
  cursor: pointer;
}

.brand-logo-small {
  width: 32px;
  height: 32px;
}

.brand-name {
  font-size: 1.25rem;
  font-weight: 700;
  letter-spacing: -0.02em;
  color: var(--text-primary);
}

.brand-badge {
  font-size: 0.7rem;
  background: rgba(13, 148, 136, 0.15);
  color: var(--color-brand);
  padding: 0.15rem 0.5rem;
  border-radius: 20px;
  font-weight: 600;
}

.nav-actions {
  display: flex;
  align-items: center;
  gap: 1.5rem;
}

.nav-guide-link {
  font-weight: 600;
  color: var(--text-primary) !important;
  font-size: 0.95rem;
  transition: color 0.3s;
}

.nav-guide-link:hover {
  color: var(--color-brand) !important;
}

.lang-btn {
  font-weight: 600;
}

.github-nav-link {
  color: var(--text-muted);
  display: flex;
  align-items: center;
  transition: color 0.3s;
}

.github-nav-link:hover {
  color: var(--text-primary);
}

.back-btn {
  font-weight: 600;
  background: rgba(255, 255, 255, 0.05);
  border-color: var(--border-color);
  color: var(--text-primary);
}

.back-btn:hover {
  background: rgba(255, 255, 255, 0.1);
  color: var(--color-brand);
}

.nav-launch-btn {
  font-weight: 600;
  padding: 0.5rem 1.5rem;
  box-shadow: 0 4px 15px rgba(13, 148, 136, 0.3);
}

@media (max-width: 600px) {
  .nav-header { padding: 1rem; }
  .nav-launch-btn { display: none; }
}
</style>
