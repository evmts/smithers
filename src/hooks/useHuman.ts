import { useCallback, useRef } from 'react'
import { useEffectOnValueChange, useMount } from '../reconciler/hooks.js'
import { useSmithers } from '../components/SmithersProvider.js'
import type { HumanInteraction } from '../db/human.js'
import { parseJson, uuid } from '../db/utils.js'
import { useQueryOne, useQueryValue } from '../reactive-sqlite/index.js'

export interface AskOptions {
  options?: string[]
}

export interface UseHumanResult {
  /**
   * Request input from a human.
   * Resolves when the human approves/rejects/responds.
   */
  ask: <T = any>(prompt: string, options?: AskOptions) => Promise<T>

  /**
   * Current interaction status
   */
  status: 'idle' | 'pending' | 'resolved'

  /**
   * The current request ID (if any)
   */
  requestId: string | null
}

/**
 * Hook to pause execution and request human input.
 *
 * @example
 * ```tsx
 * const { ask } = useHuman()
 *
 * async function deploy() {
 *   const approved = await ask<boolean>('Deploy to production?', {
 *     options: ['Yes', 'No']
 *   })
 *   if (approved) {
 *     // ...
 *   }
 * }
 * ```
 */
export function useHuman(): UseHumanResult {
  const { db } = useSmithers()
  const requestKeyRef = useRef(`humanRequest:${uuid()}`)

  useMount(() => {
    if (db.db.isClosed) return
    if (db.state.get<string | null>(requestKeyRef.current) !== null) return
    db.state.set(requestKeyRef.current, null, 'human_request_init')
  })

  const { data: requestIdJson } = useQueryValue<string>(
    db.db,
    'SELECT value FROM state WHERE key = ?',
    [requestKeyRef.current]
  )
  const requestId = requestIdJson ? parseJson<string | null>(requestIdJson, null) : null

  // Track the promise resolver so we can call it when DB updates
  const resolveRef = useRef<((value: unknown) => void) | null>(null)

  // Reactive subscription to the current request
  // This will re-render whenever the request row changes
  const { data: request } = useQueryOne<HumanInteraction>(
    db.db, // Pass ReactiveDatabase
    `SELECT * FROM human_interactions WHERE id = ?`,
    [requestId ?? '__never__']
  )

  // Resolve promise when request status changes
  useEffectOnValueChange(request?.status, () => {
    if (!request || request.status === 'pending' || !resolveRef.current) return

    let response = null
    try {
      response = request.response ? JSON.parse(request.response as unknown as string) : null
    } catch {
      response = request.response
    }

    const resolve = resolveRef.current
    resolveRef.current = null
    resolve(response)
  })

  const ask = useCallback(async <T = any>(prompt: string, options?: AskOptions) => {
    return new Promise<T>((resolve) => {
      // 1. Store resolver
      resolveRef.current = resolve as (value: unknown) => void

      // 2. Create request in DB
      const id = db.human.request(
        options?.options ? 'select' : 'confirmation',
        prompt,
        options?.options
      )

      // 3. Set ID to start subscription
      db.state.set(requestKeyRef.current, id, 'human_request_created')
    })
  }, [db])

  return {
    ask,
    status: requestId ? (request?.status === 'pending' ? 'pending' : 'resolved') : 'idle',
    requestId
  }
}
