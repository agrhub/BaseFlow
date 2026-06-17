import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';
import { simpleGit } from 'simple-git';
import { execSync, exec } from 'child_process';
import { geminiService } from '../services/GeminiService';
import { parseRepository, ParsedClass, parseSingleFile, generateGraphLayout } from '../utils/parser';
import { connectionStore } from '../services/ConnectionStore';
import { setCurrentScanResult } from '../agent/tools';
import { getReadmeAnalysisPrompt, getArchitectureDiagramsPrompt } from '../prompts/prompts';

interface CachedRepo {
  repoPath: string;
  classes: ParsedClass[];
  graph: any;
}

const repoCache = new Map<string, CachedRepo>();

export const activeSyncPaths = new Map<string, string>();

export function clearRepoCache(profileName: string) {
  console.log(`Clearing in-memory and disk cache for connection ${profileName}...`);
  repoCache.delete(profileName);
  const cachePath = path.join(tempDir, `${profileName}_cache.json`);
  if (fs.existsSync(cachePath)) {
    try {
      fs.unlinkSync(cachePath);
    } catch (e: any) {
      console.warn(`Failed to delete cache file at ${cachePath}:`, e.message || e);
    }
  }
}

export const tempDir = process.env.TEMP_DIR || path.join(__dirname, '..', '..', 'temp');
if (!fs.existsSync(tempDir)) {
  try {
    fs.mkdirSync(tempDir, { recursive: true });
  } catch (e: any) {
    console.error(`Failed to create temp directory at ${tempDir}:`, e.message || e);
  }
}


