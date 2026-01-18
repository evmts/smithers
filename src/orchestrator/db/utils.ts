// Shared utilities for Smithers DB modules

// Helper to generate UUIDs
export const uuid = () => crypto.randomUUID()

// Helper to get current ISO timestamp
export const now = () => new Date().toISOString()

// Helper to safely parse JSON
export const parseJson = <T>(str: string | null | undefined, defaultValue: T): T => {
  if (!str) return defaultValue
  try {
    return JSON.parse(str)
  } catch {
    return defaultValue
  }
}
