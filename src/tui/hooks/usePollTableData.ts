import { useState, useEffect } from 'react'
import type { SmithersDB } from '../../db/index.js'

export interface TableData {
  columns: string[]
  data: Record<string, unknown>[]
}

const ALLOWED_TABLES = [
  'executions', 'phases', 'agents', 'tool_calls', 'human_interactions',
  'render_frames', 'tasks', 'steps', 'reports', 'memories',
  'state', 'transitions', 'artifacts', 'commits', 'snapshots', 'reviews'
]

export function usePollTableData(db: SmithersDB, tableName: string): TableData {
  const [columns, setColumns] = useState<string[]>([])
  const [data, setData] = useState<Record<string, unknown>[]>([])

  useEffect(() => {
    if (!ALLOWED_TABLES.includes(tableName)) {
      setColumns([])
      setData([])
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
        setColumns([])
        setData([])
      }
    }

    poll()
    const interval = setInterval(poll, 500)
    return () => clearInterval(interval)
  }, [db, tableName])

  return { columns, data }
}
