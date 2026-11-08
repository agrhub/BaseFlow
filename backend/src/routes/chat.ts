import express from 'express';
import crypto from 'crypto';
import { connectionStore } from '../services/ConnectionStore';
import { 
  createAgentRunner, 
  chatWithAgent, 
  getChatHistory, 
  clearAgentSession,
  releaseAgentSession,
  listConversations,
  ownerOf
} from '../agent/agent';
import { getDevOpsInfo, getOrScanRepo } from '../services/repo';
import { defaultLlmProvider, isLlmProviderConfigured, isLlmProviderId, listLlmProviders, LlmProviderId } from '../llm/providers';

const router = express.Router();
const runnerCache = new Map<string, any>();
const MAX_CACHED_RUNNERS = 50;
const MAX_MESSAGE_LENGTH = 20_000;
const SESSION_ID_RE = /^[A-Za-z0-9_.:-]{1,128}$/;

// Bounded LRU so idle sessions do not leak agent runners (and their MCP subprocesses)
function cacheRunner(sessionId: string, value: any) {
  runnerCache.delete(sessionId);
  runnerCache.set(sessionId, value);
  while (runnerCache.size > MAX_CACHED_RUNNERS) {
    const oldestKey = runnerCache.keys().next().value as string;
    const evicted = runnerCache.get(oldestKey);
    runnerCache.delete(oldestKey);
    // Also drop the evicted session's history and agent state
    releaseAgentSession(oldestKey).catch(() => {});
  }
}

// Never keep raw credentials in cache keys
function hashConfig(parts: string[]): string {
  return crypto.createHash('sha256').update(parts.join('\u0000')).digest('hex');
}

// Agent sessions are namespaced by the browser's signed device id, so one browser
// cannot read or drive another's agent session by guessing its client-side id, and
// saved chats survive logout / re-login and the login expiry.
function scopedSessionId(req: any, clientSessionId: string): string {
  const owner = crypto.createHash('sha256').update(String(req.auth?.deviceId || 'anonymous')).digest('hex').substring(0, 16);
  return `${owner}:${clientSessionId}`;
}

// Resolve the scanned repository for the chat's connection (bound to the agent session)
async function loadScan(connectionName: string | undefined) {
  if (!connectionName) return null;
  try {
    const { repoPath, classes } = await getOrScanRepo(connectionName);
    return { repoPath, classes };
  } catch (err: any) {
    console.warn(`[Chat] Could not load repository for connection ${connectionName}:`, err.message || err);
    return null;
  }
}

// Chat model provider requested by the client (defaults to the server's default provider)
function resolveLlmProvider(requested: unknown): { provider?: LlmProviderId; error?: string } {
  if (requested === undefined || requested === null || requested === '') {
    return { provider: defaultLlmProvider() };
  }
  if (!isLlmProviderId(requested)) return { error: 'Unknown LLM provider.' };
  if (!isLlmProviderConfigured(requested)) return { error: `The ${requested} provider is not configured on this server.` };
  return { provider: requested };
}

function validateChatInput(message: unknown, sessionId: unknown): string | null {
  if (typeof message !== 'string' || !message.trim()) return 'message is required.';
  if (message.length > MAX_MESSAGE_LENGTH) return `message is too long (max ${MAX_MESSAGE_LENGTH} characters).`;
  if (typeof sessionId !== 'string' || !SESSION_ID_RE.test(sessionId)) return 'Invalid sessionId.';
  return null;
}

