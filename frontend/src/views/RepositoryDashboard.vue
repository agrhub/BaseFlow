<template>
  <div class="dashboard-view page-body" v-loading="loading">
    <!-- Header -->
    <div class="dashboard-header-row" v-if="stats">
      <div>
        <h2 class="section-title">
          <el-icon class="title-icon"><MessageBox /></el-icon>
          {{ store.activeConnection }}
        </h2>
        <p class="section-desc">{{ store.t('Codebase Dashboard') }}</p>
      </div>

      <!-- Actions -->
      <div class="dashboard-actions">
        <el-button-group>
          <el-button
            v-if="isRemote"
            type="danger"
            :loading="pulling"
            @click="pullRepository"
            text bg round 
            :icon="Download"
          >
            {{ store.t('Pull') }}
          </el-button>

          <el-button
            type="primary"
            :loading="syncing"
            @click="syncCodebase"
            text bg round 
            :icon="Refresh"
          >
            {{ store.t('Refresh') }}
          </el-button>
        </el-button-group>
      </div>
    </div>

    <!-- Navigation Tabs -->
    <el-tabs v-model="activeTab" class="dashboard-tabs" v-if="stats">
      <!-- 1. GENERATE TAB -->
      <el-tab-pane name="generate">
        <template #label>
          <span class="tab-label">
            <el-icon><DataBoard /></el-icon> {{ store.t('Generate') }}
          </span>
        </template>
        <OverviewTab :stats="stats" :readme-analysis="readmeAnalysis" />
      </el-tab-pane>

      <!-- 2. MINDMAP TAB -->
      <el-tab-pane name="mindmap">
        <template #label>
          <span class="tab-label">
            <el-icon><Share /></el-icon> {{ store.t('Maps') }}
          </span>
        </template>
        <MindmapTab
          :graph-nodes="filteredGraphNodes"
          :graph-edges="filteredGraphEdges"
          :selected-node="selectedNode"
          :selected-node-name="selectedNodeName"
          :class-analysis-text="classAnalysisText"
          :loading-analysis="loadingAnalysis"
          v-model:is-focus-mode="isFocusMode"
          @select-node="onMindmapNodeClick"
          @clear-selection="clearSelection"
        />
      </el-tab-pane>

      <!-- 3. ANALYSIS TAB -->
      <el-tab-pane name="analysis">
        <template #label>
          <span class="tab-label">
            <el-icon><Cpu /></el-icon> {{ store.t('Analysis') }}
          </span>
        </template>
        <AnalysisTab :readme-analysis="readmeAnalysis" :loading-readme="loadingReadme" />
      </el-tab-pane>

      <!-- 4. HISTORY TAB -->
      <el-tab-pane name="history">
        <template #label>
          <span class="tab-label">
            <el-icon><Clock /></el-icon> {{ store.t('History') }}
          </span>
        </template>
        <HistoryTab :commits="stats?.commits || []" />
      </el-tab-pane>

      <!-- 5. DEVOPS TAB -->
      <el-tab-pane name="gitlab">
        <template #label>
          <span class="tab-label">
            <el-icon><Files /></el-icon> {{ store.t('DevOps') }}
          </span>
        </template>
        <DevOpsTab />
      </el-tab-pane>

      <!-- 6. ARCHITECTURE TAB -->
      <el-tab-pane name="architecture">
        <template #label>
          <span class="tab-label">
            <el-icon><Management /></el-icon> {{ store.t('Architecture') }}
          </span>
        </template>
        <ArchitectureTab
          :loading-architecture="loadingArchitecture"
          :regenerating-architecture="regeneratingArchitecture"
          :arch-diagram-svg="archDiagramSvg"
          :class-diagram-svg="classDiagramSvg"
          @regenerate="regenerateArchitecture"
        />
      </el-tab-pane>
      
      <!-- 7. DOCUMENTS TAB -->
      <el-tab-pane name="documents">
        <template #label>
          <span class="tab-label">
            <el-icon><Document /></el-icon> {{ store.t('Documents') }}
          </span>
        </template>
        <DocumentsTab
          :document-list="documentList"
          :loading-documents="loadingDocuments"
          :selected-document="selectedDocument"
          :doc-content="docContent"
          :loading-doc-content="loadingDocContent"
          :doc-analysis="docAnalysis"
          :loading-doc-analysis="loadingDocAnalysis"
          :generating-skill="generatingSkill"
          @select-document="selectDocument"
          @generate-skill="generateDocumentSkill"
          @verify-mcp="verifyCodebaseWithMCP"
          @publish-to-catalog="publishSkillToCatalog"
          @ask-agent="handleAskAgent"
        />
      </el-tab-pane>
    </el-tabs>

    <!-- Loading/Empty placeholder -->
    <div v-if="!stats && !loading" class="empty-placeholder">
      <el-icon style="font-size: 3rem; color: var(--text-muted);"><FolderOpened /></el-icon>
      <p>{{ store.t('No codebase found') }}</p>
    </div>

    <!-- Playbook Review Dialog -->
    <PlaybookReviewDialog />
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, watch, markRaw, computed } from 'vue';
import { store } from '../stores';
import axios from 'axios';
import { ElMessage } from 'element-plus';
import { 
  FolderOpened, Share, Cpu, Clock, Files, Management, Document, Download, Refresh
} from '@element-plus/icons-vue';
import OverviewTab from '../components/dashboard/OverviewTab.vue';
import MindmapTab from '../components/dashboard/MindmapTab.vue';
import AnalysisTab from '../components/dashboard/AnalysisTab.vue';
import HistoryTab from '../components/dashboard/HistoryTab.vue';
import DevOpsTab from '../components/dashboard/DevOpsTab.vue';
import ArchitectureTab from '../components/dashboard/ArchitectureTab.vue';
import PlaybookReviewDialog from '../components/dashboard/PlaybookReviewDialog.vue';
import DocumentsTab from '../components/dashboard/DocumentsTab.vue';
import mermaid from 'mermaid';

