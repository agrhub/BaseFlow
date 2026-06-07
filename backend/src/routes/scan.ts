import express from 'express';
import * as path from 'path';
import * as fs from 'fs';
import { simpleGit } from 'simple-git';
import { parseRepository, ParseResult } from '../utils/parser';
import { setCurrentScanResult } from '../agent/tools';
import { 
  getOrScanRepo, 
  getDevOpsInfo, 
  fetchGitHubRepoStats, 
  fetchGitLabRepoStats, 
  resolveRepoPath, 
  tempDir,
  generateReadmeAnalysis,
  performCompleteAnalysis,
  clearRepoCache
} from './helpers';
import { geminiService } from '../services/GeminiService';
import { getClassAnalysisPrompt } from '../prompts/prompts';

const router = express.Router();

// 1. Sidebar Tree list mapping "Subdirectories" -> "[Classes]"
router.get('/:conn/sidebar', async (req, res) => {
  const { conn } = req.params;
  try {
    const { classes } = await getOrScanRepo(conn);
    
    // Group files/classes by subdirectory relative path
    const sidebar_list: Record<string, string[]> = {};
    classes.forEach(c => {
      let dir = path.dirname(c.filePath);
      if (dir === '.' || dir === '') {
        dir = 'root';
      }
      dir = dir.replace(/\\/g, '/');
      
      if (!sidebar_list[dir]) {
        sidebar_list[dir] = [];
      }
      if (!sidebar_list[dir].includes(c.name)) {
        sidebar_list[dir].push(c.name);
      }
    });

    // Sort key/values
    const sorted_list: Record<string, string[]> = {};
    Object.keys(sidebar_list).sort().forEach(key => {
      sorted_list[key] = sidebar_list[key].sort();
    });

    res.json({ sidebar_list: sorted_list });
  } catch (error: any) {
    console.error('Sidebar API error:', error);
    res.status(500).json({ error: error.message });
  }
});

function isBinaryBuffer(buffer: Buffer): boolean {
  const bytesToCheck = Math.min(buffer.length, 1024);
  let binaryCount = 0;
  for (let i = 0; i < bytesToCheck; i++) {
    const byte = buffer[i];
    if (byte === 0) {
      return true; // Null byte always indicates binary
    }
    if (byte < 32 && byte !== 9 && byte !== 10 && byte !== 13) {
      binaryCount++;
    }
  }
  if (bytesToCheck > 0 && (binaryCount / bytesToCheck) > 0.1) {
    return true;
  }
  return false;
}

function getMimeType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  const mimeMap: Record<string, string> = {
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.webp': 'image/webp',
    '.ico': 'image/x-icon',
    '.bmp': 'image/bmp',
    '.mp4': 'video/mp4',
    '.webm': 'video/webm',
    '.ogg': 'video/ogg',
    '.mov': 'video/quicktime',
    '.mp3': 'audio/mpeg',
    '.wav': 'audio/wav',
    '.aac': 'audio/aac',
    '.pdf': 'application/pdf',
    '.doc': 'application/msword',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.xls': 'application/vnd.ms-excel',
    '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    '.ppt': 'application/vnd.ms-powerpoint',
    '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    '.html': 'text/html',
    '.htm': 'text/html',
    '.css': 'text/css',
    '.js': 'application/javascript',
    '.ts': 'application/typescript',
    '.json': 'application/json'
  };
  return mimeMap[ext] || 'application/octet-stream';
}

