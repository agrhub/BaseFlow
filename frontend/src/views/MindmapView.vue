<template>
  <div class="mindmap-view-page" v-loading="loading">
    <div class="view-header" v-if="nodes.length > 0">
      <div>
        <h2 class="view-title">{{ store.t('Structure Diagram') }} (Mindmap Explorer) - Folder: {{ store.activeFolder || store.activeConnection || store.t('Root') }}</h2>
        <p class="view-desc">{{ store.t('Displays files, classes, and inheritance/dependency links within the directory.') }}</p>
      </div>
    </div>

    <!-- Viewport layer (outer dot-grid) -->
    <div class="mindmap-viewport">
      <!-- Mindmap container (inner white card) -->
      <div v-if="filteredNodes.length > 0" class="mindmap-container-card">
        <Mindmap
          :initial-nodes="filteredNodes"
          :initial-edges="filteredEdges"
          :highlight-class="store.activeItem"
          mode="directory"
          @select-class="onClassSelect"
        />
      </div>
      <div v-else-if="nodes.length > 0" class="canvas-empty">
        <el-icon size="40" class="empty-icon"><InfoFilled /></el-icon>
        <h3>{{ store.t('Empty Folder') }}</h3>
        <p>{{ store.t('No classes or files are declared directly in folder {folder}.').replace('{folder}', store.activeFolder) }}</p>
      </div>
      <div v-else class="canvas-empty">
        <el-icon size="40" class="empty-icon"><Loading /></el-icon>
        <h3>{{ store.t('Synchronizing diagram...') }}</h3>
        <p>{{ store.t('The system is loading classes data in the repository.') }}</p>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, computed, watch } from 'vue';
import { useRouter } from 'vue-router';
import { store } from '../stores';
import { InfoFilled, Loading } from '@element-plus/icons-vue';
import Mindmap from '../components/dashboard/Mindmap.vue';
import axios from 'axios';
import { ElMessage } from 'element-plus';
import path from 'path-browserify'; // simple path-dirname alternative

// Fallback path.dirname for browser
const getDirName = (filePath) => {
  if (!filePath) return '';
  const parts = filePath.split('/');
  if (parts.length <= 1) return 'root';
  return parts.slice(0, -1).join('/');
};

const loading = ref(false);
const nodes = ref([]);
const edges = ref([]);

const fetchGraph = async () => {
  if (!store.activeConnection) return;
  loading.value = true;
  try {
    const res = await axios.get(`/api/${store.activeConnection}/graph`);
    nodes.value = res.data.nodes || [];
    edges.value = res.data.edges || [];
  } catch (e) {
    console.error('Failed to load mindmap graph:', e);
    ElMessage.error(store.t('Error loading mindmap graph data.'));
  } finally {
    loading.value = false;
  }
};

// Filter nodes to build directory explorer tree for active folder
const filteredNodes = computed(() => {
  if (nodes.value.length === 0) return [];

  const currentFolder = store.activeFolder === 'root' ? '' : store.activeFolder; // normalize root to empty
  const directChildren = new Map();

  nodes.value.forEach(node => {
    const filePath = (node.data?.filePath || '').replace(/\\/g, '/');
    if (!filePath) return;

    let relativePath = filePath;
    if (currentFolder) {
      if (filePath === currentFolder) return;
      if (filePath.startsWith(currentFolder + '/')) {
        relativePath = filePath.substring(currentFolder.length + 1);
      } else {
        return; // not inside currentFolder
      }
    }

    const parts = relativePath.split('/');
    const childName = parts[0];
    const fullChildPath = currentFolder ? `${currentFolder}/${childName}` : childName;

    if (parts.length === 1) {
      // It is a file directly in currentFolder
      directChildren.set(fullChildPath, {
        name: childName,
        filePath: filePath,
        fullPath: filePath,
        isLeaf: true,
        classData: node.data,
        children: []
      });
    } else {
      // It is a subdirectory in currentFolder
      if (!directChildren.has(fullChildPath)) {
        directChildren.set(fullChildPath, {
          name: childName,
          filePath: fullChildPath,
          fullPath: fullChildPath,
          isLeaf: false,
          children: []
        });
      }
    }
  });

  const rootDirNode = {
    name: currentFolder ? currentFolder.split('/').pop() : store.activeConnection,
    filePath: currentFolder || 'root',
    fullPath: currentFolder,
    isLeaf: false,
    children: Array.from(directChildren.values())
  };

  return [rootDirNode];
});

// Filter edges (not needed in directory explorer mode)
const filteredEdges = computed(() => {
  return [];
});

const onClassSelect = (classData) => {
  if (classData) {
    store.setItem(classData.name);
  } else {
    store.activeItem = '';
  }
};

const router = useRouter();

watch(() => store.activeConnection, (newVal) => {
  if (newVal) fetchGraph();
}, { immediate: true });

onMounted(() => {
  fetchGraph();
});
</script>

<style scoped>
.mindmap-view-page {
  height: 100%;
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
  overflow: hidden;
}

.view-header {
  padding: 1rem 1.5rem 0.5rem;
  flex-shrink: 0;
}

.view-title {
  font-size: 1.1rem;
  font-weight: 700;
  color: var(--text-primary);
  margin: 0;
}

.view-desc {
  font-size: 0.78rem;
  color: var(--text-secondary);
  margin-top: 3px;
  margin-bottom: 0;
}

/* ── VIEWPORT: outer pane with dot-grid ── */
.mindmap-viewport {
  flex: 1;
  padding: 20px;
  box-sizing: border-box;
  overflow: hidden;
  position: relative;
  /* Light viewport: light gray + dot grid */
  background-color: #E8ECF2;
  background-image: radial-gradient(circle, #B0BBC8 1px, transparent 1px);
  background-size: 28px 28px;
}

/* Dark viewport override */
:global(html.dark) .mindmap-viewport {
  background-color: #0D1117;
  background-image: radial-gradient(circle, #1E2D3D 1.2px, transparent 1.2px);
  background-size: 28px 28px;
}

/* ── MINDMAP CONTAINER: inner white card ── */
.mindmap-container-card {
  width: 100%;
  height: 100%;
  border-radius: 14px;
  overflow: hidden;
  /* Light: clean white card with soft shadow */
  background: #FFFFFF;
  box-shadow:
    0 0 0 1px rgba(0,0,0,0.07),
    0 4px 20px rgba(0,0,0,0.10),
    0 16px 48px rgba(0,0,0,0.06);
}

/* Dark: dark card */
:global(html.dark) .mindmap-container-card {
  background: #161B27;
  box-shadow:
    0 0 0 1px rgba(255,255,255,0.06),
    0 4px 24px rgba(0,0,0,0.5),
    0 16px 48px rgba(0,0,0,0.4);
}

.canvas-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  text-align: center;
  color: var(--text-muted);
  background: var(--bg-secondary);
  border: 1px dashed var(--border-color);
  border-radius: 14px;
}

.empty-icon {
  margin-bottom: 12px;
}
</style>
