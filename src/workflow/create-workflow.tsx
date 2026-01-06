import React, {
  createContext,
  useContext,
  useRef,
  useSyncExternalStore,
  createElement,
  type ReactNode,
  type ReactElement,
} from 'react'
import type { z, ZodObject, ZodRawShape } from 'zod'
import type {
  WorkflowStore,
  CreateWorkflowOptions,
  WorkflowOutputProps,
  Workflow,
} from './types.js'

// Counter for generating unique workflow IDs
let workflowIdCounter = 0

/**
 * Create a reactive store for workflow values
 */
function createStore<T>(defaultValues?: Partial<T>): WorkflowStore<T> {
  let values: Partial<T> = defaultValues ? { ...defaultValues } : {}
  const listeners = new Set<() => void>()

  // Keep a stable snapshot reference for useSyncExternalStore
  // Only update when values actually change
  let snapshot = values

  const store: WorkflowStore<T> = {
    get values() {
      return values
    },
    listeners,

    subscribe(listener: () => void): () => void {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },

    getSnapshot(): Partial<T> {
      return snapshot
    },

    setValue<K extends keyof T>(name: K, value: T[K]): void {
      // Create new values object for immutability
      values = { ...values, [name]: value }
      // Update snapshot reference
      snapshot = values

      // Notify all listeners
      for (const listener of listeners) {
        listener()
      }
    },

    getValue<K extends keyof T>(name: K): T[K] | undefined {
      return values[name]
    },
  }

  return store
}

/**
 * Create a type-safe reactive workflow
 *
 * @example
 * ```tsx
 * const workflow = createWorkflow({
 *   schema: z.object({
 *     findings: z.string(),
 *     analysis: z.object({
 *       summary: z.string(),
 *       score: z.number(),
 *     }),
 *   }),
 * })
 *
 * function App() {
 *   return (
 *     <workflow.Provider>
 *       <Researcher />
 *       <Analyst />
 *     </workflow.Provider>
 *   )
 * }
 * ```
 */
export function createWorkflow<T extends ZodRawShape>(
  options: CreateWorkflowOptions<T>
): Workflow<T> {
  type Values = z.infer<ZodObject<T>>

  // Generate a unique ID for this workflow
  const workflowId = `workflow_${++workflowIdCounter}`

  // Create a unique context for this workflow
  const WorkflowContext = createContext<WorkflowStore<Values> | null>(null)

  /**
   * Provider component that creates and provides the store
   */
  function Provider({ children }: { children: ReactNode }): ReactElement {
    // Use ref to create store only once per Provider instance
    const storeRef = useRef<WorkflowStore<Values> | null>(null)
    if (!storeRef.current) {
      storeRef.current = createStore<Values>(options.defaultValues)
    }

    // Render a workflow-provider element so the execution system can find the store
    // The store is passed as a prop for tree traversal
    // Include the workflow ID to match outputs to the correct provider
    return createElement(
      'workflow-provider',
      { _store: storeRef.current, _workflowId: workflowId },
      createElement(
        WorkflowContext.Provider,
        { value: storeRef.current },
        children
      )
    )
  }

  /**
   * Hook to subscribe to a specific workflow value
   *
   * Uses useSyncExternalStore for safe subscription to the external store.
   * Re-renders only when the subscribed value changes.
   */
  function useInput<K extends keyof Values>(name: K): Values[K] | undefined {
    const store = useContext(WorkflowContext)
    if (!store) return undefined

    // Subscribe to the entire store but only return the requested value
    // This is efficient because useSyncExternalStore only triggers re-render
    // when getSnapshot() returns a different reference
    const value = useSyncExternalStore(
      store.subscribe,
      () => store.getValue(name),
      () => store.getValue(name) // Server snapshot (same as client for our case)
    )

    return value
  }

  /**
   * Hook to access the full workflow store
   *
   * @throws Error if used outside of Provider
   */
  function useStore(): WorkflowStore<Values> {
    const store = useContext(WorkflowContext)
    if (!store) {
      throw new Error(
        'useStore must be used within a workflow.Provider. ' +
          'Make sure your component is wrapped in <workflow.Provider>.'
      )
    }
    return store
  }

  /**
   * Output component that marks a workflow value for agent output
   *
   * This component renders a workflow-output element that the execution
   * system detects. It generates a tool for Claude to set the value.
   */
  function Output({ name, description }: WorkflowOutputProps<T>): ReactElement {
    // Get the Zod schema for this specific field
    const fieldSchema = options.schema.shape[name as string]

    // Render a workflow-output element with metadata
    // The execution system will find these and generate tools
    // Include the workflow ID to match the output to the correct provider
    return createElement('workflow-output', {
      name: String(name),
      description,
      schema: fieldSchema,
      _workflowId: workflowId,
    })
  }

  return {
    schema: options.schema,
    Provider,
    useInput,
    useStore,
    Output,
  }
}
