<template>
  <div class="class-inspector-page page-body" v-loading="loading">
    <ClassHeader 
      v-if="classData" 
      :class-data="classData" 
      :is-binary="isSourceBinary"
      @back="goBack" 
      @trigger-ai="triggerAi" 
    />

    <!-- Layout Panels -->
    <el-row :gutter="24" class="inspector-body" v-if="classData">
      <!-- Member attributes and methods panel -->
      <el-col :xs="24" :lg="10" class="panel-col" v-if="!classData.isModule">
        <ClassMembers 
          :class-data="classData" 
          @scroll-to-member="scrollToMember" 
          @navigate-to-class="navigateToClass" 
        />
      </el-col>

      <!-- Source Code view panel -->
      <el-col :xs="24" :lg="classData.isModule ? 24 : 14" class="panel-col">
        <div class="code-details-panel glass-panel">
          <CodeViewer 
            :source-code="sourceCode" 
            :active-line="activeLine" 
            :loading="sourceLoading" 
            :is-binary="isSourceBinary" 
            :file-path="classData?.filePath" 
            :mime-type="sourceMimeType" 
            id-prefix="line-" 
            max-height="600px" 
          />
        </div>
      </el-col>
    </el-row>
  </div>
</template>

<script setup>
import { ref, watch, markRaw } from 'vue';
import { useRouter } from 'vue-router';
import { store } from '../stores';
import { ElMessage } from 'element-plus';
import axios from 'axios';

// Import refactored components
import ClassHeader from '../components/class-inspector/ClassHeader.vue';
import ClassMembers from '../components/class-inspector/ClassMembers.vue';
import CodeViewer from '../components/class-inspector/CodeViewer.vue';

const router = useRouter();
const loading = ref(false);
const sourceCode = ref('');
const sourceLoading = ref(false);
const isSourceBinary = ref(false);
const sourceMimeType = ref('');
const classData = ref(null);
const activeLine = ref(null);

const scrollToMember = (name, isMethod) => {
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

const fetchSourceCode = async (filePath) => {
  if (!filePath || !store.activeConnection) return;
  sourceLoading.value = true;
  sourceCode.value = '';
  isSourceBinary.value = false;
  sourceMimeType.value = '';
  activeLine.value = null;
  try {
    const res = await axios.get(`/api/${store.activeConnection}/file-content`, {
      params: { path: filePath, className: classData.value?.name }
    });
    isSourceBinary.value = !!res.data.isBinary;
    sourceMimeType.value = res.data.mimeType || '';
    sourceCode.value = res.data.content || '';

    if (res.data.parsedClass && classData.value) {
      let targetClass = res.data.parsedClass;
      if (res.data.parsedClasses && res.data.parsedClasses.length > 0) {
        const found = res.data.parsedClasses.find(c => c.name.toLowerCase() === store.activeItem.toLowerCase());
        if (found) {
          targetClass = found;
        }
      }

      classData.value.name = targetClass.name || classData.value.name;
      classData.value.baseClass = targetClass.baseClass || '';
      classData.value.implementsList = targetClass.implementsList || [];
      classData.value.properties = targetClass.properties || [];
      classData.value.methods = targetClass.methods || [];
      classData.value.dependencies = targetClass.dependencies || [];
      if (targetClass.isModule !== undefined) {
        classData.value.isModule = targetClass.isModule;
      }
    }
  } catch (e) {
    sourceCode.value = `// Could not load source file: ${filePath}`;
  } finally {
    sourceLoading.value = false;
  }
};

const fetchClassDetails = async () => {
  if (!store.activeConnection || !store.activeFolder || !store.activeItem) return;
  loading.value = true;
  try {
    let classes = store.classesData || [];
    if (classes.length === 0) {
      const res = await axios.get(`/api/${store.activeConnection}/graph`);
      classes = res.data.nodes || [];
      store.classesData = markRaw(classes);
    }
    const matchedNode = classes.find(n => n.id.toLowerCase() === store.activeItem.toLowerCase() || (n.data?.name && n.data.name.toLowerCase() === store.activeItem.toLowerCase()));
    
    if (matchedNode) {
      classData.value = {
        name: matchedNode.data.name,
        filePath: matchedNode.data.filePath,
        baseClass: matchedNode.data.baseClass,
        implementsList: matchedNode.data.implementsList,
        properties: matchedNode.data.properties,
        methods: matchedNode.data.methods,
        isModule: matchedNode.data.isModule,
        dependencies: matchedNode.data.dependencies || []
      };
      await fetchSourceCode(matchedNode.data.filePath);
    } else {
      // Fallback: If not in class graph index (e.g. it's a new or non-class file), construct direct file metadata
      const fallbackFilePath = store.activeFolder === 'root' ? store.activeItem : `${store.activeFolder}/${store.activeItem}`;
      classData.value = {
        name: store.activeItem,
        filePath: fallbackFilePath,
        baseClass: '',
        implementsList: [],
        properties: [],
        methods: [],
        isModule: true, // Show code full width
        dependencies: []
      };
      await fetchSourceCode(fallbackFilePath);
    }
  } catch (e) {
    console.error('Failed to load details:', e);
    ElMessage.error(store.t('Error loading class details.'));
  } finally {
    loading.value = false;
  }
};

const navigateToClass = (className) => {
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

const triggerAi = (command) => {
  if (!classData.value) return;
  const fullCommand = `${command} (${classData.value.name})`;
  store.chatInput = fullCommand;
  store.autoSendNextCommand = true;
  store.chatSidebarOpen = true;
};

const goBack = () => {
  router.back();
};

watch(() => store.activeItem, (newVal) => {
  if (newVal) fetchClassDetails();
}, { immediate: true });
</script>

<style scoped>
.class-inspector-page {
  background: var(--bg-primary);
  padding: 2rem;
  box-sizing: border-box;
}

.inspector-body {
  margin-top: 1rem;
}

.panel-col {
  margin-bottom: 1.5rem;
}

.code-details-panel {
  border-radius: 12px;
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  height: 100%;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  padding: 0;
  overflow: hidden;
}
</style>
