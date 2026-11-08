import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { execFile, ExecFileOptions } from 'child_process';

/**
 * Centralised security helpers & configuration.
 *
 * Production (NODE_ENV=production) refuses to start with insecure defaults;
 * development falls back to convenient defaults but logs loud warnings.
 */

export const isProduction = process.env.NODE_ENV === 'production';

const INSECURE_PASSWORDS = new Set(['', 'admin', 'password', '123456', 'changeme']);
const LEGACY_DEFAULT_ENCRYPTION_KEYS = [
  'default_32_characters_secret_key_123',
  'baseflow_32_char_secret_key_here!',
  'your_encryption_key_32_characters_here!'
];

export interface SecurityConfig {
  password: string;
  sessionSecret: string;
  encryptionKey: string;
  corsOrigins: string[];
  allowedLocalRoots: string[];
  allowLocalPaths: boolean;
  allowOpenFile: boolean;
}

let cachedConfig: SecurityConfig | null = null;

function splitList(value: string | undefined): string[] {
  return (value || '')
    .split(/[,;]/)
    .map(s => s.trim())
    .filter(Boolean);
}

/**
 * Load and validate the security configuration. Throws in production when
 * mandatory secrets are missing or insecure.
 */
export function getSecurityConfig(): SecurityConfig {
  if (cachedConfig) return cachedConfig;

  const errors: string[] = [];
  const warnings: string[] = [];

  // ---- Login password ----
  let password = process.env.PASSWORD || '';
  if (INSECURE_PASSWORDS.has(password) || password.length < 8) {
    if (isProduction) {
      errors.push('PASSWORD must be set to a strong value (>= 8 chars, not "admin").');
    } else {
      if (!password) password = 'admin';
      warnings.push(`PASSWORD is weak/unset — using "${password}" (development only).`);
    }
  }

  // ---- Session secret ----
  let sessionSecret = process.env.SESSION_SECRET || '';
  if (sessionSecret.length < 32) {
    if (isProduction) {
      errors.push('SESSION_SECRET must be set (>= 32 random chars). Generate one with: openssl rand -hex 32');
    } else {
      sessionSecret = crypto.randomBytes(32).toString('hex');
      warnings.push('SESSION_SECRET unset — generated an ephemeral secret (sessions reset on restart).');
    }
  }

  // ---- Encryption key for stored credentials ----
  let encryptionKey = process.env.ENCRYPTION_KEY || '';
  if (encryptionKey.length < 32 || LEGACY_DEFAULT_ENCRYPTION_KEYS.includes(encryptionKey)) {
    if (isProduction) {
      errors.push('ENCRYPTION_KEY must be set to a unique secret (>= 32 chars). Generate one with: openssl rand -hex 32');
    } else {
      encryptionKey = encryptionKey || LEGACY_DEFAULT_ENCRYPTION_KEYS[0];
      warnings.push('ENCRYPTION_KEY is a default/weak value — stored Git tokens are NOT protected (development only).');
    }
  }

  // ---- CORS ----
  const corsOrigins = splitList(process.env.CORS_ORIGINS);
  if (!isProduction && corsOrigins.length === 0) {
    corsOrigins.push('http://localhost:5173', 'http://127.0.0.1:5173');
  }

  // ---- Local filesystem access ----
  const allowedLocalRoots = splitList(process.env.ALLOWED_LOCAL_ROOTS).map(p => path.resolve(p));
  // In production, local folder connections are disabled unless roots are explicitly whitelisted.
  const allowLocalPaths = allowedLocalRoots.length > 0 || !isProduction;
  if (!isProduction && allowedLocalRoots.length === 0) {
    warnings.push('ALLOWED_LOCAL_ROOTS unset — any local folder can be scanned (development only).');
  }

  const allowOpenFile = !isProduction && process.env.CLOUD_RUN !== '1';

  for (const w of warnings) console.warn(`[Security] ⚠️  ${w}`);
  if (errors.length > 0) {
    const msg = `[Security] Refusing to start with insecure configuration:\n  - ${errors.join('\n  - ')}`;
    throw new Error(msg);
  }

  cachedConfig = {
    password,
    sessionSecret,
    encryptionKey,
    corsOrigins,
    allowedLocalRoots,
    allowLocalPaths,
    allowOpenFile
  };
  return cachedConfig;
}

