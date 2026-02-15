#!/bin/bash
#
# validate-memory-ops.sh
# Validates destructive memory operations before execution
#

INPUT=$(cat)
TOOL_NAME=$(echo "$INPUT" | jq -r '.tool_name')

# List of destructive memory operations
DESTRUCTIVE_TOOLS=(
  "memory_delete_fact"
  "memory_delete_entity"
  "memory_delete_scope"
  "memory_delete_conversation"
  "memory_delete_session"
  "memory_delete_theme"
  "memory_prune"
  "memory_mark_facts_pruned"
)

for tool in "${DESTRUCTIVE_TOOLS[@]}"; do
  if [[ "$TOOL_NAME" == "$tool" ]]; then
    echo "⚠️  WARNING: $TOOL_NAME is a destructive operation." >&2
    echo "Review the operation carefully. Memory deletion is permanent." >&2

    # Exit 0 to allow with warning (recommended)
    # Change to exit 2 to block and require explicit approval
    exit 0
  fi
done

# Not a destructive operation, allow
exit 0
