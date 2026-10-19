// E-7/EK4402: Buffer.byteLength is a Node platform API, which VibeLang code does not call directly.
export const utf8ByteLength = (value: string): number => Buffer.byteLength(value, "utf8")
