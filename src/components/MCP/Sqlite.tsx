import type { ReactNode } from 'react'

export interface SqliteProps {
  /** Path to SQLite database file */
  path: string
  /** Open database in read-only mode */
  readOnly?: boolean
  /** Custom instructions for using the database */
  children?: ReactNode
}

export function Sqlite(props: SqliteProps): ReactNode {
  const config = JSON.stringify({
    path: props.path,
    readOnly: props.readOnly ?? false,
  })

  return (
    <mcp-tool type="sqlite" config={config}>
      {props.children}
    </mcp-tool>
  )
}
