# ----------------------------------------------------
# Anti_Shel - Native Antigravity Dashboard Dockerfile
# ----------------------------------------------------
FROM node:22-alpine

WORKDIR /app

# Install git for repository inspection
RUN apk add --no-cache git

# Copy package descriptors
COPY package*.json ./

# Copy source code, assets and credentials
COPY src/ ./src/
COPY public/ ./public/
COPY credentials/ ./credentials/

# Default environment variables
ENV NODE_ENV=production
ENV PORT=3333
ENV PROJECTS_DIR=/projects
ENV ANTIGRAVITY_DATA_DIR=/antigravity-data
ENV CREDENTIALS_DIR=/app/credentials

# Expose Web UI port
EXPOSE 3333

# Start the native server
CMD ["node", "src/server.mjs"]
