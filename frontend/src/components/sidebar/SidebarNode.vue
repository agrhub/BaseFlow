<template>
  <div class="sidebar-node-wrapper">
    <!-- Folder Row -->
    <div v-if="node.isFolder" class="db-node" :class="{ 'is-active': store.activeFolder === node.path }">
      <div class="node-row db-row" @click="toggleExpand">
        <div class="node-left" :style="{ paddingLeft: `${depth * 12}px` }">
          <el-icon class="expand-icon" :class="{ 'expanded': isExpanded }">
            <CaretRight />
          </el-icon>
          <el-icon class="node-icon"><Folder /></el-icon>
          <span class="node-name" :title="node.path || store.activeConnection">{{ node.label }}</span>
        </div>
        <el-button
          class="node-action"
          type="primary"
          link
          :icon="InfoFilled"
          @click.stop="goToDirectoryMindmap(node.path)"
          size="small"
        />
      </div>
    </div>

    <!-- Nested children and files -->
    <div v-show="isExpanded" class="nested-container">
      <!-- Subfolders -->
      <SidebarNode
        v-for="child in node.children"
        :key="child.path"
        :node="child"
        :depth="depth + 1"
      />

      <!-- Files/Classes in this folder -->
      <div
        v-for="clsName in node.files"
        :key="clsName"
        class="node-row coll-row"
        :class="{ 'is-active': store.activeFolder === (node.path || 'root') && store.activeItem === clsName }"
        :style="{ paddingLeft: `${(depth + 1) * 12 + 12 + 20}px` }"
        @click="goToClassDetails(node.path || 'root', clsName)"
      >
        <el-icon class="node-icon">
          <Tickets v-if="clsName.includes('.')" />
          <Document v-else />
        </el-icon>
        <span class="node-name" :title="clsName">{{ clsName }}</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { store } from '../../stores';
import { CaretRight, Folder, Document, InfoFilled } from '@element-plus/icons-vue';

const props = withDefaults(defineProps<{
  node: {
    label: string;
    path: string;
    isFolder: boolean;
    children: any[];
    files: string[];
  };
  depth?: number;
}>(), {
  depth: 0
});

const router = useRouter();
const isExpanded = ref(props.depth === 0); // Always expand the root repository folder by default

// Expand automatically if active path starts with this folder's path
watch(() => store.activeFolder, (newVal) => {
  if (newVal && props.node.path && (newVal === props.node.path || newVal.startsWith(props.node.path + '/'))) {
    isExpanded.value = true;
  }
}, { immediate: true });

const toggleExpand = () => {
  isExpanded.value = !isExpanded.value;
};

const goToDirectoryMindmap = (dirName: string) => {
  store.setFolder(dirName);
  if (dirName && dirName !== 'root') {
    const encodedDb = dirName.replace(/\//g, '_');
    router.push(`/${store.activeConnection}/explorer/${encodedDb}`);
  } else {
    router.push(`/${store.activeConnection}`);
  }
};

const goToClassDetails = (dirName: string, clsName: string) => {
  store.setFolder(dirName);
  store.setItem(clsName);
  const encodedDb = dirName && dirName !== 'root' ? dirName.replace(/\//g, '_') : 'root';
  router.push(`/${store.activeConnection}/explorer/${encodedDb}/${clsName}`);
};
</script>

<style scoped>
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
</style>
