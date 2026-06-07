"use strict";
/**
 * Agent Callbacks - ported from vibe-mongo-admin
 * Provides rate limiting, tool logging hooks for the ADK LlmAgent.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.afterTool = exports.beforeTool = exports.rateLimitCallback = void 0;
// Simple in-memory rate limiter
const requestTimestamps = [];
const RATE_LIMIT_WINDOW_MS = 60_000;
const MAX_REQUESTS_PER_WINDOW = 50;
/**
 * Rate limit callback — prevents hammering the Gemini API.
 * Matches SingleBeforeModelCallback signature: (params: { context, request }) => LlmResponse | undefined
 */
const rateLimitCallback = async (params) => {
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
exports.rateLimitCallback = rateLimitCallback;
/**
 * Before tool callback — log tool invocation.
 * Matches SingleBeforeToolCallback signature: (params: { tool, args, context }) => any
 */
const beforeTool = async (params) => {
    const { tool, args } = params;
    console.log(`[Tool] ▶ ${tool.name}(${JSON.stringify(args).substring(0, 120)})`);
    return undefined;
};
exports.beforeTool = beforeTool;
/**
 * After tool callback — log tool result and surface errors.
 * Matches SingleAfterToolCallback signature: (params: { tool, args, context, toolResponse }) => any
 */
const afterTool = async (params) => {
    const { tool, response } = params;
    if (response?.error || response?.success === false) {
        console.error(`[Tool] ✗ ${tool.name} FAILED:`, response.error || 'Unknown error');
    }
    else {
        console.log(`[Tool] ✓ ${tool.name} → OK`);
    }
    return undefined;
};
exports.afterTool = afterTool;
