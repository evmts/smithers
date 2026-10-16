export const INPUT_MODES = ['normal', 'vim'] as const
export type InputMode = typeof INPUT_MODES[number]
/** Decode-only: preferences and journal events saved before dictation was deferred. */
export const HISTORICAL_INPUT_MODES = [...INPUT_MODES, 'dictation'] as const
export type HistoricalInputMode = typeof HISTORICAL_INPUT_MODES[number]
export const inputModeLabel = (mode: HistoricalInputMode) => mode === 'vim' ? 'Vim' : 'Normal'
