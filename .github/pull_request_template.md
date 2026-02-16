# Pull Request

## Description

<!-- Provide a brief description of the changes -->

## Type of Change

<!-- Check all that apply -->

- [ ] 🐛 Bug fix (non-breaking change that fixes an issue)
- [ ] ✨ New feature (non-breaking change that adds functionality)
- [ ] 💥 Breaking change (fix or feature that would cause existing functionality to not work as expected)
- [ ] 📚 Documentation update
- [ ] 🤖 Automated cleanup (harness engineering)
- [ ] 🎨 Code refactoring
- [ ] ⚡ Performance improvement
- [ ] 🧪 Test update

## Changes Made

<!-- List the key changes -->

-
-
-

## Golden Principles Compliance

<!-- Verify compliance with golden principles -->

- [ ] **GP-001**: Tool registry is single source of truth
- [ ] **GP-003**: Tools are atomic primitives (<100 lines)
- [ ] **GP-004**: No stdout logging in MCP server
- [ ] **GP-005**: Structured logging with [component] prefix
- [ ] **GP-008**: API reference auto-generated (not manual)
- [ ] **GP-011**: Unit + integration tests included

## Testing

<!-- Describe testing performed -->

- [ ] Unit tests pass (`npm test`)
- [ ] Integration tests pass
- [ ] Manual testing completed
- [ ] Golden principles validation passes

### Test Commands

```bash
# Commands used to verify changes
npx tsx scripts/validate-golden-principles.ts
cd mcp-server && npm test
```

## Documentation

<!-- Documentation updates -->

- [ ] Code comments added/updated
- [ ] API reference regenerated (if applicable)
- [ ] README updated (if applicable)
- [ ] Institutional learnings documented (if gotcha/lesson)

## Quality Check

<!-- Auto-populated by GitHub Actions -->

Golden Principles Validation will run automatically and comment on this PR.

## Checklist

- [ ] My code follows the style guidelines of this project
- [ ] I have performed a self-review of my code
- [ ] I have commented my code, particularly in hard-to-understand areas
- [ ] My changes generate no new warnings
- [ ] I have added tests that prove my fix is effective or that my feature works
- [ ] New and existing unit tests pass locally with my changes
- [ ] Any dependent changes have been merged and published

## Screenshots (if applicable)

<!-- Add screenshots if this affects UI/UX -->

## Related Issues

<!-- Link related issues -->

Closes #
Relates to #

## Additional Notes

<!-- Any additional information for reviewers -->

---

**For Automated PRs Only:**

- [ ] This is an automated cleanup PR (review time: <2 minutes expected)
- [ ] Changes are mechanical transformations only
- [ ] No manual code changes required
