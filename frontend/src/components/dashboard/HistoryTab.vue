<template>
  <div class="history-tab">
    <div class="history-container glass-panel">
      <div class="history-header">
        <div>
          <h3>{{ store.t('Git Commit History') }}</h3>
          <p>{{ store.t('Browse recent commits in the repository.') }}</p>
        </div>
        <div style="display: flex; gap: 8px; align-items: center;">
          <div class="search-box">
            <el-input
              v-model="searchQuery"
              :placeholder="store.t('Filter commits...')"
              clearable
              :prefix-icon="Search"
              size="default"
            />
          </div>
          <el-button
            type="primary"
            text
            bg
            circle
            :icon="Refresh"
            :loading="loading"
            @click="emit('refresh')"
            :title="store.t('Refresh')"
          />
        </div>
      </div>

      <div class="timeline-wrapper" v-if="filteredCommits.length > 0">
        <el-timeline>
          <el-timeline-item
            v-for="commit in filteredCommits"
            :key="commit.hash"
            :timestamp="commit.date"
            type="primary"
            placement="top"
          >
            <el-card class="commit-card glass-panel">
              <div class="commit-card-header">
                <span class="commit-hash">{{ commit.hash }}</span>
                <span class="commit-author">👤 {{ commit.author }}</span>
              </div>
              <p class="commit-message">{{ commit.message }}</p>
            </el-card>
          </el-timeline-item>
        </el-timeline>
      </div>
      <div v-else class="no-data">
        {{ store.t('No matching commits found or the project has no Git history.') }}
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { store } from '../../stores';
import { Search, Refresh } from '@element-plus/icons-vue';

const props = defineProps<{
  commits: any[];
  loading?: boolean;
}>();

const emit = defineEmits<{
  (e: 'refresh'): void;
}>();

const searchQuery = ref('');

const filteredCommits = computed(() => {
  if (!props.commits) return [];
  const query = searchQuery.value.toLowerCase().trim();
  if (!query) return props.commits;

  return props.commits.filter((c: any) =>
    c.message.toLowerCase().includes(query) ||
    c.author.toLowerCase().includes(query) ||
    c.hash.toLowerCase().includes(query)
  );
});
</script>

<style scoped>
.history-container {
  background: var(--bg-surface);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  padding: 1.5rem;
  min-height: 450px;
}

.history-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1.5rem;
}

.history-header h3 {
  margin: 0;
  font-size: 1.25rem;
  color: var(--text-primary);
}

.history-header p {
  margin: 4px 0 0 0;
  font-size: 0.875rem;
  color: var(--text-muted);
}

.search-box {
  width: 300px;
}

.timeline-wrapper {
  margin-top: 1.5rem;
  max-height: 600px;
  overflow-y: auto;
  padding-right: 8px;
}

.commit-card {
  padding: 0.75rem 1rem;
}

.commit-card-header {
  display: flex;
  justify-content: space-between;
  margin-bottom: 0.5rem;
  font-size: 0.825rem;
}

.commit-hash {
  font-family: var(--font-mono, monospace);
  color: var(--color-brand);
  font-weight: 600;
}

.commit-author {
  color: var(--text-muted);
}

.commit-message {
  margin: 0;
  font-size: 0.9rem;
  color: var(--text-primary);
  line-height: 1.4;
}

.no-data {
  text-align: center;
  color: var(--text-muted);
  padding: 3rem 0;
}
</style>
