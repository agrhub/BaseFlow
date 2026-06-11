import dotenv from 'dotenv';
import * as path from 'path';
dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import session from 'express-session';
import * as fs from 'fs';

// Import modular routers
import authRouter from './routes/auth';
import connectionsRouter from './routes/connections';
import scanRouter from './routes/scan';
import chatRouter from './routes/chat';
import devopsRouter from './routes/devops';
import diagramsRouter from './routes/diagrams';
import documentsRouter from './routes/documents';
import { ensureGeminiCliPatched } from './utils/cliInstaller';

// TypeScript session field extension
declare module 'express-session' {
  interface SessionData {
    loggedIn?: boolean | null;
  }
}

const app = express();
const PORT = process.env.PORT || 5000;

// CORS configuration supporting credentials sharing during local hot-reloads
app.use(cors({
  origin: true,
  credentials: true
}));

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(cookieParser());

// Session setup
app.use(session({
  secret: '858SGTUyX8w1L6JNm1m93Cvm8uX1QX2D',
  resave: true,
  saveUninitialized: true,
  cookie: {
    maxAge: 24 * 60 * 60 * 1000 // 1 day
  }
}));

// Route guard middleware for authenticated operations
const authMiddleware = (req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (req.method === 'OPTIONS') {
    return next();
  }
  const passwordConf = process.env.PASSWORD || 'admin';
  const passwordRequired = !!passwordConf;
  if (passwordRequired && !req.session.loggedIn) {
    // Only guard API endpoints (excluding auth routes)
    if (req.path.startsWith('/api/')) {
      if (req.path.startsWith('/api/auth/')) {
        return next();
      }
      return res.status(401).json({ error: 'Unauthorized' });
    }
  }
  next();
};

app.use(authMiddleware);

// Mount modular sub-routers
app.use('/api/auth', authRouter);
app.use('/api/connections', connectionsRouter);
app.use('/api', scanRouter);
app.use('/api', chatRouter);
app.use('/api', devopsRouter);
app.use('/api', diagramsRouter);
app.use('/api', documentsRouter);

// Serve frontend static assets in production
const distPaths = [
  path.resolve(__dirname, '..', '..', 'frontend', 'dist'), // relative to src/server.ts inside backend
  path.resolve(__dirname, '..', 'frontend', 'dist'),       // relative to dist/server.js inside backend
  path.resolve(__dirname, 'public'),                       // fallback public folder in backend
  path.resolve(__dirname, '..', 'public')
];

let frontendDist = '';
for (const p of distPaths) {
  if (fs.existsSync(p) && fs.statSync(p).isDirectory()) {
    frontendDist = p;
    break;
  }
}

if (frontendDist) {
  console.log(`Serving frontend static assets from: ${frontendDist}`);
  app.use(express.static(frontendDist));
  // Serve index.html for any non-API SPA routes
  app.get('*', (req, res) => {
    if (!req.path.startsWith('/api/')) {
      res.sendFile(path.join(frontendDist, 'index.html'));
    } else {
      res.status(404).json({ error: 'API route not found' });
    }
  });
} else {
  console.warn('Frontend static assets folder not found. Serving API endpoints only.');
}

ensureGeminiCliPatched();

// Start Express Server
app.listen(PORT, () => {
  console.log(`Backend server is running on http://localhost:${PORT}`);
});
