import { useLiveQuery } from "@tanstack/react-db"
import { Suspense } from "react"
import { useApp } from "../../AppContext"
import { retrySync } from "../../features/chat/actions"
import { AppShell } from "./AppShell"
import { AppLoading, AppLost } from "./AppStatus"

// /app. Until the conversation first opens: the wordmark while it loads, or the failure and Try again if sync fails
// first. Once open, the shell, which says so itself if sync fails later.
export function AppScreen() {
  const { chat, run } = useApp()
  const { data: sync } = useLiveQuery(chat.syncState)
  const { data: history } = useLiveQuery(chat.historyState)
  if (sync?.status === "failed" && history?.opened !== true) {
    return <AppLost onRetry={() => run(retrySync("button"))} />
  }
  return (
    <Suspense fallback={<AppLoading />}>
      <AppShell />
    </Suspense>
  )
}
