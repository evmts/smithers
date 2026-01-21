import { test, expect, describe, beforeEach, afterEach } from 'bun:test'
import React from 'react'
import { createSmithersDB, type SmithersDB } from '../db/index.js'
import { createSmithersRoot, type SmithersRoot } from '../reconciler/root.js'
import { SmithersProvider } from './SmithersProvider.js'
import { signalOrchestrationComplete } from './Ralph/utils.js'
import {
  PhaseRegistryProvider,
  usePhaseRegistry,
  usePhaseIndex,
  type PhaseRegistryContextValue,
  type PhaseRegistryProviderProps,
} from './PhaseRegistry.js'

// ============================================================================
// MODULE EXPORTS
// ============================================================================

describe('PhaseRegistry Exports', () => {
  test('exports PhaseRegistryProvider', () => {
    expect(PhaseRegistryProvider).toBeDefined()
    expect(typeof PhaseRegistryProvider).toBe('function')
  })

  test('exports usePhaseRegistry hook', () => {
    expect(usePhaseRegistry).toBeDefined()
    expect(typeof usePhaseRegistry).toBe('function')
  })

  test('exports usePhaseIndex hook', () => {
    expect(usePhaseIndex).toBeDefined()
    expect(typeof usePhaseIndex).toBe('function')
  })
})

// ============================================================================
// INTERFACE VALIDATION
// ============================================================================

describe('PhaseRegistryContextValue interface', () => {
  test('has registerPhase function', () => {
    const ctx: Partial<PhaseRegistryContextValue> = {
      registerPhase: (_name: string) => 0,
    }
    expect(typeof ctx.registerPhase).toBe('function')
  })

  test('has currentPhaseIndex property', () => {
    const ctx: Partial<PhaseRegistryContextValue> = {
      currentPhaseIndex: 0,
    }
    expect(ctx.currentPhaseIndex).toBe(0)
  })

  test('has advancePhase function', () => {
    const ctx: Partial<PhaseRegistryContextValue> = {
      advancePhase: () => {},
    }
    expect(typeof ctx.advancePhase).toBe('function')
  })

  test('has isPhaseActive function', () => {
    const ctx: Partial<PhaseRegistryContextValue> = {
      isPhaseActive: (index: number) => index === 0,
    }
    expect(typeof ctx.isPhaseActive).toBe('function')
    expect(ctx.isPhaseActive!(0)).toBe(true)
    expect(ctx.isPhaseActive!(1)).toBe(false)
  })

  test('has isPhaseCompleted function', () => {
    const ctx: Partial<PhaseRegistryContextValue> = {
      isPhaseCompleted: (index: number) => index < 0,
    }
    expect(typeof ctx.isPhaseCompleted).toBe('function')
  })

  test('has totalPhases property', () => {
    const ctx: Partial<PhaseRegistryContextValue> = {
      totalPhases: 3,
    }
    expect(ctx.totalPhases).toBe(3)
  })
})

describe('PhaseRegistryProviderProps interface', () => {
  test('accepts children prop', () => {
    const props: PhaseRegistryProviderProps = {
      children: null,
    }
    expect(props.children).toBeNull()
  })
})

// ============================================================================
// SQLITE STATE INTEGRATION
// ============================================================================

describe('SQLite state integration', () => {
  let db: SmithersDB

  beforeEach(() => {
    db = createSmithersDB({ reset: true })
    db.execution.start('test-phase-registry', 'test.tsx')
  })

  afterEach(() => {
    db.close()
  })

  test('currentPhaseIndex can be stored in state table', () => {
    db.state.set('currentPhaseIndex', 0, 'test')
    const value = db.state.get<number>('currentPhaseIndex')
    expect(value).toBe(0)
  })

  test('currentPhaseIndex can be updated', () => {
    db.state.set('currentPhaseIndex', 1, 'test')
    const value = db.state.get<number>('currentPhaseIndex')
    expect(value).toBe(1)
  })

  test('currentPhaseIndex transitions are logged', () => {
    db.state.set('currentPhaseIndex', 2, 'phase_advance')
    const history = db.state.history('currentPhaseIndex', 1)
    expect(history.length).toBeGreaterThan(0)
    expect(history[0].key).toBe('currentPhaseIndex')
  })

  test('phase index starts at 0', () => {
    db.state.set('currentPhaseIndex', 0, 'phase_registry_init')
    const value = db.state.get<number>('currentPhaseIndex')
    expect(value).toBe(0)
  })

  test('phase index can increment to higher values', () => {
    for (let i = 0; i < 5; i++) {
      db.state.set('currentPhaseIndex', i, 'phase_advance')
    }
    const value = db.state.get<number>('currentPhaseIndex')
    expect(value).toBe(4)
  })
})

