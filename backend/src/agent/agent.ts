import { LlmAgent, FunctionTool, MCPToolset, InMemoryRunner } from '@google/adk';
import { rateLimitCallback, beforeTool, afterTool } from './shared_libraries/callbacks';
import { getAgentInstruction } from '../prompts/prompts';
import { allTools, clearPendingActions  } from "./tools";

// Setup Agent and Runner Builder
interface AgentConfig {
  apiKey: string;
  gitToken?: string;
  repoInfo?: string;
  gitMcpServer?: string;
  provider?: string;
}

export function createAgentRunner(config: AgentConfig) {
  // Set Gemini API Key for ADK
  process.env.GEMINI_API_KEY = config.apiKey;

  const modelName = process.env.AGENT_MODEL || 'gemini-3.1-flash-lite';

  const tools: any[] = [
    ...allTools
  ];

  // Dynamically add GitHub MCP if token is present and provider is github
  if (config.gitToken && config.provider === 'github') {
    try {
      console.log('Integrating GitHub MCP Toolset...');
      const mcpEndpoint = config.gitMcpServer;
      const isRemoteMcp = mcpEndpoint && mcpEndpoint.startsWith('http');

      if (isRemoteMcp) {
        console.log(`Integrating GitHub MCP Toolset via mcp-remote: ${mcpEndpoint}`);
        const githubMcp = new MCPToolset({
          type: 'StdioConnectionParams',
          serverParams: {
            command: 'npx',
            args: [
              '-y',
              'mcp-remote',
              mcpEndpoint,
              '--header',
              `Authorization: token ${config.gitToken}`
            ],
            env: {
              PATH: process.env.PATH || ''
            }
          }
        }, undefined, 'github');
        tools.push(githubMcp);
      } else {
        const githubMcp = new MCPToolset({
          type: 'StdioConnectionParams',
          serverParams: {
            command: 'npx',
            args: ['-y', '@modelcontextprotocol/server-github'],
            env: {
              GITHUB_PERSONAL_ACCESS_TOKEN: config.gitToken,
              PATH: process.env.PATH || ''
            }
          }
        }, undefined, 'github');
        tools.push(githubMcp);
      }
    } catch (err) {
      console.error('Failed to initialize GitHub MCP:', err);
    }
  }

  // Dynamically add GitLab Duo MCP or Community GitLab MCP if token is present and provider is gitlab
  // Uses the official GitLab Duo MCP endpoint (ending in /mcp): https://gitlab.com/api/v4/mcp
  // Or community GitLab MCP server: https://gitlab.com/api/v4 (no /mcp)
  if (config.gitToken && config.provider === 'gitlab') {
    try {
      const mcpEndpoint = config.gitMcpServer || "https://gitlab.com/api/v4";
      const isOfficialDuoMcp = mcpEndpoint.endsWith('/mcp');

      if (isOfficialDuoMcp) {
        console.log('Integrating GitLab Duo MCP Toolset via mcp-remote...');
        const gitlabMcp = new MCPToolset({
          type: 'StdioConnectionParams',
          serverParams: {
            command: 'npx',
            args: [
              '-y',
              'mcp-remote',
              mcpEndpoint,
              '--header',
              `PRIVATE-TOKEN: ${config.gitToken}`
            ],
            env: {
              PATH: process.env.PATH || ''
            }
          }
        }, undefined, 'gitlab');
        tools.push(gitlabMcp);
        console.log('GitLab Duo MCP connected successfully.');
      } else {
        console.log('Integrating community GitLab MCP Toolset (@zereight/mcp-gitlab)...');
        let apiUrl = mcpEndpoint;
        // Clean to base instance URL for @zereight/mcp-gitlab
        if (apiUrl.includes('/api/v4')) {
          apiUrl = apiUrl.substring(0, apiUrl.indexOf('/api/v4'));
        }
        const gitlabMcp = new MCPToolset({
          type: 'StdioConnectionParams',
          serverParams: {
            command: 'npx',
            args: ['-y', '@zereight/mcp-gitlab'],
            env: {
              GITLAB_PERSONAL_ACCESS_TOKEN: config.gitToken,
              GITLAB_API_URL: apiUrl,
              PATH: process.env.PATH || ''
            }
          }
        }, undefined, 'gitlab');
        tools.push(gitlabMcp);
        console.log('Community GitLab MCP connected successfully.');
      }
    } catch (err) {
      console.error('Failed to initialize GitLab MCP:', err);
    }
  }

  // Create Google ADK Agent
  const agent = new LlmAgent({
    name: 'class_mindmap_agent',
    description: 'An expert software architect agent that helps analyze repository structures, classes, codebases, suggest refactoring, optimizations, tests, DevOps health, and interact with the class mindmap.',
    model: modelName,
    beforeToolCallback: beforeTool,
    afterToolCallback: afterTool,
    beforeModelCallback: rateLimitCallback,
    instruction: getAgentInstruction({
      repoInfo: config.repoInfo,
      hasGitLabMcp: !!config.gitToken && config.provider === 'gitlab',
      hasGitHubMcp: !!config.gitToken && config.provider === 'github'
    }),
    tools
  });

  // Create InMemoryRunner to manage conversation sessions
  const runner = new InMemoryRunner({
    agent,
    appName: 'baseflow-assistant'
  });

  return runner;
}

