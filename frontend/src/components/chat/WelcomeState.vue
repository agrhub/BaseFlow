<template>
  <div class="welcome-box">
    <div class="welcome-icon">
      <el-image src="/logo.png" style="width: 48px; height: 48px;" class="brand-logo" />
    </div>
    <h4>{{ store.t('Welcome to BaseFlow Assistant') }}</h4>
    <p>{{ store.t('I can help you analyze codebases, inspect class structures, suggest refactoring, write tests, or interact with GitLab workflows.') }}</p>
    <div class="suggestions-box">
      <template v-if="!activeItem">
        <span
          v-for="sugg in welcomeSuggestions"
          :key="sugg.value"
          class="suggestion-tag"
          @click="$emit('select-suggestion', sugg.value)"
        >
          {{ sugg.label }}
        </span>
      </template>
      <template v-else>
        <span class="suggestion-tag" @click="$emit('select-suggestion', `Optimize the source code of ${activeItem}`)">
          💡 {{ store.t('Optimize {item}', { item: activeItem }) }}
        </span>
        <span class="suggestion-tag" @click="$emit('select-suggestion', `Write automated unit tests for ${activeItem}`)">
          🧪 {{ store.t('Write unit tests for {item}', { item: activeItem }) }}
        </span>
        <span class="suggestion-tag" @click="$emit('select-suggestion', `Analyze refactoring impact for ${activeItem}`)">
          ⚠️ {{ store.t('Analyze refactor impact for {item}', { item: activeItem }) }}
        </span>
        <span class="suggestion-tag" @click="$emit('select-suggestion', `Navigate to the mindmap and highlight ${activeItem}`)">
          🗺️ {{ store.t('Show {item} on mindmap', { item: activeItem }) }}
        </span>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { store } from '../../stores';

defineProps<{
  activeItem: string;
  welcomeSuggestions: Array<{ value: string; label: string }>;
}>();

defineEmits<{
  (e: 'select-suggestion', suggestion: string): void;
}>();
</script>

<style scoped>
.welcome-box {
  text-align: center;
  padding: 20px 12px;
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}

.welcome-icon { 
  font-size: 40px; 
  margin-bottom: 12px; 
}

.welcome-box h4 {
  margin: 0 0 8px 0;
  font-size: 1rem;
  font-weight: 700;
  color: var(--text-primary);
}

.welcome-box p {
  font-size: 0.8rem;
  color: var(--text-muted);
  line-height: 1.5;
  max-width: 280px;
  margin-bottom: 16px;
}

.suggestions-box {
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: 100%;
}

.suggestion-tag {
  display: inline-block;
  padding: 8px 12px;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid var(--el-color-primary);
  border-radius: 20px;
  color: var(--el-color-primary);
  font-size: 0.75rem;
  cursor: pointer;
  transition: all 0.2s ease;
  text-align: left;
}

.suggestion-tag:hover {
  background: rgba(99, 102, 241, 0.1);
  border-color: var(--color-primary);
  color: var(--text-primary);
  transform: translateX(4px);
}
</style>
