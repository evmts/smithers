// JSON Schema type definitions for Smithers orchestrator

// ============================================================================
// JSON Schema type (simplified)
// ============================================================================

export interface JSONSchema {
  type?: string
  properties?: Record<string, JSONSchema>
  required?: string[]
  items?: JSONSchema
  enum?: any[]
  description?: string
  default?: any
  [key: string]: any
}
