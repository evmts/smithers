export interface ParsedEvent {
  type: 'phase' | 'agent' | 'tool' | 'ralph' | 'error' | 'log' | 'unknown'
  timestamp: Date
  data: Record<string, any>
  raw: string
}

export class OutputParser {
  private buffer: string = ''

  /**
   * Parse a chunk of output and extract structured events
   */
  parseChunk(chunk: string): ParsedEvent[] {
    this.buffer += chunk
    const lines = this.buffer.split('\n')

    // Keep last incomplete line in buffer
    this.buffer = lines.pop() || ''

    return lines.map((line) => this.parseLine(line)).filter((e) => e !== null) as ParsedEvent[]
  }

  /**
   * Parse a single line and extract structured information
   */
  private parseLine(line: string): ParsedEvent | null {
    const timestamp = new Date()

    // Phase events
    if (line.includes('Phase:') || line.includes('PHASE:')) {
      const match = line.match(/Phase:\s*(.+?)(?:\s*-\s*(.+))?$/)
      if (match) {
        return {
          type: 'phase',
          timestamp,
          data: {
            name: match[1]!.trim(),
            status: match[2]?.trim() || 'STARTING',
          },
          raw: line,
        }
      }
    }

    // Agent events
    if (line.includes('Agent:') || line.includes('AGENT:') || line.includes('Claude')) {
      const match = line.match(/(?:Agent:|Claude)\s*(.+?)(?:\s*-\s*(.+))?$/)
      if (match) {
        return {
          type: 'agent',
          timestamp,
          data: {
            name: match[1]!.trim(),
            status: match[2]?.trim() || 'RUNNING',
          },
          raw: line,
        }
      }
    }

    // Tool call events
    if (line.includes('Tool:') || line.includes('TOOL:')) {
      const match = line.match(/Tool:\s*(.+?)(?:\s*-\s*(.+))?$/)
      if (match) {
        return {
          type: 'tool',
          timestamp,
          data: {
            name: match[1]!.trim(),
            details: match[2]?.trim() || '',
          },
          raw: line,
        }
      }
    }

    // Ralph iteration events
    if (line.includes('Iteration') || line.includes('ITERATION')) {
      const match = line.match(/Iteration\s*(\d+)/)
      if (match) {
        return {
          type: 'ralph',
          timestamp,
          data: {
            iteration: parseInt(match[1]!),
          },
          raw: line,
        }
      }
    }

    // Error events
    if (line.includes('Error:') || line.includes('ERROR:') || line.match(/^\s*at\s+/)) {
      return {
        type: 'error',
        timestamp,
        data: {
          message: line.trim(),
        },
        raw: line,
      }
    }

    // Generic log line
    if (line.trim()) {
      return {
        type: 'log',
        timestamp,
        data: {
          message: line.trim(),
        },
        raw: line,
      }
    }

    return null
  }

  /**
   * Get any remaining buffered data
   */
  flush(): ParsedEvent[] {
    if (!this.buffer.trim()) return []

    const event = this.parseLine(this.buffer)
    this.buffer = ''

    return event ? [event] : []
  }
}
