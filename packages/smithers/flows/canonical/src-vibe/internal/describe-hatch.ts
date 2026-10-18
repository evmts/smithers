// VibeLang catch bypasses defects from throwing getters and coercions.
export const describeImpl = (cause: unknown): string => {
  try {
    return String(cause instanceof Error ? cause.message : cause).slice(0, 1024)
  } catch {
    return "Unable to describe thrown value"
  }
}
