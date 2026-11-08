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
import { getSecurityConfig, isProduction } from './utils/security';

// Validate security configuration before doing anything else (throws in production on insecure config)
let securityConfig: ReturnType<typeof getSecurityConfig>;
try {
  securityConfig = getSecurityConfig();
} catch (err: any) {
  console.error(err.message || err);
  process.exit(1);
}

// TypeScript session field extension
declare module 'express-session' {
  interface SessionData {
    loggedIn?: boolean | null;
  }
}

const app = express();
const PORT = process.env.PORT || 5000;

// Behind Cloud Run / reverse proxies: needed for secure cookies and correct client IPs
app.set('trust proxy', 1);
app.disable('x-powered-by');

// Basic security headers (no extra dependency needed)
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  if (isProduction) {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  if (req.path.startsWith('/api/')) {
    res.setHeader('Cache-Control', 'no-store');
  }
  next();
});

// CORS: only explicitly allowed origins may send credentialed requests.
// The SPA is served from the same origin (or through the Vite proxy in dev), so CORS is rarely needed.
app.use(cors({
  origin: (origin, callback) => {
    if (!origin || securityConfig.corsOrigins.includes(origin)) {
      return callback(null, true);
    }
    return callback(null, false);
  },
  credentials: true
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());

// Session setup
app.use(session({
  name: 'baseflow.sid',
  secret: securityConfig.sessionSecret,
  resave: false,
  saveUninitialized: false,
  rolling: true,
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    secure: isProduction ? 'auto' : false,
    maxAge: 24 * 60 * 60 * 1000 // 1 day
  }
}));

// CSRF defence-in-depth: state-changing API calls must come from an allowed origin
app.use((req, res, next) => {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method) || !req.path.startsWith('/api/')) {
    return next();
  }
  const origin = req.get('origin');
  if (!origin) return next(); // same-origin requests from older browsers / non-browser clients
  const host = req.get('x-forwarded-host') || req.get('host');
  let sameOrigin = false;
  try {
    sameOrigin = new URL(origin).host === host;
  } catch {
    sameOrigin = false;
  }
  if (sameOrigin || securityConfig.corsOrigins.includes(origin)) {
    return next();
  }
  return res.status(403).json({ error: 'Cross-origin request blocked' });
});

// Route guard middleware for authenticated operations
const authMiddleware = (req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (req.method === 'OPTIONS') {
    return next();
  }
  if (!req.session.loggedIn) {
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
