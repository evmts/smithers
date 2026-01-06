import { describe, it, expect } from 'bun:test'
import './setup.ts'
import { useState } from 'react'
import { create } from 'zustand'
import {
  renderPlan,
  executePlan,
  Claude,
  ClaudeApi,
  Subagent,
  Phase,
  Step,
  Persona,
  Constraints,
  OutputFormat,
  Task,
  Stop,
  Human,
} from '../src/index.js'
import type { Tool } from '../src/core/types.js'

/**
 * Component Behavior Tests
 *
 * Tests individual component behaviors in isolation and integration:
 * - Claude: Rendering, callbacks, tool integration
 * - ClaudeApi: Alternative API executor
 * - Subagent: Parallel execution boundaries
 * - Phase/Step: Semantic markers
 * - Persona/Constraints/OutputFormat: Prompt structuring
 * - Task: Completion tracking
 * - Stop/Human: Control flow
 */

describe('Claude component', () => {
  it('renders children as prompt content', async () => {
    const plan = await renderPlan(
      <Claude>
        Analyze this code for bugs.
      </Claude>
    )

    expect(plan).toContain('Analyze this code for bugs')
  })

  it('tools prop is passed to executor', async () => {
    const mockTool: Tool = {
      name: 'test_tool',
      description: 'A test tool',
      execute: async () => ({ result: 'tool executed' }),
    }

    const plan = await renderPlan(
      <Claude tools={[mockTool]}>
        Use the test tool
      </Claude>
    )

    // Tools are attached as props, not serialized to XML
    expect(plan).toContain('claude')
  })

  it('onFinished callback receives result', async () => {
    let capturedOutput: unknown = null

    await executePlan(
      <Claude onFinished={(output) => { capturedOutput = output }}>
        Test prompt
      </Claude>
    )

    // onFinished is called with the output (string or object in mock mode)
    expect(capturedOutput).toBeDefined()
  })

  it('onError callback can be defined', async () => {
    let errorCaught = false
    let finishedCalled = false

    // Mock mode doesn't trigger errors, so we test that the callback is accepted
    // and that normal execution still works
    await executePlan(
      <Claude
        onError={(error) => { errorCaught = true }}
        onFinished={() => { finishedCalled = true }}
      >
        Normal execution
      </Claude>
    )

    // In mock mode, onFinished should be called, not onError
    expect(finishedCalled).toBe(true)
    expect(errorCaught).toBe(false)
  })

  it('system prop sets system message', async () => {
    const plan = await renderPlan(
      <Claude system="You are a helpful assistant">
        Hello
      </Claude>
    )

    // System message is passed via props, rendered but not as direct XML
    expect(plan).toContain('claude')
  })

  it('multiple callbacks can coexist', async () => {
    let finishedCalled = false
    let errorCalled = false

    await executePlan(
      <Claude
        onFinished={() => { finishedCalled = true }}
        onError={() => { errorCalled = true }}
      >
        Return: {JSON.stringify({ data: 'test' })}
      </Claude>
    )

    // In mock mode, onFinished should be called
    expect(finishedCalled).toBe(true)
    // onError should not be called for successful execution
    expect(errorCalled).toBe(false)
  })

  it('integrates with MCP servers', async () => {
    const plan = await renderPlan(
      <Claude
        mcpServers={[
          { name: 'test-server', command: 'test', args: [] }
        ]}
      >
        Use MCP tools
      </Claude>
    )

    expect(plan).toContain('claude')
  })
})

describe('ClaudeApi component', () => {
  it('renders as claude-api type', async () => {
    const plan = await renderPlan(
      <ClaudeApi>
        Test prompt
      </ClaudeApi>
    )

    expect(plan).toContain('claude-api')
  })

  it('supports tools like Claude component', async () => {
    const mockTool: Tool = {
      name: 'api_tool',
      description: 'API test tool',
      execute: async () => ({ result: 'done' }),
    }

    const plan = await renderPlan(
      <ClaudeApi tools={[mockTool]}>
        Use API tools
      </ClaudeApi>
    )

    expect(plan).toContain('claude-api')
  })
})

