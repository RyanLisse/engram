# Task Template: Add New MCP Tool

**Last Updated**: 2026-02-15

**Purpose**: Depth-first template for adding a new MCP tool to Engram following golden principles.

**Estimated Time**: 80 minutes (design 15min, implementation 30min, testing 20min, docs 10min, validation 5min)

---

## Prerequisites

Before starting, ensure you have:

- [ ] Read `docs/GOLDEN-PRINCIPLES.md` (GP-001, GP-003, GP-004, GP-008)
- [ ] Understood tool-registry pattern from `mcp-server/src/lib/tool-registry.ts`
- [ ] Reviewed 2-3 similar tools for naming conventions
- [ ] Environment variables set (`CONVEX_URL`, `ENGRAM_AGENT_ID`, `COHERE_API_KEY`)
- [ ] Convex deployment accessible and healthy

---

## Task Breakdown (Depth-First)

### Phase 1: Design (15 minutes)

**Goal**: Define tool interface and behavior before writing any code.

- [ ] **1.1 Define Tool Purpose**
  - What single atomic operation does this tool perform?
  - Write one-sentence description (will become tool description)
  - Verify: Can this be composed with other tools? If not, it's too high-level.

- [ ] **1.2 Design Input Schema (Zod)**
  ```typescript
  // Example schema design
  const inputSchema = z.object({
    requiredField: z.string().describe("What it's for"),
    optionalField: z.string().optional().describe("When to use it"),
    scopeId: z.string().optional().describe("Defaults to agent's private scope")
  });
  ```
  - List all required parameters
  - List all optional parameters with defaults
  - Add `.describe()` for each field (used in API docs)

- [ ] **1.3 Define Output Format**
  ```typescript
  // Example output type
  type OutputType = {
    factId: string;
    success: boolean;
    metadata?: Record<string, any>;
  };
  ```
  - What does success look like?
  - What data does the caller need back?
  - Any error cases to document?

- [ ] **1.4 Identify Convex Functions**
  - Which Convex query/mutation/action will this call?
  - Does it exist? If not, create it first (separate task).
  - Add constant to `mcp-server/src/lib/convex-paths.ts` if new

- [ ] **1.5 Error Handling Strategy**
  - What can go wrong? (network, schema validation, Convex errors)
  - How should errors be surfaced to agent?
  - Any retryable operations?

**Checkpoint**: Review design with another agent or human. Ensure tool is atomic (<50 lines expected).

---

### Phase 2: Implementation (30 minutes)

**Goal**: Write the tool handler following golden principles.

- [ ] **2.1 Add Zod Schema to `tool-registry.ts`**
  ```typescript
  // File: mcp-server/src/lib/tool-registry.ts
  const memoryNewToolSchema = z.object({
    // ... paste schema from design phase
  });
  ```

- [ ] **2.2 Implement Handler Function**
  - Create new file: `mcp-server/src/tools/new-tool.ts`
  - Follow template:
  ```typescript
  import { z } from 'zod';
  import { getConvexClient } from '../lib/convex-client';
  import { PATHS } from '../lib/convex-paths';

  export async function handleNewTool(
    args: z.infer<typeof memoryNewToolSchema>,
    agentId: string
  ) {
    console.error('[new-tool] Starting...'); // GP-004, GP-005

    try {
      const convex = getConvexClient();

      // Call Convex using type-safe path (GP-002)
      const result = await convex.mutation(PATHS.newToolMutation, {
        ...args,
        agentId
      });

      console.error('[new-tool] Success:', result);
      return result;
    } catch (err) {
      console.error('[new-tool] Error:', err);
      throw err;
    }
  }
  ```

- [ ] **2.3 Register in `TOOL_REGISTRY`**
  ```typescript
  // File: mcp-server/src/lib/tool-registry.ts
  export const TOOL_REGISTRY: ToolRegistryEntry[] = [
    // ... existing tools
    {
      tool: {
        name: "memory_new_tool",
        description: "One-sentence description from design phase",
        inputSchema: zodToJsonSchema(memoryNewToolSchema)
      },
      zodSchema: memoryNewToolSchema,
      handler: handleNewTool
    }
  ];
  ```

