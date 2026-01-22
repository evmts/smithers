export interface ParsedCodexOutput {
  output: string
  structured?: unknown
  tokensUsed: { input: number; output: number }
  turnsUsed: number
}

/**
 * Parse Codex CLI output
 */
export function parseCodexOutput(stdout: string, isJson?: boolean): ParsedCodexOutput {
  const result: ParsedCodexOutput = {
    output: stdout,
    tokensUsed: { input: 0, output: 0 },
    turnsUsed: 0,
  }

  if (!isJson) {
    return result
  }

  // Parse JSONL output
  const lines = stdout.split('\n').filter(line => line.trim())
  let lastMessage = ''
  
  for (const line of lines) {
    try {
      const event = JSON.parse(line) as Record<string, unknown>
      
      // Extract message content
      if (event['type'] === 'message' && typeof event['content'] === 'string') {
        lastMessage = event['content']
      }
      
      // Extract usage info
      if (event['usage'] || event['type'] === 'usage') {
        const usage = (event['usage'] as Record<string, unknown>) ?? event
        if (typeof usage['input_tokens'] === 'number') {
          result.tokensUsed.input = usage['input_tokens']
        }
        if (typeof usage['output_tokens'] === 'number') {
          result.tokensUsed.output = usage['output_tokens']
        }
      }

      // Extract structured output
      if (event['type'] === 'output' && event['data']) {
        result.structured = event['data']
      }
    } catch {
      // Not JSON, continue
    }
  }

  if (lastMessage) {
    result.output = lastMessage
  }

  return result
}
