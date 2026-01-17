import 'solid-js'

declare module 'solid-js' {
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
        children?: JSX.Element
        key?: string | number
        [key: string]: unknown
      }

      // Control flow elements
      ralph: {
        iteration?: number
        pending?: number
        maxIterations?: number
        onIteration?: (iteration: number) => void
        children?: JSX.Element
        key?: string | number
        [key: string]: unknown
      }

      phase: {
        name?: string
        children?: JSX.Element
        key?: string | number
        [key: string]: unknown
      }

      step: {
        name?: string
        children?: JSX.Element
        key?: string | number
        [key: string]: unknown
      }

      // Semantic elements
      persona: {
        role?: string
        expertise?: string
        children?: JSX.Element
        key?: string | number
        [key: string]: unknown
      }

      constraints: {
        children?: JSX.Element
        key?: string | number
        [key: string]: unknown
      }

      // Generic elements for tests
      task: {
        children?: JSX.Element
        key?: string | number
        [key: string]: unknown
      }

      agent: {
        children?: JSX.Element
        key?: string | number
        [key: string]: unknown
      }

      container: {
        children?: JSX.Element
        key?: string | number
        [key: string]: unknown
      }

      message: {
        children?: JSX.Element
        key?: string | number
        [key: string]: unknown
      }

      // Catch-all for any custom element
      [key: string]: any
    }
  }
}
