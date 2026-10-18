import type { RegisteredSlash, SlashValues } from "./slash"

/** A plain request uses the registered act's fields, access check and confirmation. */
export const agentAct = (text: string, commands: RegisteredSlash[]): { name: string; values: SlashValues } | undefined => {
  const request = text.trim().replace(/^(?:please\s+|can you\s+)/i, "")
  const match = /^(cancel|retry|implement|reproduce|close|assign|fork|rebase|archive|open|run|connect|disconnect|save|edit|draft|publish|request)\b\s*(.*)$/i.exec(request)
  if (!match) return
  const verb = match[1].toLowerCase()
  const rest = match[2]
  const families: Array<[RegExp, string]> = [
    [/\b(?:run-[\w-]+|run)\b/i, "run"], [/\bissue\b/i, "issue"],
    [/\bbranch\b/i, "branch"], [/\bsandbox\b/i, "box"], [/\bflow\b/i, "flow"],
    [/\b(?:model|claude|codex)\b/i, "model"], [/\bsettings?\b/i, "settings"],
    [/\bwiki\b/i, "wiki"], [/\brelease\b/i, "release"], [/\breview\b/i, "pull"]
  ]
  const family = families.find(([pattern]) => pattern.test(rest))?.[1]
  const action = ({ reproduce: "repro", request: "review" } as Record<string, string>)[verb] ?? verb
  const name = family ? `/${family}.${action}` : undefined
  const command = commands.find(command => command.name === name)
  if (!command) return
  // Fill only unambiguous identifiers. Missing inputs stay in the existing form.
  const values: SlashValues = {}
  for (const field of command.fields) {
    if (/^(?:run|id)$/.test(field.name)) values[field.name] = rest.match(/run-[\w-]+/)?.[0] ?? ""
    else if (/^(?:issue|number|pull)$/.test(field.name)) values[field.name] = rest.match(/(?:issue|pull(?: request)?|#)\s*#?(\d+)/i)?.[1] ?? ""
    else if (/^(?:branch|flow|provider)$/.test(field.name)) values[field.name] = rest.match(new RegExp(`(?:${field.name}|model)\\s+([\\w./-]+)`, "i"))?.[1] ?? rest.match(/\b(claude|codex)\b/i)?.[1]?.toLowerCase() ?? ""
  }
  return { name: command.name, values }
}
