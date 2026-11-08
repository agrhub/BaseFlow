/**
 * Getting repository sources onto disk: ZIP download from GitHub/GitLab, extraction,
 * the Cloud Run /tmp + GCS sync flow, and refresh/re-indexing.
 */
import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';
import { execFileSync } from 'child_process';
import { assertValidRepoUrl, remoteRepoDirName, assertLocalPathAllowed, execFileAsync } from '../../utils/security';
import { parseRepository } from '../../utils/parser';
import { tempDir, activeSyncPaths } from './workspace';
import { parseGitUrl } from './gitProviders';

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
      execFileSync('powershell', ['-NoProfile', '-Command', 'Expand-Archive -LiteralPath $env:BF_SRC -DestinationPath $env:BF_DEST -Force'], {
        stdio: 'ignore',
        env: { ...process.env, BF_SRC: zipPath, BF_DEST: tempExtractDir }
      });
    } else {
      // Linux/macOS: use unzip (argument array — no shell interpolation)
      execFileSync('unzip', ['-o', '-q', zipPath, '-d', tempExtractDir], { stdio: 'ignore' });
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

async function execFileChecked(file: string, args: string[], options: any = {}): Promise<void> {
  const { stdout, stderr, code } = await execFileAsync(file, args, options);
  if (stdout.trim()) console.log(`[exec ${file} stdout]: ${stdout.trim().substring(0, 2000)}`);
  if (stderr.trim()) console.warn(`[exec ${file} stderr]: ${stderr.trim().substring(0, 2000)}`);
  if (code !== 0) throw new Error(`${file} exited with code ${code}`);
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
      execFileSync('zip', ['-r', '-q', localCleanZipPath, '.'], { cwd: localRepoPath, stdio: 'ignore' });
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
        await execFileChecked('unzip', ['-o', '-q', localCleanZipPath, '-d', targetPath]);
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
      execFileSync('powershell', ['-NoProfile', '-Command', 'Compress-Archive -Path (Join-Path $env:BF_SRC "*") -DestinationPath $env:BF_DEST -Force'], {
        stdio: 'ignore',
        env: { ...process.env, BF_SRC: repoPath, BF_DEST: localZipPath }
      });
    } else {
      // Linux: use zip
      execFileSync('zip', ['-r', '-q', localZipPath, '.'], { cwd: repoPath, stdio: 'ignore' });
    }

    console.log(`Extracting zip to local /tmp path ${localRepoPath}...`);
    if (!fs.existsSync(localRepoPath)) {
      fs.mkdirSync(localRepoPath, { recursive: true });
    }
    
    if (process.platform === 'win32') {
      execFileSync('powershell', ['-NoProfile', '-Command', 'Expand-Archive -LiteralPath $env:BF_SRC -DestinationPath $env:BF_DEST -Force'], {
        stdio: 'ignore',
        env: { ...process.env, BF_SRC: localZipPath, BF_DEST: localRepoPath }
      });
    } else {
      execFileSync('unzip', ['-o', '-q', localZipPath, '-d', localRepoPath], { stdio: 'ignore' });
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

// Clone remote repo for connection creation/validation
export async function cloneRemoteRepo(uri: string, options: any, forceClone: boolean = false): Promise<string> {
  if (options?.type === 'local') {
    const targetPath = assertLocalPathAllowed(uri);
    if (!fs.existsSync(targetPath)) {
      throw new Error(`Local directory does not exist: ${targetPath}`);
    }
    return targetPath;
  }
  
  // For remote repository
  assertValidRepoUrl(uri);
  const targetPath = path.join(tempDir, remoteRepoDirName(uri));
  
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
