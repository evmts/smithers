// Structured Output Utilities
// Re-exports from ./structured-output/ for backward compatibility

export {
  // Types
  type StructuredOutputConfig,
  type ParseResult,
  // Zod to JSON Schema conversion
  zodToJsonSchema,
  convertZodType,
  schemaToPromptDescription,
  // Validation and parsing
  extractJson,
  parseStructuredOutput,
  // Prompt generation
  generateStructuredOutputPrompt,
  generateRetryPrompt,
} from './structured-output/index.js'
