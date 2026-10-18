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
  /**
   * A listing is in flight. It is not an answer, so a card reading one says
   * so rather than claiming this identity archived nothing.
   */
  readonly reading?: boolean
  /**
   * What a read of one archive's entries is doing, by archive id: absent once
   * its entries are in hand, and never an empty conversation.
   */
  readonly reads?: Readonly<Record<string, "reading" | "unavailable">>
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

/** One archive's read, retired from the record it is keyed in. */
const without = (reads: ChatArchiveSnapshot["reads"], id: string): Readonly<Record<string, "reading" | "unavailable">> => {
  const rest = { ...reads }
  delete rest[id]
  return rest
}

/** Archived chats stay on the host; account generations fence every answer. */
export function createChatArchiveSeam(ctx: ControllerContext, options: ChatArchiveOptions) {
  let snapshot = EMPTY, generation = 0, disposed = false
  let archiving: Promise<unknown> | undefined
  /** The listing in flight, and what the last one for this account answered. */
  let listing: Promise<void> | undefined
  let listed: "unread" | "read" | "unavailable" = "unread"
  /** One read per archive id, so a second ask for the same chat joins the first. */
  const opening = new Map<string, Promise<string | undefined>>()
  const listeners = new Set<() => void>()
  const publish = (next: ChatArchiveSnapshot) => { snapshot = next; for (const listener of listeners) listener() }
  /** A disposed seam reads nothing more and publishes nothing more. */
  const active = () => !disposed && !ctx.disposed
  const valid = (revision: number) => active() && generation === revision
  const signedIn = () => ctx.store.collections.identitySessions.get("identity")?.state === "signed-in" && !!ctx.accountOwner()

  const list = async (): Promise<void> => {
    const revision = generation
    if (!active() || !signedIn()) return
    // One read answers every asker: a mount, `/history` and a retry join the request in flight.
    if (listing !== undefined) return listing
    if (snapshot.reading !== true) publish({ ...snapshot, reading: true })
    // A failed refresh keeps the rows already shown.
    const unavailable = () => { if (valid(revision)) { listed = "unavailable"; publish({ ...snapshot, reading: undefined, error: "History unavailable" }) } }
    const work = (async (): Promise<void> => {
      try {
        const response = await ctx.boundedFetch(`${ctx.baseUrl}/api/conversation-archives`, { credentials: "same-origin" })
        if (!response.ok) return unavailable()
        const { archives } = ListSchema.parse(await response.json())
        if (valid(revision)) { listed = "read"; publish({ ...snapshot, archives, reading: undefined, error: undefined }) }
      } catch { unavailable() }
    })()
    listing = work
    try { await work } finally { if (listing === work) listing = undefined }
  }

  /** Loads one archived chat's entries; a refusal is the sentence the person reads. */
  const open = async (id: string): Promise<string | undefined> => {
    const revision = generation
    if (!active() || !signedIn()) return "History unavailable"
    if (snapshot.opened[id] !== undefined) return undefined
    const running = opening.get(id)
    if (running !== undefined) return running
    const mark = (state: "reading" | "unavailable") => { if (valid(revision)) publish({ ...snapshot, reads: { ...snapshot.reads, [id]: state } }) }
    const work = (async (): Promise<string | undefined> => {
      try {
        const response = await ctx.boundedFetch(`${ctx.baseUrl}/api/conversation-archives/${encodeURIComponent(id)}`, { credentials: "same-origin" })
        if (!response.ok) return "Archived chat unavailable"
        const { conversation } = OpenedSchema.parse(await response.json())
        if (valid(revision)) publish({ ...snapshot, opened: { ...snapshot.opened, [id]: conversation }, reads: without(snapshot.reads, id) })
        return undefined
      } catch { return "Archived chat unavailable" }
    })()
    opening.set(id, work)
    mark("reading")
    try {
      const refusal = await work
      if (refusal !== undefined) mark("unavailable")
      return refusal
    } finally { if (opening.get(id) === work) opening.delete(id) }
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

  /**
   * The index this identity reaches, and one archive's entries when a card
   * holds that chat open: read unless they are in hand, in flight, or a read
   * already settled them. This is what a render may call — a request in
   * flight is joined, an answer in hand is a no-op, and a failed read waits
   * for its retry — so a mount, a remount and StrictMode's second
   * subscription produce one read, never a loop.
   */
  const ensure = (selected?: string): void => {
    if (!active() || !signedIn()) return
    if (listed === "unread" && listing === undefined) void list()
    if (selected === undefined || snapshot.opened[selected] !== undefined) return
    if (snapshot.reads?.[selected] === undefined && !opening.has(selected)) void open(selected)
  }

  /** Asks again after a failed read: the index, or one archive's entries. */
  const retry = (selected?: string): void => {
    if (!active() || !signedIn()) return
    if (selected === undefined) { void list(); return }
    if (snapshot.reads?.[selected] === "unavailable") publish({ ...snapshot, reads: without(snapshot.reads, selected) })
    void open(selected)
  }

  const reset = () => { ++generation; archiving = undefined; listing = undefined; listed = "unread"; opening.clear(); publish(EMPTY) }
  const stopAccount = ctx.onAccountChange(reset)
  ctx.onDispose(() => { disposed = true; stopAccount(); listeners.clear(); listing = undefined; opening.clear() })
  return {
    get: () => snapshot,
    subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener) } },
    list, open, archive, ensure, retry
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
