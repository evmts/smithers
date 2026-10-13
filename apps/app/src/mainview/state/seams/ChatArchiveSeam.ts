import { z } from "zod"
import type { ControllerContext } from "../controller/context"
import { TOAST_SUPERSEDED } from "../controller/failures"
import { SharedConversationSchema, type SharedConversation } from "./SharedConversationSeam"

/** One archived chat as the host lists it (`GET /api/conversation-archives`, #3827). */
export const ChatArchiveSchema = z.object({
  id: z.string().min(1),
  /** `owner/name`; null is the no-repository group. */
  repository: z.string().nullable(),
  branch: z.string().nullable(),
  /** The first prompt's first line until the model writes a title; may be empty. */
  title: z.string(),
  /** Null until the model writes it, and forever when it never does. */
  summary: z.string().nullable(),
  runs: z.array(z.object({ repo: z.string(), runId: z.string(), workspaceId: z.string().optional() })),
  entries: z.number().int().nonnegative(),
  first_at: z.number(),
  last_at: z.number(),
  archived_at: z.number(),
  archived_by: z.string().optional()
})
export type ChatArchive = z.infer<typeof ChatArchiveSchema>

const ListSchema = z.object({ archives: z.array(ChatArchiveSchema) })
const ArchivedSchema = z.object({ archive: ChatArchiveSchema.nullable() })
const OpenedSchema = z.object({ archive: ChatArchiveSchema, conversation: SharedConversationSchema })

export interface ChatArchiveSnapshot {
  /** Undefined until the first listing answers. */
  readonly archives?: ReadonlyArray<ChatArchive>
  /** Entries of the archives the person opened, by archive id. */
  readonly opened: Readonly<Record<string, SharedConversation>>
  readonly error?: "History unavailable"
}

/** What history groups an archived chat by: the header's repository and branch. */
export interface ArchiveLabel { readonly repository: string | null; readonly branch: string | null }

export interface ChatArchiveOptions {
  /** The live conversation's branch key, as its seam addresses it. */
  readonly branch: () => string
  readonly label: () => ArchiveLabel
  /** The live conversation rereads after its chat moved into history. */
  readonly reread: () => Promise<void> | void
}

const EMPTY: ChatArchiveSnapshot = { opened: {} }

/** Archived chats stay on the host; account generations fence every answer. */
export function createChatArchiveSeam(ctx: ControllerContext, options: ChatArchiveOptions) {
  let snapshot = EMPTY, generation = 0, disposed = false
  let archiving: Promise<unknown> | undefined
  const listeners = new Set<() => void>()
  const publish = (next: ChatArchiveSnapshot) => { snapshot = next; for (const listener of listeners) listener() }
  const valid = (revision: number) => !disposed && !ctx.disposed && generation === revision
  const signedIn = () => ctx.store.collections.identitySessions.get("identity")?.state === "signed-in" && !!ctx.accountOwner()

  const list = async (): Promise<void> => {
    const revision = generation
    if (!signedIn()) return
    // A failed refresh keeps the rows already shown.
    const unavailable = () => { if (valid(revision)) publish({ ...snapshot, error: "History unavailable" }) }
    try {
      const response = await ctx.boundedFetch(`${ctx.baseUrl}/api/conversation-archives`, { credentials: "same-origin" })
      if (!response.ok) return unavailable()
      const { archives } = ListSchema.parse(await response.json())
      if (valid(revision)) publish({ archives, opened: snapshot.opened })
    } catch { unavailable() }
  }

  /** Loads one archived chat's entries; a refusal is the sentence the person reads. */
  const open = async (id: string): Promise<string | undefined> => {
    const revision = generation
    if (!signedIn()) return "History unavailable"
    if (snapshot.opened[id] !== undefined) return undefined
    try {
      const response = await ctx.boundedFetch(`${ctx.baseUrl}/api/conversation-archives/${encodeURIComponent(id)}`, { credentials: "same-origin" })
      if (!response.ok) return "Archived chat unavailable"
      const { conversation } = OpenedSchema.parse(await response.json())
      if (valid(revision)) publish({ ...snapshot, opened: { ...snapshot.opened, [id]: conversation } })
      return undefined
    } catch { return "Archived chat unavailable" }
  }

  /**
   * Acknowledges at once; the toast runs until the host has moved the chat.
   * A repeated ask while one is in flight joins it instead of sending twice.
   */
  const archive = (): string | { readonly value: string } => {
    if (!signedIn()) return "Archive unavailable"
    if (archiving !== undefined) return { value: "Archive requested" }
    const revision = generation, branch = options.branch(), label = options.label()
    const current = () => valid(revision)
    const work = ctx.withToast("chat.archive", "Archiving chat", "Archived", async () => {
      let response: Response
      try {
        response = await ctx.boundedFetch(`${ctx.baseUrl}/api/conversations/${encodeURIComponent(branch)}/archive`, {
          method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ repository: label.repository ?? "", branch: label.branch ?? "" })
        })
      } catch { return current() ? "Archive unavailable" : TOAST_SUPERSEDED }
      if (!current()) return TOAST_SUPERSEDED
      if (response.status === 409) return "A prompt is running or queued"
      if (!response.ok) return "Archive unavailable"
      let archived: ChatArchive | null
      try { archived = ArchivedSchema.parse(await response.json()).archive } catch { return "Archive unavailable" }
      if (!current()) return TOAST_SUPERSEDED
      if (archived === null) return "Nothing to archive"
      publish({ ...snapshot, archives: [archived, ...(snapshot.archives ?? []).filter(row => row.id !== archived.id)], error: undefined })
      await options.reread()
      return true
    }, false, current)
    archiving = work
    void work.catch(() => {}).finally(() => { if (archiving === work) archiving = undefined })
    return { value: "Archive requested" }
  }

  const reset = () => { ++generation; archiving = undefined; publish(EMPTY) }
  const stopAccount = ctx.onAccountChange(reset)
  ctx.onDispose(() => { disposed = true; stopAccount(); listeners.clear() })
  return {
    get: () => snapshot,
    subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener) } },
    list, open, archive
  }
}
export type ChatArchiveSeam = ReturnType<typeof createChatArchiveSeam>

