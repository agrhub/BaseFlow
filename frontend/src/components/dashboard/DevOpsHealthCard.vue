<template>
  <el-card class="health-score-card glass-panel mb-4" v-loading="loadingHealth">
    <div class="health-score-header">
      <div class="health-score-title">
		<el-icon><FirstAidKit /></el-icon>
        <h4>{{ store.t('DevOps Health Score') }}</h4>
      </div>
      <el-button icon="Refresh" type="primary" text bg round :loading="loadingHealth" @click="$emit('loadHealthScore')">
        {{ store.t('Refresh') }}
      </el-button>
    </div>
    
    <div class="health-score-body" v-if="healthScore">
      <div class="score-circle-row">
        <div class="score-circle" :class="getScoreClass(healthScore.score)">
          <span class="score-num">{{ healthScore.score }}</span>
          <span class="score-label">/ 100</span>
        </div>
        <div class="score-breakdown">
          <div class="breakdown-item">
            <span class="breakdown-label"><el-icon><ChatLineSquare /></el-icon> {{ store.t('Open Issues') }}</span>
            <el-tag :type="healthScore.breakdown.issues.count > 10 ? 'danger' : 'success'" size="small">{{ formatCount(healthScore.breakdown.issues.count) }}</el-tag>
            <span class="breakdown-score">{{ healthScore.breakdown.issues.score }}/100</span>
          </div>
          <div class="breakdown-item">
            <span class="breakdown-label"><el-icon><Star /></el-icon> {{ providerLabel === 'GitHub' ? store.t('Open PRs') : store.t('Open MRs') }}</span>
            <el-tag :type="healthScore.breakdown.mergeRequests.count > 5 ? 'warning' : 'success'" size="small">{{ formatCount(healthScore.breakdown.mergeRequests.count) }}</el-tag>
            <span class="breakdown-score">{{ healthScore.breakdown.mergeRequests.score }}/100</span>
          </div>
          <div class="breakdown-item">
            <span class="breakdown-label"><el-icon><Trophy /></el-icon> {{ store.t('Pipeline Health') }}</span>
            <el-tag :type="healthScore.breakdown.pipelines.healthRate < 70 ? 'danger' : 'success'" size="small">{{ healthScore.breakdown.pipelines.healthRate }}%</el-tag>
            <span class="breakdown-score">{{ healthScore.breakdown.pipelines.score }}/100</span>
          </div>
        </div>
      </div>
      <div class="health-ai-row" style="display: flex; gap: 10px;">
        <el-button v-if="store.linkedPlaybooks['devops_report']" type="primary" round text bg @click="$emit('reviewPlaybook', 'devops_report')">
          📖 {{ store.t('Review DevOps Report') }}
        </el-button>
        <el-button v-else type="primary" round text bg icon="MagicStick" @click="$emit('triggerHealthAnalysis')">
          {{ store.t('Generate AI DevOps Report') }}
        </el-button>
        
        <el-button v-if="store.linkedPlaybooks['security_audit']" type="primary" round text bg @click="$emit('reviewPlaybook', 'security_audit')">
          📖 {{ store.t('Review Security Audit') }}
        </el-button>
        <el-button v-else type="danger" round text bg icon="FolderChecked" @click="$emit('triggerSecurityAudit')">
          {{ store.t('Run Codebase Security Audit') }}
        </el-button>
      </div>
    </div>
    
    <div class="health-empty" v-else-if="!loadingHealth">
      <p>{{ store.t('Click Refresh to compute your DevOps Health Score.') }}</p>
    </div>
  </el-card>
</template>

<script setup lang="ts">
import { store } from '../../stores';


defineProps<{
  healthScore: any;
  loadingHealth: boolean;
  providerLabel: string;
}>();

defineEmits<{
  (e: 'loadHealthScore'): void;
  (e: 'triggerHealthAnalysis'): void;
  (e: 'triggerSecurityAudit'): void;
  (e: 'reviewPlaybook', id: string): void;
}>();

const getScoreClass = (score: number) => {
  if (score >= 85) return 'score-excellent';
  if (score >= 65) return 'score-good';
  if (score >= 40) return 'score-warning';
  return 'score-critical';
};

const formatCount = (count: number) => {
  if (count >= 1000) return (count / 1000).toFixed(1) + 'k';
  return count.toString();
};
</script>

<style scoped>
.health-score-card {
  background: linear-gradient(135deg, rgba(99, 102, 241, 0.08), rgba(168, 85, 247, 0.04));
  border-color: rgba(99, 102, 241, 0.2);
}
.health-score-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1.25rem;
}
.health-score-title {
  display: flex;
  align-items: center;
  gap: 8px;
}
.health-score-title h4 {
  margin: 0;
  font-size: 1.05rem;
  font-weight: 600;
  color: var(--text-primary);
}
.health-emoji { font-size: 1.4rem; }
.score-circle-row {
  display: flex;
  align-items: center;
  gap: 2rem;
}
.score-circle {
  min-width: 90px;
  min-height: 90px;
  border-radius: 50%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  border: 4px solid;
  flex-shrink: 0;
}
.score-excellent { border-color: #22c55e; background: rgba(34, 197, 94, 0.08); }
.score-good { border-color: #eab308; background: rgba(234, 179, 8, 0.08); }
.score-warning { border-color: #f97316; background: rgba(249, 115, 22, 0.08); }
.score-critical { border-color: #ef4444; background: rgba(239, 68, 68, 0.08); }
.score-num {
  font-size: 1.75rem;
  font-weight: 800;
  line-height: 1;
  color: var(--text-primary);
}
.score-label { font-size: 0.7rem; color: var(--text-muted); }
.score-breakdown {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.breakdown-item {
  display: flex;
  align-items: center;
  gap: 10px;
}
.breakdown-label {
  font-size: 0.85rem;
  color: var(--text-secondary);
  min-width: 130px;
}
.breakdown-score {
  font-size: 0.8rem;
  color: var(--text-muted);
  font-family: var(--font-mono);
  margin-left: auto;
}
.health-ai-row {
  margin-top: 1.25rem;
  display: flex;
  justify-content: flex-end;
}
.health-empty {
  text-align: center;
  color: var(--text-muted);
  font-size: 0.875rem;
  padding: 1rem 0;
}
.mb-4 { margin-bottom: 16px; }
</style>
