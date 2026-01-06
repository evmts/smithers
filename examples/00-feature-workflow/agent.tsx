/**
 * Feature Workflow Example - The Comprehensive Development Workflow
 *
 * This is the flagship example demonstrating Smithers' full capabilities:
 * - Human-in-the-loop approval at multiple checkpoints
 * - Multi-phase research, planning, and implementation
 * - POC-driven refinement cycle
 * - Test-driven development flow
 *
 * Phases:
 * 1. prompt-input     - Get/confirm the feature request
 * 2. research         - Research files, docs, and context
 * 3. planning         - Create implementation plan with test cases
 * 4. plan-review      - Human reviews initial plan
 * 5. poc              - Build proof of concept
 * 6. poc-analysis     - Deep analysis of POC results
 * 7. refined-review   - Human reviews refined plan
 * 8. api-impl         - Implement types and JSDoc (throw not implemented)
 * 9. test-impl        - Implement tests
 * 10. test-verify     - Verify tests fail
 * 11. implementation  - Implement the actual code
 * 12. done            - Complete
 *
 * Run with: bun run examples/00-feature-workflow/agent.tsx "Your feature request"
 */
import { create } from 'zustand'
import {
  executePlan,
  Claude,
  Phase,
  Step,
  Persona,
  Constraints,
  OutputFormat,
  Human,
  Stop,
} from 'smithers'

// =============================================================================
// Types
// =============================================================================

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

interface DocResearch {
  source: string
  content: string
  relevance: string
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
  steps: Array<{
    step: number
    description: string
    files: string[]
    dependencies: string[]
  }>
  testCases: TestCase[]
  apis: Array<{
    name: string
    signature: string
    description: string
  }>
  risks: string[]
}

interface POCResult {
  working: boolean
  implementation: string
  discoveries: string[]
  suggestions: string[]
  blockers: string[]
}

// =============================================================================
// State Management
// =============================================================================

interface WorkflowState {
  phase: WorkflowPhase
  prompt: string

  // Research results
  fileResearch: FileResearch[]
  docResearch: DocResearch[]
  contextResearch: string[]

  // Planning
  initialPlan: Plan | null
  refinedPlan: Plan | null
  humanFeedback: string | null

  // POC
  pocResult: POCResult | null
  pocAnalysis: string | null

  // Implementation
  apiImplementation: string | null
  testImplementation: string | null
  testResults: { passed: boolean; output: string } | null
  finalImplementation: string | null

