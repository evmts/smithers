import { useState, useEffect } from 'react'
import type { SmithersDB } from '../../db/index.js'

export interface TimelineEvent {
  id: string
  type: 'phase' | 'agent' | 'tool'
  name: string
  status: string
  timestamp: string
  details?: string | undefined
}

export function usePollEvents(db: SmithersDB): TimelineEvent[] {
  const [events, setEvents] = useState<TimelineEvent[]>([])

  useEffect(() => {
    const pollEvents = () => {
      try {
        const execution = db.execution.current()
        if (!execution) {
          setEvents([])
          return
        }

        const phases = db.query<{ id: string; name: string; status: string; created_at: string }>(
          'SELECT id, name, status, created_at as timestamp FROM phases WHERE execution_id = ? ORDER BY created_at DESC LIMIT 20',
          [execution.id]
        )

        const agents = db.query<{ id: string; model: string; status: string; created_at: string; tokens_input: number | null; tokens_output: number | null }>(
          'SELECT id, model, status, created_at as timestamp, tokens_input, tokens_output FROM agents WHERE execution_id = ? ORDER BY created_at DESC LIMIT 30',
          [execution.id]
        )

        const tools = db.query<{ id: string; tool_name: string; status: string; created_at: string; duration_ms: number | null }>(
          'SELECT id, tool_name, status, created_at as timestamp, duration_ms FROM tool_calls WHERE execution_id = ? ORDER BY created_at DESC LIMIT 50',
          [execution.id]
        )

        const allEvents: TimelineEvent[] = [
          ...phases.map((p) => ({
            id: p.id,
            type: 'phase' as const,
            name: p.name,
            status: p.status,
            timestamp: p.created_at
          })),
          ...agents.map((a) => ({
            id: a.id,
            type: 'agent' as const,
            name: a.model,
            status: a.status,
            timestamp: a.created_at,
            details: `${a.tokens_input ?? 0}/${a.tokens_output ?? 0} tokens`
          })),
          ...tools.map((t) => ({
            id: t.id,
            type: 'tool' as const,
            name: t.tool_name,
            status: t.status,
            timestamp: t.created_at,
            details: t.duration_ms ? `${t.duration_ms}ms` : undefined
          }))
        ]

        allEvents.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
        setEvents(allEvents)
      } catch (err) {
        console.debug('[usePollEvents] Polling error:', err)
      }
    }

    pollEvents()
    const interval = setInterval(pollEvents, 500)
    return () => clearInterval(interval)
  }, [db])

  return events
}