// Helper to download repository ZIP from GitHub/GitLab using native https module to avoid fetch CORS headers (406 error)
export function downloadRepoZip(uri: string, destZipPath: string, options: any): Promise<void> {
  const parsed = parseGitUrl(uri);
  if (!parsed) {
    throw new Error(`Invalid Git repository URL: ${uri}`);
  }

  const { provider, owner, repo, fullPath } = parsed;
  const branch = options?.branch;
  let url = '';
  const headers: Record<string, string> = {
    'User-Agent': 'BaseFlow',
  };

  const username = options?.gitUsername;
  const token = options?.gitToken;

  if (provider === 'github') {
    url = branch 
      ? `https://api.github.com/repos/${owner}/${repo}/zipball/${encodeURIComponent(branch)}`
      : `https://api.github.com/repos/${owner}/${repo}/zipball`;
    if (token) {
      headers['Authorization'] = `token ${token}`;
    }
  } else if (provider === 'gitlab') {
    url = branch
      ? `https://gitlab.com/api/v4/projects/${encodeURIComponent(fullPath)}/repository/archive.zip?sha=${encodeURIComponent(branch)}`
      : `https://gitlab.com/api/v4/projects/${encodeURIComponent(fullPath)}/repository/archive.zip`;
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

  console.log(`Downloading zip from: ${url} using https.get (Headers: ${Object.keys(headers).join(', ')})`);

  const downloadWithRedirect = (requestUrl: string, requestHeaders: Record<string, string>): Promise<void> => {
    return new Promise((resolve, reject) => {
      const options = { headers: requestHeaders };
      https.get(requestUrl, options, (res) => {
        if (res.statusCode === 301 || res.statusCode === 302) {
          const redirectUrl = res.headers.location;
          if (!redirectUrl) {
            reject(new Error(`Redirect location missing for status ${res.statusCode}`));
            return;
          }
          console.log(`Following redirect to: ${redirectUrl}`);
          // Follow redirect. When following redirect (e.g. to AWS S3), do NOT send credentials/auth headers
          downloadWithRedirect(redirectUrl, { 'User-Agent': 'BaseFlow' }).then(resolve).catch(reject);
          return;
        }

        if (res.statusCode !== 200) {
          let body = '';
          res.on('data', chunk => {
            if (body.length < 1000) body += chunk;
          });
          res.on('end', () => {
            reject(new Error(`HTTP ${res.statusCode} ${res.statusMessage}: ${body}`));
          });
          return;
        }

        const fileStream = fs.createWriteStream(destZipPath);
        res.pipe(fileStream);

        fileStream.on('finish', () => {
          fileStream.close();
          resolve();
        });

        fileStream.on('error', (err) => {
          fs.unlink(destZipPath, () => {});
          reject(err);
        });
      }).on('error', (err) => {
        reject(err);
      });
    });
  };

  return downloadWithRedirect(url, headers);
}

// Helper to extract ZIP and rename/move the top-level folder
export function extractZipAndRename(zipPath: string, targetPath: string): void {
  // Use a temporary extraction directory inside the target environment's temp folder
  const tempExtractDir = path.join(path.dirname(zipPath), `extract_temp_${Date.now()}_${Math.floor(Math.random() * 1000)}`);
  
  if (!fs.existsSync(tempExtractDir)) {
    fs.mkdirSync(tempExtractDir, { recursive: true });
  }

  try {
    console.log(`Extracting ${zipPath} to ${tempExtractDir}...`);
    if (process.platform === 'win32') {
      // Windows: use PowerShell Expand-Archive
      const powershellCmd = `powershell -Command "Expand-Archive -Path '${zipPath.replace(/'/g, "''")}' -DestinationPath '${tempExtractDir.replace(/'/g, "''")}' -Force"`;
      execSync(powershellCmd, { stdio: 'ignore' });
    } else {
      // Linux/macOS: use unzip
      execSync(`unzip -o "${zipPath}" -d "${tempExtractDir}"`, { stdio: 'ignore' });
    }

    // Find the wrapper folder extracted
    const items = fs.readdirSync(tempExtractDir).filter(item => {
      const stats = fs.statSync(path.join(tempExtractDir, item));
      return stats.isDirectory();
    });

    if (items.length === 0) {
      throw new Error(`Extraction failed or no folders found in zip`);
    }

    const sourceFolder = path.join(tempExtractDir, items[0]);
    console.log(`Found extracted source folder: ${sourceFolder}. Moving to ${targetPath}...`);

    if (fs.existsSync(targetPath)) {
      fs.rmSync(targetPath, { recursive: true, force: true });
    }
    
    // Create target parent directory if not exists
    const targetParent = path.dirname(targetPath);
    if (!fs.existsSync(targetParent)) {
      fs.mkdirSync(targetParent, { recursive: true });
    }

    // Move folder. Note: renameSync can fail across drives, fall back to cpSync recursive
    try {
      fs.renameSync(sourceFolder, targetPath);
    } catch (renameErr) {
      console.log(`renameSync failed, falling back to cpSync recursive:`, renameErr);
      fs.cpSync(sourceFolder, targetPath, { recursive: true });
    }
  } finally {
    // Cleanup extraction folder
    try {
      if (fs.existsSync(tempExtractDir)) {
        fs.rmSync(tempExtractDir, { recursive: true, force: true });
      }
    } catch (cleanupErr) {
      console.warn(`Failed to clean up temp extract folder ${tempExtractDir}:`, cleanupErr);
    }
  }
}

function execAsync(command: string, options?: any): Promise<void> {
  return new Promise((resolve, reject) => {
    exec(command, options, (error, stdout, stderr) => {
      const outStr = stdout ? stdout.toString() : '';
      const errStr = stderr ? stderr.toString() : '';
      if (outStr.trim()) {
        console.log(`[execAsync stdout]: ${outStr.trim()}`);
      }
      if (errStr.trim()) {
        console.warn(`[execAsync stderr]: ${errStr.trim()}`);
      }
      if (error) {
        reject(error);
      } else {
        resolve();
      }
    });
  });
}

function cleanDirRecursive(dirPath: string) {
  if (!fs.existsSync(dirPath)) return;
  let files: string[] = [];
  try {
    files = fs.readdirSync(dirPath);
  } catch (err) {
    console.warn(`[GCS Cleanup] Failed to read directory ${dirPath}:`, err);
    return;
  }
  for (const file of files) {
    const curPath = path.join(dirPath, file);
    try {
      const stat = fs.lstatSync(curPath);
      if (stat.isDirectory()) {
        cleanDirRecursive(curPath);
        try {
          fs.rmdirSync(curPath);
        } catch (e) {}
      } else {
        fs.unlinkSync(curPath);
      }
    } catch (e) {}
  }
}

// Orchestrator for downloading, extracting, parsing, and GCS sync
export async function zipCloneOrPull(uri: string, targetPath: string, options: any, cachePath?: string): Promise<void> {
  const isCloudRun = process.env.CLOUD_RUN === '1';

  if (!isCloudRun) {
    // Local Machine optimization: download and extract directly to targetPath
    const localZipPath = path.join(tempDir, `repo_${Date.now()}.zip`);
    try {
      // Create tempDir if not exists
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
      }

      await downloadRepoZip(uri, localZipPath, options);
      extractZipAndRename(localZipPath, targetPath);

      if (cachePath) {
        console.log(`Generating parse cache for ${uri} locally...`);
        const parseResult = parseRepository(targetPath);
        
        const cacheDir = path.dirname(cachePath);
        if (!fs.existsSync(cacheDir)) {
          fs.mkdirSync(cacheDir, { recursive: true });
        }
        fs.writeFileSync(cachePath, JSON.stringify(parseResult), 'utf-8');
        console.log(`Cache successfully saved to ${cachePath}`);
      }
    } finally {
      if (fs.existsSync(localZipPath)) {
        try {
          fs.unlinkSync(localZipPath);
        } catch (e) {}
      }
    }
    return;
  }

  // Cloud Run flow using /tmp to bypass GCSFuse write latency
  const systemTempDir = '/tmp';
  const localZipPath = path.join(systemTempDir, `repo_${Date.now()}.zip`);
  const localRepoPath = path.join(systemTempDir, `repo_${Date.now()}_extracted`);
  const localCleanZipPath = path.join(systemTempDir, `clean_${Date.now()}.zip`);

  const skillsPath = path.join(targetPath, 'skills');
  const backupSkillsDir = path.join(systemTempDir, `skills_backup_${Date.now()}`);
  let hasSkillsBackup = false;
  let isBgLaunched = false;

  activeSyncPaths.set(targetPath, localRepoPath);

  try {
    // 1. Backup skills folder if it exists at GCS targetPath
    if (fs.existsSync(skillsPath)) {
      console.log(`Backing up skills from ${skillsPath} to ${backupSkillsDir}...`);
      try {
        fs.mkdirSync(backupSkillsDir, { recursive: true });
        fs.cpSync(skillsPath, backupSkillsDir, { recursive: true });
        hasSkillsBackup = true;
      } catch (err: any) {
        console.warn(`Failed to back up skills folder: ${err.message || err}`);
      }
    }

    // 2. Download zip file to local machine /tmp
    await downloadRepoZip(uri, localZipPath, options);

    // 3. Extract zip to local /tmp folder (strictly for AST indexing to avoid FUSE latency)
    extractZipAndRename(localZipPath, localRepoPath);

    // 4. If we have a skills backup, copy it to the local repo folder so that it is included in cache generation
    if (hasSkillsBackup) {
      const localSkillsDir = path.join(localRepoPath, 'skills');
      console.log(`Copying backed up skills to local repo path at ${localSkillsDir} for indexing...`);
      try {
        if (!fs.existsSync(localSkillsDir)) {
          fs.mkdirSync(localSkillsDir, { recursive: true });
        }
        fs.cpSync(backupSkillsDir, localSkillsDir, { recursive: true });
      } catch (err: any) {
        console.warn(`Failed to copy skills to local repo path for cache generation: ${err.message || err}`);
      }
    }

    // 5. Parse and generate cache if cachePath is provided
    if (cachePath) {
      console.log(`Generating parse cache for ${uri} locally on /tmp...`);
      const parseResult = parseRepository(localRepoPath);
      
      const cacheDir = path.dirname(cachePath);
      if (!fs.existsSync(cacheDir)) {
        fs.mkdirSync(cacheDir, { recursive: true });
      }
      fs.writeFileSync(cachePath, JSON.stringify(parseResult), 'utf-8');
      console.log(`Cache successfully saved to ${cachePath}`);
    }

    // 6. Package the repository contents in /tmp as a clean zip (with no top-level wrapper directory)
    console.log(`Creating a clean zip from ${localRepoPath} to ${localCleanZipPath}...`);
    try {
      execSync(`zip -r "${localCleanZipPath}" .`, { cwd: localRepoPath, stdio: 'ignore' });
    } catch (zipErr: any) {
      console.error(`Failed to create clean zip using zip command:`, zipErr.message || zipErr);
      throw zipErr;
    }

    // Set flag and launch background GCS sync
    isBgLaunched = true;
    console.log(`Launching background GCS sync for ${targetPath}...`);
    (async () => {
      try {
        // 7. Clear GCS targetPath contents recursively (avoids EMFILE, Directory not empty, and FUSE rename errors)
        if (fs.existsSync(targetPath)) {
          console.log(`[GCS Background] Clearing existing directory contents at ${targetPath}...`);
          cleanDirRecursive(targetPath);
        }

        // Ensure targetParent exists
        const targetParent = path.dirname(targetPath);
        if (!fs.existsSync(targetParent)) {
          fs.mkdirSync(targetParent, { recursive: true });
        }

        // Ensure targetPath exists
        if (!fs.existsSync(targetPath)) {
          fs.mkdirSync(targetPath, { recursive: true });
        }

        // 8. Extract clean ZIP from local /tmp directly into GCS targetPath
        console.log(`[GCS Background] Extracting clean ZIP to GCS targetPath at ${targetPath}...`);
        await execAsync(`unzip -o "${localCleanZipPath}" -d "${targetPath}"`);
        console.log(`[GCS Background] GCS extraction and sync completed successfully.`);
      } catch (bgErr: any) {
        console.error(`[GCS Background Error] Failed to clear and extract on GCS:`, bgErr.message || bgErr);
      } finally {
        activeSyncPaths.delete(targetPath);
        // Clean up temporary files in local /tmp
        try {
          if (fs.existsSync(localZipPath)) {
            fs.unlinkSync(localZipPath);
          }
        } catch (e) {}
        try {
          if (fs.existsSync(localRepoPath)) {
            fs.rmSync(localRepoPath, { recursive: true, force: true });
          }
        } catch (e) {}
        try {
          if (fs.existsSync(localCleanZipPath)) {
            fs.unlinkSync(localCleanZipPath);
          }
        } catch (e) {}
        try {
          if (fs.existsSync(backupSkillsDir)) {
            fs.rmSync(backupSkillsDir, { recursive: true, force: true });
          }
        } catch (e) {}
        console.log(`[GCS Background] Cleanup completed.`);
      }
    })();

  } finally {
    // Only cleanup synchronously if the background process was NOT launched
    if (!isBgLaunched) {
      activeSyncPaths.delete(targetPath);
      try {
        if (fs.existsSync(localZipPath)) {
          fs.unlinkSync(localZipPath);
        }
      } catch (e) {}
      try {
        if (fs.existsSync(localRepoPath)) {
          fs.rmSync(localRepoPath, { recursive: true, force: true });
        }
      } catch (e) {}
      try {
        if (fs.existsSync(localCleanZipPath)) {
          fs.unlinkSync(localCleanZipPath);
        }
      } catch (e) {}
      try {
        if (fs.existsSync(backupSkillsDir)) {
          fs.rmSync(backupSkillsDir, { recursive: true, force: true });
        }
      } catch (e) {}
    }
  }
}