const loading = ref(false);
const stats = ref<any>(null);

const activeTab = computed({
  get: () => store.activeTab,
  set: (val) => { store.activeTab = val; }
});

watch(() => store.selectedMindmapNode, (newVal) => {
  if (newVal) {
    store.activeTab = 'mindmap';
    const match = graphNodes.value.find(n => 
      n.data?.name?.toLowerCase() === newVal.toLowerCase() || 
      (n.data?.filePath && n.data.filePath.replace(/\\/g, '/').toLowerCase().endsWith(newVal.toLowerCase()))
    );
    if (match) {
      selectedNode.value = match.data;
      selectedNodeName.value = match.data.name;
      fetchClassAnalysis(match.data.name);
    }
    store.selectedMindmapNode = ''; // Reset trigger
  }
});

const isRemote = computed(() => {
  const conn = store.connections[store.activeConnection];
  return conn?.connection_options?.type === 'remote';
});

const syncing = ref(false);
const pulling = ref(false);

const syncCodebase = async () => {
  syncing.value = true;
  try {
    const res = await axios.post(`/api/${store.activeConnection}/sync`);
    if (res.data.success) {
      ElMessage.success(store.t('Codebase successfully re-analyzed!'));
      if (typeof pendo !== 'undefined') {
        pendo.track('codebase_synced', {
          connection_name: store.activeConnection,
          success: true
        });
      }
      await fetchStats();
      await store.fetchSidebar();
    }
  } catch (e: any) {
    const errorMsg = e.response?.data?.error || e.message;
    ElMessage.error(store.t('Failed to sync codebase: ') + errorMsg);
  } finally {
    syncing.value = false;
  }
};

const pullRepository = async () => {
  pulling.value = true;
  try {
    const res = await axios.post(`/api/${store.activeConnection}/pull`);
    if (res.data.success) {
      ElMessage.success(store.t('Repository successfully updated and re-analyzed!'));
      if (typeof pendo !== 'undefined') {
        pendo.track('repository_pulled', {
          connection_name: store.activeConnection,
          success: true
        });
      }
      await fetchStats();
      await store.fetchSidebar();
    }
  } catch (e: any) {
    const errorMsg = e.response?.data?.error || e.message;
    ElMessage.error(store.t('Failed to pull updates: ') + errorMsg);
  } finally {
    pulling.value = false;
  }
};

const readmeAnalysis = ref<any>(null);
const loadingReadme = ref(false);

const graphNodes = ref<any[]>([]);
const graphEdges = ref<any[]>([]);

// Interaction inspector details states
const selectedNode = ref<any>(null);
const selectedNodeName = ref('');
const loadingAnalysis = ref(false);
const classAnalysisText = ref('');
const isFocusMode = ref(false);

