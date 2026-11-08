import { defineConfig } from '@playwright/test';
import * as path from 'path';

/**
 * End-to-end tests run the real backend (production mode, serving the built
 * frontend) against mock Anthropic / OpenAI APIs. Build the frontend first:
 *   npm run build --prefix frontend
 */
const PORT = 5097;
const MOCK_PORT = 5196;
const runDir = path.join(__dirname, '.tmp');

export const BASE_URL = `http://127.0.0.1:${PORT}`;
export const PASSWORD = 'e2e-test-password';
export const SAMPLE_REPO = path.join(__dirname, 'fixtures', 'sample-repo');

export default defineConfig({
  testDir: './tests',
  globalSetup: './global-setup.ts',
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  timeout: 60_000,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: BASE_URL,
    viewport: { width: 1400, height: 900 },
    trace: 'off',
    ...(process.env.PW_CHROMIUM_PATH ? { launchOptions: { executablePath: process.env.PW_CHROMIUM_PATH } } : {})
  },
  webServer: [
    {
      command: `node mock-llm.js`,
      url: `http://127.0.0.1:${MOCK_PORT}/health`,
      env: { MOCK_LLM_PORT: String(MOCK_PORT) },
      reuseExistingServer: false
    },
    {
      command: 'npx tsx src/server.ts',
      cwd: path.join(__dirname, '..', 'backend'),
      url: `${BASE_URL}/api/auth/status`,
      timeout: 120_000,
      reuseExistingServer: false,
      env: {
        NODE_ENV: 'production',
        PORT: String(PORT),
        PASSWORD,
        SESSION_SECRET: 'e2e-session-secret-0123456789abcdef0123456789',
        ENCRYPTION_KEY: 'e2e-encryption-key-0123456789abcdef0123456789',
        DATA_DIR: runDir,
        TEMP_DIR: runDir,
        SESSION_DB_URL: `sqlite://${path.join(runDir, 'agent_sessions.db')}`,
        ALLOWED_LOCAL_ROOTS: path.join(__dirname, 'fixtures'),
        LLM_PROVIDER: 'openai',
        OPENAI_API_KEY: 'e2e-fake',
        OPENAI_BASE_URL: `http://127.0.0.1:${MOCK_PORT}/v1`,
        ANTHROPIC_API_KEY: 'e2e-fake',
        ANTHROPIC_BASE_URL: `http://127.0.0.1:${MOCK_PORT}`,
        ANTHROPIC_SERVER_FALLBACK: 'off',
        GOOGLE_API_KEY: '',
        GEMINI_API_KEY: ''
      }
    }
  ]
});
