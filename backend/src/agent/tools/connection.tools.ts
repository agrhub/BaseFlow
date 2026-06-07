// import { ParsedClass } from '../../utils/parser';
import * as fs from 'fs';
import * as path from 'path';
import { z } from 'zod';
import { FunctionTool } from '@google/adk';
import { currentScanResult, setCurrentScanResult, pendingActions } from './types';

// Define local tools for the agent with type casting to bypass Zod mismatch warnings
export const getProjectStructureTool = new FunctionTool({
  name: 'get_project_structure',
  description: 'Returns a summary of the classes, heritage, and dependencies found in the scanned codebase.',
  parameters: z.object({}) as any,
  execute: (async () => {
    if (!currentScanResult) {
      return 'No repository has been scanned yet. Please ask the user to enter a repository URL or path and scan it.';
    }
    const summary = currentScanResult.classes.map(c => ({
      name: c.name,
      file: c.filePath,
      extends: c.baseClass || 'None',
      implements: c.implementsList,
      propertiesCount: c.properties.length,
      methodsCount: c.methods.length,
      dependencies: c.dependencies
    }));
    return JSON.stringify(summary, null, 2);
  }) as any
} as any);

export const readClassCodeTool = new FunctionTool({
  name: 'read_class_code',
  description: 'Reads the source code for a specific class or file in the scanned repository. Reads from disk on demand to avoid memory overhead.',
  parameters: z.object({
    className: z.string().describe('The name of the class or file to inspect')
  }) as any,
  execute: (async ({ className }: any) => {
    if (!currentScanResult) {
      return 'No repository has been scanned yet.';
    }
    const cls = currentScanResult.classes.find(c => c.name.toLowerCase() === className.toLowerCase());
    if (!cls) {
      return `Class or file "${className}" was not found in the scanned codebase.`;
    }

    try {
      const fullPath = path.join(currentScanResult.repoPath, cls.filePath);
      if (fs.existsSync(fullPath)) {
        const fileContent = fs.readFileSync(fullPath, 'utf-8');
        return `File: ${cls.filePath}\n\n\`\`\`\n${fileContent}\n\`\`\``;
      } else {
        return `File not found on disk at path: ${cls.filePath}.\nClass metadata: name=${cls.name}, methods=${cls.methods.length}, properties=${cls.properties.length}`;
      }
    } catch (e: any) {
      return `Error reading file "${cls.filePath}": ${e.message}`;
    }
  }) as any
} as any);

export const highlightClassTool = new FunctionTool({
  name: 'highlight_class_on_mindmap',
  description: 'Highlights a specific class in the frontend mindmap interface for the user.',
  parameters: z.object({
    className: z.string().describe('The name of the class to highlight')
  }) as any,
  execute: (async ({ className }: any) => {
    if (!currentScanResult) return 'No repository scanned.';
    const cls = currentScanResult.classes.find(c => c.name.toLowerCase() === className.toLowerCase());
    if (!cls) return `Class ${className} not found.`;

    pendingActions.push({
      type: 'HIGHLIGHT_CLASS',
      payload: { className: cls.name }
    });
    return `Instructed the frontend to highlight class ${cls.name}.`;
  }) as any
} as any);

export const analyzeRefactorImpactTool = new FunctionTool({
  name: 'analyze_refactor_impact',
  description: 'Analyzes which classes depend on a given class, showing what could break if this class is deleted or modified.',
  parameters: z.object({
    className: z.string().describe('The class to analyze')
  }) as any,
  execute: (async ({ className }: any) => {
    if (!currentScanResult) return 'No repository scanned.';
    const targetCls = currentScanResult.classes.find(c => c.name.toLowerCase() === className.toLowerCase());
    if (!targetCls) return `Class ${className} not found.`;

    const dependents: string[] = [];
    const inheritances: string[] = [];

    currentScanResult.classes.forEach(c => {
      if (c.baseClass && c.baseClass.toLowerCase() === className.toLowerCase()) {
        inheritances.push(c.name);
      } else if (c.dependencies.some(d => d.toLowerCase() === className.toLowerCase())) {
        dependents.push(c.name);
      }
    });

    const analysis = {
      class: targetCls.name,
      filePath: targetCls.filePath,
      extends: targetCls.baseClass || 'None',
      implements: targetCls.implementsList,
      directSubclasses: inheritances,
      dependentClasses: dependents,
      riskLevel: inheritances.length > 0 ? 'CRITICAL' : dependents.length > 5 ? 'HIGH' : dependents.length > 0 ? 'MEDIUM' : 'LOW',
      recommendations: [
        inheritances.length > 0 ? `Must refactor subclasses (${inheritances.join(', ')}) to break inheritance before removal.` : '',
        dependents.length > 0 ? `Must update classes (${dependents.join(', ')}) that import/reference ${targetCls.name}.` : '',
        `Safely delete ${targetCls.filePath} after updating all references.`
      ].filter(r => r !== '')
    };

    return JSON.stringify(analysis, null, 2);
  }) as any
} as any);

export const navigateDashboardTool = new FunctionTool({
  name: 'navigate_dashboard',
  description: 'Navigates the user to a specific tab on the dashboard UI, or switches the active repository connection.',
  parameters: z.object({
    tab: z.enum(['generate', 'mindmap', 'analysis', 'history', 'gitlab', 'architecture', 'documents']).describe('The target tab to display'),
    connectionName: z.string().optional().describe('Optional name of connection profile to switch to')
  }) as any,
  execute: (async ({ tab, connectionName }: any) => {
    pendingActions.push({
      type: 'NAVIGATE',
      payload: { tab, connectionName }
    });
    return `Navigated the user to tab "${tab}"${connectionName ? ` on connection "${connectionName}"` : ''}.`;
  }) as any
} as any);

export const selectMindmapNodeTool = new FunctionTool({
  name: 'select_mindmap_node',
  description: 'Selects a file or class node on the mindmap view, displaying its structural inspector drawer.',
  parameters: z.object({
    nodeName: z.string().describe('The name of the file or class node to inspect')
  }) as any,
  execute: (async ({ nodeName }: any) => {
    pendingActions.push({
      type: 'SELECT_NODE',
      payload: { nodeName }
    });
    return `Selected node "${nodeName}" on the mindmap.`;
  }) as any
} as any);