const fetchReadmeAnalysis = async () => {
  if (!store.activeConnection) return;
  loadingReadme.value = true;
  try {
    const res = await axios.get(`/api/${store.activeConnection}/readme-analysis`);
    readmeAnalysis.value = res.data;
    if (typeof pendo !== 'undefined') {
      pendo.track('readme_analysis_completed', {
        connection_name: store.activeConnection,
        project_name: res.data?.projectName || '',
        complexity_score: res.data?.complexityScore || 0,
        tech_stack_count: (res.data?.techStack || []).length,
        feature_count: (res.data?.features || []).length
      });
    }
  } catch (e) {
    console.error('Failed to fetch readme analysis:', e);
  } finally {
    loadingReadme.value = false;
  }
};

const fetchGraph = async () => {
  if (!store.activeConnection) return;
  try {
    const res = await axios.get(`/api/${store.activeConnection}/graph`);
    graphNodes.value = res.data.nodes || [];
    graphEdges.value = res.data.edges || [];
    store.classesData = markRaw(res.data.nodes || []);
    if (typeof pendo !== 'undefined') {
      pendo.track('codebase_parsed', {
        connection_name: store.activeConnection,
        node_count: (res.data.nodes || []).length,
        edge_count: (res.data.edges || []).length
      });
    }
  } catch (e) {
    console.error('Failed to fetch mindmap graph:', e);
  }
};

const fetchStats = async () => {
  if (!store.activeConnection) return;
  loading.value = true;
  try {
    const res = await axios.get(`/api/${store.activeConnection}/stats`);
    stats.value = res.data;
    loading.value = false; // complete main loading immediately
    
    // Fetch remaining data in the background
    Promise.all([
      fetchReadmeAnalysis(),
      fetchGraph()
    ]).catch(err => console.error('Background fetch error:', err));
  } catch (e) {
    console.error('Failed to fetch repo stats:', e);
    ElMessage.error(store.t('Failed to load repository statistics.'));
    loading.value = false;
  }
};

const fetchClassAnalysis = async (className: string) => {
  loadingAnalysis.value = true;
  classAnalysisText.value = '';
  try {
    const res = await axios.post(`/api/${store.activeConnection}/class-analysis`, { className });
    classAnalysisText.value = res.data.analysis;
    if (typeof pendo !== 'undefined') {
      pendo.track('class_ai_analysis_completed', {
        connection_name: store.activeConnection,
        class_name: className
      });
    }
  } catch (e) {
    console.error('Failed to fetch class analysis:', e);
    classAnalysisText.value = store.t('Failed to load AI analysis for this component.');
  } finally {
    loadingAnalysis.value = false;
  }
};

const clearSelection = () => {
  selectedNode.value = null;
  selectedNodeName.value = '';
  isFocusMode.value = false;
  classAnalysisText.value = '';
};

// Mindmap node interactions
const onMindmapNodeClick = (nodeData: any) => {
  if (!nodeData) {
    clearSelection();
    return;
  }
  
  let targetNodeName = '';
  
  // Detect if nodeData is an Event/MouseEvent
  if (nodeData instanceof Event || (nodeData.target && (nodeData.preventDefault || nodeData.stopPropagation))) {
    const target = nodeData.target as SVGElement;
    const nodeElement = target.closest('.node');
    if (nodeElement) {
      const textEl = nodeElement.querySelector('text');
      if (textEl && textEl.textContent) {
        targetNodeName = textEl.textContent.trim();
      }
    }
  } else if (typeof nodeData === 'string') {
    targetNodeName = nodeData;
  } else if (nodeData.name) {
    targetNodeName = nodeData.name;
  } else if (nodeData.classData?.name) {
    targetNodeName = nodeData.classData.name;
  } else if (nodeData.filePath) {
    const parts = nodeData.filePath.replace(/\\/g, '/').split('/');
    targetNodeName = parts[parts.length - 1];
  }

  if (targetNodeName) {
    const match = graphNodes.value.find(n => 
      n.data?.name?.toLowerCase() === targetNodeName.toLowerCase() || 
      (n.data?.filePath && n.data.filePath.replace(/\\/g, '/').toLowerCase().endsWith(targetNodeName.toLowerCase()))
    );
    if (match) {
      selectedNode.value = match.data;
      selectedNodeName.value = match.data.name;
      fetchClassAnalysis(match.data.name);
      
      // Synchronize with global store active items!
      store.setItem(match.data.name);
      if (match.data.filePath) {
        const parts = match.data.filePath.replace(/\\/g, '/').split('/');
        if (parts.length > 1) {
          store.activeFolder = parts.slice(0, -1).join('/');
        }
      }
    } else {
      // If it's a directory node or unmapped file node
      if (nodeData && nodeData.filePath) {
        const parts = nodeData.filePath.replace(/\\/g, '/').split('/');
        store.activeFolder = nodeData.isLeaf ? parts.slice(0, -1).join('/') : nodeData.filePath;
        store.activeItem = nodeData.isLeaf ? nodeData.name : '';
      }
    }
  }
};

