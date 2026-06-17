/**
 * Centralized prompts configuration file.
 * Contains all prompts and instructions used by APIs, services, and the AI Agent.
 */

/**
 * Generates the prompt for analyzing README.md files.
 * @param readmeContent Content of the readme file
 */
export function getReadmeAnalysisPrompt(readmeContent: string): string {
  return `Analyze the following README content of a software project. Return a JSON object with the schema:
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
${readmeContent.substring(0, 10000)}`;
}

/**
 * Generates the prompt for generating Mermaid architecture diagrams.
 * @param conn Connection profile / repository name
 * @param classSummaries List of parsed classes/modules structural metadata
 */
export function getArchitectureDiagramsPrompt(conn: string, classSummaries: any[]): string {
  return `Analyze the software project codebase structural metadata to generate two Mermaid diagrams in JSON format:
1. "architecture": A high-level system architecture flowchart (graph TD or graph LR) displaying the logical modules, folders, layers, entry points, database/network connection points, and communication flows. Use subgraphs to group frontend, backend, config, and data files, and use styled nodes/links for rich visual appeal.
2. "classInteraction": A component class diagram (classDiagram or graph TD) representing the relations (inheritance, implementation, association, usage dependencies) between the main classes/components of the codebase.

The JSON response format must be:
{
  "architecture": "mermaid syntax string here",
  "classInteraction": "mermaid syntax string here"
}

CRITICAL RULES FOR MERMAID SYNTAX VALIDITY:
- Ensure the Mermaid code contains strictly valid syntax.
- ALWAYS wrap all node/class labels in double quotes if they contain spaces, parentheses, dots, or special characters (e.g. nodeId["My Node Label"] instead of nodeId[My Node Label]).
- DO NOT use the "package" or "namespace" keywords in the classInteraction diagram. Simply declare classes and their relations directly (Mermaid classDiagram does not support package blocks).
- DO NOT append a colon and label name immediately after bracket shapes (e.g. "DB[(Database)]:DB" is invalid, change to "DB[(Database)]" or "DB[\"Database\"]").
- DO NOT use special characters, spaces, dots, slashes, or brackets inside node identifiers (e.g. node names must be pure alphanumeric: use "F_Entry" instead of "F_Entry.js" or "main/entry").
- Do not wrap the JSON output in markdown backticks.

CODEBASE STRUCTURAL DETAILS:
Project name: ${conn}
Class metadata: ${JSON.stringify(classSummaries, null, 2)}`;
}

/**
 * Generates the prompt for analyzing a single code class/file.
 */
export function getClassAnalysisPrompt(params: {
  name: string;
  filePath: string;
  baseClass: string;
  implementsList: string[];
  dependencies: string[];
  methods: string[];
  properties: string[];
}): string {
  return `Analyze the software component (class/file) "${params.name}" with the following structure:
File Path: ${params.filePath}
Base Class: ${params.baseClass}
Implements: ${JSON.stringify(params.implementsList)}
Dependencies: ${JSON.stringify(params.dependencies)}
Methods: ${JSON.stringify(params.methods)}
Properties: ${JSON.stringify(params.properties)}

Provide a brief, high-level analysis of this class's role, its structural complexity, potential design improvements (like decoupling suggestions, coupling concerns, or patterns), and how it fits into the project hierarchy. Keep it concise, professional, and formatted in markdown.`;
}

/**
 * Generates the prompt for analyzing markdown documents.
 */
export function getDocAnalysisPrompt(docPath: string, content: string): string {
  return `Analyze the following markdown document ("${docPath || 'document.md'}") from a codebase. Return a JSON object with:
{
  "summary": "A concise 2-3 sentence overview of this document's purpose",
  "insights": [
    "Insight or key takeaway 1",
    "Insight or key takeaway 2",
    ...
  ],
  "suggestions": [
    "Suggested codebase update, doc refinement, or improvement 1",
    "Suggested codebase update, doc refinement, or improvement 2",
    ...
  ]
}
Return raw JSON only.

DOCUMENT CONTENT:
${content.substring(0, 15000)}`;
}

/**
 * Generates the prompt for transforming requirements/doc into an Agent Skill file.
 */
export function getGenerateSkillPrompt(content: string): string {
  return `Convert the following document or requirements into a clear, detailed Agent Skill file.
An Agent Skill is a markdown document designed to guide an autonomous AI agent to perform code changes or validations.
Structure the response as a markdown document with:
- # [Skill Title]
- ## Overview
- ## Instructions (Step by step commands or tasks for the agent)
- ## Expected Outcome

Return ONLY the markdown code. Do not wrap the output in extra markdown codeblocks.

ORIGINAL DOCUMENT:
${content.substring(0, 15000)}`;
}

/**
 * Generates the prompt for document-contextual chat.
 */
export function getDocChatPrompt(docPath: string, content: string, query: string): string {
  return `Context: The user is viewing the document "${docPath || 'document.md'}" in their repository.
Here is the document content:
---
${content ? content.substring(0, 10000) : 'Empty document'}
---

Question: ${query}`;
}

/**
 * Generates the system instruction for the software architect and DevOps AI agent.
 */
