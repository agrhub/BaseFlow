<template>
  <div v-loading="loadingMrs" class="issues-list">
    <!-- Header row like GitHub -->
    <div class="list-header">
      <div class="header-left">
        <el-icon class="status-icon open"><Right /></el-icon>
        <span class="open-count">{{ totalCount }} {{ store.t('Open') }}</span>
      </div>
      <el-button 
        type="primary" 
        link 
        size="small" 
        :icon="Refresh" 
        :loading="loadingMrs" 
        @click="fetchMrs"
      >
        {{ store.t('Refresh') }}
      </el-button>
    </div>

    <!-- MRs List -->
    <div class="list-body">
      <div v-for="mr in mrs" :key="mr.id" class="list-item">
        <div class="item-icon">
          <el-icon class="status-icon open"><Right /></el-icon>
        </div>
        <div class="item-content">
          <div class="item-title-row">
            <span class="item-title" @click="openDetail(mr)">{{ mr.title }}</span>
            <span v-for="label in mr.labels" :key="label" class="label-tag">{{ label }}</span>
          </div>
          <div class="item-meta">
            {{ mr.number }} {{ store.t('opened') }} {{ formatDate(mr.created_at) }} {{ store.t('by') }} {{ mr.author }}
            <span class="branch-info">
              <el-tag size="small" type="info" class="font-mono">{{ mr.source_branch }}</el-tag>
              <el-icon class="mx-1"><Right /></el-icon>
              <el-tag size="small" type="info" class="font-mono">{{ mr.target_branch }}</el-tag>
            </span>
          </div>
        </div>

        <div class="item-actions">
          <el-button 
            v-if="store.linkedPlaybooks[mr.iid]" 
            type="success" 
            text bg round size="small" icon="Notebook"
            @click="$emit('reviewPlaybook', String(mr.iid))"
          >
            {{ store.t('Review Playbook') }}
          </el-button>
          <el-button 
            type="primary" 
            text bg round size="small" 
            :icon="MagicStick" 
            @click="$emit('reviewMergeRequest', mr)"
          >
            {{ store.t('AI Review') }}
          </el-button>
        </div>
      </div>
    </div>

    <!-- Pagination -->
    <div class="pagination-row" v-if="totalCount > pageSize">
      <el-pagination
        v-model:current-page="currentPage"
        :page-size="pageSize"
        :total="totalCount"
        layout="prev, pager, next"
        @current-change="handlePageChange"
      />
    </div>

    <div v-if="errorMsg" class="no-data-placeholder text-center py-5">
      <el-icon style="font-size: 2.5rem; color: var(--el-color-danger);"><Warning /></el-icon>
      <p style="color: var(--el-color-danger); margin-top: 10px;">{{ errorMsg }}</p>
    </div>
    <div v-else-if="mrs.length === 0 && !loadingMrs" class="no-data-placeholder text-center py-5">
      <el-icon style="font-size: 2.5rem; color: var(--text-muted);"><FolderOpened /></el-icon>
      <p>{{ store.t('No open PRs/MRs found in this repository.') }}</p>
    </div>

    <!-- MR Detail Dialog -->
    <el-dialog v-model="detailVisible" :title="store.t('Pull Request Details')" width="70%" destroy-on-close>
      <div v-if="selectedMr" class="detail-dialog-content" style="overflow-y: scroll;">
        <h2 style="margin-top:0">{{ selectedMr.title }} <span style="color:var(--text-muted)">{{ selectedMr.number }}</span></h2>
        <p style="color:var(--text-muted); font-size: 0.9em; margin-bottom: 20px;">
          {{ store.t('Opened by') }} {{ selectedMr.author }} {{ store.t('on') }} {{ formatDate(selectedMr.created_at) }}
        </p>
        <div class="markdown-body" v-html="renderMarkdown(selectedMr.description || store.t('No description provided.'))"></div>
        <div style="margin-top: 20px; display: flex; gap: 10px; justify-content: flex-end;">
          <el-button @click="detailVisible = false">{{ store.t('Close') }}</el-button>
        </div>
      </div>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, onMounted } from 'vue';