const filteredGraphNodes = computed(() => {
  let nodes = graphNodes.value;
  if (store.vulnerableNodes && store.vulnerableNodes.length > 0) {
    nodes = nodes.map(n => {
      const isVuln = store.vulnerableNodes.some(v => 
        n.id.toLowerCase() === v.toLowerCase() || 
        n.data?.name?.toLowerCase() === v.toLowerCase() ||
        (n.data?.filePath && n.data.filePath.toLowerCase().endsWith(v.toLowerCase()))
      );
      if (isVuln) {
        return { ...n, data: { ...n.data, isVulnerable: true } };
      }
      return n;
    });
  }

  if (isFocusMode.value && selectedNodeName.value) {
    const targetNode = nodes.find(n => n.id.toLowerCase() === selectedNodeName.value.toLowerCase());
    if (targetNode) {
      const relatedIds = new Set<string>();
      relatedIds.add(targetNode.id.toLowerCase());
      
      const targetData = targetNode.data;
      if (targetData.dependencies) {
        targetData.dependencies.forEach((d: string) => relatedIds.add(d.toLowerCase()));
      }
      if (targetData.baseClass) {
        relatedIds.add(targetData.baseClass.toLowerCase());
      }
      
      nodes.forEach(node => {
        const d = node.data;
        if (d.baseClass && d.baseClass.toLowerCase() === selectedNodeName.value.toLowerCase()) {
          relatedIds.add(node.id.toLowerCase());
        }
        if (d.dependencies && d.dependencies.some((dep: string) => dep.toLowerCase() === selectedNodeName.value.toLowerCase())) {
          relatedIds.add(node.id.toLowerCase());
        }
      });

      return nodes.filter(node => relatedIds.has(node.id.toLowerCase()));
    }
  }
  return nodes;
});

const filteredGraphEdges = computed(() => {
  if (isFocusMode.value && selectedNodeName.value) {
    const nodeIds = new Set(filteredGraphNodes.value.map(n => n.id));
    return graphEdges.value.filter(edge => 
      nodeIds.has(edge.source) && nodeIds.has(edge.target)
    );
  }
  return graphEdges.value;
});

// --- Architecture Diagrams Tab ---
const loadingArchitecture = ref(false);
const regeneratingArchitecture = ref(false);
const archDiagramSvg = ref('');
const classDiagramSvg = ref('');

const fetchArchitectureDiagrams = async (force = false) => {
  if (!store.activeConnection) return;
  if (!force && archDiagramSvg.value && classDiagramSvg.value) {
    return;
  }
  loadingArchitecture.value = true;
  archDiagramSvg.value = '';
  classDiagramSvg.value = '';
  try {
    const res = await axios.get(`/api/${store.activeConnection}/architecture-diagrams`);
    if (typeof pendo !== 'undefined') {
      pendo.track('architecture_diagrams_generated', {
        connection_name: store.activeConnection,
        has_arch_diagram: !!res.data?.architecture,
        has_class_diagram: !!res.data?.classInteraction
      });
    }
    await renderDiagrams(res.data);
  } catch (e) {
    console.error('Failed to fetch architecture diagrams:', e);
    ElMessage.error(store.t('Failed to load architecture diagrams.'));
  } finally {
    loadingArchitecture.value = false;
  }
};

const regenerateArchitecture = async () => {
  if (!store.activeConnection) return;
  regeneratingArchitecture.value = true;
  try {
    const res = await axios.post(`/api/${store.activeConnection}/architecture-diagrams/regenerate`);
    await renderDiagrams(res.data);
    ElMessage.success(store.t('Architecture diagrams regenerated successfully!'));
    if (typeof pendo !== 'undefined') {
      pendo.track('architecture_diagrams_regenerated', {
        connection_name: store.activeConnection,
        success: true
      });
    }
  } catch (e) {
    console.error('Failed to regenerate architecture diagrams:', e);
    ElMessage.error(store.t('Failed to regenerate architecture diagrams.'));
  } finally {
    regeneratingArchitecture.value = false;
  }
};

