#!/usr/bin/env bash
# Engram × OpenClaw — One-line installer
# Usage: bash ~/.openclaw/workspace/scripts/engram-install.sh
set -euo pipefail

ENGRAM_DIR="${ENGRAM_DIR:-$HOME/Tools/engram}"
EXT_DIR="$HOME/.openclaw/extensions/engram"
AGENT="${ENGRAM_AGENT_ID:-cammy}"
CONFIG="$HOME/.openclaw/openclaw.json"

echo "🧠 Engram × OpenClaw Installer"
echo "==============================="

# Prerequisites
echo -n "Prerequisites..."
for cmd in node mcporter jq; do command -v $cmd >/dev/null || { echo " ❌ $cmd missing"; exit 1; }; done
[ -d "$ENGRAM_DIR" ] || { echo " ❌ $ENGRAM_DIR not found"; exit 1; }
echo " ✅"

# Deploy Convex
echo -n "Convex deploy..."
cd "$ENGRAM_DIR"
CONVEX_URL=$(grep CONVEX_URL .env.local 2>/dev/null | head -1 | cut -d= -f2)
[ -n "$CONVEX_URL" ] || { echo " ❌ No CONVEX_URL in .env.local"; exit 1; }
npx convex dev --once >/dev/null 2>&1
echo " ✅"

# Build + install plugin
echo -n "Plugin build..."
cd "$ENGRAM_DIR/plugins/openclaw" && npm run build >/dev/null 2>&1
echo " ✅"
echo -n "Plugin install..."
mkdir -p "$EXT_DIR/openclaw-plugin"
rsync -a "$ENGRAM_DIR/plugins/openclaw/" "$EXT_DIR/openclaw-plugin/" --exclude node_modules
[ -f "$EXT_DIR/openclaw.plugin.json" ] || cp "$ENGRAM_DIR/plugins/openclaw/openclaw.plugin.json" "$EXT_DIR/"
echo " ✅"

# Patch config
echo -n "Config..."
if ! jq -e '.plugins.entries.engram' "$CONFIG" >/dev/null 2>&1; then
  jq --arg u "$CONVEX_URL" --arg a "$AGENT" \
    '.plugins.entries.engram={"enabled":true,"config":{"agentId":$a,"convexUrl":$u}} |
     .plugins.allow=((.plugins.allow//[]) | if index("engram") then . else .+["engram"] end) |
     .plugins.load.paths=((.plugins.load.paths//[]) | if any(endswith("extensions/engram")) then . else .+[env.HOME+"/.openclaw/extensions/engram"] end)' \
    "$CONFIG" > "${CONFIG}.tmp" && mv "${CONFIG}.tmp" "$CONFIG"
  echo " ✅ (patched)"
else
  echo " ✅ (exists)"
fi

# Bootstrap memories
echo ""
echo "📥 Bootstrapping memories..."
export CONVEX_URL ENGRAM_AGENT_ID="$AGENT"
SYNC="$HOME/.openclaw/workspace/scripts/engram-sync.mjs"
[ -f "$SYNC" ] && node "$SYNC" || echo "  (no sync script, skipping)"

# Verify
echo -n "Verify..."
R=$(cd "$ENGRAM_DIR" && mcporter call --stdio "node mcp-server/dist/index.js" memory_recall query=test limit:1 2>&1)
echo "$R" | jq -e '.facts' >/dev/null 2>&1 && echo " ✅" || echo " ⚠️"

echo ""
echo "✅ Done! Restart OpenClaw to activate."
echo "   openclaw gateway restart"
