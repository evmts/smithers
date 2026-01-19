// Database Explorer View (F3)
// Browse SQLite tables and query data

import { useKeyboard } from '@opentui/react'
import type { SmithersDB } from '../../../db/index.js'
import { TextAttributes, type KeyEvent } from '@opentui/core'
import { usePollTableData } from '../../hooks/usePollTableData.js'
import { truncateTilde, formatValue } from '../../utils/format.js'
import { useEffectOnValueChange } from '../../../reconciler/hooks.js'
import { useTuiState } from '../../state.js'

const TABLES = [
  'executions',
  'phases',
  'agents',
  'tool_calls',
  'human_interactions',
  'render_frames',
  'tasks',
  'steps',
  'reports',
  'memories',
  'state',
  'transitions',
  'artifacts',
  'commits',
  'snapshots',
  'reviews'
]

export interface DatabaseExplorerProps {
  db: SmithersDB
  height: number
}

export function DatabaseExplorer({ db, height }: DatabaseExplorerProps) {
  const [selectedTable, setSelectedTable] = useTuiState<number>('tui:db:selectedTable', 0)
  const [rowOffset, setRowOffset] = useTuiState<number>('tui:db:rowOffset', 0)
  const [isTableListFocused, setIsTableListFocused] = useTuiState<boolean>('tui:db:isTableListFocused', true)

  const tableName = TABLES[selectedTable] ?? 'executions'
  const { columns, data: tableData } = usePollTableData(db, tableName)
  const visibleRowsCount = height - 8

  useEffectOnValueChange(`${tableData.length}:${visibleRowsCount}`, () => {
    const maxOffset = Math.max(0, tableData.length - visibleRowsCount)
    if (rowOffset > maxOffset) {
      setRowOffset(maxOffset)
    }
  }, [rowOffset, setRowOffset, tableData.length, visibleRowsCount])

  const handleSelectTable = (index: number) => {
    setSelectedTable(index)
    setRowOffset(0)
  }

  useKeyboard((key: KeyEvent) => {
    if (key.name === 'tab') {
      setIsTableListFocused(!isTableListFocused)
    } else if (isTableListFocused) {
      if (key.name === 'j' || key.name === 'down') {
        handleSelectTable(Math.min(selectedTable + 1, TABLES.length - 1))
      } else if (key.name === 'k' || key.name === 'up') {
        handleSelectTable(Math.max(selectedTable - 1, 0))
      }
    } else {
      if (key.name === 'j' || key.name === 'down') {
        const maxOffset = Math.max(0, tableData.length - visibleRowsCount)
        setRowOffset(prev => Math.min(prev + 1, maxOffset))
      } else if (key.name === 'k' || key.name === 'up') {
        setRowOffset(prev => Math.max(prev - 1, 0))
      }
    }
  })

  const visibleRows = tableData.slice(rowOffset, rowOffset + visibleRowsCount)

  return (
    <box style={{ flexDirection: 'row', width: '100%', height: '100%' }}>
      {/* Table list */}
      <box style={{
        width: 20,
        flexDirection: 'column',
        borderRight: true,
        paddingRight: 1
      }}>
        <text
          content="Tables"
          style={{
            fg: '#7aa2f7',
            attributes: TextAttributes.BOLD,
            marginBottom: 1
          }}
        />
        <scrollbox focused={isTableListFocused} style={{ flexGrow: 1 }}>
          {TABLES.map((table, index) => (
            <text
              key={table}
              content={table}
              style={{
                fg: index === selectedTable ? '#7aa2f7' : '#a9b1d6',
                backgroundColor: index === selectedTable && isTableListFocused ? '#24283b' : undefined,
                paddingLeft: 1
              }}
            />
          ))}
        </scrollbox>
      </box>

      {/* Table data */}
      <box style={{ flexGrow: 1, flexDirection: 'column', paddingLeft: 1 }}>
        <box style={{ flexDirection: 'row', marginBottom: 1, justifyContent: 'space-between' }}>
          <text
            content={`${tableName} (${tableData.length} rows)`}
            style={{ fg: '#7aa2f7', attributes: TextAttributes.BOLD }}
          />
          <text
            content="Tab to switch focus, j/k to navigate"
            style={{ fg: '#565f89' }}
          />
        </box>

        {/* Column headers */}
        {columns.length > 0 && (
          <box style={{ flexDirection: 'row', marginBottom: 1 }}>
            {columns.slice(0, 5).map((col) => (
              <text
                key={col}
                content={truncateTilde(col, 15)}
                style={{
                  fg: '#bb9af7',
                  width: 16,
                  attributes: TextAttributes.BOLD
                }}
              />
            ))}
            {columns.length > 5 && (
              <text content={`+${columns.length - 5} more`} style={{ fg: '#565f89' }} />
            )}
          </box>
        )}

        {/* Data rows */}
        <scrollbox focused={!isTableListFocused} style={{ flexGrow: 1 }}>
          {visibleRows.map((row, index) => (
            <box key={index} style={{ flexDirection: 'row' }}>
              {columns.slice(0, 5).map((col) => (
                <text
                  key={col}
                  content={truncateTilde(formatValue(row[col]), 15)}
                  style={{
                    fg: '#c0caf5',
                    width: 16
                  }}
                />
              ))}
            </box>
          ))}
          {tableData.length === 0 && (
            <text content="No data" style={{ fg: '#565f89' }} />
          )}
        </scrollbox>
      </box>
    </box>
  )
}
