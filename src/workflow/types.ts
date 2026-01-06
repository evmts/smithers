import type { ReactElement, ReactNode } from 'react'
import type { z, ZodObject, ZodRawShape } from 'zod'

/**
 * Reactive store for workflow values
 */
export interface WorkflowStore<T> {
  /** Current values */
  values: Partial<T>
  /** Set of subscriber callbacks */
  listeners: Set<() => void>
  /**
   * Subscribe to value changes
   * @param listener Callback invoked when any value changes
   * @returns Unsubscribe function
   */
  subscribe(listener: () => void): () => void
  /**
   * Get current snapshot of all values
   * Used by useSyncExternalStore
   */
  getSnapshot(): Partial<T>
  /**
   * Set a value and notify listeners
   * @param name The field name
   * @param value The value to set
   */
  setValue<K extends keyof T>(name: K, value: T[K]): void
  /**
   * Get a specific value
   * @param name The field name
   */
  getValue<K extends keyof T>(name: K): T[K] | undefined
}

/**
 * Options for createWorkflow
 */
export interface CreateWorkflowOptions<T extends ZodRawShape> {
  /** Zod schema defining the workflow data structure */
  schema: ZodObject<T>
  /** Optional default values for fields */
  defaultValues?: Partial<z.infer<ZodObject<T>>>
}

/**
 * Props for the workflow Output component
 */
export interface WorkflowOutputProps<T extends ZodRawShape> {
  /** Field name from the workflow schema */
  name: keyof z.infer<ZodObject<T>>
  /** Optional description for the generated tool */
  description?: string
}

/**
 * Result of createWorkflow
 */
export interface Workflow<T extends ZodRawShape> {
  /** The original Zod schema */
  schema: ZodObject<T>
  /** Context provider component */
  Provider: React.FC<{ children: ReactNode }>
  /**
   * Hook to subscribe to a specific workflow value
   * @param name Field name from the schema
   * @returns The current value or undefined
   */
  useInput<K extends keyof z.infer<ZodObject<T>>>(
    name: K
  ): z.infer<ZodObject<T>>[K] | undefined
  /**
   * Hook to access the full workflow store
   * @returns The WorkflowStore instance
   * @throws Error if used outside of Provider
   */
  useStore(): WorkflowStore<z.infer<ZodObject<T>>>
  /**
   * Component to define an agent output field
   * Generates a tool for Claude to set the value
   */
  Output: React.FC<WorkflowOutputProps<T>>
}

/**
 * Human prompt info with workflow outputs
 */
export interface HumanPromptInfo {
  /** Message to display to the user */
  message: string
  /** Content from Human component's children */
  content: string
  /** Workflow outputs to collect from the user */
  outputs: Array<{
    name: string
    description?: string
    schema?: unknown // JSON schema
  }>
}

/**
 * Response from human prompt callback
 */
export interface HumanPromptResponse {
  /** Whether the user approved */
  approved: boolean
  /** Values provided by the user (for workflow outputs) */
  values?: Record<string, unknown>
}
