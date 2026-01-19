import type { z } from 'zod'
import type {
  CreateSmithersToolOptions,
  SmithersTool,
  SmithersToolContext,
} from './types.js'

/**
 * Create a SmithersTool from options.
 * Note: AI SDK integration temporarily disabled - 'ai' package not installed.
 */
export function createSmithersTool<TInput extends z.ZodType, TOutput>(
  options: CreateSmithersToolOptions<TInput, TOutput>
): SmithersTool<TInput, TOutput> {
  const { name, inputSchema, outputSchema, execute, description } = options

  return {
    name,
    description,
    inputSchema,
    ...(outputSchema ? { outputSchema } : {}),
    execute: async (input: z.infer<TInput>, execOptions: Record<string, unknown>) => {
      const smithersContext =
        (execOptions as { smithers?: SmithersToolContext }).smithers ??
        (execOptions as { experimental_context?: SmithersToolContext }).experimental_context
      
      const abortSignal = execOptions['abortSignal'] as AbortSignal | undefined
      
      const context: SmithersToolContext & { abortSignal?: AbortSignal } = smithersContext 
        ? {
            ...smithersContext,
            ...(abortSignal ? { abortSignal } : {}),
          }
        : {
            db: {} as SmithersToolContext['db'],
            agentId: 'stub',
            executionId: 'stub',
            cwd: process.cwd(),
            env: process.env as Record<string, string>,
            log: console.log,
            ...(abortSignal ? { abortSignal } : {}),
          }
      
      return execute(input, context)
    },
  }
}
