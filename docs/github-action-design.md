# GitHub Action Design

This document outlines the design for a GitHub Action that runs Smithers agents in CI/CD pipelines.

## Overview

The `smithers-action` will enable running Smithers agents as part of GitHub workflows, allowing teams to:
- Run automated code reviews on PRs
- Execute deployment agents on release
- Perform automated testing and validation
- Generate reports and documentation
- Trigger agent workflows on schedule or events

## Action Inputs

### Required Inputs

| Input | Type | Description |
|-------|------|-------------|
| `agent` | string | Path to the agent file (`.mdx` or `.tsx`) relative to repository root |

### Optional Inputs

| Input | Type | Default | Description |
|-------|------|---------|-------------|
| `config` | string | Auto-discover | Path to smithers config file |
| `mock` | boolean | `false` | Run in mock mode (no real API calls) |
| `anthropic-api-key` | string | `$ANTHROPIC_API_KEY` env | Anthropic API key (recommended: use secrets) |
| `max-frames` | number | `50` | Maximum execution frames (prevents infinite loops) |
| `timeout` | number | `300000` | Timeout per frame in milliseconds (5 minutes default) |
| `auto-approve` | boolean | `false` | Skip plan approval prompt |
| `output-file` | string | None | Save result to file |
| `json-output` | boolean | `false` | Output result as JSON |
| `upload-artifacts` | boolean | `true` | Upload result as workflow artifact |
| `artifact-name` | string | `smithers-result` | Name for uploaded artifact |
| `tui` | boolean | `false` | Enable TUI mode (requires terminal) |
| `approval-gate` | boolean | `false` | Require manual approval before execution |
| `approval-timeout` | number | `3600000` | Timeout for manual approval (1 hour default) |

## Action Outputs

| Output | Type | Description |
|--------|------|-------------|
| `result` | string | Execution result (JSON string if json-output=true) |
| `success` | boolean | Whether execution completed successfully |
| `frames` | number | Number of frames executed |
| `elapsed` | number | Total execution time in milliseconds |
| `artifact-url` | string | URL to uploaded artifact (if upload-artifacts=true) |

## Example Workflows

### 1. Code Review on PR

```yaml
name: Automated Code Review
on:
  pull_request:
    types: [opened, synchronize]

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
          json-output: true

      - name: Post Review Comment
        uses: actions/github-script@v7
        with:
          script: |
            const result = JSON.parse(process.env.REVIEW_RESULT)
            await github.rest.issues.createComment({
              owner: context.repo.owner,
              repo: context.repo.repo,
              issue_number: context.issue.number,
              body: result.review
            })
```

### 2. Deployment Agent with Manual Approval

```yaml
name: Deploy to Production
on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    environment: production
    steps:
      - uses: actions/checkout@v4

      - uses: smithers-ai/smithers-action@v1
        with:
          agent: .smithers/deploy.tsx
          anthropic-api-key: ${{ secrets.ANTHROPIC_API_KEY }}
          approval-gate: true
          approval-timeout: 1800000  # 30 minutes
          upload-artifacts: true

      - name: Notify Slack
        if: success()
        run: |
          curl -X POST ${{ secrets.SLACK_WEBHOOK }} \
            -H 'Content-Type: application/json' \
            -d '{"text": "✅ Deployment agent completed successfully"}'
```

### 3. Scheduled Research Agent

```yaml
name: Daily Market Research
on:
  schedule:
    - cron: '0 9 * * *'  # 9am UTC daily

jobs:
  research:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: smithers-ai/smithers-action@v1
        with:
          agent: .smithers/market-research.tsx
          anthropic-api-key: ${{ secrets.ANTHROPIC_API_KEY }}
          auto-approve: true
          output-file: reports/research-$(date +%Y-%m-%d).json
          json-output: true

      - name: Commit Report
        run: |
          git config user.name "Smithers Bot"
          git config user.email "bot@smithers.ai"
          git add reports/
          git commit -m "📊 Daily research report"
          git push
```

### 4. Test Generation on New Features

```yaml
name: Generate Tests
on:
  pull_request:
    paths:
      - 'src/**/*.ts'
      - 'src/**/*.tsx'

jobs:
  generate-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          ref: ${{ github.head_ref }}

      - uses: smithers-ai/smithers-action@v1
        with:
          agent: .smithers/test-generator.tsx
          anthropic-api-key: ${{ secrets.ANTHROPIC_API_KEY }}
          auto-approve: true

      - name: Commit Generated Tests
        run: |
          git config user.name "Smithers Bot"
          git config user.email "bot@smithers.ai"
          git add .
          git commit -m "🧪 Generated tests" || echo "No tests to commit"
          git push
```

### 5. Mock Mode Testing (No API Key Required)

