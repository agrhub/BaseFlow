<template>
  <div class="member-details-panel glass-panel" v-if="classData">
    <!-- Hierarchy -->
    <div class="meta-section" v-if="classData.baseClass || classData.implementsList?.length">
      <h3 class="panel-subtitle">{{ store.t('Hierarchy') }}</h3>
      <div class="hierarchy-tags">
        <el-tag 
          v-if="classData.baseClass" round
          :type="isKnownClass(classData.baseClass) ? 'warning' : 'info'" 
          :effect="isKnownClass(classData.baseClass) ? 'dark' : 'plain'" 
          :class="['htag', { 'clickable-tag': isKnownClass(classData.baseClass) }]"
          @click="isKnownClass(classData.baseClass) && $emit('navigate-to-class', classData.baseClass)"
        >
          extends {{ classData.baseClass }}
        </el-tag>
        <el-tag 
          v-for="impl in classData.implementsList" 
          :key="impl" round
          :type="isKnownClass(impl) ? 'success' : 'info'" 
          :effect="isKnownClass(impl) ? 'dark' : 'plain'" 
          :class="['htag', { 'clickable-tag': isKnownClass(impl) }]"
          @click="isKnownClass(impl) && $emit('navigate-to-class', impl)"
        >
          implements {{ impl }}
        </el-tag>
      </div>
    </div>

    <!-- Imports -->
    <div class="meta-section" v-if="classData.dependencies?.length">
      <h3 class="panel-subtitle">{{ store.t('Imports') }}</h3>
      <div class="hierarchy-tags">
        <el-tag 
          v-for="dep in classData.dependencies" 
          :key="dep" round
          :type="isKnownClass(dep) ? 'primary' : 'info'" 
          :effect="isKnownClass(dep) ? 'dark' : 'plain'" 
          :class="['htag', { 'clickable-tag': isKnownClass(dep) }]"
          @click="isKnownClass(dep) && $emit('navigate-to-class', dep)"
        >
          {{ dep }}
        </el-tag>
      </div>
    </div>

    <!-- Properties -->
    <div class="meta-section">
      <h3 class="panel-subtitle">{{ store.t('Properties') }} ({{ classData.properties?.length || 0 }})</h3>
      <div class="members-list" v-if="classData.properties?.length">
        <div v-for="prop in classData.properties" :key="prop.name" class="member-row" @click="$emit('scroll-to-member', prop.name, false)">
          <span :class="['vis-char', `vis-${prop.visibility}`]">
            {{ getVisibilityChar(prop.visibility) }}
          </span>
          <span class="member-name">{{ prop.name }}</span>
          <span class="divider">:</span>
          <span 
            :class="['member-type', { 'clickable-type': isKnownClass(prop.type) }]"
            @click.stop="isKnownClass(prop.type) && $emit('navigate-to-class', prop.type)"
          >
            {{ prop.type }}
          </span>
        </div>
      </div>
      <div v-else class="empty-text">{{ store.t('No properties declared.') }}</div>
    </div>

    <!-- Methods -->
    <div class="meta-section">
      <h3 class="panel-subtitle">{{ store.t('Methods') }} ({{ classData.methods?.length || 0 }})</h3>
      <div class="members-list" v-if="classData.methods?.length">
        <div v-for="meth in classData.methods" :key="meth.name" class="member-row method-row" @click="$emit('scroll-to-member', meth.name, true)">
          <span :class="['vis-char', `vis-${meth.visibility}`]">
            {{ getVisibilityChar(meth.visibility) }}
          </span>
          <span class="member-name">{{ meth.name }}</span>
          <span class="paren">(</span>
          <span v-for="(p, i) in meth.parameters" :key="p.name" class="param-node">
            <span class="p-name">{{ p.name }}</span>: 
            <span 
              :class="['p-type', { 'clickable-type': isKnownClass(p.type) }]"
              @click.stop="isKnownClass(p.type) && $emit('navigate-to-class', p.type)"
            >
              {{ p.type }}
            </span>
            <span v-if="i < meth.parameters.length - 1">, </span>
          </span>
          <span class="paren">)</span>
          <span class="divider">:</span>
          <span 
            :class="['member-type', { 'clickable-type': isKnownClass(meth.returnType) }]"
            @click.stop="isKnownClass(meth.returnType) && $emit('navigate-to-class', meth.returnType)"
          >
            {{ meth.returnType }}
          </span>
        </div>
      </div>
      <div v-else class="empty-text">{{ store.t('No methods declared.') }}</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { store } from '../../stores';

defineProps<{
  classData: {
    baseClass?: string;
    implementsList: string[];
    dependencies?: string[];
    properties: { name: string; type: string; visibility: string }[];
    methods: { name: string; parameters: { name: string; type: string }[]; returnType: string; visibility: string }[];
  };
}>();

defineEmits<{
  (e: 'scroll-to-member', name: string, isMethod: boolean): void;
  (e: 'navigate-to-class', className: string): void;
}>();

const isKnownClass = (typeName: string | undefined): boolean => {
  if (!typeName || !store.classesData) return false;
  const cleanType = typeName.replace(/<.*>/, '').replace(/\[\]/, '').trim();
  return store.classesData.some(n => n.id.toLowerCase() === cleanType.toLowerCase() || (n.data?.name && n.data.name.toLowerCase() === cleanType.toLowerCase()));
};

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
.member-details-panel {
  padding: 24px;
  border-radius: 12px;
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  height: 100%;
  box-sizing: border-box;
}

.panel-subtitle {
  font-size: 0.8rem;
  text-transform: uppercase;
  color: var(--text-secondary);
  font-weight: 600;
  letter-spacing: 0.03em;
  margin-top: 0;
  margin-bottom: 12px;
  border-left: 2px solid var(--color-primary);
  padding-left: 8px;
}

.meta-section {
  margin-bottom: 24px;
}

.meta-section:last-child {
  margin-bottom: 0;
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

.members-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.member-row {
  display: flex;
  align-items: center;
  font-family: var(--font-mono);
  font-size: 0.78rem;
  padding: 6px 8px;
  background: var(--bg-secondary);
  border-radius: 4px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  cursor: pointer;
  transition: all 0.2s ease;
  border: 1px solid transparent;
}

.member-row:hover {
  background: rgba(255, 255, 255, 0.05) !important;
  border-color: var(--color-primary);
  transform: translateX(4px);
}

.vis-char {
  font-weight: 800;
  width: 14px;
  display: inline-block;
  text-align: center;
  margin-right: 8px;
}

.vis-public { color: var(--color-success); }
.vis-private { color: var(--color-danger); }
.vis-protected { color: var(--color-warning); }

.member-name {
  color: var(--text-primary);
}

.divider {
  margin: 0 4px;
  color: var(--text-muted);
}

.member-type {
  color: #00b4d8;
}

.p-name { color: #fca311; }
.p-type { color: #9d4edd; }
.paren { color: var(--text-secondary); }

.empty-text {
  font-size: 0.75rem;
  color: var(--text-muted);
  font-style: italic;
  padding: 4px 0;
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
