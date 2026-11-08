/**
 * GitHub / GitLab REST helpers and DevOps metadata of a connection.
 */
import { simpleGit } from 'simple-git';
import { assertValidRepoUrl } from '../../utils/security';
import { connectionStore } from '../ConnectionStore';
import { resolveRepoPath } from './workspace';

// Git repository URL parser
export function parseGitUrl(url: string) {
  if (!url) return null;
  try {
    return assertValidRepoUrl(url);
  } catch {
    return null;
  }
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
