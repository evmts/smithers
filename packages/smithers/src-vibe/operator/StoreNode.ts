// E-7 (EK4402): process.env is a platform API that VibeLang code does not read
// directly. Store.vibe's localRoot falls back to it here, exactly as Store.ts does.
import type * as Environment from "../Environment.ts"

/** The host process environment. */
export const hostEnvironment = (): Environment.Source => process.env
