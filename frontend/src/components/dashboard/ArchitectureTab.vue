<template>
  <div class="architecture-tab" v-loading="loadingArchitecture">
    <div class="architecture-header">
      <div>
        <h3>{{ store.t('System Architecture & Components Flow') }}</h3>
        <p>{{ store.t('AI-generated architecture diagram and component relation flows parsed from codebase AST metadata.') }}</p>
      </div>
      <el-button type="primary" text bg round :icon="Refresh" :loading="regeneratingArchitecture" @click="emit('regenerate')">
        {{ store.t('Regenerate with Gemini') }}
      </el-button>
    </div>
    
    <el-row :gutter="20" style="margin-top: 20px;">
      <!-- High Level Architecture Flow -->
      <el-col :xs="24" :md="12">
        <el-card class="diagram-card glass-panel" :class="{ 'fullscreen-card': isFullscreen1 }">
          <template #header>
            <div class="card-header-row">
              <div class="card-header">🌐 {{ store.t('High-Level System Architecture') }}</div>
              <div class="zoom-controls">
                <el-button :icon="ZoomIn" size="small" circle @click="zoomIn1" :title="store.t('Zoom In')" />
                <el-button :icon="Aim" size="small" circle @click="reset1" :title="store.t('Reset')" />
                <el-button :icon="ZoomOut" size="small" circle @click="zoomOut1" :title="store.t('Zoom Out')" />
                <el-button :icon="FullScreen" size="small" circle @click="toggleFullscreen1" :title="store.t('Fullscreen')" />
              </div>
            </div>
          </template>
          <div 
            class="interactive-mermaid-container"
            @mousedown="onMouseDown1"
            @mousemove="onMouseMove1"
            @mouseup="onMouseUp1"
            @mouseleave="onMouseLeave1"
            @wheel="onWheel1"
            :style="{ cursor: isDragging1 ? 'grabbing' : 'grab' }"
          >
            <div 
              class="mermaid-zoom-wrapper"
              :style="{ transform: `translate(${panX1}px, ${panY1}px) scale(${zoom1})` }"
              v-html="archDiagramSvg || `<div class='no-data'>${store.t('No diagram loaded.')}</div>`"
            ></div>
          </div>
        </el-card>
      </el-col>
      
      <!-- Component Interaction Flow -->
      <el-col :xs="24" :md="12">
        <el-card class="diagram-card glass-panel" :class="{ 'fullscreen-card': isFullscreen2 }">
          <template #header>
            <div class="card-header-row">
              <div class="card-header">🧬 {{ store.t('Class & Component Interaction Flow') }}</div>
              <div class="zoom-controls">
                <el-button :icon="ZoomIn" size="small" circle @click="zoomIn2" :title="store.t('Zoom In')" />
                <el-button :icon="Aim" size="small" circle @click="reset2" :title="store.t('Reset')" />
                <el-button :icon="ZoomOut" size="small" circle @click="zoomOut2" :title="store.t('Zoom Out')" />
                <el-button :icon="FullScreen" size="small" circle @click="toggleFullscreen2" :title="store.t('Fullscreen')" />
              </div>
            </div>
          </template>
          <div 
            class="interactive-mermaid-container"
            @mousedown="onMouseDown2"
            @mousemove="onMouseMove2"
            @mouseup="onMouseUp2"
            @mouseleave="onMouseLeave2"
            @wheel="onWheel2"
            :style="{ cursor: isDragging2 ? 'grabbing' : 'grab' }"
          >
            <div 
              class="mermaid-zoom-wrapper"
              :style="{ transform: `translate(${panX2}px, ${panY2}px) scale(${zoom2})` }"
              v-html="classDiagramSvg || `<div class='no-data'>${store.t('No diagram loaded.')}</div>`"
            ></div>
          </div>
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { store } from '../../stores';
import { ZoomIn, ZoomOut, Aim, FullScreen, Refresh } from '@element-plus/icons-vue';

defineProps<{
  loadingArchitecture: boolean;
  regeneratingArchitecture: boolean;
  archDiagramSvg: string;
  classDiagramSvg: string;
}>();

const emit = defineEmits<{
  (e: 'regenerate'): void;
}>();

// Diagram 1 (Architecture) zoom & pan states
const zoom1 = ref(1.0);
const panX1 = ref(0);
const panY1 = ref(0);
const isDragging1 = ref(false);
let startX1 = 0;
let startY1 = 0;
const isFullscreen1 = ref(false);

// Diagram 2 (Class Interaction) zoom & pan states
const zoom2 = ref(1.0);
const panX2 = ref(0);
const panY2 = ref(0);
const isDragging2 = ref(false);
let startX2 = 0;
let startY2 = 0;
const isFullscreen2 = ref(false);

