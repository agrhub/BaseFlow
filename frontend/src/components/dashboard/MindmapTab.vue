<template>
  <div class="mindmap-tab" @contextmenu="handleContextMenu">
    <div class="mindmap-header" style="display: flex; justify-content: space-between; align-items: center;">
      <div>
        <h3>{{ store.t('Repository Mindmap') }}</h3>
        <p>{{ store.t('Visual representation of the repository folder hierarchy.') }}</p>
      </div>
    </div>

    <el-row :gutter="20" style="margin-top: 15px;">
      <!-- Mindmap wrapper (70% or 100% width) -->
      <el-col :xs="24" :md="selectedNode ? 17 : 24">
        <div class="mindmap-wrapper">
          <Mindmap
            v-if="graphNodes.length > 0"
            :initial-nodes="graphNodes"
            :initial-edges="graphEdges"
            :highlight-class="selectedNodeName"
            :is-focus-mode="isFocusMode"
            @update:is-focus-mode="(val) => emit('update:isFocusMode', val)"
            mode="class"
            @select-class="onMindmapNodeClick"
            class="theme-dark-mindmap"
          />
          <div v-else class="empty-mindmap">
            <el-icon class="loading-icon"><Loading /></el-icon>
            <p>{{ store.t('Loading mindmap diagram...') }}</p>
          </div>
        </div>
      </el-col>

      <!-- Detailed Inspector Pane (30% width) -->
      <el-col :xs="24" :md="7" v-if="selectedNode">
        <el-card class="inspector-card glass-panel" style="height: 600px; overflow-y: auto;">
          <template #header>
            <div class="inspector-header">
              <!-- <span>{{ store.t('Component Inspector') }}</span> -->
              <span>{{ selectedNode.name }}</span>
              <el-button type="danger" size="small" text bg circle icon="Close" @click="clearSelection"></el-button>
            </div>
          </template>

          <div class="inspector-content">
            <!-- <h4 class="inspector-title">💠 {{ selectedNode.name }}</h4> -->
            <div class="inspector-meta">
              <div><strong>{{ store.t('File') }}:</strong> <span class="mono">{{ selectedNode.filePath }}</span></div>
              <div v-if="selectedNode.baseClass">
                <strong>{{ store.t('Base Class') }}:</strong> 
                <span class="interactive-link" @click="onClassLinkClick(selectedNode.baseClass)">
                  {{ selectedNode.baseClass }}
                </span>
              </div>
              <div v-if="selectedNode.implementsList && selectedNode.implementsList.length > 0">
                <strong>{{ store.t('Implements') }}:</strong> 
                <span v-for="(impl, idx) in selectedNode.implementsList" :key="impl">
                  <span class="interactive-link" @click="onClassLinkClick(impl)">{{ impl }}</span>
                  <span v-if="Number(idx) < selectedNode.implementsList.length - 1">, </span>
                </span>
              </div>
            </div>

            <!-- Properties -->
            <div class="inspector-section" v-if="selectedNode.properties && selectedNode.properties.length > 0">
              <div class="section-subtitle">{{ store.t('Properties') }}</div>
              <ul class="meta-list">
                <li 
                  v-for="prop in selectedNode.properties" 
                  :key="prop.name" 
                  class="mono property-item interactive-item"
                  :class="{ 'highlighted-entity': store.selectedMethod === prop.name }"
                  @click="selectEntity(prop.name)"
                >
                  ⚙️ {{ prop.name }}{{ prop.type ? `: ${prop.type}` : '' }}
                </li>
              </ul>
            </div>

            <!-- Methods -->
            <div class="inspector-section" v-if="selectedNode.methods && selectedNode.methods.length > 0">
              <div class="section-subtitle">{{ store.t('Methods') }}</div>
              <ul class="meta-list">
                <li 
                  v-for="meth in selectedNode.methods" 
                  :key="meth.name" 
                  class="mono method-item interactive-item"
                  :class="{ 'highlighted-entity': store.selectedMethod === meth.name }"
                  @click="selectEntity(meth.name)"
                >
                  ⚡ {{ meth.name }}()
                </li>
              </ul>
            </div>

            <!-- AI Class Analysis Section -->
            <div class="inspector-section ai-analysis-section">
              <div class="section-subtitle">{{ store.t('🤖 AI Structural Analysis') }}</div>
              <div v-if="loadingAnalysis" class="analysis-loading">
                <el-icon class="loading-icon"><Loading /></el-icon>
                <p>{{ store.t('Running Gemini analysis...') }}</p>
              </div>
              <div 
                v-else 
                class="analysis-text" 
                v-html="renderMarkdown(classAnalysisText || store.t('No structural analysis computed.'))"
                @click="handleAnalysisClick"
              >
              </div>
            </div>
          </div>
        </el-card>
      </el-col>
    </el-row>

    <!-- Custom HTML Context Menu -->
    <div 
      v-if="contextMenuVisible" 
      class="custom-context-menu" 
      :style="{ top: `${contextMenuY}px`, left: `${contextMenuX}px` }"
    >
      <div class="menu-header">{{ contextMenuNode?.name || store.t('Class / File') }}</div>
      <div class="menu-item" @click="triggerAgentAction('Optimize code structure')">
        💡 {{ store.t('Optimize code structure') }}
      </div>
      <div class="menu-item" @click="triggerAgentAction('Write unit tests')">
        🧪 {{ store.t('Write unit tests') }}
      </div>
      <div class="menu-item" @click="triggerAgentAction('Explain roles and dependencies')">
        🔍 {{ store.t('Explain roles & dependencies') }}
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import { store } from '../../stores';
import { Loading } from '@element-plus/icons-vue';
import Mindmap from './Mindmap.vue';
import MarkdownIt from 'markdown-it';

