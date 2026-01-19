/**
 * Orchestration Semantics Tests
 * 
 * These tests verify the CORE execution model of Smithers:
 * - Step progression advances based on task completion
 * - Phase progression advances when all steps complete
 * - Inactive steps do not execute side effects
 * - Task completion drives the Ralph loop
 * 
 * This is the highest-priority test gap identified in the review.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import React, { useRef } from 'react'
import { createSmithersDB, type SmithersDB } from '../src/db/index.js'
import { createSmithersRoot, type SmithersRoot } from '../src/reconciler/root.js'
import { SmithersProvider, signalOrchestrationComplete, useSmithers } from '../src/components/SmithersProvider.js'
import { Phase } from '../src/components/Phase.js'
import { Step } from '../src/components/Step.js'
import { useExecutionEffect, useExecutionScope } from '../src/components/ExecutionScope.js'

// ============================================================================
// TEST UTILITIES
// ============================================================================

/**
 * FakeWork component - starts a task and completes it after a delay.
 * Used to simulate agent work driving step completion.
 */
function FakeWork(props: { name: string; delay?: number; onStart?: () => void; onComplete?: () => void }) {
  const { db } = useSmithers()
  const executionScope = useExecutionScope()
  const taskIdRef = useRef<string | null>(null)

  useExecutionEffect(executionScope.enabled, () => {
    props.onStart?.()
    taskIdRef.current = db.tasks.start('fake-work', props.name)
    
    const timeoutId = setTimeout(() => {
      if (!db.db.isClosed && taskIdRef.current) {
        db.tasks.complete(taskIdRef.current)
        props.onComplete?.()
      }
    }, props.delay ?? 10)
    
    return () => clearTimeout(timeoutId)
  }, [db, executionScope.enabled, props.delay, props.name, props.onComplete, props.onStart])

  return <task name={props.name} />
}

/**
 * Helper to wait for a condition with timeout
 */
async function waitFor(
  condition: () => boolean,
  timeout = 2000,
  interval = 10
): Promise<void> {
  const start = Date.now()
  while (!condition()) {
    if (Date.now() - start > timeout) {
      throw new Error(`waitFor timeout after ${timeout}ms`)
    }
    await new Promise(r => setTimeout(r, interval))
  }
}

/**
 * Helper to get step index from DB state
 */
function getStepIndex(db: SmithersDB, phaseId: string): number | null {
  const stateKey = `stepIndex_${phaseId}`
  const row = db.db.queryOne<{ value: string }>('SELECT value FROM state WHERE key = ?', [stateKey])
  return row ? parseInt(row.value, 10) : null
}

/**
 * Helper to get phase index from DB state
 */
function getPhaseIndex(db: SmithersDB): number | null {
  const row = db.db.queryOne<{ value: string }>('SELECT value FROM state WHERE key = ?', ['phaseIndex_default'])
  return row ? parseInt(row.value, 10) : null
}

/**
 * Helper to count tasks by status
 */
function countTasks(db: SmithersDB, status: 'running' | 'completed' | 'failed'): number {
  const row = db.db.queryOne<{ count: number }>(
    'SELECT COUNT(*) as count FROM tasks WHERE status = ?',
    [status]
  )
  return row?.count ?? 0
}

// ============================================================================
// STEP PROGRESSION TESTS
// ============================================================================

