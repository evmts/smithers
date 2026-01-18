import { useState, useEffect } from 'react'
import type { SmithersDB } from '../../db/index.js'

export interface TableData {
  columns: string[]
  data: Record<string, unknown>[]
}

export function usePollTableData(db: SmithersDB, tableName: string): TableData {
  const [columns, setColumns] = useState<string[]>([])
  const [data, setData] = useState<Record<string, unknown>[]>([])

  useEffect(() => {
    const poll = () => {
      try {
        const pragmaResult = db.query<{ name: string }>(`PRAGMA table_info(${tableName})`)
        setColumns(pragmaResult.map(r => r.name))

        const tableData = db.query<Record<string, unknown>>(`SELECT * FROM ${tableName} ORDER BY rowid DESC LIMIT 100`)
        setData(tableData)
      } catch {
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
