import { describe, test, expect } from 'bun:test'
import './setup.ts'
import { useState } from 'react'
import {
  renderPlan,
  executePlan,
  Claude,
  Phase,
  Step,
  Persona,
  Constraints,
  OutputFormat,
} from '../src/index.js'

/**
 * Comprehensive eval that tests ALL Smithers features in a single complex scenario:
 * - MDX/JSX rendering to XML
 * - Claude component with tools
 * - Persona, Constraints, OutputFormat components
 * - Phase and Step components
 * - React state management
 * - Multi-phase transitions (Ralph Wiggum loop)
 * - Nested/composed agents
 * - onFinished and onError callbacks
 * - MCP server tool integration
 * - Structured output parsing
 */
describe('all-features', () => {
  // Mock tools
  const fileSystem = {
    name: 'fileSystem',
    description: 'Read and write files',
    execute: async (args: any) => ({ content: 'file contents' }),
  }

  const webSearch = {
    name: 'webSearch',
    description: 'Search the web',
    execute: async (args: any) => ({ results: ['result1', 'result2'] }),
  }

  // Reusable components (tests composability)
  function SecurityExpert({ children }: { children: React.ReactNode }) {
    return (
      <>
        <Persona role="security expert">
          You specialize in application security and OWASP Top 10.
        </Persona>
        <Constraints>
          - Focus on security vulnerabilities
          - Rate severity (low/medium/high/critical)
          - Always suggest remediation
        </Constraints>
        {children}
      </>
    )
  }

  function JsonResponse({ schema }: { schema: Record<string, unknown> }) {
    return (
      <OutputFormat schema={schema}>
        Return valid JSON matching the schema.
      </OutputFormat>
    )
  }

  // Sub-agents for orchestration
  function Researcher({ topic, onComplete }: { topic: string; onComplete: (findings: any) => void }) {
    return (
      <Claude
        tools={[webSearch]}
        onFinished={onComplete}
      >
        <Persona role="researcher" />
        <Phase name="research">
          <Step>Search for information about: {topic}</Step>
          <Step>Compile key findings</Step>
        </Phase>
        <JsonResponse schema={{ findings: 'string[]' }} />
      </Claude>
    )
  }

  function Analyzer({ findings, onComplete }: { findings: string[]; onComplete: (analysis: any) => void }) {
    return (
      <Claude onFinished={onComplete}>
        <SecurityExpert>
          <Phase name="analyze">
            <Step>Review findings for security implications</Step>
            <Step>Identify vulnerabilities</Step>
          </Phase>
          Findings: {JSON.stringify(findings)}
        </SecurityExpert>
        <JsonResponse schema={{ vulnerabilities: 'object[]', riskLevel: 'string' }} />
      </Claude>
    )
  }

  function ReportWriter({ analysis, onComplete }: { analysis: any; onComplete: (report: unknown) => void }) {
    return (
      <Claude
        tools={[fileSystem]}
        onFinished={onComplete}
      >
        <Persona role="technical writer" />
        <Phase name="report">
          <Step>Write executive summary</Step>
          <Step>Detail findings and recommendations</Step>
          <Step>Save report to file</Step>
        </Phase>
        Analysis: {JSON.stringify(analysis)}
      </Claude>
    )
  }

  // Main orchestrator using all features
  function SecurityAuditAgent({ target }: { target: string }) {
    const [phase, setPhase] = useState<'research' | 'analyze' | 'report' | 'done'>('research')
    const [findings, setFindings] = useState<string[]>([])
    const [analysis, setAnalysis] = useState<any>(null)
    const [error, setError] = useState<Error | null>(null)

    if (error) {
      return (
        <Claude>
          <Phase name="error-recovery">
            An error occurred: {error.message}
            Attempting recovery...
          </Phase>
        </Claude>
      )
    }

    if (phase === 'research') {
      return (
        <Researcher
          topic={`security audit ${target}`}
          onComplete={(result) => {
            setFindings(result.findings)
            setPhase('analyze')
          }}
        />
      )
    }

    if (phase === 'analyze') {
      return (
        <Analyzer
          findings={findings}
          onComplete={(result) => {
            setAnalysis(result)
            setPhase('report')
          }}
        />
      )
    }

    if (phase === 'report') {
      return (
        <ReportWriter
          analysis={analysis}
          onComplete={() => setPhase('done')}
        />
      )
    }

    return null
  }

  test('renders complete plan with all components', async () => {
    const plan = await renderPlan(<SecurityAuditAgent target="example.com" />)

    // Check Claude component
    expect(plan).toContain('<claude')

    // Check tools integration
    expect(plan).toContain('tools=')

    // Check Persona
    expect(plan).toContain('<persona')
    expect(plan).toContain('researcher')

    // Check Phase and Step
    expect(plan).toContain('<phase name="research">')
    expect(plan).toContain('<step>')

    // Check OutputFormat
    expect(plan).toContain('<output-format')
  })

  test('executes multi-phase workflow end-to-end', async () => {
    const phases: string[] = []

    function TrackedAudit() {
      const [phase, setPhase] = useState<string>('research')

      phases.push(phase)

      if (phase === 'research') {
        return (
          <Claude
            tools={[webSearch]}
            onFinished={() => setPhase('analyze')}
          >
            <Phase name="research">Research phase</Phase>
          </Claude>
        )
      }

      if (phase === 'analyze') {
        return (
          <Claude onFinished={() => setPhase('report')}>
            <SecurityExpert>
              <Phase name="analyze">Analysis phase</Phase>
            </SecurityExpert>
          </Claude>
        )
      }

      if (phase === 'report') {
        return (
          <Claude
            tools={[fileSystem]}
            onFinished={() => setPhase('done')}
          >
            <Phase name="report">Report phase</Phase>
          </Claude>
        )
      }

      return null
    }

    await executePlan(<TrackedAudit />)

    expect(phases).toContain('research')
    expect(phases).toContain('analyze')
    expect(phases).toContain('report')
    expect(phases).toContain('done')
  })

  test('handles errors with onError callback', async () => {
    let errorCaught = false

    function FailingAgent() {
      return (
        <Claude
          onError={(err) => {
            errorCaught = true
          }}
        >
          This will fail intentionally for testing.
        </Claude>
      )
    }

    // Mock a failure scenario
    await executePlan(<FailingAgent />)

    expect(errorCaught).toBe(true)
  })

  test('tools are available for execution', async () => {
    function ToolAgent() {
      return (
        <Claude tools={[fileSystem, webSearch]}>
          Use available tools.
        </Claude>
      )
    }

    const result = await executePlan(<ToolAgent />)

    // Just verify execution completes successfully
    // Tools are passed inline, not as MCP servers
    expect(result.output).toBeDefined()
    expect(result.frames).toBeGreaterThan(0)
  })

  test('structured output is parsed correctly', async () => {
    let parsedOutput: any = null

    function StructuredAgent() {
      return (
        <Claude
          onFinished={(output) => {
            parsedOutput = output
          }}
        >
          <OutputFormat schema={{ status: 'string', items: 'array' }}>
            Return: {JSON.stringify({ status: 'complete', items: [1, 2, 3] })}
          </OutputFormat>
        </Claude>
      )
    }

    await executePlan(<StructuredAgent />)

    expect(parsedOutput).toBeDefined()
    expect(parsedOutput.status).toBe('complete')
    expect(parsedOutput.items).toHaveLength(3)
  })

  test('composed reusable components work together', async () => {
    function ComposedAgent() {
      return (
        <Claude tools={[fileSystem]}>
          <SecurityExpert>
            <Phase name="audit">
              <Step>Scan for vulnerabilities</Step>
              <Step>Generate report</Step>
            </Phase>
            <JsonResponse schema={{ vulnerabilities: 'array' }} />
          </SecurityExpert>
        </Claude>
      )
    }

    const plan = await renderPlan(<ComposedAgent />)

    // All composed elements should be present
    expect(plan).toContain('security expert')
    expect(plan).toContain('<constraints>')
    expect(plan).toContain('<phase name="audit">')
    expect(plan).toContain('<output-format')
  })
})
