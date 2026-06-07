"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const ConnectionStore_1 = require("../services/ConnectionStore");
const agent_1 = require("../agent/agent");
const helpers_1 = require("./helpers");
const router = express_1.default.Router();
const runnerCache = new Map();
// 1. Endpoint to chat with the agent
router.post('/chat', async (req, res) => {
    const { message, sessionId, connectionName } = req.body;
    let effectiveApiKey = process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY;
    let effectiveGitToken = '';
    let effectiveGitMcpServer = '';
    let repoInfoText = '';
    let effectiveProvider = '';
    if (connectionName) {
        try {
            const profile = await ConnectionStore_1.connectionStore.getConnection(connectionName);
            if (profile) {
                effectiveGitToken = profile.options?.gitToken || '';
                effectiveGitMcpServer = profile.options?.gitMcpServer || '';
                // Use getDevOpsInfo to correctly resolve local workspace remote URLs as well
                const devops = await (0, helpers_1.getDevOpsInfo)(connectionName);
                if (devops && devops.provider !== 'none') {
                    effectiveProvider = devops.provider;
                    repoInfoText = `\nActive repository details:\nProvider: ${devops.provider}\nOwner: ${devops.owner}\nRepository: ${devops.repo}\nFull GitLab path: ${devops.fullPath || ''}\nUse this information when calling remote repository MCP tools.`;
                }
            }
        }
        catch (err) {
            console.error('Failed to load profile options for chat:', err);
        }
    }
    if (!message || !sessionId || !effectiveApiKey) {
        return res.status(400).json({ error: 'message, sessionId, and apiKey are required.' });
    }
    try {
        let cached = runnerCache.get(sessionId);
        const configHash = `${connectionName || ''}_${effectiveApiKey || ''}_${effectiveGitToken || ''}_${effectiveGitMcpServer || ''}_${effectiveProvider || ''}`;
        if (!cached || cached.configHash !== configHash) {
            console.log(`Creating new agent runner for session ${sessionId} (configHash changed or new session)...`);
            const runner = (0, agent_1.createAgentRunner)({
                apiKey: effectiveApiKey,
                gitToken: effectiveGitToken,
                gitMcpServer: effectiveGitMcpServer,
                repoInfo: repoInfoText,
                provider: effectiveProvider
            });
            cached = { runner, configHash };
            runnerCache.set(sessionId, cached);
        }
        const runner = cached.runner;
        const uiContext = req.body.uiContext || {};
        console.log(`[Chat] Session ${sessionId} → "${message.substring(0, 60)}..."`);
        const result = await (0, agent_1.chatWithAgent)(runner, sessionId, message, {
            tab: uiContext.tab || '',
            connection: connectionName || '',
            activeItem: uiContext.activeItem || ''
        });
        return res.json({
            reply: result.reply,
            suggestions: result.suggestions,
            actions: result.actions
        });
    }
    catch (error) {
        const rawMsg = error?.message || String(error);
        console.error('[Chat API] Error:', rawMsg.substring(0, 300));
        // Sanitize ADK internal error messages before sending to frontend
        let userMsg = 'An error occurred while processing your request. Please try again.';
        if (rawMsg.includes('model output must contain') || rawMsg.includes('cannot both be empty')) {
            userMsg = 'The AI model returned an empty response. Please try rephrasing your question.';
        }
        else if (rawMsg.includes('RESOURCE_EXHAUSTED') || rawMsg.includes('429')) {
            userMsg = 'Rate limit reached. Please wait a moment and try again.';
        }
        else if (rawMsg.includes('apiKey') || rawMsg.includes('API_KEY')) {
            userMsg = 'Invalid or missing API key. Please check your settings.';
        }
        return res.status(500).json({ error: userMsg });
    }
});
// 1.5 Endpoint to chat with the agent (SSE Streaming)
router.post('/chat/stream', async (req, res) => {
    const { message, sessionId, connectionName } = req.body;
    let effectiveApiKey = process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY;
    let effectiveGitToken = '';
    let effectiveGitMcpServer = '';
    let repoInfoText = '';
    let effectiveProvider = '';
    if (connectionName) {
        try {
            const profile = await ConnectionStore_1.connectionStore.getConnection(connectionName);
            if (profile) {
                effectiveGitToken = profile.options?.gitToken || '';
                effectiveGitMcpServer = profile.options?.gitMcpServer || '';
                const devops = await (0, helpers_1.getDevOpsInfo)(connectionName);
                if (devops && devops.provider !== 'none') {
                    effectiveProvider = devops.provider;
                    repoInfoText = `\nActive repository details:\nProvider: ${devops.provider}\nOwner: ${devops.owner}\nRepository: ${devops.repo}\nFull GitLab path: ${devops.fullPath || ''}\nUse this information when calling remote repository MCP tools.`;
                }
            }
        }
        catch (err) {
            console.error('Failed to load profile options for stream:', err);
        }
    }
    if (!message || !sessionId || !effectiveApiKey) {
        return res.status(400).json({ error: 'message, sessionId, and apiKey are required.' });
    }
    // Setup SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    try {
        let cached = runnerCache.get(sessionId);
        const configHash = `${connectionName || ''}_${effectiveApiKey || ''}_${effectiveGitToken || ''}_${effectiveGitMcpServer || ''}_${effectiveProvider || ''}`;
        if (!cached || cached.configHash !== configHash) {
            const runner = (0, agent_1.createAgentRunner)({
                apiKey: effectiveApiKey,
                gitToken: effectiveGitToken,
                gitMcpServer: effectiveGitMcpServer,
                repoInfo: repoInfoText,
                provider: effectiveProvider
            });
            cached = { runner, configHash };
            runnerCache.set(sessionId, cached);
        }
        const runner = cached.runner;
        const uiContext = req.body.uiContext || {};
        let streamedBytes = 0;
        const onStream = (chunk) => {
            streamedBytes += chunk.length;
            res.write(`data: ${JSON.stringify({ chunk })}\n\n`);
        };
        const result = await (0, agent_1.chatWithAgent)(runner, sessionId, message, {
            tab: uiContext.tab || '',
            connection: connectionName || '',
            activeItem: uiContext.activeItem || ''
        }, onStream);
        if (streamedBytes === 0 && result.reply) {
            if (result.reply.startsWith('⚠️')) {
                res.write(`data: ${JSON.stringify({ error: result.reply })}\n\n`);
            }
            else {
                res.write(`data: ${JSON.stringify({ chunk: result.reply })}\n\n`);
            }
        }
        res.write(`data: ${JSON.stringify({ done: true, suggestions: result.suggestions, actions: result.actions })}\n\n`);
        res.end();
    }
    catch (error) {
        const rawMsg = error?.message || String(error);
        console.error('[Chat API] Stream Error:', rawMsg.substring(0, 300));
        let userMsg = 'An error occurred while processing your request.';
        if (rawMsg.includes('RESOURCE_EXHAUSTED'))
            userMsg = 'Rate limit reached.';
        if (rawMsg.includes('apiKey'))
            userMsg = 'Invalid or missing API key.';
        res.write(`data: ${JSON.stringify({ error: userMsg })}\n\n`);
        res.end();
    }
});
// 2. Get chat history for the current session
router.get('/agent/history', (req, res) => {
    const sessionId = req.session?.id || 'default';
    const history = (0, agent_1.getChatHistory)(sessionId);
    res.json({ history });
});
// 3. Clear the agent session and history
router.delete('/agent/session', async (req, res) => {
    const sessionId = req.session?.id || 'default';
    const cached = runnerCache.get(sessionId);
    if (cached) {
        await (0, agent_1.clearAgentSession)(cached.runner, sessionId);
        runnerCache.delete(sessionId);
    }
    res.json({ msg: 'Session cleared successfully' });
});
exports.default = router;
