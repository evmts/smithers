import { Migrations } from "@smthrs/effect-tanstack-db"
import { Notice, Pending } from "../features/attention/schema"
import { Confirmed } from "../features/auth/schema"
import { Asking, Message, Unsent } from "../features/chat/schema"
import { Sending as TextSending, TextUpdate } from "../features/coedit/schema"
import { Draft as FlowDraft, FlowRow } from "../features/flows-ui/schema"
import { CuratedRow, HomeRow } from "../features/home/rows"
import {
  Comment,
  Draft as IssueDraft,
  Item,
  Requested as IssueRequested,
  Sending as IssueSending,
  SyncRow,
  TriageSettings,
  WriteRow,
} from "../features/issues/schema"
import { CheckRow, PullCommitRow, PullRow, ReviewRow } from "../features/pulls/schema"
import { Repository } from "../features/repo/schema"
import { AlertChannel, AlertDelivery, Seen, SpendAlert } from "../features/spend/schema"
import { SteerSending, SteerSent } from "../features/runs/schema"
import { Run } from "../features/status/schema"
import { Preference } from "../features/theme/schema"
import { Summary } from "../features/timeline/store"
import { Draft as TodoDraft, Requested as TodoRequested, Sending as TodoSending, Todo, TodoRequest } from "../features/todos/schema"
import { View } from "../features/views/schema"
import { AuthConfirmedV1, ChatDraftV1, IssueSendingV1, IssueSendingV2, RequestedV1 } from "./history"

// Every store this device keeps, and its history (decision 0021): each persisted collection, synced or local, and
// each payload the outbox carries. A store's collection opens only at the version declared here (the app's
// `Persistence` refuses any other), the engine worker brings the device store to these versions before any tab reads
// it (`device/prepare`), and the outbox upgrades the writes an older build stored. src/device/schemas.test.ts checks
// this file against schemas.lock.json: a schema that changes needs a new version, and a local store or payload a
// migration to it. Synced rows are never migrated: a new version drops them and they sync again.

// --- Local: rows only this device has ---

/** Questions the server refused or the outbox couldn't take (src/features/chat/store.ts). */
export const ChatUnsentStore = Migrations.local({ id: "chat-unsent", versions: [Unsent], getKey: (row) => row.id })

/**
 * The composer's draft in each conversation whose prompt isn't shared (src/features/chat/store.ts); on a branch its
 * owner shared, the branch's prompt adopts it (src/device/history.ts).
 */
export const ChatDraftsStore = Migrations.local({ id: "chat-drafts", versions: [ChatDraftV1], getKey: (row) => row.id })

/**
 * Issue writes the server took or refused. Version 2 (after `7b96f878`): who acts is the server's to read from the
 * request, so a row no longer says (`via`).
 */
export const IssueRequestedStore = Migrations.local({
  id: "issue-requested",
  versions: [RequestedV1, IssueRequested],
  migrations: [Migrations.step(RequestedV1, IssueRequested, ({ via: _via, ...row }) => row)],
  getKey: (row) => row.id,
})

/** The new-issue form's and comments' drafts. */
export const IssueDraftsStore = Migrations.local({ id: "issue-drafts", versions: [IssueDraft], getKey: (row) => row.id })

/** Who this device last knew was signed in, and as what (src/features/auth/store.ts). */
export const AuthConfirmedStore = Migrations.local({ id: "auth-confirmed", versions: [AuthConfirmedV1, Confirmed], migrations: [Migrations.step(AuthConfirmedV1, Confirmed, (row) => row)], getKey: (row) => row.id })

/** This device's theme. */
export const PreferencesStore = Migrations.local({ id: "preferences", versions: [Preference], getKey: (row) => row.id })

/** Repository homes as last read: a cache RepoApi fills again. Version 1 (a flat list of blocks) was never declared. */
export const HomesStore = Migrations.local({
  id: "homes",
  versions: [HomeRow],
  first: 2,
  getKey: (row) => row.key,
  discard: true,
})

/** Curated homes as last read: a cache RepoApi fills again. */
export const CuratedHomesStore = Migrations.local({
  id: "curated-homes",
  versions: [CuratedRow],
  getKey: (row) => row.key,
  discard: true,
})

/** The feed's acknowledgments not yet sent (src/features/attention/store.ts). */
export const AttentionPendingStore = Migrations.local({
  id: "attention-pending",
  versions: [Pending],
  getKey: (row) => row.id,
})

/** The spend alerts this device has seen, by kind. */
export const SpendSeenStore = Migrations.local({ id: "spend-seen", versions: [Seen], getKey: (row) => row.kind })

/** TODO drafts. */
export const TodoDraftsStore = Migrations.local({ id: "todo-drafts", versions: [TodoDraft], getKey: (row) => row.id })

/** Changes to a stack the server took or refused. */
export const TodoRequestedStore = Migrations.local({
  id: "todo-requested",
  versions: [TodoRequested],
  getKey: (row) => row.id,
})

/** Steers of a TODO's agent the server took or refused (src/features/runs/writes.ts). */
export const SteerSentStore = Migrations.local({ id: "steer-sent", versions: [SteerSent], getKey: (row) => row.id })

