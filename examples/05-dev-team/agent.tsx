/**
 * Development Team Example
 *
 * A complete multi-agent system with Architect, Developer, and Reviewer roles.
 * Demonstrates complex orchestration patterns and inter-agent communication.
 *
 * Flow: Architect -> Developer (per subtask) -> Reviewer -> Done
 *
 * Run with: bun run examples/05-dev-team/agent.tsx
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
  type Tool,
} from 'smithers'

// =============================================================================
// Types
// =============================================================================

interface Subtask {
  id: string
  name: string
  description: string
  dependencies: string[]
  status: 'pending' | 'in_progress' | 'complete' | 'needs_revision'
  implementation?: string
  reviewNotes?: string
}

interface DevTeamState {
  stage: 'planning' | 'implementing' | 'reviewing' | 'done'
  task: string
  plan: {
    overview: string
    subtasks: Subtask[]
  } | null
  currentSubtask: string | null
  reviewResult: {
    approved: boolean
    notes: string[]
    requiredChanges: string[]
  } | null

  // Actions
  setPlan: (plan: DevTeamState['plan']) => void
  startSubtask: (id: string) => void
  completeSubtask: (id: string, implementation: string) => void
  setReviewResult: (result: DevTeamState['reviewResult']) => void
  requestRevision: (subtaskId: string, notes: string) => void
  nextStage: () => void
}

// =============================================================================
// State Management
// =============================================================================

const useDevTeam = create<DevTeamState>((set, get) => ({
  stage: 'planning',
  task: '',
  plan: null,
  currentSubtask: null,
  reviewResult: null,

  setPlan: (plan) => set({ plan }),

  startSubtask: (id) => {
    set((state) => ({
      currentSubtask: id,
      plan: state.plan
        ? {
            ...state.plan,
            subtasks: state.plan.subtasks.map((s) =>
              s.id === id ? { ...s, status: 'in_progress' } : s
            ),
          }
        : null,
    }))
  },

  completeSubtask: (id, implementation) => {
    set((state) => ({
      currentSubtask: null,
      plan: state.plan
        ? {
            ...state.plan,
            subtasks: state.plan.subtasks.map((s) =>
              s.id === id ? { ...s, status: 'complete', implementation } : s
            ),
          }
        : null,
    }))
  },

  setReviewResult: (result) => set({ reviewResult: result }),

  requestRevision: (subtaskId, notes) => {
    set((state) => ({
      stage: 'implementing',
      plan: state.plan
        ? {
            ...state.plan,
            subtasks: state.plan.subtasks.map((s) =>
              s.id === subtaskId
                ? { ...s, status: 'needs_revision', reviewNotes: notes }
                : s
            ),
          }
        : null,
    }))
  },

  nextStage: () => {
    const { stage, plan } = get()

    if (stage === 'planning') {
      set({ stage: 'implementing' })
    } else if (stage === 'implementing') {
      // Check if all subtasks are complete
      const allComplete = plan?.subtasks.every((s) => s.status === 'complete')
      if (allComplete) {
        set({ stage: 'reviewing' })
      }
    } else if (stage === 'reviewing') {
      set({ stage: 'done' })
    }
  },
}))

// =============================================================================
// Tools
// =============================================================================

const fileSystemTool: Tool = {
  name: 'fileSystem',
  description: 'Read and write files',
  input_schema: {
    type: 'object',
    properties: {
      action: { type: 'string', enum: ['read', 'write', 'list'] },
      path: { type: 'string' },
      content: { type: 'string' },
    },
    required: ['action', 'path'],
  },
  execute: async (args: unknown) => {
    const { action, path, content } = args as {
      action: string
      path: string
      content?: string
    }
    if (action === 'write') {
      console.log(`[FileSystem] Writing to ${path}`)
      return { success: true, path }
    }
    if (action === 'read') {
      return { content: `// Contents of ${path}` }
    }
    return { files: ['file1.ts', 'file2.ts'] }
  },
}

const runTestsTool: Tool = {
  name: 'runTests',
  description: 'Run the test suite',
  input_schema: {
    type: 'object',
    properties: {
      pattern: { type: 'string', description: 'Test file pattern' },
    },
  },
  execute: async () => {
    console.log('[Tests] Running test suite...')
    return { passed: 12, failed: 0, total: 12 }
  },
}

const lintTool: Tool = {
  name: 'lint',
  description: 'Run linter on code',
  input_schema: {
    type: 'object',
    properties: {
      path: { type: 'string' },
    },
  },
  execute: async () => {
    return { errors: 0, warnings: 2 }
  },
}

// =============================================================================
// Agent Components
// =============================================================================

/**
 * Architect Agent - Plans the implementation
 */
