// Report Viewer View (F6)
// Auto-generated 10-minute summaries

import { useKeyboard } from '@opentui/react'
import type { SmithersDB } from '../../../db/index.js'
import { useReportGenerator, type UseReportGeneratorResult } from '../../hooks/useReportGenerator.js'
import { TextAttributes, type KeyEvent } from '@opentui/core'
import { truncate, formatTimestamp } from '../../utils/format.js'
import { getSeverityColor, colors } from '../../utils/colors.js'
import { useEffectOnValueChange } from '../../../reconciler/hooks.js'
import { useTuiState } from '../../state.js'

export interface ReportViewerProps {
  db?: SmithersDB
  height: number
  reportState?: UseReportGeneratorResult
}

export function ReportViewer({ db, height: _height, reportState }: ReportViewerProps) {
  if (reportState) {
    return <ReportViewerContent reportState={reportState} />
  }

  if (!db) {
    return (
      <box style={{ flexDirection: 'column' }}>
        <text content="Connecting to database..." style={{ fg: '#888888' }} />
      </box>
    )
  }

  return <ReportViewerWithData db={db} />
}

function ReportViewerWithData({ db }: { db: SmithersDB }) {
  const reportState = useReportGenerator(db)
  return <ReportViewerContent reportState={reportState} />
}

function ReportViewerContent({
  reportState
}: {
  reportState: UseReportGeneratorResult
}) {
  const { reports, isGenerating, generateNow } = reportState
  const [selectedIndex, setSelectedIndex] = useTuiState<number>('tui:reports:selectedIndex', 0)

  useEffectOnValueChange(reports.length, () => {
    const maxIndex = Math.max(0, reports.length - 1)
    if (selectedIndex > maxIndex) {
      setSelectedIndex(maxIndex)
    }
  }, [reports.length, selectedIndex, setSelectedIndex])

  // Handle keyboard navigation
  useKeyboard((key: KeyEvent) => {
    if (key.name === 'j' || key.name === 'down') {
      setSelectedIndex(prev => Math.min(prev + 1, Math.max(0, reports.length - 1)))
    } else if (key.name === 'k' || key.name === 'up') {
      setSelectedIndex(prev => Math.max(prev - 1, 0))
    } else if (key.name === 'r') {
      generateNow()
    }
  })

  const selectedReport = reports[selectedIndex]
  const hasApiKey = !!process.env['ANTHROPIC_API_KEY']

  return (
    <box style={{ flexDirection: 'column', width: '100%', height: '100%' }}>
      <box style={{ flexDirection: 'row', marginBottom: 1, justifyContent: 'space-between' }}>
        <text
          content="Auto-Generated Reports"
          style={{ fg: '#7aa2f7', attributes: TextAttributes.BOLD }}
        />
        <box style={{ flexDirection: 'row', gap: 2 }}>
          {isGenerating && (
            <text content="Generating..." style={{ fg: '#e0af68' }} />
          )}
          <text content="[r] Generate Now" style={{ fg: '#9ece6a' }} />
        </box>
      </box>

      {!hasApiKey && (
        <text
          content="Note: ANTHROPIC_API_KEY not set - reports show metrics only, no AI analysis"
          style={{ fg: '#e0af68', marginBottom: 1 }}
        />
      )}

      <box style={{ flexDirection: 'row', height: '100%' }}>
        {/* Report list */}
        <box style={{
          width: 35,
          flexDirection: 'column',
          borderRight: true,
          paddingRight: 1
        }}>
          <text
            content={`Reports (${reports.length})`}
            style={{ fg: '#bb9af7', marginBottom: 1 }}
          />
          <scrollbox focused style={{ flexGrow: 1 }}>
            {reports.length === 0 ? (
              <text content="No reports yet" style={{ fg: '#565f89' }} />
            ) : (
              reports.map((report, index) => (
                <box
                  key={report.id}
                  style={{
                    backgroundColor: index === selectedIndex ? '#24283b' : undefined,
                    paddingLeft: 1
                  }}
                >
                  <text
                    content={truncate(report.title, 30)}
                    style={{
                      fg: getSeverityColor(report.severity),
                    }}
                  />
                </box>
              ))
            )}
          </scrollbox>
        </box>

        {/* Report content */}
        <box style={{ flexGrow: 1, flexDirection: 'column', paddingLeft: 1 }}>
          {selectedReport ? (
            <>
              <text
                content={selectedReport.title}
                style={{
                  fg: getSeverityColor(selectedReport.severity),
                  attributes: TextAttributes.BOLD,
                  marginBottom: 1
                }}
              />
              <text
                content={formatTimestamp(selectedReport.created_at)}
                style={{ fg: '#565f89', marginBottom: 1 }}
              />
              <scrollbox style={{
                flexGrow: 1,
                border: true,
                padding: 1,
                backgroundColor: '#16161e'
              }}>
                {selectedReport.content.split('\n').map((line, index) => (
                  <text
                    key={index}
                    content={line}
                    style={{ fg: getLineColor(line) }}
                  />
                ))}
              </scrollbox>
            </>
          ) : (
            <box style={{ flexDirection: 'column' }}>
              <text
                content="No report selected"
                style={{ fg: '#565f89', marginBottom: 1 }}
              />
              <text
                content="Reports are generated every 10 minutes automatically."
                style={{ fg: '#414868' }}
              />
              <text
                content="Press [r] to generate one now."
                style={{ fg: '#414868' }}
              />
            </box>
          )}
        </box>
      </box>

      <text
        content="j/k to navigate, r to generate new report"
        style={{ fg: '#565f89', marginTop: 1 }}
      />
    </box>
  )
}

function getLineColor(line: string): string {
  if (line.startsWith('##')) return colors.purple
  if (line.startsWith('###')) return colors.blue
  if (line.startsWith('-')) return colors.cyan
  if (line.includes('Error') || line.includes('Failed')) return colors.red
  if (line.includes('Warning')) return colors.orange
  return colors.fg
}
