/**
 * Agent Callbacks - ported from vibe-mongo-admin
 * Provides rate limiting, tool logging hooks for the ADK LlmAgent.
 */

// Simple in-memory rate limiter
const requestTimestamps: number[] = [];
const RATE_LIMIT_WINDOW_MS = 60_000;
const MAX_REQUESTS_PER_WINDOW = 50;

/**
 * Rate limit callback — prevents hammering the Gemini API.
 * Matches SingleBeforeModelCallback signature: (params: { context, request }) => LlmResponse | undefined
 */
export const rateLimitCallback = async (params: { context: any; request: any }): Promise<any> => {
  const now = Date.now();
  while (requestTimestamps.length > 0 && requestTimestamps[0] < now - RATE_LIMIT_WINDOW_MS) {
    requestTimestamps.shift();
  }
  if (requestTimestamps.length >= MAX_REQUESTS_PER_WINDOW) {
    console.warn('[RateLimit] Too many requests, throttling...');
  }
  requestTimestamps.push(now);
  return undefined; // Proceed normally
};

/**
 * Before tool callback — log tool invocation.
 * Matches SingleBeforeToolCallback signature: (params: { tool, args, context }) => any
 */
export const beforeTool = async (params: { tool: any; args: Record<string, any>; context: any }): Promise<any> => {
  const { tool, args } = params;
  console.log(`[Tool] ▶ ${tool.name}(${JSON.stringify(args).substring(0, 120)})`);
  return undefined;
};

/**
 * After tool callback — log tool result and surface errors.
 * Matches SingleAfterToolCallback signature: (params: { tool, args, context, toolResponse }) => any
 */
export const afterTool = async (params: { tool: any; args: Record<string, any>; context: any; response: Record<string, unknown> }): Promise<any> => {
  const { tool, response } = params;
  if (response?.error || response?.success === false) {
    console.error(`[Tool] ✗ ${tool.name} FAILED:`, response.error || 'Unknown error');
  } else {
    console.log(`[Tool] ✓ ${tool.name} → OK`);
  }
  return undefined;
};
