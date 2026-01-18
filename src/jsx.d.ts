import type React from 'react'

// Augment React's JSX namespace to include Smithers custom elements
declare module 'react' {
  // eslint-disable-next-line @typescript-eslint/no-namespace
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

      'claude-api': {
        status?: string
        result?: unknown
        error?: string
        model?: string | undefined
        children?: React.ReactNode
        key?: string | number
        [key: string]: unknown
      }

      'smithers-stop': {
        children?: React.ReactNode
        key?: string | number
        [key: string]: unknown
      }

      subagent: {
        children?: React.ReactNode
        key?: string | number
        [key: string]: unknown
      }

      // TUI elements
      box: {
        children?: React.ReactNode
        key?: string | number
        [key: string]: unknown
      }

      text: {
        children?: React.ReactNode
        key?: string | number
        content?: string
        [key: string]: unknown
      }

      scrollbox: {
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

      human: {
        children?: React.ReactNode
        key?: string | number
        [key: string]: unknown
      }

      parallel: {
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

      messages: {
        children?: React.ReactNode
        key?: string | number
        [key: string]: unknown
      }

      'tool-call': {
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

      // Git elements
      'git-commit': {
        children?: React.ReactNode
        key?: string | number
        [key: string]: unknown
      }

      'git-notes': {
        children?: React.ReactNode
        key?: string | number
        [key: string]: unknown
      }

      // JJ (Jujutsu) elements
      'jj-commit': {
        children?: React.ReactNode
        key?: string | number
        [key: string]: unknown
      }

      'jj-describe': {
        children?: React.ReactNode
        key?: string | number
        [key: string]: unknown
      }

      'jj-rebase': {
        children?: React.ReactNode
        key?: string | number
        [key: string]: unknown
      }

      'jj-snapshot': {
        children?: React.ReactNode
        key?: string | number
        [key: string]: unknown
      }

      'jj-status': {
        children?: React.ReactNode
        key?: string | number
        [key: string]: unknown
      }

      // Hook elements
      'ci-failure-hook': {
        children?: React.ReactNode
        key?: string | number
        [key: string]: unknown
      }

      'post-commit-hook': {
        children?: React.ReactNode
        key?: string | number
        [key: string]: unknown
      }

      // MCP elements
      'mcp-tool': {
        children?: React.ReactNode
        key?: string | number
        [key: string]: unknown
      }

      // Review elements
      review: {
        children?: React.ReactNode
        key?: string | number
        [key: string]: unknown
      }

      // Test/utility elements - catch-all pattern
      results: {
        children?: React.ReactNode
        key?: string | number
        [key: string]: unknown
      }

      status: {
        children?: React.ReactNode
        key?: string | number
        [key: string]: unknown
      }

      value: {
        children?: React.ReactNode
        key?: string | number
        [key: string]: unknown
      }

      result: {
        children?: React.ReactNode
        key?: string | number
        [key: string]: unknown
      }

      data: {
        children?: React.ReactNode
        key?: string | number
        [key: string]: unknown
      }

      multi: {
        children?: React.ReactNode
        key?: string | number
        [key: string]: unknown
      }

      'inner-result': {
        children?: React.ReactNode
        key?: string | number
        [key: string]: unknown
      }

      'outer-result': {
        children?: React.ReactNode
        key?: string | number
        [key: string]: unknown
      }
    }
  }
}

export {}
