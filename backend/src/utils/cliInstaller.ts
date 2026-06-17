import { execSync } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';



export function ensureGeminiCliPatched(): void {
  const isWin = process.platform === 'win32';
  if (!isWin) return; // Only needed on Windows

  const tryPatch = (rootPath: string) => {
    try {
      const geminiCliPath = path.join(rootPath, '@google', 'gemini-cli');
      
      if (fs.existsSync(geminiCliPath)) {
        // Path structure A: nested node_modules inside @google/gemini-cli
        const targetDirA = path.join(geminiCliPath, 'node_modules', 'clipboardy', 'lib');
        const targetFileA = path.join(targetDirA, 'macos.js');
        if (!fs.existsSync(targetFileA)) {
          if (!fs.existsSync(targetDirA)) {
            fs.mkdirSync(targetDirA, { recursive: true });
          }
          fs.writeFileSync(targetFileA, 'export default {};', 'utf8');
          console.log(`[Gemini CLI Patch] Created dummy macos.js at nested path: ${targetFileA}`);
        }

        // Path structure B: hoisted node_modules under the same rootPath (e.g. backend/node_modules/clipboardy)
        const targetDirB = path.join(rootPath, 'clipboardy', 'lib');
        const targetFileB = path.join(targetDirB, 'macos.js');
        if (fs.existsSync(path.join(rootPath, 'clipboardy')) && !fs.existsSync(targetFileB)) {
          if (!fs.existsSync(targetDirB)) {
            fs.mkdirSync(targetDirB, { recursive: true });
          }
          fs.writeFileSync(targetFileB, 'export default {};', 'utf8');
          console.log(`[Gemini CLI Patch] Created dummy macos.js at hoisted path: ${targetFileB}`);
        }
      }
    } catch (err: any) {
      console.warn(`[Gemini CLI Patch] Failed to patch root ${rootPath}:`, err.message);
    }
  };

  // Try local node_modules
  const localNodeModules = path.join(__dirname, '..', '..', 'node_modules');
  if (fs.existsSync(localNodeModules)) {
    tryPatch(localNodeModules);
  }

  // Try standard npm global root
  try {
    const npmRoot = execSync('npm root -g').toString().trim();
    if (npmRoot) tryPatch(npmRoot);
  } catch (_) {}

  // Try typical locations
  const userProfile = process.env.USERPROFILE || process.env.HOMEPATH || 'C:\\Users';
  const typicalRoots = [
    path.join(userProfile, 'AppData', 'Roaming', 'npm', 'node_modules'),
    path.join(userProfile, 'AppData', 'Local', 'pnpm', 'node_modules'),
    path.join('D:', 'Tools', 'nvm-noinstall', 'v20.19.5', 'node_modules'),
    path.join('D:', 'Tools', 'nvm-noinstall', 'nodejs', 'node_modules')
  ];

  for (const root of typicalRoots) {
    if (fs.existsSync(root)) {
      tryPatch(root);
    }
  }
}

