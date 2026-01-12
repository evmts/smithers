import { describe, test, expect, mock, beforeEach, afterEach } from 'bun:test'
import './setup.ts'
import { z } from 'zod'
import { renderPlan, executePlan, ClaudeCli, Persona, Constraints } from '@evmts/smithers'

describe('ClaudeCli component', () => {
  describe('rendering', () => {
    test('renders basic ClaudeCli component to XML', async () => {
      const SimpleAgent = () => (
        <ClaudeCli>
          Analyze the current directory structure.
        </ClaudeCli>
      )

      const plan = await renderPlan(<SimpleAgent />)

      expect(plan).toContain('<claude-cli>')
      expect(plan).toContain('</claude-cli>')
      expect(plan).toContain('Analyze the current directory structure.')
    })

    test('renders with model prop', async () => {
      const OpusAgent = () => (
        <ClaudeCli model="opus">
          Complex reasoning task.
        </ClaudeCli>
      )

      const plan = await renderPlan(<OpusAgent />)

      expect(plan).toContain('<claude-cli')
      expect(plan).toContain('model="opus"')
    })

    test('renders with allowedTools prop', async () => {
      const RestrictedAgent = () => (
        <ClaudeCli allowedTools={['Read', 'Glob', 'Grep']}>
          Search for files.
        </ClaudeCli>
      )

      const plan = await renderPlan(<RestrictedAgent />)

      expect(plan).toContain('<claude-cli')
      expect(plan).toContain('allowedTools')
    })

    test('renders with maxTurns prop', async () => {
      const LimitedAgent = () => (
        <ClaudeCli maxTurns={5}>
          Complete this task in at most 5 steps.
        </ClaudeCli>
      )

      const plan = await renderPlan(<LimitedAgent />)

      expect(plan).toContain('<claude-cli')
      expect(plan).toContain('maxTurns="5"')
    })

    test('renders with cwd prop', async () => {
      const DirAgent = () => (
        <ClaudeCli cwd="/path/to/project">
          Analyze this project.
        </ClaudeCli>
      )

      const plan = await renderPlan(<DirAgent />)

      expect(plan).toContain('<claude-cli')
      expect(plan).toContain('cwd="/path/to/project"')
    })

    test('renders with systemPrompt prop', async () => {
      const SystemAgent = () => (
        <ClaudeCli systemPrompt="You are a security expert.">
          Review this code.
        </ClaudeCli>
      )

      const plan = await renderPlan(<SystemAgent />)

      expect(plan).toContain('<claude-cli')
      expect(plan).toContain('systemPrompt')
    })

    test('renders with nested prompt components', async () => {
      const schema = z.object({
        issues: z.array(z.object({
          file: z.string(),
          description: z.string(),
        })),
      })

      const StructuredAgent = () => (
        <ClaudeCli schema={schema}>
          <Persona role="Senior Engineer">
            You have 10 years of experience.
          </Persona>

          <Constraints>
            - Focus on performance
            - Suggest concrete fixes
          </Constraints>

          Analyze the codebase. Return a JSON object with issues.
        </ClaudeCli>
      )

      const plan = await renderPlan(<StructuredAgent />)

      expect(plan).toContain('<claude-cli>')
      expect(plan).toContain('<persona role="Senior Engineer">')
      expect(plan).toContain('<constraints>')
      expect(plan).toContain('Analyze the codebase.')
    })
  })

  describe('execution in mock mode', () => {
    test('executes and returns mock output', async () => {
      const SimpleAgent = () => (
        <ClaudeCli>
          Analyze the code.
        </ClaudeCli>
      )

      const result = await executePlan(<SimpleAgent />)

      // Mock mode should return the default mock output
      expect(result.output).toBeDefined()
      expect(typeof result.output).toBe('string')
    })

    test('calls onFinished with output', async () => {
      let capturedOutput: string | null = null

      const CallbackAgent = () => (
        <ClaudeCli onFinished={(output) => {
          capturedOutput = output
        }}>
          Complete the task.
        </ClaudeCli>
      )

      await executePlan(<CallbackAgent />)

      expect(capturedOutput).not.toBeNull()
    })

    test('supports multi-phase execution with state', async () => {
      const { createStore } = await import('zustand/vanilla')

      interface State {
        phase: 'research' | 'implement' | 'done'
        findings: string
        setFindings: (findings: string) => void
        setDone: () => void
      }

      const store = createStore<State>((set) => ({
        phase: 'research',
        findings: '',
        setFindings: (findings) => set({ findings, phase: 'implement' }),
        setDone: () => set({ phase: 'done' }),
      }))

      const MultiPhaseAgent = () => {
        const { phase, findings, setFindings, setDone } = store.getState()

        if (phase === 'research') {
          return (
            <ClaudeCli onFinished={setFindings}>
              Research the topic.
            </ClaudeCli>
          )
        }

        if (phase === 'implement') {
          return (
            <ClaudeCli onFinished={setDone}>
              Implement based on: {findings}
            </ClaudeCli>
          )
        }

        return null
      }

      const result = await executePlan(<MultiPhaseAgent />)

      // 2 or 3 frames depending on loop termination behavior
      expect(result.frames).toBeGreaterThanOrEqual(2)
      expect(store.getState().phase).toBe('done')
    })
  })
})
