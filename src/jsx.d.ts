import 'react'

declare module 'react' {
  namespace JSX {
    interface IntrinsicElements {
      // Agent execution elements
      claude: {
        status?: string
        result?: unknown
        error?: string
        model?: string
        maxTurns?: number
        tools?: string[]
        systemPrompt?: string
        onFinished?: (result: unknown) => void
        onError?: (error: Error) => void
        validate?: (result: unknown) => Promise<boolean>
        children?: React.ReactNode
        key?: string | number
        [key: string]: unknown
      }

      // Control flow elements
      ralph: {
        iteration?: number
        pending?: number
        maxIterations?: number
        onIteration?: (iteration: number) => void
        children?: React.ReactNode
        key?: string | number
        [key: string]: unknown
      }

      phase: {
        name?: string
        children?: React.ReactNode
        key?: string | number
        [key: string]: unknown
      }

      step: {
        name?: string
        children?: React.ReactNode
        key?: string | number
        [key: string]: unknown
      }

      // Semantic elements
      persona: {
        role?: string
        expertise?: string
        children?: React.ReactNode
        key?: string | number
        [key: string]: unknown
      }

      constraints: {
        children?: React.ReactNode
        key?: string | number
        [key: string]: unknown
      }

      // Generic elements for tests
      task: {
        children?: React.ReactNode
        key?: string | number
        [key: string]: unknown
      }

      agent: {
        children?: React.ReactNode
        key?: string | number
        [key: string]: unknown
      }

      container: {
        children?: React.ReactNode
        key?: string | number
        [key: string]: unknown
      }

      message: {
        children?: React.ReactNode
        key?: string | number
        [key: string]: unknown
      }

      // Smithers orchestrator elements
      orchestration: {
        'execution-id'?: string
        children?: React.ReactNode
        key?: string | number
        [key: string]: unknown
      }

      'smithers-subagent': {
        status?: string
        'subagent-id'?: string | null
        'execution-id'?: string
        'planner-model'?: string
        'execution-model'?: string
        'script-path'?: string
        output?: string
        error?: string
        'tokens-input'?: number
        'tokens-output'?: number
        'duration-ms'?: number
        children?: React.ReactNode
        key?: string | number
        [key: string]: unknown
      }

      // Catch-all for any custom element
      [key: string]: any
    }
  }
}
