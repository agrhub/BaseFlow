/**
 * AI-generated repository insights: README analysis and architecture diagrams.
 */
import * as fs from 'fs';
import * as path from 'path';
import { geminiService } from '../GeminiService';
import { ParsedClass, parseRepository } from '../../utils/parser';
import { getReadmeAnalysisPrompt, getArchitectureDiagramsPrompt } from '../../prompts/prompts';
import { getOrScanRepo } from './repoCache';

// Generate README AI Analysis and save to cache
export async function generateReadmeAnalysis(connName: string, repoPath: string): Promise<any> {
  const cachePath = path.join(repoPath, '.baseflow_readme_analysis.json');
  
  // Find README.md
  let readmePath = '';
  let files: string[] = [];
  try {
    files = fs.readdirSync(repoPath);
  } catch (e) {
    console.warn(`Failed to read repo path ${repoPath}:`, e);
  }
  const readmeFile = files.find(f => f.toLowerCase() === 'readme.md');
  let readmeContent = '';
  
  if (readmeFile) {
    readmePath = path.join(repoPath, readmeFile);
    readmeContent = fs.readFileSync(readmePath, 'utf-8');
  } else {
    // Fallback: list project structure to analyze
    const allFiles = parseRepository(repoPath).classes.map(c => c.filePath);
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
  
  let jsonResult: any = null;
  try {
    const prompt = getReadmeAnalysisPrompt(readmeContent);
    jsonResult = await geminiService.generateJSON(prompt);
    fs.writeFileSync(cachePath, JSON.stringify(jsonResult, null, 2), 'utf-8');
  } catch (cacheErr) {
    console.warn('Failed to write readme analysis cache:', cacheErr);
  }

  return jsonResult;
}

// Perform a complete scanning and analysis run, creating all cache files
export async function performCompleteAnalysis(connName: string): Promise<any> {
  console.log(`Starting complete codebase analysis for ${connName}...`);
  // 1. Run AST scan & build graph
  const scanData = await getOrScanRepo(connName);

  // 2. Run README analysis
  try {
    await generateReadmeAnalysis(connName, scanData.repoPath);
  } catch (readmeErr) {
    console.error(`Failed to pre-generate README analysis for ${connName}:`, readmeErr);
  }

  // 3. Run Architecture diagrams generation
  try {
    const diagrams = await generateArchitectureDiagrams(connName, scanData.repoPath, scanData.classes);
    const diagramsCachePath = path.join(scanData.repoPath, '.baseflow_diagrams.json');
    fs.writeFileSync(diagramsCachePath, JSON.stringify(diagrams, null, 2), 'utf-8');
  } catch (diagramErr) {
    console.error(`Failed to pre-generate architecture diagrams for ${connName}:`, diagramErr);
  }

  return scanData;
}

function sanitizeMermaid(graph: string): string {
  if (!graph) return '';
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

export async function generateArchitectureDiagrams(conn: string, repoPath: string, classes: ParsedClass[]) {
  const classSummaries = classes.map(c => ({
    name: c.name,
    filePath: c.filePath,
    baseClass: c.baseClass || undefined,
    implementsList: c.implementsList.length > 0 ? c.implementsList : undefined,
    dependencies: c.dependencies.length > 0 ? c.dependencies : undefined
  })).slice(0, 80);


  if (!geminiService.isConfigured()) {
    return {
      architecture: `graph TD\n  subgraph Project [${conn}]\n    A[Src Files] --> B[AST Parser]\n  end\n  style Project fill:#1e1e3f,stroke:#6f7ad3`,
      classInteraction: `graph TD\n  ClassA[No API Key] --> ClassB[Configure an LLM API key]`
    };
  }

  try {
    const prompt = getArchitectureDiagramsPrompt(conn, classSummaries);
    const parsed = await geminiService.generateJSON<any>(prompt);
    if (parsed.architecture) {
      parsed.architecture = sanitizeMermaid(parsed.architecture);
    }
    if (parsed.classInteraction) {
      parsed.classInteraction = sanitizeMermaid(parsed.classInteraction);
    }
    return parsed;
  } catch (e) {
    console.error("Failed to parse or sanitize generated architecture diagrams:", e);
    return {
      architecture: `graph TD\n  subgraph Project [${conn}]\n    A[Src Files] --> B[AST Parser]\n  end\n  style Project fill:#1e1e3f,stroke:#6f7ad3`,
      classInteraction: `graph TD\n  ClassA[Error Parsing Diagrams] --> ClassB[Retry Regeneration]`
    };
  }
}
