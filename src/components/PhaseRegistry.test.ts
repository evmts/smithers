import { test, expect, describe, beforeAll, afterAll } from 'bun:test'
import { createSmithersDB, type SmithersDB } from '../db/index.js'
import {
  PhaseRegistryProvider,
  usePhaseRegistry,
  usePhaseIndex,
  type PhaseRegistryContextValue,
  type PhaseRegistryProviderProps,
} from './PhaseRegistry.js'

describe('PhaseRegistry', () => {
  let db: SmithersDB

  beforeAll(async () => {
    db = await createSmithersDB({ reset: true })
    await db.execution.start('test-phase-registry', 'test.tsx')
  })

  afterAll(() => {
    db.close()
  })

  describe('Exports', () => {
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

  describe('PhaseRegistryContextValue interface', () => {
    test('has registerPhase function', () => {
      const ctx: Partial<PhaseRegistryContextValue> = {
        registerPhase: (name: string) => 0,
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

  describe('SQLite state integration', () => {
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
  })
})

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
