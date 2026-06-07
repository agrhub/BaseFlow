import { FunctionTool } from '@google/adk';
import {
  getProjectStructureTool,
  readClassCodeTool,
  highlightClassTool,
  analyzeRefactorImpactTool,
  navigateDashboardTool,
  selectMindmapNodeTool
} from './connection.tools';
import {
  resolveIssueWithAITool,
  analyzePipelineFailureTool,
  generateDevOpsHealthScoreTool,
  publishSkillToCatalogTool,
  createMergeRequestFromWorkspaceTool,
  submitMrReviewTool,
  auditSecurityVulnerabilitiesTool,
  writeWorkspaceFileTool
} from './devops.tools';

export * from './types';

export const allTools: FunctionTool[] = [
  getProjectStructureTool,
  readClassCodeTool,
  highlightClassTool,
  analyzeRefactorImpactTool,
  navigateDashboardTool,
  selectMindmapNodeTool,
  resolveIssueWithAITool,
  analyzePipelineFailureTool,
  generateDevOpsHealthScoreTool,
  publishSkillToCatalogTool,
  createMergeRequestFromWorkspaceTool,
  submitMrReviewTool,
  auditSecurityVulnerabilitiesTool,
  writeWorkspaceFileTool
];