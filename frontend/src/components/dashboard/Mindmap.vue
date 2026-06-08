<template>
  <div class="google-mindmap-container">
    <!-- Search Bar & Filters (Top-Left, Google Maps style) -->
    <div class="google-search-container">
      <div class="search-box-card">
        <el-autocomplete
          v-model="searchQuery"
          :fetch-suggestions="querySearch"
          :placeholder="store.t('Search codebase...')"
          @select="handleSearchSelect"
          class="google-search-input"
          clearable
        >
          <template #prefix>
            <el-icon class="search-icon"><Search /></el-icon>
          </template>
          <template #default="{ item }">
            <div class="search-result-row">
              <span class="result-icon">{{ item.type === 'class' ? '🧩' : '📁' }}</span>
              <div class="result-meta">
                <div class="result-name">{{ item.name }}</div>
                <div class="result-detail">{{ item.detail }}</div>
              </div>
            </div>
          </template>
        </el-autocomplete>
      </div>
      
      <!-- Quick filter pills next to search box -->
      <div class="google-quick-filters" v-if="mode === 'class'">
        <el-tag
          v-if="store.vulnerableNodes && store.vulnerableNodes.length"
          type="danger"
          effect="dark"
          round
          class="filter-pill vulnerable-pill"
          @click="focusVulnerabilities"
        >
          🚨 {{ store.t('Vulnerabilities') }} ({{ store.vulnerableNodes.length }})
        </el-tag>
      </div>
    </div>

    <!-- Map Layer Switcher (Bottom-Left, Google Maps style) -->
    <div class="google-layers-switcher">
      <div class="layers-button" @click.stop="toggleLayersMenu">
        <div class="layer-thumbnail">
          <div class="layer-image">{{ currentLayoutMode === 'mindmap' ? '🌿' : '🧠' }}</div>
        </div>
        <span class="layer-label">{{currentLayoutMode === 'mindmap' ? store.t('Mindmap') : store.t('Neural')}}</span>
      </div>
      
      <div v-show="layersMenuOpen" class="layers-popover">
        <div class="popover-title">{{ store.t('Map Type') }}</div>
        <div class="layer-options">
          <div 
            class="layer-option" 
            :class="{ active: currentLayoutMode === 'mindmap' }"
            @click="selectLayer('mindmap')"
          >
            <div class="option-image mindmap-preview">🌿</div>
            <span class="option-label">{{ store.t('Mindmap') }}</span>
          </div>
          <div 
            v-if="mode === 'class'"
            class="layer-option" 
            :class="{ active: currentLayoutMode === 'neural' }"
            @click="selectLayer('neural')"
          >
            <div class="option-image neural-preview">🧠</div>
            <span class="option-label">{{ store.t('Neural Map') }}</span>
          </div>
        </div>
      </div>
    </div>

    <!-- Zoom Controls (Bottom-Right, Google Maps style) -->
    <div class="google-zoom-controls">
      <el-button size="large" :icon="ZoomIn" @click="zoomIn" :title="store.t('Zoom In')" circle />
      <el-button size="large" :icon="ZoomOut" @click="zoomOut" :title="store.t('Zoom Out')" circle />
      <el-button size="large" :icon="Aim" @click="resetView" :title="store.t('Fit View')" circle />
      <el-button 
        size="large" 
        :icon="autoLOD ? Unlock : Lock" 
        :type="autoLOD ? 'primary' : ''"
        @click="toggleAutoLOD" 
        :title="autoLOD ? store.t('Disable Auto Zoom Collapse') : store.t('Enable Auto Zoom Collapse')" 
        circle 
      />
      <el-button size="large" :icon="Expand" @click="expandAllNodes" :title="store.t('Expand All')" circle />
      <el-button size="large" :icon="FullScreen" @click="toggleFullscreen" :title="store.t('Fullscreen')" circle />
    </div>

    <!-- Focus Node control (Top-Right, Google Maps style) -->
    <div class="google-focus-container" v-if="highlightClass && mode === 'class'">
      <el-button 
        type="" 
        round 
        :icon="Filter"
        @click="toggleFocus"
        class="google-focus-btn"
      >
        {{ isFocusMode ? store.t('Show Full Graph') : store.t('Focus Node & Neighbors') }}
      </el-button>
    </div>

    <!-- G6 Canvas Container -->
    <div ref="graphContainer" class="g6-graph-container" :style="canvasStyle"></div>

    <!-- ERD Dialog -->
    <el-dialog v-model="erdVisible" :title="store.t('UML Entity-Relationship & Class Diagram')"
      width="90%" class="erd-uml-dialog" :fullscreen="true" destroy-on-close>
      <div v-if="erdClass" class="erd-layout">
        <svg class="erd-svg">
          <defs>
            <marker id="arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
              <path d="M 0 0 L 10 5 L 0 10 z" fill="#8F9CAE" />
            </marker>
          </defs>
          <g v-html="erdLines"></g>
        </svg>
        <div class="erd-cols">
          <div class="erd-col">
            <div class="col-title">{{ store.t('Inherited / Implements') }}</div>
            <div class="col-cards">
              <div v-if="!erdParents.length" class="no-cards">{{ store.t('No base classes or interfaces') }}</div>
              <div v-for="p in erdParents" :key="p.name" class="uml-card parent-card" :id="`erd-${p.name}`">
                <div class="uml-head"><span class="uml-type">{{ p.isInterface ? store.t('Interface') : store.t('Base Class') }}</span><h4>{{ p.name }}</h4></div>
                <div class="uml-members">
                  <div class="uml-sec">{{ store.t('Properties') }}</div>
                  <div v-for="x in p.properties" :key="x.name" class="uml-item">{{ vis(x.visibility) }} {{ x.name }}: {{ x.type }}</div>
                  <div v-if="!p.properties?.length" class="uml-empty">{{ store.t('No properties') }}</div>
                  <div class="uml-sec">{{ store.t('Methods') }}</div>
                  <div v-for="x in p.methods" :key="x.name" class="uml-item">{{ vis(x.visibility) }} {{ x.name }}()</div>
                  <div v-if="!p.methods?.length" class="uml-empty">{{ store.t('No methods') }}</div>
                </div>
              </div>
            </div>
          </div>
          <div class="erd-col">
            <div class="col-title">{{ store.t('Selected Component') }}</div>
            <div class="col-cards">
              <div class="uml-card target-card" :id="`erd-${erdClass.name}`">
                <div class="uml-head"><span class="uml-type">{{ store.t('Class') }}</span><h4>{{ erdClass.name }}</h4></div>
                <div class="uml-members">
                  <div class="uml-sec">{{ store.t('Properties') }}</div>
                  <div v-for="x in erdClass.properties" :key="x.name" class="uml-item">{{ vis(x.visibility) }} {{ x.name }}: {{ x.type }}</div>
                  <div v-if="!erdClass.properties?.length" class="uml-empty">{{ store.t('No properties') }}</div>
                  <div class="uml-sec">{{ store.t('Methods') }}</div>
                  <div v-for="x in erdClass.methods" :key="x.name" class="uml-item">{{ vis(x.visibility) }} {{ x.name }}()</div>
                  <div v-if="!erdClass.methods?.length" class="uml-empty">{{ store.t('No methods') }}</div>
                </div>
              </div>
            </div>
          </div>
          <div class="erd-col">
            <div class="col-title">{{ store.t('Used By / Dependencies') }}</div>
            <div class="col-cards">
              <div v-if="!erdDependents.length" class="no-cards">{{ store.t('No related dependent classes') }}</div>
              <div v-for="d in erdDependents" :key="d.name" class="uml-card dependent-card" :id="`erd-${d.name}`">
                <div class="uml-head"><span class="uml-type">{{ store.t('Dependency') }}</span><h4>{{ d.name }}</h4></div>
                <div class="uml-members">
                  <div class="uml-sec">{{ store.t('Properties') }}</div>
                  <div v-for="x in d.properties" :key="x.name" class="uml-item">{{ vis(x.visibility) }} {{ x.name }}: {{ x.type }}</div>
                  <div v-if="!d.properties?.length" class="uml-empty">{{ store.t('No properties') }}</div>
                  <div class="uml-sec">{{ store.t('Methods') }}</div>
                  <div v-for="x in d.methods" :key="x.name" class="uml-item">{{ vis(x.visibility) }} {{ x.name }}()</div>
                  <div v-if="!d.methods?.length" class="uml-empty">{{ store.t('No methods') }}</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, nextTick, onMounted, onUnmounted, computed } from 'vue';
import { useRouter } from 'vue-router';
import G6 from '@antv/g6';
import { ZoomIn, ZoomOut, Aim, FullScreen, Search, Filter, Lock, Unlock, Expand } from '@element-plus/icons-vue';
import { store } from '../../stores';

// ──────────────────────────────────────────────
// Props & Emits
// ──────────────────────────────────────────────
const props = withDefaults(defineProps<{
  initialNodes: any[];
  initialEdges: any[];
  highlightClass?: string | null;
  mode?: 'class' | 'directory';
  isFocusMode?: boolean;
}>(), { mode: 'class', isFocusMode: false });

