import { useCallback, useRef } from 'react'
import type { ZodType } from 'zod'
import { useSmithers } from '../components/SmithersProvider.js'
import type { HumanInteraction, HumanInteractionRow, InteractiveSessionConfig } from '../db/human.js'
import { parseHumanInteraction } from '../db/human.js'
import { parseJson, uuid } from '../db/utils.js'
import { useQueryOne, useQueryValue } from '../reactive-sqlite/index.js'
import { useEffectOnValueChange, useMount } from '../reconciler/hooks.js'

export interface InteractiveSessionResult {
  outcome: 'completed' | 'cancelled' | 'timeout' | 'failed'
  response: unknown
  transcript?: string
  duration: number
  error?: string
}

export interface AskInteractiveOptions {
  systemPrompt?: string
  context?: Record<string, unknown>
  model?: 'opus' | 'sonnet' | 'haiku'
  cwd?: string
  mcpConfig?: string
  timeout?: number
  outcomeSchema?: {
    type: 'approval' | 'selection' | 'freeform' | 'structured'
    options?: string[]
    jsonSchema?: Record<string, unknown>
  }
  zodSchema?: ZodType
  captureTranscript?: boolean
  blockOrchestration?: boolean
}

export interface UseHumanInteractiveResult<T = InteractiveSessionResult> {
  request: (prompt: string, options?: AskInteractiveOptions) => void
  requestAsync: (prompt: string, options?: AskInteractiveOptions) => Promise<T>
  status: 'idle' | 'pending' | 'success' | 'error'
  data: T | null
  error: Error | null
  sessionId: string | null
  cancel: () => void
  reset: () => void
}

interface HookState {
  status: 'idle' | 'pending' | 'success' | 'error'
  data: unknown | null
  error: string | null
  sessionId: string | null
  taskId: string | null
}

const DEFAULT_STATE: HookState = {
  status: 'idle',
  data: null,
  error: null,
  sessionId: null,
  taskId: null,
}

