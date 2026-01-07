# Smithers GitHub Action

Run Smithers AI agents in your CI/CD pipelines.

## Quick Start

```yaml
- uses: smithers-ai/smithers-action@v1
  with:
    agent: .smithers/code-review.tsx
    anthropic-api-key: ${{ secrets.ANTHROPIC_API_KEY }}
    auto-approve: true
```

## Inputs

| Input | Required | Default | Description |
|-------|----------|---------|-------------|
| `agent` | Yes | - | Path to agent file (`.mdx` or `.tsx`) |
| `config` | No | Auto-discover | Path to smithers config file |
| `mock` | No | `false` | Run in mock mode (no API calls) |
| `anthropic-api-key` | No | `$ANTHROPIC_API_KEY` | Anthropic API key |
| `max-frames` | No | `50` | Maximum execution frames |
| `timeout` | No | `300000` | Timeout per frame (ms) |
| `auto-approve` | No | `false` | Skip plan approval prompt |
| `output-file` | No | - | Save result to file |
| `json-output` | No | `false` | Output result as JSON |
| `upload-artifacts` | No | `true` | Upload result as artifact |
| `artifact-name` | No | `smithers-result` | Artifact name |
| `approval-gate` | No | `false` | Require manual approval |

## Outputs

| Output | Description |
|--------|-------------|
| `result` | Execution result |
| `success` | Whether execution succeeded |
| `frames` | Number of frames executed |
| `elapsed` | Total execution time (ms) |
| `artifact-url` | URL to uploaded artifact |

## Examples

### Code Review on PR

```yaml
name: Code Review
on: pull_request

jobs:
  review:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: smithers-ai/smithers-action@v1
        with:
          agent: .smithers/code-review.tsx
          anthropic-api-key: ${{ secrets.ANTHROPIC_API_KEY }}
          auto-approve: true
```

### Mock Mode Testing

```yaml
- uses: smithers-ai/smithers-action@v1
  with:
    agent: .smithers/test-agent.tsx
    mock: true
```

### Deployment with Approval

```yaml
jobs:
  deploy:
    runs-on: ubuntu-latest
    environment: production
    steps:
      - uses: smithers-ai/smithers-action@v1
        with:
          agent: .smithers/deploy.tsx
          anthropic-api-key: ${{ secrets.ANTHROPIC_API_KEY }}
          approval-gate: true
```

## Documentation

See [docs/github-action-design.md](../../../docs/github-action-design.md) for full documentation.

## Development

### Build

```bash
cd .github/actions/smithers-run
bun install
bun run build
```

### Local Testing

```bash
# Set inputs as env vars
export INPUT_AGENT=".smithers/test.tsx"
export INPUT_MOCK="true"
export INPUT_AUTO_APPROVE="true"

# Run action
node dist/index.js
```
