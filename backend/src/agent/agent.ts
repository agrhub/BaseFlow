import { LlmAgent, FunctionTool, MCPToolset, Runner, InMemorySessionService, DatabaseSessionService, BaseLlm, BaseSessionService } from '@google/adk';
import { rateLimitCallback, beforeTool, afterTool } from './shared_libraries/callbacks';
import { getAgentInstruction } from '../prompts/prompts';
import { createAgentModel, LlmProviderId } from '../llm/providers';
import { allTools, drainActions, bindAgentSession, forgetAgentSession, ScanResult } from "./tools";

// Setup Agent and Runner Builder
interface AgentConfig {
  /** Gemini API key (only used by the Gemini provider) */
  apiKey?: string;
  /** Chat model provider: gemini (default), anthropic or openai */
  llmProvider?: LlmProviderId;
  /** Explicit model instance (tests) — overrides llmProvider */
  model?: string | BaseLlm;
  gitToken?: string;
  repoInfo?: string;
  gitMcpServer?: string;
  provider?: string;
}

const APP_NAME = 'baseflow-assistant';

/**
 * Agent session store shared by every runner.
 * SESSION_DB_URL selects a database (sqlite://<file> for a single host,
 * postgres://… for several instances); otherwise sessions live in memory and
 * are lost on restart.
 */
function createSessionService(): { service: BaseSessionService; persistent: boolean } {
  const url = process.env.SESSION_DB_URL || '';
  if (/^(sqlite|postgres|postgresql|mysql|mariadb|mssql):\/\//.test(url)) {
    console.log(`[Agent] Using database session store (${url.split('://')[0]})`);
    return { service: new DatabaseSessionService(url), persistent: true };
  }
  if (url) console.warn('[Agent] Ignoring unsupported SESSION_DB_URL; using in-memory sessions.');
  return { service: new InMemorySessionService(), persistent: false };
}

const { service: sharedSessionService, persistent: persistentSessions } = createSessionService();

/**
 * Chat session ids are "<owner>:<client id>" (owner = hashed browser id, see routes/chat.ts).
 * The owner is used as the ADK user id so a browser's conversations can be listed.
 */
export function ownerOf(sessionId: string): string {
  const i = sessionId.indexOf(':');
  return i > 0 ? sessionId.slice(0, i) : sessionId;
}

export interface ConversationSummary {
  /** Full (scoped) session id */
  id: string;
  title: string;
  /** Last update, epoch milliseconds */
  updatedAt: number;
}

/** Most recent conversations of one browser (newest first). */
export async function listConversations(owner: string, limit = 50): Promise<ConversationSummary[]> {
  const { sessions } = await sharedSessionService.listSessions({ appName: APP_NAME, userId: owner });
  const recent = [...(sessions || [])]
    .sort((a, b) => (Number(b.lastUpdateTime) || 0) - (Number(a.lastUpdateTime) || 0))
    .slice(0, limit);
  // listSessions omits session state, so read each title (with a single recent event)
  return Promise.all(recent.map(async summary => {
    const full = await sharedSessionService.getSession({
      appName: APP_NAME,
      userId: owner,
      sessionId: summary.id,
      config: { numRecentEvents: 1 }
    });
    const title = full?.state?.title;
    const t = Number(summary.lastUpdateTime) || 0;
    return {
      id: summary.id,
      title: typeof title === 'string' && title ? title : 'Untitled conversation',
      // Stores report seconds or milliseconds
      updatedAt: t > 0 && t < 1e12 ? Math.round(t * 1000) : t
    };
  }));
}