  // Actions
  setPhase: (phase: WorkflowPhase) => void
  setPrompt: (prompt: string) => void
  setFileResearch: (research: FileResearch[]) => void
  setDocResearch: (research: DocResearch[]) => void
  setContextResearch: (research: string[]) => void
  setInitialPlan: (plan: Plan) => void
  setRefinedPlan: (plan: Plan) => void
  setHumanFeedback: (feedback: string | null) => void
  setPOCResult: (result: POCResult) => void
  setPOCAnalysis: (analysis: string) => void
  setApiImplementation: (impl: string) => void
  setTestImplementation: (impl: string) => void
  setTestResults: (results: { passed: boolean; output: string }) => void
  setFinalImplementation: (impl: string) => void
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

const useWorkflowStore = create<WorkflowState>((set, get) => ({
  phase: 'prompt-input',
  prompt: '',
  fileResearch: [],
  docResearch: [],
  contextResearch: [],
  initialPlan: null,
  refinedPlan: null,
  humanFeedback: null,
  pocResult: null,
  pocAnalysis: null,
  apiImplementation: null,
  testImplementation: null,
  testResults: null,
  finalImplementation: null,

  setPhase: (phase) => set({ phase }),
  setPrompt: (prompt) => set({ prompt }),
  setFileResearch: (fileResearch) => set({ fileResearch }),
  setDocResearch: (docResearch) => set({ docResearch }),
  setContextResearch: (contextResearch) => set({ contextResearch }),
  setInitialPlan: (initialPlan) => set({ initialPlan }),
  setRefinedPlan: (refinedPlan) => set({ refinedPlan }),
  setHumanFeedback: (humanFeedback) => set({ humanFeedback }),
  setPOCResult: (pocResult) => set({ pocResult }),
  setPOCAnalysis: (pocAnalysis) => set({ pocAnalysis }),
  setApiImplementation: (apiImplementation) => set({ apiImplementation }),
  setTestImplementation: (testImplementation) => set({ testImplementation }),
  setTestResults: (testResults) => set({ testResults }),
  setFinalImplementation: (finalImplementation) => set({ finalImplementation }),
  nextPhase: () => {
    const { phase } = get()
    const currentIndex = phaseOrder.indexOf(phase)
    if (currentIndex < phaseOrder.length - 1) {
      set({ phase: phaseOrder[currentIndex + 1] })
    }
  },
}))

// =============================================================================
// Phase Components
// =============================================================================

/**
 * Phase 1: Prompt Input - Confirm the feature request
 */
function PromptInputPhase({ initialPrompt }: { initialPrompt: string }) {
  const { setPrompt, nextPhase } = useWorkflowStore()

  return (
    <Human
      message="Please review the feature request before proceeding"
      onApprove={() => {
        setPrompt(initialPrompt)
        nextPhase()
      }}
      onReject={() => {
        useWorkflowStore.setState({ phase: 'cancelled' })
      }}
    >
      Feature Request: {initialPrompt}
    </Human>
  )
}

/**
 * Phase 2: Research - Gather context from files, docs, and codebase
 */
function ResearchPhase() {
  const { prompt, setFileResearch, setDocResearch, setContextResearch, nextPhase } =
    useWorkflowStore()

  return (
    <Claude
      allowedTools={['Read', 'Glob', 'Grep', 'WebFetch']}
      onFinished={(result: unknown) => {
        const data = result as {
          files: FileResearch[]
          docs: DocResearch[]
          context: string[]
        }
        setFileResearch(data.files || [])
        setDocResearch(data.docs || [])
        setContextResearch(data.context || [])
        nextPhase()
      }}
    >
      <Persona role="senior software architect">
        You are an expert at understanding codebases and gathering comprehensive
        context for feature implementation. You explore thoroughly before acting.
      </Persona>

      <Phase name="research">
        <Step>Search for relevant file paths that relate to this feature</Step>
        <Step>Look for existing patterns and conventions in the codebase</Step>
        <Step>Find any documentation or README files that provide context</Step>
        <Step>Identify dependencies and related modules</Step>
        <Step>Note any potential integration points or conflicts</Step>
      </Phase>

      <Constraints>
        - Focus on understanding, not implementing
        - Be thorough - better to gather too much context than too little
        - Document your reasoning for why each finding is relevant
      </Constraints>

      Feature to implement: {prompt}

      <OutputFormat
        schema={{
          type: 'object',
          properties: {
            files: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  path: { type: 'string' },
                  relevance: { type: 'string' },
                  summary: { type: 'string' },
                },
              },
            },
            docs: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  source: { type: 'string' },
                  content: { type: 'string' },
                  relevance: { type: 'string' },
                },
              },
            },
            context: {
              type: 'array',
              items: { type: 'string' },
              description: 'Other relevant findings and observations',
            },
          },
        }}
      >
        Return a JSON object with "files", "docs", and "context" arrays.
      </OutputFormat>
    </Claude>
  )
}

/**
 * Phase 3: Planning - Create detailed implementation plan
 */
