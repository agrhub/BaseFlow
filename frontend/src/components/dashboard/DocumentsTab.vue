<template>
  <div class="documents-tab" v-loading="loadingDocuments">
    <div class="documents-layout">
      <el-row :gutter="20">
        <!-- Left Side: Document Tree/List -->
        <el-col :xs="24" :md="6">
          <el-card class="doc-list-card glass-panel">
            <template #header>
              <div class="card-header" style="display: flex; justify-content: space-between; align-items: center;">
                <span>📂 {{ store.t('Codebase Docs') }}</span>
                <el-button
                  type="primary"
                  link
                  size="small"
                  :icon="Refresh"
                  :loading="loadingDocuments"
                  @click="emit('refresh-documents')"
                  :title="store.t('Refresh')"
                />
              </div>
            </template>
            <div class="doc-list-content">
              <div 
                v-for="doc in documentList" 
                :key="doc" 
                :class="['doc-item', { active: selectedDocument === doc }]"
                @click="emit('select-document', doc)"
              >
                📄 {{ doc }}
              </div>
              <div v-if="documentList.length === 0" class="no-data-msg">
                {{ store.t('No Markdown documents found in the codebase.') }}
              </div>
            </div>
          </el-card>
        </el-col>
        
        <!-- Middle Side: Document Content Viewer -->
        <el-col :xs="24" :md="selectedDocument ? 11 : 18">
          <el-card class="doc-viewer-card glass-panel" v-loading="loadingDocContent">
            <template #header>
              <div class="card-header" style="display: flex; justify-content: space-between; align-items: center;">
                <span>📄 {{ selectedDocument || store.t('Select a document') }}</span>
                <div v-if="selectedDocument" style="display: flex; gap: 8px;">
                  <el-button size="small" type="primary" text round icon="CopyDocument" @click="copyDocContent">{{ store.t('Copy') }}</el-button>
                  <el-button size="small" type="primary" text round style="margin-left: 5px" icon="Download" @click="downloadDoc">{{ store.t('Download') }}</el-button>
                </div>
              </div>
            </template>
            <div class="doc-viewer-content">
              <div v-if="docContent" class="markdown-body" v-html="renderMarkdown(docContent)"></div>
              <div v-else class="select-prompt">
                <el-icon style="font-size: 3rem; color: var(--text-muted);"><FolderOpened /></el-icon>
                <p>{{ store.t('Select a markdown document from the list to display contents and activate AI analysis.') }}</p>
              </div>
            </div>
          </el-card>
        </el-col>
        
        <!-- Right Side: AI Assistant Side-Panel -->
        <el-col :xs="24" :md="7" v-if="selectedDocument">
          <div class="ai-assistant-side-panel">
            <!-- Tab Headers / Controls -->
            <el-card class="ai-side-card glass-panel">
              <template #header>
                <div class="card-header">{{ store.t('AI Document Assistant') }}</div>
              </template>
              
              <div class="ai-action-buttons">
                <!-- <el-button 
                  v-if="!isGeneratedPlaybook"
                  type="primary" icon="Notebook"
                  size="small" text bg round
                  style="width: 100%; margin-bottom: 10px;" 
                  :loading="generatingSkill"
                  @click="emit('generate-skill')"
                >
                  {{ store.t('Generate Playbook') }}
                </el-button> -->
                <el-button 
                  v-if="isGeneratedPlaybook"
                  type="success" icon="Checked"
                  size="small" text bg round
                  style="width: 100%; margin-left: 0; margin-bottom: 10px;" 
                  @click="emit('verify-mcp')"
                >
                  {{ store.t('Verify Playbook') }}
                </el-button>
                <el-button 
                  v-if="isGeneratedPlaybook"
                  type="danger" icon="Promotion"
                  size="small" text bg round
                  style="width: 100%; margin-left: 0; margin-bottom: 10px;"
                  @click="emit('publish-to-catalog')"
                >
                  {{ store.devopsInfo?.provider === 'github' ? store.t('Publish to GitHub Copilot') : store.t('Publish to GitLab Duo') }}
                </el-button>
                <el-button 
                  type="primary" icon="ChatDotRound"
                  size="small" text bg round
                  style="width: 100%; margin-left: 0; margin-bottom: 10px;" 
                  @click="askAgentAboutDoc"
                >
                  {{ store.t('Ask Agent') }}
                </el-button>
              </div>
            </el-card>
            
            <!-- Summary Card -->
            <el-card class="ai-side-card glass-panel" v-loading="loadingDocAnalysis">
              <template #header>
                <div class="card-header">{{ store.t('Summary & Core Insights') }}</div>
              </template>
              <div class="ai-insights-content">
                <h4 class="insight-section-title">{{ store.t('Summary') }}</h4>
                <p class="summary-text">{{ docAnalysis?.summary || store.t('No summary generated yet.') }}</p>
                
                <h4 class="insight-section-title" style="margin-top: 15px;">{{ store.t('Key Insights') }}</h4>
                <ul class="insights-ul">
                  <li v-for="insight in docAnalysis?.insights || []" :key="insight">{{ insight }}</li>
                </ul>
                <div v-if="!(docAnalysis?.insights?.length)" class="no-data-msg">{{ store.t('No insights computed.') }}</div>
              </div>
            </el-card>

            <!-- Suggestions Card -->
            <el-card class="ai-side-card glass-panel" v-loading="loadingDocAnalysis">
              <template #header>
                <div class="card-header"> {{ store.t('Suggested Improvements') }}</div>
              </template>
              <div class="ai-insights-content">
                <ul class="insights-ul">
                  <li v-for="sug in docAnalysis?.suggestions || []" :key="sug">{{ sug }}</li>
                </ul>
                <div v-if="!(docAnalysis?.suggestions?.length)" class="no-data-msg">{{ store.t('No suggestions computed.') }}</div>
              </div>
            </el-card>
            

          </div>
        </el-col>
      </el-row>
    </div>

    <!-- Agent Catalog Dialog -->
    <el-dialog 
      :model-value="!!store.catalogReadyData" 
      @update:model-value="(val: boolean) => { if (!val) store.catalogReadyData = null }"
      :title="store.devopsInfo?.provider === 'github' ? store.t('GitHub Copilot Custom Agent Setup') : store.t('GitLab Duo Custom Agent Setup')" 
      width="600px"
    >
      <div v-if="store.catalogReadyData">
        <p>{{ store.devopsInfo?.provider === 'github' ? store.t('Your custom agent configuration is ready to be published to GitHub Copilot.') : store.t('Your custom agent configuration is ready to be published to the GitLab AI Catalog.') }}</p>
        <div style="margin-top: 15px; background: var(--bg-secondary); padding: 15px; border-radius: 8px;">
          <p><strong>{{ store.t('Agent Name') }}:</strong> {{ store.catalogReadyData.agentName }}</p>
          <p><strong>{{ store.t('System Prompt File') }}:</strong> <code>{{ store.catalogReadyData.skillFilePath }}</code></p>
        </div>
        <div style="margin-top: 20px;">
          <el-button type="primary" size="large" style="width: 100%" @click="openCatalogUrl(store.catalogReadyData.catalogUrl)">
            {{ store.devopsInfo?.provider === 'github' ? store.t('Open GitHub Copilot Settings') : store.t('Open GitLab Duo Settings') }}
          </el-button>
        </div>
        <p style="margin-top: 15px; font-size: 0.85rem; color: var(--text-muted); text-align: center;">
          {{ store.t('Copy the markdown content generated in the chat and paste it as the System Prompt.') }}
        </p>
      </div>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, computed } from 'vue';
