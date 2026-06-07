import express from 'express';
import * as path from 'path';
import * as fs from 'fs';
import { getOrScanRepo, generateArchitectureDiagrams } from './helpers';

const router = express.Router();

// 1. GET Architecture Diagrams
router.get('/:conn/architecture-diagrams', async (req, res) => {
  const { conn } = req.params;
  try {
    const { repoPath, classes } = await getOrScanRepo(conn);
    const cachePath = path.join(repoPath, '.baseflow_diagrams.json');
    if (fs.existsSync(cachePath)) {
      try {
        const cached = JSON.parse(fs.readFileSync(cachePath, 'utf-8'));
        return res.json(cached);
      } catch (e) {
        console.warn('Failed to parse cached architecture, will regenerate:', e);
      }
    }
    
    const diagrams = await generateArchitectureDiagrams(conn, repoPath, classes);
    fs.writeFileSync(cachePath, JSON.stringify(diagrams, null, 2), 'utf-8');
    res.json(diagrams);
  } catch (error: any) {
    console.error('Architecture diagrams error:', error);
    res.status(500).json({ error: error.message });
  }
});

// 2. POST Force Regenerate Diagrams
router.post('/:conn/architecture-diagrams/regenerate', async (req, res) => {
  const { conn } = req.params;
  try {
    const { repoPath, classes } = await getOrScanRepo(conn);
    const cachePath = path.join(repoPath, '.baseflow_diagrams.json');
    const diagrams = await generateArchitectureDiagrams(conn, repoPath, classes);
    fs.writeFileSync(cachePath, JSON.stringify(diagrams, null, 2), 'utf-8');
    res.json(diagrams);
  } catch (error: any) {
    console.error('Regenerate diagrams error:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
