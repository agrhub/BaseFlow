<template>
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
</template>

<script setup lang="ts">
/**
 * UML entity-relationship dialog for one class: base classes / interfaces on the left,
 * the class in the middle, dependent classes on the right, with connecting lines.
 */
import { ref, nextTick } from 'vue';
import { store } from '../../stores';

const props = withDefaults(defineProps<{
  initialNodes: any[];
  mode?: 'class' | 'directory';
}>(), { mode: 'class' });

const vis = (v: string) => v === 'private' ? '−' : v === 'protected' ? '#' : '+';

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


defineExpose({ openErdChart, drawErdLines, erdVisible });
</script>

<style scoped>
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
</style>