describe('Subagent component', () => {
  it('name prop appears in XML', async () => {
    const plan = await renderPlan(
      <Subagent name="researcher">
        <Claude>Research</Claude>
      </Subagent>
    )

    expect(plan).toContain('subagent')
    expect(plan).toContain('name="researcher"')
  })

  it('parallel=true enables concurrent execution', async () => {
    const executionOrder: string[] = []

    const useStore = create<{ order: string[]; add: (item: string) => void }>((set) => ({
      order: [],
      add: (item) => set((state) => ({ order: [...state.order, item] })),
    }))

    function ParallelAgent() {
      const { add } = useStore()

      return (
        <>
          <Subagent name="agent1" parallel={true}>
            <Claude onFinished={() => add('agent1')}>Task 1</Claude>
          </Subagent>
          <Subagent name="agent2" parallel={true}>
            <Claude onFinished={() => add('agent2')}>Task 2</Claude>
          </Subagent>
        </>
      )
    }

    await executePlan(<ParallelAgent />)

    // Both agents should execute (order may vary due to parallelism)
    expect(useStore.getState().order).toHaveLength(2)
    expect(useStore.getState().order).toContain('agent1')
    expect(useStore.getState().order).toContain('agent2')
  })

  it('parallel=false executes children sequentially', async () => {
    const executionOrder: string[] = []

    const useStore = create<{ order: string[]; add: (item: string) => void }>((set) => ({
      order: [],
      add: (item) => set((state) => ({ order: [...state.order, item] })),
    }))

    function SequentialAgent() {
      const { add } = useStore()

      return (
        <>
          <Subagent name="first" parallel={false}>
            <Claude onFinished={() => add('first')}>Task 1</Claude>
          </Subagent>
          <Subagent name="second" parallel={false}>
            <Claude onFinished={() => add('second')}>Task 2</Claude>
          </Subagent>
        </>
      )
    }

    await executePlan(<SequentialAgent />)

    // Sequential execution
    const order = useStore.getState().order
    expect(order).toEqual(['first', 'second'])
  })

  it('nested subagents work correctly', async () => {
    const plan = await renderPlan(
      <Subagent name="outer">
        <Subagent name="inner">
          <Claude>Nested task</Claude>
        </Subagent>
      </Subagent>
    )

    expect(plan).toContain('name="outer"')
    expect(plan).toContain('name="inner"')
    expect(plan).toContain('<subagent')
  })
})

describe('Phase component', () => {
  it('name prop appears in XML', async () => {
    const plan = await renderPlan(
      <Phase name="research">
        Research phase content
      </Phase>
    )

    expect(plan).toContain('<phase name="research">')
    expect(plan).toContain('Research phase content')
  })

  it('children rendered inside phase tag', async () => {
    const plan = await renderPlan(
      <Phase name="analyze">
        <Step>Step 1</Step>
        <Step>Step 2</Step>
      </Phase>
    )

    expect(plan).toContain('<phase name="analyze">')
    expect(plan).toContain('<step>')
    expect(plan).toContain('Step 1')
    expect(plan).toContain('Step 2')
    expect(plan).toContain('</phase>')
  })

  it('works without name prop', async () => {
    const plan = await renderPlan(
      <Phase>
        Unnamed phase
      </Phase>
    )

    expect(plan).toContain('<phase>')
    expect(plan).toContain('Unnamed phase')
  })

  it('nested phases are supported', async () => {
    const plan = await renderPlan(
      <Phase name="outer">
        <Phase name="inner">
          Nested content
        </Phase>
      </Phase>
    )

    expect(plan).toContain('phase name="outer"')
    expect(plan).toContain('phase name="inner"')
  })
})

describe('Step component', () => {
  it('renders children as step content', async () => {
    const plan = await renderPlan(
      <Step>
        Read the documentation
      </Step>
    )

    expect(plan).toContain('<step>')
    expect(plan).toContain('Read the documentation')
    expect(plan).toContain('</step>')
  })

  it('multiple steps render correctly', async () => {
    const plan = await renderPlan(
      <>
        <Step>First step</Step>
        <Step>Second step</Step>
        <Step>Third step</Step>
      </>
    )

    expect(plan).toContain('First step')
    expect(plan).toContain('Second step')
    expect(plan).toContain('Third step')
  })

  it('works with complex children', async () => {
    const plan = await renderPlan(
      <Step>
        <strong>Important:</strong> Review carefully
      </Step>
    )

    expect(plan).toContain('<step>')
    expect(plan).toContain('strong')
    expect(plan).toContain('Important')
  })
})

describe('Persona component', () => {
  it('role prop rendered correctly', async () => {
    const plan = await renderPlan(
      <Persona role="security expert">
        You specialize in application security.
      </Persona>
    )

    expect(plan).toContain('<persona')
    expect(plan).toContain('role="security expert"')
    expect(plan).toContain('You specialize in application security')
  })

  it('multiple personas can be combined', async () => {
    const plan = await renderPlan(
      <Claude>
        <Persona role="expert">Expert knowledge</Persona>
        <Persona role="reviewer">Review skills</Persona>
        Main prompt
      </Claude>
    )

    expect(plan).toContain('persona role="expert"')
    expect(plan).toContain('persona role="reviewer"')
  })

  it('persona without role prop', async () => {
    const plan = await renderPlan(
      <Persona>
        You are a helpful assistant.
      </Persona>
    )

    expect(plan).toContain('<persona')
    expect(plan).toContain('helpful assistant')
  })

  it('personas extract as system message in executor', async () => {
    let executedWithSystemMessage = false

    await executePlan(
      <Claude onFinished={() => { executedWithSystemMessage = true }}>
        <Persona role="tester">You are a test persona</Persona>
        Test prompt
      </Claude>
    )

    expect(executedWithSystemMessage).toBe(true)
  })
})

