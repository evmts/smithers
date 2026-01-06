/**
 * Parse JSON props passed on the command line.
 */
export function parseProps(value?: string): Record<string, unknown> | undefined {
  if (value === undefined) {
    return undefined
  }

  try {
    const parsed = JSON.parse(value)

    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      throw new Error('Props must be a JSON object')
    }

    return parsed as Record<string, unknown>
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`Invalid --props value. ${message}`)
  }
}