- [ ] **2.4 Add to Category Exports** (if new category)
  ```typescript
  // Example: if this is a new "analysis" tool
  export const ANALYSIS_TOOLS = TOOL_REGISTRY.filter(t =>
    t.tool.name.startsWith('memory_analyze_')
  );
  ```

- [ ] **2.5 Verify TypeScript Compiles**
  ```bash
  cd mcp-server && npx tsc --noEmit
  ```
  - Zero errors expected
  - If errors, fix before proceeding

**Checkpoint**: Tool is registered and compiles. Ready for testing.

---

### Phase 3: Testing (20 minutes)

**Goal**: Ensure tool works correctly in isolation and with Convex backend.

- [ ] **3.1 Create Unit Test**
  - File: `mcp-server/src/tools/__tests__/new-tool.test.ts`
  - Template:
  ```typescript
  import { describe, it, expect, vi } from 'vitest';
  import { handleNewTool } from '../new-tool';

  describe('handleNewTool', () => {
    it('should call Convex with correct parameters', async () => {
      // Mock Convex client
      const mockMutation = vi.fn().mockResolvedValue({ success: true });
      vi.mock('../../lib/convex-client', () => ({
        getConvexClient: () => ({ mutation: mockMutation })
      }));

      const result = await handleNewTool(
        { requiredField: 'test' },
        'test-agent'
      );

      expect(mockMutation).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ requiredField: 'test', agentId: 'test-agent' })
      );
      expect(result.success).toBe(true);
    });

    it('should handle errors gracefully', async () => {
      // Mock error
      vi.mock('../../lib/convex-client', () => ({
        getConvexClient: () => ({
          mutation: vi.fn().mockRejectedValue(new Error('Network error'))
        })
      }));

      await expect(
        handleNewTool({ requiredField: 'test' }, 'test-agent')
      ).rejects.toThrow('Network error');
    });
  });
  ```

- [ ] **3.2 Run Unit Tests**
  ```bash
  cd mcp-server && npm test -- new-tool.test.ts
  ```
  - All tests pass

- [ ] **3.3 Integration Test via MCPorter**
  ```bash
  npx mcporter call engram.memory_new_tool \
    requiredField="integration test" \
    agentId="test-agent"
  ```
  - Verify success response
  - Check Convex dashboard for created data

- [ ] **3.4 Verify Tool Shows in List**
  ```bash
  npx mcporter list engram | grep memory_new_tool
  ```
  - Tool appears with correct description

**Checkpoint**: Tool is fully tested and working.

---

### Phase 4: Documentation (10 minutes)

**Goal**: Auto-generate API docs and add usage examples.

- [ ] **4.1 Regenerate API Reference**
  ```bash
  npx tsx scripts/generate-api-reference.ts
  ```
  - Verify `docs/API-REFERENCE.md` updated
  - Check that new tool appears with correct schema

- [ ] **4.2 Add Usage Example**
  - File: `docs/USAGE-EXAMPLES.md`
  - Template:
  ```markdown
  ### memory_new_tool

  **Purpose**: [One-sentence description]

  **Example**:
  \`\`\`typescript
  const result = await mcp.call('memory_new_tool', {
    requiredField: 'value',
    optionalField: 'value'
  });

  console.log('Created:', result.factId);
  \`\`\`

  **Use Cases**:
  - When you need to [use case 1]
  - To accomplish [use case 2]

  **See Also**: `memory_related_tool`, `memory_other_tool`
  ```

- [ ] **4.3 Update Tool Count in README**
  - File: `README.md`
  - Find: "MCP Tools (69)"
  - Replace with: "MCP Tools (70)" (or current count + 1)

- [ ] **4.4 Update CLAUDE.md Tool Count**
  - File: `CLAUDE.md`
  - Find: "69 tools"
  - Replace with: "70 tools"

**Checkpoint**: Documentation is complete and accurate.

---

### Phase 5: Validation (5 minutes)

**Goal**: Ensure no golden principles violations introduced.

- [ ] **5.1 Run Golden Principles Validation**
  ```bash
  npx tsx scripts/validate-golden-principles.ts
  ```
  - Zero new violations
  - If violations, fix before committing

- [ ] **5.2 Check Quality Grade**
  - New file should be Grade A
  - No critical or high violations

