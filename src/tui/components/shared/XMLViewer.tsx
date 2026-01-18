// XML syntax highlighting viewer

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
          style={{ fg: '#565f89' }}
        />
      )}
    </scrollbox>
  )
}

function getLineColor(line: string): string {
  const trimmed = line.trim()

  // Comments
  if (trimmed.startsWith('<!--')) return '#565f89'

  // Self-closing tags
  if (trimmed.match(/^<[^>]+\/>$/)) return '#7dcfff'

  // Opening tags
  if (trimmed.match(/^<[^/][^>]*>$/)) return '#7aa2f7'

  // Closing tags
  if (trimmed.match(/^<\/[^>]+>$/)) return '#bb9af7'

  // Tag with attributes
  if (trimmed.startsWith('<')) return '#7aa2f7'

  // Text content
  return '#c0caf5'
}
