# Task Template: Add Cron Job

## 1) Design
- [ ] Define single responsibility for cron
- [ ] Pick safe schedule (avoid collisions in `CRONS.md`)
- [ ] Define idempotency strategy

## 2) Implementation
- [ ] Add handler in `convex/crons/<name>.ts`
- [ ] Bound query sizes and loops
- [ ] Keep log lines structured and actionable

## 3) Registration + Docs
- [ ] Register in `convex/crons.ts`
- [ ] Update `CRONS.md` summary and detail sections

## 4) Validation
- [ ] Run `npx tsx scripts/validate-golden-principles.ts`
- [ ] Validate no debug/TODO log leftovers