const md = new MarkdownIt({ html: true, linkify: true });

const props = defineProps<{
  graphNodes: any[];
  graphEdges: any[];
  selectedNode: any;
  selectedNodeName: string;
  classAnalysisText: string;
  loadingAnalysis: boolean;
  isFocusMode: boolean;
}>();

const emit = defineEmits<{
  (e: 'update:isFocusMode', val: boolean): void;
  (e: 'select-node', nodeData: any): void;
  (e: 'clear-selection'): void;
}>();

const contextMenuVisible = ref(false);
const contextMenuX = ref(0);
const contextMenuY = ref(0);
const contextMenuNode = ref<any>(null);

const makeCodeMentionsInteractive = (htmlString: string): string => {
  if (!htmlString) return '';
  
  const parser = new DOMParser();
  const doc = parser.parseFromString(`<div>${htmlString}</div>`, 'text/html');
  const root = doc.body.firstChild as HTMLElement;
  if (!root) return htmlString;

  const classNames = props.graphNodes.map(n => n.data?.name || n.name).filter(Boolean);
  const selectedProps = props.selectedNode?.properties?.map((p: any) => p.name) || [];
  const selectedMeths = props.selectedNode?.methods?.map((m: any) => m.name) || [];

  classNames.sort((a: string, b: string) => b.length - a.length);
  selectedProps.sort((a: string, b: string) => b.length - a.length);
  selectedMeths.sort((a: string, b: string) => b.length - a.length);

  const parts: string[] = [];
  const classMap = new Map<string, string>();
  const entityMap = new Map<string, string>();

  const escapeRegExp = (str: string) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  classNames.forEach((name: string) => {
    parts.push(escapeRegExp(name));
    classMap.set(name.toLowerCase(), name);
  });

  selectedMeths.forEach((name: string) => {
    parts.push(escapeRegExp(name) + '(?:\\(\\))?');
    entityMap.set(name.toLowerCase(), name);
  });

  selectedProps.forEach((name: string) => {
    parts.push(escapeRegExp(name));
    entityMap.set(name.toLowerCase(), name);
  });

  if (parts.length === 0) return htmlString;

  const regex = new RegExp(`\\b(${parts.join('|')})\\b`, 'g');

  const traverse = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent || '';
      if (!text.trim()) return;

      regex.lastIndex = 0;
      let lastIndex = 0;
      let match;
      const fragments: Node[] = [];

      while ((match = regex.exec(text)) !== null) {
        const matchedText = match[0];
        const matchedWord = match[1];
        const index = match.index;

        if (index > lastIndex) {
          fragments.push(doc.createTextNode(text.substring(lastIndex, index)));
        }

        const cleanWord = matchedWord.replace(/\(\)/, '');
        const lowerWord = cleanWord.toLowerCase();
        
        let el: HTMLElement;
        if (classMap.has(lowerWord)) {
          const originalClassName = classMap.get(lowerWord)!;
          el = doc.createElement('span');
          el.className = 'interactive-link class-mention';
          el.textContent = matchedText;
          el.setAttribute('data-class', originalClassName);
        } else if (entityMap.has(lowerWord)) {
          const originalEntityName = entityMap.get(lowerWord)!;
          el = doc.createElement('span');
          el.className = 'interactive-link entity-mention';
          el.textContent = matchedText;
          el.setAttribute('data-entity', originalEntityName);
        } else {
          el = doc.createElement('span');
          el.textContent = matchedText;
        }

        fragments.push(el);
        lastIndex = regex.lastIndex;
      }

      if (lastIndex < text.length) {
        fragments.push(doc.createTextNode(text.substring(lastIndex)));
      }

      if (fragments.length > 0) {
        const parent = node.parentNode;
        if (parent) {
          fragments.forEach(frag => parent.insertBefore(frag, node));
          parent.removeChild(node);
        }
      }
    } else {
      if (node.nodeName === 'A') return;
      const children = Array.from(node.childNodes);
      children.forEach(child => traverse(child));
    }
  };

  traverse(root);
  return root.innerHTML;
};