const emit = defineEmits<{
  (e: 'select-class', d: any): void;
  (e: 'select-node', d: any): void;
  (e: 'update:isFocusMode', val: boolean): void;
}>();

const router = useRouter();

// ──────────────────────────────────────────────
// G6 Neural Map Node Registration
// ──────────────────────────────────────────────
G6.registerNode('custom-g6-node', {
  draw(cfg: any, group: any) {
    const isDark = document.documentElement.classList.contains('dark');
    const type = cfg.nodeType || 'class';
    const isRoot = cfg.isRoot;
    const name = cfg.name || '';
    const filePath = cfg.filePath || '';
    const isHighlighted = cfg.isHighlighted;
    const isDimmed = cfg.isDimmed;
    const isVulnerable = cfg.isVulnerable;
    const branchColor = cfg.branchColor || '#7C3AED';
    const width = cfg.width || 200;
    const height = cfg.height || 42;
    
    // Dimmed state opacity
    const opacity = isDimmed ? 0.15 : 1.0;

    // Background styling
    let fill = isDark ? '#1E293B' : '#FFFFFF';
    let stroke = branchColor;
    let strokeWidth = 1.8;
    
    const relType = cfg.relType;
    let shadowColor = 'rgba(0, 0, 0, 0.12)';
    let shadowBlur = 4;

    if (isVulnerable) {
      stroke = '#EF4444'; // Red-500
      strokeWidth = 3.0;
      fill = isDark ? '#450a0a' : '#fef2f2';
      shadowColor = '#EF4444';
      shadowBlur = 16;
    } else if (isHighlighted) {
      stroke = '#00E0FF';
      strokeWidth = 2.5;
      shadowColor = '#00E0FF';
      shadowBlur = 14;
    } else if (relType) {
      strokeWidth = 2.2;
      shadowBlur = 8;
      if (relType === 'extends') {
        stroke = '#FFB800'; // Extends: Yellow
        shadowColor = '#FFB800';
      } else if (relType === 'implements') {
        stroke = '#00E0FF'; // Implements: Blue-cyan
        shadowColor = '#00E0FF';
      } else {
        stroke = '#8F9CAE'; // Uses: Gray
        shadowColor = '#8F9CAE';
      }
    } else if (type === 'leaf') {
      stroke = branchColor + '55';
      strokeWidth = 1;
      fill = isDark ? '#1E293B88' : '#F1F5F9';
    } else if (type === 'directory') {
      fill = isDark ? '#334155' : '#F8FAFC';
    }

    const keyShape = group.addShape('rect', {
      attrs: {
        x: -width / 2,
        y: -height / 2,
        width,
        height,
        fill,
        stroke,
        lineWidth: strokeWidth,
        radius: isRoot ? 12 : (type === 'directory' ? 8 : (type === 'leaf' ? 4 : 6)),
        opacity,
        shadowColor,
        shadowBlur,
      },
      name: 'node-rect',
    });

    // Node icon
    let icon = '📄';
    if (isVulnerable) icon = '🛡️';
    else if (isRoot) icon = '⬡';
    else if (type === 'directory') {
      icon = cfg.isLeaf ? '📄' : (cfg.isExpanded ? '📂' : '📁');
    }
    else if (type === 'leaf') {
      icon = cfg.isMore ? '🔸' : (cfg.isMethod ? '⚡' : '⚙️');
    }

    group.addShape('text', {
      attrs: {
        x: -width / 2 + 10,
        y: 0,
        text: icon,
        fontSize: type === 'leaf' ? 10 : 12,
        textAlign: 'left',
        textBaseline: 'middle',
        fill: branchColor,
        opacity,
      },
      name: 'node-icon',
    });

    // Node title
    let titleFill = isDark ? '#F8FAFC' : '#0F172A';
    if (type === 'leaf') {
      titleFill = isDark ? '#CBD5E1' : '#475569';
    }
    
    group.addShape('text', {
      attrs: {
        x: -width / 2 + (type === 'leaf' ? 24 : 28),
        y: filePath ? -6 : 0,
        text: name.length > 20 ? name.substring(0, 18) + '...' : name,
        fontSize: type === 'leaf' ? 8.5 : 10.5,
        fontFamily: type === 'leaf' ? 'JetBrains Mono, Fira Code, monospace' : 'system-ui, -apple-system, sans-serif',
        fontWeight: isRoot ? 'bold' : '600',
        textAlign: 'left',
        textBaseline: 'middle',
        fill: titleFill,
        opacity,
      },
      name: 'node-title',
    });

    // Node path subtitle
    if (filePath) {
      const displayPath = filePath.split('/').pop() || '';
      group.addShape('text', {
        attrs: {
          x: -width / 2 + 28,
          y: 8,
          text: displayPath.length > 22 ? displayPath.substring(0, 20) + '...' : displayPath,
          fontSize: 7.5,
          textAlign: 'left',
          textBaseline: 'middle',
          fill: isDark ? '#94A3B8' : '#64748B',
          opacity,
        },
        name: 'node-subtitle',
      });
    }

    return keyShape;
  }
});

// ──────────────────────────────────────────────
// Layout Constants & Variables
// ──────────────────────────────────────────────
const graphContainer = ref<HTMLDivElement | null>(null);
let graph: any = null;
const currentLayoutMode = ref<'mindmap' | 'neural'>('mindmap');
const expandedNodes = ref<Set<string>>(new Set(['mm-root']));
const savedExpandedNodes = ref<Set<string> | null>(null);
let isInitialLoad = true;
const autoLOD = ref(false); // Disabled by default

const toggleAutoLOD = () => {
  autoLOD.value = !autoLOD.value;
  if (autoLOD.value) {
    handleViewportChange();
  }
};

const expandAllNodes = () => {
  expandedNodes.value.clear();
  expandedNodes.value.add('mm-root');
  
  if (props.mode === 'directory') {
    const root = props.initialNodes[0];
    if (!root) return;
    const addFolderIds = (node: any) => {
      if (node._id) {
        expandedNodes.value.add(node._id);
      }
      if (node.children) {
        node.children.forEach((c: any) => {
          if (c.isFolder) {
            addFolderIds(c);
          }
        });
      }
    };
    addFolderIds(root);
  } else {
    props.initialNodes.forEach((n: any) => {
      const fp = (n.data?.filePath || n.filePath || '').replace(/\\/g, '/');
      const parts = fp.split('/');
      let pathAccumulator = '';
      const dirParts = parts.slice(0, -1);
      dirParts.forEach((part: string) => {
        pathAccumulator = pathAccumulator ? `${pathAccumulator}/${part}` : part;
        expandedNodes.value.add(`dir-${pathAccumulator}`);
      });
    });
  }
  
  expandedNodes.value = new Set(expandedNodes.value);
  applyLayout(props.initialNodes);
  
  nextTick(() => {
    if (graph) {
      graph.fitView(40);
    }
  });
};

const toggleFocus = () => {
  emit('update:isFocusMode', !props.isFocusMode);
};

const ROOT_W        = 160;
const NODE_W        = 200;
const NODE_H        = 42;
const COL_GAP       = 60;
const ROW_GAP       = 8;
const MAX_DEFAULT_NODES = 10;

const COLORS = [
  '#7C3AED','#2563EB','#0891B2','#059669',
  '#D97706','#DC2626','#DB2777','#0D9488',
  '#6366F1','#EA580C','#16A34A','#9333EA',
];

// Track dark mode by observing html.dark class
const isDarkRef = ref(document.documentElement.classList.contains('dark'));
let _themeObs: MutationObserver | null = null;

const canvasStyle = computed(() => ({
  background: isDarkRef.value ? '#111827' : '#EEF2F8',
}));

// ──────────────────────────────────────────────
// Multi-directional Class Tree Builder (Logic from old Vue Flow)
// ──────────────────────────────────────────────
interface TreeNode {
  id: string;
  name: string;
  type: 'root' | 'directory' | 'class' | 'property' | 'method' | 'more';
  filePath?: string;
  branchColor?: string;
  classData?: any;
  children: TreeNode[];
  width: number;
  height: number;
  subtreeHeight: number;
  x?: number;
  y?: number;
  nameOnly?: string;
  isHighlighted?: boolean;
  depth?: number;
}

