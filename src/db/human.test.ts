import { test, expect, beforeAll, afterAll, describe } from 'bun:test'
import { createSmithersDB, type SmithersDB } from './index.js'

describe('Human module interactive sessions', () => {
  let db: SmithersDB
  let executionId: string

  beforeAll(async () => {
    db = await createSmithersDB({ reset: true })
    executionId = await db.execution.start('test-human', 'human.test.tsx')
  })

  afterAll(() => {
    db.close()
  })

  test('requestInteractive() stores session config and pending status', () => {
    const id = db.human.requestInteractive('Review changes', {
      model: 'sonnet',
      captureTranscript: true,
      blockOrchestration: true,
    })

    const interaction = db.human.get(id)
    expect(interaction).not.toBeNull()
    expect(interaction!.type).toBe('interactive_session')
    expect(interaction!.status).toBe('pending')
    expect(interaction!.session_config?.model).toBe('sonnet')
    expect(interaction!.session_config?.captureTranscript).toBe(true)
  })

  test('listPending() supports execution scoping', () => {
    const id = db.human.requestInteractive('Scope check', {})

    const scoped = db.human.listPending()
    expect(scoped.find((row) => row.id === id)).toBeDefined()

    const all = db.human.listPending('*')
    expect(all.find((row) => row.id === id)).toBeDefined()

    const other = db.human.listPending('does-not-exist')
    expect(other.length).toBe(0)
  })

  test('completeInteractive() records outcome metadata', () => {
    const id = db.human.requestInteractive('Finalize decision', {
      captureTranscript: true,
    })

    db.human.completeInteractive(id, 'completed', { approved: true }, {
      transcript: 'Decision: approved',
      duration: 1200,
    })

    const interaction = db.human.get(id)
    expect(interaction).not.toBeNull()
    expect(interaction!.status).toBe('completed')
    expect(interaction!.response).toEqual({ approved: true })
    expect(interaction!.session_transcript).toBe('Decision: approved')
    expect(interaction!.session_duration).toBe(1200)
  })

  test('cancelInteractive() marks pending sessions as cancelled', () => {
    const id = db.human.requestInteractive('Cancel me', {})

    db.human.cancelInteractive(id)

    const interaction = db.human.get(id)
    expect(interaction).not.toBeNull()
    expect(interaction!.status).toBe('cancelled')
  })
})
