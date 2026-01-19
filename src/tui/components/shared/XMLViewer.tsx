// XML syntax highlighting viewer

import { colors } from '../../utils/colors.js'

export interface XMLViewerProps {
  xml: string
  maxLines?: number
}

export function XMLViewer({ xml, maxLines = 100 }: XMLViewerProps) {
  const lines = xml.split('\n').slice(0, maxLines)

  return (
    <scrollbox focused style={{ flexGrow: 1 }}>
      {lines.map((line, index) => (
        <text
          key={index}
          content={line}
          style={{ fg: getLineColor(line) }}
        />
      ))}
      {xml.split('\n').length > maxLines && (
        <text
          content={`... ${xml.split('\n').length - maxLines} more lines`}
          style={{ fg: colors.comment }}
        />
      )}
    </scrollbox>
  )
}

export function getLineColor(line: string): string {
  const trimmed = line.trim()

  // Comments
  if (trimmed.startsWith('<!--')) return colors.comment

  // Self-closing tags
  if (trimmed.match(/^<[^>]+\/>$/)) return colors.cyan

  // Opening tags
  if (trimmed.match(/^<[^/][^>]*>$/)) return colors.blue

  // Closing tags
  if (trimmed.match(/^<\/[^>]+>$/)) return colors.purple

  // Tag with attributes
  if (trimmed.startsWith('<')) return colors.blue

  // Text content
  return colors.fg
}