function buildClassTree(
  rawNodes: any[],
  activeNodeIdVal: string | null,
  activeLeafNameVal: string | null,
  initialEdgesVal: any[]
): TreeNode {
  const rootNode: TreeNode = {
    id: 'mm-root',
    name: '⬡ Project',
    type: 'root',
    children: [],
    width: ROOT_W,
    height: NODE_H,
    subtreeHeight: NODE_H
  };

  const relatedClassIds = new Set<string>();
  if (activeNodeIdVal) {
    const activeLower = activeNodeIdVal.toLowerCase();
    initialEdgesVal.forEach(e => {
      if (e.source.toLowerCase() === activeLower) {
        relatedClassIds.add(e.target);
      } else if (e.target.toLowerCase() === activeLower) {
        relatedClassIds.add(e.source);
      }
    });
  }

  const dirNodesMap = new Map<string, TreeNode>();

  rawNodes.forEach(n => {
    const fp = (n.data?.filePath || '').replace(/\\/g, '/');
    const parts = fp.split('/');
    let currentParent = rootNode;
    let pathAccumulator = '';
    const dirParts = parts.slice(0, -1);

    dirParts.forEach((part: string, idx: number) => {
      pathAccumulator = pathAccumulator ? `${pathAccumulator}/${part}` : part;
      let dirNode = dirNodesMap.get(pathAccumulator);
      if (!dirNode) {
        dirNode = {
          id: `dir-${pathAccumulator}`,
          name: part,
          type: 'directory',
          filePath: pathAccumulator,
          children: [],
          width: 180,
          height: 38,
          subtreeHeight: 38,
          depth: idx + 1
        };
        dirNodesMap.set(pathAccumulator, dirNode);
        currentParent.children.push(dirNode);
      }
      currentParent = dirNode;
    });

    const classNodeId = n.id;
    const isNodeActive = activeNodeIdVal === classNodeId;
    const isNodeRelated = relatedClassIds.has(classNodeId);

    const classNode: TreeNode = {
      id: classNodeId,
      name: n.data.name,
      type: 'class',
      filePath: fp,
      classData: n.data,
      children: [],
      width: 200,
      height: 42,
      subtreeHeight: 42
    };

    const props = n.data.properties || [];
    const meths = n.data.methods || [];

    if (isNodeActive) {
      const showProps = props.slice(0, 5);
      showProps.forEach((p: any) => {
        const isHighlighted = activeLeafNameVal === p.name;
        classNode.children.push({
          id: `${classNodeId}-prop-${p.name}`,
          name: p.name,
          nameOnly: p.name,
          type: 'property',
          children: [],
          width: 150,
          height: 24,
          subtreeHeight: 24,
          isHighlighted
        });
      });
      if (props.length > 5) {
        classNode.children.push({
          id: `${classNodeId}-prop-more`,
          name: `+${props.length - 5} more properties`,
          type: 'more',
          children: [],
          width: 140,
          height: 22,
          subtreeHeight: 22
        });
      }

      const showMeths = meths.slice(0, 5);
      showMeths.forEach((m: any) => {
        const isHighlighted = activeLeafNameVal === m.name;
        classNode.children.push({
          id: `${classNodeId}-meth-${m.name}`,
          name: `${m.name}()`,
          nameOnly: m.name,
          type: 'method',
          children: [],
          width: 150,
          height: 24,
          subtreeHeight: 24,
          isHighlighted
        });
      });
      if (meths.length > 5) {
        classNode.children.push({
          id: `${classNodeId}-meth-more`,
          name: `+${meths.length - 5} more methods`,
          type: 'more',
          children: [],
          width: 140,
          height: 22,
          subtreeHeight: 22
        });
      }
    } 
    else if (isNodeRelated && activeLeafNameVal) {
      const matchingProp = props.find((p: any) => p.name === activeLeafNameVal);
      if (matchingProp) {
        classNode.children.push({
          id: `${classNodeId}-prop-${matchingProp.name}`,
          name: matchingProp.name,
          nameOnly: matchingProp.name,
          type: 'property',
          children: [],
          width: 150,
          height: 24,
          subtreeHeight: 24,
          isHighlighted: true
        });
      }
      const matchingMeth = meths.find((m: any) => m.name === activeLeafNameVal);
      if (matchingMeth) {
        classNode.children.push({
          id: `${classNodeId}-meth-${matchingMeth.name}`,
          name: `${matchingMeth.name}()`,
          nameOnly: matchingMeth.name,
          type: 'method',
          children: [],
          width: 150,
          height: 24,
          subtreeHeight: 24,
          isHighlighted: true
        });
      }
    }

    currentParent.children.push(classNode);
  });

  return rootNode;
}

function measureNodeHeight(n: TreeNode): number {
  if (!n.children || n.children.length === 0 || (n.type === 'directory' && !expandedNodes.value.has(n.id))) {
    n.subtreeHeight = n.height;
    return n.height;
  }
  let totalChildHeight = 0;
  n.children.forEach((child, index) => {
    const childHeight = measureNodeHeight(child);
    const gap = (child.type === 'property' || child.type === 'method' || child.type === 'more') ? 6 : 10;
    totalChildHeight += childHeight;
    if (index < n.children.length - 1) {
      totalChildHeight += gap;
    }
  });
  n.subtreeHeight = Math.max(n.height, totalChildHeight);
  return n.subtreeHeight;
}

function positionSubtree(node: TreeNode, x: number, y: number, side: 'left' | 'right') {
  node.x = x;
  node.y = y;
  
  if (!node.children || node.children.length === 0 || (node.type === 'directory' && !expandedNodes.value.has(node.id))) return;
  
  let totalChildHeight = 0;
  node.children.forEach((child, index) => {
    const gap = (child.type === 'property' || child.type === 'method' || child.type === 'more') ? 6 : 10;
    totalChildHeight += child.subtreeHeight;
    if (index < node.children.length - 1) {
      totalChildHeight += gap;
    }
  });
  
  let childStartY = y - totalChildHeight / 2;
  
  node.children.forEach((child) => {
    const gap = (child.type === 'property' || child.type === 'method' || child.type === 'more') ? 6 : 10;
    const childX = side === 'right'
      ? x + node.width + COL_GAP
      : x - child.width - COL_GAP;
    const childY = childStartY + child.subtreeHeight / 2;
    positionSubtree(child, childX, childY, side);
    childStartY += child.subtreeHeight + gap;
  });
}

function flattenTree(
  node: TreeNode,
  parentId: string | null,
  side: 'left' | 'right',
  outNodes: any[],
  outEdges: any[]
) {
  let type = 'customClass';
  if (node.type === 'root') {
    type = 'customClass';
  } else if (node.type === 'directory') {
    type = 'customDirectory';
  } else if (node.type === 'property' || node.type === 'method' || node.type === 'more') {
    type = 'customLeaf';
  }

  outNodes.push({
    id: node.id,
    type,
    position: { x: node.x ?? 0, y: node.y ?? 0 },
    data: {
      name: node.name,
      filePath: node.filePath,
      isRoot: node.type === 'root',
      isMethod: node.type === 'method',
      isMore: node.type === 'more',
      nameOnly: node.nameOnly,
      isHighlighted: node.isHighlighted,
      isVulnerable: node.classData?.isVulnerable || false,
      branchColor: node.branchColor,
      depth: node.depth,
      ...(node.classData || {})
    }
  });

  if (parentId) {
    const isLeafEdge = node.type === 'property' || node.type === 'method' || node.type === 'more';
    const color = node.branchColor || '#7C3AED';
    outEdges.push({
      id: `edge-${parentId}-${node.id}`,
      source: parentId,
      target: node.id,
      type: 'smoothstep',
      style: {
        stroke: color + (isLeafEdge ? '55' : 'bb'),
        strokeWidth: isLeafEdge ? 1.0 : (node.type === 'directory' ? 2.2 : 1.5),
        strokeDasharray: isLeafEdge ? '4,4' : undefined,
        opacity: isLeafEdge ? 0.7 : 0.85
      }
    });
  }

  // IF THE NODE IS COLLAPSED, DO NOT FLATTEN ITS CHILDREN!
  if (node.type === 'directory' && !expandedNodes.value.has(node.id)) {
    return;
  }

  node.children.forEach(child => {
    flattenTree(child, node.id, side, outNodes, outEdges);
  });
}

