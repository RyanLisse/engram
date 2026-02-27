---
title: feat: Cross-Agent Engram MCP Enforcement
type: feat
date: 2026-02-27
---

# feat: Cross-Agent Engram MCP Enforcement

## Overview

Enforce a single Engram MCP contract across Claude Code, OpenCode, Gemini CLI, Factory Droid, and Pi-adjacent workflows so every agent starts with validated memory connectivity, consistent config, and drift detection.

This plan standardizes:
- one canonical MCP definition,
- generated per-client config artifacts,
- hard startup preflight wrappers (`memory_health` gate),
- CI/runtime drift verification,
- Pi fallback via sidecar/skill-based adapter.

## Problem Statement

Current integration is strong but fragmented:
- per-client setup scripts/docs exist, but no global canonical config authority,
- only Codex currently has enforced startup preflight,
- drift checks exist in pieces (golden-principles + reloaderoo verification docs) but not as one cross-client enforcement pipeline,
- Pi lacks native MCP assumptions and needs explicit treatment.

Impact:
- inconsistent startup behavior across clients,
- risk of silent MCP misconfiguration,
- weak guarantees that all agents are operating with active Engram memory.

## Proposed Solution

Implement a policy + tooling layer that makes Engram connectivity mandatory and verifiable for all supported agent clients.

### Core design

1. **Single source of truth (SoT)**
   - Add one canonical MCP definition file for Engram (command, args, env contract, health policy).
2. **Config generation**
   - Generate target artifacts from SoT:
     - `.mcp.json` (Claude/Codex compatible)
     - `opencode.json`
     - `.gemini/settings.json` template
     - `.factory/mcp.json`
3. **Preflight wrappers (required)**
   - Add launch wrappers for each client that:
     - validate `CONVEX_URL`, `ENGRAM_AGENT_ID`
     - check MCP reachability with `memory_health`
     - block startup on failure
4. **Continuous verification**
   - Add CI checks for:
     - MCP server-info/tool-list smoke checks (via reloaderoo)
     - config artifact drift against SoT
5. **Pi strategy**
   - Introduce adapter pattern:
     - either sidecar process speaking MCP for Pi,
     - or non-MCP wrapper/skill flow with explicit memory checks.

## Technical Approach

### Architecture

```text
Canonical MCP SoT (repo)
  -> config generator
      -> .mcp.json / opencode.json / .gemini/settings.json tmpl / .factory/mcp.json
  -> startup wrappers (claude/opencode/gemini/droid/codex)
      -> env validation
      -> reloaderoo call-tool memory_health
      -> launch target client
  -> CI verification
      -> reloaderoo inspect server-info/list-tools/call-tool memory_health
      -> drift check: generated artifacts == committed artifacts
  -> Pi adapter
      -> sidecar MCP bridge OR skill-based non-MCP preflight
```

### Key file targets

- Canonical/config generation:
  - `plugins/claude-code/.mcp.json:1`
  - `plugins/opencode/setup.sh:1`
  - `plugins/gemini-cli/setup.sh:1`
  - `docs/setup/FACTORY-DROID-SETUP.md:1`
- Existing enforcement baseline:
  - `scripts/start-codex-with-engram.sh:1`
- Drift/quality checks:
  - `scripts/validate-golden-principles.ts:1`
  - `agents/cleanup/drift-detector.ts:1`

## Implementation Phases

### Phase 1: Canonical Contract + Generator

- Add canonical MCP spec file (e.g. `config/engram-mcp.contract.json`).
- Add generator script (e.g. `scripts/generate-mcp-client-configs.ts`) that outputs per-client configs/templates.
- Add idempotent generation command in root scripts.

**Deliverables**
- Canonical contract file.
- Deterministic generated outputs for all clients.
- README/setup docs linking to generation path.

**Success criteria**
- Re-running generator creates no diff when unchanged.

### Phase 2: Wrapper Enforcement for All Clients

- Add wrappers:
  - `scripts/start-claude-with-engram.sh`
  - `scripts/start-opencode-with-engram.sh`
  - `scripts/start-gemini-with-engram.sh`
  - `scripts/start-droid-with-engram.sh`
- Reuse common preflight helper script (avoid copy-paste drift).
- Ensure wrappers fail-fast with clear messaging and consistent exit codes.

**Success criteria**
- Every wrapper blocks launch when `memory_health` fails.
- Every wrapper launches client when health passes.

### Phase 3: CI + Drift Verification

- Add CI job (or extend existing quality job) to run:
  - `reloaderoo inspect server-info`
  - `reloaderoo inspect list-tools`
  - `reloaderoo inspect call-tool memory_health`
- Add config drift check:
  - regenerate artifacts in CI,
  - fail when generated output differs from committed files.

**Success criteria**
- PR fails if MCP health smoke checks fail.
- PR fails if config artifacts drift from SoT.

### Phase 4: Pi Adapter Strategy

- Document and implement one path:
  - **Option A (preferred):** Pi sidecar MCP bridge,
  - **Option B:** Pi startup wrapper + skill-level required memory preflight.
- Add explicit constraints and fallback behavior in docs.

**Success criteria**
- Pi workflow has a deterministic, tested preflight path.

