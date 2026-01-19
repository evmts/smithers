import { useMemo } from 'react'
import type { SmithersDB } from '../../db/index.js'
import { useEffectOnValueChange } from '../../reconciler/hooks.js'
import { useTuiState } from '../state.js'

export interface TableData {
  columns: string[]
  data: Record<string, unknown>[]
}

const ALLOWED_TABLES = [
  'executions', 'phases', 'agents', 'tool_calls', 'human_interactions',
  'render_frames', 'tasks', 'steps', 'reports', 'memories',
  'state', 'transitions', 'artifacts', 'commits', 'snapshots', 'reviews'
]

const EMPTY_COLUMNS: string[] = []
const EMPTY_DATA: Record<string, unknown>[] = []

export function usePollTableData(db: SmithersDB, tableName: string): TableData {
  const columnsKey = `tui:table:${tableName}:columns`
  const dataKey = `tui:table:${tableName}:rows`

  const [columns, setColumns] = useTuiState<string[]>(columnsKey, EMPTY_COLUMNS)
  const [data, setData] = useTuiState<Record<string, unknown>[]>(dataKey, EMPTY_DATA)

  const pollKey = useMemo(() => ({ db, tableName }), [db, tableName])

  useEffectOnValueChange(pollKey, () => {
    if (!ALLOWED_TABLES.includes(tableName)) {
      setColumns(EMPTY_COLUMNS)
      setData(EMPTY_DATA)
      return
    }

    const poll = () => {
      try {
        const pragmaResult = db.query<{ name: string }>(`PRAGMA table_info(${tableName})`)
        setColumns(pragmaResult.map(r => r.name))

        const tableData = db.query<Record<string, unknown>>(`SELECT * FROM ${tableName} ORDER BY rowid DESC LIMIT 100`)
        setData(tableData)
      } catch (err) {
        console.debug('[usePollTableData] Polling error:', err)
        setColumns(EMPTY_COLUMNS)
        setData(EMPTY_DATA)
      }
    }

    poll()
    const interval = setInterval(poll, 500)
    return () => clearInterval(interval)
  }, [setColumns, setData, tableName, db])

  return { columns, data }
}