export function useHumanInteractive<T = InteractiveSessionResult>(): UseHumanInteractiveResult<T> {
  const { db, reactiveDb } = useSmithers()
  const stateKeyRef = useRef(`humanInteractive:${uuid()}`)
  const resolveRef = useRef<((value: T) => void) | null>(null)
  const rejectRef = useRef<((error: Error) => void) | null>(null)
  const zodSchemaRef = useRef<ZodType | null>(null)
  const handledSessionIdRef = useRef<string | null>(null)

  useMount(() => {
    const existing = db.state.get<HookState>(stateKeyRef.current)
    if (!existing) {
      db.state.set(stateKeyRef.current, DEFAULT_STATE, 'human_interactive_init')
    }
  })

  const { data: stateJson } = useQueryValue<string>(
    reactiveDb,
    'SELECT value FROM state WHERE key = ?',
    [stateKeyRef.current]
  )
  const state = stateJson ? parseJson<HookState>(stateJson, DEFAULT_STATE) : DEFAULT_STATE

  const { data: sessionRow } = useQueryOne<HumanInteractionRow>(
    reactiveDb,
    state.sessionId
      ? 'SELECT * FROM human_interactions WHERE id = ?'
      : 'SELECT 1 WHERE 0',
    state.sessionId ? [state.sessionId] : []
  )
  const session = sessionRow ? parseHumanInteraction(sessionRow) : null

  const setState = useCallback((next: HookState, trigger: string) => {
    db.state.set(stateKeyRef.current, next, trigger)
  }, [db])

  const mapOutcome = (status: string): InteractiveSessionResult['outcome'] => {
    if (status === 'completed') return 'completed'
    if (status === 'cancelled') return 'cancelled'
    if (status === 'timeout') return 'timeout'
    if (status === 'failed') return 'failed'
    return 'completed'
  }

  const handleCompletion = useCallback((session: HumanInteraction, current: HookState) => {
    let response = session.response
    if (zodSchemaRef.current) {
      try {
        response = zodSchemaRef.current.parse(response)
      } catch (err) {
        const error = err instanceof Error ? err : new Error('Interactive response validation failed')
        setState({
          ...current,
          status: 'error',
          error: error.message,
          data: null,
          taskId: null,
        }, 'human_interactive_validation_failed')
        if (current.taskId) {
          db.tasks.complete(current.taskId)
        }
        rejectRef.current?.(error)
        resolveRef.current = null
        rejectRef.current = null
        return
      }
    }

    const result = {
      outcome: mapOutcome(session.status),
      response,
      transcript: session.session_transcript ?? undefined,
      duration: session.session_duration ?? 0,
      error: session.error ?? undefined,
    } as T

    if (current.taskId) {
      db.tasks.complete(current.taskId)
    }

    const nextStatus = session.status === 'failed' ? 'error' : 'success'
    setState({
      ...current,
      status: nextStatus,
      data: nextStatus === 'success' ? result : null,
      error: nextStatus === 'error' ? (session.error ?? 'Session failed') : null,
      taskId: null,
    }, 'human_interactive_complete')

    if (nextStatus === 'error') {
      const error = new Error(session.error ?? 'Session failed')
      rejectRef.current?.(error)
    } else {
      resolveRef.current?.(result)
    }

    resolveRef.current = null
    rejectRef.current = null
  }, [db, setState])

  useEffectOnValueChange(session?.status, () => {
    if (!session || session.status === 'pending') return
    if (db.db.isClosed) return
    const current = db.state.get<HookState>(stateKeyRef.current) ?? DEFAULT_STATE
    if (current.status !== 'pending') return
    handleCompletion(session, current)
  }, [session, db, handleCompletion])

  const createSession = useCallback((prompt: string, options?: AskInteractiveOptions): string => {
    if (db.db.isClosed) throw new Error('Database is closed')
    const current = db.state.get<HookState>(stateKeyRef.current) ?? DEFAULT_STATE
    if (current.status === 'pending') {
      throw new Error('Cannot create a new interactive session while one is already pending')
    }

    const config: InteractiveSessionConfig = {
      blockOrchestration: options?.blockOrchestration ?? true,
    }
    if (options?.systemPrompt !== undefined) config.systemPrompt = options.systemPrompt
    if (options?.context !== undefined) config.context = options.context
    if (options?.model !== undefined) config.model = options.model
    if (options?.cwd !== undefined) config.cwd = options.cwd
    if (options?.mcpConfig !== undefined) config.mcpConfig = options.mcpConfig
    if (options?.timeout !== undefined) config.timeout = options.timeout
    if (options?.outcomeSchema !== undefined) config.outcomeSchema = options.outcomeSchema
    if (options?.captureTranscript !== undefined) config.captureTranscript = options.captureTranscript

    const id = db.human.requestInteractive(prompt, config)
    let taskId: string | null = null

    if (config.blockOrchestration) {
      taskId = db.tasks.start(
        'human_interactive',
        `Interactive session: ${prompt.slice(0, 50)}...`
      )
    }

    setState({
      status: 'pending',
      data: null,
      error: null,
      sessionId: id,
      taskId,
    }, 'human_interactive_request')

    return id
  }, [db, setState])

  const request = useCallback((prompt: string, options?: AskInteractiveOptions): void => {
    zodSchemaRef.current = options?.zodSchema ?? null
    createSession(prompt, options)
  }, [createSession])

  const requestAsync = useCallback((prompt: string, options?: AskInteractiveOptions): Promise<T> => {
    zodSchemaRef.current = options?.zodSchema ?? null
    return new Promise<T>((resolve, reject) => {
      resolveRef.current = resolve
      rejectRef.current = reject
      createSession(prompt, options)
    })
  }, [createSession])

  const cancel = useCallback(() => {
    if (state.sessionId && state.status === 'pending') {
      db.human.cancelInteractive(state.sessionId)
      if (state.taskId) {
        db.tasks.complete(state.taskId)
      }
    }
  }, [state, db])

  const reset = useCallback(() => {
    if (state.taskId) {
      db.tasks.complete(state.taskId)
    }
    setState(DEFAULT_STATE, 'human_interactive_reset')
    resolveRef.current = null
    rejectRef.current = null
    zodSchemaRef.current = null
  }, [state.taskId, setState])

  return {
    request,
    requestAsync,
    status: state.status,
    data: state.data as T | null,
    error: state.error ? new Error(state.error) : null,
    sessionId: state.sessionId,
    cancel,
    reset,
  }
}