// 1. Endpoint to chat with the agent
router.post('/chat', async (req: any, res: any) => {
  const { message, connectionName } = req.body;
  const inputError = validateChatInput(message, req.body.sessionId);
  if (inputError) {
    return res.status(400).json({ error: inputError });
  }
  const sessionId = scopedSessionId(req, req.body.sessionId);
  
  let effectiveApiKey = process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY;
  let effectiveGitToken = '';
  let effectiveGitMcpServer = '';
  let repoInfoText = '';
  let effectiveProvider = '';

  if (connectionName) {
    try {
      const profile = await connectionStore.getConnection(connectionName);
      if (profile) {
        effectiveGitToken = profile.options?.gitToken || '';
        effectiveGitMcpServer = profile.options?.gitMcpServer || '';
        
        // Use getDevOpsInfo to correctly resolve local workspace remote URLs as well
        const devops = await getDevOpsInfo(connectionName);
        if (devops && devops.provider !== 'none') {
          effectiveProvider = devops.provider;
          repoInfoText = `\nActive repository details:\nProvider: ${devops.provider}\nOwner: ${devops.owner}\nRepository: ${devops.repo}\nFull GitLab path: ${devops.fullPath || ''}\nUse this information when calling remote repository MCP tools.`;
        }
      }
    } catch (err) {
      console.error('Failed to load profile options for chat:', err);
    }
  }

  const { provider: llmProvider, error: providerError } = resolveLlmProvider(req.body.llmProvider);
  if (!llmProvider || providerError) {
    return res.status(400).json({ error: providerError || 'No LLM provider is configured.' });
  }
  if (!isLlmProviderConfigured(llmProvider)) {
    return res.status(400).json({ error: 'No LLM provider is configured. Set GOOGLE_API_KEY, ANTHROPIC_API_KEY or OPENAI_API_KEY.' });
  }

  try {
    let cached = runnerCache.get(sessionId);
    const configHash = hashConfig([llmProvider, connectionName || '', effectiveApiKey || '', effectiveGitToken || '', effectiveGitMcpServer || '', effectiveProvider || '']);
    if (!cached || cached.configHash !== configHash) {
      console.log(`Creating new agent runner for session ${sessionId} (configHash changed or new session)...`);
      const runner = createAgentRunner({
        apiKey: effectiveApiKey,
        llmProvider,
        gitToken: effectiveGitToken,
        gitMcpServer: effectiveGitMcpServer,
        repoInfo: repoInfoText,
        provider: effectiveProvider
      });
      cached = { runner, configHash };
      cacheRunner(sessionId, cached);
    }
    const runner = cached.runner;

    const uiContext = req.body.uiContext || {};
    console.log(`[Chat] Session ${sessionId} → "${message.substring(0, 60)}..."`);
    const result = await chatWithAgent(runner, sessionId, message, {
      tab: uiContext.tab || '',
      connection: connectionName || '',
      activeItem: uiContext.activeItem || ''
    }, undefined, await loadScan(connectionName));

    return res.json({
      reply: result.reply,
      suggestions: result.suggestions,
      actions: result.actions
    });
  } catch (error: any) {
    const rawMsg: string = error?.message || String(error);
    console.error('[Chat API] Error:', rawMsg.substring(0, 300));
    // Sanitize ADK internal error messages before sending to frontend
    let userMsg = 'An error occurred while processing your request. Please try again.';
    if (rawMsg.includes('model output must contain') || rawMsg.includes('cannot both be empty')) {
      userMsg = 'The AI model returned an empty response. Please try rephrasing your question.';
    } else if (rawMsg.includes('RESOURCE_EXHAUSTED') || rawMsg.includes('429')) {
      userMsg = 'Rate limit reached. Please wait a moment and try again.';
    } else if (rawMsg.includes('apiKey') || rawMsg.includes('API_KEY')) {
      userMsg = 'Invalid or missing API key. Please check your settings.';
    }
    return res.status(500).json({ error: userMsg });
  }
});

