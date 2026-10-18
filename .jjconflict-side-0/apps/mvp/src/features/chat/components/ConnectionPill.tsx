import { Badge, Button } from "@smthrs/ui"
import { useLiveQuery } from "@tanstack/react-db"
import { useChat } from "../../../AppContext"
import { ENGINE_FAILED, OFFLINE, SYNC_FAILED } from "../contract"

// The connection pill, in the header's live region: `Offline`, `Offline · <queued>`, with Retry once Smithers has been
// unreachable a while, `Sync failed` with Retry, or, when this tab's engine worker failed, that Smithers can't run here,
// with Reload. Nothing while the connection is up.
export function ConnectionPill() {
  const { queries, actions } = useChat()
  const { data: connection } = useLiveQuery(queries.connection)
  const { data: queued } = useLiveQuery(queries.queued)
  if (connection === undefined || connection.status === "up") return null
  if (connection.status === "stopped") {
    return (
      <>
        <Badge variant="destructive">{ENGINE_FAILED}</Badge>
        <Button variant="outline" size="sm" onClick={actions.reload}>
          Reload
        </Button>
      </>
    )
  }
  return (
    <>
      <Badge variant={connection.status === "failed" ? "destructive" : "muted"}>
        {connection.status === "failed" ? SYNC_FAILED : queued.length > 0 ? `${OFFLINE} · ${queued.length}` : OFFLINE}
      </Badge>
      {connection.retry ? (
        <Button variant="outline" size="sm" onClick={actions.retry}>
          Retry
        </Button>
      ) : null}
    </>
  )
}
