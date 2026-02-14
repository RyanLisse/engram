#!/usr/bin/env bash
set -euo pipefail

echo "== Preflight =="
node -e 'console.log("node ok")'

echo "== Build/Test =="
(cd mcp-server && bun run build && bun test)

echo "== Convex codegen =="
npm run convex:codegen

echo "== Beads status =="
bd ready
bd stats

echo "== Git state =="
git status --short --branch

echo "Verification complete"