// Zoom 1 Handlers
const zoomIn1 = () => { zoom1.value = Math.min(20.0, zoom1.value + 0.25); };
const zoomOut1 = () => { zoom1.value = Math.max(0.1, zoom1.value - 0.25); };
const reset1 = () => { zoom1.value = 1.0; panX1.value = 0; panY1.value = 0; };
const toggleFullscreen1 = () => { isFullscreen1.value = !isFullscreen1.value; reset1(); };

const onMouseDown1 = (e: MouseEvent) => {
  if ((e.target as HTMLElement).closest('.zoom-controls')) return;
  isDragging1.value = true;
  startX1 = e.clientX - panX1.value;
  startY1 = e.clientY - panY1.value;
};
const onMouseMove1 = (e: MouseEvent) => {
  if (!isDragging1.value) return;
  panX1.value = e.clientX - startX1;
  panY1.value = e.clientY - startY1;
};
const onMouseUp1 = () => { isDragging1.value = false; };
const onMouseLeave1 = () => { isDragging1.value = false; };
const onWheel1 = (e: WheelEvent) => {
  e.preventDefault();
  const delta = e.deltaY * -0.001;
  zoom1.value = Math.min(20.0, Math.max(0.1, zoom1.value + delta));
};

// Zoom 2 Handlers
const zoomIn2 = () => { zoom2.value = Math.min(20.0, zoom2.value + 0.25); };
const zoomOut2 = () => { zoom2.value = Math.max(0.1, zoom2.value - 0.25); };
const reset2 = () => { zoom2.value = 1.0; panX2.value = 0; panY2.value = 0; };
const toggleFullscreen2 = () => { isFullscreen2.value = !isFullscreen2.value; reset2(); };

const onMouseDown2 = (e: MouseEvent) => {
  if ((e.target as HTMLElement).closest('.zoom-controls')) return;
  isDragging2.value = true;
  startX2 = e.clientX - panX2.value;
  startY2 = e.clientY - panY2.value;
};
const onMouseMove2 = (e: MouseEvent) => {
  if (!isDragging2.value) return;
  panX2.value = e.clientX - startX2;
  panY2.value = e.clientY - startY2;
};
const onMouseUp2 = () => { isDragging2.value = false; };
const onMouseLeave2 = () => { isDragging2.value = false; };
const onWheel2 = (e: WheelEvent) => {
  e.preventDefault();
  const delta = e.deltaY * -0.001;
  zoom2.value = Math.min(20.0, Math.max(0.1, zoom2.value + delta));
};
</script>

<style scoped>
.architecture-tab {
  background: var(--bg-primary);
  padding: 2rem;
  box-sizing: border-box;
}

.architecture-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-bottom: 1px solid var(--border-color);
  padding-bottom: 1rem;
}

.architecture-header h3 {
  margin: 0;
  font-size: 1.25rem;
  color: var(--text-primary);
}

.architecture-header p {
  margin: 4px 0 0 0;
  font-size: 0.875rem;
  color: var(--text-muted);
}

.diagram-card {
  min-height: 500px;
  position: relative;
  transition: all 0.25s ease-out;
}

.fullscreen-card {
  position: fixed;
  top: 20px;
  left: 20px;
  width: calc(100vw - 40px);
  height: calc(100vh - 40px);
  z-index: 1000;
  min-height: auto;
  box-shadow: 0 10px 50px rgba(0, 0, 0, 0.5);
}

.fullscreen-card :deep(.el-card__body) {
  height: calc(100% - 54px);
  padding: 0;
}

.card-header-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  width: 100%;
}

.card-header {
  font-weight: 600;
  color: var(--text-primary);
}

.zoom-controls {
  display: flex;
  gap: 6px;
  z-index: 10;
}

.zoom-controls :deep(.el-button) {
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.15);
  color: var(--text-primary);
  transition: all 0.2s;
}

.zoom-controls :deep(.el-button:hover) {
  background: var(--color-brand);
  border-color: var(--color-brand);
  color: #fff;
  transform: scale(1.05);
}

:global(html:not(.dark)) .zoom-controls :deep(.el-button) {
  background: rgba(0, 0, 0, 0.04);
  border-color: rgba(0, 0, 0, 0.08);
}

.interactive-mermaid-container {
  width: 100%;
  height: 420px;
  overflow: hidden;
  position: relative;
  background: var(--bg-secondary);
  border-radius: 6px;
  border: 1px solid var(--border-color);
  user-select: none;
}

.fullscreen-card .interactive-mermaid-container {
  height: 100%;
  border: none;
  border-radius: 0;
}

.mermaid-zoom-wrapper {
  width: 100%;
  height: 100%;
  display: flex;
  justify-content: center;
  align-items: center;
  transform-origin: center center;
}

:deep(svg) {
  max-width: none !important;
  height: auto;
}

:deep(.no-data) {
  color: var(--text-muted);
  font-size: 0.875rem;
  padding: 2rem 0;
}

:deep(.render-error) {
  color: var(--color-danger);
  font-size: 0.875rem;
  padding: 2rem 0;
}
</style>
