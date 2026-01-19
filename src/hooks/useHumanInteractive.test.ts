/**
 * Tests for useHumanInteractive hook
 * Focus: exports, types, pure logic, integration patterns
 */
import { describe, test, expect, beforeAll, afterAll } from 'bun:test'
import {
  useHumanInteractive,
  type InteractiveSessionResult,
  type AskInteractiveOptions,
  type UseHumanInteractiveResult,
} from './useHumanInteractive.js'
import { createSmithersDB, type SmithersDB } from '../db/index.js'
import type { InteractiveSessionConfig } from '../db/human.js'

describe('useHumanInteractive', () => {
  describe('exports', () => {
    test('useHumanInteractive is a function', () => {
      expect(typeof useHumanInteractive).toBe('function')
    })

    test('useHumanInteractive has arity 0', () => {
      expect(useHumanInteractive.length).toBe(0)
    })
  })

  describe('InteractiveSessionResult type contract', () => {
    test('completed outcome', () => {
      const result: InteractiveSessionResult = {
        outcome: 'completed',
        response: { approved: true },
        duration: 1500,
      }
      expect(result.outcome).toBe('completed')
      expect(result.duration).toBe(1500)
    })

    test('cancelled outcome', () => {
      const result: InteractiveSessionResult = {
        outcome: 'cancelled',
        response: null,
        duration: 500,
      }
      expect(result.outcome).toBe('cancelled')
    })

    test('timeout outcome', () => {
      const result: InteractiveSessionResult = {
        outcome: 'timeout',
        response: null,
        duration: 60000,
      }
      expect(result.outcome).toBe('timeout')
    })

    test('failed outcome with error', () => {
      const result: InteractiveSessionResult = {
        outcome: 'failed',
        response: null,
        duration: 100,
        error: 'Connection lost',
      }
      expect(result.outcome).toBe('failed')
      expect(result.error).toBe('Connection lost')
    })

    test('result with transcript', () => {
      const result: InteractiveSessionResult = {
        outcome: 'completed',
        response: 'yes',
        duration: 2000,
        transcript: 'User: yes\nAssistant: Acknowledged',
      }
      expect(result.transcript).toContain('User: yes')
    })
  })

  describe('AskInteractiveOptions type contract', () => {
    test('all options are optional', () => {
      const opts: AskInteractiveOptions = {}
      expect(opts.systemPrompt).toBeUndefined()
      expect(opts.timeout).toBeUndefined()
    })

    test('systemPrompt option', () => {
      const opts: AskInteractiveOptions = {
        systemPrompt: 'You are a code reviewer',
      }
      expect(opts.systemPrompt).toBe('You are a code reviewer')
    })

    test('context option', () => {
      const opts: AskInteractiveOptions = {
        context: { filePath: '/src/app.ts', lineNumber: 42 },
      }
      expect(opts.context?.filePath).toBe('/src/app.ts')
    })

    test('model option', () => {
      const opts1: AskInteractiveOptions = { model: 'opus' }
      const opts2: AskInteractiveOptions = { model: 'sonnet' }
      const opts3: AskInteractiveOptions = { model: 'haiku' }
      expect(opts1.model).toBe('opus')
      expect(opts2.model).toBe('sonnet')
      expect(opts3.model).toBe('haiku')
    })

    test('cwd option', () => {
      const opts: AskInteractiveOptions = { cwd: '/Users/test/project' }
      expect(opts.cwd).toBe('/Users/test/project')
    })

    test('mcpConfig option', () => {
      const opts: AskInteractiveOptions = { mcpConfig: '{"servers":[]}' }
      expect(opts.mcpConfig).toBe('{"servers":[]}')
    })

    test('timeout option', () => {
      const opts: AskInteractiveOptions = { timeout: 30000 }
      expect(opts.timeout).toBe(30000)
    })

    test('outcomeSchema approval type', () => {
      const opts: AskInteractiveOptions = {
        outcomeSchema: { type: 'approval' },
      }
      expect(opts.outcomeSchema?.type).toBe('approval')
    })

    test('outcomeSchema selection type with options', () => {
      const opts: AskInteractiveOptions = {
        outcomeSchema: { type: 'selection', options: ['A', 'B', 'C'] },
      }
      expect(opts.outcomeSchema?.options).toEqual(['A', 'B', 'C'])
    })

    test('outcomeSchema structured type with jsonSchema', () => {
      const opts: AskInteractiveOptions = {
        outcomeSchema: {
          type: 'structured',
          jsonSchema: { type: 'object', properties: { score: { type: 'number' } } },
        },
      }
      expect(opts.outcomeSchema?.jsonSchema?.type).toBe('object')
    })

    test('captureTranscript option', () => {
      const opts: AskInteractiveOptions = { captureTranscript: true }
      expect(opts.captureTranscript).toBe(true)
    })

    test('blockOrchestration option', () => {
      const opts: AskInteractiveOptions = { blockOrchestration: false }
      expect(opts.blockOrchestration).toBe(false)
    })
  })

  describe('UseHumanInteractiveResult type contract', () => {
    test('idle state shape', () => {
      const result: UseHumanInteractiveResult = {
        request: () => {},
        requestAsync: async () => ({ outcome: 'completed', response: null, duration: 0 }),
        status: 'idle',
        data: null,
        error: null,
        sessionId: null,
        cancel: () => {},
        reset: () => {},
      }
      expect(result.status).toBe('idle')
      expect(result.data).toBeNull()
      expect(result.error).toBeNull()
      expect(result.sessionId).toBeNull()
    })

    test('pending state shape', () => {
      const result: UseHumanInteractiveResult = {
        request: () => {},
        requestAsync: async () => ({ outcome: 'completed', response: null, duration: 0 }),
        status: 'pending',
        data: null,
        error: null,
        sessionId: 'session-123',
        cancel: () => {},
        reset: () => {},
      }
      expect(result.status).toBe('pending')
      expect(result.sessionId).toBe('session-123')
    })

    test('success state shape', () => {
      const successData: InteractiveSessionResult = {
        outcome: 'completed',
        response: { approved: true },
        duration: 5000,
      }
      const result: UseHumanInteractiveResult = {
        request: () => {},
        requestAsync: async () => successData,
        status: 'success',
        data: successData,
        error: null,
        sessionId: 'session-456',
        cancel: () => {},
        reset: () => {},
      }
      expect(result.status).toBe('success')
      expect(result.data?.outcome).toBe('completed')
    })

    test('error state shape', () => {
      const result: UseHumanInteractiveResult = {
        request: () => {},
        requestAsync: async () => ({ outcome: 'failed', response: null, duration: 0 }),
        status: 'error',
        data: null,
        error: new Error('Session timed out'),
        sessionId: 'session-789',
        cancel: () => {},
        reset: () => {},
      }
      expect(result.status).toBe('error')
      expect(result.error?.message).toBe('Session timed out')
    })

    test('request function exists', () => {
      const result: UseHumanInteractiveResult = {
        request: () => {},
        requestAsync: async () => ({ outcome: 'completed', response: null, duration: 0 }),
        status: 'idle',
        data: null,
        error: null,
        sessionId: null,
        cancel: () => {},
        reset: () => {},
      }
      expect(typeof result.request).toBe('function')
    })

    test('requestAsync function exists', () => {
      const result: UseHumanInteractiveResult = {
        request: () => {},
        requestAsync: async () => ({ outcome: 'completed', response: null, duration: 0 }),
        status: 'idle',
        data: null,
        error: null,
        sessionId: null,
        cancel: () => {},
        reset: () => {},
      }
      expect(typeof result.requestAsync).toBe('function')
    })

    test('cancel function exists', () => {
      const result: UseHumanInteractiveResult = {
        request: () => {},
        requestAsync: async () => ({ outcome: 'completed', response: null, duration: 0 }),
        status: 'idle',
        data: null,
        error: null,
        sessionId: null,
        cancel: () => {},
        reset: () => {},
      }
      expect(typeof result.cancel).toBe('function')
    })

    test('reset function exists', () => {
      const result: UseHumanInteractiveResult = {
        request: () => {},
        requestAsync: async () => ({ outcome: 'completed', response: null, duration: 0 }),
        status: 'idle',
        data: null,
        error: null,
        sessionId: null,
        cancel: () => {},
        reset: () => {},
      }
      expect(typeof result.reset).toBe('function')
    })
  })

  describe('generic type parameter', () => {
    test('default generic is InteractiveSessionResult', () => {
      const result: UseHumanInteractiveResult = {
        request: () => {},
        requestAsync: async () => ({ outcome: 'completed', response: null, duration: 0 }),
        status: 'success',
        data: { outcome: 'completed', response: null, duration: 0 },
        error: null,
        sessionId: null,
        cancel: () => {},
        reset: () => {},
      }
      expect(result.data?.outcome).toBe('completed')
    })

    test('custom generic type', () => {
      interface CustomResult {
        outcome: 'completed'
        response: { score: number }
        duration: number
      }
      const result: UseHumanInteractiveResult<CustomResult> = {
        request: () => {},
        requestAsync: async () => ({ outcome: 'completed', response: { score: 95 }, duration: 1000 }),
        status: 'success',
        data: { outcome: 'completed', response: { score: 95 }, duration: 1000 },
        error: null,
        sessionId: null,
        cancel: () => {},
        reset: () => {},
      }
      expect(result.data?.response.score).toBe(95)
    })
  })
})

