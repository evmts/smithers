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

  // Tool call pattern: lines starting with "Tool:" or tool invocations
  private toolStartPattern = /^(Tool:|TOOL:|\s*<invoke)/m

  parseChunk(chunk: string): void {
    this.buffer += chunk
    this.processBuffer()
  }

  private processBuffer(): void {
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
        this.entries.push({
          index: this.currentIndex++,
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

        this.entries.push({
          index: this.currentIndex++,
          type: 'tool-call',
          content: toolContent.trim(),
          toolName,
        })

        this.buffer = this.buffer.slice(toolEnd)
      }
    } else {
      // No tool call found, accumulate as message
      this.currentMessage += this.buffer
      this.buffer = ''
    }
  }

  private findToolEnd(): number {
    // Tool ends at double newline or next tool
    const doubleNewline = this.buffer.indexOf('\n\n')
    const nextTool = this.buffer.slice(1).search(this.toolStartPattern)

    if (doubleNewline > 0 && (nextTool < 0 || doubleNewline < nextTool + 1)) {
      return doubleNewline + 2
    }
    if (nextTool > 0) {
      return nextTool + 1
    }
    return -1 // Tool not complete yet
  }

  private extractToolName(content: string): string {
    const match = content.match(/(?:Tool:|TOOL:)\s*(\w+)/) ||
                  content.match(/<invoke\s+name="([^"]+)"/)
    return match?.[1] ?? 'unknown'
  }

  flush(): void {
    if (this.currentMessage.trim() || this.buffer.trim()) {
      this.entries.push({
        index: this.currentIndex++,
        type: 'message',
        content: (this.currentMessage + this.buffer).trim(),
      })
      this.currentMessage = ''
      this.buffer = ''
    }
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
