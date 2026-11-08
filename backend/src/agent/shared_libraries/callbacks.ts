/**
 * Agent Callbacks - ported from vibe-mongo-admin
 * Provides rate limiting, tool logging hooks for the ADK LlmAgent.
 */

// Simple in-memory rate limiter
const requestTimestamps: number[] = [];
const RATE_LIMIT_WINDOW_MS = 60_000;
const MAX_REQUESTS_PER_WINDOW = 50;
// Longest silent wait before answering the user with a clear "busy" message instead
const MAX_THROTTLE_WAIT_MS = 10_000;

export const RATE_LIMIT_MESSAGE =
  '⚠️ The assistant is handling too many requests right now. Please wait about a minute and try again.';

/**
 * Rate limit callback — prevents hammering the Gemini API.
 * Short waits are absorbed silently; when the window is full for longer than
 * MAX_THROTTLE_WAIT_MS the model call is skipped and the user gets an explicit
 * message instead of a chat that looks frozen.
 * Matches SingleBeforeModelCallback signature: (params: { context, request }) => LlmResponse | undefined
 */
export const rateLimitCallback = async (params: { context: any; request: any }): Promise<any> => {
  let now = Date.now();
  const prune = () => {
    while (requestTimestamps.length > 0 && requestTimestamps[0] < now - RATE_LIMIT_WINDOW_MS) {
      requestTimestamps.shift();
    }
  };
  prune();
  if (requestTimestamps.length >= MAX_REQUESTS_PER_WINDOW) {
    const waitMs = requestTimestamps[0] + RATE_LIMIT_WINDOW_MS - now;
    if (waitMs > MAX_THROTTLE_WAIT_MS) {
      console.warn(`[RateLimit] Window full for another ${waitMs}ms — returning busy message.`);
      return {
        content: { role: 'model', parts: [{ text: RATE_LIMIT_MESSAGE }] },
        turnComplete: true
      };
    }
    console.warn(`[RateLimit] Too many model requests, delaying ${waitMs}ms...`);
    await new Promise(resolve => setTimeout(resolve, waitMs));
    now = Date.now();
    prune();
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