export function createAgentRunner(config: AgentConfig) {
  const llmProvider: LlmProviderId = config.llmProvider || 'gemini';
  // Set Gemini API Key for ADK's built-in Gemini model
  if (llmProvider === 'gemini' && config.apiKey) {
    process.env.GEMINI_API_KEY = config.apiKey;
  }

  const model = config.model || createAgentModel(llmProvider);

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
            // Token passed via env var (expanded by mcp-remote) so it never appears in process listings
            args: [
              '-y',
              'mcp-remote',
              mcpEndpoint,
              '--header',
              'Authorization:${BASEFLOW_MCP_AUTH}'
            ],
            env: {
              PATH: process.env.PATH || '',
              BASEFLOW_MCP_AUTH: `token ${config.gitToken}`
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
            // Token passed via env var (expanded by mcp-remote) so it never appears in process listings
            args: [
              '-y',
              'mcp-remote',
              mcpEndpoint,
              '--header',
              'PRIVATE-TOKEN:${BASEFLOW_MCP_AUTH}'
            ],
            env: {
              PATH: process.env.PATH || '',
              BASEFLOW_MCP_AUTH: config.gitToken
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
    model,
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

  // All runners share one session store, so a chat keeps its history when a new runner is
  // created for it (switching the model provider, connection or credentials). Sessions are
  // keyed by the scoped chat session id and removed by clearAgentSession.
  const runner = new Runner({
    agent,
    appName: APP_NAME,
    sessionService: sharedSessionService
  });

  return runner;
}

// ---- Persistent chat history (in-memory per session) ----
const chatHistoryStore: Map<string, Array<{ role: string; content: string }>> = new Map();

export const activeStreams = new Map<string, (chunk: string) => void>();

const UI_CONTEXT_PREFIX = /^\[UI Context \|[^\n]*\]\n/;

/**
 * Visible chat history. With the in-memory store it is kept in a local cache.
 * With a persistent store it is always rebuilt from the session events, so it
 * stays correct after a restart and when several instances serve one chat.
 */
export async function getChatHistory(sessionId: string): Promise<Array<{ role: string; content: string }>> {
  const cached = persistentSessions ? undefined : chatHistoryStore.get(sessionId);
  if (cached) return cached;
  try {
    const session = await sharedSessionService.getSession({ appName: APP_NAME, userId: ownerOf(sessionId), sessionId });
    if (!session) return [];
    const history: Array<{ role: string; content: string }> = [];
    for (const event of session.events || []) {
      const parts = event.content?.parts || [];
      const text = parts.filter((p: any) => typeof p.text === 'string' && !p.thought).map((p: any) => p.text).join('');
      if (!text) continue;
      if (event.author === 'user') {
        history.push({ role: 'user', content: text.replace(UI_CONTEXT_PREFIX, '') });
      } else {
        const last = history[history.length - 1];
        if (last && last.role === 'assistant') last.content += text;
        else history.push({ role: 'assistant', content: text });
      }
    }
    if (!persistentSessions) chatHistoryStore.set(sessionId, history);
    return history;
  } catch (err) {
    console.warn(`[Agent] Could not load history for ${sessionId}:`, err);
    return [];
  }
}

/**
 * Drop the in-memory state of a chat session (runner cache eviction). With a
 * persistent store the conversation itself is kept so it can be resumed.
 */
export async function releaseAgentSession(sessionId: string): Promise<void> {
  if (!persistentSessions) {
    await clearAgentSession(undefined, sessionId);
    return;
  }
  clearChatHistory(sessionId);
  forgetAgentSession(sessionId);
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
  onStream?: (textChunk: string) => void,
  scan?: ScanResult | null
): Promise<{
  reply: string;
  suggestions?: string[];
  navigate?: { tab?: string; connectionName?: string };
  actions: Array<{ type: string; payload: any }>;
}> {
  if (onStream) {
    activeStreams.set(sessionId, onStream);
  }
  // Bind this chat session to its own connection / repository (tools look it up via ToolContext)
  bindAgentSession(sessionId, uiContext?.connection || '', scan || null);
  drainActions(sessionId); // discard stale actions from an aborted previous run
  try {
    // Ensure session exists
    const existingSession = await (runner as any).sessionService.getSession({
      appName: (runner as any).appName,
      userId: ownerOf(sessionId),
      sessionId
    });
    if (!existingSession) {
      await (runner as any).sessionService.createSession({
        appName: (runner as any).appName,
        userId: ownerOf(sessionId),
        sessionId,
        // Shown in the conversation list
        state: { title: message.trim().replace(/\s+/g, ' ').slice(0, 80) }
      });
    }

  // Inject UI context and session details into the user message
  const tabStr = uiContext?.tab ? `Tab: "${uiContext.tab}"` : 'Tab: generate';
  const connStr = uiContext?.connection ? `Connection: "${uiContext.connection}"` : 'Connection: none';
  const itemStr = uiContext?.activeItem ? `ActiveItem: "${uiContext.activeItem}"` : 'ActiveItem: none';
  const sessionStr = `SessionId: "${sessionId}"`;
  const userText = `[UI Context | ${tabStr}, ${connStr}, ${itemStr}, ${sessionStr}]\n${message}`;

  // Save user message to history
  const history = await getChatHistory(sessionId);
  history.push({ role: 'user', content: message });
  if (!persistentSessions) chatHistoryStore.set(sessionId, history);

  let responseMessage = '';
  try {
    const eventGenerator = runner.runAsync({
      userId: ownerOf(sessionId),
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
  } finally {
    activeStreams.delete(sessionId);
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
  const actions = drainActions(sessionId);

  // Merge navigate from tag into actions array for unified frontend handling
  if (navigate) {
    actions.push({ type: 'NAVIGATE', payload: navigate });
  }

  // Save assistant response to history
  history.push({ role: 'assistant', content: responseMessage });
  if (!persistentSessions) chatHistoryStore.set(sessionId, history);

  return {
    reply: responseMessage,
    suggestions: suggestions.length > 0 ? suggestions : undefined,
    navigate,
    actions
  };
  } catch (err: any) {
    console.error('[Agent] chatWithAgent outer error:', err);
    throw err;
  } finally {
    activeStreams.delete(sessionId);
  }
}

export async function clearAgentSession(_runner: unknown, sessionId: string): Promise<void> {
  try {
    await sharedSessionService.deleteSession({
      appName: APP_NAME,
      userId: ownerOf(sessionId),
      sessionId
    });
    clearChatHistory(sessionId);
    forgetAgentSession(sessionId);
    console.log(`[Agent] Cleared session: ${sessionId}`);
  } catch (err) {
    console.error(`[Agent] Failed to clear session ${sessionId}:`, err);
  }
}
