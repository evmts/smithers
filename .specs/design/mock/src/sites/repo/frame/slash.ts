/* Views register in an effect and return the disposer. Later registrations override earlier ones until disposed. */
import { useSyncExternalStore } from "react"
import type { Flags } from "../../core/mock"

export type SlashValues = Record<string, string>
export type SlashField = {
  name: string
  label: string
  type?: "text" | "number" | "email" | "url" | "textarea"
  required?: boolean
  placeholder?: string
  min?: number
  options?: string[]
}
export type SlashContext = { flags: Flags; location: string; closeAsk: () => void }
export type SlashCommand = {
  /** One line shown when the person types /. Defaults to the command's words. */
  purpose?: string
  fields: SlashField[]
  /** Defaults to a confirmation. Use false for navigation or opening an existing form/confirmation. */
  confirm?: boolean | string
  /** Defaults to member. Public commands also work for signed-out visitors. */
  access?: "public" | "signed-in" | "member"
  /** Browser/account actions require a person's click. Ask shows this reason and the action button. */
  userOnly?: string
  run: (values: SlashValues, context: SlashContext) => void | Promise<void>
}
export type RegisteredSlash = SlashCommand & { name: string; purpose: string }

const commands = new Map<string, RegisteredSlash[]>()
const listeners = new Set<() => void>()
let snapshot: RegisteredSlash[] = []
const update = () => {
  snapshot = [...commands.values()].map(entries => entries[entries.length - 1])
    .sort((a, b) => a.name.localeCompare(b.name))
  listeners.forEach(listener => listener())
}
const normalize = (name: string) => `/${name.replace(/^\//, "")}`

export const registerSlash = (name: string, command: SlashCommand): (() => void) => {
  const normalized = normalize(name)
  if (!/^\/[\w.-]+$/.test(normalized)) throw new Error("A slash command needs a name without spaces.")
  const entry: RegisteredSlash = {
    ...command, name: normalized,
    purpose: command.purpose ?? normalized.slice(1).replace(/[.-]/g, " ")
  }
  const entries = commands.get(normalized) ?? []
  commands.set(normalized, [...entries, entry])
  update()
  return () => {
    const registered = commands.get(normalized)
    if (!registered?.includes(entry)) return
    const remaining = registered.filter(value => value !== entry)
    if (remaining.length) commands.set(normalized, remaining)
    else commands.delete(normalized)
    update()
  }
}

export const getSlash = (name: string): RegisteredSlash | undefined => commands.get(normalize(name))?.at(-1)
const subscribe = (listener: () => void) => {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}
export const useSlashCommands = () => useSyncExternalStore(subscribe, () => snapshot, () => snapshot)

/** Positional fields; the final field keeps the remaining words. Quotes group earlier fields. */
export const parseSlash = (line: string): { name: string; values: SlashValues } => {
  const [name = "", ...parts] = line.trim().match(/"(?:\\.|[^"\\])*"|'[^']*'|\S+/g) ?? []
  const command = getSlash(name)
  const args = parts.map(part => {
    if (part.startsWith('"') && part.endsWith('"')) {
      try { return String(JSON.parse(part)) } catch { return part.slice(1, -1) }
    }
    return part.startsWith("'") && part.endsWith("'") ? part.slice(1, -1) : part
  })
  const values: SlashValues = {}
  command?.fields.forEach((field, index) => {
    values[field.name] = index === command.fields.length - 1 ? args.slice(index).join(" ") : args[index] ?? ""
  })
  return { name, values }
}

export const missingSlashFields = (command: SlashCommand, values: SlashValues): SlashField[] => command.fields.filter(field => {
  const value = values[field.name]?.trim()
  if (!value) return field.required !== false
  if (field.type === "number" && (!Number.isFinite(Number(value)) || (field.min !== undefined && Number(value) < field.min))) return true
  return Boolean(field.options && !field.options.includes(value))
})
