<template>
  <div v-loading="loadingPipelines" class="issues-list">
    <!-- Header row like GitHub -->
    <div class="list-header" v-if="pipelines.length > 0">
      <el-icon class="status-icon"><VideoPlay /></el-icon>
      <span class="open-count">{{ totalCount }} {{ store.t('Workflow Runs') }}</span>
    </div>

    <!-- Pipelines List -->
    <div class="list-body">
      <div v-for="pipe in pipelines" :key="pipe.id" class="list-item">
        <div class="item-icon">
          <el-icon :class="['status-icon', getStatusClass(pipe.status)]">
            <component :is="getStatusIcon(pipe.status)" />
          </el-icon>
        </div>
        <div class="item-content">
          <div class="item-title-row">
            <span class="item-title" @click="openLink(pipe.url)">{{ pipe.number }}</span>
            <el-tag size="small" :type="getStatusType(pipe.status)" class="status-tag">
              {{ pipe.status }}
            </el-tag>
          </div>
          <div class="item-meta">
            <el-icon class="mr-1"><Calendar /></el-icon> {{ formatDate(pipe.created_at) }} 
            <el-icon class="mx-1"><Guide /></el-icon> <span class="font-mono">{{ pipe.ref }}</span>
          </div>
        </div>

        <div class="item-actions">
          <el-button 
            type="info" 
            text bg round size="small" 
            :icon="DataLine" 
            @click="$emit('analyzePipeline', pipe)"
          >
            {{ store.t('Analyze Failure') }}
          </el-button>
          
          <el-button 
            type="primary" 
            text bg round size="small" 
            :icon="Link" 
            @click="openLink(pipe.url)"
          >
            {{ store.t('View Log') }}
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
    <div v-else-if="pipelines.length === 0 && !loadingPipelines" class="no-data-placeholder text-center py-5">
      <el-icon style="font-size: 2.5rem; color: var(--text-muted);"><FolderOpened /></el-icon>
      <p>{{ store.t('No recent pipelines or actions found.') }}</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, onMounted } from 'vue';
import { store } from '../../stores';
import { DataLine, Link, VideoPlay, FolderOpened, CircleCheckFilled, CircleCloseFilled, InfoFilled, Loading, Calendar, Guide } from '@element-plus/icons-vue';
import axios from 'axios';

defineProps<{
  provider: string;
}>();

const emit = defineEmits<{
  (e: 'analyzePipeline', pipe: any): void;
  (e: 'update-total', total: number): void;
}>();

const pipelines = ref<any[]>([]);
const loadingPipelines = ref(false);
const currentPage = ref(1);
const pageSize = ref(15);
const totalCount = ref(0);
const errorMsg = ref('');

const fetchPipelines = async () => {
  if (!store.activeConnection) return;
  loadingPipelines.value = true;
  errorMsg.value = '';
  try {
    const res = await axios.get(`/api/${store.activeConnection}/devops/pipelines`, {
      params: { page: currentPage.value, per_page: pageSize.value }
    });
    pipelines.value = res.data.data || [];
    totalCount.value = res.data.total || 0;
    emit('update-total', totalCount.value);
  } catch (e: any) {
    console.error('Failed to load DevOps pipelines:', e);
    errorMsg.value = e.response?.data?.error || e.message || 'Failed to load pipelines';
    pipelines.value = [];
    totalCount.value = 0;
    emit('update-total', 0);
  } finally {
    loadingPipelines.value = false;
  }
};

onMounted(() => {
  fetchPipelines();
});

watch(() => store.activeConnection, () => {
  currentPage.value = 1;
  fetchPipelines();
});

const handlePageChange = (page: number) => {
  currentPage.value = page;
  fetchPipelines();
};

const getStatusType = (status: string) => {
  if (['success', 'passed'].includes(status)) return 'success';
  if (['failed', 'failure', 'error'].includes(status)) return 'danger';
  if (['running', 'pending', 'in_progress', 'queued'].includes(status)) return 'warning';
  return 'info';
};

const getStatusClass = (status: string) => {
  const type = getStatusType(status);
  return `status-${type}`;
};

const getStatusIcon = (status: string) => {
  const type = getStatusType(status);
  if (type === 'success') return CircleCheckFilled;
  if (type === 'danger') return CircleCloseFilled;
  if (type === 'warning') return Loading;
  return InfoFilled;
};

const openLink = (url: string) => {
  if (url) window.open(url, '_blank');
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
  gap: 8px;
  font-weight: 600;
  font-size: 0.95rem;
}

.status-icon {
  font-size: 1.1rem;
}

.status-success { color: #2da44e; }
.status-danger { color: #cf222e; }
.status-warning { color: #bf8700; }
.status-info { color: var(--text-muted); }

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
  color: var(--color-brand);
  cursor: pointer;
}

.item-title:hover {
  text-decoration: underline;
}

.status-tag {
  text-transform: capitalize;
  border-radius: 2em;
}

.item-meta {
  font-size: 0.8rem;
  color: var(--text-muted);
  display: flex;
  align-items: center;
  flex-wrap: wrap;
}

.font-mono {
  font-family: var(--font-mono);
  font-size: 0.75rem;
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
.mr-1 { margin-right: 4px; }
.mx-1 { margin: 0 4px; }
</style>
