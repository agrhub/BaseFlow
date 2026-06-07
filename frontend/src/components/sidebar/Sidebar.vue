<template>
  <div class="sidebar-container" :class="{ 'collapsed': isCollapsed }">
    <!-- Brand / Logo -->
    <div class="sidebar-brand">
      <!-- <el-icon v-if="!isCollapsed" class="brand-icon"><Grid /></el-icon> -->
      <el-image v-if="!isCollapsed" src="/logo.png" style="width: 32px; height: 32px;" class="brand-logo" />
      <span v-if="!isCollapsed" class="brand-text">BaseFlow</span>
      <div class="collapse-toggle" @click="isCollapsed = !isCollapsed">
        <el-icon><Fold v-if="!isCollapsed" /><Expand v-else /></el-icon>
      </div>
    </div>

    <!-- Actions Bar -->
    <div class="sidebar-actions" v-if="!isCollapsed">
      <el-button type="primary" round text size="" @click="$router.push('/')">
        <el-icon><Connection /></el-icon>
        {{ store.t('Connections') }}
      </el-button>
    </div>

    <!-- Directory Explorer Tree -->
    <div class="sidebar-explorer" v-if="store.activeConnection && !isCollapsed">
      <div class="explorer-header">
        <span class="explorer-title">{{ store.t('Codebase Explorer') }}</span>
      </div>

      <div class="db-list">
        <SidebarNode :node="treeData" />

        <div v-if="Object.keys(store.sidebarList).length === 0" class="empty-sidebar">
          <el-icon class="empty-icon"><FolderOpened /></el-icon>
          <p>{{ store.t('No codebases found') }}</p>
        </div>
      </div>
    </div>

    <!-- Collapsed helper icons -->
    <div class="collapsed-icons" v-if="isCollapsed">
      <el-tooltip :content="store.t('Connections')" placement="right">
        <div class="collapsed-icon-btn" @click="$router.push('/')">
          <el-icon><Connection /></el-icon>
        </div>
      </el-tooltip>
      <el-tooltip :content="store.t('Metrics')" placement="right" v-if="store.activeConnection">
        <div class="collapsed-icon-btn" @click="$router.push(`/${store.activeConnection}/monitoring`)">
          <el-icon><DataLine /></el-icon>
        </div>
      </el-tooltip>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import { store } from '../../stores';
import SidebarNode from './SidebarNode.vue';
import {
  Connection, Expand, Fold, FolderOpened, DataLine
} from '@element-plus/icons-vue';

const isCollapsed = ref(false);

onMounted(() => {
  if (store.activeConnection) {
    store.fetchSidebar();
  }
});

interface FileTreeNode {
  label: string;
  path: string;
  isFolder: boolean;
  children: FileTreeNode[];
  files: string[];
}

const treeData = computed<FileTreeNode>(() => {
  const rootNode: FileTreeNode = {
    label: store.activeConnection || 'root',
    path: '',
    isFolder: true,
    children: [],
    files: []
  };

  const list = store.sidebarList;
  Object.keys(list).forEach(dirPath => {
    const files = list[dirPath];
    if (dirPath === 'root' || dirPath === '') {
      rootNode.files = files;
      return;
    }

    const segments = dirPath.split('/');
    let current = rootNode;
    let currentPath = '';

    segments.forEach((seg, index) => {
      currentPath = currentPath ? `${currentPath}/${seg}` : seg;
      let child = current.children.find(c => c.label === seg);
      if (!child) {
        child = {
          label: seg,
          path: currentPath,
          isFolder: true,
          children: [],
          files: []
        };
        current.children.push(child);
      }
      current = child;
      
      if (index === segments.length - 1) {
        current.files = files;
      }
    });
  });

  return rootNode;
});
</script>

<style scoped>
.sidebar-container {
  width: 260px;
  background: var(--bg-secondary);
  color: var(--text-secondary);
  display: flex;
  flex-direction: column;
  height: 100vh;
  border-right: 1px solid var(--border-color);
  transition: width var(--transition-normal);
  flex-shrink: 0;
}

.sidebar-container.collapsed {
  width: 64px;
}

.sidebar-brand {
  height: 64px;
  display: flex;
  align-items: center;
  padding: 0 1rem;
  border-bottom: 1px solid var(--border-color);
  position: relative;
  overflow: hidden;
  gap: 8px;
}

.brand-icon {
  font-size: 1.5rem;
  color: var(--color-brand);
  flex-shrink: 0;
}

.brand-text {
  font-size: 1.25rem;
  font-weight: 700;
  letter-spacing: -0.02em;
  white-space: nowrap;
  color: var(--text-primary);
}

.collapse-toggle {
  position: absolute;
  right: 1rem;
  cursor: pointer;
  color: var(--text-muted);
  transition: color var(--transition-fast);
  display: flex;
  align-items: center;
}

.collapse-toggle:hover {
  color: var(--text-primary);
}

.sidebar-actions {
  display: flex;
  justify-content: flex-start;
  padding: 0.75rem 1rem;
  border-bottom: 1px solid var(--border-color);
  background: var(--bg-primary);
}

.sidebar-explorer {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow-y: auto;
  padding: 1rem 0;
}

.explorer-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0 1rem 0.75rem;
}

.explorer-title {
  font-size: 0.75rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--text-muted);
}

.db-list {
  display: flex;
  flex-direction: column;
}

.db-node {
  margin-bottom: 4px;
}

.node-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.5rem 1rem;
  cursor: pointer;
  border-radius: 4px;
  margin: 0 0.5rem;
  transition: all var(--transition-fast);
}

.db-row:hover {
  background: var(--bg-primary);
  color: var(--text-primary);
}

.node-left {
  display: flex;
  align-items: center;
  gap: 8px;
  overflow: hidden;
}

.expand-icon {
  font-size: 0.75rem;
  color: var(--text-muted);
  transition: transform var(--transition-fast);
}

.expand-icon.expanded {
  transform: rotate(90deg);
}

.node-icon {
  font-size: 1rem;
  color: var(--text-muted);
}

.node-name {
  font-size: 0.875rem;
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.node-action {
  opacity: 0;
  transition: opacity var(--transition-fast);
}

.node-row:hover .node-action {
  opacity: 1;
}

.collections-list {
  padding-left: 1.5rem;
  margin-top: 2px;
}

.coll-row {
  padding: 0.35rem 0.75rem;
  margin: 1px 0.5rem 1px 0;
  justify-content: flex-start;
  gap: 8px;
}

.coll-row .node-icon {
  color: var(--color-brand);
}

.coll-row:hover {
  background: var(--bg-primary);
  color: var(--text-primary);
}

.db-node.is-active > .db-row {
  background: var(--bg-primary);
  color: var(--text-primary);
  font-weight: 600;
}

.coll-row.is-active {
  background: var(--color-brand-light);
  color: var(--color-brand);
  font-weight: 600;
  border-left: 2px solid var(--color-brand);
}

.no-collections, .empty-sidebar {
  padding: 0.5rem 1rem;
  font-size: 0.75rem;
  color: var(--text-muted);
  font-style: italic;
}

.empty-sidebar {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  margin-top: 2rem;
  text-align: center;
}

.empty-icon {
  font-size: 2rem;
}

.collapsed-icons {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 1rem 0;
  gap: 1rem;
}

.collapsed-icon-btn {
  width: 40px;
  height: 40px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  color: var(--text-muted);
  transition: all var(--transition-fast);
}

.collapsed-icon-btn:hover {
  background: var(--bg-primary);
  color: var(--text-primary);
}
</style>