const renderDiagrams = async (data: any) => {
  if (!data) return;
  
  const isDark = document.documentElement.classList.contains('dark');
  try {
    mermaid.initialize({
      startOnLoad: false,
      theme: isDark ? 'dark' : 'default',
      securityLevel: 'loose',
      suppressErrorRendering: true
    });
  } catch (e) {
    console.error('Mermaid initialize error:', e);
  }

  // 1. Architecture diagram
  try {
    if (data.architecture) {
      const { svg } = await mermaid.render('architecture-diagram-svg', data.architecture.trim());
      archDiagramSvg.value = `<div class="rendered-mermaid-svg">${svg}</div>`;
    } else {
      archDiagramSvg.value = '<div class="no-data">No architecture diagram code returned.</div>';
    }
  } catch (err) {
    console.error('Mermaid architecture parsing error:', err);
    archDiagramSvg.value = '<div class="render-error">⚠️ Error rendering high-level architecture diagram.</div>';
  }

  // 2. Class interaction diagram
  try {
    if (data.classInteraction) {
      const { svg } = await mermaid.render('class-interaction-svg', data.classInteraction.trim());
      classDiagramSvg.value = `<div class="rendered-mermaid-svg">${svg}</div>`;
    } else {
      classDiagramSvg.value = '<div class="no-data">No class interaction diagram code returned.</div>';
    }
  } catch (err) {
    console.error('Mermaid class interaction parsing error:', err);
    classDiagramSvg.value = '<div class="render-error">⚠️ Error rendering class interaction diagram.</div>';
  }
};

// --- Documents Tab ---
const loadingDocuments = ref(false);
const documentList = ref<string[]>([]);
const selectedDocument = ref('');
const activeDocument = ref('');
const docContent = ref('');
const loadingDocContent = ref(false);

const docAnalysis = ref<any>(null);
const loadingDocAnalysis = ref(false);

const generatingSkill = ref(false);

const fetchDocuments = async (force = false) => {
  if (!store.activeConnection) return;
  if (!force && documentList.value.length > 0) {
    return;
  }
  loadingDocuments.value = true;
  try {
    const res = await axios.get(`/api/${store.activeConnection}/documents`);
    documentList.value = res.data.documents || [];
  } catch (e) {
    console.error('Failed to fetch documents:', e);
  } finally {
    loadingDocuments.value = false;
  }
};

const selectDocument = async (doc: string) => {
  activeDocument.value = doc;
  selectedDocument.value = doc;
  docContent.value = '';
  docAnalysis.value = null;
  
  loadingDocContent.value = true;
  try {
    const res = await axios.get(`/api/${store.activeConnection}/documents/content`, {
      params: { path: doc }
    });
    docContent.value = res.data.content;
    analyzeDocument(doc, res.data.content);
  } catch (e) {
    console.error('Failed to load document content:', e);
    ElMessage.error(store.t('Failed to load document content.'));
  } finally {
    loadingDocContent.value = false;
  }
};

const analyzeDocument = async (docPath: string, content: string) => {
  loadingDocAnalysis.value = true;
  try {
    const res = await axios.post(`/api/${store.activeConnection}/documents/analyze`, {
      path: docPath,
      content
    });
    docAnalysis.value = res.data;
    if (typeof pendo !== 'undefined') {
      pendo.track('document_analyzed', {
        connection_name: store.activeConnection,
        document_path: docPath
      });
    }
  } catch (e) {
    console.error('Failed to analyze document:', e);
  } finally {
    loadingDocAnalysis.value = false;
  }
};

const generateDocumentSkill = async () => {
  if (!selectedDocument.value || !docContent.value) return;
  generatingSkill.value = true;
  try {
    const res = await axios.post(`/api/${store.activeConnection}/documents/generate-skill`, {
      path: selectedDocument.value,
      content: docContent.value
    });
    if (res.data.success) {
      ElMessage.success(store.t('AI agent playbook created at: {path}').replace('{path}', res.data.filePath));
      if (typeof pendo !== 'undefined') {
        pendo.track('skill_generated', {
          connection_name: store.activeConnection,
          source_document_path: selectedDocument.value,
          generated_skill_path: res.data.filePath
        });
      }
      await fetchDocuments(true);
      await store.fetchSidebar();
      await selectDocument(res.data.filePath);
    }
  } catch (e: any) {
    console.error('Failed to generate skill:', e);
    ElMessage.error(e.response?.data?.error || store.t('Failed to generate agent playbook.'));
  } finally {
    generatingSkill.value = false;
  }
};

