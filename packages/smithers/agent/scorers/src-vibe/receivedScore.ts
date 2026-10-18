// C-1: score inspection must catch caller-owned proxy/getter defects.
export const receivedScore = (value: unknown): string => {
  try {
    return typeof value === "object" && value !== null && "score" in value
      ? `, received ${String((value as { readonly score: unknown }).score)}`
      : ""
  } catch {
    return ""
  }
}

