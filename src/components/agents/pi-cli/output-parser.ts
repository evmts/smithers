import type { ParsedCLIOutput } from '../shared/cli-executor.js'

interface PiEvent {
  type: string
  message?: {
    role: string
    content: Array<{ type: string; text?: string }>
    usage?: { input: number; output: number }
  }
}

export function parsePiOutput(stdout: string): ParsedCLIOutput {
  const lines = stdout.split('\n').filter(Boolean)
  let output = ''
  const tokensUsed = { input: 0, output: 0 }
  let turnsUsed = 0
  
  for (const line of lines) {
    try {
      const event = JSON.parse(line) as PiEvent
      
      if (event.type === 'message_end' && event.message?.role === 'assistant') {
        // Extract text from message content
        for (const block of event.message.content ?? []) {
          if (block.type === 'text' && block.text) {
            output += block.text
          }
        }
        // Accumulate usage
        if (event.message.usage) {
          tokensUsed.input += event.message.usage.input
          tokensUsed.output += event.message.usage.output
        }
        turnsUsed++
      }
    } catch {
      // Non-JSON line, ignore
    }
  }
  
  return { output, tokensUsed, turnsUsed }
}
