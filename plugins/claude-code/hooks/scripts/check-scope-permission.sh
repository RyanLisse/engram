#!/bin/bash
#
# check-scope-permission.sh
# Validates agent has permission to access requested scope
#

INPUT=$(cat)
SCOPE_ID=$(echo "$INPUT" | jq -r '.tool_input.scopeId // empty')

# If no scope specified, allow (will use default scope)
if [[ -z "$SCOPE_ID" ]]; then
  exit 0
fi

# Get agent's accessible scopes
AGENT_INFO=$(npx mcporter call engram.memory_get_agent_info 2>/dev/null)
if [[ $? -ne 0 ]]; then
  # If we can't check permissions, allow but warn
  echo "Warning: Could not verify scope permissions" >&2
  exit 0
fi

AGENT_SCOPES=$(echo "$AGENT_INFO" | jq -r '.result.scopes[]?' 2>/dev/null)

# Check if requested scope is in agent's scope list
if echo "$AGENT_SCOPES" | grep -q "^${SCOPE_ID}$"; then
  # Agent has access
  exit 0
else
  # Block the operation
  echo "❌ Blocked: Agent does not have access to scope '$SCOPE_ID'" >&2
  echo "Available scopes: $AGENT_SCOPES" >&2
  exit 2
fi