function buildClassGraph(rawNodes: any[]) {
  if (!rawNodes.length) return { nodes: [], edges: [] };

  const rootNode = buildClassTree(rawNodes, activeNodeId.value, activeLeafName.value, props.initialEdges);

  rootNode.children.forEach((child, index) => {
    const branchColor = COLORS[index % COLORS.length];
    const assignBranchColors = (n: TreeNode, col: string) => {
      n.branchColor = col;
      n.children.forEach(c => assignBranchColors(c, col));
    };
    assignBranchColors(child, branchColor);
  });

  measureNodeHeight(rootNode);

  const leftChildren: TreeNode[] = [];
  const rightChildren: TreeNode[] = [];

  const countDescendants = (n: TreeNode): number => {
    let count = 1;
    n.children.forEach(c => count += countDescendants(c));
    return count;
  };

  const sortedRootChildren = [...rootNode.children].sort((a, b) => {
    return countDescendants(b) - countDescendants(a);
  });

  let leftWeight = 0;
  let rightWeight = 0;

  sortedRootChildren.forEach(child => {
    const w = countDescendants(child);
    if (leftWeight <= rightWeight) {
      leftChildren.push(child);
      leftWeight += w;
    } else {
      rightChildren.push(child);
      rightWeight += w;
    }
  });

  const outN: any[] = [];
  const outE: any[] = [];

  rootNode.x = -ROOT_W / 2;
  rootNode.y = -NODE_H / 2;

  outN.push({
    id: rootNode.id,
    type: 'customClass',
    position: { x: rootNode.x, y: rootNode.y },
    data: {
      name: rootNode.name,
      isRoot: true,
      branchColor: '#7C3AED',
      isVulnerable: rootNode.classData?.isVulnerable || false
    }
  });

  const GRP_GAP_TREE = 40;

  if (rightChildren.length > 0) {
    let totalRightHeight = 0;
    rightChildren.forEach((child, index) => {
      totalRightHeight += child.subtreeHeight;
      if (index < rightChildren.length - 1) {
        totalRightHeight += GRP_GAP_TREE;
      }
    });
    let rightStartY = -totalRightHeight / 2;
    rightChildren.forEach(child => {
      const childX = ROOT_W / 2 + COL_GAP;
      const childY = rightStartY + child.subtreeHeight / 2;
      positionSubtree(child, childX, childY, 'right');
      rightStartY += child.subtreeHeight + GRP_GAP_TREE;
    });
  }

  if (leftChildren.length > 0) {
    let totalLeftHeight = 0;
    leftChildren.forEach((child, index) => {
      totalLeftHeight += child.subtreeHeight;
      if (index < leftChildren.length - 1) {
        totalLeftHeight += GRP_GAP_TREE;
      }
    });
    let leftStartY = -totalLeftHeight / 2;
    leftChildren.forEach(child => {
      const childX = -ROOT_W / 2 - COL_GAP - child.width;
      const childY = leftStartY + child.subtreeHeight / 2;
      positionSubtree(child, childX, childY, 'left');
      leftStartY += child.subtreeHeight + GRP_GAP_TREE;
    });
  }

  leftChildren.forEach(child => {
    flattenTree(child, rootNode.id, 'left', outN, outE);
  });

  rightChildren.forEach(child => {
    flattenTree(child, rootNode.id, 'right', outN, outE);
  });

  const nodeIds = new Set(outN.map(n => n.id));
  props.initialEdges.forEach(e => {
    if (nodeIds.has(e.source) && nodeIds.has(e.target)) {
      const type = e.data?.type || 'uses';
      let strokeColor = '#8F9CAE';
      let strokeWidth = 1.2;
      let strokeDash = undefined;
      
      if (type === 'extends') {
        strokeColor = '#FFB800';
        strokeWidth = 1.6;
      } else if (type === 'implements') {
        strokeColor = '#00E0FF';
        strokeWidth = 1.6;
      } else if (type === 'uses') {
        strokeDash = '5,5';
      }

      outE.push({
        id: e.id,
        source: e.source,
        target: e.target,
        type: 'smoothstep',
        style: {
          stroke: strokeColor,
          strokeWidth,
          strokeDasharray: strokeDash,
          opacity: 0.85
        },
        data: e.data
      });
    }
  });

  if (activeNodeId.value && activeLeafName.value) {
    const activeLeafNode = outN.find(n =>
      n.id.startsWith(activeNodeId.value + '-') &&
      (n.id.endsWith('-prop-' + activeLeafName.value) || n.id.endsWith('-meth-' + activeLeafName.value))
    );
    
    if (activeLeafNode) {
      outN.forEach(n => {
        if (n.id !== activeLeafNode.id &&
            (n.id.endsWith('-prop-' + activeLeafName.value) || n.id.endsWith('-meth-' + activeLeafName.value)) &&
            n.type === 'customLeaf') {
          outE.push({
            id: `leaf-link-${activeLeafNode.id}-${n.id}`,
            source: activeLeafNode.id,
            target: n.id,
            type: 'smoothstep',
            style: {
              stroke: '#00E0FF',
              strokeWidth: 2.2,
              strokeDasharray: '4,4',
              opacity: 1.0
            }
          });
        }
      });
    }
  }

  return { nodes: outN, edges: outE };
}

// ──────────────────────────────────────────────
// Directory-tree graph builder (recursive)
// ──────────────────────────────────────────────
let _dtId = 0;
function measureTree(node: any): number {
  if (!node.children?.length || !expandedNodes.value.has(node._id)) { node._h = NODE_H; return NODE_H; }
  let h = 0;
  node.children.forEach((c: any) => { h += measureTree(c) + ROW_GAP; });
  h = Math.max(NODE_H, h - ROW_GAP);
  node._h = h;
  return h;
}
function placeTree(node: any, x: number, cy: number, depth: number, outN: any[], outE: any[]) {
  node._id = node._id || `dt-${_dtId++}`;
  const isExpanded = expandedNodes.value.has(node._id);
  outN.push({
    id: node._id, type: depth === 0 ? 'customClass' : (node.isLeaf ? 'customClass' : 'customDirectory'),
    position: { x, y: cy - NODE_H / 2 },
    data: { ...node, depth, branchColor: COLORS[depth % COLORS.length] },
  });
  if (!node.children?.length || !isExpanded) return;
  const col  = x + NODE_W + COL_GAP;
  let   curY = cy - node._h / 2;
  node.children.forEach((c: any) => {
    const ccy = curY + c._h / 2;
    outE.push({
      id: `de-${node._id}-${c._id || `dt-${_dtId}`}`,
      source: node._id, target: c._id || `dt-${_dtId}`,
      type: 'smoothstep',
      style: { stroke: COLORS[depth % COLORS.length] + '99', strokeWidth: 1.5 },
    });
    placeTree(c, col, ccy, depth + 1, outN, outE);
    curY += c._h + ROW_GAP;
  });
}
function buildDirGraph(root: any) {
  if (!root) return { nodes: [], edges: [] };
  _dtId = 0; measureTree(root);
  const outN: any[] = [], outE: any[] = [];
  placeTree(root, 0, root._h / 2, 0, outN, outE);
  return { nodes: outN, edges: outE };
}

// ──────────────────────────────────────────────
// G6 Interactive Setup & Lifecycle
// ──────────────────────────────────────────────
const activeNodeId   = ref<string | null>(null);
const activeLeafName = ref<string | null>(null);
const relatedNodeIds = ref<Set<string>>(new Set());

const searchQuery = ref('');
const layersMenuOpen = ref(false);

const toggleLayersMenu = () => {
  layersMenuOpen.value = !layersMenuOpen.value;
};

const selectLayer = (layout: 'mindmap' | 'neural') => {
  switchLayout(layout);
  layersMenuOpen.value = false;
};

const closeLayersMenu = (e: MouseEvent) => {
  const target = e.target as HTMLElement;
  if (!target.closest('.google-layers-switcher')) {
    layersMenuOpen.value = false;
  }
};

const allSearchableItems = computed(() => {
  const items: Array<{ id: string; name: string; type: 'class' | 'directory'; detail: string }> = [];
  
  props.initialNodes.forEach((n: any) => {
    if (n.data?.name) {
      items.push({
        id: n.id,
        name: n.data.name,
        type: 'class',
        detail: n.data.filePath || ''
      });
    }
  });
  
  const dirs = new Set<string>();
  props.initialNodes.forEach((n: any) => {
    const fp = (n.data?.filePath || n.filePath || '').replace(/\\/g, '/');
    const parts = fp.split('/');
    let pathAccumulator = '';
    const dirParts = parts.slice(0, -1);
    dirParts.forEach((part: string) => {
      pathAccumulator = pathAccumulator ? `${pathAccumulator}/${part}` : part;
      dirs.add(pathAccumulator);
    });
  });
  
  dirs.forEach(dirPath => {
    const name = dirPath.split('/').pop() || dirPath;
    items.push({
      id: `dir-${dirPath}`,
      name: name,
      type: 'directory',
      detail: dirPath
    });
  });
  
  return items;
});

const querySearch = (queryString: string, cb: any) => {
  const query = queryString.toLowerCase().trim();
  const results = query
    ? allSearchableItems.value.filter(item => 
        item.name.toLowerCase().includes(query) || 
        item.detail.toLowerCase().includes(query)
      )
    : allSearchableItems.value.slice(0, 5);
  cb(results);
};

const handleSearchSelect = (item: any) => {
  if (item.type === 'class') {
    focusNode(item.id);
  } else if (item.type === 'directory') {
    expandedNodes.value.add(item.id);
    applyLayout(props.initialNodes);
    
    nextTick(() => {
      const g6Item = graph.findById(item.id);
      if (g6Item) {
        graph.focusItem(g6Item, true, {
          easing: 'easeCubic',
          duration: 500,
        });
        activeNodeId.value = null;
        emit('select-node', item.id);
      }
    });
  }
};

const focusNode = (nodeId: string) => {
  if (!graph) return;
  
  expandParentsForClass(nodeId);
  applyLayout(props.initialNodes);
  
  nextTick(() => {
    const item = graph.findById(nodeId);
    if (item) {
      highlightNode(nodeId);
      
      graph.focusItem(item, true, {
        easing: 'easeCubic',
        duration: 500,
      });
    }
  });
};

const focusVulnerabilities = () => {
  if (store.vulnerableNodes && store.vulnerableNodes.length > 0) {
    focusNode(store.vulnerableNodes[0]);
  }
};

