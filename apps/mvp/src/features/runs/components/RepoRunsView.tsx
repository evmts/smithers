import { EmptyState, RunList } from "@smthrs/ui"
import { useLiveQuery } from "@tanstack/react-db"
import { Link } from "@tanstack/react-router"
import { NO_RUNS } from "../contract"
import { repoRunRows } from "../page"
import type { RepoRunRow } from "../schema"
import { useRuns } from "./RunsContext"

// A repository's runs on Cloudflare, newest first (docs/features/actions.md, `/$owner/$repo/actions`): each its flow
// and ref, its state, when it started and how long it ran, opening its run page. Electric keeps the rows live.
export function RepoRunsView({ owner, name }: { owner: string; name: string }) {
  const { queries } = useRuns()
  const { data } = useLiveQuery(queries.repoRuns)
  return (
    <RunList
      runs={repoRunRows((data ?? []) as ReadonlyArray<RepoRunRow>, owner, name)}
      now={Date.now()}
      renderLink={(href, children) => <Link to={href as never}>{children}</Link>}
      empty={<EmptyState title={NO_RUNS} />}
    />
  )
}
