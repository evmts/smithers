/**
 * Comprehensive tests for ExecutionScope component
 * Tests execution gating, scoped enabling/disabling, and effect hooks
 */
import { describe, test, expect } from 'bun:test'
import { createSmithersRoot } from '../reconciler/root.js'
import {
  ExecutionScopeProvider,
  useExecutionScope,
  useExecutionEffect,
} from './ExecutionScope.js'

// ============================================================================
// MODULE EXPORTS
// ============================================================================

describe('ExecutionScope Exports', () => {
  test('exports ExecutionScopeProvider', () => {
    expect(ExecutionScopeProvider).toBeDefined()
    expect(typeof ExecutionScopeProvider).toBe('function')
  })

  test('exports useExecutionScope', () => {
    expect(useExecutionScope).toBeDefined()
    expect(typeof useExecutionScope).toBe('function')
  })

  test('exports useExecutionEffect', () => {
    expect(useExecutionEffect).toBeDefined()
    expect(typeof useExecutionEffect).toBe('function')
  })
})

// ============================================================================
// EXECUTION SCOPE PROVIDER
// ============================================================================

describe('ExecutionScopeProvider', () => {
  test('provides enabled=true by default outside provider', async () => {
    let capturedValue: { enabled: boolean; scopeId: string | null } | null = null

    function Consumer() {
      capturedValue = useExecutionScope()
      return <step>captured</step>
    }

    const root = createSmithersRoot()
    await root.render(<Consumer />)

    expect(capturedValue).toEqual({ enabled: true, scopeId: null })
    root.dispose()
  })

  test('provides enabled=false when disabled', async () => {
    let capturedValue: { enabled: boolean; scopeId: string | null } | null = null

    function Consumer() {
      capturedValue = useExecutionScope()
      return <step>captured</step>
    }

    const root = createSmithersRoot()
    await root.render(
      <ExecutionScopeProvider enabled={false}>
        <Consumer />
      </ExecutionScopeProvider>
    )

    expect(capturedValue!.enabled).toBe(false)
    root.dispose()
  })

  test('provides scopeId when set', async () => {
    let capturedValue: { enabled: boolean; scopeId: string | null } | null = null

    function Consumer() {
      capturedValue = useExecutionScope()
      return <step>captured</step>
    }

    const root = createSmithersRoot()
    await root.render(
      <ExecutionScopeProvider enabled={true} scopeId="test-scope">
        <Consumer />
      </ExecutionScopeProvider>
    )

    expect(capturedValue!.scopeId).toBe('test-scope')
    root.dispose()
  })

  test('child scope inherits parent scopeId when not overridden', async () => {
    let capturedValue: { enabled: boolean; scopeId: string | null } | null = null

    function Consumer() {
      capturedValue = useExecutionScope()
      return <step>captured</step>
    }

    const root = createSmithersRoot()
    await root.render(
      <ExecutionScopeProvider enabled={true} scopeId="parent-scope">
        <ExecutionScopeProvider enabled={true}>
          <Consumer />
        </ExecutionScopeProvider>
      </ExecutionScopeProvider>
    )

    expect(capturedValue!.scopeId).toBe('parent-scope')
    root.dispose()
  })

  test('child scope can override parent scopeId', async () => {
    let capturedValue: { enabled: boolean; scopeId: string | null } | null = null

    function Consumer() {
      capturedValue = useExecutionScope()
      return <step>captured</step>
    }

    const root = createSmithersRoot()
    await root.render(
      <ExecutionScopeProvider enabled={true} scopeId="parent-scope">
        <ExecutionScopeProvider enabled={true} scopeId="child-scope">
          <Consumer />
        </ExecutionScopeProvider>
      </ExecutionScopeProvider>
    )

    expect(capturedValue!.scopeId).toBe('child-scope')
    root.dispose()
  })

  test('enabled=false in parent disables child even when child says enabled=true', async () => {
    let capturedValue: { enabled: boolean; scopeId: string | null } | null = null

    function Consumer() {
      capturedValue = useExecutionScope()
      return <step>captured</step>
    }

    const root = createSmithersRoot()
    await root.render(
      <ExecutionScopeProvider enabled={false}>
        <ExecutionScopeProvider enabled={true}>
          <Consumer />
        </ExecutionScopeProvider>
      </ExecutionScopeProvider>
    )

    expect(capturedValue!.enabled).toBe(false)
    root.dispose()
  })

  test('deeply nested scopes combine enabled correctly', async () => {
    let capturedValue: { enabled: boolean; scopeId: string | null } | null = null

    function Consumer() {
      capturedValue = useExecutionScope()
      return <step>captured</step>
    }

    const root = createSmithersRoot()
    await root.render(
      <ExecutionScopeProvider enabled={true} scopeId="level-1">
        <ExecutionScopeProvider enabled={true} scopeId="level-2">
          <ExecutionScopeProvider enabled={true} scopeId="level-3">
            <Consumer />
          </ExecutionScopeProvider>
        </ExecutionScopeProvider>
      </ExecutionScopeProvider>
    )

    expect(capturedValue!.enabled).toBe(true)
    expect(capturedValue!.scopeId).toBe('level-3')
    root.dispose()
  })

  test('null scopeId inherits from parent', async () => {
    let capturedValue: { enabled: boolean; scopeId: string | null } | null = null

    function Consumer() {
      capturedValue = useExecutionScope()
      return <step>captured</step>
    }

    const root = createSmithersRoot()
    await root.render(
      <ExecutionScopeProvider enabled={true} scopeId="parent-id">
        <ExecutionScopeProvider enabled={true} scopeId={null}>
          <Consumer />
        </ExecutionScopeProvider>
      </ExecutionScopeProvider>
    )

    expect(capturedValue!.scopeId).toBe('parent-id')
    root.dispose()
  })
})