import { store } from '../../stores';
import { ElMessage } from 'element-plus';
import { FolderOpened, Refresh } from '@element-plus/icons-vue';
import MarkdownIt from 'markdown-it';


const md = new MarkdownIt({ html: true, linkify: true });

const props = defineProps<{
  documentList: string[];
  loadingDocuments: boolean;
  selectedDocument: string;
  docContent: string;
  loadingDocContent: boolean;
  docAnalysis: any;
  loadingDocAnalysis: boolean;
  generatingSkill: boolean;
}>();

const emit = defineEmits<{
  (e: 'select-document', doc: string): void;
  (e: 'generate-skill'): void;
  (e: 'verify-mcp'): void;
  (e: 'publish-to-catalog'): void;
  (e: 'ask-agent', doc: string): void;
  (e: 'refresh-documents'): void;
}>();

const isGeneratedPlaybook = computed(() => {
  if (!props.selectedDocument) return false;
  const lower = props.selectedDocument.toLowerCase();
  return lower.startsWith('skills/') || lower.includes('playbook') || lower.includes('report') || lower.includes('audit');
});

const copyDocContent = () => {
  if (navigator.clipboard && props.docContent) {
    navigator.clipboard.writeText(props.docContent);
    ElMessage.success(store.t('Copied to clipboard!'));
  }
  else{
	ElMessage.error(store.t('Failed to copy document!'));
  }
};

