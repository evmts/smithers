export const formSubject = (location: string): "bug" | "issue" | "settings" | "flow" | "release" | "branch" | "wiki" | undefined => {
  const [path, raw] = location.split("?")
  const query = new URLSearchParams(raw)
  if (/\/bug$/.test(path)) return "bug"
  if (/\/issues\/new$/.test(path)) return "issue"
  if (/\/settings(?:\/|$)/.test(path)) return "settings"
  if (/\/flows(?:\/|$)/.test(path) && (query.has("run") || query.get("act") === "run")) return "flow"
  if (/\/releases$/.test(path) && query.get("draft") === "1") return "release"
  if (/\/branches$/.test(path) && ["new", "fork"].includes(query.get("dialog") ?? "")) return "branch"
  if (/\/wiki(?:\/|$)/.test(path) && (query.get("edit") === "1" || query.get("new") === "1")) return "wiki"
}

export const invokedAction = (location: string) => {
  const query = new URLSearchParams(location.split("?")[1])
  return ["act", "dialog", "confirm", "run", "merge", "fix", "review", "accept", "history"].some(key => query.has(key))
}
