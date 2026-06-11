import express from 'express';
import * as path from 'path';
import * as fs from 'fs';
import { exec } from 'child_process';
import { getOrScanRepo, resolveFilePathWithFallback, parseGitUrl } from './helpers';
import { parseRepository } from '../utils/parser';
import { geminiService } from '../services/GeminiService';
import { getDocAnalysisPrompt, getGenerateSkillPrompt, getDocChatPrompt } from '../prompts/prompts';
import { connectionStore } from '../services/ConnectionStore';
import { createPatch } from 'diff';

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
    const { resolvedFilePath, activeRepoRoot } = resolveFilePathWithFallback(repoPath, docPath);
    if (!resolvedFilePath.startsWith(path.resolve(activeRepoRoot))) {
      return res.status(403).json({ error: 'Access denied' });
    }
    if (!fs.existsSync(resolvedFilePath)) {
      return res.status(404).json({ error: 'File not found' });
    }
    const content = fs.readFileSync(resolvedFilePath, 'utf-8');
    res.json({ content });
  } catch (error: any) {
    console.error('Document read error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Helper to fetch base file content from Git APIs (GitHub / GitLab)
async function fetchBaseFileContent(profile: any, relativePath: string): Promise<string> {
  const uri = profile.uri || '';
  const parsed = parseGitUrl(uri);
  if (!parsed) {
    throw new Error(`Invalid Git repository URL: ${uri}`);
  }

  const { provider, owner, repo, fullPath } = parsed;
  const branch = profile.options?.branch || '';
  const token = profile.options?.gitToken;
  const username = profile.options?.gitUsername;

  let url = '';
  const headers: Record<string, string> = {
    'User-Agent': 'BaseFlow-App'
  };

  if (provider === 'github') {
    url = `https://api.github.com/repos/${owner}/${repo}/contents/${relativePath}`;
    if (branch) {
      url += `?ref=${encodeURIComponent(branch)}`;
    }
    headers['Accept'] = 'application/vnd.github.v3.raw';
    if (token) {
      headers['Authorization'] = `token ${token}`;
    }
  } else if (provider === 'gitlab') {
    let resolvedBranch = branch;
    if (!resolvedBranch) {
      try {
        const projUrl = `https://gitlab.com/api/v4/projects/${encodeURIComponent(fullPath)}`;
        const headers: Record<string, string> = {};
        if (token) {
          if (username === 'oauth2') {
            headers['Authorization'] = `Bearer ${token}`;
          } else {
            headers['PRIVATE-TOKEN'] = token;
          }
        }
        const projRes = await fetch(projUrl, { headers });
        if (projRes.ok) {
          const projData = await projRes.json() as any;
          resolvedBranch = projData.default_branch || 'main';
        } else {
          resolvedBranch = 'main';
        }
      } catch (e) {
        resolvedBranch = 'main';
      }
    }
    url = `https://gitlab.com/api/v4/projects/${encodeURIComponent(fullPath)}/repository/files/${encodeURIComponent(relativePath)}/raw?ref=${encodeURIComponent(resolvedBranch)}`;
    if (token) {
      if (username === 'oauth2') {
        headers['Authorization'] = `Bearer ${token}`;
      } else {
        headers['PRIVATE-TOKEN'] = token;
      }
    }
  } else {
    throw new Error(`Unsupported Git provider: ${provider}`);
  }

  console.log(`[VCS API] Fetching base file content from: ${url}`);
  const response = await fetch(url, { headers });
  if (response.status === 404) {
    // File not found on remote (it's a new file)
    return '';
  }
  if (!response.ok) {
    throw new Error(`Git API error: ${response.statusText} (${response.status})`);
  }
  return response.text();
}

// 2b. GET Document file diff (git diff or VCS API diff)
router.get('/:conn/documents/diff', async (req, res) => {
  const { conn } = req.params;
  const docPath = req.query.path as string;
  if (!docPath) {
    return res.status(400).json({ error: 'path parameter is required' });
  }
  try {
    const { repoPath } = await getOrScanRepo(conn);
    const { resolvedFilePath, activeRepoRoot } = resolveFilePathWithFallback(repoPath, docPath);
    if (!resolvedFilePath.startsWith(path.resolve(activeRepoRoot))) {
      return res.status(403).json({ error: 'Access denied' });
    }
    if (!fs.existsSync(resolvedFilePath)) {
      return res.status(404).json({ error: 'File not found' });
    }
    
    const relativePath = path.relative(repoPath, resolvedFilePath).replace(/\\/g, '/');
    const hasGit = fs.existsSync(path.join(repoPath, '.git'));

    if (hasGit) {
      exec(`git ls-files --error-unmatch "${relativePath}"`, { cwd: repoPath }, (lsError) => {
        if (lsError) {
          // File is untracked, compare with empty file
          const nullDev = '/dev/null';
          exec(`git diff --no-index ${nullDev} "${relativePath}"`, { cwd: repoPath }, (diffError, diffStdout) => {
            res.json({ diff: diffStdout || '' });
          });
        } else {
          // File is tracked, run git diff HEAD
          exec(`git diff HEAD -- "${relativePath}"`, { cwd: repoPath }, (diffError, diffStdout, diffStderr) => {
            if (diffError && diffError.code && diffError.code > 1) {
              return res.status(500).json({ error: diffStderr || diffError.message });
            }
            res.json({ diff: diffStdout || '' });
          });
        }
      });
    } else {
      // No local git repo. Fetch base content from Git API and diff in JS
      const profile = await connectionStore.getConnection(conn);
      if (!profile) {
        return res.status(404).json({ error: 'Connection profile not found' });
      }

      let baseContent = '';
      try {
        baseContent = await fetchBaseFileContent(profile, relativePath);
      } catch (apiErr: any) {
        console.warn(`[VCS API] Failed to fetch base file content for ${relativePath}, treating as untracked:`, apiErr.message);
      }

      const localContent = fs.readFileSync(resolvedFilePath, 'utf-8');
      const diff = createPatch(relativePath, baseContent, localContent);
      res.json({ diff });
    }
  } catch (error: any) {
    console.error('Document diff error:', error);
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
    res.json({ success: true, msg: 'File saved successfully' });
  } catch (error: any) {
    console.error('Document save error:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
