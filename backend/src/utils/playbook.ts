import { spawn, execSync } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import { resolveCachePath } from '../routes/helpers';

export interface RunPlaybookOptions {
  repoPath: string;
  playbookPath: string;
  logLabel: string;
  onData: (chunk: string) => void;
}

/**
 * Common helper to resolve path and spawn the gemini-cli process
 * with proper API keys and Vertex AI environment variables.
 */
export function runPlaybookCli(options: RunPlaybookOptions) {
  const { repoPath, playbookPath, logLabel, onData } = options;

  const useVertex = process.env.GOOGLE_GENAI_USE_VERTEXAI === '1' || process.env.GOOGLE_GENAI_USE_VERTEXAI === 'true';
  const hasServiceAccount = !!process.env.GOOGLE_APPLICATION_CREDENTIALS;

  // Build subprocess env — start from current process env
  const env: Record<string, string> = { ...(process.env as Record<string, string>) };

  if (useVertex) {
    const resolvedLocation = process.env.GOOGLE_CLOUD_LOCATION === 'global'
      ? 'us-central1'
      : (process.env.GOOGLE_CLOUD_LOCATION || 'us-central1');

    env['GOOGLE_GENAI_USE_VERTEXAI'] = '1';
    env['GOOGLE_CLOUD_LOCATION'] = resolvedLocation;
    if (process.env.GOOGLE_CLOUD_PROJECT) {
      env['GOOGLE_CLOUD_PROJECT'] = process.env.GOOGLE_CLOUD_PROJECT;
    }

    if (hasServiceAccount) {
      // Service Account auth → GOOGLE_API_KEY is not needed and would confuse the CLI
      // "Both GOOGLE_API_KEY and GEMINI_API_KEY are set" warning → CLI picks wrong quota
      delete env['GOOGLE_API_KEY'];
      delete env['GEMINI_API_KEY'];
      onData(`[${logLabel}] Using Vertex AI with Service Account (${process.env.GOOGLE_APPLICATION_CREDENTIALS}), location: ${resolvedLocation}\n`);
    } else {
      // API Key + Vertex AI backend: keep GOOGLE_API_KEY for auth, but remove GEMINI_API_KEY
      // to avoid the "Both keys set" warning that makes CLI fall back to free-tier quota
      const apiKey = process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY || '';
      if (!apiKey) {
        throw new Error('Vertex AI requires either GOOGLE_APPLICATION_CREDENTIALS or GOOGLE_API_KEY.');
      }
      env['GOOGLE_API_KEY'] = apiKey;
      delete env['GEMINI_API_KEY']; // prevent dual-key conflict
      onData(`[${logLabel}] Using Vertex AI with API Key, location: ${resolvedLocation}\n`);
    }
  } else {
    const apiKey = process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY || '';
    if (!apiKey) {
      throw new Error('Google/Gemini API Key is not configured in backend environment.');
    }
    env['GOOGLE_API_KEY'] = apiKey;
    env['GOOGLE_GENAI_USE_VERTEXAI'] = '0';
    delete env['GEMINI_API_KEY']; // avoid dual-key confusion
    onData(`[${logLabel}] Using Google AI Studio (API Key)\n`);
  }

  env['GEMINI_CLI_TRUST_WORKSPACE'] = 'true';
  env['PAGER'] = 'cat';

  // Resolve gemini.js absolute path
  let geminiJsPath = '';
  try {
    geminiJsPath = require.resolve('@google/gemini-cli/bundle/gemini.js');
  } catch (_) {
    try {
      const localPath = path.join(__dirname, '..', '..', 'node_modules', '@google', 'gemini-cli', 'bundle', 'gemini.js');
      if (fs.existsSync(localPath)) {
        geminiJsPath = localPath;
      }
    } catch (_) {}
  }

  if (!geminiJsPath) {
    try {
      const globalRoot = execSync('npm root -g').toString().trim();
      const testPath = path.join(globalRoot, '@google', 'gemini-cli', 'bundle', 'gemini.js');
      if (fs.existsSync(testPath)) {
        geminiJsPath = testPath;
      }
    } catch (_) {}
  }

  const model = process.env.GEMINI_CLI_MODEL || process.env.AGENT_MODEL || 'gemini-2.5-flash';

  const agentPrompt = `You are a highly capable AI software engineer. You are given a playbook file that lists relevant files/classes and high-level fix instructions.
Your task is to:
1. Examine the relevant files/classes listed in the playbook file: "${playbookPath}".
2. Read and analyze their source code in the repository workspace.
3. Understand the bug or feature request and identify the root cause.
4. Implement the required modifications directly in the codebase files to fix the issue or satisfy the instructions.
5. If the playbook instructions are high-level or generic, you must use your programming knowledge to investigate the code, find the correct implementation, and write a complete, targeted fix. Do not give up or report that the instructions are too vague; analyze the files and write the code.

Make sure to write the modified code back to the files.
After you have completed all changes, you MUST output the final list of all modified file paths (relative to the workspace root) in a JSON array prefixed exactly with "MODIFIED_FILES:", for example:
MODIFIED_FILES:["src/main.ts", "src/helper.ts"]

Do not output any other text after this JSON array.`;

  if (geminiJsPath) {
    onData(`[${logLabel}] Spawning Node with gemini.js at: ${geminiJsPath} (Model: ${model})\n`);
    return spawn('node', [
      geminiJsPath,
      '--skip-trust',
      '-y',
      '-m',
      model,
      '-p',
      agentPrompt
    ], {
      cwd: repoPath,
      env
    });
  } else {
    onData(`[${logLabel}] gemini.js not found. Spawning 'gemini' CLI in shell mode... (Model: ${model})\n`);
    return spawn('gemini', [
      '--skip-trust',
      '-y',
      '-m',
      model,
      '-p',
      agentPrompt
    ], {
      cwd: repoPath,
      env,
      shell: process.platform === 'win32'
    });
  }
}