// Orchestrator for zipping GCS folder -> move to local /tmp -> unzip -> parse -> upload cache
export async function zipRefresh(repoPath: string, cachePath: string): Promise<any> {
  if (!fs.existsSync(repoPath)) {
    throw new Error(`Repository folder does not exist: ${repoPath}`);
  }

  const systemTempDir = process.platform === 'win32' ? process.env.TEMP || 'C:\\Windows\\Temp' : '/tmp';
  const localZipPath = path.join(systemTempDir, `refresh_${Date.now()}.zip`);
  const localRepoPath = path.join(systemTempDir, `refresh_${Date.now()}_extracted`);

  try {
    console.log(`Zipping repository folder ${repoPath} to ${localZipPath}...`);
    if (process.platform === 'win32') {
      // Windows: use PowerShell Compress-Archive
      const powershellCmd = `powershell -Command "Compress-Archive -Path '${repoPath.replace(/'/g, "''")}\\*' -DestinationPath '${localZipPath.replace(/'/g, "''")}' -Force"`;
      execSync(powershellCmd, { stdio: 'ignore' });
    } else {
      // Linux: use zip
      execSync(`zip -r "${localZipPath}" .`, { cwd: repoPath, stdio: 'ignore' });
    }

    console.log(`Extracting zip to local /tmp path ${localRepoPath}...`);
    if (!fs.existsSync(localRepoPath)) {
      fs.mkdirSync(localRepoPath, { recursive: true });
    }
    
    if (process.platform === 'win32') {
      const powershellCmd = `powershell -Command "Expand-Archive -Path '${localZipPath.replace(/'/g, "''")}' -DestinationPath '${localRepoPath.replace(/'/g, "''")}' -Force"`;
      execSync(powershellCmd, { stdio: 'ignore' });
    } else {
      execSync(`unzip -o "${localZipPath}" -d "${localRepoPath}"`, { stdio: 'ignore' });
    }

    console.log(`Generating parse cache locally from ${localRepoPath}...`);
    const parseResult = parseRepository(localRepoPath);

    const cacheDir = path.dirname(cachePath);
    if (!fs.existsSync(cacheDir)) {
      fs.mkdirSync(cacheDir, { recursive: true });
    }
    fs.writeFileSync(cachePath, JSON.stringify(parseResult), 'utf-8');
    console.log(`Cache successfully written/updated at ${cachePath}`);
    return parseResult;
  } finally {
    // Cleanup local temp zip and repo folder
    try {
      if (fs.existsSync(localZipPath)) {
        fs.unlinkSync(localZipPath);
      }
      if (fs.existsSync(localRepoPath)) {
        fs.rmSync(localRepoPath, { recursive: true, force: true });
      }
    } catch (cleanupErr) {
      console.warn(`Failed to clean up refresh local temp files:`, cleanupErr);
    }
  }
}