function PlanningPhase() {
  const { prompt, fileResearch, docResearch, contextResearch, setInitialPlan, nextPhase } =
    useWorkflowStore()

  return (
    <Claude
      onFinished={(result: unknown) => {
        const plan = result as Plan
        setInitialPlan(plan)
        nextPhase()
      }}
    >
      <Persona role="software architect">
        You are a meticulous architect who creates detailed, actionable plans.
        You think deeply about edge cases, test scenarios, and potential issues.
      </Persona>

      <Phase name="planning">
        <Step>Analyze the research findings</Step>
        <Step>Design the implementation approach</Step>
        <Step>Break down into concrete steps with file mappings</Step>
        <Step>Identify test cases including edge cases and corner cases</Step>
        <Step>Define the public API surface</Step>
        <Step>Document risks and mitigations</Step>
      </Phase>

      <Constraints>
        - Every step must be actionable and specific
        - Test cases should cover happy paths, edge cases, and error scenarios
        - API definitions should include TypeScript signatures
        - Consider backwards compatibility
      </Constraints>

      Feature to implement: {prompt}

      Research findings:
      Files: {JSON.stringify(fileResearch, null, 2)}
      Docs: {JSON.stringify(docResearch, null, 2)}
      Context: {JSON.stringify(contextResearch, null, 2)}

      <OutputFormat
        schema={{
          type: 'object',
          properties: {
            summary: { type: 'string' },
            steps: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  step: { type: 'number' },
                  description: { type: 'string' },
                  files: { type: 'array', items: { type: 'string' } },
                  dependencies: { type: 'array', items: { type: 'string' } },
                },
              },
            },
            testCases: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  name: { type: 'string' },
                  description: { type: 'string' },
                  inputs: { type: 'string' },
                  expectedOutput: { type: 'string' },
                  edgeCase: { type: 'boolean' },
                },
              },
            },
            apis: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  name: { type: 'string' },
                  signature: { type: 'string' },
                  description: { type: 'string' },
                },
              },
            },
            risks: { type: 'array', items: { type: 'string' } },
          },
        }}
      >
        Return a JSON object with the complete implementation plan.
      </OutputFormat>
    </Claude>
  )
}

/**
 * Phase 4: Plan Review - Human approves/modifies/rejects plan
 */
function PlanReviewPhase() {
  const { initialPlan, setHumanFeedback, nextPhase, setPhase } = useWorkflowStore()

  return (
    <Human
      message="Review the implementation plan. Approve to continue, reject to cancel."
      onApprove={() => {
        setHumanFeedback(null)
        nextPhase()
      }}
      onReject={() => {
        setPhase('cancelled')
      }}
    >
      Implementation Plan:

      Summary: {initialPlan?.summary}

      Steps:
      {initialPlan?.steps?.map((s, i) => `${i + 1}. ${s.description}`).join('\n')}

      Test Cases ({initialPlan?.testCases?.length}):
      {initialPlan?.testCases?.map((t) => `- ${t.name}${t.edgeCase ? ' (edge case)' : ''}`).join('\n')}

      APIs:
      {initialPlan?.apis?.map((a) => `- ${a.name}: ${a.signature}`).join('\n')}

      Risks:
      {initialPlan?.risks?.map((r) => `- ${r}`).join('\n')}
    </Human>
  )
}

/**
 * Phase 5: POC - Build a working proof of concept
 */
function POCPhase() {
  const { prompt, initialPlan, fileResearch, setPOCResult, nextPhase } = useWorkflowStore()

  return (
    <Claude
      allowedTools={['Read', 'Write', 'Edit', 'Bash', 'Glob', 'Grep']}
      onFinished={(result: unknown) => {
        const poc = result as POCResult
        setPOCResult(poc)
        nextPhase()
      }}
    >
      <Persona role="rapid prototyping engineer">
        You build quick, working prototypes to validate approaches. You prioritize
        getting something working over perfection. The goal is to learn and inform
        the final implementation.
      </Persona>

      <Phase name="poc">
        <Step>Implement the minimum viable version of the feature</Step>
        <Step>Focus on the core functionality, skip edge cases for now</Step>
        <Step>Test that the basic flow works</Step>
        <Step>Document what you learned and discovered</Step>
        <Step>Note suggestions for improving the plan</Step>
      </Phase>

      <Constraints>
        - Build a WORKING proof of concept, not production code
        - Goal is to validate the approach and discover unknowns
        - Document discoveries, blockers, and suggestions for the real implementation
        - Keep it simple - this is throwaway code to inform the plan
      </Constraints>

      Feature: {prompt}
      Plan: {JSON.stringify(initialPlan, null, 2)}
      Relevant files: {JSON.stringify(fileResearch, null, 2)}

      <OutputFormat
        schema={{
          type: 'object',
          properties: {
            working: { type: 'boolean' },
            implementation: { type: 'string', description: 'Brief description of what was built' },
            discoveries: { type: 'array', items: { type: 'string' } },
            suggestions: { type: 'array', items: { type: 'string' } },
            blockers: { type: 'array', items: { type: 'string' } },
          },
        }}
      >
        Return a JSON object describing the POC results.
      </OutputFormat>
    </Claude>
  )
}

