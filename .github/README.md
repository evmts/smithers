# GitHub Configuration

GitHub Actions workflows and configuration for Smithers.

## Workflows

### `ci.yml` - Continuous Integration

Runs on every push and pull request:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              CI Pipeline                                     │
│                                                                              │
│   Push/PR                                                                    │
│      │                                                                       │
│      ▼                                                                       │
│   ┌─────────────────┐                                                        │
│   │   Install deps  │                                                        │
│   │   (bun install) │                                                        │
│   └────────┬────────┘                                                        │
│            │                                                                 │
│            ▼                                                                 │
│   ┌─────────────────┐                                                        │
│   │   Type check    │                                                        │
│   │   (tsc)         │                                                        │
│   └────────┬────────┘                                                        │
│            │                                                                 │
│            ▼                                                                 │
│   ┌─────────────────┐                                                        │
│   │   Lint          │                                                        │
│   │   (eslint)      │                                                        │
│   └────────┬────────┘                                                        │
│            │                                                                 │
│            ▼                                                                 │
│   ┌─────────────────┐                                                        │
│   │   Test          │                                                        │
│   │   (bun test)    │                                                        │
│   └────────┬────────┘                                                        │
│            │                                                                 │
│            ▼                                                                 │
│   ┌─────────────────┐                                                        │
│   │   Build         │                                                        │
│   │   (bun build)   │                                                        │
│   └─────────────────┘                                                        │
└─────────────────────────────────────────────────────────────────────────────┘
```

### `release.yml` - Release Automation

Triggered on push to main with changesets:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                            Release Pipeline                                  │
│                                                                              │
│   Push to main                                                               │
│      │                                                                       │
│      ▼                                                                       │
│   ┌─────────────────┐                                                        │
│   │  Check for      │                                                        │
│   │  changesets     │                                                        │
│   └────────┬────────┘                                                        │
│            │                                                                 │
│            ├─── No changesets ──▶ Exit                                       │
│            │                                                                 │
│            ▼                                                                 │
│   ┌─────────────────┐                                                        │
│   │  Version bump   │                                                        │
│   │  (changesets)   │                                                        │
│   └────────┬────────┘                                                        │
│            │                                                                 │
│            ▼                                                                 │
│   ┌─────────────────┐                                                        │
│   │  Build package  │                                                        │
│   └────────┬────────┘                                                        │
│            │                                                                 │
│            ▼                                                                 │
│   ┌─────────────────┐                                                        │
│   │  Publish to npm │                                                        │
│   └────────┬────────┘                                                        │
│            │                                                                 │
│            ▼                                                                 │
│   ┌─────────────────┐                                                        │
│   │  Create GitHub  │                                                        │
│   │  release        │                                                        │
│   └─────────────────┘                                                        │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Secrets

The following secrets are required for workflows:

| Secret | Purpose |
|--------|---------|
| `NPM_TOKEN` | Publishing to npm registry |
| `GITHUB_TOKEN` | Auto-provided by GitHub Actions |

## Local Testing

Test workflows locally using [act](https://github.com/nektos/act):

```bash
# Install act
brew install act

# Run CI workflow
act push

# Run release workflow (dry run)
act push --dryrun -W .github/workflows/release.yml
```

## Workflow Files

- `workflows/ci.yml` - Continuous integration
- `workflows/release.yml` - Release automation via changesets
