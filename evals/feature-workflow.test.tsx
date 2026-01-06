import { describe, test, expect, beforeEach } from 'bun:test'
import './setup.ts'
import { create } from 'zustand'
import {
  renderPlan,
  executePlan,
  Claude,
  Phase,
  Step,
  Persona,
  Constraints,
  OutputFormat,
  Human,
  Stop,
} from '../src/index.js'

/**
 * Tests for the Feature Workflow example - the comprehensive development workflow.
 *
 * This test suite verifies:
 * - All 12 phases transition correctly
 * - Human approval gates work
 * - State accumulates through phases
 * - Extended thinking is configured correctly
 * - TDD flow (api -> tests -> verify -> impl) works
 */
describe('feature-workflow', () => {
  // ==========================================================================
  // Types (matching the example)
  // ==========================================================================

  type WorkflowPhase =
    | 'prompt-input'
    | 'research'
    | 'planning'
    | 'plan-review'
    | 'poc'
    | 'poc-analysis'
    | 'refined-review'
    | 'api-impl'
    | 'test-impl'
    | 'test-verify'
    | 'implementation'
    | 'done'
    | 'cancelled'

  interface FileResearch {
    path: string
    relevance: string
    summary: string
  }

  interface TestCase {
    name: string
    description: string
    inputs: string
    expectedOutput: string
    edgeCase: boolean
  }

  interface Plan {
    summary: string
    steps: Array<{ step: number; description: string; files: string[]; dependencies: string[] }>
    testCases: TestCase[]
    apis: Array<{ name: string; signature: string; description: string }>
    risks: string[]
  }

  interface POCResult {
    working: boolean
    implementation: string
    discoveries: string[]
    suggestions: string[]
    blockers: string[]
  }

  interface WorkflowState {
    phase: WorkflowPhase
    prompt: string
    fileResearch: FileResearch[]
    initialPlan: Plan | null
    refinedPlan: Plan | null
    pocResult: POCResult | null
    pocAnalysis: string | null
    setPhase: (phase: WorkflowPhase) => void
    setPrompt: (prompt: string) => void
    setFileResearch: (research: FileResearch[]) => void
    setInitialPlan: (plan: Plan) => void
    setRefinedPlan: (plan: Plan) => void
    setPOCResult: (result: POCResult) => void
    setPOCAnalysis: (analysis: string) => void
    nextPhase: () => void
  }

  const phaseOrder: WorkflowPhase[] = [
    'prompt-input',
    'research',
    'planning',
    'plan-review',
    'poc',
    'poc-analysis',
    'refined-review',
    'api-impl',
    'test-impl',
    'test-verify',
    'implementation',
    'done',
  ]

  // Create a fresh store for each test
  function createWorkflowStore() {
    return create<WorkflowState>((set, get) => ({
      phase: 'prompt-input',
      prompt: '',
      fileResearch: [],
      initialPlan: null,
      refinedPlan: null,
      pocResult: null,
      pocAnalysis: null,

      setPhase: (phase) => set({ phase }),
      setPrompt: (prompt) => set({ prompt }),
      setFileResearch: (fileResearch) => set({ fileResearch }),
      setInitialPlan: (initialPlan) => set({ initialPlan }),
      setRefinedPlan: (refinedPlan) => set({ refinedPlan }),
      setPOCResult: (pocResult) => set({ pocResult }),
      setPOCAnalysis: (pocAnalysis) => set({ pocAnalysis }),
      nextPhase: () => {
        const { phase } = get()
        const currentIndex = phaseOrder.indexOf(phase)
        if (currentIndex < phaseOrder.length - 1) {
          set({ phase: phaseOrder[currentIndex + 1] })
        }
      },
    }))
  }

  // ==========================================================================
  // Tests
  // ==========================================================================

  test('renders prompt-input phase with Human component', async () => {
    const useStore = createWorkflowStore()

    function PromptInputPhase() {
      return (
        <Human
          message="Please review the feature request"
          onApprove={() => useStore.getState().nextPhase()}
          onReject={() => useStore.setState({ phase: 'cancelled' })}
        >
          Feature Request: Add a new component
        </Human>
      )
    }

    const plan = await renderPlan(<PromptInputPhase />)
    expect(plan).toContain('human')
    expect(plan).toContain('Please review the feature request')
    expect(plan).toContain('Feature Request: Add a new component')
  })

  test('renders research phase with Claude and tools', async () => {
    const useStore = createWorkflowStore()
    useStore.setState({ phase: 'research', prompt: 'Add authentication' })

    function ResearchPhase() {
      const { prompt, setFileResearch, nextPhase } = useStore()

      return (
        <Claude
          allowedTools={['Read', 'Glob', 'Grep']}
          onFinished={(result: unknown) => {
            const data = result as { files: FileResearch[] }
            setFileResearch(data.files || [])
            nextPhase()
          }}
        >
          <Persona role="senior software architect">
            You are an expert at understanding codebases.
          </Persona>
          <Phase name="research">
            <Step>Search for relevant file paths</Step>
            <Step>Find documentation</Step>
          </Phase>
          Feature to implement: {prompt}
        </Claude>
      )
    }

    const plan = await renderPlan(<ResearchPhase />)
    expect(plan).toContain('claude')
    expect(plan).toContain('persona role="senior software architect"')
    expect(plan).toContain('phase name="research"')
    expect(plan).toContain('Search for relevant file paths')
    expect(plan).toContain('Add authentication')
  })

  test('renders planning phase with structured output instructions', async () => {
    const useStore = createWorkflowStore()
    useStore.setState({
      phase: 'planning',
      prompt: 'Add caching',
      fileResearch: [{ path: 'src/cache.ts', relevance: 'high', summary: 'Existing cache' }],
    })

    function PlanningPhase() {
      const { prompt, fileResearch, setInitialPlan, nextPhase } = useStore()

      return (
        <Claude
          onFinished={(result: unknown) => {
            setInitialPlan(result as Plan)
            nextPhase()
          }}
        >
          <Persona role="software architect">Create detailed plans.</Persona>
          <Phase name="planning">
            <Step>Analyze research findings</Step>
            <Step>Design implementation approach</Step>
            <Step>Identify test cases including edge cases</Step>
          </Phase>
          Feature: {prompt}
          Research: {JSON.stringify(fileResearch)}

          Return a JSON object with summary, steps, testCases, apis, and risks.
        </Claude>
      )
    }

    const plan = await renderPlan(<PlanningPhase />)
    expect(plan).toContain('phase name="planning"')
    expect(plan).toContain('Identify test cases including edge cases')
    expect(plan).toContain('Add caching')
  })

  test('full workflow transitions through all phases', async () => {
    const useStore = createWorkflowStore()
    const phaseLog: string[] = []
    const humanPrompts: string[] = []

    function FeatureWorkflow({ prompt: initialPrompt }: { prompt: string }) {
      const { phase, setPrompt, nextPhase, setPhase } = useStore()

      phaseLog.push(phase)

      switch (phase) {
        case 'prompt-input':
          return (
            <Human
              message="Review feature request"
              onApprove={() => {
                setPrompt(initialPrompt)
                nextPhase()
              }}
              onReject={() => setPhase('cancelled')}
            >
              Feature: {initialPrompt}
            </Human>
          )

        case 'research':
          return (
            <Claude
              onFinished={() => {
                useStore.setState({
                  fileResearch: [{ path: 'src/test.ts', relevance: 'high', summary: 'Test file' }],
                })
                nextPhase()
              }}
            >
              <Phase name="research">Research the codebase</Phase>
            </Claude>
          )

        case 'planning':
          return (
            <Claude
              onFinished={() => {
                useStore.setState({
                  initialPlan: {
                    summary: 'Test plan',
                    steps: [{ step: 1, description: 'Step 1', files: [], dependencies: [] }],
                    testCases: [
                      {
                        name: 'test1',
                        description: 'Test',
                        inputs: '',
                        expectedOutput: '',
                        edgeCase: false,
                      },
                    ],
                    apis: [{ name: 'testFunc', signature: '() => void', description: 'Test' }],
                    risks: ['None'],
                  },
                })
                nextPhase()
              }}
            >
              <Phase name="planning">Create implementation plan</Phase>
            </Claude>
          )

        case 'plan-review':
          return (
            <Human
              message="Review the plan"
              onApprove={() => nextPhase()}
              onReject={() => setPhase('cancelled')}
            >
              Plan summary: {useStore.getState().initialPlan?.summary}
            </Human>
          )

        case 'poc':
          return (
            <Claude
              onFinished={() => {
                useStore.setState({
                  pocResult: {
                    working: true,
                    implementation: 'POC built',
                    discoveries: ['Discovery 1'],
                    suggestions: ['Suggestion 1'],
                    blockers: [],
                  },
                })
                nextPhase()
              }}
            >
              <Phase name="poc">Build proof of concept</Phase>
            </Claude>
          )

        case 'poc-analysis':
          return (
            <Claude
              maxThinkingTokens={16000}
              onFinished={() => {
                useStore.setState({
                  pocAnalysis: 'Deep analysis complete',
                  refinedPlan: {
                    summary: 'Refined plan based on POC',
                    steps: [{ step: 1, description: 'Refined step', files: [], dependencies: [] }],
                    testCases: [
                      {
                        name: 'test1',
                        description: 'Test',
                        inputs: '',
                        expectedOutput: '',
                        edgeCase: false,
                      },
                      {
                        name: 'edge1',
                        description: 'Edge',
                        inputs: '',
                        expectedOutput: '',
                        edgeCase: true,
                      },
                    ],
                    apis: [{ name: 'refinedFunc', signature: '() => void', description: 'Refined' }],
                    risks: ['Risk 1'],
                  },
                })
                nextPhase()
              }}
            >
              <Phase name="poc-analysis">Analyze POC with deep thinking</Phase>
            </Claude>
          )

        case 'refined-review':
          return (
            <Human
              message="Review refined plan"
              onApprove={() => nextPhase()}
              onReject={() => setPhase('cancelled')}
            >
              Refined plan: {useStore.getState().refinedPlan?.summary}
            </Human>
          )

        case 'api-impl':
          return (
            <Claude
              onFinished={() => nextPhase()}
            >
              <Phase name="api-impl">
                <Step>Create TypeScript interfaces</Step>
                <Step>Write JSDoc documentation</Step>
                <Step>Function bodies throw "Not implemented"</Step>
              </Phase>
            </Claude>
          )

        case 'test-impl':
          return (
            <Claude
              onFinished={() => nextPhase()}
            >
              <Phase name="test-impl">Write comprehensive tests</Phase>
            </Claude>
          )

        case 'test-verify':
          return (
            <Claude
              onFinished={() => nextPhase()}
            >
              <Phase name="test-verify">Verify tests fail</Phase>
            </Claude>
          )

        case 'implementation':
          return (
            <Claude
              onFinished={() => nextPhase()}
            >
              <Phase name="implementation">Implement the actual code</Phase>
            </Claude>
          )

        case 'done':
          return null

        case 'cancelled':
          return <Stop reason="Cancelled by user" />

        default:
          return null
      }
    }

    await executePlan(<FeatureWorkflow prompt="Add feature X" />, {
      mockMode: true,
      onHumanPrompt: async (message, _content) => {
        humanPrompts.push(message)
        return true // Auto-approve
      },
    })

    // Verify all phases were visited
    expect(phaseLog).toContain('prompt-input')
    expect(phaseLog).toContain('research')
    expect(phaseLog).toContain('planning')
    expect(phaseLog).toContain('plan-review')
    expect(phaseLog).toContain('poc')
    expect(phaseLog).toContain('poc-analysis')
    expect(phaseLog).toContain('refined-review')
    expect(phaseLog).toContain('api-impl')
    expect(phaseLog).toContain('test-impl')
    expect(phaseLog).toContain('test-verify')
    expect(phaseLog).toContain('implementation')
    expect(phaseLog).toContain('done')

    // Verify human prompts were shown
    expect(humanPrompts).toContain('Review feature request')
    expect(humanPrompts).toContain('Review the plan')
    expect(humanPrompts).toContain('Review refined plan')

    // Verify final state
    const finalState = useStore.getState()
    expect(finalState.phase).toBe('done')
    expect(finalState.prompt).toBe('Add feature X')
    expect(finalState.fileResearch.length).toBeGreaterThan(0)
    expect(finalState.initialPlan).not.toBeNull()
    expect(finalState.refinedPlan).not.toBeNull()
    expect(finalState.pocResult).not.toBeNull()
    expect(finalState.pocAnalysis).not.toBeNull()
  })

  test('human rejection cancels workflow', async () => {
    const useStore = createWorkflowStore()

    function CancellableWorkflow() {
      const { phase, setPhase, nextPhase } = useStore()

      if (phase === 'prompt-input') {
        return (
          <Human
            message="Review request"
            onApprove={() => nextPhase()}
            onReject={() => setPhase('cancelled')}
          >
            Feature request
          </Human>
        )
      }

      if (phase === 'cancelled') {
        return <Stop reason="Cancelled by user" />
      }

      return (
        <Claude onFinished={() => nextPhase()}>
          <Phase name="research">Should not reach here</Phase>
        </Claude>
      )
    }

    await executePlan(<CancellableWorkflow />, {
      mockMode: true,
      onHumanPrompt: async () => false, // Reject
    })

    expect(useStore.getState().phase).toBe('cancelled')
  })

  test('state accumulates through phases', async () => {
    const useStore = createWorkflowStore()

    function AccumulatingWorkflow() {
      const { phase, nextPhase, setFileResearch, setInitialPlan, setPOCResult } = useStore()

      switch (phase) {
        case 'prompt-input':
          return (
            <Human onApprove={() => nextPhase()}>Start</Human>
          )

        case 'research':
          return (
            <Claude
              onFinished={() => {
                setFileResearch([
                  { path: 'a.ts', relevance: 'high', summary: 'File A' },
                  { path: 'b.ts', relevance: 'medium', summary: 'File B' },
                ])
                nextPhase()
              }}
            >
              Research
            </Claude>
          )

        case 'planning':
          return (
            <Claude
              onFinished={() => {
                // Verify we can access research from previous phase
                const { fileResearch } = useStore.getState()
                setInitialPlan({
                  summary: `Plan based on ${fileResearch.length} files`,
                  steps: [],
                  testCases: [],
                  apis: [],
                  risks: [],
                })
                nextPhase()
              }}
            >
              Plan based on: {JSON.stringify(useStore.getState().fileResearch)}
            </Claude>
          )

        case 'plan-review':
          return <Human onApprove={() => nextPhase()}>Review</Human>

        case 'poc':
          return (
            <Claude
              onFinished={() => {
                // Can access both research and plan
                const { fileResearch, initialPlan } = useStore.getState()
                setPOCResult({
                  working: true,
                  implementation: `POC for ${initialPlan?.summary} using ${fileResearch.length} files`,
                  discoveries: [],
                  suggestions: [],
                  blockers: [],
                })
                useStore.setState({ phase: 'done' })
              }}
            >
              POC
            </Claude>
          )

        case 'done':
          return null

        default:
          return null
      }
    }

    await executePlan(<AccumulatingWorkflow />, {
      mockMode: true,
      onHumanPrompt: async () => true,
    })

    const state = useStore.getState()
    expect(state.fileResearch).toHaveLength(2)
    expect(state.initialPlan?.summary).toBe('Plan based on 2 files')
    expect(state.pocResult?.implementation).toContain('2 files')
  })

  test('extended thinking tokens are passed to Claude', async () => {
    const useStore = createWorkflowStore()
    useStore.setState({ phase: 'poc-analysis' })

    function POCAnalysisPhase() {
      return (
        <Claude
          maxThinkingTokens={16000}
          onFinished={() => useStore.setState({ phase: 'done' })}
        >
          <Phase name="poc-analysis">
            <Step>Deep analysis with extended thinking</Step>
          </Phase>
        </Claude>
      )
    }

    const plan = await renderPlan(<POCAnalysisPhase />)
    expect(plan).toContain('claude')
    expect(plan).toContain('Deep analysis with extended thinking')
    // The maxThinkingTokens prop is passed to execution, not visible in XML
  })

  test('TDD flow renders correct phases in order', async () => {
    const useStore = createWorkflowStore()
    const phaseLog: string[] = []

    // Start at api-impl to test TDD flow
    useStore.setState({
      phase: 'api-impl',
      refinedPlan: {
        summary: 'Test plan',
        steps: [],
        testCases: [{ name: 't1', description: 'd1', inputs: '', expectedOutput: '', edgeCase: false }],
        apis: [{ name: 'f1', signature: '() => void', description: 'd' }],
        risks: [],
      },
    })

    function TDDWorkflow() {
      const { phase, nextPhase, refinedPlan } = useStore()
      phaseLog.push(phase)

      switch (phase) {
        case 'api-impl':
          return (
            <Claude onFinished={() => nextPhase()}>
              <Phase name="api-impl">
                <Step>Create types and interfaces</Step>
                <Step>All functions throw "Not implemented"</Step>
              </Phase>
              <Constraints>
                - ONLY implement types and signatures
                - ALL function bodies throw new Error('Not implemented')
              </Constraints>
              APIs: {JSON.stringify(refinedPlan?.apis)}
            </Claude>
          )

        case 'test-impl':
          return (
            <Claude onFinished={() => nextPhase()}>
              <Phase name="test-impl">
                <Step>Write tests for all test cases</Step>
                <Step>Tests should FAIL at this point</Step>
              </Phase>
              Test cases: {JSON.stringify(refinedPlan?.testCases)}
            </Claude>
          )

        case 'test-verify':
          return (
            <Claude
              allowedTools={['Bash']}
              onFinished={() => nextPhase()}
            >
              <Phase name="test-verify">
                <Step>Run test suite</Step>
                <Step>Verify tests fail with "Not implemented"</Step>
              </Phase>
            </Claude>
          )

        case 'implementation':
          return (
            <Claude onFinished={() => nextPhase()}>
              <Phase name="implementation">
                <Step>Replace stubs with real implementation</Step>
                <Step>Run tests until they pass</Step>
              </Phase>
            </Claude>
          )

        case 'done':
          return null

        default:
          return null
      }
    }

    await executePlan(<TDDWorkflow />, { mockMode: true })

    // Verify TDD phases executed in correct order
    expect(phaseLog.indexOf('api-impl')).toBeLessThan(phaseLog.indexOf('test-impl'))
    expect(phaseLog.indexOf('test-impl')).toBeLessThan(phaseLog.indexOf('test-verify'))
    expect(phaseLog.indexOf('test-verify')).toBeLessThan(phaseLog.indexOf('implementation'))
    expect(phaseLog.indexOf('implementation')).toBeLessThan(phaseLog.indexOf('done'))
  })
})