/**
 * Resolves the actual default branch name from GitHub when the configured one may be wrong.
 * Falls back to the configured branch if the API call fails.
 */
export async function resolveGitHubDefaultBranch(
  owner: string,
  repo: string,
  token: string,
  configuredBranch: string
): Promise<string> {
  const headers: Record<string, string> = {
    'Accept': 'application/vnd.github.v3+json',
    'User-Agent': 'BaseFlow-App',
    'Authorization': `token ${token}`
  };
  const checkRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/git/ref/heads/${configuredBranch}`, { headers });
  if (checkRes.ok) return configuredBranch;

  console.warn(`[BaseFlow] Branch "${configuredBranch}" not found (${checkRes.status}). Auto-detecting default branch...`);
  const repoRes = await fetch(`https://api.github.com/repos/${owner}/${repo}`, { headers });
  if (!repoRes.ok) {
    throw new Error(`Failed to fetch repo info to detect default branch: ${repoRes.statusText} (${repoRes.status})`);
  }
  const repoData = await repoRes.json() as any;
  const detected = repoData.default_branch as string;
  console.log(`[BaseFlow] Auto-detected default branch: "${detected}"`);
  return detected;
}

/**
 * Resolves the actual default branch name from GitLab when the configured one may be wrong.
 */
export async function resolveGitLabDefaultBranch(
  fullPath: string,
  token: string,
  configuredBranch: string
): Promise<string> {
  const headers: Record<string, string> = { 'PRIVATE-TOKEN': token };
  const urlEncodedPath = encodeURIComponent(fullPath);

  // Check if configured branch exists
  const checkRes = await fetch(
    `https://gitlab.com/api/v4/projects/${urlEncodedPath}/repository/branches/${encodeURIComponent(configuredBranch)}`,
    { headers }
  );
  if (checkRes.ok) return configuredBranch;

  console.warn(`[BaseFlow] GitLab branch "${configuredBranch}" not found (${checkRes.status}). Auto-detecting default branch...`);
  const repoRes = await fetch(`https://gitlab.com/api/v4/projects/${urlEncodedPath}`, { headers });
  if (!repoRes.ok) {
    throw new Error(`Failed to fetch GitLab project info: ${repoRes.statusText} (${repoRes.status})`);
  }
  const repoData = await repoRes.json() as any;
  const detected = repoData.default_branch as string;
  console.log(`[BaseFlow] Auto-detected GitLab default branch: "${detected}"`);
  return detected;
}