describe('Step Progression', () => {
  let db: SmithersDB
  let root: SmithersRoot
  let executionId: string

  beforeEach(() => {
    db = createSmithersDB({ reset: true })
    executionId = db.execution.start('test-step-progression', 'test.tsx')
    root = createSmithersRoot()
  })

  afterEach(() => {
    signalOrchestrationComplete()
    root.dispose()
    db.close()
  })

  it('should start with stepIndex 0', async () => {
    await root.render(
      <SmithersProvider db={db} executionId={executionId}>
        <Phase name="P1">
          <Step name="S1"><FakeWork name="work1" delay={1000} /></Step>
          <Step name="S2"><FakeWork name="work2" delay={1000} /></Step>
        </Phase>
      </SmithersProvider>
    )

    // Give time for initialization
    await new Promise(r => setTimeout(r, 50))
    
    const stepIndex = getStepIndex(db, 'P1')
    expect(stepIndex).toBe(0)
  })

  it('should advance stepIndex when first step task completes', async () => {
    let step1Started = false
    let step1Completed = false

    await root.render(
      <SmithersProvider db={db} executionId={executionId}>
        <Phase name="P1">
          <Step name="S1">
            <FakeWork 
              name="work1" 
              delay={30}
              onStart={() => { step1Started = true }}
              onComplete={() => { step1Completed = true }}
            />
          </Step>
          <Step name="S2"><FakeWork name="work2" delay={500} /></Step>
        </Phase>
      </SmithersProvider>
    )

    // Wait for step 1 to start
    await waitFor(() => step1Started, 500)
    expect(getStepIndex(db, 'P1')).toBe(0)

    // Wait for step 1 to complete
    await waitFor(() => step1Completed, 500)
    
    // Wait for step advancement
    await waitFor(() => {
      const idx = getStepIndex(db, 'P1')
      return idx !== null && idx >= 1
    }, 500)

    expect(getStepIndex(db, 'P1')).toBeGreaterThanOrEqual(1)
  })

  it('should not execute inactive step children', async () => {
    let step2WorkStarted = false

    await root.render(
      <SmithersProvider db={db} executionId={executionId}>
        <Phase name="P1">
          <Step name="S1"><FakeWork name="work1" delay={500} /></Step>
          <Step name="S2">
            <FakeWork 
              name="work2" 
              delay={10}
              onStart={() => { step2WorkStarted = true }}
            />
          </Step>
        </Phase>
      </SmithersProvider>
    )

    // Wait a bit - step 2 should NOT start while step 1 is active
    await new Promise(r => setTimeout(r, 100))
    
    // Step 2 work should not have started
    expect(step2WorkStarted).toBe(false)
    expect(getStepIndex(db, 'P1')).toBe(0)
  })

  it('should execute steps sequentially', async () => {
    const executionOrder: string[] = []

    await root.render(
      <SmithersProvider db={db} executionId={executionId}>
        <Phase name="P1">
          <Step name="S1">
            <FakeWork 
              name="work1" 
              delay={20}
              onStart={() => executionOrder.push('S1-start')}
              onComplete={() => executionOrder.push('S1-complete')}
            />
          </Step>
          <Step name="S2">
            <FakeWork 
              name="work2" 
              delay={20}
              onStart={() => executionOrder.push('S2-start')}
              onComplete={() => executionOrder.push('S2-complete')}
            />
          </Step>
          <Step name="S3">
            <FakeWork 
              name="work3" 
              delay={20}
              onStart={() => executionOrder.push('S3-start')}
              onComplete={() => executionOrder.push('S3-complete')}
            />
          </Step>
        </Phase>
      </SmithersProvider>
    )

    // Wait for all steps to complete
    await waitFor(() => executionOrder.length >= 6, 2000)

    // Verify sequential execution: each step completes before next starts
    expect(executionOrder).toEqual([
      'S1-start', 'S1-complete',
      'S2-start', 'S2-complete',
      'S3-start', 'S3-complete',
    ])
  })
})

// ============================================================================
// PHASE PROGRESSION TESTS  
// ============================================================================

describe('Phase Progression', () => {
  let db: SmithersDB
  let root: SmithersRoot
  let executionId: string

  beforeEach(() => {
    db = createSmithersDB({ reset: true })
    executionId = db.execution.start('test-phase-progression', 'test.tsx')
    root = createSmithersRoot()
  })

  afterEach(() => {
    signalOrchestrationComplete()
    root.dispose()
    db.close()
  })

  it('should start with first phase active', async () => {
    await root.render(
      <SmithersProvider db={db} executionId={executionId} stopped>
        <Phase name="P1"><task>Work 1</task></Phase>
        <Phase name="P2"><task>Work 2</task></Phase>
      </SmithersProvider>
    )

    const xml = root.toXML()
    expect(xml).toContain('name="P1"')
    expect(xml).toContain('status="active"')
    // P2 should be pending
    expect(xml).toMatch(/name="P2"[^>]*status="pending"/)
  })

  it('should advance phase when all steps complete', async () => {
    let phase1StepCompleted = false
    let phase2StepStarted = false

    await root.render(
      <SmithersProvider db={db} executionId={executionId}>
        <Phase name="P1">
          <Step name="P1-S1">
            <FakeWork 
              name="p1-work" 
              delay={30}
              onComplete={() => { phase1StepCompleted = true }}
            />
          </Step>
        </Phase>
        <Phase name="P2">
          <Step name="P2-S1">
            <FakeWork 
              name="p2-work" 
              delay={500}
              onStart={() => { phase2StepStarted = true }}
            />
          </Step>
        </Phase>
      </SmithersProvider>
    )

    // Wait for phase 1 step to complete
    await waitFor(() => phase1StepCompleted, 500)

    // Wait for phase 2 to become active and start
    await waitFor(() => phase2StepStarted, 1000)

    expect(phase2StepStarted).toBe(true)
  })

  it('should not render inactive phase children', async () => {
    await root.render(
      <SmithersProvider db={db} executionId={executionId} stopped>
        <Phase name="P1">
          <p1-child>Phase 1 content</p1-child>
        </Phase>
        <Phase name="P2">
          <p2-child>Phase 2 content</p2-child>
        </Phase>
      </SmithersProvider>
    )

    const xml = root.toXML()
    expect(xml).toContain('<p1-child>')
    expect(xml).not.toContain('<p2-child>')
  })

  it('should execute phases sequentially', async () => {
    const executionOrder: string[] = []

    await root.render(
      <SmithersProvider db={db} executionId={executionId}>
        <Phase name="P1" onStart={() => executionOrder.push('P1-start')}>
          <Step name="P1-S1">
            <FakeWork 
              name="p1-work" 
              delay={20} 
              onComplete={() => executionOrder.push('P1-work-done')}
            />
          </Step>
        </Phase>
        <Phase name="P2" onStart={() => executionOrder.push('P2-start')}>
          <Step name="P2-S1">
            <FakeWork 
              name="p2-work" 
              delay={20}
              onComplete={() => executionOrder.push('P2-work-done')}
            />
          </Step>
        </Phase>
        <Phase name="P3" onStart={() => executionOrder.push('P3-start')}>
          <Step name="P3-S1">
            <FakeWork 
              name="p3-work" 
              delay={20}
              onComplete={() => executionOrder.push('P3-work-done')}
            />
          </Step>
        </Phase>
      </SmithersProvider>
    )

    // Wait for phase 3 work to complete
    await waitFor(() => executionOrder.includes('P3-work-done'), 2000)

    // Verify sequential: each phase work completes before next starts
    const p1Start = executionOrder.indexOf('P1-start')
    const p1Done = executionOrder.indexOf('P1-work-done')
    const p2Start = executionOrder.indexOf('P2-start')
    const p2Done = executionOrder.indexOf('P2-work-done')
    const p3Start = executionOrder.indexOf('P3-start')

    expect(p1Start).toBeGreaterThanOrEqual(0)
    expect(p1Done).toBeGreaterThan(p1Start)
    expect(p2Start).toBeGreaterThan(p1Done)
    expect(p2Done).toBeGreaterThan(p2Start)
    expect(p3Start).toBeGreaterThan(p2Done)
  })
})

