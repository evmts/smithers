/**
 * Component Behavior Tests
 *
 * Tests individual component behaviors in isolation.
 */
import { describe, test, expect } from 'vitest'
import './setup'
import { renderPlan, runPlan } from '../test/utils'
import { Claude } from '../src/components/Claude'
import { Phase } from '../src/components/Phase'
import { Step } from '../src/components/Step'
import { Stop } from '../src/components/Stop'
import { Subagent } from '../src/components/Subagent'
import { Persona } from '../src/components/Persona'
import { Constraints } from '../src/components/Constraints'
import { Task } from '../src/components/Task'
import { Human } from '../src/components/Human'
import { ClaudeApi } from '../src/components/ClaudeApi'

describe('Claude component', () => {
  test('renders children as prompt content', async () => {
    const plan = await renderPlan(
      <Claude>
        Analyze this code for bugs.
      </Claude>
    )

    expect(plan).toContain('Analyze this code for bugs')
  })

  test('system prop is rendered', async () => {
    const plan = await renderPlan(
      <Claude system="You are a helpful assistant">
        Hello
      </Claude>
    )

    expect(plan).toContain('claude')
  })

  test('model prop is rendered', async () => {
    const plan = await renderPlan(
      <Claude model="claude-opus-4">
        Hello
      </Claude>
    )

    expect(plan).toContain('model="claude-opus-4"')
  })
})

describe('ClaudeApi component', () => {
  test('renders as claude-api type', async () => {
    const plan = await renderPlan(
      <ClaudeApi>
        Test prompt
      </ClaudeApi>
    )

    expect(plan).toContain('claude-api')
  })
})

describe('Subagent component', () => {
  test('name prop appears in XML', async () => {
    const plan = await renderPlan(
      <Subagent name="researcher">
        <Claude>Research</Claude>
      </Subagent>
    )

    expect(plan).toContain('subagent')
    expect(plan).toContain('name="researcher"')
  })

  test('parallel prop is rendered', async () => {
    const plan = await renderPlan(
      <Subagent name="parallel-agent" parallel={true}>
        <Claude>Task 1</Claude>
        <Claude>Task 2</Claude>
      </Subagent>
    )

    expect(plan).toContain('parallel="true"')
  })

  test('nested subagents work correctly', async () => {
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
  test('name prop appears in XML', async () => {
    const plan = await renderPlan(
      <Phase name="research">
        Research phase content
      </Phase>
    )

    expect(plan).toContain('<phase name="research">')
    expect(plan).toContain('Research phase content')
  })

  test('children rendered inside phase tag', async () => {
    const plan = await renderPlan(
      <Phase name="analyze">
        <Step>Step 1</Step>
        <Step>Step 2</Step>
      </Phase>
    )

    expect(plan).toContain('<phase name="analyze">')
    expect(plan).toContain('<step')
    expect(plan).toContain('Step 1')
    expect(plan).toContain('Step 2')
    expect(plan).toContain('</phase>')
  })

  test('works without name prop', async () => {
    const plan = await renderPlan(
      <Phase>
        Unnamed phase
      </Phase>
    )

    expect(plan).toContain('<phase')
    expect(plan).toContain('Unnamed phase')
  })
})

describe('Step component', () => {
  test('renders children as step content', async () => {
    const plan = await renderPlan(
      <Step>
        Read the documentation
      </Step>
    )

    expect(plan).toContain('<step')
    expect(plan).toContain('Read the documentation')
    expect(plan).toContain('</step>')
  })

  test('multiple steps render correctly', async () => {
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
})

describe('Persona component', () => {
  test('role prop rendered correctly', async () => {
    const plan = await renderPlan(
      <Persona role="security expert">
        You specialize in application security.
      </Persona>
    )

    expect(plan).toContain('<persona')
    expect(plan).toContain('role="security expert"')
    expect(plan).toContain('You specialize in application security')
  })

  test('persona without role prop', async () => {
    const plan = await renderPlan(
      <Persona>
        You are a helpful assistant.
      </Persona>
    )

    expect(plan).toContain('<persona')
    expect(plan).toContain('helpful assistant')
  })
})

describe('Constraints component', () => {
  test('children rendered as constraints', async () => {
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

  test('constraints inside Claude component', async () => {
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
})

describe('Task component', () => {
  test('renders with done prop', async () => {
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
})

describe('Stop component', () => {
  test('reason prop appears in output', async () => {
    const plan = await renderPlan(
      <Stop reason="All tasks completed" />
    )

    expect(plan).toContain('stop')
    expect(plan).toContain('reason="All tasks completed"')
  })

  test('stop without reason prop', async () => {
    const plan = await renderPlan(<Stop />)
    expect(plan).toContain('stop')
  })
})

describe('Human component', () => {
  test('message prop is rendered', async () => {
    const plan = await renderPlan(
      <Human message="Approve this action">
        Critical operation about to be performed
      </Human>
    )

    expect(plan).toContain('human')
    expect(plan).toContain('message="Approve this action"')
  })
})

describe('Component composition', () => {
  test('all components work together', async () => {
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
          Return structured output
        </Claude>
      )
    }

    const plan = await renderPlan(<ComplexAgent />)

    expect(plan).toContain('<persona')
    expect(plan).toContain('<constraints>')
    expect(plan).toContain('<phase')
    expect(plan).toContain('<step')
    expect(plan).toContain('<task')
  })

  test('nested components maintain structure', async () => {
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

  test('conditional components render correctly', async () => {
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