const downloadDoc = () => {
  if (!props.docContent || !props.selectedDocument) return;
  const blob = new Blob([props.docContent], { type: 'text/markdown' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = props.selectedDocument.split('/').pop() || 'document.md';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

const docChatMessages = ref<Array<{ sender: 'user' | 'assistant'; text: string }>>([]);

const askAgentAboutDoc = () => {
  emit('ask-agent', props.selectedDocument);
};

// Reset chat messages when document changes
watch(() => props.selectedDocument, () => {
  docChatMessages.value = [];
});

const renderMarkdown = (text: string) => {
  if (!text) return '';
  return md.render(text);
};

const openCatalogUrl = (url: string) => {
  window.open(url, '_blank');
};
</script>

<style scoped>
.documents-layout {
  margin-top: 1.5rem;
}

.doc-list-card {
  height: 600px;
  display: flex;
  flex-direction: column;
}

.card-header {
  font-weight: 600;
  color: var(--text-primary);
}

.doc-list-content {
  overflow-y: auto;
  flex-grow: 1;
}

.doc-item {
  padding: 10px 12px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 0.875rem;
  color: var(--text-secondary);
  transition: all 0.15s ease;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  margin-bottom: 4px;
}

.doc-item:hover {
  background: var(--bg-secondary);
  color: var(--color-brand);
}

.doc-item.active {
  background: var(--color-brand-light);
  color: var(--color-brand);
  font-weight: 600;
}

.no-data-msg {
  text-align: center;
  color: var(--text-muted);
  font-size: 0.825rem;
  padding: 2rem 0;
}

.doc-viewer-card {
  height: 600px;
  display: flex;
  flex-direction: column;
}

.doc-viewer-content {
  overflow-y: auto;
  flex-grow: 1;
  padding: 0.5rem;
}

.select-prompt {
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  height: 400px;
  color: var(--text-muted);
  text-align: center;
}

.ai-assistant-side-panel {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  /* height: 600px; */
  overflow-y: auto;
  padding-right: 8px;
}

.ai-side-card {
  margin-bottom: 0;
}

.ai-insights-content {
  font-size: 0.875rem;
  line-height: 1.5;
  max-height: 300px;
  overflow-y: auto;
}

.insight-section-title {
  margin: 0 0 6px 0;
  font-size: 0.875rem;
  color: var(--text-primary);
  font-weight: 600;
}

.summary-text {
  margin: 0;
  color: var(--text-secondary);
}

.insights-ul {
  margin: 0;
  padding-left: 20px;
  color: var(--text-secondary);
}

.insights-ul li {
  margin-bottom: 4px;
}

.ai-action-buttons {
  display: flex;
  flex-direction: column;
}

/* Chat container inside card */
.doc-chat-container {
  display: flex;
  flex-direction: column;
  height: 250px;
}

.doc-chat-history {
  flex-grow: 1;
  overflow-y: auto;
  padding: 8px;
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: 6px;
  margin-bottom: 8px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.chat-bubble-row {
  display: flex;
  width: 100%;
}

.chat-bubble-row.user {
  justify-content: flex-end;
}

.chat-bubble {
  max-width: 80%;
  padding: 8px 12px;
  border-radius: 8px;
  font-size: 0.825rem;
}

.chat-bubble-row.user .chat-bubble {
  background: var(--color-brand);
  color: #fff;
  border-bottom-right-radius: 0;
}

.chat-bubble-row.assistant .chat-bubble {
  background: var(--bg-surface);
  border: 1px solid var(--border-color);
  color: var(--text-primary);
  border-bottom-left-radius: 0;
}

.bubble-sender {
  font-weight: 600;
  margin-bottom: 2px;
  font-size: 0.75rem;
}

.chat-bubble-row.user .bubble-sender {
  color: rgba(255, 255, 255, 0.8);
}

.chat-bubble-row.assistant .bubble-sender {
  color: var(--color-brand);
}

.bubble-text {
  line-height: 1.4;
  word-break: break-word;
}

.bubble-text :deep(p) {
  margin: 0;
}

.doc-chat-input-bar {
  margin-top: auto;
}
</style>