/** A branch of a repository in the history tree; a null name holds chats archived with no branch. */
export interface HistoryBranch { readonly branch: string | null; readonly current: boolean; readonly chats: ReadonlyArray<ChatArchive> }
/** A repository in the history tree; a null name is the no-repository group. */
export interface HistoryRepository { readonly repository: string | null; readonly current: boolean; readonly branches: ReadonlyArray<HistoryBranch> }

/**
 * Archived chats as repository, then branch, then chat. The header's
 * repository and branch come first; the rest follow by their newest chat, and
 * chats within a branch are newest first.
 */
export const historyTree = (archives: ReadonlyArray<ChatArchive>, selected: ArchiveLabel): ReadonlyArray<HistoryRepository> => {
  const newest = (chats: ReadonlyArray<ChatArchive>) => Math.max(...chats.map(chat => chat.archived_at))
  const order = <T extends { readonly current: boolean; readonly chats: ReadonlyArray<ChatArchive> }>(rows: Array<T>, name: (row: T) => string | null) =>
    rows.sort((a, b) => Number(b.current) - Number(a.current) || newest(b.chats) - newest(a.chats) || (name(a) ?? "").localeCompare(name(b) ?? ""))
  const repositories = new Map<string | null, Map<string | null, Array<ChatArchive>>>()
  for (const archive of archives) {
    const branches = repositories.get(archive.repository) ?? new Map<string | null, Array<ChatArchive>>()
    branches.set(archive.branch, [...(branches.get(archive.branch) ?? []), archive])
    repositories.set(archive.repository, branches)
  }
  return order([...repositories.entries()].map(([repository, branches]) => {
    const current = repository === selected.repository
    const rows = order([...branches.entries()].map(([branch, chats]) => ({
      branch, current: current && branch === selected.branch,
      chats: [...chats].sort((a, b) => b.archived_at - a.archived_at || a.id.localeCompare(b.id))
    })), row => row.branch)
    return { repository, current, branches: rows, chats: rows.flatMap(row => row.chats) }
  }), row => row.repository).map(({ repository, current, branches }) => ({ repository, current, branches }))
}

/** The line a chat lists under: its title, else its summary's start, else its date. */
export const archiveTitle = (archive: ChatArchive): string =>
  archive.title.trim() || archive.summary?.trim().split(/(?<=[.!?])\s/)[0] || new Date(archive.archived_at).toISOString().slice(0, 16).replace("T", " ") + " UTC"
