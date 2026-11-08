import * as fs from 'fs';
import * as path from 'path';

// Fresh data directory for every run (connections DB, caches, agent sessions)
export default function globalSetup() {
  const runDir = path.join(__dirname, '.tmp');
  fs.rmSync(runDir, { recursive: true, force: true });
  fs.mkdirSync(runDir, { recursive: true });
}
