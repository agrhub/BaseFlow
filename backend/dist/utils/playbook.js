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
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveAgyBinary = resolveAgyBinary;
exports.getAgyProfileDir = getAgyProfileDir;
exports.restoreAgyCredentials = restoreAgyCredentials;
exports.saveAgyCredentials = saveAgyCredentials;
exports.runPlaybookCli = runPlaybookCli;
exports.resolveGitHubDefaultBranch = resolveGitHubDefaultBranch;
exports.resolveGitLabDefaultBranch = resolveGitLabDefaultBranch;
exports.commitToGitHub = commitToGitHub;
exports.executePlaybookWorkflow = executePlaybookWorkflow;
const child_process_1 = require("child_process");
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
const ConnectionStore_1 = require("../services/ConnectionStore");
/**
 * Resolves the path to the agy binary.
 */
function resolveAgyBinary() {
    const isWin = process.platform === 'win32';
    if (isWin) {
        const userProfile = process.env.USERPROFILE || 'C:\\Users\\default';
        const winPath = path.join(userProfile, 'AppData', 'Local', 'agy', 'bin', 'agy.exe');
        if (fs.existsSync(winPath)) {
            return winPath;
        }
    }
    else {
        const home = process.env.HOME || '/root';
        const paths = [
            path.join(home, '.local', 'bin', 'agy'),
            '/usr/local/bin/agy',
            '/usr/bin/agy'
        ];
        for (const p of paths) {
            if (fs.existsSync(p)) {
                return p;
            }
        }
    }
    return 'agy';
}
/**
 * Gets the isolated data directory profile path for a connection.
 */
function getAgyProfileDir(connName) {
    const dataDir = process.env.DATA_DIR || path.join(__dirname, '..', '..', 'data');
    return path.join(dataDir, 'agy_profiles', connName);
}
/**
 * Restores the connection-specific OAuth credentials from the database to disk.
 */
async function restoreAgyCredentials(connName) {
    const profileDir = getAgyProfileDir(connName);
    const geminiDir = path.join(profileDir, '.gemini');
    const credsFile = path.join(geminiDir, 'oauth_creds.json');
    const conn = await ConnectionStore_1.connectionStore.getConnection(connName);
    if (!conn || !conn.agy_auth_code) {
        return false;
    }
    if (!fs.existsSync(geminiDir)) {
        fs.mkdirSync(geminiDir, { recursive: true });
    }
    fs.writeFileSync(credsFile, conn.agy_auth_code, 'utf-8');
    return true;
}
/**
 * Saves the connection-specific OAuth credentials from disk to the database.
 */
async function saveAgyCredentials(connName) {
    const profileDir = getAgyProfileDir(connName);
    const credsFile = path.join(profileDir, '.gemini', 'oauth_creds.json');
    if (!fs.existsSync(credsFile)) {
        return false;
    }
    try {
        const credsContent = fs.readFileSync(credsFile, 'utf-8');
        JSON.parse(credsContent); // Validate JSON
        const conn = await ConnectionStore_1.connectionStore.getConnection(connName);
        if (conn) {
            await ConnectionStore_1.connectionStore.saveConnection(conn.name, conn.uri, conn.options, credsContent);
            return true;
        }
    }
    catch (err) {
        console.error('Failed to save agy credentials to DB:', err);
    }
    return false;
}
/**
 * Common helper to resolve path and spawn the agy CLI process
 * with proper API keys and Vertex AI environment variables.
 */
