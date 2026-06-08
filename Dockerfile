# ==========================================
# Stage 1: Build Frontend Assets
# ==========================================
FROM node:20-slim AS frontend-builder
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm install
COPY frontend/ ./
RUN npm run build

# ==========================================
# Stage 2: Compile Backend TS Code
# ==========================================
FROM node:20-slim AS backend-builder
WORKDIR /app/backend
COPY backend/package*.json ./
RUN npm install
COPY backend/ ./
RUN npm run build

# ==========================================
# Stage 3: Runner Container
# ==========================================
FROM node:20-slim AS runner
WORKDIR /app

# Copy backend dependencies and built output
COPY --from=backend-builder /app/backend/package*.json ./backend/
WORKDIR /app/backend
RUN npm install --omit=dev

COPY --from=backend-builder /app/backend/dist ./dist

# Copy compiled frontend to expected location
COPY --from=frontend-builder /app/frontend/dist /app/frontend/dist

# Setup backend runtime dependencies and build sqlite3 from source to avoid GLIBC compatibility issues
# RUN apt-get update && apt-get install -y git ca-certificates
RUN apt-get update && apt-get install -y \
    git \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Trust system CA certificates for HTTPS git clone on Cloud Run
ENV GIT_SSL_CAINFO=/etc/ssl/certs/ca-certificates.crt

# Expose default backend Express port (Cloud Run will override with $PORT env var)
EXPOSE 5000
ENV PORT=5000

# Start Express application serving both API and frontend
CMD ["node", "dist/server.js"]
