"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.ensureGeminiCliPatched = ensureGeminiCliPatched;
const child_process_1 = require("child_process");
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
function ensureGeminiCliPatched() {
    const isWin = process.platform === 'win32';
    if (!isWin)
        return; // Only needed on Windows
    const tryPatch = (rootPath) => {
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
        }
        catch (err) {
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
        const npmRoot = (0, child_process_1.execSync)('npm root -g').toString().trim();
        if (npmRoot)
            tryPatch(npmRoot);
    }
    catch (_) { }
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