// Git repository URL parser
export function parseGitUrl(url: string) {
  if (!url) return null;
  const match = url.match(/(github|gitlab)\.com[:/](.+)$/);
  if (match) {
    const provider = match[1];
    let rest = match[2].replace(/\.git$/, '').replace(/\/$/, '');
    const parts = rest.split('/');
    if (parts.length >= 2) {
      const owner = parts[0];
      const repo = parts[parts.length - 1];
      const fullPath = rest;
      return {
        provider,
        owner,
        repo,
        fullPath
      };
    }
  }
  return null;
}

// Resolve Repository Path
export function resolveRepoPath(profile: any): string {
  const uri = profile.uri || profile.string;
  if (profile.options?.type === 'local') {
    return path.resolve(uri);
  }
  // For remote URL, return temp folder path
  const repoName = uri.split('/').pop()?.replace('.git', '') || 'temp-repo';
  
  if (fs.existsSync(tempDir)) {
    try {
      const items = fs.readdirSync(tempDir);
      const matched = items.find(item => item.toLowerCase() === repoName.toLowerCase());
      if (matched) {
        return path.join(tempDir, matched);
      }
    } catch (e) {
      console.warn(`Failed to read tempDir for case-insensitive match:`, e);
    }
  }
  return path.join(tempDir, repoName);
}

// Helper to recursively find the latest file modification time in the repository
function getRepoLastModified(dirPath: string): number {
  let maxMtime = 0;
  function walk(currentDir: string) {
    if (!fs.existsSync(currentDir)) return;
    const files = fs.readdirSync(currentDir);
    for (const file of files) {
      if (file.startsWith('.') || ['node_modules', 'dist', 'build', 'venv', 'bin', 'obj', 'target', 'out', 'temp'].includes(file)) {
        continue;
      }
      const filePath = path.join(currentDir, file);
      try {
        const stat = fs.statSync(filePath);
        if (stat.isDirectory()) {
          walk(filePath);
        } else {
          const mtime = stat.mtimeMs;
          if (mtime > maxMtime) {
            maxMtime = mtime;
          }
        }
      } catch (e) {}
    }
  }
  walk(dirPath);
  return maxMtime;
}

// Resolve Cache Path
export function resolveCachePath(profileName: string): string {
  const cachePath = path.join(tempDir, `${profileName}_cache.json`);
  if (!fs.existsSync(cachePath) && fs.existsSync(tempDir)) {
    try {
      const items = fs.readdirSync(tempDir);
      const targetName = `${profileName}_cache.json`.toLowerCase();
      const matched = items.find(item => item.toLowerCase() === targetName);
      if (matched) {
        return path.join(tempDir, matched);
      }
    } catch (e) {
      console.warn(`Failed to read tempDir for case-insensitive cache lookup:`, e);
    }
  }
  return cachePath;
}

// Scan repository utility
export async function getOrScanRepo(profileName: string): Promise<{ repoPath: string; classes: ParsedClass[]; graph: any }> {
  if (repoCache.has(profileName)) {
    console.log(`Returning in-memory cache for connection ${profileName}...`);
    return repoCache.get(profileName)!;
  }

  const profile = await connectionStore.getConnection(profileName);
  if (!profile) {
    throw new Error(`Profile ${profileName} not found.`);
  }

  const targetPath = resolveRepoPath(profile);

  // If remote and does not exist, download ZIP
  if (profile.options?.type !== 'local' && !fs.existsSync(targetPath)) {
    console.log(`Auto-downloading remote ZIP for ${profile.uri} to ${targetPath}...`);
    const cachePath = resolveCachePath(profileName);
    try {
      await zipCloneOrPull(profile.uri, targetPath, profile.options, cachePath);
    } catch (e: any) {
      console.error(`Failed to download and extract ZIP:`, e);
      throw e;
    }
  }

  // Check for cached scan result file
  const cachePath = resolveCachePath(profileName);
  const useCache = fs.existsSync(cachePath);

  if (!useCache && !fs.existsSync(targetPath)) {
    throw new Error(`Path does not exist: ${targetPath}`);
  }

  if (useCache) {
    try {
      console.log(`Loading cached parse result for connection ${profileName}...`);
      const cacheContent = fs.readFileSync(cachePath, 'utf-8');
      const result = JSON.parse(cacheContent);
      setCurrentScanResult(targetPath, result.classes);
      const resVal = {
        repoPath: targetPath,
        classes: result.classes,
        graph: result
      };
      repoCache.set(profileName, resVal);
      return resVal;
    } catch (err) {
      console.warn(`Failed to parse cache file for ${profileName}, re-scanning...`, err);
    }
  }

  let result;
  if (profile.options?.type !== 'local' && process.env.CLOUD_RUN === '1') {
    console.log(`Re-indexing remote repository ${profileName} using GCS ZIP cache on Cloud Run...`);
    result = await zipRefresh(targetPath, cachePath);
  } else {
    console.log(`First scan or changes detected/Local re-indexing. Parsing repository ${profileName}...`);
    result = parseRepository(targetPath);
    
    // Write to cache file
    try {
      fs.writeFileSync(cachePath, JSON.stringify(result), 'utf-8');
    } catch (err) {
      console.warn(`Failed to write cache file for ${profileName}:`, err);
    }
  }

  setCurrentScanResult(targetPath, result.classes);
  const finalRes = {
    repoPath: targetPath,
    classes: result.classes,
    graph: result
  };
  repoCache.set(profileName, finalRes);
  return finalRes;
}

