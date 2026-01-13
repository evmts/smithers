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
import { createStore } from 'solid-js/store'
import {
  executePlan,
  Claude,
  Phase,
  Step,
  Persona,
  Constraints,
  OutputFormat,
  type Tool,
} from '@evmts/smithers'

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
    requiredChanges: { subtaskId: string; change: string }[]
  } | null
}

// =============================================================================
// State Management
// =============================================================================

const [store, setStore] = createStore<DevTeamState>({
  stage: 'planning',
  task: '',
  plan: null,
  currentSubtask: null,
  reviewResult: null,
})

const actions = {
  setTask: (task: string) => setStore('task', task),

  setPlan: (plan: DevTeamState['plan']) => {
    const normalized = plan
      ? {
          ...plan,
          subtasks: plan.subtasks.map((subtask) => ({
            ...subtask,
            status: 'pending' as const,
          })),
        }
      : null

    setStore('plan', normalized)
  },

  startSubtask: (id: string) => {
    setStore('currentSubtask', id)
    if (store.plan) {
      setStore('plan', 'subtasks', (s) => s.id === id, 'status', 'in_progress')
    }
  },

  completeSubtask: (id: string, implementation: string) => {
    setStore('currentSubtask', null)
    if (store.plan) {
      setStore('plan', 'subtasks', (s) => s.id === id, { status: 'complete', implementation })
    }
  },

  setReviewResult: (result: DevTeamState['reviewResult']) => setStore('reviewResult', result),

  requestRevision: (subtaskId: string, notes: string) => {
    setStore('stage', 'implementing')
    if (store.plan) {
      setStore('plan', 'subtasks', (s) => s.id === subtaskId, { status: 'needs_revision', reviewNotes: notes })
    }
  },

  nextStage: () => {
    if (store.stage === 'planning') {
      setStore('stage', 'implementing')
    } else if (store.stage === 'implementing') {
      // Check if all subtasks are complete
      const allComplete = store.plan?.subtasks.every((s) => s.status === 'complete')
      if (allComplete) {
        setStore('stage', 'reviewing')
      }
    } else if (store.stage === 'reviewing') {
      setStore('stage', 'done')
    }
  },
}

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
  return (
    <Claude
      tools={[fileSystemTool]}
      onFinished={(result: unknown) => {
        const data = result as DevTeamState['plan']
        console.log('[Architect] Plan created with', data?.subtasks.length, 'subtasks')
        actions.setPlan(data)
        actions.nextStage()
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
  // Check if dependencies are complete
  const deps = subtask.dependencies
  const depsComplete = deps.every((depId) =>
    store.plan?.subtasks.find((s) => s.id === depId)?.status === 'complete'
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
        actions.completeSubtask(subtask.id, data.implementation)
        actions.nextStage()
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
          actions.setReviewResult({
            approved: true,
            notes: data.notes,
            requiredChanges: [],
          })
          actions.nextStage()
        } else {
          // Request revisions for specific subtasks
          data.requiredChanges.forEach((change) => {
            actions.requestRevision(change.subtaskId, change.change)
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

      {store.plan?.subtasks.map((s) => (
        `## ${s.name}\n${s.description}\n\nImplementation: ${s.implementation}\n\n`
      )).join('')}

      <OutputFormat>
        Return JSON with:
        - "approved": boolean
        - "notes": array of general feedback strings
        - "requiredChanges": array of {"{"}"subtaskId", "change"{"}"} if not approved
      </OutputFormat>
    </Claude>
  )
}

// =============================================================================
// Orchestrator
// =============================================================================

function DevTeam({ task }: { task: string }) {
  console.log(`[DevTeam] Stage: ${store.stage}`)

  // Return closure for reactivity
  return () => {
    switch (store.stage) {
      case 'planning':
        return <Architect task={task} />

      case 'implementing':
        if (!store.plan) return null

        // Find the next subtask to work on
        const pendingSubtasks = store.plan.subtasks.filter(
          (s) => s.status === 'pending' || s.status === 'needs_revision'
        )

        if (pendingSubtasks.length === 0) {
          // Check if we should move to reviewing
          const allComplete = store.plan.subtasks.every((s) => s.status === 'complete')
          if (allComplete) {
            actions.nextStage()
            return null
          }
          return null // Waiting for in-progress subtasks
        }

        // Find a subtask whose dependencies are met
        const nextSubtask = pendingSubtasks.find((s) =>
          s.dependencies.every(
            (depId) => store.plan!.subtasks.find((d) => d.id === depId)?.status === 'complete'
          )
        )

        if (!nextSubtask) {
          console.log('[DevTeam] Waiting for dependencies...')
          return null
        }

        if (store.currentSubtask !== nextSubtask.id) {
          actions.startSubtask(nextSubtask.id)
        }

        return <Developer subtask={nextSubtask} />

      case 'reviewing':
        return <Reviewer />

      case 'done':
        console.log('\n=== Development Complete ===')
        console.log('\nPlan Overview:', store.plan?.overview)
        console.log('\nSubtasks:')
        store.plan?.subtasks.forEach((s) => {
          console.log(`  - ${s.name}: ${s.status}`)
        })
        console.log('\nReview:', store.reviewResult?.approved ? 'APPROVED' : 'PENDING')
        store.reviewResult?.notes.forEach((note) => console.log(`  - ${note}`))
        return null

      default:
        return null
    }
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
  actions.setTask(task)

  const result = await executePlan(() => <DevTeam task={task} />, {
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
  console.log('\n=== Final Project State ===')
  console.log('Stage:', store.stage)
  console.log('Subtasks completed:', store.plan?.subtasks.filter((s) => s.status === 'complete').length)
  console.log('Review approved:', store.reviewResult?.approved)
}

main().catch(console.error)

// Export
export { DevTeam, Architect, Developer, Reviewer, store }
export default (() => <DevTeam task="Build a REST API for user management" />)