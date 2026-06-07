<template>
  <div class="inspector-header" v-if="classData">
    <div class="header-left">
      <el-button :icon="Back" circle @click="$emit('back')" class="back-btn" />
      <div>
        <span class="class-badge" :style="isBinary ? { background: '#64748b' } : {}">
          {{ isBinary ? store.t('Binary') : (classData.isModule ? 'Module' : 'Class') }}
        </span>
        <h2 class="class-title">{{ classData.name }}</h2>
        <span class="file-path-text">{{ classData.filePath }}</span>
      </div>
    </div>
    
    <!-- AI Action Buttons -->
    <div class="inspector-actions" v-if="!isBinary">
      <el-button type="success" text bg round :icon="Cpu" @click="triggerAction(classData.isModule ? store.t('Optimize this module file') : store.t('Optimize class'))">
        {{ store.t('Optimize') }}
      </el-button>
      <el-button type="danger" text bg round :icon="Warning" @click="triggerAction(classData.isModule ? store.t('If I delete this module file, how is the system affected?') : store.t('If I delete this class, how is the system affected?'))">
        {{ store.t('Delete Risk') }}
      </el-button>
      <el-button type="primary" text bg round :icon="Finished" @click="triggerAction(classData.isModule ? store.t('Write unit tests for this module file') : store.t('Write unit tests for this class'))">
        {{ store.t('Generate Tests') }}
      </el-button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { Back, Cpu, Warning, Finished } from '@element-plus/icons-vue';
import { store } from '../../stores';

withDefaults(defineProps<{
  classData: {
    name: string;
    filePath: string;
    isModule: boolean;
  };
  isBinary?: boolean;
}>(), {
  isBinary: false
});

const emit = defineEmits<{
  (e: 'trigger-ai', command: string): void;
  (e: 'back'): void;
}>();

const triggerAction = (command: string) => {
  emit('trigger-ai', command);
};
</script>

<style scoped>
.inspector-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 2rem;
  flex-wrap: wrap;
  gap: 16px;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 16px;
}

.back-btn {
  border: 1px solid var(--border-color);
  background: var(--bg-secondary);
}

.class-badge {
  background: linear-gradient(135deg, var(--color-primary), #00b4d8);
  font-size: 1rem;
  font-weight: 700;
  text-transform: uppercase;
  padding: 2px 8px;
  border-radius: 4px;
}

.class-title {
  font-size: 1.5rem;
  font-weight: 700;
  color: var(--text-primary);
  margin: 4px 0;
}

.file-path-text {
  font-size: 0.72rem;
  color: var(--text-muted);
  font-family: var(--font-mono);
}

.inspector-actions {
  display: flex;
  gap: 10px;
}
</style>