/** The timeline's summaries: a cache the summarizer fills again. */
export const TimelineSummariesStore = Migrations.local({
  id: "timeline-summaries",
  versions: [Summary],
  getKey: (row) => row.id,
  discard: true,
})

// --- Synced: the server's rows, kept on the device ---

/** The conversation's messages, one collection per conversation. Version 3: an answer's steps (`parts`). */
export const MessagesStore = Migrations.synced({ id: "chat-messages", version: 3, schema: Message, family: true })

/** The conversation's views. Version 2: a page's title, description and icon. */
export const ViewsStore = Migrations.synced({ id: "views", version: 2, schema: View, family: true })

const synced = [
  MessagesStore,
  ViewsStore,
  Migrations.synced({ id: "runs", version: 1, schema: Run }),
  Migrations.synced({ id: "repo-repositories", version: 3, schema: Repository }),
  Migrations.synced({ id: "issue-items", version: 3, schema: Item }),
  Migrations.synced({ id: "issue-comments", version: 1, schema: Comment }),
  Migrations.synced({ id: "issue-sync", version: 1, schema: SyncRow }),
  Migrations.synced({ id: "issue-writes", version: 1, schema: WriteRow }),
  Migrations.synced({ id: "issue-triage-settings", version: 1, schema: TriageSettings }),
  Migrations.synced({ id: "flows", version: 2, schema: FlowRow }),
  Migrations.synced({ id: "flow-drafts", version: 1, schema: FlowDraft }),
  Migrations.synced({ id: "notifications", version: 1, schema: Notice }),
  Migrations.synced({ id: "spend-alerts", version: 1, schema: SpendAlert }),
  Migrations.synced({ id: "alert-channels", version: 1, schema: AlertChannel }),
  Migrations.synced({ id: "alert-deliveries", version: 1, schema: AlertDelivery }),
  Migrations.synced({ id: "todos", version: 4, schema: Todo, family: true }),
  Migrations.synced({ id: "todo-requests", version: 1, schema: TodoRequest, family: true }),
  Migrations.synced({ id: "text-updates", version: 1, schema: TextUpdate, family: true }),
  Migrations.synced({ id: "pull-rows", version: 1, schema: PullRow }),
  Migrations.synced({ id: "pull-commits", version: 1, schema: PullCommitRow }),
  Migrations.synced({ id: "pull-reviews", version: 1, schema: ReviewRow }),
  Migrations.synced({ id: "pull-checks", version: 1, schema: CheckRow }),
]

// --- The outbox's payloads, by the collection key each write names ---

/** Chat's questions (src/features/chat/store.ts, mutation `ask`). */
export const AskingPayload = Migrations.payload({ key: "asking", versions: [Asking] })

/**
 * Issue writes (src/features/issues/writes.ts, mutation `issue-write`). Version 2 (after `7b96f878`): the request
 * names nobody, so a write the agent queued as itself can't be sent as it meant; it is parked, and shows Not sent.
 */
export const IssueSendingPayload = Migrations.payload({
  key: "issue-sending",
  versions: [IssueSendingV1, IssueSendingV2, IssueSending],
  migrations: [
    Migrations.step(IssueSendingV1, IssueSendingV2, ({ via, ...row }) =>
      via === "agent" ? new Migrations.Unmigratable({ reason: "agent_write" }) : { ...row, v: 2 as const }),
    Migrations.step(IssueSendingV2, IssueSending, (row) => ({ ...row, v: 3 as const })),
  ],
})

/** Co-edited texts' updates (src/features/coedit/writes.ts, mutation `text-update`). */
export const TextSendingPayload = Migrations.payload({ key: "text-sending", versions: [TextSending] })

/** Changes to a stack (src/features/todos/writes.ts, mutation `todo-op`). */
export const TodoSendingPayload = Migrations.payload({ key: "todo-sending", versions: [TodoSending] })

/** Steers of a TODO's agent (src/features/runs/writes.ts, mutation `run-steer`). */
export const SteerSendingPayload = Migrations.payload({ key: "steer-sending", versions: [SteerSending] })

/** Every store this build keeps, and its outbox's writes. */
export const deviceRegistry = Migrations.registry({
  stores: [
    ChatUnsentStore,
    ChatDraftsStore,
    IssueRequestedStore,
    IssueDraftsStore,
    AuthConfirmedStore,
    PreferencesStore,
    HomesStore,
    CuratedHomesStore,
    AttentionPendingStore,
    SpendSeenStore,
    TodoDraftsStore,
    TodoRequestedStore,
    SteerSentStore,
    TimelineSummariesStore,
    ...synced,
  ],
  outbox: {
    payloads: [AskingPayload, IssueSendingPayload, TextSendingPayload, TodoSendingPayload, SteerSendingPayload],
    mutations: ["ask", "issue-write", "text-update", "todo-op", "run-steer"],
    // Builds before stamping (`7b96f878` and earlier) wrote every payload at its version 1.
    unstamped: { asking: 1, "issue-sending": 1, "text-sending": 1, "todo-sending": 1 },
  },
})

/** The outbox's upgrade of the writes an older build stored, and the versions it stamps on each new write. */
export const outboxUpgrade = Migrations.outbox(deviceRegistry)
