/**
 * Comprehensive tests for Step component
 * Tests component rendering, lifecycle, props, and edge cases
 */
import { test, expect, describe, beforeEach, afterEach } from 'bun:test'
import { useRef } from 'react'
import { createSmithersRoot } from '../reconciler/root.js'
import { createSmithersDB, type SmithersDB } from '../db/index.js'
import {
  Step,
  StepRegistryProvider,
  useStepRegistry,
  useStepIndex,
  type StepProps,
  type StepRegistryProviderProps,
} from './Step.js'
import { SmithersProvider, useSmithers } from './SmithersProvider.js'
import { useExecutionEffect, useExecutionScope } from './ExecutionScope.js'
import { Phase } from './Phase.js'
import { Parallel } from './Parallel.js'
import { PhaseRegistryProvider } from './PhaseRegistry.js'

function StepTaskRunner(props: { name: string; delay?: number }) {
  const { db } = useSmithers()
  const executionScope = useExecutionScope()
  const taskIdRef = useRef<string | null>(null)

  useExecutionEffect(executionScope.enabled, () => {
    taskIdRef.current = db.tasks.start('test-task', props.name)
    const timeoutId = setTimeout(() => {
      if (!db.db.isClosed && taskIdRef.current) {
        db.tasks.complete(taskIdRef.current)
      }
    }, props.delay ?? 20)
    return () => clearTimeout(timeoutId)
  }, [db, executionScope.enabled, props.delay, props.name])

  return <task name={props.name} />
}

