import express from 'express';
import { connectionStore } from '../services/ConnectionStore';
import { cloneRemoteRepo, resolveRepoPath, tempDir, performCompleteAnalysis } from './helpers';
import * as fs from 'fs';
import * as path from 'path';

const router = express.Router();

// 1. Get Connection Profiles
router.get('/', async (req, res) => {
  try {
    const list = await connectionStore.listConnections();
    const connections: Record<string, any> = {};
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
  } catch (error: any) {
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
    await cloneRemoteRepo(string, parsedOptions, true);
    
    await connectionStore.saveConnection(name, string, parsedOptions);
    
    // Perform initial complete analysis and warm cache
    // await performCompleteAnalysis(name);
    
    res.json({ msg: 'Profile successfully added' });
  } catch (error: any) {
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
    const oldConfig = await connectionStore.getConnection(curr_config);
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
    if (
      !oldConfig ||
      oldConfig.uri !== conn_string ||
      oldConfig.options?.type !== parsedOptions.type ||
      oldConfig.options?.branch !== parsedOptions.branch
    ) {
      await cloneRemoteRepo(conn_string, parsedOptions, true);
    }
    
    // If the name is changed, delete the old one first
    if (curr_config !== conn_name) {
      await connectionStore.deleteConnection(curr_config);
      // Clean up old cache file if it exists
      const oldCache = path.join(tempDir, `${curr_config}_cache.json`);
      if (fs.existsSync(oldCache)) {
        try { fs.unlinkSync(oldCache); } catch (e) {}
      }
    }
    await connectionStore.saveConnection(conn_name, conn_string, parsedOptions);
    
    // Perform complete analysis and warm cache
    // await performCompleteAnalysis(conn_name);
    
    res.json({ msg: 'Profile successfully updated' });
  } catch (error: any) {
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
    const profile = await connectionStore.getConnection(curr_config);
    if (profile) {
      const targetPath = resolveRepoPath(profile);
      // Safety check: Only delete if remote repository AND the folder is inside the tempDir
      if (profile.options?.type !== 'local' && targetPath.startsWith(tempDir) && fs.existsSync(targetPath)) {
        console.log(`Deleting remote repository cloned folder at: ${targetPath}`);
        try {
          fs.rmSync(targetPath, { recursive: true, force: true });
        } catch (err) {
          console.warn(`Failed to delete remote folder on profile deletion:`, err);
        }
      }
    }

    await connectionStore.deleteConnection(curr_config);
    res.json({ msg: 'Profile successfully deleted' });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

export default router;
