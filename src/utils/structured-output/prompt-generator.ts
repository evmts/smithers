// Prompt Generation
// Generate prompts for structured output

import { z } from 'zod'
import { schemaToPromptDescription } from './zod-converter.js'

/**
 * Generate system prompt additions for structured output
 */
export function generateStructuredOutputPrompt(schema: z.ZodType): string {
  const jsonSchema = schemaToPromptDescription(schema)

  return `
IMPORTANT: Your response MUST be valid JSON that conforms to this schema:

\`\`\`json
${jsonSchema}
\`\`\`

Rules:
1. Output ONLY the JSON object/array, no other text
2. Do not wrap in markdown code blocks
3. Ensure all required fields are present
4. Use the exact field names and types specified
`
}

/**
 * Generate a retry prompt when validation fails
 */
export function generateRetryPrompt(
  originalOutput: string,
  validationError: string
): string {
  return `Your previous response did not match the required schema.

Previous output:
\`\`\`
${originalOutput.slice(0, 1000)}${originalOutput.length > 1000 ? '...(truncated)' : ''}
\`\`\`

Validation error:
${validationError}

Please provide a corrected response that matches the schema exactly. Output ONLY valid JSON.`
}
