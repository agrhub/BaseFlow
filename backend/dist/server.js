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
const dotenv_1 = __importDefault(require("dotenv"));
const path = __importStar(require("path"));
dotenv_1.default.config({ path: path.resolve(__dirname, '..', '.env') });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const cookie_parser_1 = __importDefault(require("cookie-parser"));
const express_session_1 = __importDefault(require("express-session"));
const fs = __importStar(require("fs"));
// Import modular routers
const auth_1 = __importDefault(require("./routes/auth"));
const connections_1 = __importDefault(require("./routes/connections"));
const scan_1 = __importDefault(require("./routes/scan"));
const chat_1 = __importDefault(require("./routes/chat"));
const devops_1 = __importDefault(require("./routes/devops"));
const diagrams_1 = __importDefault(require("./routes/diagrams"));
const documents_1 = __importDefault(require("./routes/documents"));
const app = (0, express_1.default)();
const PORT = process.env.PORT || 5000;
// CORS configuration supporting credentials sharing during local hot-reloads
app.use((0, cors_1.default)({
    origin: true,
    credentials: true
}));
app.use(express_1.default.json({ limit: '50mb' }));
app.use(express_1.default.urlencoded({ extended: true, limit: '50mb' }));
app.use((0, cookie_parser_1.default)());
// Session setup
app.use((0, express_session_1.default)({
    secret: '858SGTUyX8w1L6JNm1m93Cvm8uX1QX2D',
    resave: true,
    saveUninitialized: true,
    cookie: {
        maxAge: 24 * 60 * 60 * 1000 // 1 day
    }
}));
// Route guard middleware for authenticated operations
const authMiddleware = (req, res, next) => {
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
app.use('/api/auth', auth_1.default);
app.use('/api/connections', connections_1.default);
app.use('/api', scan_1.default);
app.use('/api', chat_1.default);
app.use('/api', devops_1.default);
app.use('/api', diagrams_1.default);
app.use('/api', documents_1.default);
// Serve frontend static assets in production
const distPaths = [
    path.resolve(__dirname, '..', '..', 'frontend', 'dist'), // relative to src/server.ts inside backend
    path.resolve(__dirname, '..', 'frontend', 'dist'), // relative to dist/server.js inside backend
    path.resolve(__dirname, 'public'), // fallback public folder in backend
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
    app.use(express_1.default.static(frontendDist));
    // Serve index.html for any non-API SPA routes
    app.get('*', (req, res) => {
        if (!req.path.startsWith('/api/')) {
            res.sendFile(path.join(frontendDist, 'index.html'));
        }
        else {
            res.status(404).json({ error: 'API route not found' });
        }
    });
}
else {
    console.warn('Frontend static assets folder not found. Serving API endpoints only.');
}
// Start Express Server
app.listen(PORT, () => {
    console.log(`Backend server is running on http://localhost:${PORT}`);
});
