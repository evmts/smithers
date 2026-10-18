// VibeLang catch bypasses native TextDecoder defects; preserve synchronous UTF-8 refusal.
export const decodedText = (bytes: Uint8Array, path: string): string => {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes)
  } catch {
    throw new Error(`${path} is not valid UTF-8`)
  }
}
