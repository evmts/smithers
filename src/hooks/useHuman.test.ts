/**
 * Tests for useHuman hook
 * Focus: exports, types, integration patterns
 */
import { describe, test, expect, beforeAll, afterAll } from 'bun:test'
import { useHuman, type UseHumanResult, type AskOptions } from './useHuman.js'
import { createSmithersDB, type SmithersDB } from '../db/index.js'

describe('useHuman', () => {
  describe('exports', () => {
    test('useHuman is a function', () => {
      expect(typeof useHuman).toBe('function')
    })

    test('useHuman has arity 0', () => {
      expect(useHuman.length).toBe(0)
    })
  })

  describe('UseHumanResult type contract', () => {
    test('result shape matches interface', () => {
      const mockAsk = () => Promise.resolve(undefined)
      const result: UseHumanResult = {
        ask: mockAsk,
        status: 'idle',
        requestId: null,
      }
      expect(result.status).toBe('idle')
      expect(result.requestId).toBeNull()
      expect(typeof result.ask).toBe('function')
    })

    test('status can be idle', () => {
      const mockAsk = () => Promise.resolve(undefined)
      const result: UseHumanResult = { ask: mockAsk, status: 'idle', requestId: null }
      expect(result.status).toBe('idle')
    })

    test('status can be pending', () => {
      const mockAsk = () => Promise.resolve(undefined)
      const result: UseHumanResult = { ask: mockAsk, status: 'pending', requestId: 'abc' }
      expect(result.status).toBe('pending')
    })

    test('status can be resolved', () => {
      const mockAsk = () => Promise.resolve(undefined)
      const result: UseHumanResult = { ask: mockAsk, status: 'resolved', requestId: 'abc' }
      expect(result.status).toBe('resolved')
    })

    test('requestId can be string when active', () => {
      const mockAsk = () => Promise.resolve(undefined)
      const result: UseHumanResult = { ask: mockAsk, status: 'pending', requestId: 'req-123' }
      expect(result.requestId).toBe('req-123')
    })
  })

  describe('AskOptions type contract', () => {
    test('options array is optional', () => {
      const opts: AskOptions = {}
      expect(opts.options).toBeUndefined()
    })

    test('options accepts string array', () => {
      const opts: AskOptions = { options: ['yes', 'no', 'maybe'] }
      expect(opts.options).toEqual(['yes', 'no', 'maybe'])
    })

    test('empty options array is valid', () => {
      const opts: AskOptions = { options: [] }
      expect(opts.options).toHaveLength(0)
    })
  })
})

describe('useHuman integration with db.human', () => {
  let db: SmithersDB
  let _executionId: string

  beforeAll(async () => {
    db = await createSmithersDB({ reset: true })
    _executionId = await db.execution.start('test-useHuman', 'useHuman.test.tsx')
  })

  afterAll(() => {
    db.close()
  })

  test('db.human.request creates pending interaction', () => {
    const id = db.human.request('confirmation', 'Proceed?')
    const interaction = db.human.get(id)
    
    expect(interaction).not.toBeNull()
    expect(interaction!.status).toBe('pending')
    expect(interaction!.type).toBe('confirmation')
    expect(interaction!.prompt).toBe('Proceed?')
  })

  test('db.human.request with options creates select type', () => {
    const id = db.human.request('select', 'Choose one', ['A', 'B', 'C'])
    const interaction = db.human.get(id)
    
    expect(interaction).not.toBeNull()
    expect(interaction!.type).toBe('select')
    expect(interaction!.options).toEqual(['A', 'B', 'C'])
  })

  test('db.human.resolve updates status to approved', () => {
    const id = db.human.request('confirmation', 'Approve?')
    db.human.resolve(id, 'approved', true)
    
    const interaction = db.human.get(id)
    expect(interaction!.status).toBe('approved')
    expect(interaction!.response).toBe(true)
  })

  test('db.human.resolve updates status to rejected', () => {
    const id = db.human.request('confirmation', 'Reject test?')
    db.human.resolve(id, 'rejected', false)
    
    const interaction = db.human.get(id)
    expect(interaction!.status).toBe('rejected')
    expect(interaction!.response).toBe(false)
  })

  test('db.human.resolve stores complex response', () => {
    const id = db.human.request('select', 'Pick', ['X', 'Y'])
    db.human.resolve(id, 'approved', { selected: 'X', reason: 'best option' })
    
    const interaction = db.human.get(id)
    expect(interaction!.response).toEqual({ selected: 'X', reason: 'best option' })
  })

  test('listPending returns only pending requests', () => {
    const id1 = db.human.request('confirmation', 'Pending 1')
    const id2 = db.human.request('confirmation', 'Pending 2')
    db.human.resolve(id1, 'approved')
    
    const pending = db.human.listPending()
    expect(pending.find(p => p.id === id1)).toBeUndefined()
    expect(pending.find(p => p.id === id2)).toBeDefined()
  })
})