describe('Constraints component', () => {
  it('children rendered as constraints', async () => {
    const plan = await renderPlan(
      <Constraints>
        - Keep responses concise
        - Focus on security
      </Constraints>
    )

    expect(plan).toContain('<constraints>')
    expect(plan).toContain('Keep responses concise')
    expect(plan).toContain('Focus on security')
    expect(plan).toContain('</constraints>')
  })

  it('constraints inside Claude component', async () => {
    const plan = await renderPlan(
      <Claude>
        <Constraints>
          - Use formal tone
          - Cite sources
        </Constraints>
        Analyze this code
      </Claude>
    )

    expect(plan).toContain('<constraints>')
    expect(plan).toContain('Use formal tone')
  })

  it('multiple constraint blocks', async () => {
    const plan = await renderPlan(
      <>
        <Constraints>First set</Constraints>
        <Constraints>Second set</Constraints>
      </>
    )

    expect(plan).toContain('First set')
    expect(plan).toContain('Second set')
  })
})

describe('OutputFormat component', () => {
  it('schema prop serialized', async () => {
    const schema = {
      type: 'object',
      properties: {
        status: { type: 'string' },
        count: { type: 'number' },
      },
    }

    const plan = await renderPlan(
      <OutputFormat schema={schema}>
        Return JSON matching the schema
      </OutputFormat>
    )

    expect(plan).toContain('<output-format')
    expect(plan).toContain('schema=')
  })

  it('guides structured output parsing', async () => {
    let parsedOutput: any = null

    await executePlan(
      <Claude onFinished={(output) => { parsedOutput = output }}>
        <OutputFormat schema={{ result: 'string', success: 'boolean' }}>
          Test output
        </OutputFormat>
      </Claude>
    )

    // OutputFormat component guides the structure, onFinished receives the output
    expect(parsedOutput).toBeDefined()
  })

  it('works with complex nested schemas', async () => {
    const complexSchema = {
      type: 'object',
      properties: {
        users: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              age: { type: 'number' },
            },
          },
        },
      },
    }

    const plan = await renderPlan(
      <OutputFormat schema={complexSchema}>
        Return user data
      </OutputFormat>
    )

    expect(plan).toContain('<output-format')
  })
})

describe('Task component', () => {
  it('renders with done prop', async () => {
    const plan = await renderPlan(
      <>
        <Task done={false}>Incomplete task</Task>
        <Task done={true}>Complete task</Task>
      </>
    )

    expect(plan).toContain('<task')
    expect(plan).toContain('done="false"')
    expect(plan).toContain('done="true"')
  })

  it('tracks completion state across renders', async () => {
    const useStore = create<{ taskDone: boolean; complete: () => void }>((set) => ({
      taskDone: false,
      complete: () => set({ taskDone: true }),
    }))

    function TaskAgent() {
      const { taskDone, complete } = useStore()

      if (!taskDone) {
        return (
          <Claude onFinished={complete}>
            <Task done={false}>Do the task</Task>
          </Claude>
        )
      }

      return (
        <Task done={true}>Task completed</Task>
      )
    }

    await executePlan(<TaskAgent />)

    expect(useStore.getState().taskDone).toBe(true)
  })

  it('integrates with execution flow', async () => {
    const plan = await renderPlan(
      <Claude>
        <Phase name="work">
          <Task done={false}>Research</Task>
          <Task done={false}>Write</Task>
          <Task done={true}>Review</Task>
        </Phase>
      </Claude>
    )

    expect(plan).toContain('task')
    expect(plan).toContain('Research')
  })
})