// 1.5 Endpoint to chat with the agent (SSE Streaming)
router.post('/chat/stream', async (req: any, res: any) => {
  const { message, connectionName } = req.body;
  const inputError = validateChatInput(message, req.body.sessionId);
  if (inputError) {
    return res.status(400).json({ error: inputError });
  }
  const sessionId = scopedSessionId(req, req.body.sessionId);
  
  let effectiveApiKey = process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY;
  let effectiveGitToken = '';
  let effectiveGitMcpServer = '';
  let repoInfoText = '';
  let effectiveProvider = '';

  if (connectionName) {
    try {
      const profile = await connectionStore.getConnection(connectionName);
      if (profile) {
        effectiveGitToken = profile.options?.gitToken || '';
        effectiveGitMcpServer = profile.options?.gitMcpServer || '';
        const devops = await getDevOpsInfo(connectionName);
        if (devops && devops.provider !== 'none') {
          effectiveProvider = devops.provider;
          repoInfoText = `\nActive repository details:\nProvider: ${devops.provider}\nOwner: ${devops.owner}\nRepository: ${devops.repo}\nFull GitLab path: ${devops.fullPath || ''}\nUse this information when calling remote repository MCP tools.`;
        }
      }
    } catch (err) {
      console.error('Failed to load profile options for stream:', err);
    }
  }

  const { provider: llmProvider, error: providerError } = resolveLlmProvider(req.body.llmProvider);
  if (!llmProvider || providerError) {
    return res.status(400).json({ error: providerError || 'No LLM provider is configured.' });
  }
  if (!isLlmProviderConfigured(llmProvider)) {
    return res.status(400).json({ error: 'No LLM provider is configured. Set GOOGLE_API_KEY, ANTHROPIC_API_KEY or OPENAI_API_KEY.' });
  }

  // Setup SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  try {
    let cached = runnerCache.get(sessionId);
    const configHash = hashConfig([llmProvider, connectionName || '', effectiveApiKey || '', effectiveGitToken || '', effectiveGitMcpServer || '', effectiveProvider || '']);
    if (!cached || cached.configHash !== configHash) {
      const runner = createAgentRunner({
        apiKey: effectiveApiKey,
        llmProvider,
        gitToken: effectiveGitToken,
        gitMcpServer: effectiveGitMcpServer,
        repoInfo: repoInfoText,
        provider: effectiveProvider
      });
      cached = { runner, configHash };
      cacheRunner(sessionId, cached);
    }
    const runner = cached.runner;

    const uiContext = req.body.uiContext || {};
    
    let streamedBytes = 0;
    const onStream = (chunk: string) => {
      streamedBytes += chunk.length;
      res.write(`data: ${JSON.stringify({ chunk })}\n\n`);
    };

    const result = await chatWithAgent(runner, sessionId, message, {
      tab: uiContext.tab || '',
      connection: connectionName || '',
      activeItem: uiContext.activeItem || ''
    }, onStream, await loadScan(connectionName));

    if (streamedBytes === 0 && result.reply) {
      if (result.reply.startsWith('⚠️')) {
        res.write(`data: ${JSON.stringify({ error: result.reply })}\n\n`);
      } else {
        res.write(`data: ${JSON.stringify({ chunk: result.reply })}\n\n`);
      }
    }

    res.write(`data: ${JSON.stringify({ done: true, suggestions: result.suggestions, actions: result.actions })}\n\n`);
    res.end();
  } catch (error: any) {
    const rawMsg: string = error?.message || String(error);
    console.error('[Chat API] Stream Error:', rawMsg.substring(0, 300));
    let userMsg = 'An error occurred while processing your request.';
    if (rawMsg.includes('RESOURCE_EXHAUSTED')) userMsg = 'Rate limit reached.';
    if (rawMsg.includes('apiKey')) userMsg = 'Invalid or missing API key.';
    res.write(`data: ${JSON.stringify({ error: userMsg })}\n\n`);
    res.end();
  }
});

// 2. Get chat history for the current session
router.get('/agent/history', async (req: any, res: any) => {
  const clientId = req.query.sessionId;
  if (clientId !== undefined && (typeof clientId !== 'string' || !SESSION_ID_RE.test(clientId))) {
    return res.status(400).json({ error: 'Invalid sessionId.' });
  }
  const sessionId = clientId ? scopedSessionId(req, clientId) : scopedSessionId(req, 'default');
  const history = await getChatHistory(sessionId);
  res.json({ history });
});

// 3. Clear the agent session and history
router.delete('/agent/session', async (req: any, res: any) => {
  const clientId = req.query.sessionId;
  if (clientId !== undefined && (typeof clientId !== 'string' || !SESSION_ID_RE.test(clientId))) {
    return res.status(400).json({ error: 'Invalid sessionId.' });
  }
  const sessionId = clientId ? scopedSessionId(req, clientId) : scopedSessionId(req, 'default');
  const cached = runnerCache.get(sessionId);
  if (cached) {
    await clearAgentSession(cached.runner, sessionId);
    runnerCache.delete(sessionId);
  }
  res.json({ msg: 'Session cleared successfully' });
});

// 3b. Conversations of this browser (for the conversation list)
router.get('/agent/conversations', async (req: any, res: any) => {
  try {
    const owner = ownerOf(scopedSessionId(req, 'list'));
    const conversations = await listConversations(owner);
    res.json({
      conversations: conversations.map(c => ({
        id: c.id.slice(owner.length + 1), // client-side id
        title: c.title,
        updatedAt: c.updatedAt
      }))
    });
  } catch (err: any) {
    console.error('[Chat] Failed to list conversations:', err?.message || err);
    res.status(500).json({ error: 'Failed to list conversations.' });
  }
});

// 4. Available chat model providers (only metadata, never credentials)
router.get('/llm/providers', (_req: any, res: any) => {
  res.json({ default: defaultLlmProvider(), providers: listLlmProviders() });
});

export default router;
