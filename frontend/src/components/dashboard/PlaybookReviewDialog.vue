<template>
  <el-dialog
    v-model="visible"
    :title="store.playbookToReview?.title || store.t('Playbook Review')"
    width="800px"
    class="playbook-review-dialog"
    append-to-body
    :close-on-click-modal="false"
    :style="store.chatSidebarOpen ? { marginRight: 'calc((100% - 400px)/2)' } : {}"
  >
    <div class="playbook-content" v-if="store.playbookToReview">
      <div class="content-header">
        <span class="file-path-badge"><el-icon><Document /></el-icon> {{ store.playbookToReview.filePath }}</span>
        <el-tag type="success" size="small" round>{{ store.t('AI Generated') }}</el-tag>
      </div>
      
      <!-- Preview Mode -->
      <div v-if="!isEditing" class="markdown-body" v-html="renderMarkdown(store.playbookToReview.content)"></div>
      
      <!-- Edit Mode -->
      <div v-else class="editor-container">
        <el-input
          type="textarea"
          v-model="editContent"
          :rows="18"
          class="raw-markdown-editor"
          placeholder="Edit markdown content..."
        />
      </div>
    </div>
    <template #footer>
      <span class="dialog-footer">
        <template v-if="!isEditing">
          <el-button @click="visible = false" round>{{ store.t('Close') }}</el-button>
          <el-button type="primary" round @click="startEdit">
            {{ store.t('Edit') }}
          </el-button>
        </template>
        <template v-else>
          <el-button @click="cancelEdit" round>{{ store.t('Cancel') }}</el-button>
          <el-button type="success" :loading="saving" round @click="saveEdit">
            {{ store.t('Save') }}
          </el-button>
        </template>
      </span>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';
import { store } from '../../stores';
import { marked } from 'marked';
import { Document } from '@element-plus/icons-vue';
import { ElMessage } from 'element-plus';
import axios from 'axios';

const visible = ref(false);
const isEditing = ref(false);
const editContent = ref('');
const saving = ref(false);

watch(() => store.playbookToReview, (newVal) => {
  if (newVal) {
    visible.value = true;
    isEditing.value = false;
  }
});

watch(visible, (newVal) => {
  if (!newVal) {
    store.playbookToReview = null;
    isEditing.value = false;
  }
});

const renderMarkdown = (text: string) => {
  if (!text) return '';
  return marked.parse(text);
};

const startEdit = () => {
  if (store.playbookToReview) {
    editContent.value = store.playbookToReview.content;
    isEditing.value = true;
  }
};

const cancelEdit = () => {
  isEditing.value = false;
};

const saveEdit = async () => {
  if (!store.playbookToReview || !store.activeConnection) return;
  saving.value = true;
  try {
    const res = await axios.post(`/api/${store.activeConnection}/documents/content`, {
      path: store.playbookToReview.filePath,
      content: editContent.value
    });
    if (res.data.success) {
      ElMessage.success(store.t('Document saved successfully!'));
      if (typeof pendo !== 'undefined') {
        pendo.track('playbook_reviewed', {
          connection_name: store.activeConnection,
          document_path: store.playbookToReview.filePath,
          content_length: editContent.value.length
        });
      }
      store.playbookToReview.content = editContent.value;
      isEditing.value = false;
    }
  } catch (err: any) {
    console.error('Failed to save document:', err);
    ElMessage.error(store.t('Failed to save document: ') + (err.response?.data?.error || err.message));
  } finally {
    saving.value = false;
  }
};
</script>

<style scoped>
.playbook-review-dialog {
  border-radius: var(--radius-lg);
}

.playbook-content {
  background: var(--bg-tertiary);
  border-radius: var(--radius-md);
  padding: 1rem;
  max-height: 60vh;
  overflow-y: auto;
  border: 1px solid var(--border-color);
}

.content-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1rem;
  padding-bottom: 0.5rem;
  border-bottom: 1px solid var(--border-color);
}

.file-path-badge {
  font-family: var(--font-mono);
  font-size: 0.85rem;
  color: var(--text-secondary);
  display: flex;
  align-items: center;
  gap: 6px;
}

.markdown-body {
  color: var(--text-primary);
  font-size: 0.95rem;
  line-height: 1.6;
}

.markdown-body :deep(h1),
.markdown-body :deep(h2),
.markdown-body :deep(h3) {
  color: var(--color-brand);
  margin-top: 1.5rem;
  margin-bottom: 1rem;
}

.markdown-body :deep(pre) {
  background: #1e1e1e;
  padding: 1rem;
  border-radius: 6px;
  overflow-x: auto;
  font-family: var(--font-mono);
  font-size: 0.85rem;
  color: #d4d4d4;
  margin: 1rem 0;
}

.markdown-body :deep(code) {
  background: rgba(255, 255, 255, 0.1);
  padding: 0.2rem 0.4rem;
  border-radius: 4px;
  font-family: var(--font-mono);
  font-size: 0.85em;
  color: #ff9d00;
}

.editor-container {
  width: 100%;
}

.raw-markdown-editor :deep(.el-textarea__inner) {
  font-family: var(--font-mono);
  background: var(--bg-secondary) !important;
  color: var(--text-primary) !important;
  border-color: var(--border-color) !important;
  font-size: 0.9rem;
  line-height: 1.5;
  padding: 12px;
}
</style>
