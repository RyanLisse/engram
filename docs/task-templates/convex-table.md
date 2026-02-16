# Task Template: Add Convex Table

## 1) Design
- [ ] Define fields and validators in `convex/schema.ts`
- [ ] Define indexes/search/vector indexes for expected queries
- [ ] Define retention and lifecycle expectations

## 2) Backend API
- [ ] Add `convex/functions/<domain>.ts` queries/mutations/actions
- [ ] Keep functions atomic and composable
- [ ] Add access control checks where relevant

## 3) MCP Integration
- [ ] Add path constants in `mcp-server/src/lib/convex-paths.ts`
- [ ] Add wrapper(s) in `mcp-server/src/lib/convex-client.ts`
- [ ] Add tool(s) + schemas in `mcp-server/src/lib/tool-registry.ts`

## 4) Validation
- [ ] Run `npx tsc --noEmit` (mcp-server)
- [ ] Run `npx tsx scripts/validate-golden-principles.ts`
- [ ] Ensure no critical/high violations introduced
