<template>
  <div class="overview-tab">
    <!-- Quick Stats Row -->
    <el-row :gutter="24" class="metrics-row">
      <el-col :xs="24" :sm="8">
        <el-card class="metric-card glass-panel">
          <div class="metric-lbl">{{ store.t('Total Classes') }}</div>
          <div class="metric-val text-brand">{{ stats.classesCount }}</div>
        </el-card>
      </el-col>
      <el-col :xs="24" :sm="8">
        <el-card class="metric-card glass-panel">
          <div class="metric-lbl">{{ store.t('Relationships') }}</div>
          <div class="metric-val">{{ stats.edgesCount }}</div>
        </el-card>
      </el-col>
      <el-col :xs="24" :sm="8">
        <el-card class="metric-card glass-panel">
          <div class="metric-lbl">{{ store.t('Graph Nodes') }}</div>
          <div class="metric-val">{{ stats.nodesCount }}</div>
        </el-card>
      </el-col>
    </el-row>

    <!-- Remote Repository Statistics -->
    <el-row :gutter="24" class="metrics-row mb-4" v-if="stats.stars !== undefined || stats.forks !== undefined">
      <el-col :xs="24" :sm="8">
        <el-card class="metric-card glass-panel stats-icon-card">
          <div class="card-inner-flex">
            <div>
              <div class="metric-lbl">⭐ {{ store.t('Stars') }}</div>
              <div class="metric-val text-brand">{{ stats.stars || 0 }}</div>
            </div>
            <div class="card-large-icon">⭐</div>
          </div>
        </el-card>
      </el-col>
      <el-col :xs="24" :sm="8">
        <el-card class="metric-card glass-panel stats-icon-card">
          <div class="card-inner-flex">
            <div>
              <div class="metric-lbl">🍴 {{ store.t('Forks') }}</div>
              <div class="metric-val text-warning">{{ stats.forks || 0 }}</div>
            </div>
            <div class="card-large-icon">🍴</div>
          </div>
        </el-card>
      </el-col>
      <el-col :xs="24" :sm="8">
        <el-card class="metric-card glass-panel stats-icon-card">
          <div class="card-inner-flex">
            <div>
              <div class="metric-lbl">👁️ {{ store.t('Watchers') }}</div>
              <div class="metric-val text-info">{{ stats.watchers || 0 }}</div>
            </div>
            <div class="card-large-icon">👁️</div>
          </div>
        </el-card>
      </el-col>
    </el-row>

    <!-- Content Row -->
    <el-row :gutter="24" class="content-row">
      <!-- Language Breakdown -->
      <el-col :xs="24" :md="12">
        <el-card class="list-card glass-panel">
          <template #header>
            <div class="card-header">{{ store.t('Languages Breakdown') }}</div>
          </template>
          <div v-for="lang in stats.languages" :key="lang.name" class="lang-item">
            <div class="lang-label-row">
              <span class="lang-name">{{ lang.name }}</span>
              <span class="lang-pct">{{ lang.count }} files ({{ lang.percentage }}%)</span>
            </div>
            <el-progress :percentage="lang.percentage" :show-text="false" :stroke-width="8" />
          </div>
          <div v-if="!stats.languages || stats.languages.length === 0" class="no-data">
            {{ store.t('No supported source files found.') }}
          </div>
        </el-card>
      </el-col>

      <!-- Repo Info -->
      <el-col :xs="24" :md="12">
        <el-card class="list-card glass-panel">
          <template #header>
            <div class="card-header">{{ store.t('Repository Info') }}</div>
          </template>
          <div class="info-list">
            <div class="info-row">
              <span class="info-lbl">{{ store.t('Path') }}:</span>
              <span class="info-val mono">{{ stats.path }}</span>
            </div>
            <div class="info-row">
              <span class="info-lbl">{{ store.t('Name') }}:</span>
              <span class="info-val">{{ readmeAnalysis?.projectName || 'N/A' }}</span>
            </div>
            <div class="info-row">
              <span class="info-lbl">{{ store.t('URL') }}:</span>
              <span class="info-val mono">
                <a v-if="readmeAnalysis?.url" :href="readmeAnalysis.url" target="_blank" style="color: var(--color-brand); text-decoration: none;">
                  {{ readmeAnalysis.url }}
                </a>
                <span v-else>N/A</span>
              </span>
            </div>
            <div class="info-row">
              <span class="info-lbl">{{ store.t('Desc') }}:</span>
              <span class="info-val">{{ readmeAnalysis?.description || 'N/A' }}</span>
            </div>
            <div class="info-row">
              <span class="info-lbl">{{ store.t('Author') }}:</span>
              <span class="info-val">{{ readmeAnalysis?.author || 'N/A' }}</span>
            </div>
            <div class="info-row">
              <span class="info-lbl">{{ store.t('License') }}:</span>
              <span class="info-val">
                <el-tag v-if="readmeAnalysis?.license" type="info" size="small" effect="dark">{{ readmeAnalysis.license }}</el-tag>
                <span v-else>N/A</span>
              </span>
            </div>
            <div class="info-row">
              <span class="info-lbl">{{ store.t('Status') }}:</span>
              <el-tag type="success" size="small" effect="dark">{{ store.t('Analysed') }}</el-tag>
            </div>
          </div>
        </el-card>
      </el-col>
    </el-row>

    <!-- Commit Activity Chart Row -->
    <el-row :gutter="24" class="content-row mb-4" v-if="stats.commitActivity && stats.commitActivity.length > 0">
      <el-col :span="24">
        <el-card class="list-card glass-panel">
          <template #header>
            <div class="card-header"><el-icon><TrendCharts /></el-icon> {{ store.t('Git Commit Activity (Last 14 Days)') }}</div>
          </template>
          <div class="commit-chart-container">
            <svg viewBox="0 0 1000 250" class="commit-svg-chart">
              <defs>
                <linearGradient id="chartGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stop-color="var(--color-brand)" stop-opacity="0.3" />
                  <stop offset="100%" stop-color="var(--color-brand)" stop-opacity="0" />
                </linearGradient>
              </defs>

              <line x1="50" y1="20" x2="950" y2="20" stroke="rgba(255,255,255,0.05)" stroke-dasharray="4" />
              <line x1="50" y1="70" x2="950" y2="70" stroke="rgba(255,255,255,0.05)" stroke-dasharray="4" />
              <line x1="50" y1="120" x2="950" y2="120" stroke="rgba(255,255,255,0.05)" stroke-dasharray="4" />
              <line x1="50" y1="170" x2="950" y2="170" stroke="rgba(255,255,255,0.05)" stroke-dasharray="4" />
              <line x1="50" y1="210" x2="950" y2="210" stroke="rgba(255,255,255,0.08)" />

              <path :d="svgAreaPath" fill="url(#chartGradient)" />
              <path :d="svgLinePath" fill="none" stroke="var(--color-brand)" stroke-width="3" stroke-linecap="round" />

              <g v-for="(pt, idx) in chartPoints" :key="idx" class="chart-dot-group">
                <circle
                  :cx="pt.x"
                  :cy="pt.y"
                  r="5"
                  fill="var(--bg-secondary)"
                  stroke="var(--color-brand)"
                  stroke-width="2"
                />
                <rect :x="pt.x - 45" :y="pt.y - 35" width="90" height="24" rx="4" fill="rgba(15, 23, 42, 0.9)" class="chart-tooltip-bg" />
                <text :x="pt.x" :y="pt.y - 19" fill="#fff" font-size="10" text-anchor="middle" font-weight="bold" class="chart-tooltip-text">
                  {{ pt.count }} {{ store.t('commits') }}
                </text>
              </g>

              <text
                v-for="(pt, idx) in chartPoints"
                :key="'lbl-' + idx"
                :x="pt.x"
                y="235"
                fill="var(--text-muted)"
                font-size="10"
                text-anchor="middle"
              >
                {{ formatChartDate(pt.date) }}
              </text>
            </svg>
          </div>
        </el-card>
      </el-col>
    </el-row>

    <!-- How to Run Row -->
    <el-row :gutter="24" class="content-row" v-if="readmeAnalysis?.howToRun && readmeAnalysis.howToRun.length > 0">
      <el-col :span="24">
        <el-card class="list-card glass-panel">
          <template #header>
            <div class="card-header"><el-icon><Promotion /></el-icon> {{ store.t('How to Run') }}</div>
          </template>
          <div class="how-to-run-content">
            <div v-for="(cmd, idx) in readmeAnalysis.howToRun" :key="idx" class="command-line">
              <span class="prompt-symbol">$</span>
              <code class="mono">{{ cmd }}</code>
            </div>
          </div>
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { store } from '../../stores';