describe('Step component', () => {
  let db: SmithersDB
  let executionId: string

  beforeEach(async () => {
    db = createSmithersDB({ reset: true })
    executionId = await db.execution.start('test-step', 'Step.test.tsx')
  })

  afterEach(() => {
    db.close()
  })

  describe('Exports', () => {
    test('exports Step component', () => {
      expect(Step).toBeDefined()
      expect(typeof Step).toBe('function')
    })

    test('exports StepRegistryProvider', () => {
      expect(StepRegistryProvider).toBeDefined()
      expect(typeof StepRegistryProvider).toBe('function')
    })

    test('exports useStepRegistry hook', () => {
      expect(useStepRegistry).toBeDefined()
      expect(typeof useStepRegistry).toBe('function')
    })

    test('exports useStepIndex hook', () => {
      expect(useStepIndex).toBeDefined()
      expect(typeof useStepIndex).toBe('function')
    })
  })

  describe('StepProps interface', () => {
    test('accepts children prop (required)', () => {
      const props: StepProps = {
        children: null,
      }
      expect(props.children).toBeNull()
    })

    test('accepts optional name prop', () => {
      const props: StepProps = {
        children: <div />,
        name: 'test-step',
      }
      expect(props.name).toBe('test-step')
    })

    test('accepts optional snapshotBefore prop', () => {
      const props: StepProps = {
        children: <div />,
        snapshotBefore: true,
      }
      expect(props.snapshotBefore).toBe(true)
    })

    test('accepts optional snapshotAfter prop', () => {
      const props: StepProps = {
        children: <div />,
        snapshotAfter: true,
      }
      expect(props.snapshotAfter).toBe(true)
    })

    test('accepts optional commitAfter prop', () => {
      const props: StepProps = {
        children: <div />,
        commitAfter: true,
      }
      expect(props.commitAfter).toBe(true)
    })

    test('accepts optional commitMessage prop', () => {
      const props: StepProps = {
        children: <div />,
        commitMessage: 'feat: add feature',
      }
      expect(props.commitMessage).toBe('feat: add feature')
    })

    test('accepts optional onStart callback', () => {
      const onStart = () => {}
      const props: StepProps = {
        children: <div />,
        onStart,
      }
      expect(props.onStart).toBe(onStart)
    })

    test('accepts optional onComplete callback', () => {
      const onComplete = () => {}
      const props: StepProps = {
        children: <div />,
        onComplete,
      }
      expect(props.onComplete).toBe(onComplete)
    })

    test('accepts optional onError callback', () => {
      const onError = () => {}
      const props: StepProps = {
        children: <div />,
        onError,
      }
      expect(props.onError).toBe(onError)
    })
  })

  describe('StepRegistryProviderProps interface', () => {
    test('accepts children prop', () => {
      const props: StepRegistryProviderProps = {
        children: null,
      }
      expect(props.children).toBeNull()
    })

    test('accepts optional phaseId prop', () => {
      const props: StepRegistryProviderProps = {
        children: null,
        phaseId: 'phase-1',
      }
      expect(props.phaseId).toBe('phase-1')
    })

    test('accepts optional isParallel prop', () => {
      const props: StepRegistryProviderProps = {
        children: null,
        isParallel: true,
      }
      expect(props.isParallel).toBe(true)
    })

    test('accepts optional onAllStepsComplete callback', () => {
      const callback = () => {}
      const props: StepRegistryProviderProps = {
        children: null,
        onAllStepsComplete: callback,
      }
      expect(props.onAllStepsComplete).toBe(callback)
    })
  })

  describe('Step renders with required props', () => {
    test('renders Step with only children', async () => {
      const root = createSmithersRoot()
      await root.render(
        <SmithersProvider db={db} executionId={executionId}>
          <Step>Child content</Step>
        </SmithersProvider>
      )

      const xml = root.toXML()
      expect(xml).toContain('<step')
      expect(xml).toContain('Child content')
      root.dispose()
    })

    test('renders step element without name attribute when name not provided', async () => {
      const root = createSmithersRoot()
      await root.render(
        <SmithersProvider db={db} executionId={executionId}>
          <Step><span>content</span></Step>
        </SmithersProvider>
      )

      const tree = root.getTree()
      const stepNode = findNodeByType(tree, 'step')
      expect(stepNode).toBeDefined()
      expect(stepNode?.props.name).toBeUndefined()
      root.dispose()
    })
  })

  describe('Step with name prop', () => {
    test('renders step with name attribute', async () => {
      const root = createSmithersRoot()
      await root.render(
        <SmithersProvider db={db} executionId={executionId}>
          <Step name="my-step"><div /></Step>
        </SmithersProvider>
      )

      const xml = root.toXML()
      expect(xml).toContain('name="my-step"')
      root.dispose()
    })

    test('renders step with empty name (treated as no name)', async () => {
      const root = createSmithersRoot()
      await root.render(
        <SmithersProvider db={db} executionId={executionId}>
          <Step name=""><div /></Step>
        </SmithersProvider>
      )

      const tree = root.getTree()
      const stepNode = findNodeByType(tree, 'step')
      // Empty string is falsy, so name prop is not set on element
      expect(stepNode).toBeDefined()
      root.dispose()
    })

    test('renders step with very long name', async () => {
      const longName = 'a'.repeat(1000)
      const root = createSmithersRoot()
      await root.render(
        <SmithersProvider db={db} executionId={executionId}>
          <Step name={longName}><div /></Step>
        </SmithersProvider>
      )

      const tree = root.getTree()
      const stepNode = findNodeByType(tree, 'step')
      expect(stepNode?.props.name).toBe(longName)
      root.dispose()
    })

    test('renders step with special characters in name', async () => {
      const root = createSmithersRoot()
      await root.render(
        <SmithersProvider db={db} executionId={executionId}>
          <Step name="step-with-special_chars.v2"><div /></Step>
        </SmithersProvider>
      )

      const xml = root.toXML()
      expect(xml).toContain('step-with-special_chars.v2')
      root.dispose()
    })
  })

  describe('Step with children', () => {
    test('renders single child element', async () => {
      const root = createSmithersRoot()
      await root.render(
        <SmithersProvider db={db} executionId={executionId}>
          <Step name="test">
            <div>Single child</div>
          </Step>
        </SmithersProvider>
      )

      const xml = root.toXML()
      expect(xml).toContain('Single child')
      root.dispose()
    })

    test('renders multiple children', async () => {
      const root = createSmithersRoot()
      await root.render(
        <SmithersProvider db={db} executionId={executionId}>
          <Step name="test">
            <div>First</div>
            <div>Second</div>
          </Step>
        </SmithersProvider>
      )

      const xml = root.toXML()
      expect(xml).toContain('First')
      expect(xml).toContain('Second')
      root.dispose()
    })

    test('renders text children', async () => {
      const root = createSmithersRoot()
      await root.render(
        <SmithersProvider db={db} executionId={executionId}>
          <Step name="test">Plain text content</Step>
        </SmithersProvider>
      )

      const xml = root.toXML()
      expect(xml).toContain('Plain text content')
      root.dispose()
    })

    test('renders nested children', async () => {
      const root = createSmithersRoot()
      await root.render(
        <SmithersProvider db={db} executionId={executionId}>
          <Step name="test">
            <div>
              <span>Nested content</span>
            </div>
          </Step>
        </SmithersProvider>
      )

      const xml = root.toXML()
      expect(xml).toContain('Nested content')
      root.dispose()
    })

    test('renders null children gracefully', async () => {
      const root = createSmithersRoot()
      await root.render(
        <SmithersProvider db={db} executionId={executionId}>
          <Step name="test">
            {null}
          </Step>
        </SmithersProvider>
      )

      const tree = root.getTree()
      const stepNode = findNodeByType(tree, 'step')
      expect(stepNode).toBeDefined()
      root.dispose()
    })
  })

  describe('Step status transitions', () => {
    test('step has status prop', async () => {
      const root = createSmithersRoot()
      await root.render(
        <SmithersProvider db={db} executionId={executionId}>
          <Step name="test"><div /></Step>
        </SmithersProvider>
      )

      const tree = root.getTree()
      const stepNode = findNodeByType(tree, 'step')
      expect(stepNode?.props.status).toBeDefined()
      root.dispose()
    })

    test('step without registry is always active', async () => {
      const root = createSmithersRoot()
      await root.render(
        <SmithersProvider db={db} executionId={executionId}>
          <Step name="test"><div /></Step>
        </SmithersProvider>
      )

      const tree = root.getTree()
      const stepNode = findNodeByType(tree, 'step')
      expect(stepNode?.props.status).toBe('active')
      root.dispose()
    })
  })

  describe('Step callbacks', () => {
    test('onStart is called when step becomes active', async () => {
      let started = false
      const root = createSmithersRoot()

      await root.render(
        <SmithersProvider db={db} executionId={executionId}>
          <Step name="test" onStart={() => { started = true }}>
            <div />
          </Step>
        </SmithersProvider>
      )

      // Wait for async operations
      await new Promise(r => setTimeout(r, 150))

      expect(started).toBe(true)
      root.dispose()
    })

    test('onComplete is called when step finishes', async () => {
      let completed = false
      const root = createSmithersRoot()

      await root.render(
        <SmithersProvider db={db} executionId={executionId}>
          <PhaseRegistryProvider>
            <Phase name="test-phase">
              <Step name="test" onComplete={() => { completed = true }}>
                <div />
              </Step>
            </Phase>
          </PhaseRegistryProvider>
        </SmithersProvider>
      )

      // Wait for step to start
      await new Promise(r => setTimeout(r, 100))

      // Dispose triggers unmount, which should fire onComplete for started step
      root.dispose()
      
      // Give async cleanup a moment
      await new Promise(r => setTimeout(r, 50))

      expect(completed).toBe(true)
    })
  })

  describe('Step within Phase context', () => {
    test('renders step inside Phase', async () => {
      const root = createSmithersRoot()
      await root.render(
        <SmithersProvider db={db} executionId={executionId}>
          <PhaseRegistryProvider>
            <Phase name="test-phase">
              <Step name="inner-step"><div /></Step>
            </Phase>
          </PhaseRegistryProvider>
        </SmithersProvider>
      )

      const xml = root.toXML()
      expect(xml).toContain('test-phase')
      expect(xml).toContain('inner-step')
      root.dispose()
    })

    test('multiple steps in Phase', async () => {
      const root = createSmithersRoot()
      await root.render(
        <SmithersProvider db={db} executionId={executionId}>
          <PhaseRegistryProvider>
            <Phase name="test-phase">
              <Step name="step-1"><div>First</div></Step>
              <Step name="step-2"><div>Second</div></Step>
            </Phase>
          </PhaseRegistryProvider>
        </SmithersProvider>
      )

      const xml = root.toXML()
      expect(xml).toContain('step-1')
      expect(xml).toContain('step-2')
      root.dispose()
    })
  })

  describe('Step with no Phase context', () => {
    test('step renders independently', async () => {
      const root = createSmithersRoot()
      await root.render(
        <SmithersProvider db={db} executionId={executionId}>
          <Step name="standalone"><div /></Step>
        </SmithersProvider>
      )

      const tree = root.getTree()
      const stepNode = findNodeByType(tree, 'step')
      expect(stepNode).toBeDefined()
      expect(stepNode?.props.name).toBe('standalone')
      root.dispose()
    })

    test('standalone step is always active', async () => {
      const root = createSmithersRoot()
      await root.render(
        <SmithersProvider db={db} executionId={executionId}>
          <Step name="standalone"><div /></Step>
        </SmithersProvider>
      )

      const tree = root.getTree()
      const stepNode = findNodeByType(tree, 'step')
      expect(stepNode?.props.status).toBe('active')
      root.dispose()
    })
  })

  describe('Concurrent steps with Parallel', () => {
    test('renders steps inside Parallel', async () => {
      const root = createSmithersRoot()
      await root.render(
        <SmithersProvider db={db} executionId={executionId}>
          <Parallel>
            <Step name="parallel-1"><div /></Step>
            <Step name="parallel-2"><div /></Step>
          </Parallel>
        </SmithersProvider>
      )

      const xml = root.toXML()
      expect(xml).toContain('parallel-1')
      expect(xml).toContain('parallel-2')
      expect(xml).toContain('<parallel>')
      root.dispose()
    })

    test('parallel steps all render children (all active)', async () => {
      const root = createSmithersRoot()
      await root.render(
        <SmithersProvider db={db} executionId={executionId}>
          <Parallel>
            <Step name="p1"><span>Content 1</span></Step>
            <Step name="p2"><span>Content 2</span></Step>
          </Parallel>
        </SmithersProvider>
      )

      const xml = root.toXML()
      expect(xml).toContain('Content 1')
      expect(xml).toContain('Content 2')
      root.dispose()
    })
  })

  describe('StepRegistryProvider behavior', () => {
    test('provides context to children', async () => {
      let registryValue: ReturnType<typeof useStepRegistry> = undefined
      
      function Consumer() {
        registryValue = useStepRegistry()
        return <status hasRegistry={registryValue !== undefined} />
      }

      const root = createSmithersRoot()
      await root.render(
        <SmithersProvider db={db} executionId={executionId}>
          <StepRegistryProvider>
            <Consumer />
          </StepRegistryProvider>
        </SmithersProvider>
      )

      expect(registryValue).toBeDefined()
      expect(registryValue?.registerStep).toBeDefined()
      expect(registryValue?.advanceStep).toBeDefined()
      expect(registryValue?.isStepActive).toBeDefined()
      expect(registryValue?.isStepCompleted).toBeDefined()
      root.dispose()
    })

    test('useStepRegistry returns undefined outside provider', async () => {
      let registryValue: ReturnType<typeof useStepRegistry> = { registerStep: () => 0 } as any
      
      function Consumer() {
        registryValue = useStepRegistry()
        return <status />
      }

      const root = createSmithersRoot()
      await root.render(
        <SmithersProvider db={db} executionId={executionId}>
          <Consumer />
        </SmithersProvider>
      )

      expect(registryValue).toBeUndefined()
      root.dispose()
    })

    test('parallel mode makes all steps active', async () => {
      let isActive0 = false
      let isActive1 = false
      
      function Consumer() {
        const registry = useStepRegistry()
        if (registry) {
          isActive0 = registry.isStepActive(0)
          isActive1 = registry.isStepActive(1)
        }
        return <status />
      }

      const root = createSmithersRoot()
      await root.render(
        <SmithersProvider db={db} executionId={executionId}>
          <StepRegistryProvider isParallel>
            <Consumer />
          </StepRegistryProvider>
        </SmithersProvider>
      )

      expect(isActive0).toBe(true)
      expect(isActive1).toBe(true)
      root.dispose()
    })
  })

  describe('Step progression', () => {
    test('advances step index when child tasks complete', async () => {
      const root = createSmithersRoot()
      await root.render(
        <SmithersProvider db={db} executionId={executionId}>
          <StepRegistryProvider phaseId="progress">
            <Step name="one"><StepTaskRunner name="one" delay={30} /></Step>
            <Step name="two"><StepTaskRunner name="two" delay={30} /></Step>
          </StepRegistryProvider>
        </SmithersProvider>
      )

      await new Promise(r => setTimeout(r, 250))

      const stepIndex = db.state.get<number>('stepIndex_progress')
      expect(stepIndex).toBe(2)
      root.dispose()
    })

    test('fires onAllStepsComplete after final step', async () => {
      let allComplete = false
      const root = createSmithersRoot()
      await root.render(
        <SmithersProvider db={db} executionId={executionId}>
          <StepRegistryProvider phaseId="complete" onAllStepsComplete={() => { allComplete = true }}>
            <Step name="one"><StepTaskRunner name="one" delay={20} /></Step>
            <Step name="two"><StepTaskRunner name="two" delay={20} /></Step>
          </StepRegistryProvider>
        </SmithersProvider>
      )

      await new Promise(r => setTimeout(r, 250))

      expect(allComplete).toBe(true)
      root.dispose()
    })
  })

  describe('useStepIndex hook', () => {
    test('returns 0 outside registry', async () => {
      let capturedIndex = -1
      
      function Consumer() {
        capturedIndex = useStepIndex('test')
        return <status />
      }

      const root = createSmithersRoot()
      await root.render(
        <SmithersProvider db={db} executionId={executionId}>
          <Consumer />
        </SmithersProvider>
      )

      expect(capturedIndex).toBe(0)
      root.dispose()
    })

    test('returns sequential indices inside registry', async () => {
      const indices: number[] = []
      
      function Consumer({ name }: { name: string }) {
        const index = useStepIndex(name)
        indices.push(index)
        return <step-index name={name} index={index} />
      }

      const root = createSmithersRoot()
      await root.render(
        <SmithersProvider db={db} executionId={executionId}>
          <StepRegistryProvider>
            <Consumer name="first" />
            <Consumer name="second" />
            <Consumer name="third" />
          </StepRegistryProvider>
        </SmithersProvider>
      )

      expect(indices).toEqual([0, 1, 2])
      root.dispose()
    })

    test('same name returns same index', async () => {
      let firstIndex = -1
      let secondIndex = -1
      
      function Consumer({ id }: { id: string }) {
        const index = useStepIndex('same-name')
        if (id === 'first') firstIndex = index
        else secondIndex = index
        return <status />
      }

      const root = createSmithersRoot()
      await root.render(
        <SmithersProvider db={db} executionId={executionId}>
          <StepRegistryProvider>
            <Consumer id="first" />
            <Consumer id="second" />
          </StepRegistryProvider>
        </SmithersProvider>
      )

      expect(firstIndex).toBe(0)
      expect(secondIndex).toBe(0)
      root.dispose()
    })
  })

  describe('Step cleanup on unmount', () => {
    test('step cleans up when unmounted', async () => {
      let completed = false
      const root = createSmithersRoot()

      await root.render(
        <SmithersProvider db={db} executionId={executionId}>
          <Step name="test" onComplete={() => { completed = true }}>
            <div />
          </Step>
        </SmithersProvider>
      )

      // Wait for step to start
      await new Promise(r => setTimeout(r, 150))

      // Unmount
      await root.render(null)
      
      // Allow cleanup to run
      await new Promise(r => setTimeout(r, 100))

      expect(completed).toBe(true)
      root.dispose()
    })
  })

  describe('Step database integration', () => {
    test('step start is logged to database', async () => {
      const root = createSmithersRoot()
      await root.render(
        <SmithersProvider db={db} executionId={executionId}>
          <Step name="db-test"><div /></Step>
        </SmithersProvider>
      )

      // Wait for async step start
      await new Promise(r => setTimeout(r, 150))

      const steps = db.steps.getByExecution(executionId)
      expect(steps.length).toBeGreaterThanOrEqual(1)
      root.dispose()
    })
  })

  describe('Edge cases', () => {
    test('renders with undefined name', async () => {
      const root = createSmithersRoot()
      await root.render(
        <SmithersProvider db={db} executionId={executionId}>
          <Step name={undefined}><div /></Step>
        </SmithersProvider>
      )

      const tree = root.getTree()
      const stepNode = findNodeByType(tree, 'step')
      expect(stepNode).toBeDefined()
      root.dispose()
    })

    test('handles rapid mount/unmount', async () => {
      const root = createSmithersRoot()
      
      // Mount
      await root.render(
        <SmithersProvider db={db} executionId={executionId}>
          <Step name="rapid"><div /></Step>
        </SmithersProvider>
      )
      
      // Immediate unmount
      await root.render(null)
      
      // No errors should occur
      root.dispose()
    })

    test('handles re-render with same props', async () => {
      const root = createSmithersRoot()
      const element = (
        <SmithersProvider db={db} executionId={executionId}>
          <Step name="stable"><div /></Step>
        </SmithersProvider>
      )

      await root.render(element)
      await root.render(element)
      await root.render(element)

      const tree = root.getTree()
      const stepNode = findNodeByType(tree, 'step')
      expect(stepNode).toBeDefined()
      root.dispose()
    })
  })
})

describe('Index exports', () => {
  test('exports Step from index', async () => {
    const index = await import('./index.js')
    expect(index.Step).toBeDefined()
  })

  test('exports StepRegistryProvider from index', async () => {
    const index = await import('./index.js')
    expect(index.StepRegistryProvider).toBeDefined()
  })

  test('exports useStepRegistry from index', async () => {
    const index = await import('./index.js')
    expect(index.useStepRegistry).toBeDefined()
  })

  test('exports useStepIndex from index', async () => {
    const index = await import('./index.js')
    expect(index.useStepIndex).toBeDefined()
  })
})

// Helper function to find node by type in tree
function findNodeByType(node: any, type: string): any | undefined {
  if (node.type === type) return node
  for (const child of node.children ?? []) {
    const found = findNodeByType(child, type)
    if (found) return found
  }
  return undefined
}