function initInitialExpansion(rawNodes: any[]) {
  expandedNodes.value.clear();
  expandedNodes.value.add('mm-root');
  
  if (!rawNodes || rawNodes.length === 0) return;
  
  if (props.mode === 'directory') {
    const root = rawNodes[0];
    buildDirGraph(root);
    expandedNodes.value.add(root._id);
    
    const queue: any[] = [];
    if (root.children) queue.push(...root.children);
    
    let totalNodes = 1 + (root.children?.length || 0) + (root.files?.length || 0);
    
    while (queue.length > 0 && totalNodes < MAX_DEFAULT_NODES) {
      const current = queue.shift();
      if (current && current.isFolder) {
        expandedNodes.value.add(current._id);
        totalNodes += (current.children?.length || 0) + (current.files?.length || 0);
        if (current.children) {
          queue.push(...current.children);
        }
      }
    }
  } else {
    const rootTree = buildClassTree(rawNodes, null, null, []);
    
    const queue: TreeNode[] = [];
    if (rootTree.children) queue.push(...rootTree.children);
    
    let totalNodes = 1 + rootTree.children.length;
    
    while (queue.length > 0 && totalNodes < MAX_DEFAULT_NODES) {
      const current = queue.shift();
      if (current && current.type === 'directory') {
        expandedNodes.value.add(current.id);
        totalNodes += current.children.length;
        queue.push(...current.children);
      }
    }
  }
}

let viewportTimeout: any = null;
const handleViewportChange = () => {
  if (viewportTimeout) clearTimeout(viewportTimeout);
  viewportTimeout = setTimeout(() => {
    if (!graph || !props.initialNodes?.length) return;
    if (activeNodeId.value) return; // Disable zoom rule when a node is selected
    if (!autoLOD.value) return; // Disable zoom rule when auto LOD is off
    
    const width = graph.getWidth();
    const height = graph.getHeight();
    const zoom = graph.getZoom();
    
    const minPoint = graph.getPointByCanvas(0, 0);
    const maxPoint = graph.getPointByCanvas(width, height);
    
    const padX = 180;
    const padY = 120;
    const minX = minPoint.x - padX;
    const maxX = maxPoint.x + padX;
    const minY = minPoint.y - padY;
    const maxY = maxPoint.y + padY;
    
    let changed = false;
    
    const g6Nodes = graph.getNodes();
    g6Nodes.forEach((node: any) => {
      const model = node.getModel();
      const nodeType = model.nodeType ?? model.data?.nodeType;
      if (nodeType === 'directory') {
        const { x, y } = model;
        const isVisible = (x >= minX && x <= maxX && y >= minY && y <= maxY);
        const nodeDepth = model.folderDepth ?? model.data?.depth ?? model.depth ?? 0;
        const isExpanded = expandedNodes.value.has(model.id);
        
        let shouldBeExpanded = isExpanded;
        
        if (zoom > 0.7) {
          // Zoomed in close: expand visible directories
          if (isVisible) {
            shouldBeExpanded = true;
          }
        } else if (zoom > 0.5) {
          // Moderate zoom: expand visible depth <= 2, collapse depth >= 3
          if (nodeDepth >= 3) {
            shouldBeExpanded = false;
          } else if (isVisible && nodeDepth <= 2) {
            shouldBeExpanded = true;
          }
        } else if (zoom > 0.3) {
          // Low zoom: expand visible depth <= 1, collapse depth >= 2
          if (nodeDepth >= 2) {
            shouldBeExpanded = false;
          } else if (isVisible && nodeDepth <= 1) {
            shouldBeExpanded = true;
          }
        } else {
          // Zoomed out far: collapse all directories
          if (nodeDepth >= 1) {
            shouldBeExpanded = false;
          }
        }
        
        if (shouldBeExpanded !== isExpanded) {
          if (shouldBeExpanded) {
            expandedNodes.value.add(model.id);
          } else {
            expandedNodes.value.delete(model.id);
          }
          changed = true;
        }
      }
    });
    
    if (changed) {
      expandedNodes.value = new Set(expandedNodes.value);
      applyLayout(props.initialNodes);
    }
  }, 200);
};

function expandParentsForClass(classId: string) {
  const node = props.initialNodes.find(x => x.id.toLowerCase() === classId.toLowerCase());
  if (!node) return;
  const filePath = node.data?.filePath || node.filePath;
  if (!filePath) return;

  const fp = filePath.replace(/\\/g, '/');
  const parts = fp.split('/');
  let pathAccumulator = '';
  const dirParts = parts.slice(0, -1);

  dirParts.forEach((part: string) => {
    pathAccumulator = pathAccumulator ? `${pathAccumulator}/${part}` : part;
    expandedNodes.value.add(`dir-${pathAccumulator}`);
  });
}

function expandRelatedFolders(classId: string) {
  const keepers = new Set<string>();
  keepers.add('mm-root');
  
  const collectParents = (id: string) => {
    const node = props.initialNodes.find(x => x.id.toLowerCase() === id.toLowerCase());
    if (!node) return;
    const filePath = node.data?.filePath || node.filePath;
    if (!filePath) return;
    const fp = filePath.replace(/\\/g, '/');
    const parts = fp.split('/');
    let pathAccumulator = '';
    const dirParts = parts.slice(0, -1);
    dirParts.forEach((part: string) => {
      pathAccumulator = pathAccumulator ? `${pathAccumulator}/${part}` : part;
      keepers.add(`dir-${pathAccumulator}`);
    });
  };

  collectParents(classId);

  if (activeLeafName.value) {
    props.initialNodes.forEach(n => {
      const hasProp = n.data?.properties?.some((p: any) => p.name === activeLeafName.value);
      const hasMeth = n.data?.methods?.some((m: any) => m.name === activeLeafName.value);
      if (hasProp || hasMeth) {
        collectParents(n.id);
      }
    });
  }

  const relatedIds = new Set<string>();
  const activeLower = classId.toLowerCase();
  props.initialEdges.forEach(e => {
    if (e.source.toLowerCase() === activeLower) {
      relatedIds.add(e.target);
    } else if (e.target.toLowerCase() === activeLower) {
      relatedIds.add(e.source);
    }
  });

  relatedIds.forEach(relId => {
    collectParents(relId);
  });

  expandedNodes.value = keepers;
}

const vis = (v: string) => v === 'private' ? '−' : v === 'protected' ? '#' : '+';

function highlightNode(classId: string) {
  const n = props.initialNodes.find(x => x.id.toLowerCase() === classId.toLowerCase());
  if (!n) return;
  if (activeNodeId.value === n.id) return;
  activeNodeId.value = n.id;
  emit('select-class', n.data);
}

function clearHighlight() {
  activeNodeId.value = null;
  activeLeafName.value = null;
  relatedNodeIds.value = new Set();
  store.setSelectedMethod('');
  store.setHoveredMethod('');
}

function computeRelatedNodes() {
  relatedNodeIds.value = new Set();
  if (activeNodeId.value) {
    const activeId = activeNodeId.value;
    props.initialEdges.forEach(e => {
      if (e.source.toLowerCase() === activeId.toLowerCase()) {
        relatedNodeIds.value.add(e.target);
      } else if (e.target.toLowerCase() === activeId.toLowerCase()) {
        relatedNodeIds.value.add(e.source);
      }
    });
  }
}

