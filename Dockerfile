# Basis keeper — Node 22 (for node:sqlite), runs via tsx (no build step).
FROM node:22-slim

# Build deps for native modules (bigint-buffer, libsql native fallback). Cheap; pruned with apt list rm.
RUN apt-get update && apt-get install -y --no-install-recommends \
      python3 make g++ ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Pinned pnpm
RUN npm install -g pnpm@9

WORKDIR /app

# Workspace manifests first for better layer caching
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY shared/package.json shared/package.json
COPY keeper/package.json keeper/package.json
COPY web/package.json    web/package.json

# --no-frozen-lockfile so platform-specific optional deps (libsql linux-x64 binary)
# resolve fresh inside the Linux container instead of being skipped because the
# lockfile was originally generated on Windows.
RUN pnpm install --filter @basis/keeper... --no-frozen-lockfile

# Source — shared TS is consumed directly by tsx; Anchor IDL is vendored in keeper/idl
COPY shared ./shared
COPY keeper ./keeper

WORKDIR /app/keeper
ENV NODE_ENV=production
EXPOSE 3001

CMD ["pnpm", "exec", "tsx", "src/index.ts"]
