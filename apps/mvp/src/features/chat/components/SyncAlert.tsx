import { Alert, Button } from "@smthrs/ui"
import { useLiveQuery } from "@tanstack/react-db"
import { useApp } from "../../../AppContext"
import { retrySync } from "../actions"
import { SYNC_LOST } from "../schema"

// While sync has failed: the conversation shown may be stale, so say so, with Try again.
export function SyncAlert() {
  const { chat, run } = useApp()
  const { data: sync } = useLiveQuery(chat.syncState)
  if (sync?.status !== "failed") return null
  return (
    <>
      <Alert variant="destructive">{SYNC_LOST}</Alert>
      <Button variant="outline" size="sm" onClick={() => run(retrySync("button"))}>
        Try again
      </Button>
    </>
  )
}
