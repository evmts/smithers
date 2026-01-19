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
    const phaseMatch = line.match(/^\s*phase:\s*(.+?)(?:\s*-\s*(.+))?$/i)
    if (phaseMatch) {
      return {
        type: 'phase',
        timestamp,
        data: {
          name: phaseMatch[1]!.trim(),
          status: phaseMatch[2]?.trim() || 'STARTING',
        },
        raw: line,
      }
    }

    // Agent events
    const agentMatch = line.match(/^\s*(?:agent:|claude)\s*(.+?)(?:\s*-\s*(.+))?$/i)
    if (agentMatch) {
      return {
        type: 'agent',
        timestamp,
        data: {
          name: agentMatch[1]!.trim(),
          status: agentMatch[2]?.trim() || 'RUNNING',
        },
        raw: line,
      }
    }

    // Tool call events
    const toolMatch = line.match(/^\s*tool:\s*(.+?)(?:\s*-\s*(.+))?$/i)
    if (toolMatch) {
      return {
        type: 'tool',
        timestamp,
        data: {
          name: toolMatch[1]!.trim(),
          details: toolMatch[2]?.trim() || '',
        },
        raw: line,
      }
    }

    // Ralph iteration events
    const iterationMatch = line.match(/^\s*iteration\s*(\d+)/i)
    if (iterationMatch) {
      return {
        type: 'ralph',
        timestamp,
        data: {
          iteration: parseInt(iterationMatch[1]!),
        },
        raw: line,
      }
    }

    // Error events
    if (/^\s*error:/i.test(line) || line.match(/^\s*at\s+/)) {
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