// ============================================================================
// USE EXECUTION SCOPE HOOK
// ============================================================================

describe('useExecutionScope', () => {
  test('returns default context when called outside provider', async () => {
    let capturedValue: { enabled: boolean; scopeId: string | null } | null = null

    function Consumer() {
      capturedValue = useExecutionScope()
      return <step>captured</step>
    }

    const root = createSmithersRoot()
    await root.render(<Consumer />)

    expect(capturedValue).toEqual({ enabled: true, scopeId: null })
    root.dispose()
  })
})

// ============================================================================
// USE EXECUTION EFFECT HOOK
// ============================================================================

describe('useExecutionEffect', () => {
  test('runs effect when enabled=true', async () => {
    let effectRan = false

    function Consumer() {
      useExecutionEffect(true, () => {
        effectRan = true
      }, [])
      return <step>consumer</step>
    }

    const root = createSmithersRoot()
    await root.render(<Consumer />)

    // Wait for effect
    await new Promise((r) => setTimeout(r, 50))
    expect(effectRan).toBe(true)
    root.dispose()
  })

  test('skips effect when enabled=false', async () => {
    let effectRan = false

    function Consumer() {
      useExecutionEffect(false, () => {
        effectRan = true
      }, [])
      return <step>consumer</step>
    }

    const root = createSmithersRoot()
    await root.render(<Consumer />)

    await new Promise((r) => setTimeout(r, 50))
    expect(effectRan).toBe(false)
    root.dispose()
  })

  test('runs cleanup function on unmount', async () => {
    let cleanupRan = false

    function Consumer() {
      useExecutionEffect(true, () => {
        return () => {
          cleanupRan = true
        }
      }, [])
      return <step>consumer</step>
    }

    const root = createSmithersRoot()
    await root.render(<Consumer />)

    await new Promise((r) => setTimeout(r, 50))
    root.dispose()

    await new Promise((r) => setTimeout(r, 50))
    expect(cleanupRan).toBe(true)
  })
})

// ============================================================================
// CONTEXT VALUE TYPE
// ============================================================================

describe('ExecutionScopeValue type', () => {
  test('enabled is boolean', () => {
    const value: { enabled: boolean; scopeId: string | null } = {
      enabled: true,
      scopeId: null,
    }
    expect(typeof value.enabled).toBe('boolean')
  })

  test('scopeId is string or null', () => {
    const withNull: { enabled: boolean; scopeId: string | null } = {
      enabled: true,
      scopeId: null,
    }
    expect(withNull.scopeId).toBe(null)

    const withString: { enabled: boolean; scopeId: string | null } = {
      enabled: true,
      scopeId: 'my-scope',
    }
    expect(withString.scopeId).toBe('my-scope')
  })
})

// ============================================================================
// INTEGRATION TESTS
// ============================================================================

describe('ExecutionScope integration', () => {
  test('disabled scope prevents effects from running', async () => {
    let effectRan = false

    function Consumer() {
      const scope = useExecutionScope()
      useExecutionEffect(scope.enabled, () => {
        effectRan = true
      }, [])
      return <step>consumer</step>
    }

    const root = createSmithersRoot()
    await root.render(
      <ExecutionScopeProvider enabled={false}>
        <Consumer />
      </ExecutionScopeProvider>
    )

    await new Promise((r) => setTimeout(r, 50))
    expect(effectRan).toBe(false)
    root.dispose()
  })

  test('enabled scope allows effects to run', async () => {
    let effectRan = false

    function Consumer() {
      const scope = useExecutionScope()
      useExecutionEffect(scope.enabled, () => {
        effectRan = true
      }, [])
      return <step>consumer</step>
    }

    const root = createSmithersRoot()
    await root.render(
      <ExecutionScopeProvider enabled={true}>
        <Consumer />
      </ExecutionScopeProvider>
    )

    await new Promise((r) => setTimeout(r, 50))
    expect(effectRan).toBe(true)
    root.dispose()
  })
})
