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
  ask: <T = unknown>(prompt: string, options?: AskOptions) => Promise<T>
  status: 'idle' | 'pending' | 'resolved'
  requestId: string | null
}

export function useHuman(): UseHumanResult {
  const { db, reactiveDb } = useSmithers()
  const requestKeyRef = useRef(`humanRequest:${uuid()}`)

  useMount(() => {
    if (db.db.isClosed) return
    if (db.state.get<string | null>(requestKeyRef.current) !== null) return
    db.state.set(requestKeyRef.current, null, 'human_request_init')
  })

  const { data: requestIdJson } = useQueryValue<string>(
    reactiveDb,
    'SELECT value FROM state WHERE key = ?',
    [requestKeyRef.current]
  )
  const requestId = requestIdJson ? parseJson<string | null>(requestIdJson, null) : null

  const resolveRef = useRef<((value: unknown) => void) | null>(null)

  const { data: request } = useQueryOne<HumanInteraction>(
    reactiveDb,
    `SELECT * FROM human_interactions WHERE id = ?`,
    [requestId ?? '__never__']
  )

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

  const ask = useCallback(<T = unknown>(prompt: string, options?: AskOptions) => {
    return new Promise<T>((resolve) => {
      resolveRef.current = resolve as (value: unknown) => void
      const id = db.human.request(
        options?.options ? 'select' : 'confirmation',
        prompt,
        options?.options
      )
      db.state.set(requestKeyRef.current, id, 'human_request_created')
    })
  }, [db])

  return {
    ask,
    status: requestId ? (request?.status === 'pending' ? 'pending' : 'resolved') : 'idle',
    requestId
  }
}
