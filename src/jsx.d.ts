import type React from 'react'

// Shared intrinsic elements for Smithers JSX runtime.
interface SmithersIntrinsicElements {
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

      end: {
        status?: string
        reason?: string
        'exit-code'?: number
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

      worktree: {
        branch?: string
        path?: string
        status?: string
        error?: string
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

      summary: {
        children?: React.ReactNode
        key?: string | number
        [key: string]: unknown
      }

      'phase-content': {
        children?: React.ReactNode
        key?: string | number
        [key: string]: unknown
      }

      audit: {
        status?: string
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

      // Custom semantic elements for orchestration scripts/examples
      // These are rendered to XML output and represent domain-specific structures

      // Processing/workflow elements
      'parallel-status': { children?: React.ReactNode; key?: string | number; [key: string]: unknown }
      'parallel-processing': { children?: React.ReactNode; key?: string | number; [key: string]: unknown }
      'serial-status': { children?: React.ReactNode; key?: string | number; [key: string]: unknown }
      'serial-processing': { children?: React.ReactNode; key?: string | number; [key: string]: unknown }
      processor: { children?: React.ReactNode; key?: string | number; [key: string]: unknown }

      // Report elements
      report: { children?: React.ReactNode; key?: string | number; [key: string]: unknown }
      total: { children?: React.ReactNode; key?: string | number; [key: string]: unknown }
      implemented: { children?: React.ReactNode; key?: string | number; [key: string]: unknown }
      closed: { children?: React.ReactNode; key?: string | number; [key: string]: unknown }
      failed: { children?: React.ReactNode; key?: string | number; [key: string]: unknown }
      pending: { children?: React.ReactNode; key?: string | number; [key: string]: unknown }

      // Scan elements
      'scan-results': { children?: React.ReactNode; key?: string | number; [key: string]: unknown }
      'normal-reviews': { children?: React.ReactNode; key?: string | number; [key: string]: unknown }
      'difficult-reviews': { children?: React.ReactNode; key?: string | number; [key: string]: unknown }

      // Merge elements
      'merge-order': { children?: React.ReactNode; key?: string | number; [key: string]: unknown }
      'merge-progress': { children?: React.ReactNode; key?: string | number; [key: string]: unknown }
      'merge-candidates': { children?: React.ReactNode; key?: string | number; [key: string]: unknown }
      merged: { children?: React.ReactNode; key?: string | number; [key: string]: unknown }
      position: { children?: React.ReactNode; key?: string | number; [key: string]: unknown }
      'current-operation': { children?: React.ReactNode; key?: string | number; [key: string]: unknown }

      // Rebase elements
      'rebase-progress': { children?: React.ReactNode; key?: string | number; [key: string]: unknown }
      rebased: { children?: React.ReactNode; key?: string | number; [key: string]: unknown }
      completed: { children?: React.ReactNode; key?: string | number; [key: string]: unknown }
      conflict: { children?: React.ReactNode; key?: string | number; [key: string]: unknown }

      // Stacked PR elements
      'stacked-pr-merge': { children?: React.ReactNode; key?: string | number; [key: string]: unknown }
      'worktree-finalize': { children?: React.ReactNode; key?: string | number; [key: string]: unknown }
      'worktree-finalize-orchestrator': { children?: React.ReactNode; key?: string | number; [key: string]: unknown }
      'not-ready': { children?: React.ReactNode; key?: string | number; [key: string]: unknown }
      candidate: { children?: React.ReactNode; key?: string | number; [key: string]: unknown }

      // Context/state elements
      context: { children?: React.ReactNode; key?: string | number; [key: string]: unknown }
      checks: { children?: React.ReactNode; key?: string | number; [key: string]: unknown }
      'failed-checks': { children?: React.ReactNode; key?: string | number; [key: string]: unknown }
      check: { children?: React.ReactNode; key?: string | number; [key: string]: unknown }
      config: { children?: React.ReactNode; key?: string | number; [key: string]: unknown }
      waiting: { children?: React.ReactNode; key?: string | number; [key: string]: unknown }
      pr: { children?: React.ReactNode; key?: string | number; [key: string]: unknown }
      success: { children?: React.ReactNode; key?: string | number; [key: string]: unknown }
      error: { children?: React.ReactNode; key?: string | number; [key: string]: unknown }

      // Additional elements from worktree-pr-finalize
      ready: { children?: React.ReactNode; key?: string | number; [key: string]: unknown }
      conflicts: { children?: React.ReactNode; key?: string | number; [key: string]: unknown }
      files: { children?: React.ReactNode; key?: string | number; [key: string]: unknown }
      reviews: { children?: React.ReactNode; key?: string | number; [key: string]: unknown }
      'pending-reviews': { children?: React.ReactNode; key?: string | number; [key: string]: unknown }
      'stack-status': { children?: React.ReactNode; key?: string | number; [key: string]: unknown }
      'is-stacked': { children?: React.ReactNode; key?: string | number; [key: string]: unknown }
      'base-pr': { children?: React.ReactNode; key?: string | number; [key: string]: unknown }
      blocked: { children?: React.ReactNode; key?: string | number; [key: string]: unknown }
      discovered: { children?: React.ReactNode; key?: string | number; [key: string]: unknown }
      agents: { children?: React.ReactNode; key?: string | number; [key: string]: unknown }
}

// Augment JSX namespaces for React and Smithers import sources.
declare module 'react' {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace JSX {
    interface IntrinsicElements extends SmithersIntrinsicElements {}
  }
}

declare module 'smithers-orchestrator' {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace JSX {
    interface IntrinsicElements extends SmithersIntrinsicElements {}
  }
}

export {}
