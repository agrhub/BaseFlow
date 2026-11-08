/**
 * Repository workspace locations: where downloaded repositories and parse caches live,
 * and resolution of user-supplied file paths inside a repository.
 */
import * as fs from 'fs';
import * as path from 'path';
import { remoteRepoDirName, assertLocalPathAllowed } from '../../utils/security';

export const activeSyncPaths = new Map<string, string>();

// Cache files are named after the connection; never allow path separators to escape tempDir
export function cacheFileName(profileName: string): string {
  if (typeof profileName !== 'string' || !profileName || /[\\/\0]/.test(profileName) || profileName.includes('..')) {
    throw new Error('Invalid connection name.');
  }
  return `${profileName}_cache.json`;
}

export const tempDir = process.env.TEMP_DIR || path.join(__dirname, '..', '..', '..', 'temp');
if (!fs.existsSync(tempDir)) {
  try {
    fs.mkdirSync(tempDir, { recursive: true });
  } catch (e: any) {
    console.error(`Failed to create temp directory at ${tempDir}:`, e.message || e);
  }
}

// Resolve Repository Path
export function resolveRepoPath(profile: any): string {
  const uri = profile.uri || profile.string;
  if (profile.options?.type === 'local') {
    return assertLocalPathAllowed(uri);
  }
  // Remote repositories are stored under tempDir/<owner>__<repo> (collision-free)
  const dirName = remoteRepoDirName(uri);
  const preferred = path.join(tempDir, dirName);
  if (fs.existsSync(preferred)) return preferred;

  // Backward compatibility: older versions stored repos under tempDir/<repo>
  const legacyName = (uri.split('/').pop() || '').replace(/\.git$/, '');
  if (legacyName && /^[A-Za-z0-9_.-]+$/.test(legacyName) && !legacyName.startsWith('.') && fs.existsSync(tempDir)) {
    try {
      const items = fs.readdirSync(tempDir);
      const matched = items.find(item => item.toLowerCase() === legacyName.toLowerCase());
      if (matched) {
        return path.join(tempDir, matched);
      }
    } catch (e) {
      console.warn(`Failed to read tempDir for legacy repo lookup:`, e);
    }
  }
  return preferred;
}

// Resolve Cache Path
export function resolveCachePath(profileName: string): string {
  const cachePath = path.join(tempDir, cacheFileName(profileName));
  if (!fs.existsSync(cachePath) && fs.existsSync(tempDir)) {
    try {
      const items = fs.readdirSync(tempDir);
      const targetName = `${profileName}_cache.json`.toLowerCase();
      const matched = items.find(item => item.toLowerCase() === targetName);
      if (matched) {
        return path.join(tempDir, matched);
      }
    } catch (e) {
      console.warn(`Failed to read tempDir for case-insensitive cache lookup:`, e);
    }
  }
  return cachePath;
}

// Helper to resolve filePath, fallback to /tmp local sync path if GCS file does not exist during sync,
// and resolves extension-less file path requests (for new or unindexed files without explicit extensions).
export function resolveFilePathWithFallback(repoPath: string, filePath: string): { resolvedFilePath: string; activeRepoRoot: string } {
  let resolvedFilePath = path.resolve(repoPath, filePath);
  let activeRepoRoot = repoPath;

  const findPathWithExt = (basePath: string): string | null => {
    if (fs.existsSync(basePath) && fs.statSync(basePath).isFile()) return basePath;
    const exts = ['.java', '.ts', '.tsx', '.js', '.jsx', '.py', '.cs', '.go', '.rs', '.kt', '.php', '.html', '.css', '.json', '.md'];
    for (const ext of exts) {
      const testPath = basePath + ext;
      if (fs.existsSync(testPath)) return testPath;
    }
    return null;
  };

  const matchedPath = findPathWithExt(resolvedFilePath);
  if (matchedPath) {
    resolvedFilePath = matchedPath;
  } else {
    // If not found in repoPath, try localSyncPath
    const localSyncPath = activeSyncPaths.get(repoPath);
    if (localSyncPath) {
      const localFilePath = path.resolve(localSyncPath, filePath);
      const relativeLocal = path.relative(localSyncPath, localFilePath);
      if (!relativeLocal.startsWith('..') && !path.isAbsolute(relativeLocal)) {
        const matchedLocal = findPathWithExt(localFilePath);
        if (matchedLocal) {
          console.log(`[File Fallback] Reading ${filePath} from local sync path: ${matchedLocal}`);
          resolvedFilePath = matchedLocal;
          activeRepoRoot = localSyncPath;
        }
      }
    }
  }

  return { resolvedFilePath, activeRepoRoot };
}