function Architect({ task }: { task: string }) {
  const { setPlan, nextStage } = useDevTeam()

  return (
    <Claude
      tools={[fileSystemTool]}
      onFinished={(result: unknown) => {
        const data = result as DevTeamState['plan']
        console.log('[Architect] Plan created with', data?.subtasks.length, 'subtasks')
        setPlan(data)
        nextStage()
      }}
    >
      <Persona role="software architect">
        You are a senior software architect with expertise in system design,
        clean architecture, and breaking down complex tasks into manageable pieces.
      </Persona>

      <Constraints>
        - Break the task into 2-4 focused subtasks
        - Each subtask should be independently implementable
        - Define clear interfaces between components
        - Consider testability in your design
        - Identify dependencies between subtasks
      </Constraints>

      <Phase name="planning">
        <Step>Analyze the requirements for: {task}</Step>
        <Step>Review existing codebase for context</Step>
        <Step>Design the solution architecture</Step>
        <Step>Break down into subtasks with dependencies</Step>
      </Phase>

      <OutputFormat schema={{
        type: 'object',
        properties: {
          overview: { type: 'string' },
          subtasks: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                name: { type: 'string' },
                description: { type: 'string' },
                dependencies: { type: 'array', items: { type: 'string' } },
              },
            },
          },
        },
      }}>
        Return a JSON object with "overview" (string) and "subtasks" array.
        Each subtask needs: id, name, description, dependencies (array of subtask ids).
      </OutputFormat>
    </Claude>
  )
}

/**
 * Developer Agent - Implements a single subtask
 */
function Developer({ subtask }: { subtask: Subtask }) {
  const { completeSubtask, nextStage, plan } = useDevTeam()

  // Check if dependencies are complete
  const deps = subtask.dependencies
  const depsComplete = deps.every((depId) =>
    plan?.subtasks.find((s) => s.id === depId)?.status === 'complete'
  )

  if (!depsComplete) {
    console.log(`[Developer] Waiting for dependencies: ${deps.join(', ')}`)
    return null
  }

  return (
    <Claude
      tools={[fileSystemTool]}
      onFinished={(result: unknown) => {
        const data = result as { implementation: string; files: string[] }
        console.log(`[Developer] Completed: ${subtask.name}`)
        completeSubtask(subtask.id, data.implementation)
        nextStage()
      }}
    >
      <Persona role="senior developer">
        You are a senior developer who writes clean, tested, maintainable code.
        You follow best practices and write comprehensive tests.
      </Persona>

      <Constraints>
        - Write TypeScript with strict types
        - Include unit tests for new code
        - Follow existing code patterns
        - Document public APIs with JSDoc
        - Handle edge cases and errors gracefully
      </Constraints>

      <Phase name="implement">
        <Step>Review the subtask requirements</Step>
        <Step>Implement the feature</Step>
        <Step>Write unit tests</Step>
        <Step>Save files to the repository</Step>
      </Phase>

      Subtask: {subtask.name}
      Description: {subtask.description}
      {subtask.reviewNotes && `\nRevision notes: ${subtask.reviewNotes}`}

      <OutputFormat>
        Return JSON with "implementation" (description of what was built) and
        "files" (array of file paths that were created/modified).
      </OutputFormat>
    </Claude>
  )
}

/**
 * Reviewer Agent - Reviews all implementations
 */
