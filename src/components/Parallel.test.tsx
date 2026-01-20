import { test, expect, describe, beforeEach, afterEach } from 'bun:test'
import { createSmithersDB, type SmithersDB } from '../db/index.js'
import { createSmithersRoot } from '../reconciler/root.js'
import { Parallel, type ParallelProps } from './Parallel.js'
import { SmithersProvider, signalOrchestrationComplete, useSmithers } from './SmithersProvider.js'
import { Phase } from './Phase.js'
import { Step, useStepRegistry } from './Step.js'
import { useExecutionEffect, useExecutionScope } from './ExecutionScope.js'
import { useEffect, useRef } from 'react'

describe('Parallel component', () => {
  let db: SmithersDB
  let executionId: string

  beforeEach(() => {
    db = createSmithersDB({ reset: true })
    executionId = db.execution.start('test-parallel', 'Parallel.test.ts')
  })

  afterEach(() => {
    signalOrchestrationComplete()
    db.close()
  })

  function ParallelTaskRunner(props: { name: string; delay?: number }) {
    const { db } = useSmithers()
    const executionScope = useExecutionScope()
    const taskIdRef = useRef<string | null>(null)

    useExecutionEffect(executionScope.enabled, () => {
      taskIdRef.current = db.tasks.start('parallel-test-task', props.name, { scopeId: executionScope.scopeId })
      const timeoutId = setTimeout(() => {
        if (!db.db.isClosed && taskIdRef.current) {
          db.tasks.complete(taskIdRef.current)
        }
      }, props.delay ?? 20)
      return () => clearTimeout(timeoutId)
    }, [db, executionScope.enabled, props.delay, props.name])

    return <task name={props.name} />
  }

  describe('Exports', () => {
    test('exports Parallel component', () => {
      expect(Parallel).toBeDefined()
      expect(typeof Parallel).toBe('function')
    })
  })

  describe('ParallelProps interface', () => {
    test('accepts children prop', () => {
      const props: ParallelProps = {
        children: null,
      }
      expect(props.children).toBeNull()
    })
  })

  describe('Rendering', () => {
    test('renders <parallel> intrinsic element', async () => {
      const root = createSmithersRoot()
      await root.render(
        <SmithersProvider db={db} executionId={executionId}>
          <Parallel>
            <step>child1</step>
          </Parallel>
        </SmithersProvider>
      )

      const xml = root.toXML()
      expect(xml).toContain('<parallel>')
      expect(xml).toContain('</parallel>')
      root.dispose()
    })

    test('renders children inside parallel element', async () => {
      const root = createSmithersRoot()
      await root.render(
        <SmithersProvider db={db} executionId={executionId}>
          <Parallel>
            <step name="step1">content1</step>
            <step name="step2">content2</step>
          </Parallel>
        </SmithersProvider>
      )

      const xml = root.toXML()
      expect(xml).toContain('<parallel>')
      expect(xml).toContain('step1')
      expect(xml).toContain('step2')
      root.dispose()
    })

    test('renders with single child', async () => {
      const root = createSmithersRoot()
      await root.render(
        <SmithersProvider db={db} executionId={executionId}>
          <Parallel>
            <step name="only">single child</step>
          </Parallel>
        </SmithersProvider>
      )

      const xml = root.toXML()
      expect(xml).toContain('<parallel>')
      expect(xml).toContain('only')
      root.dispose()
    })

    test('renders with no children', async () => {
      const root = createSmithersRoot()
      await root.render(
        <SmithersProvider db={db} executionId={executionId}>
          <Parallel>{null}</Parallel>
        </SmithersProvider>
      )

      const xml = root.toXML()
      expect(xml).toContain('<parallel')
      root.dispose()
    })

    test('renders Fragment children', async () => {
      const root = createSmithersRoot()
      await root.render(
        <SmithersProvider db={db} executionId={executionId}>
          <Parallel>
            <>
              <step>A</step>
              <step>B</step>
            </>
          </Parallel>
        </SmithersProvider>
      )

      const xml = root.toXML()
      expect(xml).toContain('<parallel>')
      expect(xml).toContain('A')
      expect(xml).toContain('B')
      root.dispose()
    })

    test('filters null and undefined children', async () => {
      const root = createSmithersRoot()
      await root.render(
        <SmithersProvider db={db} executionId={executionId}>
          <Parallel>
            {null}
            <step>Valid</step>
            {undefined}
          </Parallel>
        </SmithersProvider>
      )

      const xml = root.toXML()
      expect(xml).toContain('<parallel>')
      expect(xml).toContain('Valid')
      root.dispose()
    })
  })

  describe('StepRegistryProvider integration', () => {
    test('wraps children in StepRegistryProvider with isParallel=true', async () => {
      let capturedRegistry: ReturnType<typeof useStepRegistry> | undefined

      function RegistryCapture() {
        capturedRegistry = useStepRegistry()
        return <result captured={capturedRegistry?.isParallel ?? false} />
      }

      const root = createSmithersRoot()
      await root.render(
        <SmithersProvider db={db} executionId={executionId}>
          <Parallel>
            <RegistryCapture />
          </Parallel>
        </SmithersProvider>
      )

      expect(capturedRegistry).toBeDefined()
      expect(capturedRegistry!.isParallel).toBe(true)
      root.dispose()
    })

    test('all steps are active in parallel mode', async () => {
      const activeResults: boolean[] = []

      function CheckActive({ name }: { name: string }) {
        const registry = useStepRegistry()
        const indexRef = useRef<number | null>(null)
        if (indexRef.current === null) {
          indexRef.current = registry?.registerStep(name) ?? 0
        }
        const isActive = registry?.isStepActive(indexRef.current) ?? false
        if (activeResults.length < 3) {
          activeResults.push(isActive)
        }
        return <step name={name} active={isActive} />
      }

      const root = createSmithersRoot()
      await root.render(
        <SmithersProvider db={db} executionId={executionId}>
          <Parallel>
            <CheckActive name="step1" />
            <CheckActive name="step2" />
            <CheckActive name="step3" />
          </Parallel>
        </SmithersProvider>
      )

      expect(activeResults.every(v => v === true)).toBe(true)
      root.dispose()
    })

    test('isStepCompleted returns false for all steps in parallel mode', async () => {
      let completedValues: boolean[] = []

      function CheckCompleted({ name }: { name: string }) {
        const registry = useStepRegistry()
        const indexRef = useRef<number | null>(null)
        if (indexRef.current === null) {
          indexRef.current = registry?.registerStep(name) ?? 0
        }
        const isCompleted = registry?.isStepCompleted(indexRef.current) ?? false
        useEffect(() => {
          completedValues.push(isCompleted)
        }, [isCompleted])
        return <step name={name} completed={isCompleted} />
      }

      const root = createSmithersRoot()
      await root.render(
        <SmithersProvider db={db} executionId={executionId}>
          <Parallel>
            <CheckCompleted name="step1" />
            <CheckCompleted name="step2" />
          </Parallel>
        </SmithersProvider>
      )

      expect(completedValues.every(v => v === false)).toBe(true)
      root.dispose()
    })
  })

  describe('Concurrent execution', () => {
    test('steps inside Parallel render concurrently', async () => {
      const renderOrder: string[] = []

      function TrackRender({ name }: { name: string }) {
        renderOrder.push(name)
        return <step name={name} />
      }

      const root = createSmithersRoot()
      await root.render(
        <SmithersProvider db={db} executionId={executionId}>
          <Parallel>
            <TrackRender name="A" />
            <TrackRender name="B" />
            <TrackRender name="C" />
          </Parallel>
        </SmithersProvider>
      )

      expect(renderOrder).toContain('A')
      expect(renderOrder).toContain('B')
      expect(renderOrder).toContain('C')
      expect(renderOrder.length).toBe(3)
      root.dispose()
    })

    test('currentStepIndex is -1 in parallel mode', async () => {
      let capturedIndex: number | undefined

      function CaptureIndex() {
        const registry = useStepRegistry()
        capturedIndex = registry?.currentStepIndex
        return <result index={capturedIndex} />
      }

      const root = createSmithersRoot()
      await root.render(
        <SmithersProvider db={db} executionId={executionId}>
          <Parallel>
            <CaptureIndex />
          </Parallel>
        </SmithersProvider>
      )

      expect(capturedIndex).toBe(-1)
      root.dispose()
    })

    test('advanceStep is no-op in parallel mode', async () => {
      let indexBefore: number | undefined
      let indexAfter: number | undefined

      function TestAdvance() {
        const registry = useStepRegistry()
        indexBefore = registry?.currentStepIndex
        registry?.advanceStep()
        indexAfter = registry?.currentStepIndex
        return <step />
      }

      const root = createSmithersRoot()
      await root.render(
        <SmithersProvider db={db} executionId={executionId}>
          <Parallel>
            <TestAdvance />
          </Parallel>
        </SmithersProvider>
      )

      expect(indexBefore).toBe(-1)
      expect(indexAfter).toBe(-1)
      root.dispose()
    })
  })

  describe('Nested Parallel components', () => {
    test('nested Parallel components render correctly', async () => {
      const root = createSmithersRoot()
      await root.render(
        <SmithersProvider db={db} executionId={executionId}>
          <Parallel>
            <step name="outer1" />
            <Parallel>
              <step name="inner1" />
              <step name="inner2" />
            </Parallel>
            <step name="outer2" />
          </Parallel>
        </SmithersProvider>
      )

      const xml = root.toXML()
      expect(xml).toContain('outer1')
      expect(xml).toContain('inner1')
      expect(xml).toContain('inner2')
      expect(xml).toContain('outer2')
      expect((xml.match(/<parallel>/g) || []).length).toBe(2)
      root.dispose()
    })

    test('inner Parallel creates new StepRegistry context', async () => {
      let outerRegistry: ReturnType<typeof useStepRegistry> | undefined
      let innerRegistry: ReturnType<typeof useStepRegistry> | undefined

      function CaptureOuter() {
        outerRegistry = useStepRegistry()
        return <step name="outer" />
      }

      function CaptureInner() {
        innerRegistry = useStepRegistry()
        return <step name="inner" />
      }

      const root = createSmithersRoot()
      await root.render(
        <SmithersProvider db={db} executionId={executionId}>
          <Parallel>
            <CaptureOuter />
            <Parallel>
              <CaptureInner />
            </Parallel>
          </Parallel>
        </SmithersProvider>
      )

      expect(outerRegistry).toBeDefined()
      expect(innerRegistry).toBeDefined()
      expect(outerRegistry!.isParallel).toBe(true)
      expect(innerRegistry!.isParallel).toBe(true)
      root.dispose()
    })
  })

  describe('Parallel within Phase context', () => {
    test('Parallel works inside Phase', async () => {
      const root = createSmithersRoot()
      await root.render(
        <SmithersProvider db={db} executionId={executionId}>
          <Phase name="Build">
            <Parallel>
              <step name="Frontend" />
              <step name="Backend" />
            </Parallel>
          </Phase>
        </SmithersProvider>
      )

      const xml = root.toXML()
      expect(xml).toContain('<phase')
      expect(xml).toContain('Build')
      expect(xml).toContain('<parallel>')
      expect(xml).toContain('Frontend')
      expect(xml).toContain('Backend')
      root.dispose()
    })

    test('Parallel steps are all active within active Phase', async () => {
      const activeResults: boolean[] = []

      function CheckActive({ name }: { name: string }) {
        const registry = useStepRegistry()
        const indexRef = useRef<number | null>(null)
        if (indexRef.current === null) {
          indexRef.current = registry?.registerStep(name) ?? 0
        }
        const isActive = registry?.isStepActive(indexRef.current) ?? false
        if (activeResults.length < 2) {
          activeResults.push(isActive)
        }
        return <step name={name} />
      }

      const root = createSmithersRoot()
      await root.render(
        <SmithersProvider db={db} executionId={executionId}>
          <Phase name="Build">
            <Parallel>
              <CheckActive name="frontend" />
              <CheckActive name="backend" />
            </Parallel>
          </Phase>
        </SmithersProvider>
      )

      expect(activeResults.every(v => v === true)).toBe(true)
      root.dispose()
    })

    test('multiple Parallel blocks in sequence within Phase', async () => {
      const root = createSmithersRoot()
      await root.render(
        <SmithersProvider db={db} executionId={executionId}>
          <Phase name="Multi">
            <Parallel>
              <step name="parallel1-a" />
              <step name="parallel1-b" />
            </Parallel>
            <step name="sequential" />
            <Parallel>
              <step name="parallel2-a" />
              <step name="parallel2-b" />
            </Parallel>
          </Phase>
        </SmithersProvider>
      )

      const xml = root.toXML()
      // First parallel block is active, so its children render
      expect(xml).toContain('parallel1-a')
      expect(xml).toContain('parallel1-b')
      // Sequential step and second parallel block render as elements
      // but children only render when that step becomes active
      expect(xml).toContain('sequential')
      expect(xml).toContain('<parallel')
      root.dispose()
    })

    test('Phase advances when parallel steps complete', async () => {
      const root = createSmithersRoot()
      await root.render(
        <SmithersProvider db={db} executionId={executionId}>
          <Phase name="ParallelPhase">
            <Parallel>
              <Step name="parallel-a"><ParallelTaskRunner name="parallel-a" delay={20} /></Step>
              <Step name="parallel-b"><ParallelTaskRunner name="parallel-b" delay={20} /></Step>
            </Parallel>
          </Phase>
          <Phase name="NextPhase">
            <step name="next" />
          </Phase>
        </SmithersProvider>
      )

      await new Promise(r => setTimeout(r, 250))

      const currentPhaseIndex = db.state.get<number>('currentPhaseIndex')
      expect(currentPhaseIndex).toBe(1)
      root.dispose()
    })
  })

  describe('Component composition', () => {
    test('Parallel with function component children', async () => {
      function Child({ name }: { name: string }) {
        return <step name={name}>child content</step>
      }

      const root = createSmithersRoot()
      await root.render(
        <SmithersProvider db={db} executionId={executionId}>
          <Parallel>
            <Child name="child1" />
            <Child name="child2" />
          </Parallel>
        </SmithersProvider>
      )

      const xml = root.toXML()
      expect(xml).toContain('child1')
      expect(xml).toContain('child2')
      root.dispose()
    })

    test('Parallel with mixed intrinsic and component children', async () => {
      function CustomStep({ name }: { name: string }) {
        return <step name={name}>custom</step>
      }

      const root = createSmithersRoot()
      await root.render(
        <SmithersProvider db={db} executionId={executionId}>
          <Parallel>
            <step name="intrinsic" />
            <CustomStep name="component" />
          </Parallel>
        </SmithersProvider>
      )

      const xml = root.toXML()
      expect(xml).toContain('intrinsic')
      expect(xml).toContain('component')
      root.dispose()
    })

    test('deeply nested structure with Parallel', async () => {
      const root = createSmithersRoot()
      await root.render(
        <SmithersProvider db={db} executionId={executionId}>
          <Parallel>
            <step name="branch1">
              <step name="leaf1" />
            </step>
            <step name="branch2">
              <Parallel>
                <step name="leaf2a" />
                <step name="leaf2b" />
              </Parallel>
            </step>
          </Parallel>
        </SmithersProvider>
      )

      const xml = root.toXML()
      expect(xml).toContain('branch1')
      expect(xml).toContain('branch2')
      expect(xml).toContain('leaf1')
      expect(xml).toContain('leaf2a')
      expect(xml).toContain('leaf2b')
      root.dispose()
    })
  })

  describe('Props and attributes', () => {
    test('Parallel children can have arbitrary props', async () => {
      const root = createSmithersRoot()
      await root.render(
        <SmithersProvider db={db} executionId={executionId}>
          <Parallel>
            <step name="step1" priority={1} />
            <step name="step2" priority={2} />
          </Parallel>
        </SmithersProvider>
      )

      const xml = root.toXML()
      expect(xml).toContain('priority="1"')
      expect(xml).toContain('priority="2"')
      root.dispose()
    })

    test('Parallel preserves child key props', async () => {
      const { jsx } = await import('../reconciler/jsx-runtime.js')

      const root = createSmithersRoot()
      await root.render(
        <SmithersProvider db={db} executionId={executionId}>
          <Parallel>
            {jsx('step', { name: 'keyed1' }, 'key-alpha')}
            {jsx('step', { name: 'keyed2' }, 'key-beta')}
          </Parallel>
        </SmithersProvider>
      )

      const tree = root.getTree()

      function findParallel(node: typeof tree): typeof tree | null {
        if (node.type === 'parallel') return node
        for (const child of node.children) {
          const result = findParallel(child)
          if (result) return result
        }
        return null
      }

      const parallel = findParallel(tree)
      expect(parallel).not.toBeNull()
      expect(parallel!.type).toBe('parallel')

      function findAllSteps(node: typeof tree): typeof tree[] {
        let steps: typeof tree[] = []
        if (node.type === 'step') steps.push(node)
        for (const child of node.children) {
          steps = steps.concat(findAllSteps(child))
        }
        return steps
      }

      const steps = findAllSteps(parallel!)
      expect(steps.some(s => s.key === 'key-alpha')).toBe(true)
      expect(steps.some(s => s.key === 'key-beta')).toBe(true)
      root.dispose()
    })
  })

  describe('Error scenarios', () => {
    test('Parallel handles child component that throws', async () => {
      function ThrowingChild() {
        throw new Error('Child error')
      }

      const root = createSmithersRoot()

      const result = await Promise.race([
        root.mount(() => (
          <SmithersProvider db={db} executionId={executionId}>
            <Parallel>
              <ThrowingChild />
            </Parallel>
          </SmithersProvider>
        )).then(
          () => 'complete',
          (error) => error
        ),
        new Promise<'timeout'>((resolve) => {
          setTimeout(() => resolve('timeout'), 100)
        }),
      ])

      expect(result).not.toBe('timeout')
      expect(result).toBeInstanceOf(Error)
      expect((result as Error).message).toBe('Child error')

      root.dispose()
    })

    test('Parallel continues rendering other children when one is null', async () => {
      const root = createSmithersRoot()
      await root.render(
        <SmithersProvider db={db} executionId={executionId}>
          <Parallel>
            <step name="before" />
            {null}
            <step name="after" />
          </Parallel>
        </SmithersProvider>
      )

      const xml = root.toXML()
      expect(xml).toContain('before')
      expect(xml).toContain('after')
      root.dispose()
    })
  })

  describe('Conditional rendering', () => {
    test('Parallel with conditional children', async () => {
      const showSecond = true
      const showThird = false

      const root = createSmithersRoot()
      await root.render(
        <SmithersProvider db={db} executionId={executionId}>
          <Parallel>
            <step name="first" />
            {showSecond && <step name="second" />}
            {showThird && <step name="third" />}
          </Parallel>
        </SmithersProvider>
      )

      const xml = root.toXML()
      expect(xml).toContain('first')
      expect(xml).toContain('second')
      expect(xml).not.toContain('third')
      root.dispose()
    })

    test('Parallel with array children', async () => {
      const items = ['a', 'b', 'c']

      const root = createSmithersRoot()
      await root.render(
        <SmithersProvider db={db} executionId={executionId}>
          <Parallel>
            {items.map((item, i) => (
              <step key={i} name={`item-${item}`} />
            ))}
          </Parallel>
        </SmithersProvider>
      )

      const xml = root.toXML()
      expect(xml).toContain('item-a')
      expect(xml).toContain('item-b')
      expect(xml).toContain('item-c')
      root.dispose()
    })
  })

  describe('Tree structure', () => {
    test('getTree returns correct structure for Parallel', async () => {
      const root = createSmithersRoot()
      await root.render(
        <SmithersProvider db={db} executionId={executionId}>
          <Parallel>
            <step name="s1" />
            <step name="s2" />
          </Parallel>
        </SmithersProvider>
      )

      const tree = root.getTree()
      expect(tree.type).toBe('ROOT')

      function findParallel(node: typeof tree): typeof tree | null {
        if (node.type === 'parallel') return node
        for (const child of node.children) {
          const result = findParallel(child)
          if (result) return result
        }
        return null
      }

      const parallel = findParallel(tree)
      expect(parallel).not.toBeNull()
      expect(parallel!.type).toBe('parallel')

      const stepChildren = parallel!.children.flatMap(c =>
        c.type === 'step' ? [c] : c.children.filter(cc => cc.type === 'step')
      )
      expect(stepChildren.length).toBeGreaterThanOrEqual(2)
      root.dispose()
    })

    test('parent references are set correctly in Parallel children', async () => {
      const root = createSmithersRoot()
      await root.render(
        <SmithersProvider db={db} executionId={executionId}>
          <Parallel>
            <step name="child" />
          </Parallel>
        </SmithersProvider>
      )

      const tree = root.getTree()

      function findStep(node: typeof tree): typeof tree | null {
        if (node.type === 'step') return node
        for (const child of node.children) {
          const result = findStep(child)
          if (result) return result
        }
        return null
      }

      const step = findStep(tree)
      expect(step).not.toBeNull()
      expect(step!.parent).not.toBeNull()
      root.dispose()
    })
  })
})

describe('Index exports', () => {
  test('exports Parallel from index', async () => {
    const index = await import('./index.js')
    expect(index.Parallel).toBeDefined()
  })
})