const renderMarkdown = (text: string) => {
  if (!text) return '';
  const html = md.render(text);
  return makeCodeMentionsInteractive(html);
};

const handleAnalysisClick = (event: MouseEvent) => {
  const target = event.target as HTMLElement;
  const className = target.getAttribute('data-class');
  const entityName = target.getAttribute('data-entity');
  
  if (className) {
    emit('select-node', className);
  } else if (entityName) {
    selectEntity(entityName);
  }
};

const selectEntity = (name: string) => {
  if (store.selectedMethod === name) {
    store.setSelectedMethod('');
  } else {
    store.setSelectedMethod(name);
  }
};

const onClassLinkClick = (className: string) => {
  emit('select-node', className);
};

const clearSelection = () => {
  emit('clear-selection');
};

const onMindmapNodeClick = (nodeData: any) => {
  emit('select-node', nodeData);
};

const handleContextMenu = (event: MouseEvent) => {
  const target = event.target as SVGElement;
  const nodeElement = target.closest('.node');
  if (nodeElement) {
    event.preventDefault();
    const textEl = nodeElement.querySelector('text');
    const nodeName = textEl ? textEl.textContent : '';
    if (nodeName) {
      const graphNode = props.graphNodes.find(n => n.data?.name === nodeName || n.data?.filePath?.endsWith(nodeName));
      if (graphNode) {
        contextMenuNode.value = graphNode.data;
        contextMenuX.value = event.clientX;
        contextMenuY.value = event.clientY;
        contextMenuVisible.value = true;
        return;
      }
    }
  }
  contextMenuVisible.value = false;
};

const triggerAgentAction = (action: string) => {
  if (!contextMenuNode.value) return;
  store.chatInput = `${action} for class/file: ${contextMenuNode.value.name}`;
  store.autoSendNextCommand = true;
  store.chatSidebarOpen = true;
  contextMenuVisible.value = false;
};

const hideContextMenu = () => {
  contextMenuVisible.value = false;
};

onMounted(() => {
  window.addEventListener('click', hideContextMenu);
});

onUnmounted(() => {
  window.removeEventListener('click', hideContextMenu);
});
</script>

<style scoped>
.mindmap-container {
  background: var(--bg-surface);
  border: 1px solid var(--border-color);
  border-radius: 20px;
  padding: 5px;
  min-height: 650px;
  position: relative;
}

