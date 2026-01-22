import type { AgentResult } from '../components/agents/types.js'
import { createTransformMiddleware } from './create-transform-middleware.js'
import type { SmithersMiddleware } from './types.js'

export interface ExtractReasoningOptions {
  tagName: string
  separator?: string
  startWithReasoning?: boolean
  onReasoning?: (reasoning: string) => void
}

export function extractReasoningMiddleware(options: ExtractReasoningOptions): SmithersMiddleware {
  const separator = options.separator ?? '\n'
  const tagName = options.tagName
  const tagRegex = new RegExp(`<${tagName}>([\\s\\S]*?)</${tagName}>`, 'gi')

  return createTransformMiddleware('extractReasoning', (result: AgentResult) => {
    const matches: string[] = []
    const output = result.output.replace(tagRegex, (_, content: string) => {
      matches.push(content.trim())
      return ''
    })

    if (matches.length === 0) {
      return result
    }

    const reasoning = matches.join(separator).trim()
    const cleanedOutput = options.startWithReasoning ? output.trimStart() : output.trim()

    options.onReasoning?.(reasoning)

    return {
      ...result,
      reasoning,
      output: cleanedOutput,
    }
  })
}
