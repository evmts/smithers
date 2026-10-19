// E-7 (EK4402): process.env is a platform API that VibeLang code does not read directly.
// wiki/runtime.vibe reads the host environment through this, exactly as wiki/runtime.ts does.

/** `process.env`. */
export const env = (): NodeJS.ProcessEnv => process.env