async function applyLayout(raw: any[]) {
  if (!raw?.length) {
    if (graph) graph.clear();
    return;
  }

  computeRelatedNodes();

  const res = props.mode === 'directory' ? buildDirGraph(raw[0]) : buildClassGraph(raw);
  
  // Convert layout nodes to G6 schema
  const g6Nodes = res.nodes.map(n => {
    const isNodeActive = activeNodeId.value === n.id;
    const isNodeRelated = relatedNodeIds.value.has(n.id);
    const isDimmed = activeNodeId.value && !isNodeActive && !isNodeRelated && n.id !== 'mm-root';

    let relType: string | undefined = undefined;
    if (isNodeRelated && activeNodeId.value) {
      const activeId = activeNodeId.value.toLowerCase();
      const edge = props.initialEdges.find(e => 
        (e.source.toLowerCase() === activeId && e.target.toLowerCase() === n.id.toLowerCase()) ||
        (e.target.toLowerCase() === activeId && e.source.toLowerCase() === n.id.toLowerCase())
      );
      if (edge) {
        relType = edge.data?.type || 'uses';
      }
    }

    let nodeType = 'class';
    if (n.type === 'customDirectory') nodeType = 'directory';
    else if (n.type === 'customLeaf') nodeType = 'leaf';

    return {
      id: n.id,
      // In custom tree mode, nodes are centered on their coordinates
      x: n.position.x + (n.data?.width || 200) / 2,
      y: n.position.y + (n.data?.height || 42) / 2,
      name: n.data.name,
      filePath: n.data.filePath,
      nodeType,
      isRoot: n.data.isRoot,
      isMethod: n.data.isMethod,
      isMore: n.data.isMore,
      nameOnly: n.data.nameOnly,
      isHighlighted: n.data.isHighlighted || isNodeActive,
      isExpanded: expandedNodes.value.has(n.id),
      isDimmed,
      relType,
      branchColor: n.data.branchColor,
      width: n.data.width || (nodeType === 'leaf' ? 160 : 200),
      height: n.data.height || (nodeType === 'leaf' ? 26 : 42),
      folderDepth: n.data?.depth ?? n.depth ?? 0,
      depth: n.data?.depth ?? n.depth ?? 0,
      data: n.data,
    };
  });

  const g6Edges = res.edges.map(e => {
    const isLeafEdge = e.id.includes('-prop-') || e.id.includes('-meth-') || e.id.includes('-more');
    const isLeafLink = e.id.startsWith('leaf-link-');
    
    let isRel = true;
    if (activeNodeId.value) {
      if (isLeafLink) {
        isRel = true;
      } else if (isLeafEdge) {
        if (activeLeafName.value) {
          const hasMatchingLeafNode = e.target.endsWith('-prop-' + activeLeafName.value) || e.target.endsWith('-meth-' + activeLeafName.value);
          isRel = hasMatchingLeafNode && (e.source === activeNodeId.value || relatedNodeIds.value.has(e.source));
        } else {
          isRel = (e.source === activeNodeId.value);
        }
      } else {
        const isTreeEdgeForActive = e.source === activeNodeId.value || e.target === activeNodeId.value || 
                                    e.source === 'mm-root' || e.target === 'mm-root';
        const isRelationshipEdgeForActive = 
          (e.source.toLowerCase() === activeNodeId.value.toLowerCase() || e.target.toLowerCase() === activeNodeId.value.toLowerCase()) && 
          !e.id.startsWith('edge-');
        isRel = isTreeEdgeForActive || isRelationshipEdgeForActive;
      }
    }

    const color = e.style?.stroke || '#8F9CAE';
    const lineDash = e.style?.strokeDasharray ? [4, 4] : undefined;

    // Determine target markers/arrows for inheritance and implementations
    let endArrow: any = undefined;
    const isUmlRel = !e.id.startsWith('edge-') && e.data?.type;
    if (isUmlRel && isRel) {
      const type = e.data.type;
      const markerColor = type === 'extends' ? '#FFB800' : (type === 'implements' ? '#00E0FF' : '#8F9CAE');
      endArrow = {
        path: G6.Arrow.triangle(8, 8, 4),
        fill: markerColor,
        stroke: markerColor,
      };
    }

    return {
      id: e.id,
      source: e.source,
      target: e.target,
      // cubic-horizontal for folder structure branches, line for logical references
      type: e.id.startsWith('edge-') ? 'cubic-horizontal' : 'line',
      style: {
        stroke: color,
        lineWidth: isRel ? (isLeafLink ? 2.2 : 2.0) : 0.8,
        lineDash,
        opacity: isRel ? 0.85 : 0.08,
        endArrow,
      },
    };
  });

  if (graph) {
    if (currentLayoutMode.value === 'neural' && props.mode === 'class') {
      // In force-directed neural mode, strip coordinates and let G6 solve positions
      const forceNodes = g6Nodes.map(n => ({
        ...n,
        x: undefined,
        y: undefined,
        // Make nodes slightly smaller in force layout
        width: 140,
        height: 34,
      }));
      graph.changeData({ nodes: forceNodes, edges: g6Edges });
    } else {
      graph.changeData({ nodes: g6Nodes, edges: g6Edges });
      if (isInitialLoad) {
        graph.fitView(40);
        isInitialLoad = false;
      }
    }
  }
}

const switchLayout = (newLayout: 'mindmap' | 'neural') => {
  currentLayoutMode.value = newLayout;
  if (!graph) return;

  if (newLayout === 'neural') {
    graph.updateLayout({
      type: 'force',
      preventOverlap: true,
      nodeSpacing: (node: any) => {
        const nodeType = node.nodeType ?? node.data?.nodeType;
        if (nodeType === 'directory') return 30; // Extra padding for directories
        if (nodeType === 'leaf') return 8;       // Tight padding for leaves
        return 20;                              // Padding for classes
      },
      linkDistance: (edge: any) => {
        const src = edge.source || '';
        const tgt = edge.target || '';
        
        const isSrcDir = src.startsWith('dir-') || src.startsWith('dt-') || src === 'mm-root';
        const isTgtDir = tgt.startsWith('dir-') || tgt.startsWith('dt-') || tgt === 'mm-root';
        
        const isSrcLeaf = src.includes('-prop-') || src.includes('-meth-') || src.includes('-more');
        const isTgtLeaf = tgt.includes('-prop-') || tgt.includes('-meth-') || tgt.includes('-more');
        
        if (isSrcDir && isTgtDir) {
          return 220; // Directory-to-directory: main trunk / long branches
        } else if (isSrcLeaf || isTgtLeaf) {
          return 45;  // Leaf nodes: short twigs close to class
        } else if (isSrcDir || isTgtDir) {
          return 120; // Directory-to-class: branch
        } else {
          return 160; // Class-to-class relationships
        }
      },
      nodeStrength: (node: any) => {
        const nodeType = node.nodeType ?? node.data?.nodeType;
        if (node.id === 'mm-root') return -800;    // Center project root repels very strongly
        if (nodeType === 'directory') return -400; // Folders repel strongly to separate branches
        if (nodeType === 'leaf') return -30;       // Leaves have very low repulsion
        return -150;                               // Classes have moderate repulsion
      },
      edgeStrength: (edge: any) => {
        const src = edge.source || '';
        const tgt = edge.target || '';
        
        const isSrcDir = src.startsWith('dir-') || src.startsWith('dt-') || src === 'mm-root';
        const isTgtDir = tgt.startsWith('dir-') || tgt.startsWith('dt-') || tgt === 'mm-root';
        
        const isSrcLeaf = src.includes('-prop-') || src.includes('-meth-') || src.includes('-more');
        const isTgtLeaf = tgt.includes('-prop-') || tgt.includes('-meth-') || tgt.includes('-more');
        
        if (isSrcLeaf || isTgtLeaf) {
          return 1.0;  // Leaf nodes strictly hug their parent class
        } else if (isSrcDir && isTgtDir) {
          return 0.8;  // Directory trunk edges are structural
        } else if (isSrcDir || isTgtDir) {
          return 0.6;  // Class-directory edges are moderately strong
        } else {
          return 0.15; // Weak relationship edges so clusters don't pull each other together
        }
      },
      nodeSize: [140, 34],
    });
  } else {
    // Disable force physics simulation
    graph.updateLayout({
      type: undefined,
    });
  }
  applyLayout(props.initialNodes);
};

const initG6Graph = () => {
  if (!graphContainer.value) return;

  const width = graphContainer.value.clientWidth || 800;
  const height = graphContainer.value.clientHeight || 550;

  const isDark = document.documentElement.classList.contains('dark');

  graph = new G6.Graph({
    container: graphContainer.value,
    width,
    height,
    fitView: true,
    fitViewPadding: 40,
    modes: {
      default: ['drag-canvas', 'zoom-canvas', 'drag-node'],
    },
    defaultNode: {
      type: 'custom-g6-node',
    },
    defaultEdge: {
      type: 'cubic-horizontal',
      style: {
        stroke: isDark ? '#475569' : '#CBD5E1',
        lineWidth: 1.5,
      },
    },
  });

  // G6 Event Listeners
  graph.on('node:click', (evt: any) => {
    const item = evt.item;
    if (!item) return;
    const model = item.getModel() as any;
    
    if (model.nodeType === 'leaf') {
      if (model.isMore) return;
      const nameOnly = model.nameOnly;
      if (nameOnly) {
        activeLeafName.value = activeLeafName.value === nameOnly ? null : nameOnly;
      }
    } else if (model.nodeType === 'class') {
      if (model.isRoot) {
        clearHighlight();
        emit('select-class', null);
      } else {
        activeLeafName.value = null;
        highlightNode(model.id);
        expandRelatedFolders(model.id);
      }
    } else if (model.nodeType === 'directory') {
      clearHighlight();
      emit('select-node', model.data);
      
      // Toggle expand/collapse state
      if (expandedNodes.value.has(model.id)) {
        expandedNodes.value.delete(model.id);
      } else {
        expandedNodes.value.add(model.id);
      }
      expandedNodes.value = new Set(expandedNodes.value);
      applyLayout(props.initialNodes);
    }
  });

  graph.on('node:dblclick', (evt: any) => {
    const item = evt.item;
    if (!item) return;
    const model = item.getModel() as any;
    
    if (model.nodeType === 'directory') {
      enterDirectory(model.data);
    } else if (model.nodeType === 'class') {
      openErdChart(model.data);
    }
  });

  graph.on('canvas:click', () => {
    clearHighlight();
    emit('select-class', null);
    emit('select-node', null);
  });

  graph.on('viewportchange', () => {
    handleViewportChange();
  });

  graph.on('canvas:dragend', () => {
    handleViewportChange();
  });

  // Drag-descendants feature (drag parent moves children)
  let dragStartPos: { x: number, y: number } | null = null;
  let childStartPositions: Array<{ item: any, x: number, y: number }> = [];

  function getDescendantIds(g: any, parentId: string): string[] {
    const descendants: string[] = [];
    const queue = [parentId];
    while (queue.length > 0) {
      const currId = queue.shift()!;
      const edges = g.getEdges();
      edges.forEach((edge: any) => {
        const model = edge.getModel();
        const isStructural = model.id.startsWith('edge-') || model.id.startsWith('de-');
        if (isStructural && model.source === currId) {
          descendants.push(model.target);
          queue.push(model.target);
        }
      });
    }
    return descendants;
  }

  graph.on('node:dragstart', (evt: any) => {
    const item = evt.item;
    if (!item) return;
    const model = item.getModel();
    dragStartPos = { x: evt.x, y: evt.y };
    
    const descendantIds = getDescendantIds(graph, model.id);
    childStartPositions = [];
    descendantIds.forEach((id: string) => {
      const childItem = graph.findById(id);
      if (childItem) {
        const childModel = childItem.getModel();
        childStartPositions.push({
          item: childItem,
          x: childModel.x,
          y: childModel.y
        });
      }
    });
  });

  graph.on('node:drag', (evt: any) => {
    if (!dragStartPos || !childStartPositions.length) return;
    const dx = evt.x - dragStartPos.x;
    const dy = evt.y - dragStartPos.y;
    childStartPositions.forEach((child: any) => {
      const { item, x, y } = child;
      graph.updateItem(item, {
        x: x + dx,
        y: y + dy
      });
    });
  });

  graph.on('node:dragend', () => {
    dragStartPos = null;
    childStartPositions = [];
  });
};