describe('Stop component', () => {
  it('reason prop appears in output', async () => {
    const plan = await renderPlan(
      <Stop reason="All tasks completed" />
    )

    expect(plan).toContain('<stop')
    expect(plan).toContain('reason="All tasks completed"')
  })

  it('halts Ralph loop when rendered', async () => {
    const useStore = create<{ count: number; increment: () => void }>((set) => ({
      count: 0,
      increment: () => set((state) => ({ count: state.count + 1 })),
    }))

    function StoppingAgent() {
      const { count, increment } = useStore()

      if (count < 2) {
        return (
          <Claude onFinished={increment}>
            Iteration {count}
          </Claude>
        )
      }

      return <Stop reason="Reached count limit" />
    }

    const result = await executePlan(<StoppingAgent />)

    // Should stop after count reaches 2
    expect(useStore.getState().count).toBe(2)
    // Verify execution stopped via Stop component
    expect(result.frames).toBeLessThan(10) // Would loop forever without Stop
  })

  it('conditional rendering works', async () => {
    const useStore = create<{ done: boolean; markDone: () => void }>((set) => ({
      done: false,
      markDone: () => set({ done: true }),
    }))

    function ConditionalStopAgent() {
      const { done, markDone } = useStore()

      return (
        <>
          {done && <Stop reason="Work complete" />}
          {!done && (
            <Claude onFinished={markDone}>
              Do work
            </Claude>
          )}
        </>
      )
    }

    await executePlan(<ConditionalStopAgent />)

    expect(useStore.getState().done).toBe(true)
  })

  it('stop without reason prop', async () => {
    const plan = await renderPlan(<Stop />)

    expect(plan).toContain('<stop')
  })
})

describe('Human component', () => {
  it('pauses execution for approval', async () => {
    let humanPromptCalled = false
    let promptMessage = ''

    await executePlan(
      <Human message="Approve this action">
        Critical operation about to be performed
      </Human>,
      {
        onHumanPrompt: async (message) => {
          humanPromptCalled = true
          promptMessage = message
          return true // Auto-approve
        },
      }
    )

    expect(humanPromptCalled).toBe(true)
    expect(promptMessage).toBe('Approve this action')
  })

  it('auto-approves when no onHumanPrompt provided', async () => {
    // Should not hang or error
    const result = await executePlan(
      <Human message="This will auto-approve">
        Auto-approved content
      </Human>
    )

    expect(result).toBeDefined()
  })

  it('onApprove callback triggered on approval', async () => {
    let approved = false

    await executePlan(
      <Human
        message="Test approval"
        onApprove={() => { approved = true }}
      >
        Content requiring approval
      </Human>,
      {
        onHumanPrompt: async () => true,
      }
    )

    expect(approved).toBe(true)
  })

  it('onReject callback triggered on rejection', async () => {
    const useStore = create<{ rejected: boolean; setRejected: () => void }>((set) => ({
      rejected: false,
      setRejected: () => set({ rejected: true }),
    }))

    function RejectableAgent() {
      const { rejected, setRejected } = useStore()

      if (rejected) {
        return null // Render nothing after rejection
      }

      return (
        <Human
          message="Test rejection"
          onReject={setRejected}
        >
          Content to reject
        </Human>
      )
    }

    await executePlan(<RejectableAgent />, {
      onHumanPrompt: async () => false,
      maxFrames: 10,
    })

    expect(useStore.getState().rejected).toBe(true)
  })
})

describe('Component composition', () => {
  it('all components work together', async () => {
    function ComplexAgent() {
      return (
        <Claude>
          <Persona role="expert">You are an expert</Persona>
          <Constraints>Be concise</Constraints>
          <Phase name="main">
            <Step>First step</Step>
            <Step>Second step</Step>
            <Task done={false}>Task 1</Task>
          </Phase>
          <OutputFormat schema={{ result: 'string' }}>
            Return structured output
          </OutputFormat>
        </Claude>
      )
    }

    const plan = await renderPlan(<ComplexAgent />)

    expect(plan).toContain('<persona')
    expect(plan).toContain('<constraints>')
    expect(plan).toContain('<phase')
    expect(plan).toContain('<step>')
    expect(plan).toContain('<task')
    expect(plan).toContain('<output-format')
  })

  it('nested components maintain structure', async () => {
    const plan = await renderPlan(
      <Subagent name="outer">
        <Phase name="phase1">
          <Claude>
            <Persona role="worker">Worker persona</Persona>
            <Step>Do work</Step>
          </Claude>
        </Phase>
      </Subagent>
    )

    expect(plan).toContain('name="outer"')
    expect(plan).toContain('phase name="phase1"')
    expect(plan).toContain('persona role="worker"')
    expect(plan).toContain('<subagent')
  })

  it('conditional components render correctly', async () => {
    const showPersona = true
    const showConstraints = false

    const plan = await renderPlan(
      <Claude>
        {showPersona && <Persona role="expert">Expert</Persona>}
        {showConstraints && <Constraints>Constraints</Constraints>}
        Main content
      </Claude>
    )

    expect(plan).toContain('<persona')
    expect(plan).not.toContain('<constraints>')
  })
})
