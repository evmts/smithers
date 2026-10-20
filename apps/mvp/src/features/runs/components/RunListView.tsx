import { EmptyState, RunList } from "@smthrs/ui"
import { useLiveQuery } from "@tanstack/react-db"
import { Link } from "@tanstack/react-router"
import { NO_RUNS } from "../contract"
import { listRows } from "../page"
import { useRuns } from "./RunsContext"

// Every run on this device, newest first (decision 0014 §5, `/app/runs`): each opens its run page.
export function RunListView() {
  const { queries } = useRuns()
  const { data: runs } = useLiveQuery(queries.runs)
  return (
    <RunList
      runs={listRows(runs ?? [])}
      now={Date.now()}
      renderLink={(href, children) => <Link to={href as never}>{children}</Link>}
      empty={<EmptyState title={NO_RUNS} />}
    />
  )
}
