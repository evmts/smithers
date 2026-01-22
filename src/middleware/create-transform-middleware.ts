import type { AgentResult } from '../components/agents/types.js'
import type { SmithersMiddleware } from './types.js'

export type TransformFn = (result: AgentResult) => AgentResult | Promise<AgentResult>

export function createTransformMiddleware(name: string, transformResult: TransformFn): SmithersMiddleware {
  return { name, transformResult }
}
