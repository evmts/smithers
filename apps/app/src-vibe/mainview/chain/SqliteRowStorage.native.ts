// E-7 (EK4402): console and structuredClone are platform calls VibeLang code does not make.
// SqliteRowStorage.vibe calls these exactly where SqliteRowStorage.ts calls the platform.

/** `console.warn(message, detail)`. */
export const warn = (message: string, detail: unknown): void => console.warn(message, detail)

/** `structuredClone(value)`. */
export const cloneStructured = <T>(value: T): T => structuredClone(value)
