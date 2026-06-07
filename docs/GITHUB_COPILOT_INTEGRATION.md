# 🐙 GitHub Integration Guide for BaseFlow

BaseFlow integrates with **GitHub** at two levels:

1. **REST API** — Fetches Issues, Pull Requests, and Actions Workflow Runs directly from the GitHub API for display in the DevOps dashboard.
2. **MCP Toolset** — Gives the AI Architect Agent real-time access to your repository via one of two supported MCP servers:
   - **Official GitHub MCP** (`@modelcontextprotocol/server-github`) — default, runs locally via `npx`
   - **Remote GitHub MCP** — for custom or self-hosted MCP endpoints (configured via Git MCP Server Endpoint field)

---

## 🚀 Quick Start (3 Steps)

### Step 1 — Generate a GitHub Personal Access Token

1. Log into [github.com](https://github.com)
2. Go to **Settings → Developer Settings → Personal access tokens → Tokens (classic)**
3. Click **Generate new token (classic)**
4. Give it a name (e.g. `baseflow-token`)
5. Select these scopes:
   - ✅ `repo` — Full access to repositories (issues, PRs, code)
   - ✅ `read:org` — (Optional) Access to org-level resources
   - ✅ `workflow` — (Optional) Read workflow run logs
6. Click **Generate token** and copy it — starts with `ghp_...`

> [!IMPORTANT]
> At minimum the **`repo`** scope is required. Without it, BaseFlow cannot read private repository issues, PRs, or workflow runs.

---

### Step 2 — Add a Connection in BaseFlow

1. Open BaseFlow → **Connections** → **+ New Connection**
2. In the **Path / Clone URL** field, paste your GitHub repository URL:
   ```
   https://github.com/your-username/your-repo.git
   ```
   > **Tip:** If you paste a URL with embedded credentials like
   > `https://your-username:ghp_abc123@github.com/your-username/your-repo.git`,
   > BaseFlow will **automatically** extract the token and username and strip them from the stored URL for security.
3. Fill in **Connection Name**, set type to **Git Remote URL**
4. Click **Save**

---

### Step 3 — Configure DevOps Credentials

1. Click your GitHub connection → open the **DevOps** tab
2. Enter your **Personal Access Token** (`ghp_...`)
3. (Optional) Set the **Git MCP Server Endpoint** for a custom remote MCP:
   - Leave **empty** → uses the official `@modelcontextprotocol/server-github` package locally
   - Set to a remote URL → connects via `mcp-remote` with `Authorization: token <token>` header
4. Click **Save Credentials**

---

## ⚙️ How MCP Mode is Selected

BaseFlow automatically selects the right MCP server based on the endpoint configured:

| MCP Server Endpoint | Mode Used | Package |
|---|---|---|
| Empty (default) | **Official GitHub MCP** via stdio | `@modelcontextprotocol/server-github` |
| `https://api.githubcopilot.com/mcp/` | **Remote MCP** via `mcp-remote` | GitHub Copilot MCP |
| Any other `https://...` URL | **Remote MCP** via `mcp-remote` | Custom endpoint |

---

## 🤖 AI Agent Capabilities with GitHub MCP

Once configured, the AI Architect Agent gains these MCP-powered tools:

### Official GitHub MCP Tools (`@modelcontextprotocol/server-github`)
| Tool | Description |
|---|---|
| `github_list_issues` | List open issues in the repository |
| `github_get_issue` | Read full issue details |
| `github_create_issue` | Create a new issue |
| `github_add_issue_comment` | Post a comment on an issue |
| `github_list_pull_requests` | List open pull requests |
| `github_get_pull_request` | Read PR details and diffs |
| `github_create_pull_request` | Create a new pull request |
| `github_create_pull_request_review` | Submit an AI code review |
| `github_get_file_contents` | Read any file in the repository |
| `github_push_files` | Push file changes to a branch |
| `github_search_code` | Search code across the repository |
| `github_list_commits` | Browse commit history |
| `github_get_workflow_run` | Read Actions workflow run details |

### Built-in Agent Tools (always available)
| Tool | Description |
|---|---|
| `resolve_issue_with_ai` | Generate a `skills/fix_issue_N.md` fix playbook |
| `analyze_pipeline_failure` | Root-cause analysis for failed workflow runs |
| `generate_devops_health_score` | DevOps health narrative with charts |
| `submit_mr_review` | Post inline code review comments on a PR |
| `create_merge_request_from_workspace` | Auto-commit workspace changes and open PR |
| `publish_skill_to_catalog` | Format skill for GitHub Copilot Extensions |
| `audit_security_vulnerabilities` | Security scan with mindmap highlights |
| `write_workspace_file` | Write fix files to the local workspace |

---

## 📊 DevOps Dashboard Features

The **DevOps** tab in BaseFlow shows live data fetched from the GitHub REST API:

### Open Issues
- Paginated list with **Author**, **Labels**, and **Date**
- Uses the **GitHub Search API** (`search/issues?type:issue`) for accurate total counts
- Click any issue title to open a detail dialog
- **AI Analysis** button → triggers `resolve_issue_with_ai` agent tool

### Pull Requests
- Paginated list with **Source/Target branch** info
- Uses the **GitHub Search API** (`search/issues?type:pr`) for accurate total counts
- **AI Review** button → fetches diff, runs AI code review, posts inline comments to GitHub

### Workflow Runs (Actions)
- Live run status with colour-coded badges (`success`, `failed`, `running`)
- Includes run number, branch (`ref`), timestamp, and direct link to GitHub
- **Analyze Failure** button → triggers `analyze_pipeline_failure` agent tool
- **View Log** link → opens workflow run directly on GitHub

### DevOps Health Score
- Real-time score (0–100) computed from: open issues (30%) + open PRs (30%) + workflow success rate (40%)
- Uses the Search API (`total_count`) for accurate counts — no more cap at 50
- Click **Generate AI DevOps Report** → produces a full narrative with markdown table and recommendations

---

## 🚀 GitHub Copilot Extensions

After the AI generates a fix playbook, you can publish it to GitHub Copilot:

1. The AI generates `skills/fix_issue_42.md` in your workspace
2. Ask the agent:
   > *"Publish the skill file `skills/fix_issue_42.md` to GitHub Copilot"*
3. The agent formats the skill as a **Custom Copilot Extension system prompt** and provides a link:
   `https://github.com/settings/copilot`
4. In GitHub Settings → Copilot → **Copilot Extensions** → New Extension → paste the generated system prompt

---

## 🏢 GitHub Enterprise & Self-Hosted

BaseFlow supports GitHub Enterprise (GHES) through the custom MCP endpoint field:

1. In the DevOps tab → **Git MCP Server Endpoint**, set:
   ```
   https://your-ghes-hostname/api/v4/mcp
   ```
2. The agent will connect via `mcp-remote` with your token

> [!NOTE]
> For GHES, the token must be generated on your enterprise instance (not github.com).

---

## 📚 GitHub Resources

| Resource | URL |
|---|---|
| Personal Access Tokens | https://github.com/settings/tokens |
| GitHub MCP Server (npm) | https://www.npmjs.com/package/@modelcontextprotocol/server-github |
| GitHub Copilot Extensions | https://docs.github.com/en/copilot/building-copilot-extensions |
| GitHub Actions Docs | https://docs.github.com/en/actions |
| GitHub REST API | https://docs.github.com/en/rest |
| GitHub Search API | https://docs.github.com/en/rest/search/search |

---

## 🐛 Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| "GitHub token not configured" | Token not saved | Open DevOps tab → Save Credentials |
| Issues/PRs show 0 or wrong total | Rate limit or scope issue | Ensure `repo` scope on token; check console for 403 errors |
| MCP tools not available in agent | Token missing or provider mismatch | Connection URL must include `github.com` |
| Workflow runs show empty list | No `workflow` scope | Add `workflow` scope to your PAT |
| `@modelcontextprotocol/server-github` fails | `npx` not found or offline | Ensure Node.js v20+ and internet access on the server |

---

## 🔄 Other Supported Platforms

BaseFlow is provider-agnostic for codebase analysis. While DevOps features (Issues, PRs, Pipelines, MCP) currently support **GitHub** and **GitLab**, the following platforms work for repository scanning and AI analysis:

| Platform | Connection Type | Codebase Scan | DevOps Dashboard | MCP Agent |
|---|---|---|---|---|
| **GitHub** | Remote URL | ✅ | ✅ Issues / PRs / Actions | ✅ |
| **GitLab** | Remote URL | ✅ | ✅ Issues / MRs / Pipelines | ✅ |
| **Bitbucket** | Remote URL (HTTPS clone URL) | ✅ | ❌ *(planned)* | ❌ *(planned)* |
| **Azure DevOps** | Remote URL (HTTPS clone URL) | ✅ | ❌ *(planned)* | ❌ *(planned)* |
| **Gitea / Forgejo** | Remote URL | ✅ | ❌ *(planned)* | ❌ *(planned)* |
| **Local Folder** | Local path | ✅ | ❌ | ❌ |

> [!NOTE]
> For platforms without native DevOps integration, BaseFlow still provides full **codebase mindmap visualization**, **AI architecture analysis**, **class inspector**, **document Q&A**, and the **AI Architect Agent** with all built-in tools.
