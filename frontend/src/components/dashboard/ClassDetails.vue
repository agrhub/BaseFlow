<template>
  <div class="details-panel glass-panel" v-if="classData">
    <div class="panel-header">
      <div class="class-title-section">
        <span class="class-badge">{{ store.t('Class') }}</span>
        <h2 class="class-title">{{ classData.name }}</h2>
      </div>
      <div class="class-meta">
        <el-icon size="12"><Document /></el-icon>
        <span class="file-path">{{ classData.filePath }}</span>
      </div>
    </div>

    <div class="panel-body">
      <!-- Inheritance -->
      <div class="section-card" v-if="classData.baseClass || classData.implementsList?.length">
        <div class="card-title">{{ store.t('Inheritance & Interfaces') }}</div>
        <div class="hierarchy-tags">
          <el-tag 
            v-if="classData.baseClass" 
            :type="isKnownClass(classData.baseClass) ? 'warning' : 'info'" 
            :effect="isKnownClass(classData.baseClass) ? 'dark' : 'plain'" 
            :class="['htag', { 'clickable-tag': isKnownClass(classData.baseClass) }]"
            @click="isKnownClass(classData.baseClass) && navigateToClass(classData.baseClass)"
          >
            extends {{ classData.baseClass }}
          </el-tag>
          <el-tag
            v-for="impl in classData.implementsList"
            :key="impl"
            :type="isKnownClass(impl) ? 'success' : 'info'" 
            :effect="isKnownClass(impl) ? 'dark' : 'plain'" 
            :class="['htag', { 'clickable-tag': isKnownClass(impl) }]"
            @click="isKnownClass(impl) && navigateToClass(impl)"
          >
            implements {{ impl }}
          </el-tag>
        </div>
      </div>

      <!-- Imports -->
      <div class="section-card" v-if="classData.dependencies?.length">
        <div class="card-title">{{ store.t('Imports') }}</div>
        <div class="hierarchy-tags">
          <el-tag 
            v-for="dep in classData.dependencies" 
            :key="dep" 
            :type="isKnownClass(dep) ? 'primary' : 'info'" 
            :effect="isKnownClass(dep) ? 'dark' : 'plain'" 
            :class="['htag', { 'clickable-tag': isKnownClass(dep) }]"
            @click="isKnownClass(dep) && navigateToClass(dep)"
          >
            {{ dep }}
          </el-tag>
        </div>
      </div>

      <!-- Properties -->
      <div class="section-card">
        <div class="card-title">{{ store.t('Properties') }} ({{ classData.properties?.length || 0 }})</div>
        <div class="list-container" v-if="classData.properties?.length">
          <div v-for="prop in classData.properties" :key="prop.name" class="member-item" @click="scrollToMember(prop.name, false)">
            <span :class="['vis-indicator', `vis-${prop.visibility}`]">
              {{ getVisibilityChar(prop.visibility) }}
            </span>
            <span class="member-name">{{ prop.name }}</span>
            <span class="member-divider">:</span>
            <span 
              :class="['member-type', { 'clickable-type': isKnownClass(prop.type) }]"
              @click.stop="isKnownClass(prop.type) && navigateToClass(prop.type)"
            >
              {{ prop.type }}
            </span>
          </div>
        </div>
        <div v-else class="empty-member">{{ store.t('No properties declared.') }}</div>
      </div>

      <!-- Methods -->
      <div class="section-card">
        <div class="card-title">{{ store.t('Methods') }} ({{ classData.methods?.length || 0 }})</div>
        <div class="list-container" v-if="classData.methods?.length">
          <div v-for="meth in classData.methods" :key="meth.name" class="member-item method-item" @click="scrollToMember(meth.name, true)">
            <div class="method-header">
              <span :class="['vis-indicator', `vis-${meth.visibility}`]">
                {{ getVisibilityChar(meth.visibility) }}
              </span>
              <span class="member-name font-bold">{{ meth.name }}</span>
              <span class="params-paren">(</span>
              <span v-for="(p, i) in meth.parameters" :key="p.name" class="param-spec">
                <span class="param-name">{{ p.name }}</span>: 
                <span 
                  :class="['param-type', { 'clickable-type': isKnownClass(p.type) }]"
                  @click.stop="isKnownClass(p.type) && navigateToClass(p.type)"
                >
                  {{ p.type }}
                </span>
                <span v-if="i < meth.parameters.length - 1">, </span>
              </span>
              <span class="params-paren">)</span>
              <span class="member-divider">:</span>
              <span 
                :class="['member-type', { 'clickable-type': isKnownClass(meth.returnType) }]"
                @click.stop="isKnownClass(meth.returnType) && navigateToClass(meth.returnType)"
              >
                {{ meth.returnType }}
              </span>
            </div>
          </div>
        </div>
        <div v-else class="empty-member">{{ store.t('No methods declared.') }}</div>
      </div>

      <!-- Code Snippet -->
      <div class="section-card code-card">
        <CodeViewer 
          :source-code="sourceCode" 
          :active-line="activeLine" 
          :is-binary="isSourceBinary" 
          :file-path="classData?.filePath" 
          :mime-type="sourceMimeType" 
          id-prefix="detail-line-" 
          max-height="250px" 
        />
      </div>
    </div>
  </div>
  <div v-else class="no-selection glass-panel">
    <el-icon size="40" class="no-selection-icon"><Pointer /></el-icon>
    <p>{{ store.t('Select a class on the mindmap to view its structure, properties, methods and source code.') }}</p>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';
