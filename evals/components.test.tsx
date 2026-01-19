/**
 * Component Behavior Tests
 *
 * Tests individual component behaviors in isolation.
 */
import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import { createSmithersRoot, type SmithersRoot } from '../src/reconciler/root'
import { createSmithersDB, type SmithersDB } from '../src/db/index'
import { SmithersProvider } from '../src/components/SmithersProvider'
import { Phase } from '../src/components/Phase'
import { Step } from '../src/components/Step'
import { Claude } from '../src/components/Claude'
import { Stop } from '../src/components/Stop'
import { Human } from '../src/components/Human'
import { Task } from '../src/components/Task'
import { Persona } from '../src/components/Persona'
import { Constraints } from '../src/components/Constraints'
import { Subagent } from '../src/components/Subagent'

describe('Claude component', () => {
  let root: SmithersRoot
  let db: SmithersDB
  let executionId: string

  beforeEach(() => {
    db = createSmithersDB({ path: ':memory:' })
    executionId = db.execution.start('eval-test', 'claude-component')
    root = createSmithersRoot()
  })

  afterEach(async () => {
    await new Promise(r => setTimeout(r, 50))
    root.dispose()
    db.close()
  })

  test('renders children as prompt content', async () => {
    await root.render(
      <SmithersProvider db={db} executionId={executionId}>
        <Phase name="test">
          <Claude model="sonnet">Write a function</Claude>
        </Phase>
      </SmithersProvider>
    )
    const xml = root.toXML()
    expect(xml).toContain('Write a function')
  })

  test('system prop is passed to agent (not rendered in XML)', async () => {
    await root.render(
      <SmithersProvider db={db} executionId={executionId}>
        <Phase name="test">
          <Claude model="sonnet" system="You are helpful">Hello</Claude>
        </Phase>
      </SmithersProvider>
    )
    const xml = root.toXML()
    expect(xml).toContain('<claude')
    expect(xml).toContain('Hello')
  })

  test('model prop is rendered', async () => {
    await root.render(
      <SmithersProvider db={db} executionId={executionId}>
        <Phase name="test">
          <Claude model="opus">Prompt</Claude>
        </Phase>
      </SmithersProvider>
    )
    const xml = root.toXML()
    expect(xml).toContain('model="opus"')
  })
})

describe('ClaudeApi component', () => {
  let root: SmithersRoot

  beforeEach(() => {
    root = createSmithersRoot()
  })

  afterEach(() => {
    root.dispose()
  })

  test('renders as claude-api type', async () => {
    await root.render(<claude-api model="sonnet">API call</claude-api>)
    const xml = root.toXML()
    expect(xml).toContain('<claude-api')
    expect(xml).toContain('API call')
  })
})

describe('Subagent component', () => {
  let root: SmithersRoot
  let db: SmithersDB
  let executionId: string

  beforeEach(() => {
    db = createSmithersDB({ path: ':memory:' })
    executionId = db.execution.start('eval-test', 'subagent-component')
    root = createSmithersRoot()
  })

  afterEach(async () => {
    await new Promise(r => setTimeout(r, 50))
    root.dispose()
    db.close()
  })

  test('name prop appears in XML', async () => {
    await root.render(
      <SmithersProvider db={db} executionId={executionId}>
        <Phase name="test">
          <Subagent name="researcher" parallel={false}>Research topic</Subagent>
        </Phase>
      </SmithersProvider>
    )
    const xml = root.toXML()
    expect(xml).toContain('name="researcher"')
  })

  test('parallel prop is rendered', async () => {
    await root.render(
      <SmithersProvider db={db} executionId={executionId}>
        <Phase name="test">
          <Subagent name="worker" parallel={true}>Work</Subagent>
        </Phase>
      </SmithersProvider>
    )
    const xml = root.toXML()
    expect(xml).toContain('parallel="true"')
  })

  test('nested subagents work correctly', async () => {
    await root.render(
      <SmithersProvider db={db} executionId={executionId}>
        <Phase name="test">
          <Subagent name="outer" parallel={false}>
            <Subagent name="inner" parallel={false}>Nested</Subagent>
          </Subagent>
        </Phase>
      </SmithersProvider>
    )
    const xml = root.toXML()
    expect(xml).toContain('name="outer"')
    expect(xml).toContain('name="inner"')
  })
})