async function runPlaybookCli(options) {
    const { conn, repoPath, playbookPath, logLabel, onData } = options;
    const useVertex = process.env.GOOGLE_GENAI_USE_VERTEXAI === '1' || process.env.GOOGLE_GENAI_USE_VERTEXAI === 'true';
    const hasServiceAccount = !!process.env.GOOGLE_APPLICATION_CREDENTIALS || !!process.env.CLOUD_RUN;
    // Build subprocess env — start from current process env
    const env = { ...process.env };
    if (conn) {
        const profileDir = getAgyProfileDir(conn);
        try {
            const restored = await restoreAgyCredentials(conn);
            if (restored) {
                onData(`[${logLabel}] Restored authenticated credentials for connection profile: ${conn}\n`);
            }
        }
        catch (err) {
            onData(`[${logLabel}] Warning restoring credentials: ${err.message}\n`);
        }
        // Isolate agy data directory per connection profile
        env['USERPROFILE'] = profileDir;
        env['HOME'] = profileDir;
        env['APPDATA'] = path.join(profileDir, 'AppData', 'Roaming');
        env['LOCALAPPDATA'] = path.join(profileDir, 'AppData', 'Local');
    }
    if (useVertex) {
        const resolvedLocation = process.env.GOOGLE_CLOUD_LOCATION || 'global';
        env['GOOGLE_GENAI_USE_VERTEXAI'] = 'true';
        env['GOOGLE_CLOUD_LOCATION'] = resolvedLocation;
        if (process.env.GOOGLE_CLOUD_PROJECT) {
            env['GOOGLE_CLOUD_PROJECT'] = process.env.GOOGLE_CLOUD_PROJECT;
        }
        if (hasServiceAccount) {
            // Service Account auth → GOOGLE_API_KEY is not needed and would confuse the CLI
            delete env['GOOGLE_API_KEY'];
            delete env['GEMINI_API_KEY'];
            onData(`[${logLabel}] Using Vertex AI with Service Account (${process.env.GOOGLE_APPLICATION_CREDENTIALS || 'Implicit Cloud Run Service Account'}), location: ${resolvedLocation}\n`);
        }
        else {
            // API Key + Vertex AI backend
            const apiKey = process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY || '';
            if (!apiKey) {
                throw new Error('Vertex AI requires either GOOGLE_APPLICATION_CREDENTIALS or GOOGLE_API_KEY.');
            }
            env['GEMINI_API_KEY'] = apiKey;
            delete env['GOOGLE_API_KEY'];
            onData(`[${logLabel}] Using Vertex AI with API Key, location: ${resolvedLocation}\n`);
        }
    }
    else {
        // If not using Vertex AI and we have no restored OAuth token in profile, fall back to API Key
        const connProfile = conn ? await ConnectionStore_1.connectionStore.getConnection(conn) : null;
        const hasOauth = connProfile && connProfile.agy_auth_code;
        if (!hasOauth) {
            const apiKey = process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY || '';
            if (!apiKey) {
                throw new Error('Google/Gemini API Key or OAuth credentials not configured.');
            }
            env['GEMINI_API_KEY'] = apiKey;
            delete env['GOOGLE_API_KEY'];
            env['GOOGLE_GENAI_USE_VERTEXAI'] = 'false';
            onData(`[${logLabel}] Using Google AI Studio (API Key)\n`);
        }
        else {
            onData(`[${logLabel}] Using Authenticated Google Account (OAuth via agy CLI)\n`);
        }
    }
    env['GEMINI_CLI_TRUST_WORKSPACE'] = 'true';
    env['PAGER'] = 'cat';
    const model = process.env.GEMINI_CLI_MODEL || process.env.AGENT_MODEL || 'gemini-3.5-flash';
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
    const agyBin = resolveAgyBinary();
    onData(`[${logLabel}] Spawning agy CLI at: ${agyBin} (Model: ${model})\n`);
    return (0, child_process_1.spawn)(agyBin, [
        '--dangerously-skip-permissions',
        '--model',
        model,
        '--print',
        agentPrompt
    ], {
        cwd: repoPath,
        env,
        shell: process.platform === 'win32'
    });
}
/**
 * Resolves the actual default branch name from GitHub when the configured one may be wrong.
 * Falls back to the configured branch if the API call fails.
 */
async function resolveGitHubDefaultBranch(owner, repo, token, configuredBranch) {
    const headers = {
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'BaseFlow-App',
        'Authorization': `token ${token}`
    };
    const checkRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/git/ref/heads/${configuredBranch}`, { headers });
    if (checkRes.ok)
        return configuredBranch;
    console.warn(`[BaseFlow] Branch "${configuredBranch}" not found (${checkRes.status}). Auto-detecting default branch...`);
    const repoRes = await fetch(`https://api.github.com/repos/${owner}/${repo}`, { headers });
    if (!repoRes.ok) {
        throw new Error(`Failed to fetch repo info to detect default branch: ${repoRes.statusText} (${repoRes.status})`);
    }
    const repoData = await repoRes.json();
    const detected = repoData.default_branch;
    console.log(`[BaseFlow] Auto-detected default branch: "${detected}"`);
    return detected;
}
/**
 * Resolves the actual default branch name from GitLab when the configured one may be wrong.
 */
