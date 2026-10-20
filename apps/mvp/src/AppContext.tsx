import type { Effect } from "effect"
import { createContext, useContext } from "react"
import type { Chat, ChatStore } from "./features/chat/store"

/**
 * What React components get: the store to read through live queries, and `run` to perform an action with the app's
 * runtime (`runSync`; every action finishes synchronously, see features/chat/actions.ts).
 */
export type App = {
  readonly chat: Chat
  readonly run: <A>(action: Effect.Effect<A, never, ChatStore>) => A
}

const AppContext = createContext<App | null>(null)

export const AppProvider = AppContext.Provider

export const useApp = (): App => {
  const app = useContext(AppContext)
  if (app === null) throw new Error("useApp needs an AppProvider: main.tsx renders one")
  return app
}