const verifyCodebaseWithMCP = async () => {
  if (!selectedDocument.value) return;
  if (typeof pendo !== 'undefined') {
    pendo.track('codebase_verification_initiated', {
      connection_name: store.activeConnection,
      document_path: selectedDocument.value
    });
  }
  store.autoSendNextCommand = true;
  store.chatSidebarOpen = true;
  store.chatInput = `Check my repository to verify if the implementation matches the requirements outlined in the local file ${selectedDocument.value}. Please use your file reading tools to examine the contents of this file first, then identify discrepancies and recommend fixes.`;
};

const handleAskAgent = (doc: string) => {
  if (!doc) return;
  store.autoSendNextCommand = true;
  store.chatSidebarOpen = true;
  store.chatInput = `I have some questions about the document ${doc}.`;
};

const publishSkillToCatalog = () => {
  if (!selectedDocument.value) return;
  const provider = store.devopsInfo?.provider || 'gitlab';
  if (typeof pendo !== 'undefined') {
    pendo.track('skill_published_to_catalog', {
      connection_name: store.activeConnection,
      provider: provider,
      document_path: selectedDocument.value
    });
  }

  store.autoSendNextCommand = true;
  store.chatSidebarOpen = true;
  
  if (provider === 'github') {
    store.chatInput = `Publish the skill file "${selectedDocument.value}" to GitHub Copilot Extensions. Use the 'publish_skill_to_catalog' tool with skillFilePath="${selectedDocument.value}", provider="github", and catalogUrl="https://github.com/settings/copilot". Format it as a Custom Agent system prompt and provide the deep-link to the GitHub Copilot settings page.`;
  } else {
    store.chatInput = `Publish the skill file "${selectedDocument.value}" to the GitLab Duo AI Catalog. Use the 'publish_skill_to_catalog' tool with skillFilePath="${selectedDocument.value}", provider="gitlab", and catalogUrl="https://gitlab.com/-/user_settings/custom_models". Format it as a Custom Agent system prompt and provide the deep-link to the GitLab Duo settings page.`;
  }
};

watch(activeTab, (newTab) => {
  if (newTab === 'architecture') {
    fetchArchitectureDiagrams();
  } else if (newTab === 'documents') {
    fetchDocuments();
  }
});

watch(() => store.activeConnection, (newVal) => {
  if (newVal) {
    clearSelection();
    // Clear connection-specific cache variables
    stats.value = null;
    readmeAnalysis.value = null;
    graphNodes.value = [];
    graphEdges.value = [];
    archDiagramSvg.value = '';
    classDiagramSvg.value = '';
    documentList.value = [];
    selectedDocument.value = '';
    docContent.value = '';
    docAnalysis.value = null;

    fetchStats();
    if (activeTab.value === 'architecture') {
      fetchArchitectureDiagrams(true);
    } else if (activeTab.value === 'documents') {
      fetchDocuments(true);
    }
  }
}, { immediate: true });

onMounted(() => {
  fetchStats();
  if (activeTab.value === 'architecture') {
    fetchArchitectureDiagrams();
  } else if (activeTab.value === 'documents') {
    fetchDocuments();
  }
});
</script>

<style scoped>
.dashboard-view {
  background: var(--bg-primary);
  padding: 2rem;
  box-sizing: border-box;
}

.dashboard-header-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1.5rem;
}

.section-title {
  font-size: 1.75rem;
  font-weight: 700;
  color: var(--text-primary);
  letter-spacing: -0.03em;
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0;
}

.title-icon { color: var(--color-brand); }

.section-desc {
  font-size: 0.875rem;
  color: var(--text-secondary);
  margin-top: 0.25rem;
  margin-bottom: 0;
}

/* Tabs custom styling */
.dashboard-tabs {
  --el-tabs-header-height: 50px;
}

:deep(.el-tabs__item) {
  font-size: 1rem;
  font-weight: 500;
  color: var(--text-secondary);
}

:deep(.el-tabs__item.is-active) {
  color: var(--color-brand);
  font-weight: 600;
}

:deep(.el-tabs__active-bar) {
  background-color: var(--color-brand);
}

.tab-label {
  display: flex;
  align-items: center;
  gap: 6px;
}

.empty-placeholder {
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  padding: 4rem 0;
  color: var(--text-muted);
}
</style>
