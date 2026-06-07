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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
const helpers_1 = require("./helpers");
const GeminiService_1 = require("../services/GeminiService");
const prompts_1 = require("../prompts/prompts");
const router = express_1.default.Router();
// 1. GET Recurse Markdown files list
router.get('/:conn/documents', async (req, res) => {
    const { conn } = req.params;
    try {
        const { repoPath } = await (0, helpers_1.getOrScanRepo)(conn);
        const mdFiles = [];
        function scanDir(dir) {
            if (!fs.existsSync(dir))
                return;
            const items = fs.readdirSync(dir);
            for (const item of items) {
                if (item.startsWith('.') || ['node_modules', 'dist', 'build', 'venv', 'bin', 'obj', 'target', 'out'].includes(item)) {
                    continue;
                }
                const fullPath = path.join(dir, item);
                const stat = fs.statSync(fullPath);
                if (stat.isDirectory()) {
                    scanDir(fullPath);
                }
                else if (item.toLowerCase().endsWith('.md')) {
                    mdFiles.push(path.relative(repoPath, fullPath).replace(/\\/g, '/'));
                }
            }
        }
        scanDir(repoPath);
        res.json({ documents: mdFiles });
    }
    catch (error) {
        console.error('Documents listing error:', error);
        res.status(500).json({ error: error.message });
    }
});
// 2. GET Document file contents
router.get('/:conn/documents/content', async (req, res) => {
    const { conn } = req.params;
    const docPath = req.query.path;
    if (!docPath) {
        return res.status(400).json({ error: 'path parameter is required' });
    }
    try {
        const { repoPath } = await (0, helpers_1.getOrScanRepo)(conn);
        const safePath = path.resolve(path.join(repoPath, docPath));
        if (!safePath.startsWith(path.resolve(repoPath))) {
            return res.status(403).json({ error: 'Access denied' });
        }
        if (!fs.existsSync(safePath)) {
            return res.status(404).json({ error: 'File not found' });
        }
        const content = fs.readFileSync(safePath, 'utf-8');
        res.json({ content });
    }
    catch (error) {
        console.error('Document read error:', error);
        res.status(500).json({ error: error.message });
    }
});
// 3. POST Document structure AI Analysis
router.post('/:conn/documents/analyze', async (req, res) => {
    const { conn } = req.params;
    const { content, path: docPath } = req.body;
    if (!content) {
        return res.status(400).json({ error: 'content is required' });
    }
    try {
        const { repoPath } = await (0, helpers_1.getOrScanRepo)(conn);
        // Check cache first
        const cachePath = path.join(repoPath, '.baseflow_doc_analyses.json');
        let cacheData = {};
        if (fs.existsSync(cachePath)) {
            try {
                cacheData = JSON.parse(fs.readFileSync(cachePath, 'utf-8'));
                if (cacheData[docPath]) {
                    console.log(`Loading cached document analysis for ${docPath}...`);
                    return res.json(cacheData[docPath]);
                }
            }
            catch (e) {
                console.warn('Failed to parse cached doc analyses:', e);
            }
        }
        const useVertex = process.env.GOOGLE_GENAI_USE_VERTEXAI === '1' || process.env.GOOGLE_GENAI_USE_VERTEXAI === 'true';
        const apiKey = process.env.GOOGLE_API_KEY || '';
        if (!apiKey && !useVertex) {
            return res.json({
                summary: 'No Gemini API Key found.',
                insights: ['Unable to analyze without API key.'],
                suggestions: ['Please configure GOOGLE_API_KEY in the .env file.']
            });
        }
        let jsonResult = {};
        try {
            const prompt = (0, prompts_1.getDocAnalysisPrompt)(docPath, content);
            jsonResult = await GeminiService_1.geminiService.generateJSON(prompt);
        }
        catch (parseErr) {
            console.error('Failed to generate doc analysis response:', parseErr);
        }
        // Save to cache
        try {
            cacheData[docPath] = jsonResult;
            fs.writeFileSync(cachePath, JSON.stringify(cacheData, null, 2), 'utf-8');
        }
        catch (cacheErr) {
            console.warn('Failed to write doc analyses cache:', cacheErr);
        }
        res.json(jsonResult);
    }
    catch (error) {
        console.error('Document analysis error:', error);
        res.status(500).json({ error: error.message });
    }
});
// 4. POST Generate Playbook / Skill Markdown file in workspace
router.post('/:conn/documents/generate-skill', async (req, res) => {
    const { conn } = req.params;
    const { content, path: docPath } = req.body;
    if (!content) {
        return res.status(400).json({ error: 'content is required' });
    }
    try {
        const { repoPath } = await (0, helpers_1.getOrScanRepo)(conn);
        const useVertex = process.env.GOOGLE_GENAI_USE_VERTEXAI === '1' || process.env.GOOGLE_GENAI_USE_VERTEXAI === 'true';
        const apiKey = process.env.GOOGLE_API_KEY || '';
        if (!apiKey && !useVertex) {
            return res.status(400).json({ error: 'API Key not configured' });
        }
        const prompt = (0, prompts_1.getGenerateSkillPrompt)(content);
        const skillContent = await GeminiService_1.geminiService.generateContent(prompt);
        const cleanName = path.basename(docPath || 'document.md').replace(/\.[^/.]+$/, '').toLowerCase().replace(/[^a-z0-9]/g, '_');
        const targetSkillPath = path.join('skills', `run_${cleanName || 'generated'}.md`);
        const fullSkillPath = path.join(repoPath, targetSkillPath);
        const parentDir = path.dirname(fullSkillPath);
        if (!fs.existsSync(parentDir)) {
            fs.mkdirSync(parentDir, { recursive: true });
        }
        fs.writeFileSync(fullSkillPath, skillContent, 'utf-8');
        res.json({
            success: true,
            filePath: targetSkillPath,
            content: skillContent
        });
    }
    catch (error) {
        console.error('Skill generation error:', error);
        res.status(500).json({ error: error.message });
    }
});
// 5. POST Document contextual Chat
router.post('/:conn/documents/chat', async (req, res) => {
    const { conn } = req.params;
    const { content, path: docPath, query, history } = req.body;
    if (!query) {
        return res.status(400).json({ error: 'query is required' });
    }
    try {
        const useVertex = process.env.GOOGLE_GENAI_USE_VERTEXAI === '1' || process.env.GOOGLE_GENAI_USE_VERTEXAI === 'true';
        const apiKey = process.env.GOOGLE_API_KEY || '';
        if (!apiKey && !useVertex) {
            return res.json({ reply: 'API key not configured.' });
        }
        const chatHistory = Array.isArray(history) ? history.map((h) => ({
            role: h.sender === 'user' ? 'user' : 'model',
            parts: [{ text: h.text }]
        })) : [];
        const promptText = (0, prompts_1.getDocChatPrompt)(docPath, content, query);
        chatHistory.push({
            role: 'user',
            parts: [{ text: promptText }]
        });
        const reply = await GeminiService_1.geminiService.generateContent(chatHistory);
        res.json({ reply });
    }
    catch (error) {
        console.error('Document chat error:', error);
        res.status(500).json({ error: error.message });
    }
});
// 6. POST Update/Save Document contents
router.post('/:conn/documents/content', async (req, res) => {
    const { conn } = req.params;
    const { path: docPath, content } = req.body;
    if (!docPath) {
        return res.status(400).json({ error: 'path parameter is required' });
    }
    if (content === undefined) {
        return res.status(400).json({ error: 'content parameter is required' });
    }
    try {
        const { repoPath } = await (0, helpers_1.getOrScanRepo)(conn);
        const safePath = path.resolve(path.join(repoPath, docPath));
        if (!safePath.startsWith(path.resolve(repoPath))) {
            return res.status(403).json({ error: 'Access denied' });
        }
        const parentDir = path.dirname(safePath);
        if (!fs.existsSync(parentDir)) {
            fs.mkdirSync(parentDir, { recursive: true });
        }
        fs.writeFileSync(safePath, content, 'utf-8');
        res.json({ success: true, msg: 'File saved successfully' });
    }
    catch (error) {
        console.error('Document save error:', error);
        res.status(500).json({ error: error.message });
    }
});
exports.default = router;
