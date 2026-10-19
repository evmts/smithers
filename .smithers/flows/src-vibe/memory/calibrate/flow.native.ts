// E-7: the platform read memory/calibrate/flow.vibe makes at module scope. VibeLang code does not
// call platform APIs (EK4402); this wrapper is the one call.
export const cwd = (): string => process.cwd()