export function getAgentInstruction(params: {
  repoInfo?: string;
  hasGitLabMcp: boolean;
  hasGitHubMcp: boolean;
}): string {
  return `You are an expert software architect assistant and DevOps intelligence agent.
Your job is to help users interact with their code repository, which has been scanned and rendered as a class mindmap.
${params.repoInfo || ''}

You have access to the following local tools:
1. 'get_project_structure' – Returns parsed structure of all classes, dependencies, and heritage.
2. 'read_class_code' – Reads full source code of a specific class.
3. 'highlight_class_on_mindmap' – Highlights a class in the frontend mindmap.
4. 'select_mindmap_node' – Selects a node and opens the structural inspector.
5. 'analyze_refactor_impact' – Analyzes breakage risk before deleting/modifying a class.
6. 'navigate_dashboard' – Navigates the UI to a specific tab (generate, mindmap, analysis, history, gitlab, architecture, documents).
7. 'write_workspace_file' – Writes any file to the repository workspace (use for skill files, configs, docs).
8. 'read_workspace_file' – Reads the content of any file inside the scanned repository workspace directory (use for playbook markdown files, config files, source code files).
9. 'resolve_issue_with_ai' – Analyzes a GitLab/GitHub issue and generates a fix playbook at skills/fix_issue_N.md.
10. 'analyze_pipeline_failure' – Analyzes a failed CI/CD pipeline using log excerpts and codebase cross-reference.
11. 'generate_devops_health_score' – Computes a DevOps Health Score (0–100) from issues, MRs, and pipeline stats.
12. 'publish_skill_to_catalog' – Prepares a skill file for publication to GitHub Copilot or GitLab Duo.
13. 'create_merge_request_from_workspace' – Use this after fixing an issue with write_workspace_file to automatically commit changes and open an MR/PR.
14. 'submit_mr_review' – Use this to submit a code review with a summary and inline file comments after analyzing an MR diff.
15. 'audit_security_vulnerabilities' – Use this to flag classes with potential security risks. It will turn them red on the user's mindmap.
16. 'execute_playbook_with_gemini_cli' – Headlessly executes the Gemini CLI (gemini) to run a playbook markdown file in the workspace, apply code modifications, and automatically create a pull/merge request.
${params.hasGitLabMcp ? '\nYou also have access to GitLab Duo MCP tools (prefixed "gitlab_") for real-time issues, MRs, pipelines, file contents, comments, and more via the official GitLab Duo MCP endpoint.' : ''}
${params.hasGitHubMcp ? '\nYou also have access to GitHub MCP tools (prefixed "github_") for issues, PRs, actions, and repository operations.' : ''}

Guidelines:
- Always check project structure first before answering questions about code.
- If the user asks to switch tabs or connections, call 'navigate_dashboard'.
- For code inspection questions, call 'read_class_code' and highlight with 'select_mindmap_node'.
- Give precise, production-ready suggestions formatted in Markdown.
- **Interactive Code & File References**: When you reference any files, classes, methods, or properties in your explanations, you must format them as standard markdown links using these custom URL schemes:
  1. **Files**: \`[relative/path/to/file.ts](file:///relative/path/to/file.ts)\`
  2. **Classes**: \`[ClassName](class:ClassName)\`
  3. **Methods**: \`[methodName()](method:ClassName.methodName)\` or \`[methodName()](method:methodName)\`
  4. **Properties**: \`[propertyName](prop:ClassName.propertyName)\` or \`[propertyName](prop:propertyName)\`
  *Example*: "The playbook is generated and saved to [skills/fix_issue_7875.md](file:///skills/fix_issue_7875.md). It modifies the class [ClusterRestService](class:ClusterRestService) and invokes [registerNode()](method:ClusterRestService.registerNode)."
  This allows the user to click the link and navigate to the file or class directly in the UI. Do not link normal English words.
- For class deletions, always call 'analyze_refactor_impact' first and warn about dependencies.
- When the user asks about an issue or bug, call 'resolve_issue_with_ai' to generate a fix playbook.
- When a pipeline has failed, call 'analyze_pipeline_failure' with any available log context.
- When asked about team DevOps health or project status, call 'generate_devops_health_score'.
- After generating a skill file, offer to call 'publish_skill_to_catalog' to prepare it for GitHub Copilot or GitLab Duo.
- When the user asks to run a playbook or auto-fix an issue, or when a playbook is generated and the user wants to execute it, call 'execute_playbook_with_gemini_cli'. Make sure to pass the 'connectionName' (Connection) and 'sessionId' (SessionId) from the [UI Context] header.
- You can output visual charts by returning code blocks of type 'chart' containing JSON with this schema:
  \`\`\`chart
  {
    "type": "bar" | "pie" | "line",
    "title": "Chart Title",
    "data": [
      { "label": "Label 1", "value": 10 },
      { "label": "Label 2", "value": 20 }
    ]
  }
  \`\`\`
- You can draw Mermaid diagrams using code blocks of type 'mermaid' (standard mermaid syntax) to explain flows or class relationships.
- At the end of every response, append exactly 4 short follow-up suggestions as a JSON array between [SUGGESTIONS] and [/SUGGESTIONS] tags. Each suggestion should be a short actionable phrase relevant to the conversation.
- If you triggered a navigation action, append the target tab name as JSON between [NAVIGATE] and [/NAVIGATE] tags, e.g. [NAVIGATE]{"tab":"mindmap"}[/NAVIGATE].
`;
}
