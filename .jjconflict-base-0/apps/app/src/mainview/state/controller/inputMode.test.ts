import { memoryStorage } from '../TestFixtures'
import { expect, test } from 'bun:test'
import { createAppStore } from '../AppStore'
import { INPUT_MODES } from '../InputMode'
import { createInputModeController } from './inputMode'

for (const mode of INPUT_MODES) test(`${mode} persists without opening Chat`, async () => {
  const storage = memoryStorage()
  const store = await createAppStore({ kind: 'localStorage', storage })
  let opens = 0
  const modes = createInputModeController(store, {
    actor: () => 'user', openChat: async () => { opens++; store.dispatch({ type: 'palette.toggled', actor: 'user', open: true }) },
  })
  await modes.setInputMode(mode)
  expect(opens).toBe(0)
  expect(store.session().paletteOpen).not.toBe(true)
  await modes.openChat()
  expect(opens).toBe(1)
  expect(store.session().inputMode).toBe(mode)
  await store.dispose?.()
  const restored = await createAppStore({ kind: 'localStorage', storage })
  expect(restored.session().inputMode).toBe(mode)
  await restored.dispose?.()
})

for (const mode of [...INPUT_MODES, 'dictation'] as const) test(`saved ${mode} and a stale capture remain readable and migrate without losing the draft`, async () => {
  const storage = memoryStorage()
  const first = await createAppStore({ kind: 'localStorage', storage })
  await first.dispatch({ type: 'input.mode.changed', actor: 'user', mode }).isPersisted.promise
  await first.dispatch({ type: 'dictation.changed', actor: 'user', listening: true }).isPersisted.promise
  await first.dispatch({ type: 'composer.changed', actor: 'user', draft: 'keep my saved draft' }).isPersisted.promise
  await first.dispose?.()

  const restored = await createAppStore({ kind: 'localStorage', storage })
  expect(restored.session().inputMode).toBe(mode)
  expect(restored.session().dictating).toBe(true)
  const modes = createInputModeController(restored, {
    actor: () => 'user', openChat: async () => { restored.dispatch({ type: 'palette.toggled', actor: 'user', open: true }) },
  })
  const expected = mode === 'dictation' ? 'normal' : mode
  expect(restored.session().inputMode).toBe(expected)
  expect(restored.session().dictating).toBe(false)
  expect(restored.session().paletteOpen).not.toBe(true)
  expect(restored.session().draft).toBe('keep my saved draft')
  await modes.openChat()
  expect(restored.session().paletteOpen).toBe(true)
  await restored.dispose?.()

  const reloaded = await createAppStore({ kind: 'localStorage', storage })
  expect(reloaded.session().inputMode).toBe(expected)
  expect(reloaded.session().dictating).toBe(false)
  expect(reloaded.session().draft).toBe('keep my saved draft')
  await reloaded.dispose?.()
})