/** Extract a readable error message from a failed GitHub API response */
async function githubErrorMessage(res: Response): Promise<string> {
  try {
    const body = await res.json() as any;
    // GitHub returns { message, errors: [{ message }] }
    const detail = body?.errors?.map((e: any) => e.message).join('; ');
    return `${body?.message || res.statusText}${detail ? ' — ' + detail : ''} (HTTP ${res.status})`;
  } catch {
    return `${res.statusText} (HTTP ${res.status})`;
  }
}

// GitHub commit helper using Git database REST APIs
export async function commitToGitHub(
  owner: string,
  repo: string,
  token: string,
  branchName: string,
  baseBranch: string,
  commitMessage: string,
  files: { path: string; content: string }[]
): Promise<string> {
  const headers: Record<string, string> = {
    'Accept': 'application/vnd.github.v3+json',
    'User-Agent': 'BaseFlow-App',
    'Authorization': `token ${token}`,
    'Content-Type': 'application/json'
  };

  // 1. Get base branch SHA (baseBranch already validated/resolved by caller)
  const refRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/git/ref/heads/${baseBranch}`, { headers });
  if (!refRes.ok) {
    throw new Error(`Failed to get base branch ref "${baseBranch}": ${await githubErrorMessage(refRes)}\n💡 Make sure your GitHub token has 'repo' scope and push access to ${owner}/${repo}.`);
  }
  const refData = await refRes.json() as any;
  const baseCommitSha = refData.object.sha;

  // 2. Create blobs (base64 is more reliable than utf-8 for Java/source with special chars)
  const treeItems = [];
  for (const file of files) {
    const contentBase64 = Buffer.from(file.content, 'utf-8').toString('base64');
    const blobRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/git/blobs`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        content: contentBase64,
        encoding: 'base64'
      })
    });
    if (!blobRes.ok) {
      const errMsg = await githubErrorMessage(blobRes);
      throw new Error(
        `Failed to create blob for "${file.path}": ${errMsg}\n` +
        `💡 This usually means the token lacks push/write access to ${owner}/${repo}.\n` +
        `   → Check: your token needs 'repo' scope AND you must be a collaborator/owner.\n` +
        `   → If this is a fork, configure the connection with your fork's owner name.`
      );
    }
    const blobData = await blobRes.json() as any;
    treeItems.push({
      path: file.path,
      mode: '100644',
      type: 'blob',
      sha: blobData.sha
    });
  }

  // 3. Create tree
  const treeRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/git/trees`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      base_tree: baseCommitSha,
      tree: treeItems
    })
  });
  if (!treeRes.ok) {
    throw new Error(`Failed to create tree: ${treeRes.statusText} (${treeRes.status})`);
  }
  const treeData = await treeRes.json() as any;
  const treeSha = treeData.sha;

  // 4. Create commit
  const commitRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/git/commits`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      message: commitMessage,
      tree: treeSha,
      parents: [baseCommitSha]
    })
  });
  if (!commitRes.ok) {
    throw new Error(`Failed to create commit: ${commitRes.statusText} (${commitRes.status})`);
  }
  const commitData = await commitRes.json() as any;
  const commitSha = commitData.sha;

  // 5. Create branch ref
  const createRefRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/git/refs`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      ref: `refs/heads/${branchName}`,
      sha: commitSha
    })
  });
  if (!createRefRes.ok) {
    // If branch already exists, update it instead (force: true)
    const updateRefRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/git/refs/heads/${branchName}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({
        sha: commitSha,
        force: true
      })
    });
    if (!updateRefRes.ok) {
      throw new Error(`Failed to create or update branch ref: ${createRefRes.statusText} (${createRefRes.status})`);
    }
  }
  
  return commitSha;
}

export interface PlaybookWorkflowOptions {
  conn: string;
  repoPath: string;
  playbookPath: string;
  issueNumber: string;
  devops: any;
  token: string;
  logLabel: string;
  onChunk: (chunk: string, isSystemLog?: boolean) => void;
  onError: (error: string) => void;
  onDone: (mrUrl: string) => void;
  onFileModified?: (filePath: string) => void;
  onModifiedFiles?: (files: string[]) => void;
}

/**
 * Executes a playbook, pipes stdout/stderr output, and upon successful completion,
 * commits modified files and creates a Pull Request/Merge Request.
 */
export async function executePlaybookWorkflow(options: PlaybookWorkflowOptions) {
  const {
    conn,
    repoPath,
    playbookPath,
    issueNumber,
    devops,
    token,
    logLabel,
    onChunk,
    onError,
    onDone,
    onFileModified,
    onModifiedFiles
  } = options;

  let child;
  try {
    child = runPlaybookCli({
      repoPath,
      playbookPath,
      logLabel,
      onData: (chunk) => onChunk(chunk, true)
    });
  } catch (err: any) {
    onError(err.message);
    return;
  }

  let stdout = '';
  let stderr = '';

  child.stdout.on('data', (data: any) => {
    const chunk = data.toString('utf8');
    stdout += chunk;
    process.stdout.write(chunk);
    onChunk(chunk, true);
  });

  child.stderr.on('data', (data: any) => {
    const chunk = data.toString('utf8');
    stderr += chunk;
    process.stderr.write(chunk);
    onChunk(chunk, true);
  });

  const timeoutId = setTimeout(() => {
    child.kill();
    onError(`${logLabel} timed out after 5 minutes.`);
  }, 300000);

  child.on('close', async (code: number) => {
    clearTimeout(timeoutId);

    if (code !== 0) {
      console.error(`[gemini error]: exited with code ${code}`);
      onError(`Gemini CLI failed with exit code ${code}.`);
      return;
    }

    // Parse modified files list from captured stdout
    const match = stdout.match(/MODIFIED_FILES:\s*(\[.*?\])/);
    if (!match) {
      console.warn(`[${logLabel}] No MODIFIED_FILES tag found in gemini output.`);
      onError(`Gemini completed but did not output the modified files list. Please check the playbook instructions and try again.`);
      return;
    }

    let modifiedFilePaths: string[] = [];
    try {
      modifiedFilePaths = JSON.parse(match[1].trim());
    } catch (e: any) {
      console.error(`[${logLabel}] Failed to parse modified files JSON:`, e);
      onError(`Failed to parse modified files output: ${e.message}`);
      return;
    }

    if (onModifiedFiles) {
      onModifiedFiles(modifiedFilePaths);
    }

    if (modifiedFilePaths.length === 0) {
      onChunk(`\n\nNo files were modified by the Gemini CLI.`);
      onDone('');
      return;
    }

    onChunk(`\n\n**Found ${modifiedFilePaths.length} modified files:**\n` + modifiedFilePaths.map(f => `- \`${f}\``).join('\n'));
    onChunk(`\n\n⚙️ **Committing changes and creating PR/MR via REST API...**\n`);

    // Read modified files content from disk
    const filesToCommit: { path: string; content: string }[] = [];
    for (const filePath of modifiedFilePaths) {
      const fullFilePath = path.join(repoPath, filePath);
      if (fs.existsSync(fullFilePath)) {
        const content = fs.readFileSync(fullFilePath, 'utf-8');
        filesToCommit.push({ path: filePath, content });
        if (onFileModified) {
          onFileModified(filePath);
        }
      } else {
        console.warn(`[${logLabel}] File listed as modified not found: ${filePath}`);
      }
    }

    if (filesToCommit.length === 0) {
      onError('Modified files listed by Gemini CLI were not found on disk.');
      return;
    }

    // Resolve the actual base branch (auto-detect if configured value doesn't exist)
    let baseBranch = devops.profile.options?.branch || 'main';
    const branchName = `fix/issue-${issueNumber}`;
    const mrTitle = `Resolve Issue #${issueNumber}`;
    const mrDescription = `Automated fix generated by Gemini CLI using playbook \`${playbookPath}\`.\n\nCloses #${issueNumber}.`;

    try {
      if (devops.provider === 'github') {
        // Auto-detect real default branch in case configured one (e.g. "main") doesn't exist
        baseBranch = await resolveGitHubDefaultBranch(devops.owner, devops.repo, token, baseBranch);
        onChunk(`\n\n📌 **Base branch resolved:** \`${baseBranch}\`\n`);
        console.log(`[${logLabel}] Committing changes to GitHub branch ${branchName} (base: ${baseBranch})...`);
        await commitToGitHub(devops.owner, devops.repo, token, branchName, baseBranch, mrTitle, filesToCommit);

        console.log(`[${logLabel}] Creating Pull Request...`);
        const url = `https://api.github.com/repos/${devops.owner}/${devops.repo}/pulls`;
        const headers = {
          'Accept': 'application/vnd.github.v3+json',
          'User-Agent': 'BaseFlow-App',
          'Authorization': `token ${token}`,
          'Content-Type': 'application/json'
        };
        
        const prResponse = await fetch(url, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            title: mrTitle,
            head: branchName,
            base: baseBranch,
            body: mrDescription
          })
        });
        
        if (!prResponse.ok) {
          const errorData = await prResponse.json() as any;
          throw new Error(`GitHub PR creation error: ${errorData.message || prResponse.statusText}`);
        }
        
        const prData = await prResponse.json() as any;
        onDone(prData.html_url);

      } else if (devops.provider === 'gitlab') {
        // Auto-detect real default branch for GitLab
        baseBranch = await resolveGitLabDefaultBranch(devops.fullPath, token, baseBranch);
        onChunk(`\n\n📌 **Base branch resolved:** \`${baseBranch}\`\n`);
        console.log(`[${logLabel}] Committing changes to GitLab branch ${branchName} (base: ${baseBranch})...`);

        const actions = filesToCommit.map(file => ({
          action: 'create' as const,  // GitLab API: 'create' or 'update' — use 'create' and let API handle conflict
          file_path: file.path,
          content: Buffer.from(file.content, 'utf-8').toString('base64'),
          encoding: 'base64'
        }));

        const urlEncodedPath = encodeURIComponent(devops.fullPath);
        const commitUrl = `https://gitlab.com/api/v4/projects/${urlEncodedPath}/repository/commits`;
        const headers = {
          'PRIVATE-TOKEN': token,
          'Content-Type': 'application/json'
        };

        const commitResponse = await fetch(commitUrl, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            branch: branchName,
            start_branch: baseBranch,
            commit_message: mrTitle,
            actions
          })
        });

        if (!commitResponse.ok) {
          const errorData = await commitResponse.json() as any;
          const detail = Array.isArray(errorData?.message)
            ? errorData.message.join('; ')
            : (errorData?.message || commitResponse.statusText);
          throw new Error(
            `GitLab commit error: ${detail} (HTTP ${commitResponse.status})\n` +
            `💡 Make sure your token has 'api' scope and Maintainer/Developer access to ${devops.fullPath}.`
          );
        }

        console.log(`[${logLabel}] Creating Merge Request...`);
        const mrUrl = `https://gitlab.com/api/v4/projects/${urlEncodedPath}/merge_requests`;
        const mrResponse = await fetch(mrUrl, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            source_branch: branchName,
            target_branch: baseBranch,
            title: mrTitle,
            description: mrDescription
          })
        });

        if (!mrResponse.ok) {
          const errorData = await mrResponse.json() as any;
          const detail = Array.isArray(errorData?.message)
            ? errorData.message.join('; ')
            : (errorData?.message || mrResponse.statusText);
          throw new Error(
            `GitLab MR creation error: ${detail} (HTTP ${mrResponse.status})\n` +
            `💡 Ensure the branch "${branchName}" was created and the token has MR creation rights.`
          );
        }

        const mrData = await mrResponse.json() as any;
        onDone(mrData.web_url);
      } else {
        onError('Unsupported VCS provider');
      }
    } catch (apiError: any) {
      console.error(`[${logLabel}] Git API error:`, apiError);
      onError(`Gemini CLI succeeded but failed to commit/create PR: ${apiError.message}`);
    }
  });
}
