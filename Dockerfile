# Basis keeper — Node 22 (for node:sqlite), runs via tsx (no build step).
FROM node:22-slim

# Pinned pnpm
RUN npm install -g pnpm@9

WORKDIR /app

# Workspace manifests first for better layer caching
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY shared/package.json shared/package.json
COPY keeper/package.json keeper/package.json
COPY web/package.json    web/package.json

# Install only the keeper + its workspace deps (shared); skip web entirely
RUN pnpm install --filter @basis/keeper...

# Source — shared TS is consumed directly by tsx; Anchor IDL is vendored in keeper/idl
COPY shared ./shared
COPY keeper ./keeper

WORKDIR /app/keeper
ENV NODE_ENV=production
EXPOSE 3001

CMD ["pnpm", "exec", "tsx", "src/index.ts"]
