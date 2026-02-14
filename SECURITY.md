# Security Model

Engram enforces access through memory scopes.

## Core Rules

- Facts are stored with `scopeId`.
- Reads and writes are controlled by scope policy.
- Private scopes (`private-*`) are member-only.
- Shared scopes are explicitly membership-based unless `readPolicy="all"`.

## Routing Safety

- Agent routing notifications are created only from enriched facts.
- Notification consumption is by `agentId`.
- Removing a member from scope removes pending notifications for that scope.

## Isolation Guarantees

- No cross-scope recall without explicit scope permission.
- Multi-scope recall executes as fan-out across permitted scopes only.
- Dedup runs only on shared/team scopes, never private scopes.
