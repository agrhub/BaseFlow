import express from 'express';
import * as path from 'path';
import * as fs from 'fs';
import { getOrScanRepo } from './helpers';
import { parseRepository } from '../utils/parser';
import { geminiService } from '../services/GeminiService';
import { getDocAnalysisPrompt, getGenerateSkillPrompt, getDocChatPrompt } from '../prompts/prompts';

const PENDO_TRACK_URL = 'https://data.pendo.io/data/track';
const PENDO_INTEGRATION_KEY = '3f27a34f-5946-4ee0-b3ec-2763bcea8e49';

async function pendoTrack(event: string, properties: Record<string, any> = {}) {
  try {
    await fetch(PENDO_TRACK_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-pendo-integration-key': PENDO_INTEGRATION_KEY
      },
      body: JSON.stringify({
        type: 'track',
        event,
        visitorId: 'system',
        accountId: 'system',
        timestamp: Date.now(),
        properties
      })
    });
  } catch (e) {
    console.error('Pendo track error:', e);
  }
}

const router = express.Router();

// 1. GET Recurse Markdown files list
router.get('/:conn/documents', async (req, res) => {
  const { conn } = req.params;
  try {
    const { repoPath } = await getOrScanRepo(conn);
    const mdFiles: string[] = [];
    
    function scanDir(dir: string) {
      if (!fs.existsSync(dir)) return;
      const items = fs.readdirSync(dir);
      for (const item of items) {
        if (item.startsWith('.') || ['node_modules', 'dist', 'build', 'venv', 'bin', 'obj', 'target', 'out'].includes(item)) {
          continue;
        }
        const fullPath = path.join(dir, item);
        const stat = fs.statSync(fullPath);
        if (stat.isDirectory()) {
          scanDir(fullPath);
        } else if (item.toLowerCase().endsWith('.md')) {
          mdFiles.push(path.relative(repoPath, fullPath).replace(/\\/g, '/'));
        }
      }
    }
    
    scanDir(repoPath);
    res.json({ documents: mdFiles });
  } catch (error: any) {
    console.error('Documents listing error:', error);
    res.status(500).json({ error: error.message });
  }
});

// 2. GET Document file contents
router.get('/:conn/documents/content', async (req, res) => {
  const { conn } = req.params;
  const docPath = req.query.path as string;
  if (!docPath) {
    return res.status(400).json({ error: 'path parameter is required' });
  }
  try {
    const { repoPath } = await getOrScanRepo(conn);
    const safePath = path.resolve(path.join(repoPath, docPath));
    if (!safePath.startsWith(path.resolve(repoPath))) {
      return res.status(403).json({ error: 'Access denied' });
    }
    if (!fs.existsSync(safePath)) {
      return res.status(404).json({ error: 'File not found' });
    }
    const content = fs.readFileSync(safePath, 'utf-8');
    res.json({ content });
  } catch (error: any) {
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
    const { repoPath } = await getOrScanRepo(conn);
    
    // Check cache first
    const cachePath = path.join(repoPath, '.baseflow_doc_analyses.json');
    let cacheData: Record<string, any> = {};
    if (fs.existsSync(cachePath)) {
      try {
        cacheData = JSON.parse(fs.readFileSync(cachePath, 'utf-8'));
        if (cacheData[docPath]) {
          console.log(`Loading cached document analysis for ${docPath}...`);
          return res.json(cacheData[docPath]);
        }
      } catch (e) {
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

    let jsonResult: any = {};
    try {
      const prompt = getDocAnalysisPrompt(docPath, content);
      jsonResult = await geminiService.generateJSON<any>(prompt);
    } catch (parseErr) {
      console.error('Failed to generate doc analysis response:', parseErr);
    }
    
    // Save to cache
    try {
      cacheData[docPath] = jsonResult;
      fs.writeFileSync(cachePath, JSON.stringify(cacheData, null, 2), 'utf-8');
    } catch (cacheErr) {
      console.warn('Failed to write doc analyses cache:', cacheErr);
    }

    res.json(jsonResult);
  } catch (error: any) {
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
    const { repoPath } = await getOrScanRepo(conn);
    const useVertex = process.env.GOOGLE_GENAI_USE_VERTEXAI === '1' || process.env.GOOGLE_GENAI_USE_VERTEXAI === 'true';
    const apiKey = process.env.GOOGLE_API_KEY || '';
    if (!apiKey && !useVertex) {
      return res.status(400).json({ error: 'API Key not configured' });
    }

    const prompt = getGenerateSkillPrompt(content);
    const skillContent = await geminiService.generateContent(prompt);
    const cleanName = path.basename(docPath || 'document.md').replace(/\.[^/.]+$/, '').toLowerCase().replace(/[^a-z0-9]/g, '_');
    const targetSkillPath = path.join('skills', `run_${cleanName || 'generated'}.md`);
    const fullSkillPath = path.join(repoPath, targetSkillPath);
    
    const parentDir = path.dirname(fullSkillPath);
    if (!fs.existsSync(parentDir)) {
      fs.mkdirSync(parentDir, { recursive: true });
    }
    fs.writeFileSync(fullSkillPath, skillContent, 'utf-8');

    pendoTrack('skill_generated', {
      connection_name: conn,
      source_document_path: docPath || ''
    });

    res.json({
      success: true,
      filePath: targetSkillPath,
      content: skillContent
    });
  } catch (error: any) {
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

    const chatHistory = Array.isArray(history) ? history.map((h: any) => ({
      role: h.sender === 'user' ? 'user' : 'model',
      parts: [{ text: h.text }]
    })) : [];

    const promptText = getDocChatPrompt(docPath, content, query);

    chatHistory.push({
      role: 'user',
      parts: [{ text: promptText }]
    });

    const reply = await geminiService.generateContent(chatHistory);
    res.json({ reply });
  } catch (error: any) {
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
    const { repoPath } = await getOrScanRepo(conn);
    const safePath = path.resolve(path.join(repoPath, docPath));
    if (!safePath.startsWith(path.resolve(repoPath))) {
      return res.status(403).json({ error: 'Access denied' });
    }
    const parentDir = path.dirname(safePath);
    if (!fs.existsSync(parentDir)) {
      fs.mkdirSync(parentDir, { recursive: true });
    }
    fs.writeFileSync(safePath, content, 'utf-8');
    pendoTrack('document_file_saved', {
      connection_name: conn,
      file_path: docPath,
      content_length: content.length
    });
    res.json({ success: true, msg: 'File saved successfully' });
  } catch (error: any) {
    console.error('Document save error:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
