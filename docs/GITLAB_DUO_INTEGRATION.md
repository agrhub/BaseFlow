# 🦊 GitLab Integration Guide for BaseFlow

BaseFlow integrates with **GitLab** at two levels:

1. **REST API** — Fetches Issues, Merge Requests, and Pipelines directly from the GitLab API for display in the DevOps dashboard.
2. **MCP Toolset** — Gives the AI Architect Agent real-time, bidirectional access to your repository via one of two supported MCP servers:
   - **GitLab Duo MCP** (official) — `https://gitlab.com/api/v4/mcp`
   - **Community GitLab MCP** (`@zereight/mcp-gitlab`) — for self-hosted or non-Duo use cases

---

## 🚀 Quick Start (3 Steps)

### Step 1 — Generate a GitLab Personal Access Token

1. Log into [gitlab.com](https://gitlab.com)
2. Go to **Profile → Access Tokens → Add new token**
3. Give it a name (e.g. `baseflow-token`)
4. Set an expiry date (e.g. 30 days)
5. Select the **`api`** scope (required for full access to issues, MRs, pipelines, and MCP)
6. Click **Create personal access token**
7. Copy the token — it starts with `glpat-...`

> [!IMPORTANT]
> The token must have the **`api`** scope. `read_api` alone is insufficient for posting comments or creating MRs.

---

### Step 2 — Add a Connection in BaseFlow

1. Open BaseFlow → **Connections** → **+ New Connection**
2. In the **Path / Clone URL** field, paste your GitLab repository URL:
   ```
   https://gitlab.com/your-group/your-repo.git
   ```
   > **Tip:** If you paste a URL with embedded credentials like
   > `https://oauth2:glpat-xxxx@gitlab.com/group/repo.git`,
   > BaseFlow will **automatically** extract the token and username and strip them from the stored URL for security.
3. Fill in **Connection Name**, set type to **Git Remote URL**
4. Click **Save**

---

### Step 3 — Configure DevOps Credentials

1. Click your GitLab connection → open the **DevOps** tab
2. Enter your **Personal Access Token** (`glpat-...`)
3. (Optional) Set the **Git MCP Server Endpoint**:
   - **GitLab Duo MCP** (official): `https://gitlab.com/api/v4/mcp`
   - **Community MCP** (default if blank): leave empty → uses `@zereight/mcp-gitlab`
4. Click **Save Credentials**

---

## ⚙️ How MCP Mode is Selected

BaseFlow automatically selects the right MCP server based on the endpoint you configure:

| MCP Server Endpoint | Mode Used | Package |
|---|---|---|
| `https://gitlab.com/api/v4/mcp` (ends with `/mcp`) | **GitLab Duo MCP** via `mcp-remote` | Official GitLab Duo |
| `https://gitlab.com/api/v4` or empty | **Community MCP** via stdio | `@zereight/mcp-gitlab` |
| Custom `https://your-gitlab/api/v4` | **Community MCP** (self-hosted) | `@zereight/mcp-gitlab` |

> [!NOTE]
> The GitLab Duo MCP requires a **GitLab Ultimate** subscription or trial. The community MCP works with any GitLab plan (including Free and Premium).

---

## 🤖 AI Agent Capabilities with GitLab MCP

Once configured, the AI Architect Agent gains these MCP-powered tools:

### GitLab Duo MCP Tools (Official)
| Tool | Description |
|---|---|
| `list_issues` | List open issues in the project |
| `get_issue` | Read full issue details and description |
| `create_note` | Post a comment on an issue or MR |
| `list_merge_requests` | List open MRs |
| `get_merge_request` | Read MR details and diffs |
| `get_pipeline_jobs` | Inspect CI/CD pipeline jobs |
| `get_job_trace` | Fetch raw job log output |
| `list_project_files` | Browse repository file tree |
| `get_file_contents` | Read any file in the repository |

### Community MCP Tools (`@zereight/mcp-gitlab`)
| Tool | Description |
|---|---|
| `get_project` | Get project metadata |
| `list_issues` / `get_issue` | Read issues |
| `list_branches` / `get_branch` | Branch management |
| `list_merge_requests` | Read open MRs |
| `create_merge_request` | Create a new MR |
| `create_issue_note` | Comment on issues |
| `get_pipeline` / `list_pipelines` | Read pipeline status |
| `list_commits` | Browse recent commits |

### Built-in Agent Tools (always available)
| Tool | Description |
|---|---|
| `resolve_issue_with_ai` | Generate a `skills/fix_issue_N.md` fix playbook |
| `analyze_pipeline_failure` | Root-cause analysis with log cross-reference |
| `generate_devops_health_score` | DevOps health narrative with charts |
| `submit_mr_review` | Post inline code review comments on an MR |
| `create_merge_request_from_workspace` | Auto-commit workspace changes and open MR |
| `publish_skill_to_catalog` | Format skill for GitLab Duo AI Catalog |
| `audit_security_vulnerabilities` | Security scan with mindmap highlights |
| `write_workspace_file` | Write fix files to the local workspace |

---

## 📊 DevOps Dashboard Features

The **DevOps** tab in BaseFlow shows live data fetched from the GitLab REST API:

### Open Issues
- Paginated list with **Author**, **Labels**, and **Date**
- Click any issue title to open a detail dialog
- **AI Analysis** button → triggers `resolve_issue_with_ai` agent tool
- **Auto-Fix & Create MR** button → agent writes fix + creates Merge Request

### Merge Requests
- Paginated list with **Source/Target branch** info
- **AI Review** button → fetches diff from GitLab, runs AI code review, posts inline comments

### CI/CD Pipelines
- Live pipeline status with colour-coded badges (`success`, `failed`, `running`)
- **Analyze Failure** button → triggers `analyze_pipeline_failure` agent tool
- **View Log** link → opens pipeline directly on GitLab

### DevOps Health Score
- Real-time score (0–100) computed from: open issues (30%) + open MRs (30%) + pipeline success rate (40%)
- Click **Generate AI DevOps Report** → produces a full narrative with markdown table and actionable recommendations

---

## 🚀 GitLab Duo AI Catalog

After generating a fix playbook, you can publish it to the GitLab Duo AI Catalog:

1. The AI generates `skills/fix_issue_42.md` in your workspace
2. Ask the agent:
   > *"Publish the skill file `skills/fix_issue_42.md` to the GitLab AI Catalog"*
3. The agent formats the skill as a **Custom Agent system prompt** and provides a direct link:
   `https://gitlab.com/-/user_settings/custom_models`

---

## 🎯 GitLab Duo Quick Start (GitLab Ultimate Trial)

> [!TIP]
> GitLab Duo Agent Platform (MCP, Custom Agents, AI Catalog) requires **GitLab Ultimate**. You can start a free 30-day trial.

1. Go to [https://about.gitlab.com/free-trial/](https://about.gitlab.com/free-trial/)
2. Sign up or log in → choose **GitLab.com** hosted trial
3. Your trial includes:
   - ✅ GitLab Duo Agent Platform (24 credits/user)
   - ✅ Custom Agents (GA)
   - ✅ Custom Flows (Beta)
   - ✅ AI Catalog (GA)
   - ✅ MCP Server (Beta)
4. **Set Default Namespace** *(required for Duo MCP)*:
   - Profile → Preferences → Behavior → **Default GitLab Duo namespace** → select your group → Save

---

## 📚 GitLab Resources

| Resource | URL |
|---|---|
| GitLab Duo Agent Platform | https://docs.gitlab.com/user/get_started/get_started_agent_platform/ |
| Custom Agents | https://docs.gitlab.com/user/duo_agent_platform/agents/custom/ |
| Custom Flows | https://docs.gitlab.com/user/duo_agent_platform/flows/custom/ |
| AI Catalog | https://docs.gitlab.com/user/duo_agent_platform/ai_catalog/ |
| MCP Server Docs | https://docs.gitlab.com/user/gitlab_duo/model_context_protocol/mcp_server/ |
| Personal Access Tokens | https://gitlab.com/-/user_settings/personal_access_tokens |
| Free Trial | https://about.gitlab.com/free-trial/ |
| Community MCP (`@zereight/mcp-gitlab`) | https://www.npmjs.com/package/@zereight/mcp-gitlab |

---

## 🐛 Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| "GitLab token not configured" | Token not saved | Open DevOps tab → Save Credentials |
| Issues/MRs show empty list | Invalid token scope | Ensure `api` scope is selected |
| GitLab Duo MCP times out | Namespace not configured | Set Default GitLab Duo namespace in GitLab Preferences |
| Community MCP fails to start | `@zereight/mcp-gitlab` not found | Ensure `npx` is available and internet access is enabled |
| Duplicate tool names logged | Community MCP tool overlap | Expected warning — both `branches` and `merge_requests` toolsets register `get_branch`. No action needed |
