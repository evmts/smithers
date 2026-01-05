import { describe, test, expect } from 'bun:test'
import './setup.ts'
import { renderPlan, executePlan, Claude, Phase, Step, Constraints, OutputFormat } from '../src/index.js'

describe('code-review', () => {
  const mockFileSystem = {
    name: 'fileSystem',
    description: 'Read and write files',
    execute: async () => ({ success: true })
  }

  const mockGrep = {
    name: 'grep',
    description: 'Search file contents',
    execute: async () => ({ matches: [] })
  }

  test('renders with tools and structured output format', async () => {
    const CodeReview = () => (
      <Claude tools={[mockFileSystem, mockGrep]}>
        <Constraints>
          - Focus on bugs and security issues
          - Provide line numbers
        </Constraints>

        <Phase name="review">
          <Step>Read the changed files</Step>
          <Step>Identify issues</Step>
        </Phase>

        <OutputFormat>
          Return JSON with issues array.
        </OutputFormat>
      </Claude>
    )

    const plan = await renderPlan(<CodeReview />)

    expect(plan).toContain('<claude')
    expect(plan).toContain('tools=')
    expect(plan).toContain('<constraints>')
    expect(plan).toContain('<phase name="review">')
    expect(plan).toContain('<step>')
    expect(plan).toContain('<output-format>')
  })

  test('executes and returns structured JSON output', async () => {
    const CodeReview = () => (
      <Claude tools={[mockFileSystem]}>
        Review this code and return exactly:
        {JSON.stringify({ issues: [], summary: "No issues found" })}
      </Claude>
    )

    const result = await executePlan(<CodeReview />)
    const output = JSON.parse(result.output as string)

    expect(output).toHaveProperty('issues')
    expect(output).toHaveProperty('summary')
  })

  test('tools are available for execution', async () => {
    const CodeReview = () => (
      <Claude tools={[mockFileSystem, mockGrep]}>
        List available tools.
      </Claude>
    )

    const result = await executePlan(<CodeReview />)

    // Just verify execution completes successfully
    // Tools are passed inline, not as MCP servers
    expect(result.output).toBeDefined()
    expect(result.frames).toBeGreaterThan(0)
  })
})