import { store } from '../../stores';
import { MagicStick, Right, FolderOpened, Refresh } from '@element-plus/icons-vue';
import axios from 'axios';

import MarkdownIt from 'markdown-it';

const md = new MarkdownIt({ html: true, linkify: true });

defineProps<{
  provider: string;
}>();

const emit = defineEmits<{
  (e: 'reviewMergeRequest', mr: any): void;
  (e: 'update-total', total: number): void;
  (e: 'reviewPlaybook', id: string): void;
}>();

const mrs = ref<any[]>([]);
const loadingMrs = ref(false);
const currentPage = ref(1);
const pageSize = ref(20);
const totalCount = ref(0);
const errorMsg = ref('');

const detailVisible = ref(false);
const selectedMr = ref<any>(null);

const renderMarkdown = (text: string) => {
  return md.render(text);
};

const openDetail = (mr: any) => {
  selectedMr.value = mr;
  detailVisible.value = true;
};

const fetchMrs = async () => {
  if (!store.activeConnection) return;
  loadingMrs.value = true;
  errorMsg.value = '';
  try {
    const res = await axios.get(`/api/${store.activeConnection}/devops/merge-requests`, {
      params: { page: currentPage.value, per_page: pageSize.value }
    });
    mrs.value = res.data.data || [];
    totalCount.value = res.data.total || 0;
    emit('update-total', totalCount.value);
  } catch (e: any) {
    console.error('Failed to load DevOps MRs:', e);
    errorMsg.value = e.response?.data?.error || e.message || 'Failed to load merge requests';
    mrs.value = [];
    totalCount.value = 0;
    emit('update-total', 0);
  } finally {
    loadingMrs.value = false;
  }
};

onMounted(() => {
  fetchMrs();
});

watch(() => store.activeConnection, () => {
  currentPage.value = 1;
  fetchMrs();
});

const handlePageChange = (page: number) => {
  currentPage.value = page;
  fetchMrs();
};



const formatDate = (dateStr: string) => {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 3600 * 24));
  if (diffDays === 0) return store.t('today');
  if (diffDays === 1) return store.t('yesterday');
  if (diffDays < 30) return `${diffDays} ${store.t('days ago')}`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

defineExpose({
  fetchMrs,
  loadingMrs
});
</script>

<style scoped>
.issues-list {
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  background: var(--bg-secondary);
  overflow: hidden;
}

.list-header {
  padding: 16px;
  background: var(--bg-tertiary);
  border-bottom: 1px solid var(--border-color);
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-weight: 600;
  font-size: 0.95rem;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 8px;
}

.status-icon.open {
  color: #2da44e; /* GitHub green */
  font-size: 1.1rem;
}

.open-count {
  color: var(--text-primary);
}

.list-body {
  display: flex;
  flex-direction: column;
}

.list-item {
  display: flex;
  padding: 12px 16px;
  border-bottom: 1px solid var(--border-color);
  transition: background-color 0.15s ease;
}

.list-item:hover {
  background: rgba(255, 255, 255, 0.03);
}

.list-item:last-child {
  border-bottom: none;
}

.item-icon {
  margin-right: 12px;
  margin-top: 2px;
}

.item-content {
  flex: 1;
}

.item-title-row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 4px;
}

.item-title {
  font-size: 1rem;
  font-weight: 600;
  color: var(--text-primary);
  cursor: pointer;
}

.item-title:hover {
  color: var(--color-brand);
}

.item-meta {
  font-size: 0.8rem;
  color: var(--text-muted);
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
}

.branch-info {
  display: flex;
  align-items: center;
  margin-left: 8px;
}

.font-mono {
  font-family: var(--font-mono);
  font-size: 0.7rem;
}

.item-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  opacity: 0;
  transition: opacity 0.2s ease;
}

.list-item:hover .item-actions {
  opacity: 1;
}

.pagination-row {
  padding: 16px;
  display: flex;
  justify-content: center;
  border-top: 1px solid var(--border-color);
  background: var(--bg-tertiary);
}

.text-center { text-align: center; }
.py-5 { padding-top: 32px; padding-bottom: 32px; }
.mx-1 { margin: 0 4px; }
</style>
