import { Context, Effect, Layer, Stream } from "effect"
import { Page, reload } from "../../page"
import {
  type AskResult,
  ask,
  closeComposer,
  discardUnsent,
  editUnsent,
  loadEarlier,
  openComposer,
  resendUnadmitted,
  resendUnsent,
  retry,
  retryAnswer,
  setDraft,
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
  /** Questions queued on this device that Postgres doesn't have yet. */
  readonly queued: Store["queued"]["tanstack"]
  readonly composer: Store["composerState"]["tanstack"]
  readonly connection: Store["connectionState"]["tanstack"]
  readonly history: Store["historyState"]["tanstack"]
}

/** What a person does, as plain functions. Each finishes before it returns. */
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
  readonly reload: () => void
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
      const run = Effect.runSyncWith(yield* Effect.context<ChatStore | Page>())
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
          conversation: store.shown.tanstack,
          queued: store.queued.tanstack,
          composer: store.composerState.tanstack,
          connection: store.connectionState.tanstack,
          history: store.historyState.tanstack,
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
          reload: () => run(reload),
        },
      })
    }),
  )
}

/** The chat layer's value: what frontends get. */
export type ChatView = Chat["Service"]
