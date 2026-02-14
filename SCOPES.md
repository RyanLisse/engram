# Scope Administration

`memory_scopes` supports policy controls:

- `readPolicy`: `members` | `all`
- `writePolicy`: `members` | `creator` | `all`
- `adminPolicy`: `creator` | `members` | `admin_only` (reserved)

## Practical Defaults

- Private scope:
  - `readPolicy=members`
  - `writePolicy=members`
  - `adminPolicy=creator`
- Team scope:
  - `readPolicy=members`
  - `writePolicy=members`
  - `adminPolicy=members`
- Public scope:
  - `readPolicy=all`
  - `writePolicy=members` or `all` (careful)

## Removal Behavior

When removing a member:

- Membership is removed immediately.
- Notifications tied to facts in that scope are deleted for that agent.
