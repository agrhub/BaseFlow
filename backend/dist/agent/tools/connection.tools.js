"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.selectMindmapNodeTool = exports.navigateDashboardTool = exports.analyzeRefactorImpactTool = exports.highlightClassTool = exports.readClassCodeTool = exports.getProjectStructureTool = void 0;
// import { ParsedClass } from '../../utils/parser';
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const zod_1 = require("zod");
const adk_1 = require("@google/adk");
const types_1 = require("./types");
// Define local tools for the agent with type casting to bypass Zod mismatch warnings
exports.getProjectStructureTool = new adk_1.FunctionTool({
    name: 'get_project_structure',
    description: 'Returns a summary of the classes, heritage, and dependencies found in the scanned codebase.',
    parameters: zod_1.z.object({}),
    execute: (async () => {
        if (!types_1.currentScanResult) {
            return 'No repository has been scanned yet. Please ask the user to enter a repository URL or path and scan it.';
        }
        const summary = types_1.currentScanResult.classes.map(c => ({
            name: c.name,
            file: c.filePath,
            extends: c.baseClass || 'None',
            implements: c.implementsList,
            propertiesCount: c.properties.length,
            methodsCount: c.methods.length,
            dependencies: c.dependencies
        }));
        return JSON.stringify(summary, null, 2);
    })
});
exports.readClassCodeTool = new adk_1.FunctionTool({
    name: 'read_class_code',
    description: 'Reads the source code for a specific class or file in the scanned repository. Reads from disk on demand to avoid memory overhead.',
    parameters: zod_1.z.object({
        className: zod_1.z.string().describe('The name of the class or file to inspect')
    }),
    execute: (async ({ className }) => {
        if (!types_1.currentScanResult) {
            return 'No repository has been scanned yet.';
        }
        const cls = types_1.currentScanResult.classes.find(c => c.name.toLowerCase() === className.toLowerCase());
        if (!cls) {
            return `Class or file "${className}" was not found in the scanned codebase.`;
        }
        try {
            const fullPath = path.join(types_1.currentScanResult.repoPath, cls.filePath);
            if (fs.existsSync(fullPath)) {
                const fileContent = fs.readFileSync(fullPath, 'utf-8');
                return `File: ${cls.filePath}\n\n\`\`\`\n${fileContent}\n\`\`\``;
            }
            else {
                return `File not found on disk at path: ${cls.filePath}.\nClass metadata: name=${cls.name}, methods=${cls.methods.length}, properties=${cls.properties.length}`;
            }
        }
        catch (e) {
            return `Error reading file "${cls.filePath}": ${e.message}`;
        }
    })
});
exports.highlightClassTool = new adk_1.FunctionTool({
    name: 'highlight_class_on_mindmap',
    description: 'Highlights a specific class in the frontend mindmap interface for the user.',
    parameters: zod_1.z.object({
        className: zod_1.z.string().describe('The name of the class to highlight')
    }),
    execute: (async ({ className }) => {
        if (!types_1.currentScanResult)
            return 'No repository scanned.';
        const cls = types_1.currentScanResult.classes.find(c => c.name.toLowerCase() === className.toLowerCase());
        if (!cls)
            return `Class ${className} not found.`;
        types_1.pendingActions.push({
            type: 'HIGHLIGHT_CLASS',
            payload: { className: cls.name }
        });
        return `Instructed the frontend to highlight class ${cls.name}.`;
    })
});
exports.analyzeRefactorImpactTool = new adk_1.FunctionTool({
    name: 'analyze_refactor_impact',
    description: 'Analyzes which classes depend on a given class, showing what could break if this class is deleted or modified.',
    parameters: zod_1.z.object({
        className: zod_1.z.string().describe('The class to analyze')
    }),
    execute: (async ({ className }) => {
        if (!types_1.currentScanResult)
            return 'No repository scanned.';
        const targetCls = types_1.currentScanResult.classes.find(c => c.name.toLowerCase() === className.toLowerCase());
        if (!targetCls)
            return `Class ${className} not found.`;
        const dependents = [];
        const inheritances = [];
        types_1.currentScanResult.classes.forEach(c => {
            if (c.baseClass && c.baseClass.toLowerCase() === className.toLowerCase()) {
                inheritances.push(c.name);
            }
            else if (c.dependencies.some(d => d.toLowerCase() === className.toLowerCase())) {
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
    })
});
exports.navigateDashboardTool = new adk_1.FunctionTool({
    name: 'navigate_dashboard',
    description: 'Navigates the user to a specific tab on the dashboard UI, or switches the active repository connection.',
    parameters: zod_1.z.object({
        tab: zod_1.z.enum(['generate', 'mindmap', 'analysis', 'history', 'gitlab', 'architecture', 'documents']).describe('The target tab to display'),
        connectionName: zod_1.z.string().optional().describe('Optional name of connection profile to switch to')
    }),
    execute: (async ({ tab, connectionName }) => {
        types_1.pendingActions.push({
            type: 'NAVIGATE',
            payload: { tab, connectionName }
        });
        return `Navigated the user to tab "${tab}"${connectionName ? ` on connection "${connectionName}"` : ''}.`;
    })
});
exports.selectMindmapNodeTool = new adk_1.FunctionTool({
    name: 'select_mindmap_node',
    description: 'Selects a file or class node on the mindmap view, displaying its structural inspector drawer.',
    parameters: zod_1.z.object({
        nodeName: zod_1.z.string().describe('The name of the file or class node to inspect')
    }),
    execute: (async ({ nodeName }) => {
        types_1.pendingActions.push({
            type: 'SELECT_NODE',
            payload: { nodeName }
        });
        return `Selected node "${nodeName}" on the mindmap.`;
    })
});