// Generate README AI Analysis and save to cache
export async function generateReadmeAnalysis(connName: string, repoPath: string): Promise<any> {
  const cachePath = path.join(repoPath, '.baseflow_readme_analysis.json');
  
  // Find README.md
  let readmePath = '';
  let files: string[] = [];
  try {
    files = fs.readdirSync(repoPath);
  } catch (e) {
    console.warn(`Failed to read repo path ${repoPath}:`, e);
  }
  const readmeFile = files.find(f => f.toLowerCase() === 'readme.md');
  let readmeContent = '';
  
  if (readmeFile) {
    readmePath = path.join(repoPath, readmeFile);
    readmeContent = fs.readFileSync(readmePath, 'utf-8');
  } else {
    // Fallback: list project structure to analyze
    const allFiles = parseRepository(repoPath).classes.map(c => c.filePath);
    readmeContent = `No README.md found. Here is the project structure:\n${allFiles.join('\n')}`;
  }

  //const useVertex = process.env.GOOGLE_GENAI_USE_VERTEXAI === '1' || process.env.GOOGLE_GENAI_USE_VERTEXAI === 'true';
  //const apiKey = process.env.GOOGLE_API_KEY || '';
  /*if (!apiKey && !useVertex) {
    return {
      projectName: connName,
      summary: 'No Gemini API Key found in backend .env file.',
      techStack: ['N/A'],
      complexityScore: 50,
      features: ['No README or API key details'],
      architecture: 'N/A',
      charts: [
        { name: 'Modules', value: 30 },
        { name: 'Complexity', value: 50 },
        { name: 'Lines of Code', value: 40 }
      ]
    };
  }*/

  //const modelName = process.env.AGENT_MODEL || 'gemini-2.5-flash';
  //const ai = getAIClient();
  /*const response = await ai.models.generateContent({
    model: modelName,
    contents: `Analyze the following README content of a software project. Return a JSON object with the schema:
{
  "projectName": "Name of the project",
  "summary": "Short 2-3 sentence overview of what the project does",
  "techStack": ["tech1", "tech2", ...],
  "complexityScore": 85,
  "features": ["feature1", "feature2", ...],
  "architecture": "Summary of codebase architecture",
  "url": "Repository URL if mentioned or empty string",
  "description": "Short project description or subtitle",
  "author": "Author or contributors list if found or empty string",
  "license": "License type if found or empty string",
  "howToRun": ["command 1", "command 2", ...],
  "charts": [
    { "name": "Folder/Module 1", "value": 80 },
    { "name": "Folder/Module 2", "value": 45 },
    { "name": "Folder/Module 3", "value": 60 }
  ]
}
Return ONLY raw JSON block, no markdown syntax or code block formatting.

README CONTENT:
${readmeContent.substring(0, 10000)}`,
    config: {
      responseMimeType: "application/json"
    }
  });*/

  //const resultText = response.text || '{}';
  //const jsonResult = JSON.parse(resultText.trim());
  
  let jsonResult: any = null;
  try {
    const prompt = getReadmeAnalysisPrompt(readmeContent);
    jsonResult = await geminiService.generateJSON(prompt);
    fs.writeFileSync(cachePath, JSON.stringify(jsonResult, null, 2), 'utf-8');
  } catch (cacheErr) {
    console.warn('Failed to write readme analysis cache:', cacheErr);
  }

  return jsonResult;
}

// Perform a complete scanning and analysis run, creating all cache files
export async function performCompleteAnalysis(connName: string): Promise<any> {
  console.log(`Starting complete codebase analysis for ${connName}...`);
  // 1. Run AST scan & build graph
  const scanData = await getOrScanRepo(connName);

  // 2. Run README analysis
  try {
    await generateReadmeAnalysis(connName, scanData.repoPath);
  } catch (readmeErr) {
    console.error(`Failed to pre-generate README analysis for ${connName}:`, readmeErr);
  }

  // 3. Run Architecture diagrams generation
  try {
    const diagrams = await generateArchitectureDiagrams(connName, scanData.repoPath, scanData.classes);
    const diagramsCachePath = path.join(scanData.repoPath, '.baseflow_diagrams.json');
    fs.writeFileSync(diagramsCachePath, JSON.stringify(diagrams, null, 2), 'utf-8');
  } catch (diagramErr) {
    console.error(`Failed to pre-generate architecture diagrams for ${connName}:`, diagramErr);
  }

  return scanData;
}