async function resolveGitLabDefaultBranch(fullPath, token, configuredBranch) {
    const headers = { 'PRIVATE-TOKEN': token };
    const urlEncodedPath = encodeURIComponent(fullPath);
    // Check if configured branch exists
    const checkRes = await fetch(`https://gitlab.com/api/v4/projects/${urlEncodedPath}/repository/branches/${encodeURIComponent(configuredBranch)}`, { headers });
    if (checkRes.ok)
        return configuredBranch;
    console.warn(`[BaseFlow] GitLab branch "${configuredBranch}" not found (${checkRes.status}). Auto-detecting default branch...`);
    const repoRes = await fetch(`https://gitlab.com/api/v4/projects/${urlEncodedPath}`, { headers });
    if (!repoRes.ok) {
        throw new Error(`Failed to fetch GitLab project info: ${repoRes.statusText} (${repoRes.status})`);
    }
    const repoData = await repoRes.json();
    const detected = repoData.default_branch;
    console.log(`[BaseFlow] Auto-detected GitLab default branch: "${detected}"`);
    return detected;
}
/** Extract a readable error message from a failed GitHub API response */
async function githubErrorMessage(res) {
    try {
        const body = await res.json();
        // GitHub returns { message, errors: [{ message }] }
        const detail = body?.errors?.map((e) => e.message).join('; ');
        return `${body?.message || res.statusText}${detail ? ' — ' + detail : ''} (HTTP ${res.status})`;
    }
    catch {
        return `${res.statusText} (HTTP ${res.status})`;
    }
}
// GitHub commit helper using Git database REST APIs
async function commitToGitHub(owner, repo, token, branchName, baseBranch, commitMessage, files) {
    const headers = {
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
    const refData = await refRes.json();
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
            throw new Error(`Failed to create blob for "${file.path}": ${errMsg}\n` +
                `💡 This usually means the token lacks push/write access to ${owner}/${repo}.\n` +
                `   → Check: your token needs 'repo' scope AND you must be a collaborator/owner.\n` +
                `   → If this is a fork, configure the connection with your fork's owner name.`);
        }
        const blobData = await blobRes.json();
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
    const treeData = await treeRes.json();
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
    const commitData = await commitRes.json();
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
/**
 * Executes a playbook, pipes stdout/stderr output, and upon successful completion,
 * commits modified files and creates a Pull Request/Merge Request.
 */
async function executePlaybookWorkflow(options) {
    const { conn, repoPath, playbookPath, issueNumber, devops, token, logLabel, onChunk, onError, onDone, onFileModified, onModifiedFiles } = options;
    let child;
    try {
        child = await runPlaybookCli({
            conn,
            repoPath,
            playbookPath,
            logLabel,
            onData: (chunk) => onChunk(chunk, true)
        });
    }
    catch (err) {
        onError(err.message);
        return;
    }
    let stdout = '';
    let stderr = '';
    if (child.stdout) {
        child.stdout.on('data', (data) => {
            const chunk = data.toString('utf8');
            stdout += chunk;
            process.stdout.write(chunk);
            onChunk(chunk, true);
        });
    }
    if (child.stderr) {
        child.stderr.on('data', (data) => {
            const chunk = data.toString('utf8');
            stderr += chunk;
            process.stderr.write(chunk);
            onChunk(chunk, true);
        });
    }
    const timeoutId = setTimeout(() => {
        child.kill();
        onError(`${logLabel} timed out after 5 minutes.`);
    }, 300000);
    child.on('close', async (code) => {
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
        let modifiedFilePaths = [];
        try {
            modifiedFilePaths = JSON.parse(match[1].trim());
        }
        catch (e) {
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
        const filesToCommit = [];
        for (const filePath of modifiedFilePaths) {
            const fullFilePath = path.join(repoPath, filePath);
            if (fs.existsSync(fullFilePath)) {
                const content = fs.readFileSync(fullFilePath, 'utf-8');
                filesToCommit.push({ path: filePath, content });
                if (onFileModified) {
                    onFileModified(filePath);
                }
            }
            else {
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
                    const errorData = await prResponse.json();
                    throw new Error(`GitHub PR creation error: ${errorData.message || prResponse.statusText}`);
                }
                const prData = await prResponse.json();
                onDone(prData.html_url);
            }
            else if (devops.provider === 'gitlab') {
                // Auto-detect real default branch for GitLab
                baseBranch = await resolveGitLabDefaultBranch(devops.fullPath, token, baseBranch);
                onChunk(`\n\n📌 **Base branch resolved:** \`${baseBranch}\`\n`);
                console.log(`[${logLabel}] Committing changes to GitLab branch ${branchName} (base: ${baseBranch})...`);
                const actions = filesToCommit.map(file => ({
                    action: 'create', // GitLab API: 'create' or 'update' — use 'create' and let API handle conflict
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
                    const errorData = await commitResponse.json();
                    const detail = Array.isArray(errorData?.message)
                        ? errorData.message.join('; ')
                        : (errorData?.message || commitResponse.statusText);
                    throw new Error(`GitLab commit error: ${detail} (HTTP ${commitResponse.status})\n` +
                        `💡 Make sure your token has 'api' scope and Maintainer/Developer access to ${devops.fullPath}.`);
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
                    const errorData = await mrResponse.json();
                    const detail = Array.isArray(errorData?.message)
                        ? errorData.message.join('; ')
                        : (errorData?.message || mrResponse.statusText);
                    throw new Error(`GitLab MR creation error: ${detail} (HTTP ${mrResponse.status})\n` +
                        `💡 Ensure the branch "${branchName}" was created and the token has MR creation rights.`);
                }
                const mrData = await mrResponse.json();
                onDone(mrData.web_url);
            }
            else {
                onError('Unsupported VCS provider');
            }
        }
        catch (apiError) {
            console.error(`[${logLabel}] Git API error:`, apiError);
            onError(`Gemini CLI succeeded but failed to commit/create PR: ${apiError.message}`);
        }
    });
}
