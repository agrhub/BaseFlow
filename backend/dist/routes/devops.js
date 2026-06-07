"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const ConnectionStore_1 = require("../services/ConnectionStore");
const helpers_1 = require("./helpers");
const router = express_1.default.Router();
const getDevOpsToken = (devops) => {
    return devops?.profile?.options?.gitToken;
};
// ================= DEVOPS UNIFIED API (GITHUB + GITLAB) =================
// 6. DevOps Config Info
router.get('/:conn/devops/info', async (req, res) => {
    const { conn } = req.params;
    try {
        const devops = await (0, helpers_1.getDevOpsInfo)(conn);
        if (!devops)
            return res.status(404).json({ error: 'Profile not found' });
        res.json({
            provider: devops.provider,
            owner: devops.owner,
            repo: devops.repo,
            fullPath: devops.fullPath,
            hasToken: devops.hasToken,
            options: {
                gitToken: devops.profile.options?.gitToken || '',
                gitMcpServer: devops.profile.options?.gitMcpServer || '',
                branch: devops.profile.options?.branch || 'main'
            }
        });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// 7. Save DevOps tokens
router.post('/:conn/devops/save-token', async (req, res) => {
    const { conn } = req.params;
    const { gitToken, gitMcpServer } = req.body;
    try {
        const profile = await ConnectionStore_1.connectionStore.getConnection(conn);
        if (!profile)
            return res.status(404).json({ error: 'Profile not found' });
        const updatedOptions = {
            ...(profile.options || {}),
            gitToken: gitToken || '',
            gitMcpServer: gitMcpServer || ''
        };
        await ConnectionStore_1.connectionStore.saveConnection(profile.name, profile.uri, updatedOptions);
        res.json({ msg: 'Credentials saved successfully' });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// 8. Get Unified Issues (Normalized)
router.get('/:conn/devops/issues', async (req, res) => {
    const { conn } = req.params;
    const page = parseInt(req.query.page || '1', 10);
    const perPage = parseInt(req.query.per_page || '20', 10);
    try {
        const devops = await (0, helpers_1.getDevOpsInfo)(conn);
        if (!devops)
            return res.status(404).json({ error: 'Profile not found' });
        if (devops.provider === 'gitlab') {
            const token = getDevOpsToken(devops);
            if (!token)
                return res.status(400).json({ error: 'GitLab token not configured' });
            const { data: rawIssues, total } = await (0, helpers_1.fetchPaginatedFromGitLab)(devops.fullPath, `issues?state=opened&page=${page}&per_page=${perPage}`, token);
            const normalized = rawIssues.map((issue) => ({
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
        }
        else if (devops.provider === 'github') {
            const token = getDevOpsToken(devops);
            if (!token)
                return res.status(400).json({ error: 'GitHub token not configured' });
            // Use Search API to get the correct total count and support pagination
            const { data: rawIssues, total } = await (0, helpers_1.fetchPaginatedFromGitHub)(devops.owner, devops.repo, `search/issues?q=repo:${devops.owner}/${devops.repo}+type:issue+state:open&page=${page}&per_page=${perPage}`, token);
            const normalized = rawIssues.map((issue) => ({
                id: issue.id,
                number: `#${issue.number}`,
                iid: issue.number,
                title: issue.title,
                description: issue.body || '',
                author: issue.user?.login || 'Unknown',
                created_at: issue.created_at,
                labels: Array.isArray(issue.labels) ? issue.labels.map((l) => typeof l === 'string' ? l : l.name) : []
            }));
            res.json({ data: normalized, total });
        }
        else {
            res.json({ data: [], total: 0 });
        }
    }
    catch (error) {
        console.error('DevOps Issues error:', error);
        res.status(500).json({ error: error.message });
    }
});
// 9. Get Unified Merge/Pull Requests (Normalized)
router.get('/:conn/devops/merge-requests', async (req, res) => {
    const { conn } = req.params;
    const page = parseInt(req.query.page || '1', 10);
    const perPage = parseInt(req.query.per_page || '20', 10);
    try {
        const devops = await (0, helpers_1.getDevOpsInfo)(conn);
        if (!devops)
            return res.status(404).json({ error: 'Profile not found' });
        if (devops.provider === 'gitlab') {
            const token = getDevOpsToken(devops);
            if (!token)
                return res.status(400).json({ error: 'GitLab token not configured' });
            const { data: rawMRs, total } = await (0, helpers_1.fetchPaginatedFromGitLab)(devops.fullPath, `merge_requests?state=opened&page=${page}&per_page=${perPage}`, token);
            const normalized = rawMRs.map((mr) => ({
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
        }
        else if (devops.provider === 'github') {
            const token = getDevOpsToken(devops);
            if (!token)
                return res.status(400).json({ error: 'GitHub token not configured' });
            // Use Search API to get the correct total count and support pagination
            const { data: rawPRs, total } = await (0, helpers_1.fetchPaginatedFromGitHub)(devops.owner, devops.repo, `search/issues?q=repo:${devops.owner}/${devops.repo}+type:pr+state:open&page=${page}&per_page=${perPage}`, token);
            const normalized = rawPRs.map((pr) => ({
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
        }
        else {
            res.json({ data: [], total: 0 });
        }
    }
    catch (error) {
        console.error('DevOps PRs error:', error);
        res.status(500).json({ error: error.message });
    }
});
// 10. Get Unified Pipelines/Workflow Runs (Normalized)
router.get('/:conn/devops/pipelines', async (req, res) => {
    const { conn } = req.params;
    const page = parseInt(req.query.page || '1', 10);
    const perPage = parseInt(req.query.per_page || '15', 10);
    try {
        const devops = await (0, helpers_1.getDevOpsInfo)(conn);
        if (!devops)
            return res.status(404).json({ error: 'Profile not found' });
        if (devops.provider === 'gitlab') {
            const token = getDevOpsToken(devops);
            if (!token)
                return res.status(400).json({ error: 'GitLab token not configured' });
            const { data: rawPipes, total } = await (0, helpers_1.fetchPaginatedFromGitLab)(devops.fullPath, `pipelines?page=${page}&per_page=${perPage}`, token);
            const normalized = rawPipes.map((pipe) => ({
                id: pipe.id,
                number: `#${pipe.id}`,
                status: pipe.status === 'success' ? 'success' : (pipe.status === 'failed' ? 'failed' : (['running', 'pending'].includes(pipe.status) ? 'running' : 'info')),
                ref: pipe.ref,
                url: pipe.web_url || '',
                created_at: pipe.created_at || pipe.updated_at,
                updated_at: pipe.updated_at
            }));
            res.json({ data: normalized, total });
        }
        else if (devops.provider === 'github') {
            const token = getDevOpsToken(devops);
            if (!token)
                return res.status(400).json({ error: 'GitHub token not configured' });
            const { data: rawRuns, total } = await (0, helpers_1.fetchPaginatedFromGitHub)(devops.owner, devops.repo, `actions/runs?page=${page}&per_page=${perPage}`, token);
            const runsList = Array.isArray(rawRuns) ? rawRuns : (rawRuns.workflow_runs || []);
            const runsTotal = (typeof rawRuns === 'object' && !Array.isArray(rawRuns) && rawRuns.total_count !== undefined)
                ? rawRuns.total_count
                : total;
            const normalized = runsList.map((run) => ({
                id: run.run_number,
                number: `#${run.run_number}`,
                status: run.conclusion === 'success' ? 'success' : (run.conclusion === 'failure' ? 'failed' : (['in_progress', 'queued'].includes(run.status) ? 'running' : 'info')),
                ref: run.head_branch,
                url: run.html_url || '',
                created_at: run.run_started_at || run.created_at || run.updated_at,
                updated_at: run.updated_at || run.run_started_at
            }));
            res.json({ data: normalized, total: runsTotal });
        }
        else {
            res.json({ data: [], total: 0 });
        }
    }
    catch (error) {
        console.error('DevOps pipelines error:', error);
        res.status(500).json({ error: error.message });
    }
});
// ================= ADVANCED AI DEVOPS ENDPOINTS =================
// 11. DevOps Health Score – aggregate metrics across issues, MRs, pipelines
router.get('/:conn/devops/health-score', async (req, res) => {
    const { conn } = req.params;
    try {
        const devops = await (0, helpers_1.getDevOpsInfo)(conn);
        if (!devops)
            return res.status(404).json({ error: 'Profile not found' });
        let openIssues = 0;
        let openMRs = 0;
        let recentPipelines = [];
        if (devops.provider === 'gitlab' && getDevOpsToken(devops)) {
            const token = getDevOpsToken(devops);
            try {
                const issues = (await (0, helpers_1.fetchFromGitLab)(devops.fullPath, 'issues?state=opened&per_page=50', token));
                openIssues = Array.isArray(issues) ? issues.length : 0;
            }
            catch (_) { }
            try {
                const mrs = (await (0, helpers_1.fetchFromGitLab)(devops.fullPath, 'merge_requests?state=opened&per_page=20', token));
                openMRs = Array.isArray(mrs) ? mrs.length : 0;
            }
            catch (_) { }
            try {
                const pipes = (await (0, helpers_1.fetchFromGitLab)(devops.fullPath, 'pipelines?per_page=15', token));
                recentPipelines = Array.isArray(pipes) ? pipes.map((p) => ({ status: p.status, ref: p.ref || 'unknown' })) : [];
            }
            catch (_) { }
        }
        else if (devops.provider === 'github' && getDevOpsToken(devops)) {
            const token = getDevOpsToken(devops);
            try {
                // Use Search API for accurate total count of issues (excludes PRs)
                const issueSearch = (await (0, helpers_1.fetchFromGitHub)(devops.owner, devops.repo, `search/issues?q=repo:${devops.owner}/${devops.repo}+type:issue+state:open&per_page=1`, token));
                openIssues = issueSearch?.total_count ?? 0;
            }
            catch (_) { }
            try {
                // Use Search API for accurate total count of PRs
                const prSearch = (await (0, helpers_1.fetchFromGitHub)(devops.owner, devops.repo, `search/issues?q=repo:${devops.owner}/${devops.repo}+type:pr+state:open&per_page=1`, token));
                openMRs = prSearch?.total_count ?? 0;
            }
            catch (_) { }
            try {
                const runs = (await (0, helpers_1.fetchFromGitHub)(devops.owner, devops.repo, 'actions/runs?per_page=15', token));
                const runsList = runs?.workflow_runs || [];
                recentPipelines = runsList.map((r) => ({
                    status: r.conclusion === 'success' ? 'success' : r.conclusion === 'failure' ? 'failed' : 'running',
                    ref: r.head_branch || 'unknown'
                }));
            }
            catch (_) { }
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
    }
    catch (error) {
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
        const profile = await ConnectionStore_1.connectionStore.getConnection(conn);
        if (!profile)
            return res.status(404).json({ error: 'Profile not found' });
        // Return instructions for the frontend to trigger via agent chat
        res.json({
            success: true,
            agentPrompt: `Analyze and generate an AI fix playbook for ${provider === 'gitlab' ? 'GitLab' : 'GitHub'} Issue #${issueNumber}: "${issueTitle}". Issue description: ${issueDescription || 'No description'}. Use the resolve_issue_with_ai tool.`,
            issueNumber,
            issueTitle,
            provider
        });
    }
    catch (error) {
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
        const devops = await (0, helpers_1.getDevOpsInfo)(conn);
        if (!devops)
            return res.status(404).json({ error: 'Profile not found' });
        // Try to fetch job log if possible via direct API
        let jobLog = '';
        if (provider === 'gitlab' && getDevOpsToken(devops)) {
            try {
                const token = getDevOpsToken(devops);
                const jobs = (await (0, helpers_1.fetchFromGitLab)(devops.fullPath, `pipelines/${pipelineId}/jobs?per_page=10`, token));
                if (Array.isArray(jobs)) {
                    const failedJob = jobs.find((j) => j.status === 'failed') || jobs[0];
                    if (failedJob?.id) {
                        const logContent = await (0, helpers_1.fetchFromGitLab)(devops.fullPath, `jobs/${failedJob.id}/trace`, token);
                        jobLog = typeof logContent === 'string' ? logContent : JSON.stringify(logContent);
                    }
                }
            }
            catch (_) {
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
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
exports.default = router;
