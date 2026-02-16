# Task Template: Add Lifecycle Hook

## 1) Define Trigger
- [ ] Choose event (`session-start`, `stop`, etc.)
- [ ] Define expected side effects

## 2) Implement Hook
- [ ] Add script under `.claude/hooks/`
- [ ] Make script idempotent and non-destructive
- [ ] Fail fast with clear stderr errors

## 3) Wire + Test
- [ ] Register in `.claude/settings.json` if needed
- [ ] Test hook invocation locally
- [ ] Verify behavior on error paths

## 4) Document
- [ ] Update `HOOKS.md`
- [ ] Add troubleshooting notes
