import { tool as aiSdkTool } from 'ai'
import type { z } from 'zod'
import type {
  CreateSmithersToolOptions,
  SmithersTool,
  SmithersToolContext,
} from './types.js'

export function createSmithersTool<TInput extends z.ZodType, TOutput>(
  options: CreateSmithersToolOptions<TInput, TOutput>
): SmithersTool<TInput, TOutput> {
  const { name, inputSchema, outputSchema, ...toolOptions } = options

  const coreTool = aiSdkTool({
    description: toolOptions.description,
    parameters: inputSchema,
    execute: async (input, executionOptions) => {
      const smithersContext =
        (executionOptions as { smithers?: SmithersToolContext }).smithers ??
        (executionOptions as { experimental_context?: SmithersToolContext }).experimental_context
      if (!smithersContext) {
        throw new Error(`Missing Smithers tool context for ${name}`)
      }

      const context = {
        ...smithersContext,
        ...(executionOptions.abortSignal ? { abortSignal: executionOptions.abortSignal } : {}),
      }

      return toolOptions.execute(input, context)
    },
  })

  return {
    name,
    description: toolOptions.description,
    inputSchema,
    ...(outputSchema ? { outputSchema } : {}),
    ...coreTool,
  }
}
