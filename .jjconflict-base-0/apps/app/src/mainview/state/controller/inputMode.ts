import type { Actor } from '../AppState'
import type { AppStore } from '../AppStore'
import type { InputMode } from '../InputMode'

/** Preferences are local; retired dictation state remains readable on upgrade. */
export function createInputModeController(store: AppStore, effects: {
  actor: () => Actor
  openChat: () => Promise<void>
}) {
  if (store.session().inputMode === 'dictation') {
    store.dispatch({ type: 'input.mode.changed', actor: 'system', mode: 'normal' })
  }
  if (store.session().dictating) {
    store.dispatch({ type: 'dictation.changed', actor: 'system', listening: false })
  }
  return {
    async setInputMode(mode: InputMode) {
      await store.dispatch({ type: 'input.mode.changed', actor: effects.actor(), mode }).isPersisted.promise
    },
    openChat: effects.openChat,
  }
}
