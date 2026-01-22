import type { ReactNode } from 'react'
import { useRef } from 'react'
import { useSmithers } from './SmithersProvider.js'
import { useExecutionScope } from './ExecutionScope.js'
import { useMount, useEffectOnValueChange } from '../reconciler/hooks.js'
import { useQueryOne, useQueryValue } from '../reactive-sqlite/index.js'
import type { HumanInteraction } from '../db/human.js'
import { extractText } from '../utils/extract-text.js'
import { parseJson } from '../db/utils.js'

const hashString = (value: string): string => {
  let hash = 2166136261
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(16)
}

export interface HumanProps {
  id?: string
  message?: string
  onApprove?: () => void
  onReject?: () => void
  children?: ReactNode
}

export function Human(props: HumanProps): ReactNode {
  const { db, reactiveDb } = useSmithers()
  const executionScope = useExecutionScope()
  const smithersKey = (props as { __smithersKey?: unknown }).__smithersKey
  const childrenText = extractText(props.children)
  const fallbackSeed = [props.message, childrenText].filter(Boolean).join('|')
  const fallbackId = smithersKey !== undefined && smithersKey !== null
    ? `key:${String(smithersKey)}`
    : (fallbackSeed ? `content:${hashString(fallbackSeed)}` : null)
  const humanId = props.id ?? fallbackId
  if (!humanId) {
    throw new Error('Human requires a stable id, key, or content for resumability')
  }
  const stateKey = `human:${humanId}`
  const taskIdRef = useRef<string | null>(null)

  const { data: requestIdRaw } = useQueryValue<string>(
    reactiveDb,
    "SELECT value FROM state WHERE key = ?",
    [stateKey]
  )
  const requestId = requestIdRaw ? parseJson<string>(requestIdRaw, '') : null

  useMount(() => {
    if (requestId) return
    taskIdRef.current = db.tasks.start('human_interaction', props.message ?? 'Human input required', { scopeId: executionScope.scopeId })

    const newRequestId = db.human.request(
      'confirmation',
      props.message ?? 'Approve to continue'
    )

    db.state.set(stateKey, newRequestId, 'human_request')
  })

  const { data: request } = useQueryOne<HumanInteraction>(
    reactiveDb,
    `SELECT * FROM human_interactions WHERE id = ?`,
    requestId ? [requestId] : [],
    { skip: !requestId }
  )

  useEffectOnValueChange(request?.status, () => {
    if (!request || request.status === 'pending') return

    if (taskIdRef.current) {
      db.tasks.complete(taskIdRef.current)
      taskIdRef.current = null
    }

    if (request.status === 'approved') {
      props.onApprove?.()
    } else {
      props.onReject?.()
    }
  })

  return (
    <human message={props.message}>
      {props.children}
    </human>
  )
}