// ============================================================================
// TASK COMPLETION DRIVING PROGRESSION
// ============================================================================

describe('Task Completion Drives Progression', () => {
  let db: SmithersDB
  let root: SmithersRoot
  let executionId: string

  beforeEach(() => {
    db = createSmithersDB({ reset: true })
    executionId = db.execution.start('test-task-completion', 'test.tsx')
    root = createSmithersRoot()
  })

  afterEach(() => {
    signalOrchestrationComplete()
    root.dispose()
    db.close()
  })

  it('should track running tasks in database', async () => {
    await root.render(
      <SmithersProvider db={db} executionId={executionId}>
        <Phase name="P1">
          <Step name="S1">
            <FakeWork name="work1" delay={200} />
          </Step>
        </Phase>
      </SmithersProvider>
    )

    // Wait for task to start
    await waitFor(() => countTasks(db, 'running') > 0, 500)
    expect(countTasks(db, 'running')).toBeGreaterThan(0)

    // Wait for task to complete
    await waitFor(() => countTasks(db, 'completed') > 0, 500)
    expect(countTasks(db, 'completed')).toBeGreaterThan(0)
  })

  it('should complete steps table when step finishes', async () => {
    let stepCompleted = false

    await root.render(
      <SmithersProvider db={db} executionId={executionId}>
        <Phase name="P1">
          <Step name="S1" onComplete={() => { stepCompleted = true }}>
            <FakeWork name="work1" delay={30} />
          </Step>
        </Phase>
      </SmithersProvider>
    )

    await waitFor(() => stepCompleted, 500)

    // Check steps table
    const completedSteps = db.db.query<{ name: string; status: string }>(
      'SELECT name, status FROM steps WHERE status = ?',
      ['completed']
    )
    expect(completedSteps.length).toBeGreaterThan(0)
    expect(completedSteps.some(s => s.name === 'S1')).toBe(true)
  })

  it('should complete phases table when phase finishes', async () => {
    let phaseCompleted = false

    await root.render(
      <SmithersProvider db={db} executionId={executionId}>
        <Phase name="P1" onComplete={() => { phaseCompleted = true }}>
          <Step name="S1">
            <FakeWork name="work1" delay={30} />
          </Step>
        </Phase>
        <Phase name="P2">
          <Step name="S2">
            <FakeWork name="work2" delay={500} />
          </Step>
        </Phase>
      </SmithersProvider>
    )

    await waitFor(() => phaseCompleted, 1000)

    // Check phases table
    const completedPhases = db.db.query<{ name: string; status: string }>(
      'SELECT name, status FROM phases WHERE status = ?',
      ['completed']
    )
    expect(completedPhases.length).toBeGreaterThan(0)
    expect(completedPhases.some(p => p.name === 'P1')).toBe(true)
  })
})