export async function fetchGitHubRepoStats(owner: string, repo: string, token?: string) {
  try {
    const url = `https://api.github.com/repos/${owner}/${repo}`;
    const activityUrl = `https://api.github.com/repos/${owner}/${repo}/stats/commit_activity`;
    const headers: Record<string, string> = {
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': 'BaseFlow-App'
    };
    if (token) {
      headers['Authorization'] = `token ${token}`;
    }
    
    const [repoRes, activityRes] = await Promise.all([
      fetch(url, { headers }),
      fetch(activityUrl, { headers })
    ]);
    
    if (!repoRes.ok) return null;
    const data = await repoRes.json() as any;
    
    let commitActivity: Array<{ date: string; count: number }> = [];
    if (activityRes.ok && activityRes.status === 200) {
      const activityData = await activityRes.json() as any[];
      if (Array.isArray(activityData) && activityData.length > 0) {
        const allDays: Array<{ date: string; count: number }> = [];
        const lastWeeks = activityData.slice(-3);
        lastWeeks.forEach(week => {
          const weekStart = new Date(week.week * 1000);
          week.days.forEach((count: number, dayIdx: number) => {
            const d = new Date(weekStart);
            d.setDate(d.getDate() + dayIdx);
            allDays.push({
              date: d.toISOString().split('T')[0],
              count
            });
          });
        });
        
        const targetDays = [];
        for (let i = 13; i >= 0; i--) {
          const d = new Date();
          d.setDate(d.getDate() - i);
          const dateStr = d.toISOString().split('T')[0];
          const found = allDays.find(a => a.date === dateStr);
          targetDays.push({
            date: dateStr,
            count: found ? found.count : 0
          });
        }
        commitActivity = targetDays;
      }
    }
    
    return {
      stars: data.stargazers_count || 0,
      forks: data.forks_count || 0,
      watchers: data.watchers_count || 0,
      commitActivity: commitActivity.length > 0 ? commitActivity : null
    };
  } catch (e) {
    console.warn('Failed to fetch GitHub stats:', e);
    return null;
  }
}

export async function fetchGitLabRepoStats(fullPath: string, token?: string) {
  try {
    const urlEncodedPath = encodeURIComponent(fullPath);
    const url = `https://gitlab.com/api/v4/projects/${urlEncodedPath}`;
    
    const d14 = new Date();
    d14.setDate(d14.getDate() - 14);
    const sinceStr = d14.toISOString();
    const commitsUrl = `https://gitlab.com/api/v4/projects/${urlEncodedPath}/repository/commits?since=${sinceStr}&per_page=100`;
    
    const headers: Record<string, string> = {};
    if (token) {
      headers['PRIVATE-TOKEN'] = token;
    }
    
    const [repoRes, commitsRes] = await Promise.all([
      fetch(url, { headers }),
      fetch(commitsUrl, { headers })
    ]);
    
    if (!repoRes.ok) return null;
    const data = await repoRes.json() as any;
    
    let commitActivity: Array<{ date: string; count: number }> = [];
    if (commitsRes.ok) {
      const commitsData = await commitsRes.json() as any[];
      const countsByDate: Record<string, number> = {};
      if (Array.isArray(commitsData)) {
        commitsData.forEach(c => {
          if (c.created_at) {
            const dateStr = new Date(c.created_at).toISOString().split('T')[0];
            countsByDate[dateStr] = (countsByDate[dateStr] || 0) + 1;
          }
        });
      }
      
      for (let i = 13; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const dateStr = d.toISOString().split('T')[0];
        commitActivity.push({
          date: dateStr,
          count: countsByDate[dateStr] || 0
        });
      }
    }
    
    return {
      stars: data.star_count || 0,
      forks: data.forks_count || 0,
      watchers: 0,
      commitActivity: commitActivity.length > 0 ? commitActivity : null
    };
  } catch (e) {
    console.warn('Failed to fetch GitLab stats:', e);
    return null;
  }
}

// Helper to fetch from GitLab API
export async function fetchFromGitLab(fullPath: string, endpoint: string, token?: string) {
  const urlEncodedPath = encodeURIComponent(fullPath);
  const url = `https://gitlab.com/api/v4/projects/${urlEncodedPath}/${endpoint}`;
  const headers: Record<string, string> = {};
  if (token) {
    headers['PRIVATE-TOKEN'] = token;
  }
  const response = await fetch(url, { headers });
  if (!response.ok) {
    throw new Error(`GitLab API error: ${response.statusText} (${response.status})`);
  }
  return response.json();
}

// Helper to fetch from GitHub API
export async function fetchFromGitHub(owner: string, repo: string, endpoint: string, token?: string) {
  // Support global GitHub API endpoints (e.g. search/*) that are not repo-relative
  const url = endpoint.startsWith('search/')
    ? `https://api.github.com/${endpoint}`
    : `https://api.github.com/repos/${owner}/${repo}/${endpoint}`;
  const headers: Record<string, string> = {
    'Accept': 'application/vnd.github.v3+json',
    'User-Agent': 'BaseFlow-App'
  };
  if (token) {
    headers['Authorization'] = `token ${token}`;
  }
  const response = await fetch(url, { headers });
  if (!response.ok) {
    throw new Error(`GitHub API error: ${response.statusText} (${response.status})`);
  }
  return response.json();
}

// Paginated fetch helpers
export async function fetchPaginatedFromGitLab(fullPath: string, endpoint: string, token?: string) {
  const urlEncodedPath = encodeURIComponent(fullPath);
  const url = `https://gitlab.com/api/v4/projects/${urlEncodedPath}/${endpoint}`;
  const headers: Record<string, string> = {};
  if (token) {
    headers['PRIVATE-TOKEN'] = token;
  }
  const response = await fetch(url, { headers });
  if (!response.ok) {
    throw new Error(`GitLab API error: ${response.statusText} (${response.status})`);
  }
  const data = await response.json() as any;
  const total = response.headers.get('x-total');
  return {
    data,
    total: total ? parseInt(total, 10) : (Array.isArray(data) ? data.length : 0)
  };
}

