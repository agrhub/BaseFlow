<template>
  <div class="devops-workspace">
    <!-- 1. NO REMOTE DEVOPS PROVIDER DETECTED -->
    <div v-if="!loadingInfo && info.provider === 'none'" class="setup-container glass-panel text-center">
      <el-icon class="large-icon"><Warning /></el-icon>
      <h3>{{ store.t('No Remote DevOps Provider Detected') }}</h3>
      <p>{{ store.t('This repository connection does not point to a github.com or gitlab.com remote URL. DevOps features are available for hosted repositories.') }}</p>
    </div>

    <!-- 2. CREDENTIALS SETUP (Missing token) -->
    <div v-else-if="!loadingInfo && !info.hasToken" class="setup-container glass-panel">
      <div class="setup-header">
        <el-icon class="setup-icon"><Setting /></el-icon>
        <h3>{{ store.t('Configure') }} {{ providerLabel }} & {{ store.t('AI Credentials') }}</h3>
      </div>
      <p class="setup-desc">
        {{ store.t('Configure your Personal Access Tokens to enable automated AI pull/merge request reviews, issue triage, and onboarding workflows using Google Gemini and Git remote MCP tools.') }}
      </p>

      <el-form label-position="top" class="setup-form">
        <!-- Unified Git Token Form Field -->
        <el-form-item :label="store.t('Git Personal Key / Token')" required>
          <el-input v-model="tokenForm.gitToken" type="password" show-password placeholder="ghp_... or glpat-..." />
          <div class="form-tip">
            {{ info.provider === 'gitlab' 
                ? store.t('Requires api permissions to fetch issues/MRs and post review comments.')
                : store.t('Requires repo scope to fetch issues/PRs and publish reviews.') }}
          </div>
        </el-form-item>

        <!-- Unified Git MCP Server Endpoint -->
        <el-form-item :label="store.t('Git MCP Server Endpoint') + ' (' + store.t('Optional').toLowerCase() + ')'">
          <el-input v-model="tokenForm.gitMcpServer" type="text" placeholder="e.g. https://gitlab.com/api/v4/mcp" />
          <div class="form-tip">{{ store.t('Used for GitLab Duo or custom remote Git MCP servers. Leave empty to use local default.') }}</div>
        </el-form-item>

        <div class="form-actions">
          <el-button v-if="info?.options?.gitToken" type="" round :loading="saving" @click="info.hasToken = true;">{{ store.t('Cancel') }}</el-button>
          <el-button type="primary" round :loading="saving" @click="saveTokens">{{ store.t('Save Credentials') }}</el-button>
        </div>
      </el-form>
    </div>

    <!-- 3. MAIN WORKSPACE -->
    <div v-else-if="!loadingInfo" class="workspace-main">
      <!-- Onboarding Banner -->
      <el-card class="onboarding-card glass-panel mb-4">
        <div class="onboard-flex">
          <div class="onboard-text">
            <h4><el-icon><Document /></el-icon>{{ store.t('Codebase Developer Onboarding') }}</h4>
            <p>{{ store.t("Generate a comprehensive, custom-tailored onboarding guide for new developers based on the project's parsed class tree, dependencies, and readme info.") }}</p>
          </div>
          <el-button 
            v-if="store.linkedPlaybooks['onboarding']" 
            type="primary" text bg
            round :icon="Document" 
            @click="reviewPlaybook('onboarding')">
            {{ store.t('Review Onboarding Guide') }}
          </el-button>
          <el-button 
            v-else
            type="success" text bg
            round :icon="Cpu" 
            @click="triggerOnboarding">
            {{ store.t('Generate Onboarding Guide') }}
          </el-button>
        </div>
      </el-card>

      <!-- DevOps Health Score Panel -->
      <DevOpsHealthCard
        :healthScore="healthScore"
        :loadingHealth="loadingHealth"
        :providerLabel="providerLabel"
        @loadHealthScore="loadHealthScore"
        @triggerHealthAnalysis="triggerHealthAnalysis"
        @triggerSecurityAudit="triggerSecurityAudit"
        @reviewPlaybook="reviewPlaybook"
      />

      <!-- Sub Tabs -->
      <el-tabs v-model="activeTab" class="devops-sub-tabs">
        <!-- ISSUES SUBTAB -->
        <el-tab-pane name="issues">
          <template #label>
            <span class="tab-label"><el-icon><ChatLineSquare /></el-icon> {{ store.t('Open Issues') }} <span class="count-badge">{{ formatCount(issuesTotal) }}</span></span>
          </template>

          <DevOpsIssuesList
            :provider="info.provider"
            @update-total="val => issuesTotal = val"
            @triage="triageIssue"
            @autoFix="autoFixAndCreateMR"
            @reviewPlaybook="reviewPlaybook"
          />
        </el-tab-pane>

        <!-- PR/MR SUBTAB -->
        <el-tab-pane name="mrs">
          <template #label>
            <span class="tab-label"><el-icon><Star /></el-icon> {{ prTabLabel }} <span class="count-badge">{{ formatCount(mrsTotal) }}</span></span>
          </template>

          <DevOpsMrsList
            :provider="info.provider"
            @update-total="val => mrsTotal = val"
            @reviewMergeRequest="reviewMergeRequest"
            @reviewPlaybook="reviewPlaybook"
          />
        </el-tab-pane>

        <!-- PIPELINES/RUNS SUBTAB -->
        <el-tab-pane name="pipelines">
          <template #label>
            <span class="tab-label"><el-icon><Trophy /></el-icon> {{ pipelineTabLabel }} <span class="count-badge">{{ formatCount(pipelinesTotal) }}</span></span>
          </template>

          <DevOpsPipelinesList
            :provider="info.provider"
            @update-total="val => pipelinesTotal = val"
            @analyzePipeline="analyzePipeline"
            @reviewPlaybook="reviewPlaybook"
          />
        </el-tab-pane>
      </el-tabs>

      <!-- Update credentials button -->
      <div class="settings-reset-row mt-4">
        <el-button type="info" size="small" link :icon="Setting" @click="resetCredentials">
          {{ store.t('Update API Credentials') }}
        </el-button>
      </div>
    </div>

    <!-- 4. MAIN LOADING STATE -->
    <div v-else class="setup-container text-center py-5">
      <el-icon class="loading-icon"><Loading /></el-icon>
      <p>{{ store.t('Loading DevOps repository configuration...') }}</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, watch, onMounted, computed } from 'vue';