import { Document, Pointer } from '@element-plus/icons-vue';
import { ElMessage } from 'element-plus';
import { store } from '../../stores';
import axios from 'axios';
import CodeViewer from '../class-inspector/CodeViewer.vue';

const props = defineProps<{
  classData?: {
    name: string;
    filePath: string;
    baseClass?: string;
    implementsList: string[];
    properties: { name: string; type: string; visibility: string }[];
    methods: { name: string; parameters: { name: string; type: string }[]; returnType: string; visibility: string }[];
    dependencies?: string[];
  } | null;
}>();

const sourceCode = ref('');
const activeLine = ref<number | null>(null);
const isSourceBinary = ref(false);
const sourceMimeType = ref('');

const isKnownClass = (typeName: string | undefined): boolean => {
  if (!typeName || !store.classesData) return false;
  const cleanType = typeName.replace(/<.*>/, '').replace(/\[\]/, '').trim();
  return store.classesData.some(n => n.id.toLowerCase() === cleanType.toLowerCase() || (n.data?.name && n.data.name.toLowerCase() === cleanType.toLowerCase()));
};

const navigateToClass = (className: string | undefined) => {
  if (!className || !store.classesData) return;
  const cleanClassName = className.replace(/<.*>/, '').replace(/\[\]/, '').trim();
  const target = store.classesData.find(n => n.id.toLowerCase() === cleanClassName.toLowerCase() || (n.data?.name && n.data.name.toLowerCase() === cleanClassName.toLowerCase()));
  if (target) {
    store.activeItem = target.data?.name || target.id;
    if (target.data?.filePath) {
      const parts = target.data.filePath.split('/');
      parts.pop();
      store.activeFolder = parts.join('/');
    }
  } else {
    ElMessage.warning(store.t('Class "{name}" not found in current scanned workspace.').replace('{name}', className));
  }
};

const scrollToMember = (name: string, isMethod: boolean) => {
  if (!sourceCode.value) return;
  const lines = sourceCode.value.split(/\r?\n/);
  let targetLineIdx = -1;
  
  if (isMethod) {
    const methodPatterns = [
      new RegExp(`\\b${name}\\s*\\(`),
      new RegExp(`def\\s+${name}\\b`),
      new RegExp(`fn\\s+${name}\\b`),
      new RegExp(`function\\s+${name}\\b`)
    ];
    for (let i = 0; i < lines.length; i++) {
      if (methodPatterns.some(pat => pat.test(lines[i]))) {
        targetLineIdx = i;
        break;
      }
    }
  } else {
    const propPatterns = [
      new RegExp(`\\b${name}\\s*:`),
      new RegExp(`\\b${name}\\s*=`),
      new RegExp(`\\b(public|private|protected|readonly)?\\s+${name}\\b`)
    ];
    for (let i = 0; i < lines.length; i++) {
      if (propPatterns.some(pat => pat.test(lines[i]))) {
        targetLineIdx = i;
        break;
      }
    }
    if (targetLineIdx === -1) {
      for (let i = 0; i < lines.length; i++) {
        if (new RegExp(`\\b${name}\\b`).test(lines[i])) {
          targetLineIdx = i;
          break;
        }
      }
    }
  }

  if (targetLineIdx !== -1) {
    activeLine.value = targetLineIdx + 1;
  }
};

