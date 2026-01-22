import { TextAttributes, type KeyEvent } from '@opentui/core'
import { useKeyboard } from '@opentui/react'
import type { SmithersDB } from '../../../db/index.js'
import { useRenderFrames } from '../../hooks/useRenderFrames.js'
import { formatTimestamp } from '../../utils/format.js'

export interface RenderFrameInspectorProps {
  db: SmithersDB
  height?: number
}

export function RenderFrameInspector({ db }: RenderFrameInspectorProps) {
  const {
    currentFrame,
    currentIndex,
    totalFrames,
    nextFrame,
    prevFrame,
    goToLatest,
    goToFirst
  } = useRenderFrames(db)

  useKeyboard((key: KeyEvent) => {
    if (key.name === ']' || key.name === 'l' || key.name === 'right') {
      nextFrame()
    } else if (key.name === '[' || key.name === 'h' || key.name === 'left') {
      prevFrame()
    } else if (key.name === 'g') {
      goToFirst()
    } else if (key.name === 'G' || (key.shift && key.name === 'g')) {
      goToLatest()
    }
  })

  if (totalFrames === 0) {
    return (
      <box style={{ flexDirection: 'column' }}>
        <text
          content="No render frames captured yet"
          style={{ fg: '#565f89', marginBottom: 1 }}
        />
        <text
          content="Frames are captured during Smithers execution"
          style={{ fg: '#414868' }}
        />
      </box>
    )
  }

  const xmlLines = currentFrame?.tree_xml.split('\n') ?? []

  return (
    <box style={{ flexDirection: 'column', width: '100%' }}>
      <box style={{ flexDirection: 'row', marginBottom: 1, justifyContent: 'space-between' }}>
        <text
          content={`Frame ${currentIndex + 1}/${totalFrames}`}
          style={{ fg: '#7aa2f7', attributes: TextAttributes.BOLD }}
        />
        <text
          content={`Ralph #${currentFrame?.ralph_count ?? 0}`}
          style={{ fg: '#bb9af7' }}
        />
        <text
          content="[/] to navigate, g/G for first/last"
          style={{ fg: '#565f89' }}
        />
      </box>

      {currentFrame && (
        <text
          content={`Created: ${formatTimestamp(currentFrame.created_at)}`}
          style={{ fg: '#565f89', marginBottom: 1 }}
        />
      )}

      <box style={{
        border: true,
        flexGrow: 1,
        padding: 1,
        backgroundColor: '#16161e'
      }}>
        <scrollbox focused style={{ flexGrow: 1 }}>
          {xmlLines.map((line, index) => (
            <text
              key={index}
              content={line}
              style={{ fg: '#c0caf5' }}
            />
          ))}
        </scrollbox>
      </box>

      <box style={{ flexDirection: 'row', marginTop: 1, gap: 2 }}>
        <text content={`ID: ${currentFrame?.id.slice(0, 8) ?? 'N/A'}`} style={{ fg: '#565f89' }} />
        <text content={`Execution: ${currentFrame?.execution_id.slice(0, 8) ?? 'N/A'}`} style={{ fg: '#565f89' }} />
      </box>
    </box>
  )
}
