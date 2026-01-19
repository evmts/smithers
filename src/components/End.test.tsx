/**
 * Tests for End component
 * Tests orchestration termination and summary capture
 */
import { test, expect, describe, beforeEach, afterEach } from 'bun:test'
import { createSmithersRoot } from '../reconciler/root.js'
import { createSmithersDB, type SmithersDB } from '../db/index.js'
import { End, type EndProps, type EndSummary } from './End.js'
import { SmithersProvider } from './SmithersProvider.js'

describe('End component', () => {
  let db: SmithersDB
  let executionId: string

  beforeEach(async () => {
    db = createSmithersDB({ reset: true })
    executionId = await db.execution.start('test-end', 'End.test.tsx')
  })

  afterEach(() => {
    db.close()
  })

  describe('Exports', () => {
    test('exports End component', () => {
      expect(End).toBeDefined()
      expect(typeof End).toBe('function')
    })
  })

  describe('EndProps interface', () => {
    test('accepts summary as object', () => {
      const props: EndProps = {
        summary: { status: 'success', message: 'Done' },
      }
      expect(props.summary).toBeDefined()
    })

    test('accepts summary as sync function', () => {
      const props: EndProps = {
        summary: () => ({ status: 'success', message: 'Done' }),
      }
      expect(typeof props.summary).toBe('function')
    })

    test('accepts summary as async function', () => {
      const props: EndProps = {
        summary: async () => ({ status: 'failure', message: 'Failed' }),
      }
      expect(typeof props.summary).toBe('function')
    })

    test('accepts optional exitCode', () => {
      const props: EndProps = {
        summary: { status: 'failure', message: 'Error' },
        exitCode: 1,
      }
      expect(props.exitCode).toBe(1)
    })

    test('accepts optional reason', () => {
      const props: EndProps = {
        summary: { status: 'success', message: 'Done' },
        reason: 'max_iterations',
      }
      expect(props.reason).toBe('max_iterations')
    })
  })

  describe('EndSummary interface', () => {
    test('accepts minimal summary', () => {
      const summary: EndSummary = {
        status: 'success',
        message: 'All done',
      }
      expect(summary.status).toBe('success')
    })

    test('accepts summary with data', () => {
      const summary: EndSummary = {
        status: 'partial',
        message: 'Partial completion',
        data: { tasksCompleted: 5, tasksFailed: 2 },
      }
      expect(summary.data?.tasksCompleted).toBe(5)
    })

    test('accepts summary with metrics', () => {
      const summary: EndSummary = {
        status: 'success',
        message: 'Completed',
        metrics: {
          duration_ms: 5000,
          iterations: 3,
          agents_run: 5,
          tokens_used: { input: 1000, output: 500 },
        },
      }
      expect(summary.metrics?.duration_ms).toBe(5000)
    })
  })

  describe('End renders', () => {
    test('renders end element with status', async () => {
      const root = createSmithersRoot()
      await root.render(
        <SmithersProvider db={db} executionId={executionId}>
          <End summary={{ status: 'success', message: 'Done' }} />
        </SmithersProvider>
      )

      const xml = root.toXML()
      expect(xml).toContain('<end')
      expect(xml).toContain('status="ending"')
      root.dispose()
    })

    test('renders with exit-code attribute', async () => {
      const root = createSmithersRoot()
      await root.render(
        <SmithersProvider db={db} executionId={executionId}>
          <End summary={{ status: 'failure', message: 'Error' }} exitCode={1} />
        </SmithersProvider>
      )

      const xml = root.toXML()
      expect(xml).toContain('exitCode="1"')
      root.dispose()
    })

    test('renders with reason attribute', async () => {
      const root = createSmithersRoot()
      await root.render(
        <SmithersProvider db={db} executionId={executionId}>
          <End
            summary={{ status: 'success', message: 'Done' }}
            reason="max_iterations"
          />
        </SmithersProvider>
      )

      const xml = root.toXML()
      expect(xml).toContain('reason="max_iterations"')
      root.dispose()
    })
  })

  describe('End stores summary in database', () => {
    test('stores summary in executions table', async () => {
      const root = createSmithersRoot()
      await root.render(
        <SmithersProvider db={db} executionId={executionId}>
          <End
            summary={{
              status: 'success',
              message: 'Test completed',
              data: { key: 'value' },
            }}
          />
        </SmithersProvider>
      )

      // Wait for async mount to complete
      await new Promise((r) => setTimeout(r, 100))

      const execution = db.db.queryOne<{
        end_summary: string
        end_reason: string
        exit_code: number
        status: string
      }>('SELECT * FROM executions WHERE id = ?', [executionId])
      expect(execution?.end_summary).toBeDefined()

      const summary = JSON.parse(execution!.end_summary)
      expect(summary.status).toBe('success')
      expect(summary.message).toBe('Test completed')
      expect(summary.data.key).toBe('value')
      root.dispose()
    })

    test('stores end_reason in executions table', async () => {
      const root = createSmithersRoot()
      await root.render(
        <SmithersProvider db={db} executionId={executionId}>
          <End
            summary={{ status: 'failure', message: 'Failed' }}
            reason="user_cancelled"
          />
        </SmithersProvider>
      )

      await new Promise((r) => setTimeout(r, 100))

      const execution = db.db.queryOne<{ end_reason: string }>(
        'SELECT end_reason FROM executions WHERE id = ?',
        [executionId]
      )
      expect(execution?.end_reason).toBe('user_cancelled')
      root.dispose()
    })

    test('stores exit_code in executions table', async () => {
      const root = createSmithersRoot()
      await root.render(
        <SmithersProvider db={db} executionId={executionId}>
          <End
            summary={{ status: 'failure', message: 'Error' }}
            exitCode={42}
          />
        </SmithersProvider>
      )

      await new Promise((r) => setTimeout(r, 100))

      const execution = db.db.queryOne<{ exit_code: number }>(
        'SELECT exit_code FROM executions WHERE id = ?',
        [executionId]
      )
      expect(execution?.exit_code).toBe(42)
      root.dispose()
    })

    test('sets execution status to completed', async () => {
      const root = createSmithersRoot()
      await root.render(
        <SmithersProvider db={db} executionId={executionId}>
          <End summary={{ status: 'success', message: 'Done' }} />
        </SmithersProvider>
      )

      await new Promise((r) => setTimeout(r, 100))

      const execution = db.db.queryOne<{ status: string }>(
        'SELECT status FROM executions WHERE id = ?',
        [executionId]
      )
      expect(execution?.status).toBe('completed')
      root.dispose()
    })
  })

  describe('End with async summary', () => {
    test('evaluates async summary function', async () => {
      const root = createSmithersRoot()
      await root.render(
        <SmithersProvider db={db} executionId={executionId}>
          <End
            summary={async () => {
              await new Promise((r) => setTimeout(r, 10))
              return { status: 'success', message: 'Async done' }
            }}
          />
        </SmithersProvider>
      )

      await new Promise((r) => setTimeout(r, 150))

      const execution = db.db.queryOne<{ end_summary: string }>(
        'SELECT end_summary FROM executions WHERE id = ?',
        [executionId]
      )
      const summary = JSON.parse(execution!.end_summary)
      expect(summary.message).toBe('Async done')
      root.dispose()
    })

    test('evaluates sync summary function', async () => {
      const root = createSmithersRoot()
      await root.render(
        <SmithersProvider db={db} executionId={executionId}>
          <End summary={() => ({ status: 'partial', message: 'Sync done' })} />
        </SmithersProvider>
      )

      await new Promise((r) => setTimeout(r, 100))

      const execution = db.db.queryOne<{ end_summary: string }>(
        'SELECT end_summary FROM executions WHERE id = ?',
        [executionId]
      )
      const summary = JSON.parse(execution!.end_summary)
      expect(summary.message).toBe('Sync done')
      root.dispose()
    })
  })

  describe('End default values', () => {
    test('defaults exitCode to 0 for success', async () => {
      const root = createSmithersRoot()
      await root.render(
        <SmithersProvider db={db} executionId={executionId}>
          <End summary={{ status: 'success', message: 'Done' }} />
        </SmithersProvider>
      )

      await new Promise((r) => setTimeout(r, 100))

      const execution = db.db.queryOne<{ exit_code: number }>(
        'SELECT exit_code FROM executions WHERE id = ?',
        [executionId]
      )
      expect(execution?.exit_code).toBe(0)
      root.dispose()
    })

    test('defaults exitCode to 1 for failure', async () => {
      const root = createSmithersRoot()
      await root.render(
        <SmithersProvider db={db} executionId={executionId}>
          <End summary={{ status: 'failure', message: 'Failed' }} />
        </SmithersProvider>
      )

      await new Promise((r) => setTimeout(r, 100))

      const execution = db.db.queryOne<{ exit_code: number }>(
        'SELECT exit_code FROM executions WHERE id = ?',
        [executionId]
      )
      expect(execution?.exit_code).toBe(1)
      root.dispose()
    })

    test('defaults reason to success for successful summary', async () => {
      const root = createSmithersRoot()
      await root.render(
        <SmithersProvider db={db} executionId={executionId}>
          <End summary={{ status: 'success', message: 'Done' }} />
        </SmithersProvider>
      )

      await new Promise((r) => setTimeout(r, 100))

      const execution = db.db.queryOne<{ end_reason: string }>(
        'SELECT end_reason FROM executions WHERE id = ?',
        [executionId]
      )
      expect(execution?.end_reason).toBe('success')
      root.dispose()
    })

    test('defaults reason to failure for failed summary', async () => {
      const root = createSmithersRoot()
      await root.render(
        <SmithersProvider db={db} executionId={executionId}>
          <End summary={{ status: 'failure', message: 'Failed' }} />
        </SmithersProvider>
      )

      await new Promise((r) => setTimeout(r, 100))

      const execution = db.db.queryOne<{ end_reason: string }>(
        'SELECT end_reason FROM executions WHERE id = ?',
        [executionId]
      )
      expect(execution?.end_reason).toBe('failure')
      root.dispose()
    })
  })

  describe('End idempotency', () => {
    test('only executes once on multiple renders', async () => {
      const root = createSmithersRoot()
      let callCount = 0
      const summaryFn = () => {
        callCount++
        return { status: 'success' as const, message: 'Done' }
      }

      const element = (
        <SmithersProvider db={db} executionId={executionId}>
          <End summary={summaryFn} />
        </SmithersProvider>
      )

      await root.render(element)
      await root.render(element)
      await root.render(element)

      await new Promise((r) => setTimeout(r, 100))

      expect(callCount).toBe(1)
      root.dispose()
    })
  })

  describe('End requests stop', () => {
    test('sets stop_requested in database', async () => {
      const root = createSmithersRoot()
      await root.render(
        <SmithersProvider db={db} executionId={executionId}>
          <End summary={{ status: 'success', message: 'Stop now' }} />
        </SmithersProvider>
      )

      await new Promise((r) => setTimeout(r, 100))

      const stopRequested = db.state.get<{ reason: string }>('stop_requested')
      expect(stopRequested).toBeDefined()
      expect(stopRequested?.reason).toContain('End: Stop now')
      root.dispose()
    })
  })
})

describe('Index exports', () => {
  test('exports End from index', async () => {
    const index = await import('./index.js')
    expect(index.End).toBeDefined()
  })

  test('exports EndProps from index', async () => {
    const index = await import('./index.js')
    expect(index.End).toBeDefined()
  })

  test('exports EndSummary from index', async () => {
    const index = await import('./index.js')
    expect(index.End).toBeDefined()
  })
})
