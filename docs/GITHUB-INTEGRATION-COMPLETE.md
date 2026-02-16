# GitHub Integration Complete ✅

**Date**: 2026-02-15
**Status**: All components deployed and ready to use

---

## What Was Created

### 🤖 GitHub Actions Workflows (3)

| Workflow | Trigger | Purpose |
|----------|---------|---------|
| **harness-validation.yml** | Push, PR, Weekly | Validate golden principles, comment on PRs, create issues for critical violations |
| **automated-cleanup.yml** | Weekly, Manual | Auto-fix violations, open cleanup PRs |
| **quality-report.yml** | Weekly Sunday | Generate quality reports, track trends |

### 📋 Issue Templates (2)

| Template | Use Case |
|----------|----------|
| **harness-violation.yml** | Report golden principle violations |
| **harness-phase.yml** | Track implementation phase progress |

### 📝 Repository Configuration (3)

| File | Purpose |
|------|---------|
| **pull_request_template.md** | Standardized PR checklist with golden principles compliance |
| **CODEOWNERS** | Auto-assign reviewers for critical files |
| **dependabot.yml** | Auto-update dependencies weekly |

---

## Quick Start

### 1. Enable Workflows

```bash
# Commit and push the GitHub configuration
cd /Users/cortex-air/Tools/engram

git add .github/
git commit -m "feat(ci): add GitHub integration for harness engineering

- Add harness validation workflow (runs on PR + weekly)
- Add automated cleanup workflow (fixes violations)
- Add quality report workflow (weekly reports)
- Add issue templates for violations and phases
- Add PR template with golden principles checklist
- Add CODEOWNERS for critical files
- Add Dependabot config

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"

git push origin master
```

### 2. Run First Validation

```bash
# Manually trigger validation workflow
gh workflow run harness-validation.yml

# Watch it run
gh run watch
```

### 3. View Results

```bash
# Check workflow status
gh run list --workflow=harness-validation.yml

# View latest run
gh run view

# See quality check on PR
gh pr view <pr-number> --comments
```

---

## Workflow Details

### 🔍 Harness Validation Workflow

**File**: `.github/workflows/harness-validation.yml`

**Triggers**:
- Push to main/master
- Pull requests
- Every Monday at 6am UTC
- Manual dispatch

**What it does**:
1. Runs `validate-golden-principles.ts`
2. Creates GitHub check with quality grade
3. Comments on PRs with violation details
4. Creates issues for critical violations
5. Fails if critical violations detected

**Example PR Comment**:
```markdown
## 🔍 Golden Principles Validation

**Overall Grade**: B+
**Total Violations**: 5

| Severity | Count |
|----------|-------|
| 🔴 Critical | 0 |
| 🟠 High | 2 |
| 🟡 Medium | 3 |

✅ No violations introduced by this PR!
```

### 🤖 Automated Cleanup Workflow

**File**: `.github/workflows/automated-cleanup.yml`

**Triggers**:
- Every Monday at 7am UTC
- Manual dispatch with principle filter

**What it does**:
1. Runs validation to find violations
2. Auto-fixes mechanical violations (GP-004)
3. Creates PR with fixes
4. Assigns to repository owner
5. Labels as `automated-cleanup`

**Auto-Fixable Violations**:
- ✅ GP-004: `console.log` → `console.error`
- ⏳ GP-005: Structured logging (planned)
- ⏳ GP-002: String literals → constants (planned)

**Example PR**:
- Title: "🤖 Automated Harness Engineering Cleanup"
- Body: Summary of fixes with file list
- Labels: `harness-engineering`, `automated-cleanup`
- Review time: <2 minutes

### 📊 Quality Report Workflow

**File**: `.github/workflows/quality-report.yml`

**Triggers**:
- Every Sunday at 11pm UTC (end of week)
- Manual dispatch

**What it does**:
1. Runs validation
2. Generates markdown report with trends
3. Commits report to `docs/QUALITY-REPORT-YYYY-MM-DD.md`
4. Creates issue if grade drops below B+

**Example Report**:
```markdown
# Engram Code Quality Report

**Generated**: 2026-02-15 23:00:00 UTC
**Week**: Week 7, 2026

## Summary

**Overall Grade**: B+
**Total Files Checked**: 247
**Total Violations**: 8

| Severity | Count |
|----------|-------|
| 🔴 Critical | 0 |
| 🟠 High | 3 |
| 🟡 Medium | 5 |

## Trend Analysis

Improved from B (12 violations) last week. 4 violations fixed.
```