.mindmap-header h3 {
  margin: 0;
  font-size: 1.25rem;
  color: var(--text-primary);
}

.mindmap-header p {
  margin: 4px 0 0 0;
  font-size: 0.875rem;
  color: var(--text-muted);
}

.mindmap-wrapper {
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: 20px;
  height: 600px;
  position: relative;
  overflow: hidden;
}

.empty-mindmap {
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  height: 100%;
  color: var(--text-muted);
}

.loading-icon {
  font-size: 2rem;
  margin-bottom: 0.5rem;
  animation: rotating 2s linear infinite;
}

.inspector-card {
  border-left: 1px solid var(--border-color);
  height: 100%;
  display: flex;
  flex-direction: column;
}

.inspector-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-weight: 600;
  color: var(--text-primary);
}

.inspector-title {
  margin: 0 0 1rem 0;
  font-size: 1.1rem;
  color: var(--text-primary);
  word-break: break-all;
}

.inspector-meta {
  display: flex;
  flex-direction: column;
  gap: 8px;
  font-size: 0.875rem;
  color: var(--text-secondary);
  margin-bottom: 1.5rem;
}

.inspector-meta > div {
  display: block;
  word-wrap: break-word;
}

.inspector-section {
  margin-bottom: 1.5rem;
}

.section-subtitle {
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
  color: var(--text-muted);
  letter-spacing: 0.05em;
  margin-bottom: 0.5rem;
  border-bottom: 1px solid var(--border-color);
  padding-bottom: 4px;
}

.meta-list {
  list-style: none;
  padding: 0;
  margin: 0;
}

.property-item,
.method-item {
  font-size: 0.825rem;
  padding: 4px 8px;
  color: var(--text-secondary);
  word-break: break-all;
}

.interactive-link {
  color: var(--color-brand, #7C3AED);
  cursor: pointer;
  font-weight: 500;
  transition: all 0.2s ease;
}

.interactive-link:hover {
  text-decoration: underline;
  color: var(--color-brand-hover, #6D28D9);
}

.interactive-item {
  cursor: pointer;
  transition: all 0.2s ease;
  border-radius: 6px;
  margin: 2px 0;
}

.interactive-item:hover {
  background: var(--bg-secondary);
  color: var(--color-brand);
}

.highlighted-entity {
  background-color: var(--color-brand-light, rgba(124, 58, 237, 0.15)) !important;
  color: var(--color-brand, #7C3AED) !important;
  font-weight: 600;
  border-radius: 6px;
}

.ai-analysis-section {
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: 6px;
  padding: 1rem;
}

.analysis-loading {
  display: flex;
  flex-direction: column;
  align-items: center;
  color: var(--text-muted);
  padding: 1rem 0;
}

.analysis-text {
  font-size: 0.875rem;
  color: var(--text-secondary);
  line-height: 1.6;
  overflow-y: scroll;
}

.analysis-text :deep(.interactive-link) {
  color: var(--color-brand, #7C3AED);
  cursor: pointer;
  font-weight: 500;
  transition: all 0.2s ease;
}

.analysis-text :deep(.interactive-link:hover) {
  text-decoration: underline;
  color: var(--color-brand-hover, #6D28D9);
}

/* Custom Context Menu */
.custom-context-menu {
  position: fixed;
  background: var(--bg-surface);
  border: 1px solid var(--border-color);
  box-shadow: var(--shadow-lg);
  border-radius: 8px;
  z-index: 1000;
  padding: 8px 0;
  min-width: 200px;
}

.menu-header {
  padding: 6px 16px;
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--text-muted);
  text-transform: uppercase;
  border-bottom: 1px solid var(--border-color);
  margin-bottom: 4px;
}

.menu-item {
  padding: 8px 16px;
  font-size: 0.875rem;
  color: var(--text-primary);
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 8px;
}

.menu-item:hover {
  background: var(--bg-secondary);
  color: var(--color-brand);
}

@keyframes rotating {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
</style>