import { store } from '../../stores';
import axios from 'axios';
import { ElMessage } from 'element-plus';
import { 
  Warning, Setting, Cpu, Loading, Document, ChatLineSquare, Star, Trophy
} from '@element-plus/icons-vue';

import DevOpsHealthCard from './DevOpsHealthCard.vue';
import DevOpsIssuesList from './DevOpsIssuesList.vue';
import DevOpsMrsList from './DevOpsMrsList.vue';
import DevOpsPipelinesList from './DevOpsPipelinesList.vue';

const activeTab = ref('issues');
const loadingInfo = ref(true);
const saving = ref(false);

const info = ref<any>({
  provider: 'none',
  hasToken: false,
  owner: '',
  repo: '',
  fullPath: '',
  options: {}
});

const tokenForm = reactive({
  gitToken: '',
  gitMcpServer: 'https://gitlab.com/api/v4',
});

// Resources states
const issuesTotal = ref(0);
const mrsTotal = ref(0);
const pipelinesTotal = ref(0);

const formatCount = (count: number) => {
  if (count >= 1000) {
    return (count / 1000).toFixed(1) + 'k';
  }
  return count.toString();
};

// Health Score state
const healthScore = ref<any>(null);
const loadingHealth = ref(false);

const providerLabel = computed(() => {
  if (info.value.provider === 'github') return 'GitHub';
  if (info.value.provider === 'gitlab') return 'GitLab';
  return 'Git Remote';
});

const prTabLabel = computed(() => {
  return info.value.provider === 'github' ? store.t('Pull Requests') : store.t('Merge Requests');
});

const pipelineTabLabel = computed(() => {
  return info.value.provider === 'github' ? store.t('Workflow Runs') : store.t('Pipelines');
});

const fetchInfo = async () => {
  if (!store.activeConnection) return;
  loadingInfo.value = true;
  try {
    const res = await axios.get(`/api/${store.activeConnection}/devops/info`);
    info.value = res.data;
    if (info.value.options) {
      tokenForm.gitMcpServer = info.value.options.gitMcpServer || 'https://gitlab.com/api/v4';
      tokenForm.gitToken = info.value.options.gitToken || '';
    }
    if (info.value.hasToken) {
      loadResources();
    }
  } catch (e: any) {
    console.error('Failed to fetch DevOps info:', e);
  } finally {
    loadingInfo.value = false;
  }
};