describe('useHumanInteractive integration with db.human', () => {
  let db: SmithersDB
  let _executionId: string

  beforeAll(async () => {
    db = await createSmithersDB({ reset: true })
    _executionId = await db.execution.start('test-useHumanInteractive', 'useHumanInteractive.test.tsx')
  })

  afterAll(() => {
    db.close()
  })

  test('requestInteractive creates pending session', () => {
    const id = db.human.requestInteractive('Review the changes', {
      model: 'sonnet',
      blockOrchestration: true,
    })
    
    const session = db.human.get(id)
    expect(session).not.toBeNull()
    expect(session!.type).toBe('interactive_session')
    expect(session!.status).toBe('pending')
    expect(session!.prompt).toBe('Review the changes')
    expect(session!.session_config?.model).toBe('sonnet')
  })

  test('requestInteractive stores all config options', () => {
    const config: InteractiveSessionConfig = {
      systemPrompt: 'You are a code reviewer',
      context: { file: 'app.ts' },
      model: 'opus',
      cwd: '/project',
      mcpConfig: '{}',
      timeout: 60000,
      outcomeSchema: { type: 'approval' },
      captureTranscript: true,
      blockOrchestration: true,
    }
    
    const id = db.human.requestInteractive('Full config test', config)
    const session = db.human.get(id)
    
    expect(session!.session_config?.systemPrompt).toBe('You are a code reviewer')
    expect(session!.session_config?.model).toBe('opus')
    expect(session!.session_config?.timeout).toBe(60000)
    expect(session!.session_config?.captureTranscript).toBe(true)
  })

  test('completeInteractive with completed outcome', () => {
    const id = db.human.requestInteractive('Complete test', {})
    
    db.human.completeInteractive(id, 'completed', { approved: true }, {
      transcript: 'User approved',
      duration: 2500,
    })
    
    const session = db.human.get(id)
    expect(session!.status).toBe('completed')
    expect(session!.response).toEqual({ approved: true })
    expect(session!.session_transcript).toBe('User approved')
    expect(session!.session_duration).toBe(2500)
  })

  test('completeInteractive with cancelled outcome', () => {
    const id = db.human.requestInteractive('Cancel test', {})
    
    db.human.completeInteractive(id, 'cancelled', null, {
      duration: 500,
    })
    
    const session = db.human.get(id)
    expect(session!.status).toBe('cancelled')
    expect(session!.session_duration).toBe(500)
  })

  test('completeInteractive with timeout outcome', () => {
    const id = db.human.requestInteractive('Timeout test', { timeout: 30000 })
    
    db.human.completeInteractive(id, 'timeout', null, {
      duration: 30000,
    })
    
    const session = db.human.get(id)
    expect(session!.status).toBe('timeout')
  })

  test('completeInteractive with failed outcome and error', () => {
    const id = db.human.requestInteractive('Fail test', {})
    
    db.human.completeInteractive(id, 'failed', null, {
      duration: 100,
      error: 'Connection refused',
    })
    
    const session = db.human.get(id)
    expect(session!.status).toBe('failed')
    expect(session!.error).toBe('Connection refused')
  })

  test('cancelInteractive marks session as cancelled', () => {
    const id = db.human.requestInteractive('Cancel via method', {})
    
    db.human.cancelInteractive(id)
    
    const session = db.human.get(id)
    expect(session!.status).toBe('cancelled')
  })

  test('cancelInteractive does not affect already completed sessions', () => {
    const id = db.human.requestInteractive('Already done', {})
    db.human.completeInteractive(id, 'completed', { result: 'done' })
    
    db.human.cancelInteractive(id)
    
    const session = db.human.get(id)
    expect(session!.status).toBe('completed')
  })

  test('listPending returns only pending interactive sessions', () => {
    const id1 = db.human.requestInteractive('Pending 1', {})
    const id2 = db.human.requestInteractive('Pending 2', {})
    db.human.completeInteractive(id1, 'completed', null)
    
    const pending = db.human.listPending()
    expect(pending.find(p => p.id === id1)).toBeUndefined()
    expect(pending.find(p => p.id === id2)).toBeDefined()
  })
})
