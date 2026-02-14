---
title: "feat: Phase 4 - Scope Management & Security Hardening"
type: feat
date: 2026-02-14
parent: 2026-02-12-feat-multi-agent-integration-patterns-plan.md
---

# Phase 4: Scope Management & Security Hardening

## Overview

Final security audit and hardening of all cross-agent flows introduced in Phases 1-3. Ensure no information leakage, proper permission enforcement, and safe scope management.

**Parent Plan:** `2026-02-12-feat-multi-agent-integration-patterns-plan.md` (Phase 4)

## Goals

1. Audit all cross-agent data flows for security vulnerabilities
2. Ensure scope boundaries are enforced at server-side
3. Prevent unauthorized scope membership changes
4. Clean up orphaned notifications when agents leave scopes

## Security Audit Checklist

### Routing Action (Phase 2)

- [ ] **R1:** Routing checks `readPolicy` before notifying
  - Verify: Only agents with read access to fact's scope get notified
  - Test: Agent without scope access should NOT receive notification

- [ ] **R2:** Notifications cannot leak fact content
  - Verify: Notification only contains factId + reason, not content
  - Test: Read notification without scope access → should fail on fact fetch

- [ ] **R3:** Routing skips fact creator
  - Verify: Agent who stored fact doesn't get notified about it
  - Test: Store fact, check notifications → should be empty

### Scope Access Control

- [ ] **S1:** Outer ring agents cannot access shared-personal scope
  - Verify: Non-inner-circle agents can't read/write shared-personal
  - Test: Register agent with isInnerCircle=false → should not be in members

- [ ] **S2:** Admin policy prevents unauthorized membership changes
  - Verify: Only creator can add members when adminPolicy="creator"
  - Test: Non-creator tries addMember → should throw error

- [ ] **S3:** Session summaries follow standard scope permissions
  - Verify: memory_end_session respects scope readPolicy
  - Test: Agent without scope access can't read session summaries

### Deduplication Safety (Phase 3)

- [ ] **D1:** Dedup only operates within shared scopes
  - Verify: Private scope facts never get merged with other agents' facts
  - Test: Create similar facts in private scopes → should NOT merge

- [ ] **D2:** Dedup preserves provenance
  - Verify: Merged facts track contributingAgents and mergedContent
  - Test: After merge, check winner has both agents, loser content preserved

## Implementation Checklist

### Scope Management

- [ ] Add `getByName` public query (Task #27)
  - Expose scope lookup by name
  - Currently only available as internal query
  - Update `convex/functions/scopes.ts`

- [ ] Clean up notifications on member removal (Task #28)
  - When agent removed from scope, delete their notifications for facts in that scope
  - Update `convex/functions/scopes.ts` removeMember
  - Prevents notification leakage after access revoked

### Security Testing

Create test script: `tests/security-audit.ts`

```typescript
// Test R1: Routing respects scope access
async function testRoutingRespectsScopeAccess() {
  // 1. Create private scope for agent A
  // 2. Agent A stores high-importance fact
  // 3. Wait for routing
  // 4. Check agent B (not in scope) has NO notification
}

// Test S1: Outer ring can't access shared-personal
async function testOuterRingIsolation() {
  // 1. Register outer ring agent (isInnerCircle=false)
  // 2. Try to read facts from shared-personal scope
  // 3. Should fail with permission error
}

// Test D1: Private scope facts never merge across agents
async function testPrivateScopeIsolation() {
  // 1. Agent A creates fact in private-agent-a
  // 2. Agent B creates identical fact in private-agent-b
  // 3. Run dedup cron
  // 4. Both facts should remain (no merge)
}
```

## Acceptance Criteria

- [ ] All 8 security tests pass
- [ ] Scope-based access control enforced server-side (no client filtering)
- [ ] Admin policy prevents unauthorized membership changes
- [ ] Notifications cleaned up when agent loses scope access
- [ ] No information leakage in cross-agent flows

## Threat Model

### Threat: Notification Content Leakage

**Attack:** Malicious agent receives notification, extracts factId, tries to read fact content without scope access

**Mitigation:**
- Notifications only contain factId + reason (no content)
- Fact retrieval enforces scope permissions
- Even with factId, agent can't read without access

### Threat: Scope Privilege Escalation

**Attack:** Agent tries to add themselves to restricted scope

**Mitigation:**
- addMember checks adminPolicy before allowing changes
- Only creator/members can modify membership (depending on policy)
- Server-side enforcement (no client-side checks)

### Threat: Cross-Scope Information Leakage via Dedup

**Attack:** Agent creates similar fact in private scope, gets merged with fact from shared scope, gains access to shared content via mergedContent

**Mitigation:**
- Dedup ONLY operates within shared scopes
- Private scope facts never compared cross-agent
- Safety guard: skip scopes with readPolicy="members" and members.length==1

### Threat: Notification Persistence After Access Revocation

**Attack:** Agent removed from scope but still has old notifications with factIds

**Mitigation:**
- removeMember cleans up notifications for that scope
- Expired notifications deleted by cron (30 days)
- Even with old factId, can't read fact without scope access

## Rollback Plan

If security issues found:
1. Disable affected feature (routing/dedup) via cron toggle
2. Review and fix vulnerability
3. Re-enable with additional tests

## Documentation

After security audit:
- [ ] Update SECURITY.md with scope access model
- [ ] Document admin policy options in SCOPES.md
- [ ] Add security testing guide in tests/README.md

## Related Files

- Parent: `docs/plans/2026-02-12-feat-multi-agent-integration-patterns-plan.md`
- Scope safety spec: `docs/plans/SCOPE-SAFETY-SPEC.md`
- Schema: `convex/schema.ts`
- Scope functions: `convex/functions/scopes.ts`