const saveTokens = async () => {
  if (!tokenForm.gitToken) {
    ElMessage.warning(store.t('Git Personal Key / Token is required.'));
    return;
  }
  
  saving.value = true;
  try {
    await axios.post(`/api/${store.activeConnection}/devops/save-token`, {
      gitToken: tokenForm.gitToken,
      gitMcpServer: tokenForm.gitMcpServer
    });
    ElMessage.success(store.t('DevOps credentials saved successfully.'));
    if (typeof pendo !== 'undefined') {
      pendo.track('devops_credentials_saved', {
        connection_name: store.activeConnection,
        provider: info.value.provider || '',
        has_mcp_server: !!tokenForm.gitMcpServer
      });
    }
    
    await fetchInfo();
    await store.fetchDevOpsInfo();
  } catch (e: any) {
    ElMessage.error(store.t('Failed to save credentials.'));
  } finally {
    saving.value = false;
  }
};

const resetCredentials = () => {
  info.value.hasToken = false;
  tokenForm.gitToken = info.value.options?.gitToken || '';
  tokenForm.gitMcpServer = info.value.options?.gitMcpServer || 'https://gitlab.com/api/v4';
};

const loadResources = () => {
  loadHealthScore();
  // Note: Data loading is now handled inside each child component
};

const loadHealthScore = async () => {
  if (!store.activeConnection) return;
  loadingHealth.value = true;
  try {
    const res = await axios.get(`/api/${store.activeConnection}/devops/health-score`);
    healthScore.value = res.data;
    if (typeof pendo !== 'undefined') {
      pendo.track('devops_health_score_loaded', {
        connection_name: store.activeConnection,
        health_score: res.data?.score || 0,
        open_issues_count: res.data?.breakdown?.issues?.count || 0,
        open_mrs_count: res.data?.breakdown?.mergeRequests?.count || 0,
        pipeline_count: res.data?.breakdown?.pipelines?.total || 0,
        provider: res.data?.provider || ''
      });
    }
    // Only use health score counts as a fallback if child list components haven't
    // reported their accurate paginated totals yet.
    if (healthScore.value?.breakdown) {
      if (issuesTotal.value === 0) issuesTotal.value = healthScore.value.breakdown.issues?.count ?? 0;
      if (mrsTotal.value === 0) mrsTotal.value = healthScore.value.breakdown.mergeRequests?.count ?? 0;
      if (pipelinesTotal.value === 0) pipelinesTotal.value = healthScore.value.breakdown.pipelines?.total ?? 0;
    }
  } catch (e) {
    console.error('Failed to load health score:', e);
  } finally {
    loadingHealth.value = false;
  }
};

// AI Agent actions dynamically adapting to provider names
const triageIssue = (issue: any) => {
  const numOnly = issue.number.replace('#', '').replace('!', '');
  if (typeof pendo !== 'undefined') {
    pendo.track('issue_triage_initiated', {
      connection_name: store.activeConnection,
      provider: info.value.provider || '',
      issue_number: issue.number,
      issue_title: (issue.title || '').substring(0, 100)
    });
  }
  store.chatInput = `Resolve ${providerLabel.value} Issue ${issue.number}: "${issue.title}".
Description: "${issue.description || 'No description'}"
Call 'resolve_issue_with_ai' with issueTitle="${issue.title}", issueDescription="${issue.description || ''}", issueNumber="${numOnly}", provider="${info.value.provider}".
After generating the fix playbook, offer to call 'publish_skill_to_catalog' to prepare it for the GitLab Duo AI Catalog.`;
  store.autoSendNextCommand = true;
  store.chatSidebarOpen = true;
};