export async function fetchPaginatedFromGitHub(owner: string, repo: string, endpoint: string, token?: string) {
  let url = `https://api.github.com/repos/${owner}/${repo}/${endpoint}`;
  if (endpoint.startsWith('search/')) {
    url = `https://api.github.com/${endpoint}`;
  }
  
  const headers: Record<string, string> = {
    'Accept': 'application/vnd.github.v3+json',
    'User-Agent': 'BaseFlow-App'
  };
  if (token) {
    headers['Authorization'] = `token ${token}`;
  }
  const response = await fetch(url, { headers });
  if (!response.ok) {
    throw new Error(`GitHub API error: ${response.statusText} (${response.status})`);
  }
  const data = await response.json() as any;
  
  // Try to find total count from search API if this was a search endpoint, otherwise fallback
  let total = Array.isArray(data) ? data.length : 0;
  if (data.total_count !== undefined) {
    total = data.total_count;
  }
  return {
    data: data.items || data, // handle search API vs normal API
    total
  };
}

// Resolve DevOps provider details with Git remote URL auto-detection for local folders
export async function getDevOpsInfo(connName: string) {
  const profile = await connectionStore.getConnection(connName);
  if (!profile) return null;

  let gitUrl = profile.uri;
  if (profile.options?.type === 'local') {
    try {
      const repoPath = resolveRepoPath(profile);
      const git = simpleGit(repoPath);
      const remotes = await git.getRemotes(true);
      const origin = remotes.find(r => r.name === 'origin');
      if (origin) {
        gitUrl = origin.refs.push || origin.refs.fetch;
      }
    } catch (e) {
      console.warn('Could not read remote URL for local repository:', e);
    }
  }

  const parsed = parseGitUrl(gitUrl);
  const provider = parsed?.provider || 'none';
  const owner = parsed?.owner || '';
  const repo = parsed?.repo || '';
  const fullPath = parsed?.fullPath || '';

  const hasToken = !!profile.options?.gitToken;

  return {
    provider,
    owner,
    repo,
    fullPath,
    hasToken,
    profile
  };
}

