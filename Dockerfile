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

# Setup backend runtime dependencies and build sqlite3 from source to avoid GLIBC compatibility issues
WORKDIR /app/backend
COPY backend/package*.json ./
RUN apt-get update && apt-get install -y git ca-certificates python3 make g++ --no-install-recommends \
    && npm ci --only=production \
    && npm rebuild sqlite3 --build-from-source \
    && apt-get purge -y python3 make g++ \
    && apt-get autoremove -y \
    && rm -rf /var/lib/apt/lists/*

# Trust system CA certificates for HTTPS git clone on Cloud Run
ENV GIT_SSL_CAINFO=/etc/ssl/certs/ca-certificates.crt

# Copy compiled backend code
COPY --from=backend-builder /app/backend/dist ./dist

# Copy compiled frontend assets
COPY --from=frontend-builder /app/frontend/dist /app/frontend/dist

# Expose default backend Express port (Cloud Run will override with $PORT env var)
EXPOSE 5000
ENV PORT=5000

# Start Express application serving both API and frontend
CMD ["node", "dist/server.js"]
