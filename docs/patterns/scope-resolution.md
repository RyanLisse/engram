# Scope Resolution Pattern

## Principle
Resolve scope name → ID before any scoped operation. Private scope is the default.

## Scope Naming Convention
```
private-{agentId}     → Agent's private memory
shared-personal       → Inner circle agents (isInnerCircle: true)
project-{name}        → Project-specific shared memory
team-{name}           → Team-level shared memory
global                → All agents can read
```

## Resolution Flow
```
Agent provides scopeId (name or ID)
        ↓
  Is it a Convex ID? ──yes──→ Use directly
        ↓ no
  Query scopes.getByName(name)
        ↓
  Found? ──no──→ Error: "Resolve scope with memory_resolve_scopes first"
        ↓ yes
  Check agent membership
        ↓
  Has access? ──no──→ Error: "Agent may not have write access"
        ↓ yes
  Proceed with operation
```

## Implementation
- `memory_resolve_scopes` — Resolves name→ID, or returns all permitted scopes
- `convex/functions/scopes.ts:getByName` — Name lookup
- `convex/functions/scopes.ts:getPermitted` — Agent access list
- `convex/functions/scopes.ts:checkWriteAccessHelper` — Write permission check

## Common Mistakes
1. Passing scope name where scope ID is expected → Use `memory_resolve_scopes` first
2. Assuming agent has write access to shared scopes → Check with `memory_get_agent_info`
3. Creating facts without scope → Always resolves to `private-{agentId}`