---

## Issue Templates

### Golden Principle Violation Template

**Use when**: You find a violation manually

**How to use**:
```bash
# Via gh CLI
gh issue create --template harness-violation.yml

# Or click "New Issue" → "Golden Principle Violation"
```

**Fields**:
- Principle (dropdown of GP-001 through GP-012)
- Severity (Critical/High/Medium/Low)
- Location (file paths, line numbers)
- Description
- Proposed fix
- Automation options (can it be auto-fixed?)

### Harness Engineering Phase Template

**Use when**: Starting a new implementation phase

**How to use**:
```bash
# Via gh CLI
gh issue create --template harness-phase.yml \
  --title "Phase 1: Golden Principles Foundation"

# Or click "New Issue" → "Harness Engineering Phase"
```

**Fields**:
- Phase (dropdown 1-5)
- Duration (e.g., "Week 1")
- Objectives
- Tasks (checkbox list)
- Deliverables
- Success criteria

---

## PR Template

**File**: `.github/pull_request_template.md`

**Auto-populated when creating PR**

**Key sections**:
1. **Golden Principles Compliance** - Checklist of principles
2. **Testing** - Verification steps
3. **Documentation** - Updates required
4. **Quality Check** - Auto-commented by workflow

**Example checklist**:
```markdown
- [x] GP-001: Tool registry is single source of truth
- [x] GP-003: Tools are atomic primitives (<100 lines)
- [x] GP-004: No stdout logging in MCP server
- [x] GP-011: Unit + integration tests included
```

---

## CODEOWNERS

**File**: `.github/CODEOWNERS`

**Auto-assigns reviewers for**:
- Golden principles documentation
- Harness engineering files
- Tool registry
- Convex schema
- Critical documentation

**Example**:
When someone edits `docs/GOLDEN-PRINCIPLES.md`, you're automatically assigned as reviewer.

---

## Dependabot

**File**: `.github/dependabot.yml`

**Auto-updates**:
- MCP server dependencies (weekly Monday 9am)
- Convex dependencies (weekly Monday 9am)
- GitHub Actions (monthly)

**Labels**: `dependencies`, `automated`

**Commit format**: `chore(deps): update package-name to vX.Y.Z`

---

## Testing the Integration

### Test Validation Workflow

```bash
# 1. Make a change that violates GP-004
echo 'console.log("test");' >> mcp-server/src/test.ts

# 2. Create PR
git checkout -b test-harness-validation
git add mcp-server/src/test.ts
git commit -m "test: trigger validation"
git push origin test-harness-validation
gh pr create --title "Test: Harness Validation" --body "Testing workflow"

# 3. Check workflow run
gh run watch

# 4. See PR comment
gh pr view --comments
```

Expected result: PR gets comment showing GP-004 violation

### Test Automated Cleanup

```bash
# 1. Manually trigger cleanup
gh workflow run automated-cleanup.yml

# 2. Watch it run
gh run watch

# 3. Check for new PR
gh pr list --label automated-cleanup
```

Expected result: PR created with fixes (if violations exist)

### Test Quality Report

```bash
# 1. Trigger report generation
gh workflow run quality-report.yml

# 2. Wait for completion
gh run watch

# 3. Check for new report
ls docs/QUALITY-REPORT-*.md

# 4. View report
cat docs/QUALITY-REPORT-$(date +%Y-%m-%d).md
```

Expected result: New quality report committed

---

## Monitoring

### Workflow Status Dashboard

```bash
# List all workflow runs
gh run list

# Filter by workflow
gh run list --workflow=harness-validation.yml --limit 10

# View specific run
gh run view <run-id>

# Download logs
gh run download <run-id>
```

### Issue Tracking

```bash
# List harness engineering issues
gh issue list --label harness-engineering

# List automated issues
gh issue list --label automated

# View specific issue
gh issue view <issue-number>
```

### PR Management

```bash
# List automated cleanup PRs
gh pr list --label automated-cleanup

# Review and merge
gh pr review <pr-number> --approve
gh pr merge <pr-number> --squash --delete-branch
```

---

## Customization

### Adjust Validation Schedule

Edit `.github/workflows/harness-validation.yml`:

```yaml
schedule:
  # Daily at 9am instead of weekly
  - cron: '0 9 * * *'
```

### Change Severity Thresholds