describe('Phase component', () => {
  let root: SmithersRoot
  let db: SmithersDB
  let executionId: string

  beforeEach(() => {
    db = createSmithersDB({ path: ':memory:' })
    executionId = db.execution.start('eval-test', 'phase-component')
    root = createSmithersRoot()
  })

  afterEach(async () => {
    await new Promise(r => setTimeout(r, 50))
    root.dispose()
    db.close()
  })

  test('name prop appears in XML', async () => {
    await root.render(
      <SmithersProvider db={db} executionId={executionId}>
        <Phase name="research">
          <Step name="s1">Content</Step>
        </Phase>
      </SmithersProvider>
    )
    const xml = root.toXML()
    expect(xml).toContain('name="research"')
  })

  test('children rendered inside phase tag', async () => {
    await root.render(
      <SmithersProvider db={db} executionId={executionId}>
        <Phase name="test">
          <Step name="step1">Step content</Step>
        </Phase>
      </SmithersProvider>
    )
    const xml = root.toXML()
    expect(xml).toContain('<phase')
    expect(xml).toContain('Step content')
  })

  test('works without name prop', async () => {
    await root.render(
      <SmithersProvider db={db} executionId={executionId}>
        <Phase name="">
          <Step name="s1">Unnamed phase</Step>
        </Phase>
      </SmithersProvider>
    )
    const xml = root.toXML()
    expect(xml).toContain('<phase')
  })
})

describe('Step component', () => {
  let root: SmithersRoot
  let db: SmithersDB
  let executionId: string

  beforeEach(() => {
    db = createSmithersDB({ path: ':memory:' })
    executionId = db.execution.start('eval-test', 'step-component')
    root = createSmithersRoot()
  })

  afterEach(async () => {
    await new Promise(r => setTimeout(r, 50))
    root.dispose()
    db.close()
  })

  test('renders children as step content', async () => {
    await root.render(
      <SmithersProvider db={db} executionId={executionId}>
        <Phase name="test">
          <Step name="s1">Step text here</Step>
        </Phase>
      </SmithersProvider>
    )
    const xml = root.toXML()
    expect(xml).toContain('Step text here')
  })

  test('multiple steps render correctly', async () => {
    await root.render(
      <SmithersProvider db={db} executionId={executionId}>
        <Phase name="test">
          <Step name="s1">First step</Step>
          <Step name="s2">Second step</Step>
        </Phase>
      </SmithersProvider>
    )
    const xml = root.toXML()
    expect(xml).toContain('First step')
    expect(xml).toContain('Second step')
  })
})

describe('Persona component', () => {
  let root: SmithersRoot
  let db: SmithersDB
  let executionId: string

  beforeEach(() => {
    db = createSmithersDB({ path: ':memory:' })
    executionId = db.execution.start('eval-test', 'persona-component')
    root = createSmithersRoot()
  })

  afterEach(async () => {
    await new Promise(r => setTimeout(r, 50))
    root.dispose()
    db.close()
  })

  test('role prop rendered correctly', async () => {
    await root.render(
      <SmithersProvider db={db} executionId={executionId}>
        <Phase name="test">
          <Persona role="expert engineer">Description</Persona>
        </Phase>
      </SmithersProvider>
    )
    const xml = root.toXML()
    expect(xml).toContain('role="expert engineer"')
  })

  test('persona without role prop', async () => {
    await root.render(
      <SmithersProvider db={db} executionId={executionId}>
        <Phase name="test">
          <Persona>Just description</Persona>
        </Phase>
      </SmithersProvider>
    )
    const xml = root.toXML()
    expect(xml).toContain('<persona')
  })
})

describe('Constraints component', () => {
  let root: SmithersRoot
  let db: SmithersDB
  let executionId: string

  beforeEach(() => {
    db = createSmithersDB({ path: ':memory:' })
    executionId = db.execution.start('eval-test', 'constraints-component')
    root = createSmithersRoot()
  })

  afterEach(async () => {
    await new Promise(r => setTimeout(r, 50))
    root.dispose()
    db.close()
  })

  test('children rendered as constraints', async () => {
    await root.render(
      <SmithersProvider db={db} executionId={executionId}>
        <Phase name="test">
          <Constraints>- Rule 1\n- Rule 2</Constraints>
        </Phase>
      </SmithersProvider>
    )
    const xml = root.toXML()
    expect(xml).toContain('Rule 1')
    expect(xml).toContain('Rule 2')
  })

  test('constraints inside Claude component', async () => {
    await root.render(
      <SmithersProvider db={db} executionId={executionId}>
        <Phase name="test">
          <Claude model="sonnet">
            <Constraints>Be helpful</Constraints>
            Do the task
          </Claude>
        </Phase>
      </SmithersProvider>
    )
    const xml = root.toXML()
    expect(xml).toContain('<constraints')
    expect(xml).toContain('Be helpful')
  })
})