// ============================================================================
// PHASE REGISTRATION (via SmithersRoot)
// ============================================================================

describe('PhaseRegistry registration', () => {
  let db: SmithersDB
  let root: SmithersRoot
  let executionId: string

  beforeEach(async () => {
    db = createSmithersDB({ reset: true })
    executionId = db.execution.start('test-phase-registration', 'test.tsx')
    root = createSmithersRoot()
  })

  afterEach(() => {
    signalOrchestrationComplete()
    root.dispose()
    db.close()
  })

  test('registers phases and returns indices', async () => {
    const indices: number[] = []

    function PhaseConsumer({ name }: { name: string }) {
      const idx = usePhaseIndex(name)
      indices.push(idx)
      return <phase-index name={name} index={idx} />
    }

    await root.render(
      <SmithersProvider db={db} executionId={executionId} stopped>
        <PhaseConsumer name="First" />
        <PhaseConsumer name="Second" />
        <PhaseConsumer name="Third" />
      </SmithersProvider>
    )

    expect(indices).toContain(0)
    expect(indices).toContain(1)
    expect(indices).toContain(2)
  })

  test('returns same index for duplicate phase name', async () => {
    const indices: number[] = []

    function PhaseConsumer({ name }: { name: string }) {
      const idx = usePhaseIndex(name)
      indices.push(idx)
      return <phase-index name={name} index={idx} />
    }

    await root.render(
      <SmithersProvider db={db} executionId={executionId} stopped>
        <PhaseConsumer name="Same" />
        <PhaseConsumer name="Same" />
      </SmithersProvider>
    )

    expect(indices[0]).toBe(indices[1])
  })

  test('usePhaseRegistry returns context value', async () => {
    let capturedCtx: PhaseRegistryContextValue | null = null

    function RegistryConsumer() {
      capturedCtx = usePhaseRegistry()
      return <registry-consumer captured />
    }

    await root.render(
      <SmithersProvider db={db} executionId={executionId} stopped>
        <RegistryConsumer />
      </SmithersProvider>
    )

    expect(capturedCtx).not.toBeNull()
    expect(typeof capturedCtx!.registerPhase).toBe('function')
    expect(typeof capturedCtx!.advancePhase).toBe('function')
    expect(typeof capturedCtx!.isPhaseActive).toBe('function')
    expect(typeof capturedCtx!.isPhaseCompleted).toBe('function')
    expect(typeof capturedCtx!.currentPhaseIndex).toBe('number')
  })

  test('throws when usePhaseRegistry used outside provider', async () => {
    let thrownError: Error | null = null

    function BadConsumer() {
      try {
        usePhaseRegistry()
      } catch (e) {
        thrownError = e as Error
      }
      return <error-catcher />
    }

    await root.render(<BadConsumer />)

    expect(thrownError).not.toBeNull()
    expect(thrownError!.message).toContain('usePhaseRegistry must be used within PhaseRegistryProvider')
  })
})

// ============================================================================
// PHASE ACTIVE/COMPLETED STATE
// ============================================================================