```yaml
name: Test Smithers Agents
on:
  pull_request:
    paths:
      - '.smithers/**'

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: smithers-ai/smithers-action@v1
        with:
          agent: .smithers/code-review.tsx
          mock: true
          auto-approve: true

      - name: Validate Output
        run: |
          if [ -f smithers-result.json ]; then
            echo "✅ Agent execution succeeded in mock mode"
          else
            echo "❌ Agent execution failed"
            exit 1
          fi
```

## Security Considerations

### API Key Management

**Best Practice**: Always use GitHub Secrets for API keys, never commit them to code.

```yaml
# ✅ CORRECT
anthropic-api-key: ${{ secrets.ANTHROPIC_API_KEY }}

# ❌ WRONG - Never do this
anthropic-api-key: sk-ant-api03-...
```

### Repository Secrets Setup

1. Go to repository Settings → Secrets and variables → Actions
2. Create new secret: `ANTHROPIC_API_KEY`
3. Paste your API key
4. Reference in workflow: `${{ secrets.ANTHROPIC_API_KEY }}`

### Environment Protection

For sensitive operations (production deploys), use GitHub Environments:

```yaml
jobs:
  deploy:
    runs-on: ubuntu-latest
    environment: production  # Requires approval from designated reviewers
    steps:
      - uses: smithers-ai/smithers-action@v1
        # ...
```

### Permissions

The action requires these permissions:

```yaml
permissions:
  contents: write  # If agent writes files and commits
  pull-requests: write  # If agent posts PR comments
  issues: write  # If agent creates issues
```

## Implementation Details

### Action Structure

```
.github/
  actions/
    smithers-run/
      action.yml          # Action metadata
      dist/
        index.js          # Compiled action code (bundled)
      src/
        index.ts          # Main entry point
        runner.ts         # Agent execution logic
        artifacts.ts      # Artifact upload helpers
        approval.ts       # Manual approval gate logic
      package.json
      tsconfig.json
```

### Action Metadata (action.yml)

```yaml
name: 'Run Smithers Agent'
description: 'Execute a Smithers AI agent in your CI/CD pipeline'
author: 'Smithers AI'
branding:
  icon: 'cpu'
  color: 'blue'

inputs:
  agent:
    description: 'Path to agent file (.mdx or .tsx)'
    required: true

  config:
    description: 'Path to smithers config file'
    required: false

  mock:
    description: 'Run in mock mode (no API calls)'
    required: false
    default: 'false'

  anthropic-api-key:
    description: 'Anthropic API key'
    required: false

  max-frames:
    description: 'Maximum execution frames'
    required: false
    default: '50'

  auto-approve:
    description: 'Skip plan approval prompt'
    required: false
    default: 'false'

  json-output:
    description: 'Output result as JSON'
    required: false
    default: 'false'

  upload-artifacts:
    description: 'Upload result as workflow artifact'
    required: false
    default: 'true'

  artifact-name:
    description: 'Name for uploaded artifact'
    required: false
    default: 'smithers-result'

outputs:
  result:
    description: 'Execution result'

  success:
    description: 'Whether execution succeeded'

  frames:
    description: 'Number of frames executed'

  elapsed:
    description: 'Total execution time (ms)'

  artifact-url:
    description: 'URL to uploaded artifact'

runs:
  using: 'node20'
  main: 'dist/index.js'
```

### Main Entry Point (src/index.ts)