// ---- Persistent chat history (in-memory per session) ----
const chatHistoryStore: Map<string, Array<{ role: string; content: string }>> = new Map();

export function getChatHistory(sessionId: string) {
  return chatHistoryStore.get(sessionId) || [];
}

export function clearChatHistory(sessionId: string) {
  chatHistoryStore.delete(sessionId);
}

// ---- High-level chat function with context injection and tag parsing ----
export async function chatWithAgent(
  runner: any,
  sessionId: string,
  message: string,
  uiContext?: { tab?: string; connection?: string; activeItem?: string },
  onStream?: (textChunk: string) => void
): Promise<{
  reply: string;
  suggestions?: string[];
  navigate?: { tab?: string; connectionName?: string };
  actions: Array<{ type: string; payload: any }>;
}> {
  // Ensure session exists
  const existingSession = await (runner as any).sessionService.getSession({
    appName: (runner as any).appName,
    userId: sessionId,
    sessionId
  });
  if (!existingSession) {
    await (runner as any).sessionService.createSession({
      appName: (runner as any).appName,
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
      const textParts = event.content?.parts?.map((p: any) => p.text).filter(Boolean) || [];
      if (textParts.length > 0) {
        const chunk = textParts.join('');
        responseMessage += chunk;
        if (onStream) onStream(chunk);
      }
      // Surface ADK-level error messages without throwing
      if (event.errorMessage) {
        console.warn(`[Agent] ADK event error (errorCode=${event.errorCode}): ${event.errorMessage}`);
      }
    }
  } catch (err: any) {
    const msg: string = err?.message || String(err);
    console.error('[Agent] runAsync threw:', msg.substring(0, 200));
    if (msg.includes('model output must contain') || msg.includes('cannot both be empty')) {
      responseMessage = '⚠️ The AI model returned an empty response. Please rephrase your question or try again in a moment.';
    } else if (msg.includes('RESOURCE_EXHAUSTED') || msg.includes('429') || msg.includes('rate limit')) {
      responseMessage = '⚠️ Rate limit reached. Please wait a moment and try again.';
    } else if (msg.includes('context window') || msg.includes('token')) {
      responseMessage = '⚠️ The conversation is too long. Please clear the chat history and start fresh.';
    } else {
      responseMessage = `⚠️ The agent encountered an error: ${msg.substring(0, 120)}. Please try again.`;
    }
  }


  // --- Parse structured [SUGGESTIONS] block ---
  let suggestions: string[] = [];
  const suggRegex = /\[SUGGESTIONS\]([\s\S]*?)\[\/SUGGESTIONS\]/i;
  const suggMatch = responseMessage.match(suggRegex);
  if (suggMatch) {
    try {
      const clean = suggMatch[1].replace(/```json/g, '').replace(/```/g, '').trim();
      suggestions = JSON.parse(clean);
    } catch (e) { /* ignore parse failure */ }
    responseMessage = responseMessage.replace(suggRegex, '').trim();
  } else {
    // Handle unclosed suggestions block
    const unclosedSuggRegex = /\[SUGGESTIONS\]([\s\S]*)$/i;
    const unclosedSuggMatch = responseMessage.match(unclosedSuggRegex);
    if (unclosedSuggMatch) {
      try {
        const clean = unclosedSuggMatch[1].replace(/```json/g, '').replace(/```/g, '').trim();
        suggestions = JSON.parse(clean);
      } catch (e) { /* ignore */ }
      responseMessage = responseMessage.replace(unclosedSuggRegex, '').trim();
    }
  }
  responseMessage = responseMessage.replace(/\[\/?SUGGESTIONS\]/gi, '').trim();

  // --- Parse structured [NAVIGATE] block ---
  let navigate: { tab?: string; connectionName?: string } | undefined;
  const navRegex = /\[NAVIGATE\]([\s\S]*?)\[\/NAVIGATE\]/i;
  const navMatch = responseMessage.match(navRegex);
  if (navMatch) {
    try {
      const clean = navMatch[1].replace(/```json/g, '').replace(/```/g, '').trim();
      navigate = JSON.parse(clean);
    } catch (e) { /* ignore */ }
    responseMessage = responseMessage.replace(navRegex, '').trim();
  } else {
    // Handle unclosed navigate block
    const unclosedNavRegex = /\[NAVIGATE\]([\s\S]*)$/i;
    const unclosedNavMatch = responseMessage.match(unclosedNavRegex);
    if (unclosedNavMatch) {
      try {
        const clean = unclosedNavMatch[1].replace(/```json/g, '').replace(/```/g, '').trim();
        navigate = JSON.parse(clean);
      } catch (e) { /* ignore */ }
      responseMessage = responseMessage.replace(unclosedNavRegex, '').trim();
    }
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

export async function clearAgentSession(runner: any, sessionId: string): Promise<void> {
  try {
    await (runner as any).sessionService.deleteSession({
      appName: (runner as any).appName,
      userId: sessionId,
      sessionId
    });
    clearChatHistory(sessionId);
    console.log(`[Agent] Cleared session: ${sessionId}`);
  } catch (err) {
    console.error(`[Agent] Failed to clear session ${sessionId}:`, err);
  }
}
