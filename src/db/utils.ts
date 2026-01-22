export const uuid = () => crypto.randomUUID()

export const now = () => new Date().toISOString()

export const parseJson = <T>(str: string | null | undefined, defaultValue: T): T => {
  if (!str) return defaultValue
  try {
    return JSON.parse(str)
  } catch {
    return defaultValue
  }
}