- [ ] **5.3 Run Full Test Suite**
  ```bash
  cd mcp-server && npm test
  ```
  - All existing tests still pass
  - New tests pass

- [ ] **5.4 Verify Convex Deploy**
  ```bash
  cd convex && npx convex deploy --preview
  ```
  - Schema changes (if any) deploy successfully
  - No runtime errors

**Checkpoint**: All validations pass. Ready to commit.

---

### Phase 6: PR & Merge (10 minutes)

**Goal**: Create well-documented PR for review.

- [ ] **6.1 Create Branch**
  ```bash
  git checkout -b feat/mcp-tool-new-tool
  ```

- [ ] **6.2 Stage Changes**
  ```bash
  git add mcp-server/src/lib/tool-registry.ts
  git add mcp-server/src/tools/new-tool.ts
  git add mcp-server/src/tools/__tests__/new-tool.test.ts
  git add docs/API-REFERENCE.md
  git add docs/USAGE-EXAMPLES.md
  git add README.md
  git add CLAUDE.md
  ```

- [ ] **6.3 Commit with Conventional Format**
  ```bash
  git commit -m "feat(mcp): add memory_new_tool

  - Implements atomic operation for [purpose]
  - Follows GP-001 (tool-registry), GP-003 (atomic), GP-004 (stderr)
  - Includes unit + integration tests
  - Auto-generated API reference updated

  Closes #123" # If related to issue
  ```

- [ ] **6.4 Push Branch**
  ```bash
  git push origin feat/mcp-tool-new-tool
  ```

- [ ] **6.5 Open PR**
  - Use GitHub PR template
  - Title: `feat(mcp): add memory_new_tool`
  - Labels: `mcp-tools`, `harness-engineering`, `enhancement`
  - Link to issue (if applicable)
  - Include before/after usage example

- [ ] **6.6 PR Checklist** (copy to PR description)
  ```markdown
  ## Checklist
  - [x] Tool is atomic (single operation)
  - [x] Follows GP-001 (registered in tool-registry.ts)
  - [x] Follows GP-003 (atomic primitive, <100 lines)
  - [x] Follows GP-004 (no stdout logging)
  - [x] Follows GP-008 (docs auto-generated)
  - [x] Follows GP-011 (unit + integration tests)
  - [x] Zero TypeScript errors
  - [x] All tests pass
  - [x] Golden principles validation passes
  - [x] Convex deploys successfully
  ```

**Checkpoint**: PR is open and ready for review. Expected review time: <30 minutes.

---

## Success Criteria

- [ ] Tool is registered in `tool-registry.ts` (GP-001)
- [ ] Tool is atomic (<100 lines) (GP-003)
- [ ] No stdout logging (GP-004)
- [ ] Uses type-safe Convex paths (GP-002)
- [ ] API reference auto-generated (GP-008)
- [ ] Unit + integration tests exist (GP-011)
- [ ] All tests pass
- [ ] Golden principles validation passes (Grade A)
- [ ] Tool appears in MCPorter list
- [ ] Documentation updated
- [ ] PR merged

---

## Common Pitfalls

1. **Forgetting to update tool count** in README.md and CLAUDE.md
2. **Not testing with MCPorter** before opening PR
3. **Console.log instead of console.error** (breaks MCP protocol)
4. **String literal Convex paths** instead of PATHS constants
5. **Workflow wrapper instead of atomic primitive**

---

## Time Tracking

| Phase | Estimated | Actual |
|-------|-----------|--------|
| Design | 15 min | |
| Implementation | 30 min | |
| Testing | 20 min | |
| Documentation | 10 min | |
| Validation | 5 min | |
| PR & Merge | 10 min | |
| **Total** | **90 min** | |

---

## Next Steps After Merge

- [ ] Announce new tool to team
- [ ] Update Engram skill documentation
- [ ] Add to OpenClaw plugin exports (if applicable)
- [ ] Consider: Does this tool enable new workflows? Document them.

---

## Template Metadata

- **Version**: 1.0.0
- **Last Updated**: 2026-02-15
- **Maintainer**: Harness Engineering Team
- **Feedback**: Open issue with label `task-template`
