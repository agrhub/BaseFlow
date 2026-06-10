import express from 'express';
import { connectionStore } from '../services/ConnectionStore';
import { 
  parseGitUrl, 
  fetchFromGitLab, 
  fetchFromGitHub, 
  getDevOpsInfo,
  fetchPaginatedFromGitLab,
  fetchPaginatedFromGitHub,
  resolveRepoPath,
  resolveCachePath
} from './helpers';
import * as fs from 'fs';
import * as path from 'path';
import { modifiedFiles } from '../agent/tools/types';

const router = express.Router();

const getDevOpsToken = (devops: any) => {
  return devops?.profile?.options?.gitToken;
};

// ================= DEVOPS UNIFIED API (GITHUB + GITLAB) =================

// 6. DevOps Config Info
router.get('/:conn/devops/info', async (req, res) => {
  const { conn } = req.params;
  try {
    const devops = await getDevOpsInfo(conn);
    if (!devops) return res.status(404).json({ error: 'Profile not found' });

    res.json({
      provider: devops.provider,
      owner: devops.owner,
      repo: devops.repo,
      fullPath: devops.fullPath,
      hasToken: devops.hasToken,
      options: {
        gitToken: devops.profile.options?.gitToken ? '••••••••' : '',
        gitMcpServer: devops.profile.options?.gitMcpServer || '',
        branch: devops.profile.options?.branch || 'main'
      }
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// 7. Save DevOps tokens
router.post('/:conn/devops/save-token', async (req, res) => {
  const { conn } = req.params;
  const { gitToken, gitMcpServer } = req.body;
  try {
    const profile = await connectionStore.getConnection(conn);
    if (!profile) return res.status(404).json({ error: 'Profile not found' });
    
    let finalToken = gitToken;
    if (gitToken === '••••••••' && profile.options?.gitToken) {
      finalToken = profile.options.gitToken;
    }

    const updatedOptions = {
      ...(profile.options || {}),
      gitToken: finalToken || '',
      gitMcpServer: gitMcpServer || ''
    };
    
    await connectionStore.saveConnection(profile.name, profile.uri, updatedOptions);
    res.json({ msg: 'Credentials saved successfully' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// 8. Get Unified Issues (Normalized)
router.get('/:conn/devops/issues', async (req, res) => {
  const { conn } = req.params;
  const page = parseInt(req.query.page as string || '1', 10);
  const perPage = parseInt(req.query.per_page as string || '20', 10);
  try {
    const devops = await getDevOpsInfo(conn);
    if (!devops) return res.status(404).json({ error: 'Profile not found' });

    if (devops.provider === 'gitlab') {
      const token = getDevOpsToken(devops);
      if (!token) return res.status(400).json({ error: 'GitLab token not configured' });
      
      const { data: rawIssues, total } = await fetchPaginatedFromGitLab(
        devops.fullPath, 
        `issues?state=opened&page=${page}&per_page=${perPage}`, 
        token
      );
      
      const normalized = rawIssues.map((issue: any) => ({
        id: issue.id,
        number: `#${issue.iid}`,
        iid: issue.iid,
        title: issue.title,
        description: issue.description || '',
        author: issue.author?.name || issue.author?.username || 'Unknown',
        created_at: issue.created_at,
        labels: Array.isArray(issue.labels) ? issue.labels : []
      }));
      res.json({ data: normalized, total });
    } else if (devops.provider === 'github') {
      const token = getDevOpsToken(devops);
      if (!token) return res.status(400).json({ error: 'GitHub token not configured' });
      
      // Use Search API to get the correct total count and support pagination
      const { data: rawIssues, total } = await fetchPaginatedFromGitHub(
        devops.owner,
        devops.repo,
        `search/issues?q=repo:${devops.owner}/${devops.repo}+type:issue+state:open&page=${page}&per_page=${perPage}`,
        token
      );
      
      const normalized = rawIssues.map((issue: any) => ({
        id: issue.id,
        number: `#${issue.number}`,
        iid: issue.number,
        title: issue.title,
        description: issue.body || '',
        author: issue.user?.login || 'Unknown',
        created_at: issue.created_at,
        labels: Array.isArray(issue.labels) ? issue.labels.map((l: any) => typeof l === 'string' ? l : l.name) : []
      }));
      res.json({ data: normalized, total });
    } else {
      res.json({ data: [], total: 0 });
    }
  } catch (error: any) {
    console.error('DevOps Issues error:', error);
    res.status(500).json({ error: error.message });
  }
});

// 9. Get Unified Merge/Pull Requests (Normalized)
router.get('/:conn/devops/merge-requests', async (req, res) => {
  const { conn } = req.params;
  const page = parseInt(req.query.page as string || '1', 10);
  const perPage = parseInt(req.query.per_page as string || '20', 10);
  try {
    const devops = await getDevOpsInfo(conn);
    if (!devops) return res.status(404).json({ error: 'Profile not found' });

    if (devops.provider === 'gitlab') {
      const token = getDevOpsToken(devops);
      if (!token) return res.status(400).json({ error: 'GitLab token not configured' });
      
      const { data: rawMRs, total } = await fetchPaginatedFromGitLab(
        devops.fullPath, 
        `merge_requests?state=opened&page=${page}&per_page=${perPage}`, 
        token
      );
      
      const normalized = rawMRs.map((mr: any) => ({
        id: mr.id,
        number: `!${mr.iid}`,
        iid: mr.iid,
        title: mr.title,
        source_branch: mr.source_branch,
        target_branch: mr.target_branch,
        author: mr.author?.name || mr.author?.username || 'Unknown',
        updated_at: mr.updated_at
      }));
      res.json({ data: normalized, total });
    } else if (devops.provider === 'github') {
      const token = getDevOpsToken(devops);
      if (!token) return res.status(400).json({ error: 'GitHub token not configured' });
      
      // Use Search API to get the correct total count and support pagination
      const { data: rawPRs, total } = await fetchPaginatedFromGitHub(
        devops.owner,
        devops.repo,
        `search/issues?q=repo:${devops.owner}/${devops.repo}+type:pr+state:open&page=${page}&per_page=${perPage}`,
        token
      );
      
      const normalized = rawPRs.map((pr: any) => ({
        id: pr.id,
        number: `#${pr.number}`,
        iid: pr.number,
        title: pr.title,
        source_branch: pr.head?.ref || '',
        target_branch: pr.base?.ref || '',
        author: pr.user?.login || 'Unknown',
        updated_at: pr.updated_at
      }));
      res.json({ data: normalized, total });
    } else {
      res.json({ data: [], total: 0 });
    }
  } catch (error: any) {
    console.error('DevOps PRs error:', error);
    res.status(500).json({ error: error.message });
  }
});

// 10. Get Unified Pipelines/Workflow Runs (Normalized)
router.get('/:conn/devops/pipelines', async (req, res) => {
  const { conn } = req.params;
  const page = parseInt(req.query.page as string || '1', 10);
  const perPage = parseInt(req.query.per_page as string || '15', 10);
  try {
    const devops = await getDevOpsInfo(conn);
    if (!devops) return res.status(404).json({ error: 'Profile not found' });

    if (devops.provider === 'gitlab') {
      const token = getDevOpsToken(devops);
      if (!token) return res.status(400).json({ error: 'GitLab token not configured' });
      
      const { data: rawPipes, total } = await fetchPaginatedFromGitLab(
        devops.fullPath, 
        `pipelines?page=${page}&per_page=${perPage}`, 
        token
      );
      
      const normalized = rawPipes.map((pipe: any) => ({
        id: pipe.id,
        number: `#${pipe.id}`,
        status: pipe.status === 'success' ? 'success' : (pipe.status === 'failed' ? 'failed' : (['running', 'pending'].includes(pipe.status) ? 'running' : 'info')),
        ref: pipe.ref,
        url: pipe.web_url || '',
        created_at: pipe.created_at || pipe.updated_at,
        updated_at: pipe.updated_at
      }));
      res.json({ data: normalized, total });
    } else if (devops.provider === 'github') {
      const token = getDevOpsToken(devops);
      if (!token) return res.status(400).json({ error: 'GitHub token not configured' });
      
      const { data: rawRuns, total } = await fetchPaginatedFromGitHub(
        devops.owner,
        devops.repo,
        `actions/runs?page=${page}&per_page=${perPage}`,
        token
      );
      const runsList = Array.isArray(rawRuns) ? rawRuns : (rawRuns.workflow_runs || []);
      const runsTotal = (typeof rawRuns === 'object' && !Array.isArray(rawRuns) && rawRuns.total_count !== undefined)
        ? rawRuns.total_count
        : total;
      
      const normalized = runsList.map((run: any) => ({
        id: run.run_number,
        number: `#${run.run_number}`,
        status: run.conclusion === 'success' ? 'success' : (run.conclusion === 'failure' ? 'failed' : (['in_progress', 'queued'].includes(run.status) ? 'running' : 'info')),
        ref: run.head_branch,
        url: run.html_url || '',
        created_at: run.run_started_at || run.created_at || run.updated_at,
        updated_at: run.updated_at || run.run_started_at
      }));
      res.json({ data: normalized, total: runsTotal });
    } else {
      res.json({ data: [], total: 0 });
    }
  } catch (error: any) {
    console.error('DevOps pipelines error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ================= ADVANCED AI DEVOPS ENDPOINTS =================

// 11. DevOps Health Score – aggregate metrics across issues, MRs, pipelines
router.get('/:conn/devops/health-score', async (req, res) => {
  const { conn } = req.params;
  try {
    const devops = await getDevOpsInfo(conn);
    if (!devops) return res.status(404).json({ error: 'Profile not found' });

    let openIssues = 0;
    let openMRs = 0;
    let recentPipelines: { status: string; ref: string }[] = [];

    if (devops.provider === 'gitlab' && getDevOpsToken(devops)) {
      const token = getDevOpsToken(devops);
      try {
        const issues = (await fetchFromGitLab(devops.fullPath, 'issues?state=opened&per_page=50', token)) as any[];
        openIssues = Array.isArray(issues) ? issues.length : 0;
      } catch (_) {}
      try {
        const mrs = (await fetchFromGitLab(devops.fullPath, 'merge_requests?state=opened&per_page=20', token)) as any[];
        openMRs = Array.isArray(mrs) ? mrs.length : 0;
      } catch (_) {}
      try {
        const pipes = (await fetchFromGitLab(devops.fullPath, 'pipelines?per_page=15', token)) as any[];
        recentPipelines = Array.isArray(pipes) ? pipes.map((p: any) => ({ status: p.status, ref: p.ref || 'unknown' })) : [];
      } catch (_) {}
    } else if (devops.provider === 'github' && getDevOpsToken(devops)) {
      const token = getDevOpsToken(devops);
      try {
        // Use Search API for accurate total count of issues (excludes PRs)
        const issueSearch = (await fetchFromGitHub(devops.owner, devops.repo, `search/issues?q=repo:${devops.owner}/${devops.repo}+type:issue+state:open&per_page=1`, token)) as any;
        openIssues = issueSearch?.total_count ?? 0;
      } catch (_) {}
      try {
        // Use Search API for accurate total count of PRs
        const prSearch = (await fetchFromGitHub(devops.owner, devops.repo, `search/issues?q=repo:${devops.owner}/${devops.repo}+type:pr+state:open&per_page=1`, token)) as any;
        openMRs = prSearch?.total_count ?? 0;
      } catch (_) {}
      try {
        const runs = (await fetchFromGitHub(devops.owner, devops.repo, 'actions/runs?per_page=15', token)) as any;
        const runsList = runs?.workflow_runs || [];
        recentPipelines = runsList.map((r: any) => ({
          status: r.conclusion === 'success' ? 'success' : r.conclusion === 'failure' ? 'failed' : 'running',
          ref: r.head_branch || 'unknown'
        }));
      } catch (_) {}
    }

    const totalPipelines = recentPipelines.length;
    const successfulPipelines = recentPipelines.filter(p => p.status === 'success').length;
    const failedPipelines = recentPipelines.filter(p => p.status === 'failed').length;
    const pipelineHealthRate = totalPipelines > 0 ? Math.round((successfulPipelines / totalPipelines) * 100) : 100;

    const issueScore = Math.max(0, 100 - openIssues * 3);
    const mrScore = Math.max(0, 100 - openMRs * 5);
    const pipelineScore = pipelineHealthRate;
    const overallScore = Math.round(issueScore * 0.3 + mrScore * 0.3 + pipelineScore * 0.4);

    res.json({
      score: overallScore,
      breakdown: {
        issues: { count: openIssues, score: Math.round(issueScore) },
        mergeRequests: { count: openMRs, score: Math.round(mrScore) },
        pipelines: {
          total: totalPipelines,
          success: successfulPipelines,
          failed: failedPipelines,
          healthRate: pipelineHealthRate,
          score: Math.round(pipelineScore)
        }
      },
      recentPipelines,
      provider: devops.provider
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// 12. AI Fix Issue – trigger agent to generate fix playbook for an issue
router.post('/:conn/devops/ai-fix-issue', async (req, res) => {
  const { conn } = req.params;
  const { issueTitle, issueDescription, issueNumber, provider } = req.body;

  if (!issueTitle || !issueNumber || !provider) {
    return res.status(400).json({ error: 'issueTitle, issueNumber, and provider are required' });
  }

  try {
    const profile = await connectionStore.getConnection(conn);
    if (!profile) return res.status(404).json({ error: 'Profile not found' });

    // Return instructions for the frontend to trigger via agent chat
    res.json({
      success: true,
      agentPrompt: `Analyze and generate an AI fix playbook for ${provider === 'gitlab' ? 'GitLab' : 'GitHub'} Issue #${issueNumber}: "${issueTitle}". Issue description: ${issueDescription || 'No description'}. Use the resolve_issue_with_ai tool.`,
      issueNumber,
      issueTitle,
      provider
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// 13. Analyze Pipeline Failure – trigger CI/CD Watchdog analysis
router.post('/:conn/devops/analyze-pipeline', async (req, res) => {
  const { conn } = req.params;
  const { pipelineId, ref, provider } = req.body;

  if (!pipelineId || !provider) {
    return res.status(400).json({ error: 'pipelineId and provider are required' });
  }

  try {
    const devops = await getDevOpsInfo(conn);
    if (!devops) return res.status(404).json({ error: 'Profile not found' });

    // Try to fetch job log if possible via direct API
    let jobLog = '';
    if (provider === 'gitlab' && getDevOpsToken(devops)) {
      try {
        const token = getDevOpsToken(devops);
        const jobs = (await fetchFromGitLab(devops.fullPath, `pipelines/${pipelineId}/jobs?per_page=10`, token)) as any[];
        if (Array.isArray(jobs)) {
          const failedJob = jobs.find((j: any) => j.status === 'failed') || jobs[0];
          if (failedJob?.id) {
            const logContent = await fetchFromGitLab(devops.fullPath, `jobs/${failedJob.id}/trace`, token) as string;
            jobLog = typeof logContent === 'string' ? logContent : JSON.stringify(logContent);
          }
        }
      } catch (_) {
        // Log fetch may fail – proceed without it
      }
    }

    res.json({
      success: true,
      agentPrompt: `Analyze the failed CI/CD pipeline #${pipelineId} on branch "${ref}" for the ${provider === 'gitlab' ? 'GitLab' : 'GitHub'} repository. ${jobLog ? 'Here is the job log excerpt: ' + jobLog.slice(-2000) : 'No log available yet.'} Use the analyze_pipeline_failure tool.`,
      pipelineId,
      ref,
      provider,
      hasLog: !!jobLog
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// 14. Get PR/MR diff
router.get('/:conn/devops/mr-diff/:iid', async (req, res) => {
  const { conn, iid } = req.params;
  try {
    const devops = await getDevOpsInfo(conn);
    if (!devops) return res.status(404).json({ error: 'Profile not found' });
    const token = getDevOpsToken(devops);
    if (!token) return res.status(400).json({ error: 'Token not configured' });

    if (devops.provider === 'github') {
      const url = `https://api.github.com/repos/${devops.owner}/${devops.repo}/pulls/${iid}`;
      const headers: Record<string, string> = {
        'Accept': 'application/vnd.github.v3.diff',
        'User-Agent': 'BaseFlow-App',
        'Authorization': `token ${token}`
      };
      const response = await fetch(url, { headers });
      if (!response.ok) {
        throw new Error(`GitHub diff fetch error: ${response.statusText} (${response.status})`);
      }
      const diff = await response.text();
      res.json({ diff });
    } else if (devops.provider === 'gitlab') {
      const urlEncodedPath = encodeURIComponent(devops.fullPath);
      const url = `https://gitlab.com/api/v4/projects/${urlEncodedPath}/merge_requests/${iid}/changes`;
      const headers: Record<string, string> = {
        'PRIVATE-TOKEN': token
      };
      const response = await fetch(url, { headers });
      if (!response.ok) {
        throw new Error(`GitLab diff fetch error: ${response.statusText} (${response.status})`);
      }
      const data = await response.json() as any;
      let diff = '';
      if (data && Array.isArray(data.changes)) {
        diff = data.changes.map((change: any) => {
          return `diff --git a/${change.old_path} b/${change.new_path}\n${change.diff}`;
        }).join('\n');
      }
      res.json({ diff });
    } else {
      res.status(400).json({ error: 'Unsupported provider' });
    }
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// GitHub commit helper using Git database REST APIs
async function commitToGitHub(
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

  // 1. Get base branch SHA
  const refRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/git/ref/heads/${baseBranch}`, { headers });
  if (!refRes.ok) {
    throw new Error(`Failed to get base branch ref: ${refRes.statusText} (${refRes.status})`);
  }
  const refData = await refRes.json() as any;
  const baseCommitSha = refData.object.sha;

  // 2. Create blobs
  const treeItems = [];
  for (const file of files) {
    const blobRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/git/blobs`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        content: file.content,
        encoding: 'utf-8'
      })
    });
    if (!blobRes.ok) {
      throw new Error(`Failed to create blob for ${file.path}: ${blobRes.statusText} (${blobRes.status})`);
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

// 15. Auto create Merge/Pull Request using Git APIs
router.post('/:conn/devops/auto-create-mr', async (req, res) => {
  const { conn } = req.params;
  const { issueIid, branchName, mrTitle, mrDescription } = req.body;
  try {
    const devops = await getDevOpsInfo(conn);
    if (!devops) return res.status(404).json({ error: 'Profile not found' });
    const token = getDevOpsToken(devops);
    if (!token) return res.status(400).json({ error: 'Token not configured' });

    const repoPath = resolveRepoPath(devops.profile);
    
    // Find all modified files content
    const filesToCommit: { path: string; content: string }[] = [];
    
    // Check if we tracked modified files
    if (modifiedFiles.size > 0) {
      for (const filePath of modifiedFiles) {
        const fullPath = path.join(repoPath, filePath);
        if (fs.existsSync(fullPath)) {
          const content = fs.readFileSync(fullPath, 'utf-8');
          filesToCommit.push({ path: filePath, content });
        }
      }
    }

    // Fallback: if no tracked modified files, look inside skills/ directory
    if (filesToCommit.length === 0) {
      const skillsDir = path.join(repoPath, 'skills');
      if (fs.existsSync(skillsDir)) {
        const files = fs.readdirSync(skillsDir);
        for (const file of files) {
          if (file.endsWith('.md')) {
            const filePath = `skills/${file}`;
            const fullPath = path.join(skillsDir, file);
            const content = fs.readFileSync(fullPath, 'utf-8');
            filesToCommit.push({ path: filePath, content });
          }
        }
      }
    }

    if (filesToCommit.length === 0) {
      return res.status(400).json({ error: 'No modified files or playbooks found in workspace to commit' });
    }

    const baseBranch = devops.profile.options?.branch || 'main';

    if (devops.provider === 'github') {
      // 1. Commit files and create branch using Git database API
      await commitToGitHub(devops.owner, devops.repo, token, branchName, baseBranch, mrTitle, filesToCommit);
      
      // 2. Create Pull Request
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
      modifiedFiles.clear(); // Clear tracked files after successful PR creation
      res.json({ success: true, mrUrl: prData.html_url });
      
    } else if (devops.provider === 'gitlab') {
      // 1. Prepare commit actions
      const actions = filesToCommit.map(file => {
        let fileExists = false;
        try {
          const cachePath = resolveCachePath(conn);
          if (fs.existsSync(cachePath)) {
            const cacheData = JSON.parse(fs.readFileSync(cachePath, 'utf-8'));
            fileExists = cacheData.classes.some((c: any) => c.filePath === file.path);
          }
        } catch (_) {}
        
        return {
          action: fileExists ? 'update' : 'create',
          file_path: file.path,
          content: file.content
        };
      });
      
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
          actions: actions
        })
      });
      
      if (!commitResponse.ok) {
        const errorData = await commitResponse.json() as any;
        throw new Error(`GitLab commit error: ${errorData.message || commitResponse.statusText}`);
      }
      
      // 2. Create Merge Request
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
        throw new Error(`GitLab MR creation error: ${errorData.message || mrResponse.statusText}`);
      }
      
      const mrData = await mrResponse.json() as any;
      modifiedFiles.clear(); // Clear tracked files after successful MR creation
      res.json({ success: true, mrUrl: mrData.web_url });
    } else {
      res.status(400).json({ error: 'Unsupported provider' });
    }
  } catch (error: any) {
    console.error('Auto create MR error:', error);
    res.status(500).json({ error: error.message });
  }
});

// 16. Submit PR/MR Code Review Comment
router.post('/:conn/devops/submit-mr-review', async (req, res) => {
  const { conn } = req.params;
  const { mrIid, summary, comments } = req.body;
  
  if (!mrIid || !summary) {
    return res.status(400).json({ error: 'mrIid and summary are required' });
  }
  
  try {
    const devops = await getDevOpsInfo(conn);
    if (!devops) return res.status(404).json({ error: 'Profile not found' });
    const token = getDevOpsToken(devops);
    if (!token) return res.status(400).json({ error: 'Token not configured' });

    // Consolidate review summary and file comments into one clean markdown body
    const commentLines = [
      `### 🤖 AI Code Review Summary`,
      summary,
      ''
    ];
    
    if (Array.isArray(comments) && comments.length > 0) {
      commentLines.push(`#### 📄 Inline File Comments:`);
      comments.forEach(c => {
        commentLines.push(`- **${c.filePath}**: ${c.comment}`);
      });
    }
    
    const consolidatedBody = commentLines.join('\n');

    if (devops.provider === 'github') {
      // Post comment on GitHub issue/PR
      const url = `https://api.github.com/repos/${devops.owner}/${devops.repo}/issues/${mrIid}/comments`;
      const headers = {
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'BaseFlow-App',
        'Authorization': `token ${token}`,
        'Content-Type': 'application/json'
      };
      
      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify({ body: consolidatedBody })
      });
      
      if (!response.ok) {
        throw new Error(`GitHub comment post error: ${response.statusText} (${response.status})`);
      }
      
      res.json({ success: true });
    } else if (devops.provider === 'gitlab') {
      // Post comment on GitLab MR
      const urlEncodedPath = encodeURIComponent(devops.fullPath);
      const url = `https://gitlab.com/api/v4/projects/${urlEncodedPath}/merge_requests/${mrIid}/notes`;
      const headers = {
        'PRIVATE-TOKEN': token,
        'Content-Type': 'application/json'
      };
      
      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify({ body: consolidatedBody })
      });
      
      if (!response.ok) {
        throw new Error(`GitLab note post error: ${response.statusText} (${response.status})`);
      }
      
      res.json({ success: true });
    } else {
      res.status(400).json({ error: 'Unsupported provider' });
    }
  } catch (error: any) {
    console.error('Submit review error:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;