/**
 * Phase 6: POC Analysis - Deep analysis with extended thinking
 */
function POCAnalysisPhase() {
  const { prompt, initialPlan, pocResult, setPOCAnalysis, setRefinedPlan, nextPhase } =
    useWorkflowStore()

  return (
    <Claude
      maxThinkingTokens={16000}
      onFinished={(result: unknown) => {
        const data = result as { analysis: string; refinedPlan: Plan }
        setPOCAnalysis(data.analysis)
        setRefinedPlan(data.refinedPlan)
        nextPhase()
      }}
    >
      <Persona role="senior architect conducting thorough analysis">
        You are conducting a deep, thorough analysis of the POC results to refine
        the implementation plan. Use extended thinking to consider all angles,
        edge cases, and potential improvements.
      </Persona>

      <Phase name="poc-analysis">
        <Step>Analyze POC discoveries and their implications</Step>
        <Step>Identify gaps in the original plan</Step>
        <Step>Think deeply about additional test cases needed</Step>
        <Step>Refine API designs based on learnings</Step>
        <Step>Update implementation steps with new insights</Step>
        <Step>Add detailed documentation requirements</Step>
      </Phase>

      <Constraints>
        - Use extended thinking to reason through complex implications
        - The refined plan should be MORE thorough than the original
        - Include detailed API documentation with JSDoc comments
        - Add comprehensive test cases including all edge cases from POC
        - Consider error handling and recovery scenarios
      </Constraints>

      Original feature: {prompt}
      Original plan: {JSON.stringify(initialPlan, null, 2)}
      POC results: {JSON.stringify(pocResult, null, 2)}

      <OutputFormat
        schema={{
          type: 'object',
          properties: {
            analysis: { type: 'string', description: 'Detailed analysis of POC learnings' },
            refinedPlan: {
              type: 'object',
              description: 'The updated, more thorough plan',
              properties: {
                summary: { type: 'string' },
                steps: { type: 'array' },
                testCases: { type: 'array' },
                apis: { type: 'array' },
                risks: { type: 'array' },
              },
            },
          },
        }}
      >
        Return JSON with "analysis" string and "refinedPlan" object.
      </OutputFormat>
    </Claude>
  )
}

/**
 * Phase 7: Refined Plan Review - Human reviews the improved plan
 */
function RefinedPlanReviewPhase() {
  const { refinedPlan, pocAnalysis, nextPhase, setPhase } = useWorkflowStore()

  return (
    <Human
      message="Review the refined plan based on POC learnings. This plan includes detailed APIs, documentation, and test cases."
      onApprove={() => nextPhase()}
      onReject={() => setPhase('cancelled')}
    >
      POC Analysis:
      {pocAnalysis}

      Refined Implementation Plan:

      Summary: {refinedPlan?.summary}

      Steps:
      {refinedPlan?.steps?.map((s, i) => `${i + 1}. ${s.description}`).join('\n')}

      Test Cases ({refinedPlan?.testCases?.length}):
      {refinedPlan?.testCases?.map((t) => `- ${t.name}: ${t.description}${t.edgeCase ? ' (EDGE CASE)' : ''}`).join('\n')}

      APIs:
      {refinedPlan?.apis?.map((a) => `- ${a.name}\n  ${a.signature}\n  ${a.description}`).join('\n\n')}

      Risks:
      {refinedPlan?.risks?.map((r) => `- ${r}`).join('\n')}
    </Human>
  )
}

/**
 * Phase 8: API Implementation - Types and JSDoc with throw not implemented
 */