// 1b. Read source file content on demand (replaces rawCode in cache)
router.get('/:conn/file-content', async (req, res) => {
  const { conn } = req.params;
  const filePath = req.query.path as string;
  if (!filePath) {
    return res.status(400).json({ error: 'Query param "path" is required' });
  }
  try {
    const { repoPath } = await getOrScanRepo(conn);
    // Security: prevent path traversal outside repo
    const fullPath = path.resolve(repoPath, filePath);
    const relative = path.relative(repoPath, fullPath);
    if (relative.startsWith('..') || path.isAbsolute(relative)) {
      return res.status(403).json({ error: 'Access denied: path traversal not allowed' });
    }
    if (!fs.existsSync(fullPath)) {
      return res.status(404).json({ error: `File not found: ${filePath}` });
    }

    const stat = fs.statSync(fullPath);
    
    // Check if the file is binary first by reading the first 1024 bytes
    const fd = fs.openSync(fullPath, 'r');
    const headerBuffer = Buffer.alloc(1024);
    const headerBytesRead = fs.readSync(fd, headerBuffer, 0, headerBuffer.length, 0);
    fs.closeSync(fd);

    const isBinary = isBinaryBuffer(headerBuffer.subarray(0, headerBytesRead));
    let mimeType = getMimeType(filePath);

    // Override for MPEG-TS file extension clash
    if (path.extname(filePath).toLowerCase() === '.ts' && isBinary) {
      mimeType = 'video/mp2t';
    }
    
    let content = '';
    let truncated = false;

    if (isBinary) {
      content = '';
    } else {
      const maxSize = 1 * 1024 * 1024; // 1 MB limit
      if (stat.size > maxSize) {
        // Read first 200 KB
        const fd2 = fs.openSync(fullPath, 'r');
        const buffer = Buffer.alloc(200 * 1024);
        const bytesRead = fs.readSync(fd2, buffer, 0, buffer.length, 0);
        fs.closeSync(fd2);
        content = buffer.toString('utf-8', 0, bytesRead) + `\n\n... [File truncated: File size is ${(stat.size / (1024 * 1024)).toFixed(2)} MB. Showing first 200 KB only] ...`;
        truncated = true;
      } else {
        content = fs.readFileSync(fullPath, 'utf-8');
      }
    }

    res.json({ content, filePath, truncated, size: stat.size, isBinary, mimeType });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// 1c. Stream raw file content (for media preview elements: img, video, pdf, etc.)
router.get('/:conn/file-raw', async (req, res) => {
  const { conn } = req.params;
  const filePath = req.query.path as string;
  if (!filePath) {
    return res.status(400).json({ error: 'Query param "path" is required' });
  }
  try {
    const { repoPath } = await getOrScanRepo(conn);
    // Security: prevent path traversal outside repo
    const fullPath = path.resolve(repoPath, filePath);
    const relative = path.relative(repoPath, fullPath);
    if (relative.startsWith('..') || path.isAbsolute(relative)) {
      return res.status(403).json({ error: 'Access denied: path traversal not allowed' });
    }
    if (!fs.existsSync(fullPath)) {
      return res.status(404).json({ error: `File not found: ${filePath}` });
    }

    // Determine and set content-type header
    let mimeType = getMimeType(filePath);
    
    // Check if binary to handle .ts MPEG-TS video file correctly
    const fd = fs.openSync(fullPath, 'r');
    const headerBuffer = Buffer.alloc(1024);
    const headerBytesRead = fs.readSync(fd, headerBuffer, 0, headerBuffer.length, 0);
    fs.closeSync(fd);
    if (path.extname(filePath).toLowerCase() === '.ts' && isBinaryBuffer(headerBuffer.subarray(0, headerBytesRead))) {
      mimeType = 'video/mp2t';
    }

    res.setHeader('Content-Type', mimeType);
    res.sendFile(fullPath);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});


// 2. Repository Overview statistics
router.get('/:conn/stats', async (req, res) => {
  const { conn } = req.params;
  try {
    const { repoPath, classes, graph } = await getOrScanRepo(conn);
    
    // Compute languages breakdown
    const extsCount: Record<string, number> = {};
    let totalCount = 0;
    classes.forEach(c => {
      const ext = path.extname(c.filePath).toLowerCase();
      extsCount[ext] = (extsCount[ext] || 0) + 1;
      totalCount++;
    });

    const langNames: Record<string, string> = {
      '.ts': 'TypeScript',
      '.tsx': 'TypeScript (JSX)',
      '.js': 'JavaScript',
      '.jsx': 'JavaScript (JSX)',
      '.py': 'Python',
      '.java': 'Java',
      '.cs': 'C#',
    };

    const languages = Object.keys(extsCount).map(ext => ({
      name: langNames[ext] || ext.toUpperCase(),
      count: extsCount[ext],
      percentage: totalCount > 0 ? Math.round((extsCount[ext] / totalCount) * 100) : 0
    }));

    // Fetch commit history and group by date
    let commits: any[] = [];
    const commitCountsByDate: Record<string, number> = {};
    try {
      const git = simpleGit(repoPath);
      const log = await git.log({ maxCount: 100 });
      commits = log.all.slice(0, 15).map(c => ({
        hash: c.hash.substring(0, 7),
        date: c.date,
        author: c.author_name,
        message: c.message
      }));

      // Calculate daily activity for last 14 days
      log.all.forEach(c => {
        const d = new Date(c.date);
        if (isNaN(d.getTime())) return;
        const dateStr = d.toISOString().split('T')[0];
        commitCountsByDate[dateStr] = (commitCountsByDate[dateStr] || 0) + 1;
      });
    } catch (e) {
      console.warn('Could not read Git logs (possibly not a git repo or no commits yet):', e);
    }

    let commitActivity: Array<{ date: string; count: number }> = [];
    for (let i = 13; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split('T')[0];
      commitActivity.push({
        date: dateStr,
        count: commitCountsByDate[dateStr] || 0
      });
    }

    // Load forks/stars remote statistics if configured
    let stars = 0;
    let forks = 0;
    let watchers = 0;
    let remoteCommitActivity: any = null;
    
    try {
      const cachePath = path.join(repoPath, '.baseflow_remote_stats_cache.json');
      let cachedStats = null;
      if (fs.existsSync(cachePath)) {
        try {
           const parsed = JSON.parse(fs.readFileSync(cachePath, 'utf-8'));
           if (Date.now() - parsed.timestamp < 86400000) { // 24 hours cache
              cachedStats = parsed;
           }
        } catch (e) {}
      }
      
      if (cachedStats) {
        stars = cachedStats.stars;
        forks = cachedStats.forks;
        watchers = cachedStats.watchers;
        if (cachedStats.commitActivity) {
           remoteCommitActivity = cachedStats.commitActivity;
        }
      } else {
        const devops = await getDevOpsInfo(conn);
        if (devops && devops.provider !== 'none') {
          let statsData = null;
          const token = devops.profile.options?.gitToken;
          if (devops.provider === 'github') {
            statsData = await fetchGitHubRepoStats(devops.owner, devops.repo, token);
          } else if (devops.provider === 'gitlab') {
            statsData = await fetchGitLabRepoStats(devops.fullPath, token);
          }
          
          if (statsData) {
            stars = statsData.stars;
            forks = statsData.forks;
            watchers = statsData.watchers;
            remoteCommitActivity = statsData.commitActivity;
            
            fs.writeFileSync(cachePath, JSON.stringify({
              timestamp: Date.now(),
              stars, forks, watchers,
              commitActivity: remoteCommitActivity
            }), 'utf-8');
          }
        }
      }
    } catch (err) {
      console.error('Failed to load DevOps stats for overview:', err);
    }

    if (remoteCommitActivity) {
      commitActivity = remoteCommitActivity;
    }

    res.json({
      classesCount: classes.length,
      languages,
      commits,
      commitActivity,
      stars,
      forks,
      watchers,
      nodesCount: graph.nodes.length,
      edgesCount: graph.edges.length,
      path: repoPath
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// 3. README analysis using Gemini API (with caching)
router.get('/:conn/readme-analysis', async (req, res) => {
  const { conn } = req.params;
  try {
    const { repoPath } = await getOrScanRepo(conn);
    
    // Check cache first
    const cachePath = path.join(repoPath, '.baseflow_readme_analysis.json');
    if (fs.existsSync(cachePath)) {
      try {
        const cached = JSON.parse(fs.readFileSync(cachePath, 'utf-8'));
        return res.json(cached);
      } catch (e) {
        console.warn('Failed to parse cached readme analysis, will regenerate:', e);
      }
    }
    
    const analysis = await generateReadmeAnalysis(conn, repoPath);
    res.json(analysis);
  } catch (error: any) {
    console.error('Readme analysis error:', error);
    res.status(500).json({ error: error.message });
  }
});

// 4. Selected class/file details & Gemini analysis endpoint
router.post('/:conn/class-analysis', async (req, res) => {
  const { conn } = req.params;
  const { className } = req.body;
  if (!className) {
    return res.status(400).json({ error: 'className parameter is required.' });
  }

  try {
    const { repoPath, classes } = await getOrScanRepo(conn);
    const targetCls = classes.find(c => c.name.toLowerCase() === className.toLowerCase());
    if (!targetCls) {
      return res.status(404).json({ error: `Class or File ${className} not found.` });
    }

    const useVertex = process.env.GOOGLE_GENAI_USE_VERTEXAI === '1' || process.env.GOOGLE_GENAI_USE_VERTEXAI === 'true';
    const apiKey = process.env.GOOGLE_API_KEY || '';
    if (!apiKey && !useVertex) {
      return res.json({
        analysis: 'No Gemini API Key configured in backend environment. Please set GOOGLE_API_KEY in the .env file to enable structural analysis.'
      });
    }

    const dependencies = targetCls.dependencies || [];
    const baseClass = targetCls.baseClass || 'None';
    const implementsList = targetCls.implementsList || [];
    const methods = targetCls.methods ? targetCls.methods.map(m => m.name) : [];
    const properties = targetCls.properties ? targetCls.properties.map(p => p.name) : [];

    const promptText = getClassAnalysisPrompt({
      name: targetCls.name,
      filePath: targetCls.filePath,
      baseClass,
      implementsList,
      dependencies,
      methods,
      properties
    });

    const resultText = await geminiService.generateContent(promptText);
    res.json({ analysis: resultText });
  } catch (error: any) {
    console.error('Class analysis error:', error);
    res.status(500).json({ error: error.message });
  }
});

// 5. Folder mindmap graph data
router.get('/:conn/graph', async (req, res) => {
  const { conn } = req.params;
  try {
    const { graph } = await getOrScanRepo(conn);
    res.json({
      nodes: graph.nodes,
      edges: graph.edges
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// 6. Dynamic scan streaming endpoint (EventSource)
router.get('/scan-stream', async (req: any, res: any) => {
  const repoUrl = req.query.repoUrl as string;
  const localPath = req.query.localPath as string;

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const sendProgress = (step: number, total: number, message: string) => {
    res.write(`data: ${JSON.stringify({ type: 'progress', step, total, message })}\n\n`);
  };

  try {
    let targetPath = '';

    if (localPath) {
      sendProgress(1, 4, 'Verifying local folder...');
      targetPath = path.resolve(localPath);
      if (!fs.existsSync(targetPath)) {
        res.write(`data: ${JSON.stringify({ type: 'error', error: `Local directory does not exist: ${localPath}` })}\n\n`);
        return res.end();
      }
      sendProgress(2, 4, 'Successfully connected to directory.');
    } else if (repoUrl) {
      sendProgress(1, 4, 'Analyzing Git repository connections...');
      const repoName = repoUrl.split('/').pop()?.replace('.git', '') || 'temp-repo';
      targetPath = path.join(tempDir, repoName);

      sendProgress(2, 4, 'Performing shallow clone...');
      if (fs.existsSync(targetPath)) {
        fs.rmSync(targetPath, { recursive: true, force: true });
      }
      await simpleGit().clone(repoUrl, targetPath, ['--depth', '100']);
      sendProgress(3, 4, 'Completed downloading repository source code.');
    } else {
      res.write(`data: ${JSON.stringify({ type: 'error', error: 'Please provide repoUrl or localPath.' })}\n\n`);
      return res.end();
    }

    sendProgress(4, 4, 'Analyzing AST tree and building mindmap model...');
    const parseResult: ParseResult = parseRepository(targetPath);
    setCurrentScanResult(targetPath, parseResult.classes);

    res.write(`data: ${JSON.stringify({
      type: 'result',
      data: {
        classesCount: parseResult.classes.length,
        nodes: parseResult.nodes,
        edges: parseResult.edges,
        classes: parseResult.classes.map(c => ({
          name: c.name,
          filePath: c.filePath,
          baseClass: c.baseClass,
          implementsList: c.implementsList,
          properties: c.properties,
          methods: c.methods,
          isModule: c.isModule
        }))
      }
    })}\n\n`);
    res.end();
  } catch (error: any) {
    console.error('Scan Stream Error:', error);
    res.write(`data: ${JSON.stringify({ type: 'error', error: error.message || 'System error during analysis.' })}\n\n`);
    res.end();
  }
});

// 7. Force sync/re-analyze codebase (invalidate cache and re-parse AST)
router.post('/:conn/sync', async (req, res) => {
  const { conn } = req.params;
  try {
    const cachePath = path.join(tempDir, `${conn}_cache.json`);
    clearRepoCache(conn);
    const scanData = await getOrScanRepo(conn);
    
    // Delete .baseflow_diagrams.json and .baseflow_readme_analysis.json if they exist
    const diagramsCache = path.join(scanData.repoPath, '.baseflow_diagrams.json');
    if (fs.existsSync(diagramsCache)) {
      fs.unlinkSync(diagramsCache);
    }
    const readmeCache = path.join(scanData.repoPath, '.baseflow_readme_analysis.json');
    if (fs.existsSync(readmeCache)) {
      fs.unlinkSync(readmeCache);
    }
    const docAnalysesCache = path.join(scanData.repoPath, '.baseflow_doc_analyses.json');
    if (fs.existsSync(docAnalysesCache)) {
      fs.unlinkSync(docAnalysesCache);
    }
    
    // Re-run complete analysis to pre-warm the cache files
    await performCompleteAnalysis(conn);
    
    res.json({
      success: true,
      msg: 'Codebase successfully re-analyzed',
      stats: {
        classesCount: scanData.classes.length,
        nodesCount: scanData.graph.nodes.length,
        edgesCount: scanData.graph.edges.length
      }
    });
  } catch (error: any) {
    console.error('Sync API error:', error);
    res.status(500).json({ error: error.message });
  }
});

// 8. Pull latest code updates (git pull) for remote repositories, then re-analyze
router.post('/:conn/pull', async (req, res) => {
  const { conn } = req.params;
  try {
    const { connectionStore } = require('../services/ConnectionStore');
    
    const profile = await connectionStore.getConnection(conn);
    if (!profile) {
      return res.status(404).json({ error: `Connection profile ${conn} not found.` });
    }

    if (profile.options?.type === 'local') {
      return res.status(400).json({ error: 'Cannot pull code for a local folder connection.' });
    }

    const targetPath = resolveRepoPath(profile);
    if (!fs.existsSync(targetPath)) {
      return res.status(404).json({ error: `Repository clone directory does not exist: ${targetPath}` });
    }

    console.log(`Pulling updates for ${conn} at ${targetPath}...`);
    const git = simpleGit(targetPath);
    
    // Run git pull
    try {
      await git.pull();
    } catch (e: any) {
      console.warn(`Pull warning/error (checking if local modifications or branch checkout failed):`, e.message || e);
      // Fallback: git fetch && git reset --hard origin/<branch>
      const branch = profile.options?.branch || 'main';
      try {
        console.log(`Failed to pull, trying force reset to origin/${branch}...`);
        await git.fetch();
        await git.reset(['--hard', `origin/${branch}`]);
      } catch (resetErr: any) {
        throw new Error(`Failed to pull or reset repository: ${resetErr.message || resetErr}`);
      }
    }

    clearRepoCache(conn);
    
    // Perform a fresh scan
    const scanData = await getOrScanRepo(conn);
    
    // Delete .baseflow_diagrams.json and .baseflow_readme_analysis.json if they exist
    const diagramsCache = path.join(scanData.repoPath, '.baseflow_diagrams.json');
    if (fs.existsSync(diagramsCache)) {
      fs.unlinkSync(diagramsCache);
    }
    const readmeCache = path.join(scanData.repoPath, '.baseflow_readme_analysis.json');
    if (fs.existsSync(readmeCache)) {
      fs.unlinkSync(readmeCache);
    }
    const docAnalysesCache = path.join(scanData.repoPath, '.baseflow_doc_analyses.json');
    if (fs.existsSync(docAnalysesCache)) {
      fs.unlinkSync(docAnalysesCache);
    }
    
    // Re-run complete analysis to pre-warm the cache files
    await performCompleteAnalysis(conn);
    
    res.json({
      success: true,
      msg: 'Codebase successfully updated and re-analyzed',
      stats: {
        classesCount: scanData.classes.length,
        nodesCount: scanData.graph.nodes.length,
        edgesCount: scanData.graph.edges.length
      }
    });
  } catch (error: any) {
    console.error('Pull API error:', error);
    res.status(500).json({ error: error.message });
  }
});

// 8b. Open file locally in default OS application (only for local/cloned files safely)
router.post('/:conn/open-file', async (req, res) => {
  const { conn } = req.params;
  const filePath = req.body.path as string;
  if (!filePath) {
    return res.status(400).json({ error: 'Body param "path" is required' });
  }
  try {
    const { repoPath } = await getOrScanRepo(conn);
    // Security: prevent path traversal outside repo
    const fullPath = path.resolve(repoPath, filePath);
    const relative = path.relative(repoPath, fullPath);
    if (relative.startsWith('..') || path.isAbsolute(relative)) {
      return res.status(403).json({ error: 'Access denied: path traversal not allowed' });
    }
    if (!fs.existsSync(fullPath)) {
      return res.status(404).json({ error: `File not found: ${filePath}` });
    }

    const platform = process.platform;
    let cmd = '';
    if (platform === 'win32') {
      cmd = `start "" "${fullPath}"`;
    } else if (platform === 'darwin') {
      cmd = `open "${fullPath}"`;
    } else {
      cmd = `xdg-open "${fullPath}"`;
    }

    const { exec } = require('child_process');
    exec(cmd, (error: any) => {
      if (error) {
        console.error(`Error opening file ${fullPath}:`, error);
        return res.status(500).json({ error: `Could not open file: ${error.message}` });
      }
      res.json({ success: true });
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