// ──────────────────────────────────────────────
// Watching Props Changes
// ──────────────────────────────────────────────
watch(() => props.initialNodes, (raw) => {
  isInitialLoad = true;
  if (raw && raw.length > 0) {
    initInitialExpansion(raw);
  }
  applyLayout(raw);
}, { deep: true });

watch(() => props.initialEdges, () => {
  if (props.mode !== 'directory' && props.initialNodes?.length) {
    applyLayout(props.initialNodes);
  }
});

watch(activeNodeId, (newId) => {
  if (newId) {
    if (!savedExpandedNodes.value) {
      savedExpandedNodes.value = new Set(expandedNodes.value);
    }
    expandRelatedFolders(newId);
  } else {
    if (savedExpandedNodes.value) {
      expandedNodes.value = new Set(savedExpandedNodes.value);
      savedExpandedNodes.value = null;
    }
  }
  if (props.initialNodes?.length) applyLayout(props.initialNodes);
});

watch(activeLeafName, (newLeaf) => {
  if (store.selectedMethod !== (newLeaf || '')) {
    store.setSelectedMethod(newLeaf || '');
  }
  if (activeNodeId.value) {
    expandRelatedFolders(activeNodeId.value);
  }
  if (props.initialNodes?.length) applyLayout(props.initialNodes);
});

watch(() => store.selectedMethod, (newVal) => {
  if (activeLeafName.value !== (newVal || null)) {
    activeLeafName.value = newVal || null;
  }
});

watch(() => props.highlightClass, cls => {
  if (cls) {
    highlightNode(cls);
    expandRelatedFolders(cls);
    nextTick(() => {
      const item = graph?.findById(cls);
      if (item) {
        graph.focusItem(item, true, {
          easing: 'easeCubic',
          duration: 500,
        });
      }
    });
  } else {
    clearHighlight();
  }
});

// ──────────────────────────────────────────────
// Zoom & Fit Controls
// ──────────────────────────────────────────────
const zoomIn = () => {
  if (graph) {
    const zoom = graph.getZoom();
    const width = graph.getWidth();
    const height = graph.getHeight();
    graph.zoomTo(zoom * 1.2, { x: width / 2, y: height / 2 });
  }
};

const zoomOut = () => {
  if (graph) {
    const zoom = graph.getZoom();
    const width = graph.getWidth();
    const height = graph.getHeight();
    graph.zoomTo(zoom * 0.8, { x: width / 2, y: height / 2 });
  }
};

const resetView = () => {
  if (graph) {
    graph.fitView(40);
  }
};

const enterDirectory = (data: any) => {
  if (data.fullPath) {
    const encoded = data.fullPath.replace(/\//g, '_');
    router.push('/' + store.activeConnection + '/explorer/' + encoded);
  }
};

// ──────────────────────────────────────────────
// Fullscreen
// ──────────────────────────────────────────────
const isFullscreen = ref(false);
const toggleFullscreen = () => {
  const el = document.querySelector('.mindmap-container');
  if (!el) return;
  if (!document.fullscreenElement) {
    el.requestFullscreen().then(() => isFullscreen.value = true).catch(console.error);
  } else {
    document.exitFullscreen().then(() => isFullscreen.value = false);
  }
};

const handleWindowResize = () => {
  if (graph && graphContainer.value) {
    const width = graphContainer.value.clientWidth;
    const height = graphContainer.value.clientHeight;
    graph.changeSize(width, height);
  }
  if (erdVisible.value) drawErdLines();
};

let _resizeObs: ResizeObserver | null = null;

onMounted(() => {
  initG6Graph();

  if (props.initialNodes?.length) {
    if (expandedNodes.value.size === 1 && expandedNodes.value.has('mm-root')) {
      initInitialExpansion(props.initialNodes);
    }
  }

  applyLayout(props.initialNodes);

  // ResizeObserver to handle container size changes (e.g. when tab becomes active)
  if (graphContainer.value) {
    _resizeObs = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (width > 0 && height > 0 && graph) {
          graph.changeSize(width, height);
          graph.fitView(40);
        }
      }
    });
    _resizeObs.observe(graphContainer.value);
  }

  _themeObs = new MutationObserver(() => {
    isDarkRef.value = document.documentElement.classList.contains('dark');
    if (graph) {
      applyLayout(props.initialNodes);
    }
  });
  _themeObs.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });

  document.addEventListener('fullscreenchange', () => { isFullscreen.value = !!document.fullscreenElement; });
  window.addEventListener('resize', handleWindowResize);
  window.addEventListener('click', closeLayersMenu);
});

onUnmounted(() => {
  _themeObs?.disconnect();
  _resizeObs?.disconnect();
  document.removeEventListener('fullscreenchange', () => {});
  window.removeEventListener('resize', handleWindowResize);
  window.removeEventListener('click', closeLayersMenu);
  if (graph) {
    graph.destroy();
  }
});

// ──────────────────────────────────────────────
// ERD Dialog (Standard HTML/SVG rendering)
// ──────────────────────────────────────────────
const erdVisible    = ref(false);
const erdClass      = ref<any>(null);
const erdParents    = ref<any[]>([]);
const erdDependents = ref<any[]>([]);
const erdLines      = ref('');

const openErdChart = (data: any) => {
  if (props.mode === 'directory') { if (data?.classData) data = data.classData; else return; }
  erdClass.value = data;
  const parents: any[] = [];
  if (data.baseClass) {
    const pn = props.initialNodes.find(n => n.id.toLowerCase() === data.baseClass.toLowerCase());
    parents.push(pn ? { ...pn.data, isInterface: false } : { name: data.baseClass, properties: [], methods: [], isInterface: false });
  }
  data.implementsList?.forEach((impl: string) => {
    const pn = props.initialNodes.find(n => n.id.toLowerCase() === impl.toLowerCase());
    parents.push(pn ? { ...pn.data, isInterface: true } : { name: impl, properties: [], methods: [], isInterface: true });
  });
  erdParents.value = parents;
  const deps: any[] = [];
  props.initialNodes.forEach(n => {
    const d = n.data?.classData || n.data;
    if (d?.name && d.name.toLowerCase() !== data.name.toLowerCase())
      if (d.baseClass?.toLowerCase() === data.name.toLowerCase() ||
          d.dependencies?.some((x: string) => x.toLowerCase() === data.name.toLowerCase()))
        deps.push(d);
  });
  erdDependents.value = deps;
  erdVisible.value = true;
  nextTick(() => setTimeout(drawErdLines, 300));
};

const drawErdLines = () => {
  if (!erdClass.value) return;
  const tEl = document.getElementById(`erd-${erdClass.value.name}`);
  const con  = document.querySelector('.erd-layout');
  if (!tEl || !con) return;
  const cr = con.getBoundingClientRect(), tr = tEl.getBoundingClientRect();
  const tx = tr.left - cr.left, ty = tr.top - cr.top + tr.height / 2;
  let html = '';
  erdParents.value.forEach(p => {
    const el = document.getElementById(`erd-${p.name}`); if (!el) return;
    const pr = el.getBoundingClientRect();
    const px = pr.left - cr.left + pr.width, py = pr.top - cr.top + pr.height / 2;
    html += `<path d="M${px} ${py} Q${(px+tx)/2} ${(py+ty)/2} ${tx} ${ty}" fill="none" stroke="var(${p.isInterface ? '--interface-color' : '--extends-color'})" stroke-width="2" marker-end="url(#arrow)"/>`;
  });
  erdDependents.value.forEach(d => {
    const el = document.getElementById(`erd-${d.name}`); if (!el) return;
    const dr = el.getBoundingClientRect();
    const dx = dr.left - cr.left, dy = dr.top - cr.top + dr.height / 2;
    html += `<path d="M${tx + tr.width} ${ty} Q${(tx + tr.width + dx)/2} ${(ty+dy)/2} ${dx} ${dy}" fill="none" stroke="var(--uses-color)" stroke-dasharray="5,5" stroke-width="2" marker-end="url(#arrow)"/>`;
  });
  erdLines.value = html;
};