```typescript
import * as core from '@actions/core'
import * as artifact from '@actions/artifact'
import { runAgent } from './runner.js'
import { uploadResult } from './artifacts.js'
import { requestApproval } from './approval.js'

async function run() {
  try {
    // Get inputs
    const agentPath = core.getInput('agent', { required: true })
    const config = core.getInput('config')
    const mock = core.getInput('mock') === 'true'
    const apiKey = core.getInput('anthropic-api-key') || process.env.ANTHROPIC_API_KEY
    const maxFrames = parseInt(core.getInput('max-frames') || '50')
    const autoApprove = core.getInput('auto-approve') === 'true'
    const jsonOutput = core.getInput('json-output') === 'true'
    const uploadArtifacts = core.getInput('upload-artifacts') === 'true'
    const artifactName = core.getInput('artifact-name') || 'smithers-result'
    const approvalGate = core.getInput('approval-gate') === 'true'

    // Validate API key (unless mock mode)
    if (!mock && !apiKey) {
      throw new Error('anthropic-api-key required (set input or ANTHROPIC_API_KEY env var)')
    }

    // Set API key env var if provided
    if (apiKey) {
      process.env.ANTHROPIC_API_KEY = apiKey
    }

    // Handle approval gate
    if (approvalGate) {
      core.info('⏸️  Waiting for manual approval...')
      const approved = await requestApproval()
      if (!approved) {
        core.setFailed('❌ Execution not approved')
        return
      }
    }

    // Run agent
    core.info(`🚀 Running agent: ${agentPath}`)
    const result = await runAgent({
      agentPath,
      config,
      mock,
      maxFrames,
      autoApprove,
      jsonOutput,
    })

    // Set outputs
    core.setOutput('result', jsonOutput ? JSON.stringify(result.data) : result.data)
    core.setOutput('success', result.success)
    core.setOutput('frames', result.frames)
    core.setOutput('elapsed', result.elapsed)

    // Upload artifacts
    if (uploadArtifacts) {
      const artifactUrl = await uploadResult(result, artifactName)
      core.setOutput('artifact-url', artifactUrl)
      core.info(`📦 Artifact uploaded: ${artifactUrl}`)
    }

    // Summary
    core.summary
      .addHeading('Smithers Agent Execution')
      .addTable([
        [{ data: 'Metric', header: true }, { data: 'Value', header: true }],
        ['Agent', agentPath],
        ['Success', result.success ? '✅' : '❌'],
        ['Frames', result.frames.toString()],
        ['Elapsed', `${(result.elapsed / 1000).toFixed(2)}s`],
      ])
      .write()

    if (!result.success) {
      core.setFailed(`❌ Agent execution failed: ${result.error}`)
    } else {
      core.info('✅ Agent execution completed successfully')
    }
  } catch (error) {
    core.setFailed(`❌ Action failed: ${error instanceof Error ? error.message : String(error)}`)
  }
}

run()
```

## VHS Integration

The action can integrate with VHS to generate GIFs of agent executions:

```yaml
- uses: smithers-ai/smithers-action@v1
  with:
    agent: .smithers/demo.tsx
    tui: true
    mock: true

- uses: charmbracelet/vhs-action@v2
  with:
    path: demos/demo.tape

- name: Upload GIF
  uses: actions/upload-artifact@v4
  with:
    name: demo-gif
    path: demos/*.gif
```

## Rate Limiting & Cost Control

### Recommended Safeguards

1. **Max Frames Limit**: Set conservative `max-frames` to prevent runaway costs
2. **Timeout**: Set frame timeout to prevent long-running operations
3. **Mock Mode for Testing**: Use `mock: true` for testing agent logic without API calls
4. **Usage Tracking**: Monitor API usage via Anthropic dashboard
5. **Environment Gates**: Require manual approval for production agents

### Cost Estimation

| Scenario | Frames | Avg Tokens/Frame | Cost (Sonnet 4.5) |
|----------|--------|------------------|-------------------|
| Code Review (small PR) | 3-5 | 5000 | ~$0.05 |
| Code Review (large PR) | 10-15 | 8000 | ~$0.30 |
| Test Generation | 5-10 | 6000 | ~$0.15 |
| Multi-phase Research | 20-30 | 10000 | ~$1.00 |

*Estimates based on Sonnet 4.5 pricing ($0.003/1K input, $0.015/1K output)*

## Troubleshooting

### Common Issues

**Error: "Agent file not found"**
- Ensure agent path is relative to repository root
- Check file extension is `.mdx` or `.tsx`
- Verify file is committed to repository

**Error: "ANTHROPIC_API_KEY not set"**
- Add API key to repository secrets
- Reference in workflow: `${{ secrets.ANTHROPIC_API_KEY }}`
- Or set `mock: true` for testing

**Error: "Max frames exceeded"**
- Increase `max-frames` input
- Check for infinite loops in agent logic
- Use `<Stop>` component to halt execution

**Error: "Timeout waiting for approval"**
- Increase `approval-timeout`
- Ensure approvers are notified
- Consider removing `approval-gate` for automated workflows

### Debug Mode

Enable debug logging:

```yaml
env:
  ACTIONS_STEP_DEBUG: true
```

## Future Enhancements

### Planned Features

1. **Multi-agent Workflows**: Run multiple agents in sequence or parallel
2. **Result Caching**: Cache agent results to avoid redundant API calls
3. **Diff-based Triggers**: Only run agent if specific files changed
4. **Custom Reporters**: Post results to Slack, Discord, etc.
5. **Agent Marketplace**: Share reusable agents with community
6. **Cost Tracking**: Built-in usage reporting in workflow summary

### Integration Ideas

- **Slack/Discord notifications**: Post agent results to team channels
- **Jira integration**: Create tickets from agent findings
- **Email reports**: Send detailed reports to stakeholders
- **Dashboard**: Real-time agent execution monitoring
- **Webhooks**: Trigger external systems on completion

## Related Documentation

- [Interactive CLI Commands](./cli-commands.md)
- [VHS Recording](./vhs-recording.md)
- [Smithers Configuration](./configuration.md)
- [GitHub Actions Documentation](https://docs.github.com/en/actions)