describe('Phase active/completed state', () => {
  let db: SmithersDB
  let root: SmithersRoot
  let executionId: string

  beforeEach(async () => {
    db = createSmithersDB({ reset: true })
    executionId = db.execution.start('test-phase-state', 'test.tsx')
    root = createSmithersRoot()
  })

  afterEach(() => {
    signalOrchestrationComplete()
    root.dispose()
    db.close()
  })

  test('first phase is active at start', async () => {
    let phase0Active = false
    let phase1Active = false

    function PhaseChecker({ name, idx }: { name: string; idx: number }) {
      const registry = usePhaseRegistry()
      const myIdx = usePhaseIndex(name)
      if (idx === 0) phase0Active = registry.isPhaseActive(myIdx)
      if (idx === 1) phase1Active = registry.isPhaseActive(myIdx)
      return <phase-check name={name} active={registry.isPhaseActive(myIdx)} />
    }

    await root.render(
      <SmithersProvider db={db} executionId={executionId} stopped>
        <PhaseChecker name="First" idx={0} />
        <PhaseChecker name="Second" idx={1} />
      </SmithersProvider>
    )

    expect(phase0Active).toBe(true)
    expect(phase1Active).toBe(false)
  })

  test('isPhaseCompleted returns false for pending phases', async () => {
    let phase0Completed = true
    let phase1Completed = true

    function PhaseChecker({ name, idx }: { name: string; idx: number }) {
      const registry = usePhaseRegistry()
      const myIdx = usePhaseIndex(name)
      if (idx === 0) phase0Completed = registry.isPhaseCompleted(myIdx)
      if (idx === 1) phase1Completed = registry.isPhaseCompleted(myIdx)
      return <phase-check name={name} completed={registry.isPhaseCompleted(myIdx)} />
    }

    await root.render(
      <SmithersProvider db={db} executionId={executionId} stopped>
        <PhaseChecker name="First" idx={0} />
        <PhaseChecker name="Second" idx={1} />
      </SmithersProvider>
    )

    expect(phase0Completed).toBe(false)
    expect(phase1Completed).toBe(false)
  })

  test('phase at index 0 is active when currentPhaseIndex is 0', async () => {
    let isActive = false

    function PhaseChecker() {
      const registry = usePhaseRegistry()
      const idx = usePhaseIndex('OnlyPhase')
      isActive = registry.isPhaseActive(idx)
      return <phase-check active={isActive} />
    }

    await root.render(
      <SmithersProvider db={db} executionId={executionId} stopped>
        <PhaseChecker />
      </SmithersProvider>
    )

    expect(isActive).toBe(true)
  })
})

// ============================================================================
// ADVANCE PHASE
// ============================================================================

describe('advancePhase functionality', () => {
  let db: SmithersDB
  let root: SmithersRoot
  let executionId: string

  beforeEach(async () => {
    db = createSmithersDB({ reset: true })
    executionId = db.execution.start('test-advance-phase', 'test.tsx')
    root = createSmithersRoot()
  })

  afterEach(() => {
    signalOrchestrationComplete()
    root.dispose()
    db.close()
  })

  test('advancePhase updates currentPhaseIndex in DB', async () => {
    let capturedRegistry: PhaseRegistryContextValue | null = null

    function Advancer() {
      const registry = usePhaseRegistry()
      capturedRegistry = registry
      usePhaseIndex('Phase1')
      usePhaseIndex('Phase2')
      return <advancer />
    }

    await root.render(
      <SmithersProvider db={db} executionId={executionId} stopped>
        <Advancer />
      </SmithersProvider>
    )

    expect(capturedRegistry!.currentPhaseIndex).toBe(0)

    capturedRegistry!.advancePhase()

    await new Promise(r => setTimeout(r, 50))

    const dbValue = db.state.get<number>('currentPhaseIndex')
    expect(dbValue).toBe(1)
  })

  test('advancePhase does not exceed total phases', async () => {
    let capturedRegistry: PhaseRegistryContextValue | null = null

    function SinglePhase() {
      const registry = usePhaseRegistry()
      capturedRegistry = registry
      usePhaseIndex('OnlyOne')
      return <single-phase />
    }

    await root.render(
      <SmithersProvider db={db} executionId={executionId} stopped>
        <SinglePhase />
      </SmithersProvider>
    )

    capturedRegistry!.advancePhase()
    capturedRegistry!.advancePhase()
    capturedRegistry!.advancePhase()

    await new Promise(r => setTimeout(r, 50))

    const dbValue = db.state.get<number>('currentPhaseIndex')
    expect(dbValue).toBe(0)
  })
})

// ============================================================================
// INDEX EXPORTS
// ============================================================================

describe('Index exports PhaseRegistry', () => {
  test('exports PhaseRegistryProvider from index', async () => {
    const index = await import('./index.js')
    expect(index.PhaseRegistryProvider).toBeDefined()
  })

  test('exports usePhaseRegistry from index', async () => {
    const index = await import('./index.js')
    expect(index.usePhaseRegistry).toBeDefined()
  })

  test('exports usePhaseIndex from index', async () => {
    const index = await import('./index.js')
    expect(index.usePhaseIndex).toBeDefined()
  })
})