function sanitizeMermaid(graph: string): string {
  if (!graph) return '';
  // 1. Ensure 'end' is on its own line (newline before and after)
  graph = graph.replace(/([^\n\s])\s+end\b/g, '$1\nend');
  graph = graph.replace(/\bend\s+([^\n\s])/g, 'end\n$1');

  // 2. Ensure 'subgraph' has a newline before it if preceded by non-whitespace
  graph = graph.replace(/([^\n\s])\s+subgraph\b/g, '$1\nsubgraph');

  // 3. Remove markdown code blocks if the model somehow returned them inside the JSON string
  graph = graph.replace(/```mermaid/g, '').replace(/```/g, '');

  // 4. Wrap unquoted node labels with double quotes to prevent syntax errors
  graph = graph.replace(/([a-zA-Z0-9_-]+)(\(|\[|\{\{|\(\(|\[\()([^\)\"\]\}]+)(\)|\]|\}\}|\)\)|\)\])/g, '$1$2"$3"$4');

  // 5. Clean up nested quotes in link labels (like -- "HTTP("S")" -->)
  graph = graph.replace(/--\s*\"([^\"]+)\"\s*-->/g, (match, p1) => `-- "${p1.replace(/\"/g, "'")}" -->`);
  graph = graph.replace(/-\.-\s*\"([^\"]+)\"\s*-\.->/g, (match, p1) => `-. "${p1.replace(/\"/g, "'")}" .->`);
  graph = graph.replace(/==\s*\"([^\"]+)\"\s*==>/g, (match, p1) => `== "${p1.replace(/\"/g, "'")}" ==>`);
  graph = graph.replace(/-->\s*\|([^|]+)\|/g, (match, p1) => `--> |${p1.replace(/\"/g, "'")}|`);

  // 6. Replace double double-quotes with single double-quote
  graph = graph.replace(/""/g, '"');

  return graph;
}

export async function generateArchitectureDiagrams(conn: string, repoPath: string, classes: ParsedClass[]) {
  const classSummaries = classes.map(c => ({
    name: c.name,
    filePath: c.filePath,
    baseClass: c.baseClass || undefined,
    implementsList: c.implementsList.length > 0 ? c.implementsList : undefined,
    dependencies: c.dependencies.length > 0 ? c.dependencies : undefined
  })).slice(0, 80);


  const useVertex = process.env.GOOGLE_GENAI_USE_VERTEXAI === '1' || process.env.GOOGLE_GENAI_USE_VERTEXAI === 'true';
  const apiKey = process.env.GOOGLE_API_KEY || '';
  if (!apiKey && !useVertex) {
    return {
      architecture: `graph TD\n  subgraph Project [${conn}]\n    A[Src Files] --> B[AST Parser]\n  end\n  style Project fill:#1e1e3f,stroke:#6f7ad3`,
      classInteraction: `graph TD\n  ClassA[No API Key] --> ClassB[Configure GOOGLE_API_KEY]`
    };
  }

  try {
    const prompt = getArchitectureDiagramsPrompt(conn, classSummaries);
    const parsed = await geminiService.generateJSON<any>(prompt);
    if (parsed.architecture) {
      parsed.architecture = sanitizeMermaid(parsed.architecture);
    }
    if (parsed.classInteraction) {
      parsed.classInteraction = sanitizeMermaid(parsed.classInteraction);
    }
    return parsed;
  } catch (e) {
    console.error("Failed to parse or sanitize generated architecture diagrams:", e);
    return {
      architecture: `graph TD\n  subgraph Project [${conn}]\n    A[Src Files] --> B[AST Parser]\n  end\n  style Project fill:#1e1e3f,stroke:#6f7ad3`,
      classInteraction: `graph TD\n  ClassA[Error Parsing Diagrams] --> ClassB[Retry Regeneration]`
    };
  }
}

// Resolve Git authenticated URL for private repositories
export function getAuthenticatedGitUrl(uri: string, options: any): string {
  if (!uri || options?.type === 'local') return uri;
  
  let cloneUri = uri;
  const username = options?.gitUsername;
  const token = options?.gitToken;
  
  if (username && token) {
    if (cloneUri.startsWith('https://')) {
      const authPart = `${encodeURIComponent(username)}:${encodeURIComponent(token)}`;
      cloneUri = cloneUri.replace('https://', `https://${authPart}@`);
    } else if (cloneUri.startsWith('http://')) {
      const authPart = `${encodeURIComponent(username)}:${encodeURIComponent(token)}`;
      cloneUri = cloneUri.replace('http://', `http://${authPart}@`);
    }
  } else if (token) {
    let defaultUser = 'git';
    if (cloneUri.includes('gitlab.com')) {
      defaultUser = 'oauth2';
    }
    if (cloneUri.startsWith('https://')) {
      cloneUri = cloneUri.replace('https://', `https://${defaultUser}:${encodeURIComponent(token)}@`);
    } else if (cloneUri.startsWith('http://')) {
      cloneUri = cloneUri.replace('http://', `http://${defaultUser}:${encodeURIComponent(token)}@`);
    }
  }
  return cloneUri;
}

// Clone remote repo for connection creation/validation
export async function cloneRemoteRepo(uri: string, options: any, forceClone: boolean = false): Promise<string> {
  if (options?.type === 'local') {
    const targetPath = path.resolve(uri);
    if (!fs.existsSync(targetPath)) {
      throw new Error(`Local directory does not exist: ${targetPath}`);
    }
    return targetPath;
  }
  
  // For remote repository
  const repoName = uri.split('/').pop()?.replace('.git', '') || 'temp-repo';
  const targetPath = path.join(tempDir, repoName);
  
  if (forceClone && fs.existsSync(targetPath)) {
    console.log(`Force clone requested. Deleting existing folder at ${targetPath}...`);
    try {
      fs.rmSync(targetPath, { recursive: true, force: true });
    } catch (e) {
      console.warn(`Failed to delete existing folder at ${targetPath}:`, e);
    }
  }
  
  if (!fs.existsSync(targetPath)) {
    console.log(`Auto-downloading remote ZIP for ${uri} to ${targetPath} during validation...`);
    try {
      await zipCloneOrPull(uri, targetPath, options);
    } catch (e: any) {
      console.error(`Failed to download and extract ZIP during validation:`, e);
      throw e;
    }
  }
  return targetPath;
}

// Helper to resolve filePath, fallback to /tmp local sync path if GCS file does not exist during sync,
// and resolves extension-less file path requests (for new or unindexed files without explicit extensions).
export function resolveFilePathWithFallback(repoPath: string, filePath: string): { resolvedFilePath: string; activeRepoRoot: string } {
  let resolvedFilePath = path.resolve(repoPath, filePath);
  let activeRepoRoot = repoPath;

  const findPathWithExt = (basePath: string): string | null => {
    if (fs.existsSync(basePath) && fs.statSync(basePath).isFile()) return basePath;
    const exts = ['.java', '.ts', '.tsx', '.js', '.jsx', '.py', '.cs', '.go', '.rs', '.kt', '.php', '.html', '.css', '.json', '.md'];
    for (const ext of exts) {
      const testPath = basePath + ext;
      if (fs.existsSync(testPath)) return testPath;
    }
    return null;
  };

  const matchedPath = findPathWithExt(resolvedFilePath);
  if (matchedPath) {
    resolvedFilePath = matchedPath;
  } else {
    // If not found in repoPath, try localSyncPath
    const localSyncPath = activeSyncPaths.get(repoPath);
    if (localSyncPath) {
      const localFilePath = path.resolve(localSyncPath, filePath);
      const relativeLocal = path.relative(localSyncPath, localFilePath);
      if (!relativeLocal.startsWith('..') && !path.isAbsolute(relativeLocal)) {
        const matchedLocal = findPathWithExt(localFilePath);
        if (matchedLocal) {
          console.log(`[File Fallback] Reading ${filePath} from local sync path: ${matchedLocal}`);
          resolvedFilePath = matchedLocal;
          activeRepoRoot = localSyncPath;
        }
      }
    }
  }

  return { resolvedFilePath, activeRepoRoot };
}

// Parse single file and update connection cache and layout graph in-memory and on-disk
export async function updateCacheWithParsedFile(
  profileName: string,
  relativeFilePath: string,
  content: string
): Promise<ParsedClass[]> {
  const cacheData = await getOrScanRepo(profileName);
  const repoPath = cacheData.repoPath;
  const fullPath = path.resolve(repoPath, relativeFilePath);

  // Parse the file to get the new classes list
  const newClasses = parseSingleFile(fullPath, relativeFilePath, content);

  // Filter out any existing classes for this file path
  const filteredClasses = cacheData.classes.filter(c => c.filePath !== relativeFilePath);

  // Append new classes
  const allClasses = [...filteredClasses, ...newClasses];

  // Regenerate the graph layout
  const { nodes, edges } = generateGraphLayout(allClasses);

  // Update in-memory cache
  const updatedCache = {
    repoPath,
    classes: allClasses,
    graph: {
      classes: allClasses,
      nodes,
      edges
    }
  };
  repoCache.set(profileName, updatedCache);

  // Update on-disk cache file
  const cachePath = resolveCachePath(profileName);
  try {
    fs.writeFileSync(cachePath, JSON.stringify(updatedCache.graph), 'utf-8');
    setCurrentScanResult(repoPath, allClasses);
    console.log(`[Cache Update] Successfully updated cache and graph for file: ${relativeFilePath}`);
  } catch (err) {
    console.warn(`[Cache Update] Failed to write updated cache file for ${profileName}:`, err);
  }

  return newClasses;
}