function APIImplementationPhase() {
  const { prompt, refinedPlan, setApiImplementation, nextPhase } = useWorkflowStore()

  return (
    <Claude
      allowedTools={['Read', 'Write', 'Edit', 'Glob', 'Grep']}
      onFinished={(result: unknown) => {
        const data = result as { implementation: string }
        setApiImplementation(data.implementation)
        nextPhase()
      }}
    >
      <Persona role="TypeScript API designer">
        You design clean, well-documented TypeScript APIs. You focus on types,
        interfaces, and JSDoc documentation. Implementation comes later.
      </Persona>

      <Phase name="api-implementation">
        <Step>Create TypeScript interfaces and types</Step>
        <Step>Write comprehensive JSDoc documentation</Step>
        <Step>Implement function signatures with "throw not implemented" bodies</Step>
        <Step>Export public API surface</Step>
      </Phase>

      <Constraints>
        - ONLY implement types, interfaces, and function signatures
        - ALL function bodies should throw new Error('Not implemented')
        - Include detailed JSDoc with @param, @returns, @throws, @example
        - Follow existing code conventions in the project
        - This is the API contract - implementation comes later
      </Constraints>

      Feature: {prompt}
      Plan: {JSON.stringify(refinedPlan, null, 2)}

      <OutputFormat>
        Return a JSON object with "implementation" describing what was created.
      </OutputFormat>
    </Claude>
  )
}

/**
 * Phase 9: Test Implementation - Write comprehensive tests
 */
function TestImplementationPhase() {
  const { prompt, refinedPlan, setTestImplementation, nextPhase } = useWorkflowStore()

  return (
    <Claude
      allowedTools={['Read', 'Write', 'Edit', 'Glob', 'Grep']}
      onFinished={(result: unknown) => {
        const data = result as { implementation: string }
        setTestImplementation(data.implementation)
        nextPhase()
      }}
    >
      <Persona role="test engineer">
        You write comprehensive, well-organized tests that verify behavior and
        catch edge cases. Tests should be clear and serve as documentation.
      </Persona>

      <Phase name="test-implementation">
        <Step>Write tests for all planned test cases</Step>
        <Step>Include setup and teardown as needed</Step>
        <Step>Test error handling and edge cases</Step>
        <Step>Organize tests into logical groups</Step>
      </Phase>

      <Constraints>
        - Implement ALL test cases from the plan
        - Tests should be runnable but EXPECTED TO FAIL (code not implemented yet)
        - Use descriptive test names that explain the behavior
        - Include edge case tests and error scenario tests
        - Follow existing test patterns in the project
      </Constraints>

      Feature: {prompt}
      Test cases: {JSON.stringify(refinedPlan?.testCases, null, 2)}

      <OutputFormat>
        Return a JSON object with "implementation" describing what tests were created.
      </OutputFormat>
    </Claude>
  )
}

/**
 * Phase 10: Test Verification - Verify tests fail
 */
function TestVerificationPhase() {
  const { setTestResults, nextPhase } = useWorkflowStore()

  return (
    <Claude
      allowedTools={['Bash', 'Read']}
      onFinished={(result: unknown) => {
        const data = result as { passed: boolean; output: string }
        setTestResults(data)
        nextPhase()
      }}
    >
      <Persona role="QA engineer">
        You verify that tests are working correctly and failing as expected
        when implementation is missing.
      </Persona>

      <Phase name="test-verification">
        <Step>Run the test suite</Step>
        <Step>Verify tests fail with "Not implemented" errors</Step>
        <Step>Confirm test structure is correct</Step>
      </Phase>

      <Constraints>
        - Tests SHOULD fail at this point (implementation not done)
        - Verify the failures are due to "Not implemented" errors
        - If tests pass unexpectedly, that's a problem to report
      </Constraints>

      <OutputFormat>
        Return JSON with "passed" (boolean) and "output" (test output summary).
      </OutputFormat>
    </Claude>
  )
}

/**
 * Phase 11: Implementation - Implement the actual code
 */
