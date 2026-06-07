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
exports.tempDir = void 0;
exports.clearRepoCache = clearRepoCache;
exports.parseGitUrl = parseGitUrl;
exports.resolveRepoPath = resolveRepoPath;
exports.getOrScanRepo = getOrScanRepo;
exports.generateReadmeAnalysis = generateReadmeAnalysis;
exports.performCompleteAnalysis = performCompleteAnalysis;
exports.fetchGitHubRepoStats = fetchGitHubRepoStats;
exports.fetchGitLabRepoStats = fetchGitLabRepoStats;
exports.fetchFromGitLab = fetchFromGitLab;
exports.fetchFromGitHub = fetchFromGitHub;
exports.fetchPaginatedFromGitLab = fetchPaginatedFromGitLab;
exports.fetchPaginatedFromGitHub = fetchPaginatedFromGitHub;
exports.getDevOpsInfo = getDevOpsInfo;
exports.generateArchitectureDiagrams = generateArchitectureDiagrams;
exports.getAuthenticatedGitUrl = getAuthenticatedGitUrl;
exports.cloneRemoteRepo = cloneRemoteRepo;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const simple_git_1 = require("simple-git");
const GeminiService_1 = require("../services/GeminiService");
const parser_1 = require("../utils/parser");
const ConnectionStore_1 = require("../services/ConnectionStore");
const tools_1 = require("../agent/tools");
const prompts_1 = require("../prompts/prompts");
const repoCache = new Map();
function clearRepoCache(profileName) {
    console.log(`Clearing in-memory and disk cache for connection ${profileName}...`);
    repoCache.delete(profileName);
    const cachePath = path.join(exports.tempDir, `${profileName}_cache.json`);
    if (fs.existsSync(cachePath)) {
        try {
            fs.unlinkSync(cachePath);
        }
        catch (e) {
            console.warn(`Failed to delete cache file at ${cachePath}:`, e.message || e);
        }
    }
}
exports.tempDir = process.env.TEMP_DIR || path.join(__dirname, '..', '..', 'temp');
if (!fs.existsSync(exports.tempDir)) {
    try {
        fs.mkdirSync(exports.tempDir, { recursive: true });
    }
    catch (e) {
        console.error(`Failed to create temp directory at ${exports.tempDir}:`, e.message || e);
    }
}
// Git repository URL parser
function parseGitUrl(url) {
    if (!url)
        return null;
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
function resolveRepoPath(profile) {
    const uri = profile.uri || profile.string;
    if (profile.options?.type === 'local') {
        return path.resolve(uri);
    }
    // For remote URL, return temp folder path
    const repoName = uri.split('/').pop()?.replace('.git', '') || 'temp-repo';
    return path.join(exports.tempDir, repoName);
}
// Helper to recursively find the latest file modification time in the repository
function getRepoLastModified(dirPath) {
    let maxMtime = 0;
    function walk(currentDir) {
        if (!fs.existsSync(currentDir))
            return;
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
                }
                else {
                    const mtime = stat.mtimeMs;
                    if (mtime > maxMtime) {
                        maxMtime = mtime;
                    }
                }
            }
            catch (e) { }
        }
    }
    walk(dirPath);
    return maxMtime;
}
// Scan repository utility
async function getOrScanRepo(profileName) {
    if (repoCache.has(profileName)) {
        console.log(`Returning in-memory cache for connection ${profileName}...`);
        return repoCache.get(profileName);
    }
    const profile = await ConnectionStore_1.connectionStore.getConnection(profileName);
    if (!profile) {
        throw new Error(`Profile ${profileName} not found.`);
    }
    const targetPath = resolveRepoPath(profile);
    // If remote and does not exist, clone it
    if (profile.options?.type !== 'local' && !fs.existsSync(targetPath)) {
        console.log(`Auto-cloning ${profile.uri} to ${targetPath}...`);
        const cloneOptions = ['--depth', '100'];
        if (profile.options?.branch) {
            cloneOptions.push('-b', profile.options.branch);
        }
        try {
            const authUri = getAuthenticatedGitUrl(profile.uri, profile.options);
            await (0, simple_git_1.simpleGit)().clone(authUri, targetPath, cloneOptions);
        }
        catch (e) {
            const msg = e.message || String(e);
            console.warn(`Clone warning/error (could be checkout warning on Windows):`, msg);
            // Retry with SSL verification disabled if this is an SSL cert error (e.g. Cloud Run)
            const isSslError = msg.includes('certificate') || msg.includes('SSL') || msg.includes('CAfile');
            if (isSslError) {
                console.warn('SSL certificate error detected. Retrying clone with http.sslVerify=false...');
                try {
                    const authUri = getAuthenticatedGitUrl(profile.uri, profile.options);
                    await (0, simple_git_1.simpleGit)({ config: ['http.sslVerify=false'] }).clone(authUri, targetPath, cloneOptions);
                }
                catch (retryErr) {
                    console.warn('Retry clone also failed:', retryErr.message || retryErr);
                    // Fall through to existing check below
                }
            }
            // Check if target directory exists and is populated with actual source files
            if (fs.existsSync(targetPath) && fs.readdirSync(targetPath).filter(f => f !== '.git' && f !== '.baseflow_diagrams.json').length > 0) {
                console.log(`Proceeding anyway since target path has files.`);
            }
            else {
                throw e;
            }
        }
    }
    if (!fs.existsSync(targetPath)) {
        throw new Error(`Path does not exist: ${targetPath}`);
    }
    // Check for cached scan result file
    const cachePath = path.join(exports.tempDir, `${profileName}_cache.json`);
    let useCache = false;
    if (fs.existsSync(cachePath)) {
        useCache = true;
    }
    if (useCache) {
        try {
            console.log(`Loading cached parse result for connection ${profileName}...`);
            const cacheContent = fs.readFileSync(cachePath, 'utf-8');
            const result = JSON.parse(cacheContent);
            (0, tools_1.setCurrentScanResult)(targetPath, result.classes);
            const resVal = {
                repoPath: targetPath,
                classes: result.classes,
                graph: result
            };
            repoCache.set(profileName, resVal);
            return resVal;
        }
        catch (err) {
            console.warn(`Failed to parse cache file for ${profileName}, re-scanning...`, err);
        }
    }
    console.log(`First scan or changes detected. Parsing repository ${profileName}...`);
    const result = (0, parser_1.parseRepository)(targetPath);
    // Write to cache file
    try {
        fs.writeFileSync(cachePath, JSON.stringify(result), 'utf-8');
    }
    catch (err) {
        console.warn(`Failed to write cache file for ${profileName}:`, err);
    }
    (0, tools_1.setCurrentScanResult)(targetPath, result.classes);
    const finalRes = {
        repoPath: targetPath,
        classes: result.classes,
        graph: result
    };
    repoCache.set(profileName, finalRes);
    return finalRes;
}
// Generate README AI Analysis and save to cache
async function generateReadmeAnalysis(connName, repoPath) {
    const cachePath = path.join(repoPath, '.baseflow_readme_analysis.json');
    // Find README.md
    let readmePath = '';
    let files = [];
    try {
        files = fs.readdirSync(repoPath);
    }
    catch (e) {
        console.warn(`Failed to read repo path ${repoPath}:`, e);
    }
    const readmeFile = files.find(f => f.toLowerCase() === 'readme.md');
    let readmeContent = '';
    if (readmeFile) {
        readmePath = path.join(repoPath, readmeFile);
        readmeContent = fs.readFileSync(readmePath, 'utf-8');
    }
    else {
        // Fallback: list project structure to analyze
        const allFiles = (0, parser_1.parseRepository)(repoPath).classes.map(c => c.filePath);
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
    let jsonResult = null;
    try {
        const prompt = (0, prompts_1.getReadmeAnalysisPrompt)(readmeContent);
        jsonResult = await GeminiService_1.geminiService.generateJSON(prompt);
        fs.writeFileSync(cachePath, JSON.stringify(jsonResult, null, 2), 'utf-8');
    }
    catch (cacheErr) {
        console.warn('Failed to write readme analysis cache:', cacheErr);
    }
    return jsonResult;
}
// Perform a complete scanning and analysis run, creating all cache files
async function performCompleteAnalysis(connName) {
    console.log(`Starting complete codebase analysis for ${connName}...`);
    // 1. Run AST scan & build graph
    const scanData = await getOrScanRepo(connName);
    // 2. Run README analysis
    try {
        await generateReadmeAnalysis(connName, scanData.repoPath);
    }
    catch (readmeErr) {
        console.error(`Failed to pre-generate README analysis for ${connName}:`, readmeErr);
    }
    // 3. Run Architecture diagrams generation
    try {
        const diagrams = await generateArchitectureDiagrams(connName, scanData.repoPath, scanData.classes);
        const diagramsCachePath = path.join(scanData.repoPath, '.baseflow_diagrams.json');
        fs.writeFileSync(diagramsCachePath, JSON.stringify(diagrams, null, 2), 'utf-8');
    }
    catch (diagramErr) {
        console.error(`Failed to pre-generate architecture diagrams for ${connName}:`, diagramErr);
    }
    return scanData;
}
async function fetchGitHubRepoStats(owner, repo, token) {
    try {
        const url = `https://api.github.com/repos/${owner}/${repo}`;
        const activityUrl = `https://api.github.com/repos/${owner}/${repo}/stats/commit_activity`;
        const headers = {
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
        if (!repoRes.ok)
            return null;
        const data = await repoRes.json();
        let commitActivity = [];
        if (activityRes.ok && activityRes.status === 200) {
            const activityData = await activityRes.json();
            if (Array.isArray(activityData) && activityData.length > 0) {
                const allDays = [];
                const lastWeeks = activityData.slice(-3);
                lastWeeks.forEach(week => {
                    const weekStart = new Date(week.week * 1000);
                    week.days.forEach((count, dayIdx) => {
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
    }
    catch (e) {
        console.warn('Failed to fetch GitHub stats:', e);
        return null;
    }
}
async function fetchGitLabRepoStats(fullPath, token) {
    try {
        const urlEncodedPath = encodeURIComponent(fullPath);
        const url = `https://gitlab.com/api/v4/projects/${urlEncodedPath}`;
        const d14 = new Date();
        d14.setDate(d14.getDate() - 14);
        const sinceStr = d14.toISOString();
        const commitsUrl = `https://gitlab.com/api/v4/projects/${urlEncodedPath}/repository/commits?since=${sinceStr}&per_page=100`;
        const headers = {};
        if (token) {
            headers['PRIVATE-TOKEN'] = token;
        }
        const [repoRes, commitsRes] = await Promise.all([
            fetch(url, { headers }),
            fetch(commitsUrl, { headers })
        ]);
        if (!repoRes.ok)
            return null;
        const data = await repoRes.json();
        let commitActivity = [];
        if (commitsRes.ok) {
            const commitsData = await commitsRes.json();
            const countsByDate = {};
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
    }
    catch (e) {
        console.warn('Failed to fetch GitLab stats:', e);
        return null;
    }
}
// Helper to fetch from GitLab API
async function fetchFromGitLab(fullPath, endpoint, token) {
    const urlEncodedPath = encodeURIComponent(fullPath);
    const url = `https://gitlab.com/api/v4/projects/${urlEncodedPath}/${endpoint}`;
    const headers = {};
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
async function fetchFromGitHub(owner, repo, endpoint, token) {
    // Support global GitHub API endpoints (e.g. search/*) that are not repo-relative
    const url = endpoint.startsWith('search/')
        ? `https://api.github.com/${endpoint}`
        : `https://api.github.com/repos/${owner}/${repo}/${endpoint}`;
    const headers = {
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
async function fetchPaginatedFromGitLab(fullPath, endpoint, token) {
    const urlEncodedPath = encodeURIComponent(fullPath);
    const url = `https://gitlab.com/api/v4/projects/${urlEncodedPath}/${endpoint}`;
    const headers = {};
    if (token) {
        headers['PRIVATE-TOKEN'] = token;
    }
    const response = await fetch(url, { headers });
    if (!response.ok) {
        throw new Error(`GitLab API error: ${response.statusText} (${response.status})`);
    }
    const data = await response.json();
    const total = response.headers.get('x-total');
    return {
        data,
        total: total ? parseInt(total, 10) : (Array.isArray(data) ? data.length : 0)
    };
}
async function fetchPaginatedFromGitHub(owner, repo, endpoint, token) {
    let url = `https://api.github.com/repos/${owner}/${repo}/${endpoint}`;
    if (endpoint.startsWith('search/')) {
        url = `https://api.github.com/${endpoint}`;
    }
    const headers = {
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
    const data = await response.json();
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
async function getDevOpsInfo(connName) {
    const profile = await ConnectionStore_1.connectionStore.getConnection(connName);
    if (!profile)
        return null;
    let gitUrl = profile.uri;
    if (profile.options?.type === 'local') {
        try {
            const repoPath = resolveRepoPath(profile);
            const git = (0, simple_git_1.simpleGit)(repoPath);
            const remotes = await git.getRemotes(true);
            const origin = remotes.find(r => r.name === 'origin');
            if (origin) {
                gitUrl = origin.refs.push || origin.refs.fetch;
            }
        }
        catch (e) {
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
function sanitizeMermaid(graph) {
    if (!graph)
        return '';
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
async function generateArchitectureDiagrams(conn, repoPath, classes) {
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
        const prompt = (0, prompts_1.getArchitectureDiagramsPrompt)(conn, classSummaries);
        const parsed = await GeminiService_1.geminiService.generateJSON(prompt);
        if (parsed.architecture) {
            parsed.architecture = sanitizeMermaid(parsed.architecture);
        }
        if (parsed.classInteraction) {
            parsed.classInteraction = sanitizeMermaid(parsed.classInteraction);
        }
        return parsed;
    }
    catch (e) {
        console.error("Failed to parse or sanitize generated architecture diagrams:", e);
        return {
            architecture: `graph TD\n  subgraph Project [${conn}]\n    A[Src Files] --> B[AST Parser]\n  end\n  style Project fill:#1e1e3f,stroke:#6f7ad3`,
            classInteraction: `graph TD\n  ClassA[Error Parsing Diagrams] --> ClassB[Retry Regeneration]`
        };
    }
}
// Resolve Git authenticated URL for private repositories
function getAuthenticatedGitUrl(uri, options) {
    if (!uri || options?.type === 'local')
        return uri;
    let cloneUri = uri;
    const username = options?.gitUsername;
    const token = options?.gitToken;
    if (username && token) {
        if (cloneUri.startsWith('https://')) {
            const authPart = `${encodeURIComponent(username)}:${encodeURIComponent(token)}`;
            cloneUri = cloneUri.replace('https://', `https://${authPart}@`);
        }
        else if (cloneUri.startsWith('http://')) {
            const authPart = `${encodeURIComponent(username)}:${encodeURIComponent(token)}`;
            cloneUri = cloneUri.replace('http://', `http://${authPart}@`);
        }
    }
    else if (token) {
        let defaultUser = 'git';
        if (cloneUri.includes('gitlab.com')) {
            defaultUser = 'oauth2';
        }
        if (cloneUri.startsWith('https://')) {
            cloneUri = cloneUri.replace('https://', `https://${defaultUser}:${encodeURIComponent(token)}@`);
        }
        else if (cloneUri.startsWith('http://')) {
            cloneUri = cloneUri.replace('http://', `http://${defaultUser}:${encodeURIComponent(token)}@`);
        }
    }
    return cloneUri;
}
// Clone remote repo for connection creation/validation
async function cloneRemoteRepo(uri, options, forceClone = false) {
    if (options?.type === 'local') {
        const targetPath = path.resolve(uri);
        if (!fs.existsSync(targetPath)) {
            throw new Error(`Local directory does not exist: ${targetPath}`);
        }
        return targetPath;
    }
    // For remote repository
    const repoName = uri.split('/').pop()?.replace('.git', '') || 'temp-repo';
    const targetPath = path.join(exports.tempDir, repoName);
    if (forceClone && fs.existsSync(targetPath)) {
        console.log(`Force clone requested. Deleting existing folder at ${targetPath}...`);
        try {
            fs.rmSync(targetPath, { recursive: true, force: true });
        }
        catch (e) {
            console.warn(`Failed to delete existing folder at ${targetPath}:`, e);
        }
    }
    if (!fs.existsSync(targetPath)) {
        console.log(`Auto-cloning remote repo ${uri} to ${targetPath} during validation...`);
        const cloneOptions = ['--depth', '100'];
        if (options?.branch) {
            cloneOptions.push('-b', options.branch);
        }
        try {
            const authUri = getAuthenticatedGitUrl(uri, options);
            await (0, simple_git_1.simpleGit)().clone(authUri, targetPath, cloneOptions);
        }
        catch (e) {
            const msg = e.message || String(e);
            console.warn(`Clone warning/error during creation:`, msg);
            // Retry with SSL verification disabled if this is an SSL cert error (e.g. Cloud Run)
            const isSslError = msg.includes('certificate') || msg.includes('SSL') || msg.includes('CAfile');
            if (isSslError) {
                console.warn('SSL certificate error detected. Retrying clone with http.sslVerify=false...');
                try {
                    const authUri = getAuthenticatedGitUrl(uri, options);
                    await (0, simple_git_1.simpleGit)({ config: ['http.sslVerify=false'] }).clone(authUri, targetPath, cloneOptions);
                    // If retry succeeded, return early
                    return targetPath;
                }
                catch (retryErr) {
                    console.warn('SSL-bypass clone also failed:', retryErr.message || retryErr);
                    throw new Error(`Failed to clone remote repository. Please check the URL and your connection. Detail: ${msg}`);
                }
            }
            // Check if target directory exists and is populated with actual source files
            if (fs.existsSync(targetPath) && fs.readdirSync(targetPath).filter(f => f !== '.git' && f !== '.baseflow_diagrams.json').length > 0) {
                console.log(`Proceeding anyway since target path has files.`);
            }
            else {
                // Clean up partially cloned/empty directory
                if (fs.existsSync(targetPath)) {
                    fs.rmSync(targetPath, { recursive: true, force: true });
                }
                throw new Error(`Failed to clone remote repository. Please check the URL and your connection. Detail: ${e.message || e}`);
            }
        }
    }
    return targetPath;
}
