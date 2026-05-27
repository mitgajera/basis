#!/usr/bin/env bash
# Anchor vault deploy script — run in WSL
# Usage: ./scripts/deploy.sh [devnet|mainnet-beta]

set -e

CLUSTER="${1:-devnet}"
echo "Deploying to $CLUSTER..."

cd "$(dirname "$0")/../anchor"

# Build
anchor build

# Deploy
anchor deploy --provider.cluster "$CLUSTER"

# Print program ID
anchor keys list

echo "Done. Copy VAULT_PROGRAM_ID from above into .env"
