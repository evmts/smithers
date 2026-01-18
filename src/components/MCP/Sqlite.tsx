import type { ReactNode } from 'react'

export interface SqliteProps {
  /** Path to SQLite database file */
  path: string
  /** Open database in read-only mode */
  readOnly?: boolean
  /** Custom instructions for using the database */
  children?: ReactNode
}

/**
 * SQLite MCP Tool component.
 *
 * Provides SQLite database access to Claude via MCP server.
 * Use as a child of <Claude> with custom instructions.
 *
 * @example
 * <Claude>
 *   <Sqlite path="./data.db">
 *     Database has users table with id, name, email columns.
 *   </Sqlite>
 *   Query all users and format as a table.
 * </Claude>
 */
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
