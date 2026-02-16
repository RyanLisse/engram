# Engram Golden Principles

This root file is a stable pointer for tooling and scripts.

## Canonical Source

All principle definitions, IDs, examples, and validation status live in:

- [`docs/GOLDEN-PRINCIPLES.md`](./docs/GOLDEN-PRINCIPLES.md)

## Why this file exists

- `Makefile` and local tooling check for `GOLDEN_PRINCIPLES.md` at repo root.
- Keeping this file as a pointer prevents drift between duplicate full documents.

## Editing policy

1. Edit principle content only in `docs/GOLDEN-PRINCIPLES.md`.
2. Keep this file short and pointer-only.
3. If IDs change, update validator mapping comments in `scripts/validate-golden-principles.ts`.
