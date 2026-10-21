import { Context, Data, Effect, Layer, Stream } from "effect"
import { FlowDispatch } from "../../flows/dispatch"
import { Page, reload } from "../../page"
import {
  type AskResult,
  ask,
  closeComposer,
  copy,
  discardUnsent,
  edit,
  editUnsent,
  loadEarlier,
  openComposer,
  resendUnadmitted,
  resendUnsent,
  restoreDraft,
  retry,
  retryAnswer,
  setDraft,
  show,
  type Via,
} from "./actions"
import { ChatStore } from "./store"

// Chat as a frontend sees it: live queries to read and plain functions to act, with no Effect in sight. React renders
// the queries with `useLiveQuery` and calls the actions from event handlers; it holds no state and runs no Effect.

type Store = ChatStore["Service"]

/** What a frontend reads: the TanStack DB collection of each live query, for its binding. */
export interface ChatQueries {
  /** The window of the conversation, oldest first. */
  readonly conversation: Store["shown"]["tanstack"]
  readonly summaries: Store["summaries"]["tanstack"]
  /** Questions queued on this device that Postgres doesn't have yet. */
  readonly queued: Store["queued"]["tanstack"]
  readonly composer: Store["composerState"]["tanstack"]
  readonly connection: Store["connectionState"]["tanstack"]
  readonly history: Store["historyState"]["tanstack"]
  /** Which conversation this tab shows and asks in: a branch's `conversationId`, or `null` for the home one. */
  readonly place: Store["placeState"]["tanstack"]
  /**
   * A branch conversation's window and history, by its id, once it is shown; the home conversation's for `null` or one
   * not opened yet.
   */
  readonly of: (conversationId: string | null | undefined) => {
    readonly conversation: Store["shown"]["tanstack"]
    readonly history: Store["historyState"]["tanstack"]
  }
}

/** Copy didn't put the message on the clipboard: the clipboard refused, or the message is gone. */
export class NotCopied extends Data.TaggedError("NotCopied") {}

/** What a person does, as plain functions. Each finishes before it returns, but Copy, which resolves once it copied. */
export interface ChatActions {
  readonly ask: (text: string) => AskResult
  readonly openComposer: (via: Via) => void
  readonly closeComposer: () => void
  readonly setDraft: (text: string) => void
  readonly loadEarlier: () => void
  /** Retry on the connection pill: sync and send now. */
  readonly retry: () => void
  /** Retry on an answer Smithers couldn't give. */
  readonly retryAnswer: (answerId: string) => void
  readonly editUnsent: (questionId: string) => void
  readonly discardUnsent: (questionId: string) => void
  /** Retry on a question the outbox couldn't take. */
  readonly resendUnsent: (questionId: string) => void
  /** Copy on a message, through `chat/copy`: resolves once its text is on the clipboard, rejects `NotCopied` otherwise. */
  readonly copy: (messageId: string) => Promise<void>
  /** Edit on a queued question, through `chat/edit`: its text goes to the composer once the outbox gives it back. */
  readonly edit: (questionId: string) => void
  readonly reload: () => void
  /** Shows a branch's conversation, and asks there; `null` the home conversation. Resolves once it is open. */
  readonly show: (conversationId: string | null) => Promise<void>
}

export class Chat extends Context.Service<Chat, { readonly queries: ChatQueries; readonly actions: ChatActions }>()(
  "@smthrs/mvp/chat/Chat",
) {
  /**
   * Binds the store's queries and actions for frontends. Each action runs its Effect with the services this layer
   * was built with (`Effect.runSyncWith`), so it shares the app's store, logger, tracer and metrics. Whenever this tab
   * comes to lead the outbox, it sends the questions it couldn't before.
   */
  static readonly layer = Layer.effect(
    Chat,
    Effect.gen(function* () {
      const store = yield* ChatStore
      const context = yield* Effect.context<ChatStore | Page | FlowDispatch>()
      const run = Effect.runSyncWith(context)
      const runAsync = Effect.runPromiseWith(context)
      // The draft this device kept goes back into the composer once the device store has restored it.
      yield* store.drafts.restored.pipe(
        Effect.ignore,
        Effect.andThen(restoreDraft),
        Effect.forkIn(store.scope, { startImmediately: true }),
      )
      // A tab that comes to lead the outbox sends the questions asked while another tab led.
      yield* store.outbox.status.pipe(
        Stream.map(({ leader }) => leader),
        Stream.changes,
        Stream.filter((leader) => leader),
        Stream.runForEach(() => resendUnadmitted),
        Effect.forkIn(store.scope, { startImmediately: true }),
      )
      return Chat.of({
        queries: {
          summaries: store.summaries.tanstack,
          conversation: store.shown.tanstack,
          queued: store.queued.tanstack,
          composer: store.composerState.tanstack,
          connection: store.connectionState.tanstack,
          history: store.historyState.tanstack,
          place: store.placeState.tanstack,
          of: (conversationId) => {
            const branch = conversationId === null || conversationId === undefined
              ? undefined
              : store.opened(conversationId)
            return branch === undefined
              ? { conversation: store.shown.tanstack, history: store.historyState.tanstack }
              : { conversation: branch.shown.tanstack, history: branch.historyState.tanstack }
          },
        },
        actions: {
          ask: (text) => run(ask(text)),
          openComposer: (via) => run(openComposer(via)),
          closeComposer: () => run(closeComposer),
          setDraft: (text) => run(setDraft(text)),
          loadEarlier: () => run(loadEarlier),
          retry: () => run(retry("button")),
          retryAnswer: (answerId) => run(retryAnswer(answerId)),
          editUnsent: (id) => run(editUnsent(id)),
          discardUnsent: (id) => run(discardUnsent(id)),
          resendUnsent: (id) => run(resendUnsent(id)),
          copy: (messageId) =>
            runAsync(Effect.flatMap(copy(messageId), (copied) => (copied ? Effect.void : Effect.fail(new NotCopied())))),
          edit: (questionId) => run(edit(questionId)),
          reload: () => run(reload),
          show: (conversationId) => runAsync(show(conversationId)),
        },
      })
    }),
  )
}

/** The chat layer's value: what frontends get. */
export type ChatView = Chat["Service"]
