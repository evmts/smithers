import { expect, test } from 'bun:test'
import { createAppStore } from '../state/AppStore'
import { scopedControllers } from '../state/ControllerTestScope'
import { memoryStorage, silentAgent } from '../state/TestFixtures'
import { FLOW_NAMES } from './FlowName'
import { INPUT_MODES } from '../state/InputMode'
import { nameOf } from './registry'
import { generateCatalog } from '../../../scripts/catalog-mvp'
import { CardSchema, MessageSchema, ToastSchema } from '../state/AppState'

const createAppController = scopedControllers()

test('dictation has no menu, command, or shipped operation', async () => {
  const store = await createAppStore({ kind: 'localStorage', storage: memoryStorage() })
  const controller = createAppController(store, silentAgent)
  try {
    expect(INPUT_MODES).toEqual(['normal', 'vim'])
    expect(FLOW_NAMES).not.toContain('chat.dictate')
    expect(controller.commands.entries().map(nameOf)).not.toContain('chat.dictate')
    expect(generateCatalog().map(row => row.name)).not.toContain('chat.dictate')
    expect((await controller.commands.run('chat.dictate')).status).toBe('unknown-command')
    expect((await controller.commands.run('input.mode', 'dictation')).status).toBe('failed')
    expect(store.session().inputMode).toBe('normal')
    expect(store.session().paletteOpen).not.toBe(true)
  } finally { await controller.dispose(); await store.dispose?.() }
})

test('saved dictation forms and actions decode without executable controls', () => {
  const saved = CardSchema.parse({ id: 'dictation-form', kind: 'flow-form', title: 'Dictation',
    status: 'active', createdAt: 1, ordinal: 1, payload: { flow: 'chat.dictate' } })
  expect(saved).toMatchObject({ id: 'dictation-form', kind: 'retired', title: 'Dictation', status: 'acted' })
  for (const schema of [MessageSchema.shape.action, ToastSchema.shape.action]) {
    expect(schema.parse({ flow: 'chat.dictate', label: 'Dictate' })).toBeUndefined()
    expect(schema.parse({ flow: 'chat.open', label: 'Chat' })).toMatchObject({ flow: 'chat.open', label: 'Chat' })
  }
})
