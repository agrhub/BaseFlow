import type { Content, FunctionDeclaration, GenerateContentConfig, Part } from '@google/genai';

/**
 * Helpers that translate the Gemini-shaped request ADK builds (genai Content /
 * FunctionDeclaration / Schema) into provider-neutral pieces that the Claude
 * and OpenAI adapters map onto their own APIs.
 */

export interface JsonSchema {
  [key: string]: any;
}

/**
 * Convert a genai `Schema` (types are upper-case enums such as "OBJECT") into
 * standard JSON Schema (lower-case types). Unknown keys are dropped.
 */
export function genaiSchemaToJsonSchema(schema: any): JsonSchema {
  if (!schema || typeof schema !== 'object') return { type: 'object', properties: {} };
  const out: JsonSchema = {};
  if (schema.type) {
    const t = String(schema.type).toLowerCase();
    out.type = t === 'type_unspecified' ? undefined : t;
  }
  if (schema.description) out.description = schema.description;
  if (Array.isArray(schema.enum) && schema.enum.length) out.enum = schema.enum;
  if (schema.format && ['date-time', 'date', 'email', 'uri', 'uuid'].includes(schema.format)) out.format = schema.format;
  if (schema.properties && typeof schema.properties === 'object') {
    out.properties = {};
    for (const [key, value] of Object.entries(schema.properties)) {
      out.properties[key] = genaiSchemaToJsonSchema(value);
    }
  }
  if (schema.items) out.items = genaiSchemaToJsonSchema(schema.items);
  if (Array.isArray(schema.required) && schema.required.length) out.required = schema.required;
  if (Array.isArray(schema.anyOf) && schema.anyOf.length) out.anyOf = schema.anyOf.map(genaiSchemaToJsonSchema);
  if (schema.nullable && out.type) out.type = [out.type, 'null'];
  if (out.type === undefined) delete out.type;
  if (out.type === 'object' && !out.properties) out.properties = {};
  return out;
}

export interface ToolSpec {
  name: string;
  description: string;
  inputSchema: JsonSchema;
}

/** Collect every function declaration ADK put on the request (FunctionTools and MCP tools). */
export function collectTools(config?: GenerateContentConfig): ToolSpec[] {
  const specs: ToolSpec[] = [];
  for (const tool of (config?.tools || []) as any[]) {
    for (const decl of (tool?.functionDeclarations || []) as FunctionDeclaration[]) {
      if (!decl?.name) continue;
      const raw: any = (decl as any).parametersJsonSchema ?? decl.parameters;
      const inputSchema = (decl as any).parametersJsonSchema ? { ...raw } : genaiSchemaToJsonSchema(raw);
      if (!inputSchema.type) inputSchema.type = 'object';
      if (inputSchema.type === 'object' && !inputSchema.properties) inputSchema.properties = {};
      specs.push({ name: decl.name, description: decl.description || '', inputSchema });
    }
  }
  return specs;
}

/** Flatten ADK's system instruction (string | Content | Part[]) into plain text. */
export function systemInstructionText(config?: GenerateContentConfig): string {
  const si: any = config?.systemInstruction;
  if (!si) return '';
  if (typeof si === 'string') return si;
  const parts: Part[] = Array.isArray(si) ? si : si.parts || [];
  return parts.map(p => (typeof p === 'string' ? p : p?.text || '')).filter(Boolean).join('\n\n');
}

/** Normalise a function response payload into a string for tool_result / tool messages. */
export function functionResponseText(response: unknown): string {
  if (typeof response === 'string') return response;
  try {
    return JSON.stringify(response ?? {});
  } catch {
    return String(response);
  }
}

/** Visible text parts of a Content (thought parts excluded). */
export function contentText(content: Content): string {
  return (content.parts || [])
    .filter(p => typeof p.text === 'string' && !p.thought)
    .map(p => p.text as string)
    .join('');
}

/** Turn a plain prompt or a genai history into Content[] for the adapters. */
export function toContents(prompt: string | Content[]): Content[] {
  if (typeof prompt === 'string') return [{ role: 'user', parts: [{ text: prompt }] }];
  return prompt;
}
