// E-7 (EK4402): `Buffer.byteLength` is a Node platform API; reviewActions.vibe calls
// this wrapper exactly where reviewActions.ts calls it.

/** `Buffer.byteLength(text)`. */
export const byteLength = (text: string): number => Buffer.byteLength(text)
