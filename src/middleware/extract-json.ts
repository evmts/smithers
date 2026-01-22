import type { AgentResult } from '../components/agents/types.js'
import { extractJson } from '../utils/structured-output/index.js'
import { createTransformMiddleware } from './create-transform-middleware.js'
import type { SmithersMiddleware } from './types.js'

export interface ExtractJsonOptions {
  transform?: (text: string) => string
}

export function extractJsonMiddleware(options: ExtractJsonOptions = {}): SmithersMiddleware {
  return createTransformMiddleware('extractJson', (result: AgentResult) => {
    const extracted = extractJson(result.output)
    if (!extracted) {
      return result
    }

    const transformed = options.transform ? options.transform(extracted) : extracted

    if (result.structured === undefined) {
      try {
        const parsed = JSON.parse(transformed)
        return {
          ...result,
          output: transformed,
          structured: parsed,
        }
      } catch {
        return {
          ...result,
          output: transformed,
        }
      }
    }

    return {
      ...result,
      output: transformed,
    }
  })
}
