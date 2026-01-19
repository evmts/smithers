/**
 * Message parser for Claude CLI output.
 * Parses streaming output into discrete message and tool-call entries.
 */

export interface TailLogEntry {
  index: number
  type: 'message' | 'tool-call'
  content: string
  toolName?: string
}

export class MessageParser {
  private buffer: string = ''
  private entries: TailLogEntry[] = []
  private currentIndex: number = 0
  private currentMessage: string = ''
  private maxEntries: number

  // Tool call pattern: lines starting with "Tool:" or tool invocations
  private toolStartPattern = /^(Tool:|TOOL:|\s*<invoke)/m

  constructor(maxEntries: number = 100) {
    this.maxEntries = maxEntries
  }

  parseChunk(chunk: string): void {
    this.buffer += chunk
    this.processBuffer()
  }

  /**
   * Add an entry while enforcing maxEntries limit.
   * Removes oldest entries when limit is exceeded.
   */
  private addEntry(entry: Omit<TailLogEntry, 'index'>): void {
    this.entries.push({
      ...entry,
      index: this.currentIndex++,
    })

    // Enforce maxEntries limit by removing oldest entries
    if (this.entries.length > this.maxEntries) {
      this.entries = this.entries.slice(-this.maxEntries)
    }
  }

  private processBuffer(): void {
    while (true) {
      // Look for tool call boundaries
      const match = this.buffer.match(this.toolStartPattern)

      if (match && match.index !== undefined) {
        // Text before tool call is a message
        const beforeTool = this.buffer.slice(0, match.index)
        if (beforeTool.trim()) {
          this.currentMessage += beforeTool
        }

        // Flush current message if we have one
        if (this.currentMessage.trim()) {
          this.addEntry({
            type: 'message',
            content: this.currentMessage.trim(),
          })
          this.currentMessage = ''
        }

        // Find end of tool call (next blank line or another tool)
        this.buffer = this.buffer.slice(match.index)
        const toolEnd = this.findToolEnd()

        if (toolEnd > 0) {
          const toolContent = this.buffer.slice(0, toolEnd)
          const toolName = this.extractToolName(toolContent)

          this.addEntry({
            type: 'tool-call',
            content: toolContent.trim(),
            toolName,
          })

          this.buffer = this.buffer.slice(toolEnd)
          continue
        }
      } else {
        // No tool call found, accumulate as message
        this.currentMessage += this.buffer
        this.buffer = ''
      }
      break
    }
  }

  private findToolEnd(): number {
    // Find the next tool start (skip the first character to avoid matching current tool)
    const nextTool = this.buffer.slice(1).search(this.toolStartPattern)

    if (nextTool > 0) {
      return nextTool + 1
    }

    // Look for closing </invoke> tag for XML-style tool calls
    if (this.buffer.includes('<invoke')) {
      const closeTag = this.buffer.indexOf('</invoke>')
      if (closeTag > 0) {
        // Find the end of the line after </invoke>
        const afterCloseTag = this.buffer.indexOf('\n', closeTag)
        if (afterCloseTag > 0) {
          return afterCloseTag + 1
        }
      }
      // XML invoke not yet complete
      return -1
    }

    // For "Tool: X" format, look for clear boundaries:
    // Priority order: triple newline > double newline followed by content > double newline at end

    // 1. Triple newline (paragraph break) - most robust
    const tripleNewline = this.buffer.indexOf('\n\n\n')
    if (tripleNewline > 0) {
      return tripleNewline + 3
    }

    // 2. Double newline followed by non-whitespace, non-indented content
    // This handles cases where tool output contains single blank lines
    const doubleNewlineWithContent = /\n\n(?=[A-Za-z\d])/
    const contentMatch = this.buffer.match(doubleNewlineWithContent)
    if (contentMatch && contentMatch.index !== undefined && contentMatch.index > 0) {
      return contentMatch.index + 2
    }

    // 3. Double newline at end of buffer (tool output ended)
    // This is a fallback for when the tool call is the last thing in the stream
    if (this.buffer.endsWith('\n\n')) {
      return this.buffer.length
    }

    // 4. Double newline anywhere (least preferred, for backwards compatibility)
    const doubleNewline = this.buffer.indexOf('\n\n')
    if (doubleNewline > 0) {
      return doubleNewline + 2
    }

    return -1 // Tool not complete yet
  }

  private extractToolName(content: string): string {
    const match = content.match(/(?:Tool:|TOOL:)\s*([^\s]+)/) ||
                  content.match(/<invoke\s+name="([^"]+)"/)
    return match?.[1] ?? 'unknown'
  }

  flush(): void {
    if (this.currentMessage.trim() || this.buffer.trim()) {
      this.addEntry({
        type: 'message',
        content: (this.currentMessage + this.buffer).trim(),
      })
      this.currentMessage = ''
      this.buffer = ''
    }
  }

  /**
   * Reset parser state for reuse.
   */
  reset(): void {
    this.buffer = ''
    this.entries = []
    this.currentIndex = 0
    this.currentMessage = ''
  }

  getEntries(): TailLogEntry[] {
    return this.entries
  }

  getLatestEntries(n: number): TailLogEntry[] {
    return this.entries.slice(-n)
  }
}

export function truncateToLastLines(content: string, maxLines: number = 10): string {
  const lines = content.split('\n')
  if (lines.length <= maxLines) return content
  return lines.slice(-maxLines).join('\n')
}