/** Legacy keys tried during decryption so existing databases can be migrated. */
export function getLegacyEncryptionKeys(): string[] {
  return LEGACY_DEFAULT_ENCRYPTION_KEYS;
}

/** Constant-time string comparison. */
export function safeEqual(a: string, b: string): boolean {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

// ─────────────────────────────────────────────────────────────────────────────
// Path safety
// ─────────────────────────────────────────────────────────────────────────────

function realpathOrSelf(p: string): string {
  try {
    return fs.realpathSync.native(p);
  } catch {
    return path.resolve(p);
  }
}

/**
 * Resolve the real path of `target`, following symlinks. For paths that do not
 * exist yet (writes), the closest existing ancestor is resolved instead.
 */
function realpathForCheck(target: string): string {
  let current = path.resolve(target);
  const tail: string[] = [];
  while (!fs.existsSync(current)) {
    const parent = path.dirname(current);
    if (parent === current) break;
    tail.unshift(path.basename(current));
    current = parent;
  }
  return path.join(realpathOrSelf(current), ...tail);
}

/** True when `target` (after resolving symlinks) is `root` or lies inside it. */
export function isPathInside(root: string, target: string): boolean {
  const realRoot = realpathOrSelf(root);
  const realTarget = realpathForCheck(target);
  const rel = path.relative(realRoot, realTarget);
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

/**
 * Resolve a user/LLM supplied relative path inside `root`.
 * Throws if the result escapes the root (via `..`, absolute paths or symlinks).
 */
export function resolveInside(root: string, relativePath: string): string {
  if (typeof relativePath !== 'string' || relativePath.length === 0) {
    throw new Error('A file path is required.');
  }
  if (relativePath.includes('\0')) {
    throw new Error('Invalid file path.');
  }
  const resolved = path.resolve(root, relativePath);
  if (!isPathInside(root, resolved)) {
    throw new Error(`Access denied: path "${relativePath}" is outside the repository workspace.`);
  }
  return resolved;
}

/**
 * Validate a local folder requested by a user. Enforces ALLOWED_LOCAL_ROOTS and
 * blocks local folders entirely in production when no roots are configured.
 */
export function assertLocalPathAllowed(localPath: string): string {
  const cfg = getSecurityConfig();
  if (!cfg.allowLocalPaths) {
    throw new Error('Local folder connections are disabled on this server. Set ALLOWED_LOCAL_ROOTS to enable them.');
  }
  const resolved = path.resolve(localPath);
  if (cfg.allowedLocalRoots.length > 0 && !cfg.allowedLocalRoots.some(root => isPathInside(root, resolved))) {
    throw new Error(`Local folder "${localPath}" is outside the allowed roots (ALLOWED_LOCAL_ROOTS).`);
  }
  return resolved;
}

// ─────────────────────────────────────────────────────────────────────────────
// Input validation
// ─────────────────────────────────────────────────────────────────────────────

const CONNECTION_NAME_RE = /^[A-Za-z0-9][A-Za-z0-9 _.-]{0,63}$/;

/** Connection names are used in URLs and cache file names. */
export function assertValidConnectionName(name: unknown): string {
  if (typeof name !== 'string' || !CONNECTION_NAME_RE.test(name) || name.includes('..')) {
    throw new Error('Invalid connection name. Use 1-64 letters, digits, spaces, ".", "_" or "-" (must start with a letter or digit).');
  }
  return name;
}

const SAFE_SEGMENT_RE = /^[A-Za-z0-9_.-]+$/;

/** Validate a GitHub/GitLab repository URL and return its parts. */
export function assertValidRepoUrl(uri: unknown): { provider: string; owner: string; repo: string; fullPath: string } {
  if (typeof uri !== 'string' || uri.length > 500) {
    throw new Error('Invalid repository URL.');
  }
  const match = uri.trim().match(/^(?:https?:\/\/|git@)?(?:www\.)?(github|gitlab)\.com[:/](.+?)(?:\.git)?\/?$/i);
  if (!match) {
    throw new Error('Only https://github.com/<owner>/<repo> and https://gitlab.com/<group>/<repo> URLs are supported.');
  }
  const provider = match[1].toLowerCase();
  const segments = match[2].split('/');
  if (segments.length < 2 || segments.some(s => !SAFE_SEGMENT_RE.test(s) || s === '.' || s === '..')) {
    throw new Error('Repository URL contains invalid characters.');
  }
  if (provider === 'github' && segments.length !== 2) {
    throw new Error('GitHub URLs must be in the form https://github.com/<owner>/<repo>.');
  }
  return { provider, owner: segments[0], repo: segments[segments.length - 1], fullPath: segments.join('/') };
}

/** Folder name used for a downloaded remote repository (owner-qualified to avoid collisions). */
export function remoteRepoDirName(uri: string): string {
  try {
    const { owner, repo, fullPath } = assertValidRepoUrl(uri);
    const base = fullPath.split('/').length > 2 ? fullPath.replace(/\//g, '__') : `${owner}__${repo}`;
    return base.replace(/[^A-Za-z0-9_.-]/g, '_');
  } catch {
    const last = (uri.split('/').pop() || 'temp-repo').replace(/\.git$/, '');
    return last.replace(/[^A-Za-z0-9_.-]/g, '_').replace(/^\.+/, '') || 'temp-repo';
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Process execution (no shell interpolation)
// ─────────────────────────────────────────────────────────────────────────────

export function execFileAsync(
  file: string,
  args: string[],
  options: ExecFileOptions = {}
): Promise<{ stdout: string; stderr: string; code: number }> {
  return new Promise(resolve => {
    execFile(file, args, { maxBuffer: 20 * 1024 * 1024, ...options }, (error: any, stdout, stderr) => {
      resolve({
        stdout: stdout ? stdout.toString() : '',
        stderr: stderr ? stderr.toString() : '',
        code: error ? (typeof error.code === 'number' ? error.code : 1) : 0
      });
    });
  });
}

/**
 * Minimal environment for child processes that run untrusted code / prompts
 * (e.g. Gemini CLI on a cloned repository). Server secrets are never forwarded.
 */
export function buildSandboxEnv(extra: Record<string, string | undefined> = {}): Record<string, string> {
  const passthrough = [
    'PATH', 'HOME', 'USER', 'LANG', 'LC_ALL', 'TMPDIR', 'TEMP', 'TMP', 'SHELL', 'TERM',
    'SystemRoot', 'SYSTEMROOT', 'ComSpec', 'PATHEXT', 'APPDATA', 'LOCALAPPDATA', 'USERPROFILE', 'HOMEDRIVE', 'HOMEPATH',
    'HTTP_PROXY', 'HTTPS_PROXY', 'NO_PROXY', 'http_proxy', 'https_proxy', 'no_proxy',
    'NODE_EXTRA_CA_CERTS', 'SSL_CERT_FILE', 'GIT_SSL_CAINFO',
    'GOOGLE_CLOUD_PROJECT', 'GOOGLE_CLOUD_LOCATION', 'GOOGLE_APPLICATION_CREDENTIALS',
    'GOOGLE_GENAI_USE_VERTEXAI', 'CLOUD_RUN'
  ];
  const env: Record<string, string> = {};
  for (const key of passthrough) {
    const v = process.env[key];
    if (v !== undefined) env[key] = v;
  }
  for (const [k, v] of Object.entries(extra)) {
    if (v === undefined) delete env[k];
    else env[k] = v;
  }
  return env;
}

// ─────────────────────────────────────────────────────────────────────────────
// Simple in-memory rate limiter
// ─────────────────────────────────────────────────────────────────────────────

export class RateLimiter {
  private hits = new Map<string, number[]>();
  constructor(private readonly max: number, private readonly windowMs: number) {}

  /** Returns remaining wait time in ms when limited, otherwise 0 (and records the hit). */
  hit(key: string): number {
    const now = Date.now();
    const list = (this.hits.get(key) || []).filter(t => t > now - this.windowMs);
    if (list.length >= this.max) {
      this.hits.set(key, list);
      return list[0] + this.windowMs - now;
    }
    list.push(now);
    this.hits.set(key, list);
    if (this.hits.size > 10_000) {
      for (const [k, v] of this.hits) {
        if (!v.some(t => t > now - this.windowMs)) this.hits.delete(k);
      }
    }
    return 0;
  }

  reset(key: string) {
    this.hits.delete(key);
  }
}