const autoFixAndCreateMR = (issue: any) => {
  const numOnly = issue.number.replace('#', '').replace('!', '');
  if (typeof pendo !== 'undefined') {
    pendo.track('auto_fix_mr_initiated', {
      connection_name: store.activeConnection,
      provider: info.value.provider || '',
      issue_number: issue.number,
      issue_title: (issue.title || '').substring(0, 100)
    });
  }
  store.chatInput = `Auto-fix ${providerLabel.value} Issue ${issue.number}: "${issue.title}".
Description: "${issue.description || 'No description'}"
Please:
1. Use 'write_workspace_file' to modify the necessary files in the workspace to fix the issue.
2. Once you are done modifying the files, call 'create_merge_request_from_workspace' with issueIid="${numOnly}", branchName="fix/issue-${numOnly}", mrTitle="Resolve Issue ${issue.number}", mrDescription="Automated fix for issue ${issue.number} generated by BaseFlow AI Architect.".`;
  store.autoSendNextCommand = true;
  store.chatSidebarOpen = true;
};

const reviewMergeRequest = async (mr: any) => {
  const pName = providerLabel.value;
  const verb = info.value.provider === 'github' ? 'Pull Request' : 'Merge Request';
  const numOnly = mr.number.replace('#', '').replace('!', '');
  if (typeof pendo !== 'undefined') {
    pendo.track('mr_review_initiated', {
      connection_name: store.activeConnection,
      provider: info.value.provider || '',
      mr_number: mr.number,
      source_branch: mr.source_branch || '',
      target_branch: mr.target_branch || ''
    });
  }
  
  const loadingMsg = ElMessage({ message: store.t('Fetching diff from ' + pName + '...'), type: 'info', duration: 0 });
  
  try {
    const res = await axios.get(`/api/${store.activeConnection}/devops/mr-diff/${numOnly}`);
    loadingMsg.close();
    
    let diffText = res.data.diff || '';
    if (diffText.length > 15000) {
      diffText = diffText.substring(0, 15000) + '\n...[DIFF TRUNCATED]';
    }

    store.chatInput = `Review ${pName} ${verb} ${mr.number}: "${mr.title}".
Source Branch: ${mr.source_branch}
Target Branch: ${mr.target_branch}

Here is the diff:
\`\`\`diff
${diffText}
\`\`\`

Please:
1. Analyze this diff carefully.
2. Call the 'submit_mr_review' tool to submit your summary and inline file comments. Provide mrIid="${numOnly}".`;
    store.autoSendNextCommand = true;
    store.chatSidebarOpen = true;
  } catch (err: any) {
    loadingMsg.close();
    ElMessage.error(store.t('Failed to fetch diff: ') + (err.response?.data?.error || err.message));
  }
};

const reviewPlaybook = async (id: string) => {
  const filePath = store.linkedPlaybooks[id];
  if (!filePath) return;
  try {
    const res = await axios.get(`/api/${store.activeConnection}/documents/content?path=${encodeURIComponent(filePath)}`);
    store.playbookToReview = { title: store.t('Review Document'), content: res.data.content, filePath };
  } catch (err) {
    ElMessage.error(store.t('Failed to load document content.'));
  }
};

const analyzePipeline = (pipe: any) => {
  const word = info.value.provider === 'github' ? 'Workflow Run' : 'Pipeline';
  if (typeof pendo !== 'undefined') {
    pendo.track('pipeline_analysis_initiated', {
      connection_name: store.activeConnection,
      provider: info.value.provider || '',
      pipeline_id: String(pipe.id),
      branch: pipe.ref || ''
    });
  }
  store.chatInput = `Analyze the failed ${providerLabel.value} ${word} #${pipe.id} on branch "${pipe.ref}".
Call 'analyze_pipeline_failure' with pipelineId="${pipe.id}", ref="${pipe.ref}", provider="${info.value.provider}".
Also try fetching the job log via ${providerLabel.value} MCP tools to provide full log context to the tool. After analysis, highlight any affected classes on the mindmap.`;
  store.autoSendNextCommand = true;
  store.chatSidebarOpen = true;
};

const triggerHealthAnalysis = () => {
  if (!healthScore.value) return;
  if (typeof pendo !== 'undefined') {
    pendo.track('devops_health_analysis_triggered', {
      connection_name: store.activeConnection,
      health_score: healthScore.value?.score || 0,
      open_issues_count: healthScore.value?.breakdown?.issues?.count || 0,
      open_mrs_count: healthScore.value?.breakdown?.mergeRequests?.count || 0,
      provider: healthScore.value?.provider || ''
    });
  }
  const hs = healthScore.value;
  store.chatInput = `Generate a detailed DevOps Health Report. Call 'generate_devops_health_score' with openIssues=${hs.breakdown.issues.count}, openMRs=${hs.breakdown.mergeRequests.count}, recentPipelines=${JSON.stringify(hs.recentPipelines?.slice(0, 10) || [])}, provider="${hs.provider}". Then provide actionable recommendations and render a chart.`;
  store.autoSendNextCommand = true;
  store.chatSidebarOpen = true;
};