function Reviewer() {
  const { plan, setReviewResult, requestRevision, nextStage } = useDevTeam()

  return (
    <Claude
      tools={[fileSystemTool, runTestsTool, lintTool]}
      onFinished={(result: unknown) => {
        const data = result as {
          approved: boolean
          notes: string[]
          requiredChanges: { subtaskId: string; change: string }[]
        }
        console.log(`[Reviewer] Review complete: ${data.approved ? 'APPROVED' : 'CHANGES REQUESTED'}`)

        if (data.approved) {
          setReviewResult({
            approved: true,
            notes: data.notes,
            requiredChanges: [],
          })
          nextStage()
        } else {
          // Request revisions for specific subtasks
          data.requiredChanges.forEach((change) => {
            requestRevision(change.subtaskId, change.change)
          })
        }
      }}
    >
      <Persona role="tech lead">
        You are a meticulous tech lead who ensures code quality, correctness,
        and adherence to best practices. You provide constructive feedback.
      </Persona>

      <Constraints>
        - Run the full test suite
        - Check for linting errors
        - Review code for security issues
        - Verify edge cases are handled
        - Ensure documentation is complete
        - Be constructive in feedback
      </Constraints>

      <Phase name="review">
        <Step>Run the test suite</Step>
        <Step>Run the linter</Step>
        <Step>Review each implementation</Step>
        <Step>Check for security vulnerabilities</Step>
        <Step>Verify documentation</Step>
        <Step>Compile review feedback</Step>
      </Phase>

      Here are the implementations to review:

      {plan?.subtasks.map((s) => (
        `## ${s.name}\n${s.description}\n\nImplementation: ${s.implementation}\n\n`
      )).join('')}

      <OutputFormat>
        Return JSON with:
        - "approved": boolean
        - "notes": array of general feedback strings
        - "requiredChanges": array of {"{"}subtaskId, change{"}"} if not approved
      </OutputFormat>
    </Claude>
  )
}

// =============================================================================
// Orchestrator
// =============================================================================

function DevTeam({ task }: { task: string }) {
  const { stage, plan, currentSubtask, reviewResult, startSubtask } = useDevTeam()

  console.log(`[DevTeam] Stage: ${stage}`)

  switch (stage) {
    case 'planning':
      return <Architect task={task} />

    case 'implementing':
      if (!plan) return null

      // Find the next subtask to work on
      const pendingSubtasks = plan.subtasks.filter(
        (s) => s.status === 'pending' || s.status === 'needs_revision'
      )

      if (pendingSubtasks.length === 0) {
        // Check if we should move to reviewing
        const allComplete = plan.subtasks.every((s) => s.status === 'complete')
        if (allComplete) {
          useDevTeam.getState().nextStage()
          return null
        }
        return null // Waiting for in-progress subtasks
      }

      // Find a subtask whose dependencies are met
      const nextSubtask = pendingSubtasks.find((s) =>
        s.dependencies.every(
          (depId) => plan.subtasks.find((d) => d.id === depId)?.status === 'complete'
        )
      )

      if (!nextSubtask) {
        console.log('[DevTeam] Waiting for dependencies...')
        return null
      }

      if (currentSubtask !== nextSubtask.id) {
        startSubtask(nextSubtask.id)
      }

      return <Developer subtask={nextSubtask} />

    case 'reviewing':
      return <Reviewer />

    case 'done':
      console.log('\n=== Development Complete ===')
      console.log('\nPlan Overview:', plan?.overview)
      console.log('\nSubtasks:')
      plan?.subtasks.forEach((s) => {
        console.log(`  - ${s.name}: ${s.status}`)
      })
      console.log('\nReview:', reviewResult?.approved ? 'APPROVED' : 'PENDING')
      reviewResult?.notes.forEach((note) => console.log(`  - ${note}`))
      return null

    default:
      return null
  }
}

// =============================================================================
// Execution
// =============================================================================

async function main() {
  const task = process.argv[2] || 'Add user authentication with email/password and OAuth support'

  console.log(`\nStarting Development Team`)
  console.log(`Task: ${task}\n`)
  console.log('Workflow: Architect -> Developer (per subtask) -> Reviewer\n')

  // Initialize the task in state
  useDevTeam.setState({ task })

  const result = await executePlan(<DevTeam task={task} />, {
    verbose: true,
    onFrame: (frame) => {
      console.log(`\n[Frame ${frame.frame}] Executed: ${frame.executedNodes.join(', ')}`)
      console.log(`  Duration: ${frame.duration}ms`)
    },
  })

  console.log('\n=== Execution Summary ===')
  console.log('Total frames:', result.frames)
  console.log('Duration:', result.totalDuration, 'ms')
  console.log('MCP servers used:', result.mcpServers?.join(', ') || 'none')

  // Final state
  const state = useDevTeam.getState()
  console.log('\n=== Final Project State ===')
  console.log('Stage:', state.stage)
  console.log('Subtasks completed:', state.plan?.subtasks.filter((s) => s.status === 'complete').length)
  console.log('Review approved:', state.reviewResult?.approved)
}

main().catch(console.error)

// Export
export { DevTeam, Architect, Developer, Reviewer, useDevTeam }
export default <DevTeam task="Build a REST API for user management" />
