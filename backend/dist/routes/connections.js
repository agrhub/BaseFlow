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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const ConnectionStore_1 = require("../services/ConnectionStore");
const helpers_1 = require("./helpers");
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const router = express_1.default.Router();
// 1. Get Connection Profiles
router.get('/', async (req, res) => {
    try {
        const list = await ConnectionStore_1.connectionStore.listConnections();
        const connections = {};
        list.forEach(c => {
            const sanitizedOptions = { ...(c.options || {}) };
            const sensitiveKeys = ['token', 'key', 'secret', 'password', 'user'];
            Object.keys(sanitizedOptions).forEach(key => {
                const lowerKey = key.toLowerCase();
                if (sensitiveKeys.some(s => lowerKey.includes(s))) {
                    sanitizedOptions[key] = '••••••••';
                }
            });
            connections[c.name] = {
                connection_string: c.uri,
                connection_options: sanitizedOptions
            };
        });
        res.json({ connections });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// 2. Add Profile
router.post('/add', async (req, res) => {
    const { name, string, options } = req.body;
    if (!name || !string) {
        return res.status(400).json({ error: 'Name and Path/URL (string) are required.' });
    }
    try {
        const parsedOptions = typeof options === 'string' ? JSON.parse(options) : (options || {});
        // Clone remote repository first to ensure it's cloned successfully (force clean clone)
        await (0, helpers_1.cloneRemoteRepo)(string, parsedOptions, true);
        await ConnectionStore_1.connectionStore.saveConnection(name, string, parsedOptions);
        // Perform initial complete analysis and warm cache
        // await performCompleteAnalysis(name);
        res.json({ msg: 'Profile successfully added' });
    }
    catch (error) {
        res.status(400).json({ error: error.message });
    }
});
// 3. Update Profile
router.post('/update', async (req, res) => {
    const { curr_config, conn_name, conn_string, options } = req.body;
    if (!curr_config || !conn_name || !conn_string) {
        return res.status(400).json({ error: 'Missing required parameters.' });
    }
    try {
        const oldConfig = await ConnectionStore_1.connectionStore.getConnection(curr_config);
        const parsedOptions = typeof options === 'string' ? JSON.parse(options) : (options || {});
        // Preserve old credentials if they are masked in the update payload
        if (oldConfig?.options) {
            Object.keys(oldConfig.options).forEach(key => {
                if (parsedOptions[key] === '••••••••') {
                    parsedOptions[key] = oldConfig.options[key];
                }
            });
        }
        // Check if the repository URL, type, or branch has changed, if so validate/clone
        if (!oldConfig ||
            oldConfig.uri !== conn_string ||
            oldConfig.options?.type !== parsedOptions.type ||
            oldConfig.options?.branch !== parsedOptions.branch) {
            await (0, helpers_1.cloneRemoteRepo)(conn_string, parsedOptions, true);
        }
        // If the name is changed, delete the old one first
        if (curr_config !== conn_name) {
            await ConnectionStore_1.connectionStore.deleteConnection(curr_config);
            // Clean up old cache file if it exists
            const oldCache = path.join(helpers_1.tempDir, `${curr_config}_cache.json`);
            if (fs.existsSync(oldCache)) {
                try {
                    fs.unlinkSync(oldCache);
                }
                catch (e) { }
            }
        }
        await ConnectionStore_1.connectionStore.saveConnection(conn_name, conn_string, parsedOptions);
        // Perform complete analysis and warm cache
        // await performCompleteAnalysis(conn_name);
        res.json({ msg: 'Profile successfully updated' });
    }
    catch (error) {
        res.status(400).json({ error: error.message });
    }
});
// 4. Delete Profile
router.post('/delete', async (req, res) => {
    const { curr_config } = req.body;
    if (!curr_config) {
        return res.status(400).json({ error: 'Missing profile name.' });
    }
    try {
        const profile = await ConnectionStore_1.connectionStore.getConnection(curr_config);
        if (profile) {
            const targetPath = (0, helpers_1.resolveRepoPath)(profile);
            // Safety check: Only delete if remote repository AND the folder is inside the tempDir
            if (profile.options?.type !== 'local' && targetPath.startsWith(helpers_1.tempDir) && fs.existsSync(targetPath)) {
                console.log(`Deleting remote repository cloned folder at: ${targetPath}`);
                try {
                    fs.rmSync(targetPath, { recursive: true, force: true });
                }
                catch (err) {
                    console.warn(`Failed to delete remote folder on profile deletion:`, err);
                }
            }
        }
        await ConnectionStore_1.connectionStore.deleteConnection(curr_config);
        res.json({ msg: 'Profile successfully deleted' });
    }
    catch (error) {
        res.status(400).json({ error: error.message });
    }
});
exports.default = router;