const triggerSecurityAudit = () => {
  if (typeof pendo !== 'undefined') {
    pendo.track('security_audit_triggered', {
      connection_name: store.activeConnection
    });
  }
  store.chatInput = `Run a Codebase Security Audit.
Review the mindmap node paths and structural code to find potential security risks (like auth controllers, database connectors, unprotected routes).
Call 'audit_security_vulnerabilities' passing the names of the vulnerable classes and a summary of why they are risky. This will highlight them in RED on the mindmap.`;
  store.autoSendNextCommand = true;
  store.chatSidebarOpen = true;
};

const triggerOnboarding = () => {
  if (typeof pendo !== 'undefined') {
    pendo.track('onboarding_guide_triggered', {
      connection_name: store.activeConnection
    });
  }
  store.chatInput = `I am a new developer onboarding to this project.
Based on the repository metadata, scanned classes, and readme info, generate a comprehensive Codebase Developer Onboarding Guide.
Explain the main entry points, the overall architecture, tech stack, directory layouts, and how to start modifying code.`;
  store.autoSendNextCommand = true;
  store.chatSidebarOpen = true;
};

// Watch connections changes
watch(() => store.activeConnection, (newVal) => {
  if (newVal) {
    // Reset counts so health score fallback kicks in if child list hasn't loaded
    issuesTotal.value = 0;
    mrsTotal.value = 0;
    pipelinesTotal.value = 0;
    fetchInfo();
  }
}, { immediate: true });

onMounted(() => {
  fetchInfo();
});
</script>

<style scoped>
.devops-workspace {
  max-width: 1200px;
  margin: 0 auto;
}

.count-badge {
  background: rgba(255, 255, 255, 0.1);
  padding: 2px 8px;
  border-radius: 12px;
  font-size: 0.75rem;
  margin-left: 4px;
}

.setup-container {
  max-width: 580px;
  margin: 3rem auto;
  padding: 2.5rem;
  border-radius: var(--radius-lg);
  background: var(--bg-secondary);
}

.setup-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 1rem;
}

.setup-icon {
  font-size: 1.75rem;
  color: var(--color-brand);
}

.setup-container h3 {
  margin: 0;
  font-size: 1.4rem;
  font-weight: 700;
  color: var(--text-primary);
}

.setup-desc {
  font-size: 0.9rem;
  color: var(--text-secondary);
  line-height: 1.5;
  margin-bottom: 2rem;
}

.large-icon {
  font-size: 3.5rem;
  color: var(--color-warning);
  margin-bottom: 1.5rem;
}

.setup-form {
  margin-top: 1rem;
}

.form-tip {
  font-size: 0.75rem;
  color: var(--text-muted);
  margin-top: 4px;
}

.form-actions {
  margin-top: 2rem;
  display: flex;
  justify-content: flex-end;
}

.onboarding-card {
  padding: 1rem;
  background: linear-gradient(135deg, rgba(13, 148, 136, 0.08), rgba(0, 224, 255, 0.04));
  border-color: rgba(13, 148, 136, 0.2);
}

.onboard-flex {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 20px;
}

.onboard-text h4 {
  margin: 0 0 6px 0;
  color: var(--color-brand);
  font-size: 1.1rem;
  font-weight: 600;
}

.onboard-text p {
  margin: 0;
  font-size: 0.85rem;
  color: var(--text-secondary);
  line-height: 1.4;
}



.settings-reset-row {
  display: flex;
  justify-content: flex-end;
}

.mb-3 { margin-bottom: 12px; }
.mb-4 { margin-bottom: 16px; }
.mt-2 { margin-top: 8px; }
.mt-4 { margin-top: 16px; }
.ml-2 { margin-left: 8px; }
.py-5 { padding-top: 32px; padding-bottom: 32px; }
.text-center { text-align: center; }


</style>
