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
exports.pendingActions = exports.currentScanResult = void 0;
exports.setCurrentScanResult = setCurrentScanResult;
exports.clearPendingActions = clearPendingActions;
exports.createAgentRunner = createAgentRunner;
exports.getChatHistory = getChatHistory;
exports.clearChatHistory = clearChatHistory;
exports.chatWithAgent = chatWithAgent;
exports.clearAgentSession = clearAgentSession;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const zod_1 = require("zod");
const adk_1 = require("@google/adk");
const callbacks_1 = require("./callbacks");
// Shared state for the scanned project
exports.currentScanResult = null;
function setCurrentScanResult(repoPath, classes) {
    exports.currentScanResult = { repoPath, classes };
}
// Collector for frontend actions triggered by tools
exports.pendingActions = [];
function clearPendingActions() {
    const actions = [...exports.pendingActions];
    exports.pendingActions = [];
    return actions;
}
// Define local tools for the agent with type casting to bypass Zod mismatch warnings
const getProjectStructureTool = new adk_1.FunctionTool({
    name: 'get_project_structure',
    description: 'Returns a summary of the classes, heritage, and dependencies found in the scanned codebase.',
    parameters: zod_1.z.object({}),
    execute: (async () => {
        if (!exports.currentScanResult) {
            return 'No repository has been scanned yet. Please ask the user to enter a repository URL or path and scan it.';
        }
        const summary = exports.currentScanResult.classes.map(c => ({
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
const readClassCodeTool = new adk_1.FunctionTool({
    name: 'read_class_code',
    description: 'Reads the source code for a specific class in the scanned repository.',
    parameters: zod_1.z.object({
        className: zod_1.z.string().describe('The name of the class to inspect')
    }),
    execute: (async ({ className }) => {
        if (!exports.currentScanResult) {
            return 'No repository has been scanned yet.';
        }
        const cls = exports.currentScanResult.classes.find(c => c.name.toLowerCase() === className.toLowerCase());
        if (!cls) {
            return `Class ${className} was not found in the scanned codebase.`;
        }
        try {
            const fullPath = path.join(exports.currentScanResult.repoPath, cls.filePath);
            if (fs.existsSync(fullPath)) {
                const fileContent = fs.readFileSync(fullPath, 'utf-8');
                return `File: ${cls.filePath}\n\n\`\`\`\n${fileContent}\n\`\`\–`;
            }
            else {
                return `File not found on disk at ${cls.filePath}, here is the parsed class code:\n\n\`\`\`\n${cls.rawCode}\n\`\`\``;
            }
        }
        catch (e) {
            return `Error reading class file: ${e.message}. Parsed class code:\n\n\`\`\`\n${cls.rawCode}\n\`\`\–`;
        }
    })
});
const highlightClassTool = new adk_1.FunctionTool({
    name: 'highlight_class_on_mindmap',
    description: 'Highlights a specific class in the frontend mindmap interface for the user.',
    parameters: zod_1.z.object({
        className: zod_1.z.string().describe('The name of the class to highlight')
    }),
    execute: (async ({ className }) => {
        if (!exports.currentScanResult)
            return 'No repository scanned.';
        const cls = exports.currentScanResult.classes.find(c => c.name.toLowerCase() === className.toLowerCase());
        if (!cls)
            return `Class ${className} not found.`;
        exports.pendingActions.push({
            type: 'HIGHLIGHT_CLASS',
            payload: { className: cls.name }
        });
        return `Instructed the frontend to highlight class ${cls.name}.`;
    })
});
const analyzeRefactorImpactTool = new adk_1.FunctionTool({
    name: 'analyze_refactor_impact',
    description: 'Analyzes which classes depend on a given class, showing what could break if this class is deleted or modified.',
    parameters: zod_1.z.object({
        className: zod_1.z.string().describe('The class to analyze')
    }),
    execute: (async ({ className }) => {
        if (!exports.currentScanResult)
            return 'No repository scanned.';
        const targetCls = exports.currentScanResult.classes.find(c => c.name.toLowerCase() === className.toLowerCase());
        if (!targetCls)
            return `Class ${className} not found.`;
        const dependents = [];
        const inheritances = [];
        exports.currentScanResult.classes.forEach(c => {
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
const navigateDashboardTool = new adk_1.FunctionTool({
    name: 'navigate_dashboard',
    description: 'Navigates the user to a specific tab on the dashboard UI, or switches the active repository connection.',
    parameters: zod_1.z.object({
        tab: zod_1.z.enum(['generate', 'mindmap', 'analysis', 'history', 'gitlab']).describe('The target tab to display'),
        connectionName: zod_1.z.string().optional().describe('Optional name of connection profile to switch to')
    }),
    execute: (async ({ tab, connectionName }) => {
        exports.pendingActions.push({
            type: 'NAVIGATE',
            payload: { tab, connectionName }
        });
        return `Navigated the user to tab "${tab}"${connectionName ? ` on connection "${connectionName}"` : ''}.`;
    })
});
const selectMindmapNodeTool = new adk_1.FunctionTool({
    name: 'select_mindmap_node',
    description: 'Selects a file or class node on the mindmap view, displaying its structural inspector drawer.',
    parameters: zod_1.z.object({
        nodeName: zod_1.z.string().describe('The name of the file or class node to inspect')
    }),
    execute: (async ({ nodeName }) => {
        exports.pendingActions.push({
            type: 'SELECT_NODE',
            payload: { nodeName }
        });
        return `Selected node "${nodeName}" on the mindmap.`;
    })
});
const writeWorkspaceFileTool = new adk_1.FunctionTool({
    name: 'write_workspace_file',
    description: 'Writes a file (like a skill markdown file or a code fix) to the scanned repository workspace directory. Use this to create skill markdown files at skills/name.md to run on AI agents like Antigravity.',
    parameters: zod_1.z.object({
        filePath: zod_1.z.string().describe('Relative file path inside the repository workspace (e.g. "skills/fix_issue.md")'),
        content: zod_1.z.string().describe('Full content of the file to write')
    }),
    execute: (async ({ filePath, content }) => {
        if (!exports.currentScanResult) {
            return 'No active repository is scanned to write files to. Ask the user to scan a connection first.';
        }
        try {
            const fullPath = path.join(exports.currentScanResult.repoPath, filePath);
            const parentDir = path.dirname(fullPath);
            if (!fs.existsSync(parentDir)) {
                fs.mkdirSync(parentDir, { recursive: true });
            }
            fs.writeFileSync(fullPath, content, 'utf-8');
            return `Successfully wrote file to workspace at ${filePath}.`;
        }
        catch (e) {
            return `Failed to write file: ${e.message}`;
        }
    })
});
function createAgentRunner(config) {
    // Set Gemini API Key for ADK
    process.env.GEMINI_API_KEY = config.apiKey;
    const modelName = process.env.AGENT_MODEL || 'gemini-2.5-flash';
    const tools = [
        getProjectStructureTool,
        readClassCodeTool,
        highlightClassTool,
        analyzeRefactorImpactTool,
        navigateDashboardTool,
        selectMindmapNodeTool,
        writeWorkspaceFileTool
    ];
    // Dynamically add GitHub MCP if token is present
    if (config.githubToken) {
        try {
            console.log('Integrating GitHub MCP Toolset...');
            const githubMcp = new adk_1.MCPToolset({
                type: 'StdioConnectionParams',
                serverParams: {
                    command: 'npx',
                    args: ['-y', '@modelcontextprotocol/server-github'],
                    env: {
                        GITHUB_PERSONAL_ACCESS_TOKEN: config.githubToken,
                        PATH: process.env.PATH || ''
                    }
                }
            }, undefined, 'github');
            tools.push(githubMcp);
        }
        catch (err) {
            console.error('Failed to initialize GitHub MCP:', err);
        }
    }
    // Dynamically add GitLab MCP if token is present
    if (config.gitlabToken) {
        try {
            console.log('Integrating GitLab MCP Toolset...');
            const gitlabMcp = new adk_1.MCPToolset({
                type: 'StdioConnectionParams',
                serverParams: {
                    command: 'npx',
                    args: ['-y', '@yoda.digital/gitlab-mcp-server'],
                    env: {
                        GITLAB_PERSONAL_ACCESS_TOKEN: config.gitlabToken,
                        GITLAB_API_URL: 'https://gitlab.com/api/v4',
                        PATH: process.env.PATH || ''
                    }
                }
            }, undefined, 'gitlab');
            tools.push(gitlabMcp);
        }
        catch (err) {
            console.error('Failed to initialize GitLab MCP:', err);
        }
    }
    // Create Google ADK Agent
    const agent = new adk_1.LlmAgent({
        name: 'class_mindmap_agent',
        description: 'An expert software architect agent that helps analyze repository structures, classes, codebases, suggest refactoring, optimizations, tests, and interact with the class mindmap.',
        model: modelName,
        beforeToolCallback: callbacks_1.beforeTool,
        afterToolCallback: callbacks_1.afterTool,
        beforeModelCallback: callbacks_1.rateLimitCallback,
        instruction: `You are an expert software architect assistant.
Your job is to help users interact with their code repository, which has been scanned and rendered as a class mindmap.
${config.repoInfo || ''}

You have access to tools that can:
1. Get the parsed structure of the project using 'get_project_structure'.
2. Read the full source code of any class using 'read_class_code'.
3. Highlight a class on the mindmap using 'highlight_class_on_mindmap' or 'select_mindmap_node'.
4. Analyze the refactoring impact of a class deletion using 'analyze_refactor_impact'.
5. Navigate the dashboard tab layout using 'navigate_dashboard' (tabs: generate, mindmap, analysis, history, gitlab).
6. If GitHub or GitLab tokens are provided, access MCP tools (prefixed 'github_' or 'gitlab_') for issues, PRs, and CI.
7. Write a file (such as a skill markdown or code file) to the workspace using 'write_workspace_file'.

Guidelines:
- Always check project structure first before answering questions about code.
- If the user asks to switch tabs or connections, call 'navigate_dashboard'.
- For code inspection questions, call 'read_class_code' and highlight with 'select_mindmap_node'.
- Give precise, production-ready suggestions formatted in Markdown.
- For class deletions, always call 'analyze_refactor_impact' first and warn about dependencies.
- If the user asks you to analyze issues/PRs or resolve codebase problems and write a "skill file" to automate it, write a markdown file at "skills/[name].md" containing the step-by-step instructions for AI agents like Antigravity to run and resolve the problem using the 'write_workspace_file' tool.
- You can output visual charts by returning code blocks of type 'chart' containing JSON with this schema:
  \`\`\`chart
  {
    "type": "bar" | "pie" | "line",
    "title": "Chart Title",
    "data": [
      { "label": "Label 1", "value": 10 },
      { "label": "Label 2", "value": 20 }
    ]
  }
  \`\`\`
- You can draw Mermaid diagrams using code blocks of type 'mermaid' (standard mermaid syntax) to explain flows or class relationships.
- At the end of every response, append exactly 4 short follow-up suggestions as a JSON array between [SUGGESTIONS] and [/SUGGESTIONS] tags. Each suggestion should be a short actionable phrase relevant to the conversation.
- If you triggered a navigation action, append the target tab name as JSON between [NAVIGATE] and [/NAVIGATE] tags, e.g. [NAVIGATE]{"tab":"mindmap"}[/NAVIGATE].
`,
        tools
    });
    // Create InMemoryRunner to manage conversation sessions
    const runner = new adk_1.InMemoryRunner({
        agent,
        appName: 'code-mindmap-assistant'
    });
    return runner;
}
// ---- Persistent chat history (in-memory per session) ----
const chatHistoryStore = new Map();
function getChatHistory(sessionId) {
    return chatHistoryStore.get(sessionId) || [];
}
function clearChatHistory(sessionId) {
    chatHistoryStore.delete(sessionId);
}
// ---- High-level chat function with context injection and tag parsing ----
async function chatWithAgent(runner, sessionId, message, uiContext) {
    // Ensure session exists
    const existingSession = await runner.sessionService.getSession({
        appName: runner.appName,
        userId: sessionId,
        sessionId
    });
    if (!existingSession) {
        await runner.sessionService.createSession({
            appName: runner.appName,
            userId: sessionId,
            sessionId
        });
    }
    // Inject UI context into the user message
    let userText = message;
    if (uiContext) {
        const tabStr = uiContext.tab ? `Tab: "${uiContext.tab}"` : 'Tab: generate';
        const connStr = uiContext.connection ? `Connection: "${uiContext.connection}"` : 'Connection: none';
        const itemStr = uiContext.activeItem ? `ActiveItem: "${uiContext.activeItem}"` : 'ActiveItem: none';
        userText = `[UI Context | ${tabStr}, ${connStr}, ${itemStr}]\n${message}`;
    }
    // Save user message to history
    const history = chatHistoryStore.get(sessionId) || [];
    history.push({ role: 'user', content: message });
    chatHistoryStore.set(sessionId, history);
    let responseMessage = '';
    try {
        const eventGenerator = runner.runAsync({
            userId: sessionId,
            sessionId,
            newMessage: { role: 'user', parts: [{ text: userText }] }
        });
        for await (const event of eventGenerator) {
            // Collect text parts
            const textParts = event.content?.parts?.map((p) => p.text).filter(Boolean) || [];
            if (textParts.length > 0) {
                responseMessage += textParts.join('');
            }
            // Surface ADK-level error messages without throwing
            if (event.errorMessage) {
                console.warn(`[Agent] ADK event error (errorCode=${event.errorCode}): ${event.errorMessage}`);
            }
        }
    }
    catch (err) {
        const msg = err?.message || String(err);
        console.error('[Agent] runAsync threw:', msg.substring(0, 200));
        if (msg.includes('model output must contain') || msg.includes('cannot both be empty')) {
            responseMessage = '⚠️ The AI model returned an empty response. Please rephrase your question or try again in a moment.';
        }
        else if (msg.includes('RESOURCE_EXHAUSTED') || msg.includes('429') || msg.includes('rate limit')) {
            responseMessage = '⚠️ Rate limit reached. Please wait a moment and try again.';
        }
        else if (msg.includes('context window') || msg.includes('token')) {
            responseMessage = '⚠️ The conversation is too long. Please clear the chat history and start fresh.';
        }
        else {
            responseMessage = `⚠️ The agent encountered an error: ${msg.substring(0, 120)}. Please try again.`;
        }
    }
    // --- Parse structured [SUGGESTIONS] block ---
    let suggestions = [];
    const suggRegex = /\[SUGGESTIONS\]([\s\S]*?)\[\/SUGGESTIONS\]/i;
    const suggMatch = responseMessage.match(suggRegex);
    if (suggMatch) {
        try {
            const clean = suggMatch[1].replace(/```json/g, '').replace(/```/g, '').trim();
            suggestions = JSON.parse(clean);
        }
        catch (e) { /* ignore parse failure */ }
        responseMessage = responseMessage.replace(suggRegex, '').trim();
    }
    responseMessage = responseMessage.replace(/\[\/?SUGGESTIONS\]/gi, '').trim();
    // --- Parse structured [NAVIGATE] block ---
    let navigate;
    const navRegex = /\[NAVIGATE\]([\s\S]*?)\[\/NAVIGATE\]/i;
    const navMatch = responseMessage.match(navRegex);
    if (navMatch) {
        try {
            const clean = navMatch[1].replace(/```json/g, '').replace(/```/g, '').trim();
            navigate = JSON.parse(clean);
        }
        catch (e) { /* ignore */ }
        responseMessage = responseMessage.replace(navRegex, '').trim();
    }
    // Collect pending actions accumulated by tool executions during this run
    const actions = clearPendingActions();
    // Merge navigate from tag into actions array for unified frontend handling
    if (navigate) {
        actions.push({ type: 'NAVIGATE', payload: navigate });
    }
    // Save assistant response to history
    history.push({ role: 'assistant', content: responseMessage });
    chatHistoryStore.set(sessionId, history);
    return {
        reply: responseMessage,
        suggestions: suggestions.length > 0 ? suggestions : undefined,
        navigate,
        actions
    };
}
async function clearAgentSession(runner, sessionId) {
    try {
        await runner.sessionService.deleteSession({
            appName: runner.appName,
            userId: sessionId,
            sessionId
        });
        clearChatHistory(sessionId);
        console.log(`[Agent] Cleared session: ${sessionId}`);
    }
    catch (err) {
        console.error(`[Agent] Failed to clear session ${sessionId}:`, err);
    }
}
