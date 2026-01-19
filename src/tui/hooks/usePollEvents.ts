import { useEffectOnValueChange } from '../../reconciler/hooks.js'
import type { SmithersDB } from '../../db/index.js'
import { useTuiState } from '../state.js'

export interface TimelineEvent {
  id: string
  type: 'phase' | 'agent' | 'tool'
  name: string
  status: string
  timestamp: string
  details?: string | undefined
}

const EVENTS_KEY = 'tui:timeline:events'
const EMPTY_EVENTS: TimelineEvent[] = []

export function usePollEvents(db: SmithersDB): TimelineEvent[] {
  const [events, setEvents] = useTuiState<TimelineEvent[]>(EVENTS_KEY, EMPTY_EVENTS)

  useEffectOnValueChange(db, () => {
    const pollEvents = () => {
      try {
        const execution = db.execution.current()
        if (!execution) {
          setEvents(EMPTY_EVENTS)
          return
        }

        const phases = db.query<{ id: string; name: string; status: string; timestamp: string }>(
          'SELECT id, name, status, created_at as timestamp FROM phases WHERE execution_id = ? ORDER BY created_at DESC LIMIT 20',
          [execution.id]
        )

        const agents = db.query<{ id: string; model: string; status: string; timestamp: string; tokens_input: number | null; tokens_output: number | null }>(
          'SELECT id, model, status, created_at as timestamp, tokens_input, tokens_output FROM agents WHERE execution_id = ? ORDER BY created_at DESC LIMIT 30',
          [execution.id]
        )

        const tools = db.query<{ id: string; tool_name: string; status: string; timestamp: string; duration_ms: number | null }>(
          'SELECT id, tool_name, status, created_at as timestamp, duration_ms FROM tool_calls WHERE execution_id = ? ORDER BY created_at DESC LIMIT 50',
          [execution.id]
        )

        const allEvents: TimelineEvent[] = [
          ...phases.map((p) => ({
            id: p.id,
            type: 'phase' as const,
            name: p.name,
            status: p.status,
            timestamp: p.timestamp
          })),
          ...agents.map((a) => ({
            id: a.id,
            type: 'agent' as const,
            name: a.model,
            status: a.status,
            timestamp: a.timestamp,
            details: `${a.tokens_input ?? 0}/${a.tokens_output ?? 0} tokens`
          })),
          ...tools.map((t) => ({
            id: t.id,
            type: 'tool' as const,
            name: t.tool_name,
            status: t.status,
            timestamp: t.timestamp,
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
  }, [setEvents])

  return events
}