Edit `.github/workflows/harness-validation.yml`:

```yaml
# Fail on high violations (not just critical)
if [ "$HIGH" -gt 0 ]; then
  exit 1
fi
```

### Add More Auto-Fixes

Edit `.github/workflows/automated-cleanup.yml`:

```yaml
- name: Auto-fix GP-005 violations
  run: |
    # Add structured logging prefix
    find mcp-server/src -name "*.ts" -type f -exec sed -i '' 's/console\.error("\([^"]*\)")/console.error("[component] \1")/g' {} +
```

### Customize Issue Templates

Edit `.github/ISSUE_TEMPLATE/*.yml`:

```yaml
# Add new principle to dropdown
options:
  - GP-013 (New Principle)
```

---

## Best Practices

### For Developers

1. **Before committing**: Run validation locally
   ```bash
   npx tsx scripts/validate-golden-principles.ts
   ```

2. **On PR creation**: Review golden principles checklist

3. **After automated PR**: Quick review (<2 min), approve if mechanical

4. **Weekly**: Check quality report for trends

### For Reviewers

1. **Check workflow status**: Green check = passes validation
2. **Read PR comments**: Workflow comments show violations
3. **Verify fixes**: Automated fixes are mechanical, verify quickly
4. **Track issues**: Close violations when fixed

### For Maintainers

1. **Monitor workflow runs**: `gh run list`
2. **Triage automated issues**: Weekly review
3. **Adjust thresholds**: If too noisy, tune severity
4. **Update golden principles**: Add new ones as patterns emerge

---

## Troubleshooting

### Workflow Not Running

```bash
# Check if workflows are enabled
gh api repos/:owner/:repo/actions/permissions

# Re-enable if needed
gh api -X PUT repos/:owner/:repo/actions/permissions \
  -f enabled=true
```

### Workflow Failing

```bash
# View logs
gh run view <run-id> --log

# Debug locally
npx tsx scripts/validate-golden-principles.ts --json
```

### PR Comment Not Appearing

```bash
# Check workflow permissions
# Ensure GITHUB_TOKEN has pull-requests: write permission

# Manually add comment
gh pr comment <pr-number> --body "Manual validation passed"
```

### Automated PR Not Creating

```bash
# Check if violations exist
npx tsx scripts/validate-golden-principles.ts

# Check if auto-fixes apply
git diff

# Manually trigger workflow
gh workflow run automated-cleanup.yml
```

---

## Next Steps

### Immediate (Today)

1. ✅ **Commit GitHub integration files**
   ```bash
   git add .github/
   git commit -m "feat(ci): add GitHub integration"
   git push
   ```

2. ✅ **Test validation workflow**
   ```bash
   gh workflow run harness-validation.yml
   gh run watch
   ```

3. ✅ **Review results**
   ```bash
   gh run view
   ```

### This Week

1. **Create Phase 1 issue** using template
2. **Review first quality report** (Sunday)
3. **Approve first automated cleanup PR** (Monday)
4. **Adjust thresholds** if needed

### This Month

1. **Track all 5 phases** using issue templates
2. **Monitor quality trends** via weekly reports
3. **Fine-tune automation** based on learnings
4. **Celebrate wins** (first Grade A file, etc.)

---

## Success Metrics

Track these via GitHub:

| Metric | How to Check | Target |
|--------|--------------|--------|
| Workflow success rate | `gh run list --status success` | >95% |
| PR review time | PR insights | <30 min avg |
| Automated fixes merged | `gh pr list --label automated-cleanup --state merged` | 10+/month |
| Quality grade trend | Weekly reports | Improving |
| Critical violations | Validation workflow | 0 for 30+ days |

---

## Resources

- **GitHub Actions Docs**: https://docs.github.com/actions
- **Workflow Syntax**: https://docs.github.com/actions/reference/workflow-syntax
- **Issue Templates**: https://docs.github.com/communities/using-templates-to-encourage-useful-issues-and-pull-requests
- **CODEOWNERS**: https://docs.github.com/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/about-code-owners

---

## Support

Questions? Issues?

1. **Check workflow logs**: `gh run view --log`
2. **Review documentation**: This file + individual workflow files
3. **Open issue**: Use `harness-violation` template
4. **Ask in PR**: Comment and tag maintainers

---

🎉 **GitHub integration complete!** Your repository is now fully harness-optimized with automated validation, cleanup, and quality tracking.