</script>

<style scoped>
/* ── Container ── */
.google-mindmap-container {
  display: flex;
  flex-direction: column;
  height: 100%;
  width: 100%;
  position: relative;
  overflow: hidden;
}

/* ── Google Maps Style UI Layout ── */
.google-search-container {
  position: absolute;
  top: 20px;
  left: 20px;
  z-index: 100;
  display: flex;
  align-items: center;
  gap: 12px;
  max-width: 250px;
  width: calc(100% - 40px);
}

.search-box-card {
  background: var(--el-bg-color-page);
  border: 1px solid var(--el-border-color);
  border-radius: 8px;
  box-shadow: 0 4px 18px rgba(0, 0, 0, 0.15);
  padding: 4px;
  flex: 1;
  display: flex;
  align-items: center;
}

/* :global(html.dark) .search-box-card {
  background: rgba(30, 41, 59, 0.8) !important;
  backdrop-filter: blur(12px);
  border-color: rgba(255, 255, 255, 0.08) !important;
  box-shadow: 0 4px 24px rgba(0, 0, 0, 0.45) !important;
} */

.google-search-input {
  width: 100%;
}

.google-search-input :deep(.el-input__wrapper) {
  background: transparent !important;
  box-shadow: none !important;
  padding: 4px 12px !important;
}

.google-search-input :deep(.el-input__inner) {
  font-size: 0.9rem;
  font-family: inherit;
  color: var(--text-primary);
}

.search-icon {
  font-size: 1.1rem;
  color: var(--text-muted, #94a3b8);
}

.search-result-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 0;
}

.result-icon {
  font-size: 1.2rem;
  flex-shrink: 0;
}

.result-meta {
  display: flex;
  flex-direction: column;
  line-height: 1.3;
}

.result-name {
  font-weight: 600;
  color: var(--text-primary);
  font-size: 0.85rem;
}

.result-detail {
  font-size: 0.72rem;
  color: var(--text-muted);
}

/* Quick Filter Pills */
.google-quick-filters {
  display: flex;
  gap: 8px;
  flex-shrink: 0;
}

.filter-pill {
  cursor: pointer;
  font-weight: 600;
  font-size: 0.78rem;
  transition: all 0.2s;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  border: 1px solid transparent;
}

.filter-pill:hover {
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
}

/* Google Maps Switcher */
.google-layers-switcher {
  position: absolute;
  bottom: 20px;
  left: 20px;
  z-index: 100;
  display: flex;
  flex-direction: column-reverse;
  align-items: flex-start;
  gap: 10px;
}

.layers-button {
  width: 80px;
  height: 80px;
  background: var(--el-bg-color-page);
  border: 2px solid var(--el-border-color);
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  cursor: pointer;
  overflow: hidden;
  position: relative;
  display: flex;
  flex-direction: column;
  transition: all 0.2s;
}

/* :global(html.dark) .layers-button {
  background: #1e293b;
  border-color: #334155;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.35);
} */

.layers-button:hover {
  transform: scale(1.04);
  box-shadow: 0 6px 16px rgba(0, 0, 0, 0.25);
}

.layer-thumbnail {
  flex: 1;
  background: linear-gradient(135deg, #10b981 0%, #3b82f6 100%);
  width: 100%;
}

.layer-label {
  font-size: 0.7rem;
  font-weight: 700;
  text-align: center;
  padding: 3px 0;
  /* color: var(--el-text-color-primary); */
  /* background: rgba(0, 0, 0, 0.05); */
}

.layer-image {
  width: 100%;
  height: 60px;
  /* border-radius: 6px; */
  /* border: 2px solid transparent; */
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.5rem;
  /* background: var(--bg-secondary, #f1f5f9); */
  /* transition: all 0.2s;
  box-sizing: border-box; */
}

/* :global(html.dark) .layer-label {
  background: rgba(255, 255, 255, 0.05);
} */

.layers-popover {
  background: var(--el-bg-color-page);
  border: 1px solid var(--el-border-color);
  border-radius: 10px;
  box-shadow: 0 4px 18px rgba(0, 0, 0, 0.2);
  padding: 12px;
  width: 240px;
}

/* :global(html.dark) .layers-popover {
  background: rgba(30, 41, 59, 0.95);
  backdrop-filter: blur(8px);
  border-color: rgba(255, 255, 255, 0.08);
} */

.popover-title {
  font-size: 0.78rem;
  font-weight: 700;
  text-transform: uppercase;
  color: var(--text-muted);
  margin-bottom: 8px;
  letter-spacing: 0.03em;
}

.layer-options {
  display: flex;
  gap: 12px;
}

.layer-option {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  cursor: pointer;
  transition: all 0.2s;
}

.option-image {
  width: 100%;
  height: 60px;
  border-radius: 6px;
  border: 2px solid transparent;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.5rem;
  /* background: var(--bg-secondary, #f1f5f9); */
  transition: all 0.2s;
  box-sizing: border-box;
}

/* :global(html.dark) .option-image {
  background: #334155;
} */

.layer-option:hover .option-image {
  border-color: var(--color-brand-light);
}

.layer-option.active .option-image {
  border-color: var(--color-brand);
  box-shadow: 0 0 10px rgba(0, 224, 255, 0.25);
}

.option-label {
  font-size: 0.72rem;
  font-weight: 600;
  margin-top: 4px;
  color: var(--text-secondary);
}

.layer-option.active .option-label {
  color: var(--color-brand);
  font-weight: 700;
}

/* Google Maps style Zoom controls */
.google-zoom-controls {
  position: absolute;
  bottom: 20px;
  right: 20px;
  z-index: 100;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.google-zoom-controls :deep(.el-button) {
  margin-left: 0 !important;
}

/* ── G6 Graph Canvas container ── */
.g6-graph-container {
  flex: 1;
  width: 100%;
  height: 100%;
  min-height: 0;
  overflow: hidden;
  outline: none;
  border-radius: 20px;
}

/* ── ERD Dialog ── */
.erd-uml-dialog :deep(.el-dialog__body) { height:calc(100vh - 54px); padding:0; background:var(--bg-primary); overflow:hidden; }
.erd-layout { width:100%; height:100%; position:relative; overflow-y:auto; padding:2rem; box-sizing:border-box; }
.erd-svg    { position:absolute; top:0; left:0; width:100%; height:100%; z-index:1; pointer-events:none; }
.erd-cols   { display:grid; grid-template-columns:1fr 1fr 1fr; gap:3rem; height:100%; min-height:500px; position:relative; z-index:2; }
.erd-col    { display:flex; flex-direction:column; align-items:center; gap:1rem; }
.col-title  { font-size:.85rem; font-weight:700; color:var(--text-secondary); text-transform:uppercase; letter-spacing:.05em; border-bottom:2px solid var(--border-color); padding-bottom:8px; width:100%; text-align:center; }
.col-cards  { display:flex; flex-direction:column; gap:1.5rem; width:100%; overflow-y:auto; flex:1; padding:10px; }
.uml-card   { background:var(--bg-secondary); border:1px solid var(--border-color); border-radius:10px; width:100%; box-shadow:0 4px 20px rgba(0,0,0,.1); box-sizing:border-box; }
.uml-head   { padding:10px 14px; border-bottom:1px solid var(--border-color); display:flex; flex-direction:column; gap:2px; }
.uml-type   { font-size:.6rem; text-transform:uppercase; font-weight:700; color:var(--text-muted); }
.uml-head h4{ margin:0; font-size:.95rem; color:var(--text-primary); }
.target-card { border-color:#00E0FF; box-shadow:0 0 20px rgba(0,224,255,.15); }
.target-card .uml-head { background:rgba(0,224,255,.05); }
.uml-members{ padding:12px 14px; display:flex; flex-direction:column; gap:8px; }
.uml-sec    { font-size:.62rem; font-weight:700; color:var(--text-muted); text-transform:uppercase; letter-spacing:.02em; margin-top:4px; }
.uml-item   { font-family:monospace; font-size:.7rem; color:var(--text-secondary); }
.uml-empty  { font-size:.65rem; color:var(--text-muted); font-style:italic; }
.no-cards   { display:flex; align-items:center; justify-content:center; height:100px; border:1px dashed var(--border-color); border-radius:8px; font-style:italic; font-size:.8rem; color:var(--text-muted); }

/* ── Google Maps Focus controls ── */
.google-focus-container {
  position: absolute;
  top: 20px;
  right: 20px;
  z-index: 100;
  display: flex;
  align-items: center;
}

.google-focus-btn {
  box-shadow: 0 4px 18px rgba(0, 0, 0, 0.15);
  font-weight: 600;
  border: 1px solid var(--el-border-color) !important;
}

:global(html.dark) .google-focus-btn {
  background: #1e293b !important;
  border-color: rgba(255, 255, 255, 0.08) !important;
  color: #f8fafc !important;
}
</style>