const props = defineProps<{
  stats: any;
  readmeAnalysis: any;
}>();

const chartPoints = computed(() => {
  if (!props.stats || !props.stats.commitActivity || props.stats.commitActivity.length === 0) {
    return [];
  }
  
  const activity = props.stats.commitActivity;
  const maxVal = Math.max(...activity.map((a: any) => a.count), 5);
  
  const width = 900;
  const height = 160;
  const startX = 50;
  const stepX = width / (activity.length - 1);
  const baselineY = 210;

  return activity.map((item: any, idx: number) => {
    const x = startX + idx * stepX;
    const y = baselineY - (item.count / maxVal) * height;
    return {
      x,
      y,
      count: item.count,
      date: item.date
    };
  });
});

const svgLinePath = computed(() => {
  const pts = chartPoints.value;
  if (pts.length === 0) return '';
  return pts.map((p: any, idx: number) => `${idx === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
});

const svgAreaPath = computed(() => {
  const pts = chartPoints.value;
  if (pts.length === 0) return '';
  const baselineY = 210;
  const linePath = svgLinePath.value;
  return `${linePath} L ${pts[pts.length - 1].x} ${baselineY} L ${pts[0].x} ${baselineY} Z`;
});

const formatChartDate = (dateStr: string) => {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '';
  return `${d.getMonth() + 1}/${d.getDate()}`;
};
</script>

<style scoped>
.metrics-row {
  margin-top: 1.5rem;
  margin-bottom: 1.5rem;
}

.metric-card {
  height: 110px;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
}

.metric-lbl {
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
  color: var(--text-muted);
  letter-spacing: 0.05em;
  margin-bottom: 0.25rem;
}

.metric-val {
  font-size: 2rem;
  font-weight: 700;
  color: var(--text-primary);
  line-height: 1;
}

.stats-icon-card .card-inner-flex {
  display: flex;
  justify-content: space-between;
  align-items: center;
  width: 100%;
  padding: 0 1rem;
  box-sizing: border-box;
}

.card-large-icon {
  font-size: 2.5rem;
  opacity: 0.15;
}

.content-row {
  margin-bottom: 1.5rem;
}

.list-card {
  min-height: 280px;
  display: flex;
  flex-direction: column;
}

.card-header {
  font-weight: 600;
  color: var(--text-primary);
}

.lang-item {
  margin-bottom: 1rem;
}

.lang-label-row {
  display: flex;
  justify-content: space-between;
  margin-bottom: 0.25rem;
  font-size: 0.875rem;
}

.lang-name {
  font-weight: 500;
  color: var(--text-primary);
}

.lang-pct {
  color: var(--text-muted);
}

.info-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.info-row {
  display: flex;
  align-items: flex-start;
  font-size: 0.875rem;
}

.info-lbl {
  font-weight: 600;
  color: var(--text-muted);
  width: 120px;
  flex-shrink: 0;
}

.info-val {
  color: var(--text-primary);
  word-break: break-all;
}

.commit-chart-container {
  padding: 1rem 0;
}

.commit-svg-chart {
  width: 100%;
  height: auto;
}

.chart-tooltip-bg,
.chart-tooltip-text {
  visibility: hidden;
  opacity: 0;
  transition: visibility 0s, opacity 0.15s ease-in-out;
}

.chart-dot-group:hover .chart-tooltip-bg,
.chart-dot-group:hover .chart-tooltip-text {
  visibility: visible;
  opacity: 1;
}

.how-to-run-content {
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  padding: 1.5rem;
}

.command-line {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 0.75rem;
}

.command-line:last-child {
  margin-bottom: 0;
}

.prompt-symbol {
  color: var(--color-brand);
  font-weight: 700;
  user-select: none;
}
</style>