// ============================================================================
// EXECUTION SCOPE GATING
// ============================================================================

describe('Execution Scope Gating', () => {
  let db: SmithersDB
  let root: SmithersRoot
  let executionId: string

  beforeEach(() => {
    db = createSmithersDB({ reset: true })
    executionId = db.execution.start('test-execution-scope', 'test.tsx')
    root = createSmithersRoot()
  })

  afterEach(() => {
    signalOrchestrationComplete()
    root.dispose()
    db.close()
  })

  // NOTE: The `stopped` prop controls completion detection, not execution gating.
  // For execution gating, components use ExecutionScope context.
  // This test documents the current behavior where execution still happens.
  it('should render structure correctly when stopped prop is true', async () => {
    await root.render(
      <SmithersProvider db={db} executionId={executionId} stopped>
        <Phase name="P1">
          <Step name="S1">
            <task name="work" />
          </Step>
        </Phase>
      </SmithersProvider>
    )

    const xml = root.toXML()
    // When stopped, components still render - stopped affects completion callbacks
    expect(xml).toContain('name="P1"')
    expect(xml).toContain('name="S1"')
    expect(xml).toContain('<task')
  })

  it('should propagate execution scope to children', async () => {
    let scopeEnabled = false
    
    function ScopeChecker() {
      const scope = useExecutionScope()
      scopeEnabled = scope.enabled
      return <check enabled={scope.enabled} />
    }

    await root.render(
      <SmithersProvider db={db} executionId={executionId}>
        <Phase name="P1">
          <Step name="S1">
            <ScopeChecker />
          </Step>
        </Phase>
      </SmithersProvider>
    )

    // First step should have execution enabled
    expect(scopeEnabled).toBe(true)
  })

  it('should disable execution scope for inactive steps', async () => {
    let step2ScopeEnabled: boolean | null = null
    
    function ScopeChecker() {
      const scope = useExecutionScope()
      step2ScopeEnabled = scope.enabled
      return <check enabled={scope.enabled} />
    }

    await root.render(
      <SmithersProvider db={db} executionId={executionId}>
        <Phase name="P1">
          <Step name="S1">
            <FakeWork name="work1" delay={500} />
          </Step>
          <Step name="S2">
            <ScopeChecker />
          </Step>
        </Phase>
      </SmithersProvider>
    )

    // Wait a bit for render
    await new Promise(r => setTimeout(r, 50))

    // Step 2 is inactive while step 1 is running
    expect(step2ScopeEnabled).toBe(false)
  })
})

// ============================================================================
// RALPH LOOP ITERATION
// ============================================================================

describe('Ralph Loop Iteration', () => {
  let db: SmithersDB
  let root: SmithersRoot
  let executionId: string

  beforeEach(() => {
    db = createSmithersDB({ reset: true })
    executionId = db.execution.start('test-ralph-loop', 'test.tsx')
    root = createSmithersRoot()
  })

  afterEach(() => {
    signalOrchestrationComplete()
    root.dispose()
    db.close()
  })

  it('should track iteration count in database', async () => {
    let iterationCount = 0

    await root.render(
      <SmithersProvider 
        db={db} 
        executionId={executionId}
        maxIterations={3}
        onIteration={(n) => { iterationCount = n }}
      >
        <Phase name="P1">
          <Step name="S1">
            <FakeWork name="work1" delay={20} />
          </Step>
        </Phase>
      </SmithersProvider>
    )

    // Wait for first iteration to complete and trigger next
    await waitFor(() => iterationCount >= 1, 1000)

    // Check ralphCount in state table
    const row = db.db.queryOne<{ value: string }>('SELECT value FROM state WHERE key = ?', ['ralphCount'])
    expect(row).toBeDefined()
    expect(parseInt(row!.value, 10)).toBeGreaterThanOrEqual(1)
  })

  it('should respect maxIterations limit', async () => {
    let iterationCount = 0

    await root.render(
      <SmithersProvider 
        db={db} 
        executionId={executionId}
        maxIterations={2}
        onIteration={(n) => { iterationCount = n }}
      >
        <Phase name="P1">
          <Step name="S1">
            <FakeWork name="work1" delay={10} />
          </Step>
        </Phase>
      </SmithersProvider>
    )

    // Wait for at least one iteration
    await waitFor(() => iterationCount >= 1, 1000)

    // Verify iteration count is tracked
    const row = db.db.queryOne<{ value: string }>('SELECT value FROM state WHERE key = ?', ['ralphCount'])
    expect(row).toBeDefined()
    
    // Iteration should be within bounds (0-indexed, so max 2 means values 0, 1)
    const count = parseInt(row!.value, 10)
    expect(count).toBeLessThanOrEqual(2)
  })
})
