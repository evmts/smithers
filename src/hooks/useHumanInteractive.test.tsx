import { test, expect, beforeAll, afterAll, describe } from 'bun:test'
import { createSmithersRoot } from '../reconciler/root.js'
import { createSmithersDB, type SmithersDB } from '../db/index.js'
import { SmithersProvider } from '../components/SmithersProvider.js'
import { useHumanInteractive } from './useHumanInteractive.js'
import { useMount } from '../reconciler/hooks.js'

describe('useHumanInteractive', () => {
  let db: SmithersDB
  let executionId: string
  const root = createSmithersRoot()

  beforeAll(async () => {
    db = await createSmithersDB({ reset: true })
    executionId = await db.execution.start('test-human-interactive', 'hook.test.tsx')
  })

  afterAll(() => {
    root.dispose()
    db.close()
  })

  test('requestAsync resolves when session completes', async () => {
    let capturedPromise: Promise<any> | null = null

    function TestComponent(props: { onPromise: (p: Promise<any>) => void }) {
      const { requestAsync } = useHumanInteractive()
      useMount(() => {
        const promise = requestAsync('Review deployment')
        props.onPromise(promise)
      })
      return null
    }

    await root.render(
      <SmithersProvider db={db} executionId={executionId}>
        <TestComponent onPromise={(p) => { capturedPromise = p }} />
      </SmithersProvider>
    )

    expect(capturedPromise).not.toBeNull()

    const pending = db.human.listPending()
    expect(pending.length).toBeGreaterThan(0)

    const session = pending.find((row) => row.type === 'interactive_session')
    expect(session).toBeDefined()

    db.human.completeInteractive(session!.id, 'completed', { approved: true }, {
      duration: 42,
    })

    const result = await capturedPromise!
    expect(result.outcome).toBe('completed')
    expect(result.response).toEqual({ approved: true })
    expect(result.duration).toBe(42)
  })
})