describe('Task component', () => {
  let root: SmithersRoot
  let db: SmithersDB
  let executionId: string

  beforeEach(() => {
    db = createSmithersDB({ path: ':memory:' })
    executionId = db.execution.start('eval-test', 'task-component')
    root = createSmithersRoot()
  })

  afterEach(async () => {
    await new Promise(r => setTimeout(r, 50))
    root.dispose()
    db.close()
  })

  test('renders with done prop', async () => {
    await root.render(
      <SmithersProvider db={db} executionId={executionId}>
        <Phase name="test">
          <Task done={false}>Pending task</Task>
        </Phase>
      </SmithersProvider>
    )
    const xml = root.toXML()
    expect(xml).toContain('<task')
    expect(xml).toContain('Pending task')
  })
})

describe('Stop component', () => {
  let root: SmithersRoot
  let db: SmithersDB
  let executionId: string

  beforeEach(() => {
    db = createSmithersDB({ path: ':memory:' })
    executionId = db.execution.start('eval-test', 'stop-component')
    root = createSmithersRoot()
  })

  afterEach(async () => {
    await new Promise(r => setTimeout(r, 50))
    root.dispose()
    db.close()
  })

  test('reason prop appears in output', async () => {
    await root.render(
      <SmithersProvider db={db} executionId={executionId}>
        <Phase name="test">
          <Stop reason="All done" />
        </Phase>
      </SmithersProvider>
    )
    const xml = root.toXML()
    expect(xml).toContain('reason="All done"')
  })

  test('stop without reason prop', async () => {
    await root.render(
      <SmithersProvider db={db} executionId={executionId}>
        <Phase name="test">
          <Stop />
        </Phase>
      </SmithersProvider>
    )
    const xml = root.toXML()
    expect(xml).toContain('<smithers-stop')
  })
})

describe('Human component', () => {
  let root: SmithersRoot
  let db: SmithersDB
  let executionId: string

  beforeEach(() => {
    db = createSmithersDB({ path: ':memory:' })
    executionId = db.execution.start('eval-test', 'human-component')
    root = createSmithersRoot()
  })

  afterEach(async () => {
    await new Promise(r => setTimeout(r, 50))
    root.dispose()
    db.close()
  })

  test('message prop is rendered', async () => {
    await root.render(
      <SmithersProvider db={db} executionId={executionId}>
        <Phase name="test">
          <Human message="Please approve" />
        </Phase>
      </SmithersProvider>
    )
    const xml = root.toXML()
    expect(xml).toContain('Please approve')
  })
})

describe('Component composition', () => {
  let root: SmithersRoot
  let db: SmithersDB
  let executionId: string

  beforeEach(() => {
    db = createSmithersDB({ path: ':memory:' })
    executionId = db.execution.start('eval-test', 'composition')
    root = createSmithersRoot()
  })

  afterEach(async () => {
    await new Promise(r => setTimeout(r, 50))
    root.dispose()
    db.close()
  })

  test('all components work together', async () => {
    await root.render(
      <SmithersProvider db={db} executionId={executionId}>
        <Phase name="main">
          <Persona role="developer">Expert coder</Persona>
          <Constraints>Follow best practices</Constraints>
          <Step name="research">Research the topic</Step>
          <Claude model="sonnet">Write the code</Claude>
          <Task done={false}>Review changes</Task>
        </Phase>
      </SmithersProvider>
    )
    const xml = root.toXML()
    expect(xml).toContain('<phase')
    expect(xml).toContain('<persona')
    expect(xml).toContain('<constraints')
    expect(xml).toContain('<step')
    expect(xml).toContain('<claude')
    expect(xml).toContain('<task')
  })

  test('nested components maintain structure', async () => {
    await root.render(
      <SmithersProvider db={db} executionId={executionId}>
        <Phase name="outer">
          <Step name="inner">
            Content here
          </Step>
        </Phase>
      </SmithersProvider>
    )
    const xml = root.toXML()
    expect(xml).toContain('<phase')
    expect(xml).toContain('<step')
    expect(xml).toContain('Content here')
  })

  test('conditional components render correctly', async () => {
    const show = true
    await root.render(
      <SmithersProvider db={db} executionId={executionId}>
        <Phase name="conditional">
          {show && <Step name="shown">Visible</Step>}
          {!show && <Step name="hidden">Hidden</Step>}
        </Phase>
      </SmithersProvider>
    )
    const xml = root.toXML()
    expect(xml).toContain('Visible')
    expect(xml).not.toContain('Hidden')
  })
})
