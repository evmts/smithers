// E-7 (EK4402): Buffer is a Node platform API that VibeLang code does not call
// directly. BoundedEvents.vibe charges an event's encoded bytes through this
// function, exactly as BoundedEvents.ts does.

/** The UTF-8 byte length of `text`. */
export const utf8ByteLength = (text: string): number => Buffer.byteLength(text, "utf8")