### Phase 5: Documentation + Rollout

- Update setup docs for each client with wrapper-first flow.
- Update AGENTS policy for mandatory launch wrappers and session behavior.
- Add troubleshooting matrix per client.

**Success criteria**
- Setup docs converge to one standard pattern.

## SpecFlow Findings Integrated

Addressed gaps from spec-flow analysis:

- **Drift definition**
  - Define drift as: contract hash mismatch, required env key mismatch, or invalid MCP command/args.
- **Failure behavior**
  - Differentiate transient infra failure (retryable) vs invalid config (hard block).
- **Rollback policy**
  - Use last-known-good generated config for wrappers where supported.
- **Security**
  - No secrets committed in generated templates; env-only secret injection.
- **Platform acceptance criteria**
  - Separate verification checklist for Claude/OpenCode/Gemini/Droid/Pi.

## Acceptance Criteria

### Functional

- [ ] Canonical Engram MCP contract exists and is authoritative.
- [ ] Config generator outputs all required client artifacts.
- [ ] All wrappers perform env + `memory_health` preflight and enforce block on failure.
- [ ] CI runs reloaderoo MCP smoke checks and fails on errors.
- [ ] CI fails on generated-config drift.
- [ ] Pi has documented + implemented adapter strategy.

### Non-Functional

- [ ] Wrapper startup overhead stays under 2 seconds in healthy path.
- [ ] Error messages are actionable and include remediation command.
- [ ] No secrets are hard-coded in committed generated artifacts.

### Quality Gates

- [ ] `cd mcp-server && npm run build` passes.
- [ ] `cd mcp-server && npm test` passes.
- [ ] `cd dashboard && npm run build` passes.
- [ ] New wrapper shell scripts pass `bash -n`.

## Beads Workflow (Requested)

### Epic
- `engram-<new>`: Cross-agent MCP enforcement and drift-proof startup

### Bead Breakdown

1. `engram-<new>.1` (P1) — Add canonical MCP contract schema + example
2. `engram-<new>.2` (P1) — Implement deterministic config generator
3. `engram-<new>.3` (P1) — Add shared preflight helper script
4. `engram-<new>.4` (P1) — Add `start-claude-with-engram.sh`
5. `engram-<new>.5` (P1) — Add `start-opencode-with-engram.sh`
6. `engram-<new>.6` (P1) — Add `start-gemini-with-engram.sh`
7. `engram-<new>.7` (P1) — Add `start-droid-with-engram.sh`
8. `engram-<new>.8` (P1) — Add CI reloaderoo smoke checks
9. `engram-<new>.9` (P1) — Add config drift CI check
10. `engram-<new>.10` (P2) — Implement Pi sidecar/adapter strategy
11. `engram-<new>.11` (P2) — Docs consolidation for all clients
12. `engram-<new>.12` (P2) — E2E verification across wrappers + CI + docs

### Dependency Order

- `.1 -> .2 -> (.3 -> .4/.5/.6/.7 in parallel) -> .8/.9 -> .10 -> .11 -> .12`

### Suggested Initial Commands

- `bd create "feat: Cross-agent MCP enforcement epic" -t epic -p 0`
- `bd create "Phase 1: canonical MCP contract" -p 1 --depends-on <epic>`
- `bd create "Phase 2: config generator" -p 1 --depends-on <contract>`
- Use `bv --robot-plan` after seed beads to optimize parallel execution.

## Risks and Mitigation

- **Risk:** External CLI config format changes.
  - **Mitigation:** Keep per-client generator modules versioned and test fixtures updated.
- **Risk:** Startup friction from strict preflight.
  - **Mitigation:** Fast retries + clear fallback messages + optional override for emergency debugging.
- **Risk:** Pi integration ambiguity.
  - **Mitigation:** Declare adapter contract early; treat Pi as separate integration class.

## References & Research

### Internal
- `docs/brainstorms/2026-02-25-entire-opencode-extraction-ideas.md:1`
- `docs/brainstorms/2026-02-12-multi-agent-integration-patterns.md:1`
- `docs/SHARED-AGENT-IDENTITY.md:1`
- `docs/setup/MULTI-PLATFORM-SETUP.md:1`
- `scripts/start-codex-with-engram.sh:1`
- `scripts/validate-golden-principles.ts:1`
- `agents/cleanup/drift-detector.ts:1`
- `docs/RELOADEROO-VERIFICATION-RESULTS.md:1`

### External
- Claude Code MCP docs: https://docs.anthropic.com/en/docs/claude-code/mcp
- OpenCode MCP docs: https://opencode.ai/docs/mcp-servers/
- OpenCode CLI docs: https://opencode.ai/docs/cli/
- Gemini CLI docs: https://geminicli.com/docs/
- Gemini MCP setup: https://geminicli.com/docs/cli/tutorials/mcp-setup/
- Factory MCP config docs: https://docs.factory.ai/cli/configuration/mcp
- Pi reference: https://shittycodingagent.ai/

## Open Questions

1. Should wrappers support an explicit `--allow-offline` bypass mode for incidents?
2. Do we want automatic rollback to last-known-good config in all wrappers or only selected clients?
3. Is Pi sidecar maintained in this repo or externalized as its own package?