function ImplementationPhase() {
  const { prompt, refinedPlan, setFinalImplementation, nextPhase } = useWorkflowStore()

  return (
    <Claude
      allowedTools={['Read', 'Write', 'Edit', 'Bash', 'Glob', 'Grep']}
      onFinished={(result: unknown) => {
        const data = result as { implementation: string }
        setFinalImplementation(data.implementation)
        nextPhase()
      }}
    >
      <Persona role="senior software engineer">
        You implement production-quality code that passes all tests and follows
        best practices. You focus on correctness, readability, and maintainability.
      </Persona>

      <Phase name="implementation">
        <Step>Replace "throw not implemented" with actual implementation</Step>
        <Step>Follow the refined plan step by step</Step>
        <Step>Run tests after each major change</Step>
        <Step>Ensure all tests pass</Step>
        <Step>Clean up and refactor as needed</Step>
      </Phase>

      <Constraints>
        - Implement according to the refined plan
        - All tests must pass when complete
        - Follow existing code style and patterns
        - Handle all error cases documented in the plan
        - Keep changes focused - don't over-engineer
      </Constraints>

      Feature: {prompt}
      Plan: {JSON.stringify(refinedPlan, null, 2)}

      <OutputFormat>
        Return JSON with "implementation" describing what was implemented.
      </OutputFormat>
    </Claude>
  )
}

// =============================================================================
// Main Orchestrator
// =============================================================================

export function FeatureWorkflow({ prompt: initialPrompt }: { prompt: string }) {
  const { phase } = useWorkflowStore()

  console.log(`[FeatureWorkflow] Phase: ${phase}`)

  switch (phase) {
    case 'prompt-input':
      return <PromptInputPhase initialPrompt={initialPrompt} />
    case 'research':
      return <ResearchPhase />
    case 'planning':
      return <PlanningPhase />
    case 'plan-review':
      return <PlanReviewPhase />
    case 'poc':
      return <POCPhase />
    case 'poc-analysis':
      return <POCAnalysisPhase />
    case 'refined-review':
      return <RefinedPlanReviewPhase />
    case 'api-impl':
      return <APIImplementationPhase />
    case 'test-impl':
      return <TestImplementationPhase />
    case 'test-verify':
      return <TestVerificationPhase />
    case 'implementation':
      return <ImplementationPhase />
    case 'done':
      console.log('\n=== Feature Implementation Complete ===')
      const state = useWorkflowStore.getState()
      console.log('Final implementation:', state.finalImplementation)
      return null
    case 'cancelled':
      return <Stop reason="Workflow cancelled by user" />
    default:
      return null
  }
}

// =============================================================================
// Execution
// =============================================================================

async function main() {
  const prompt =
    process.argv[2] || 'Add a new OutputFormat component that validates JSON schema output'

  console.log(`\n${'='.repeat(60)}`)
  console.log('Feature Workflow - Comprehensive Development Process')
  console.log('='.repeat(60))
  console.log(`\nFeature: "${prompt}"\n`)
  console.log('Phases: prompt-input -> research -> planning -> plan-review')
  console.log('        -> poc -> poc-analysis -> refined-review')
  console.log('        -> api-impl -> test-impl -> test-verify -> implementation\n')

  const result = await executePlan(<FeatureWorkflow prompt={prompt} />, {
    verbose: true,
    onFrame: (frame) => {
      console.log(`\n[Frame ${frame.frame}] Executed: ${frame.executedNodes.join(', ')}`)
    },
    onHumanPrompt: async (message, content) => {
      console.log('\n' + '='.repeat(60))
      console.log('HUMAN REVIEW REQUIRED')
      console.log('='.repeat(60))
      console.log(`Message: ${message}`)
      console.log(`Content:\n${content}`)
      console.log('='.repeat(60))
      // Auto-approve for demo - in real usage this would be interactive
      console.log('[Auto-approving for demo]')
      return true
    },
  })

  console.log('\n' + '='.repeat(60))
  console.log('Execution Summary')
  console.log('='.repeat(60))
  console.log(`Total frames: ${result.frames}`)
  console.log(`Duration: ${result.totalDuration}ms`)

  const finalState = useWorkflowStore.getState()
  console.log(`\nFinal phase: ${finalState.phase}`)
  console.log(`Files researched: ${finalState.fileResearch.length}`)
  console.log(`Test cases: ${finalState.refinedPlan?.testCases.length || 0}`)
  console.log(`APIs defined: ${finalState.refinedPlan?.apis.length || 0}`)
}

main().catch(console.error)

// Export for module usage
export { useWorkflowStore }
export default <FeatureWorkflow prompt="Add a new feature" />
