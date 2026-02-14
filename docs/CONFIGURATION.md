# Configuration

System config is stored in `system_config` table.

Key defaults:
- `default_recall_limit`
- `default_token_budget`
- `forget_archive_threshold`
- `prune_age_threshold_days`
- `decay_rates`

Scope-specific overrides are in `memory_policies` keyed by `(scopeId, policyKey)`.