const fetchSourceCode = async (filePath: string) => {
  if (!filePath || !store.activeConnection) return;
  sourceCode.value = '';
  isSourceBinary.value = false;
  sourceMimeType.value = '';
  activeLine.value = null;
  try {
    const res = await axios.get(`/api/${store.activeConnection}/file-content`, {
      params: { path: filePath }
    });
    isSourceBinary.value = !!res.data.isBinary;
    sourceMimeType.value = res.data.mimeType || '';
    sourceCode.value = res.data.content || '';
  } catch (e) {
    sourceCode.value = `// Could not load: ${filePath}`;
  }
};

watch(() => props.classData?.filePath, (newPath) => {
  if (newPath) fetchSourceCode(newPath);
}, { immediate: true });

const getVisibilityChar = (vis: string) => {
  switch (vis) {
    case 'public': return '+';
    case 'private': return '-';
    case 'protected': return '#';
    default: return '+';
  }
};
</script>

<style scoped>
.details-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--bg-glass);
  border-radius: 12px;
  overflow: hidden;
}

.no-selection {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  padding: 30px;
  text-align: center;
  color: var(--text-secondary);
  border-radius: 12px;
  background: var(--bg-glass);
}

.no-selection-icon {
  color: var(--text-muted);
  margin-bottom: 16px;
}

.panel-header {
  padding: 16px;
  background: rgba(255, 255, 255, 0.02);
  border-bottom: 1px solid var(--border-color);
}

.class-title-section {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
}

.class-badge {
  background: linear-gradient(135deg, var(--color-primary), #00b4d8);
  font-size: 0.65rem;
  font-weight: 700;
  text-transform: uppercase;
  color: #000;
  padding: 2px 6px;
  border-radius: 4px;
}

.class-title {
  font-size: 1.25rem;
  font-weight: 700;
  margin: 0;
  color: var(--text-primary);
}

.class-meta {
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--text-muted);
  font-size: 0.72rem;
}

.file-path {
  font-family: var(--font-mono);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.panel-body {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.section-card {
  background: rgba(255, 255, 255, 0.015);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  padding: 12px;
}

.card-title {
  font-size: 0.78rem;
  text-transform: uppercase;
  color: var(--text-secondary);
  font-weight: 600;
  letter-spacing: 0.03em;
  margin-bottom: 10px;
  border-left: 2px solid var(--color-primary);
  padding-left: 8px;
}

.hierarchy-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.htag {
  font-family: var(--font-mono);
  font-size: 0.72rem;
  border: none;
}

.list-container {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.member-item {
  display: flex;
  align-items: center;
  font-family: var(--font-mono);
  font-size: 0.78rem;
  padding: 4px 6px;
  background: var(--bg-secondary);
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.2s ease;
  border: 1px solid transparent;
}

.member-item:hover {
  background: rgba(255, 255, 255, 0.05) !important;
  border-color: var(--color-primary);
  transform: translateX(4px);
}

.vis-indicator {
  font-weight: 800;
  width: 14px;
  display: inline-block;
  text-align: center;
  margin-right: 6px;
}

.vis-public { color: var(--color-success); }
.vis-private { color: var(--color-danger); }
.vis-protected { color: var(--color-warning); }

.member-name {
  color: var(--text-primary);
}

.member-divider {
  margin: 0 4px;
  color: var(--text-muted);
}

.member-type {
  color: #00b4d8;
}

.param-name {
  color: #fca311;
}

.param-type {
  color: #9d4edd;
}

.params-paren {
  color: var(--text-secondary);
}

.code-card {
  padding: 0;
  border-radius: 8px;
  overflow: hidden;
}

.empty-member {
  font-size: 0.75rem;
  color: var(--text-muted);
  font-style: italic;
  padding: 4px;
}

.clickable-type {
  cursor: pointer;
  text-decoration: underline;
  text-decoration-style: dotted;
  transition: color 0.2s ease;
}
.clickable-type:hover {
  color: #48cae4 !important;
}

.clickable-tag {
  cursor: pointer;
  transition: transform 0.2s ease, filter 0.2s ease;
}
.clickable-tag:hover {
  transform: translateY(-2px);
  filter: brightness(1.15);
}
</style>
