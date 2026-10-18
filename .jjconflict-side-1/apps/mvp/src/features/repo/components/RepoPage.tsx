import { Badge, Button, EmptyState, RelativeTime } from "@smthrs/ui"
// The one deep import the app allows: RepoView ships behind its adapter subpath so the base barrel stays light
// (decision 0006, question 2).
import { RepoView, type RepoViewLocation } from "@smthrs/ui/adapters/repo-view"
import { useLiveQuery } from "@tanstack/react-db"
import { useNavigate } from "@tanstack/react-router"
import { COPY_PERMALINK, NOT_FOUND } from "../contract"
import { hrefFor } from "../paths"
import { commitOf, fileProps, treeProps } from "../view"
import { useRepo } from "./RepoContext"

// The repository at the routed location, once it is ready: the file tree, the directory with its README or the file,
// the head commit, and Copy permalink. Every link is a real link to the app's GitHub-shaped URL; a plain click
// navigates through the router.
export function RepoPage() {
  const { queries, actions } = useRepo()
  const { data: current } = useLiveQuery(queries.view)
  const { data: tree } = useLiveQuery(queries.tree)
  const { data: file } = useLiveQuery(queries.file)
  const { data: readme } = useLiveQuery(queries.readme)
  const navigate = useNavigate()
  if (current === undefined) return null
  const { view, repository } = current
  if (view.missing) return <EmptyState title={NOT_FOUND} />
  if (repository?.status !== "ready") return null
  const revision = view.revision ?? repository.defaultBranch ?? ""
  const href = (location: RepoViewLocation) => hrefFor(repository, revision, location)
  const commit = commitOf(repository)
  return (
    <RepoView
      className="repo-page"
      name={repository.name}
      tree={treeProps(tree?.tree)}
      location={{
        kind: view.kind,
        path: view.path,
        line: view.line ?? undefined,
        lineEnd: view.lineEnd ?? undefined,
      }}
      file={view.kind === "blob" ? fileProps(file?.file) : undefined}
      readme={view.kind === "tree" && view.readmePath !== null
        ? { path: view.readmePath, file: fileProps(readme?.readme) }
        : undefined}
      href={href}
      onNavigate={(location) => void navigate({ href: href(location) })}
      revision={<Badge variant="secondary">{revision.length === 40 ? revision.slice(0, 7) : revision}</Badge>}
      actions={<Button variant="outline" size="sm" onClick={actions.copyPermalink}>{COPY_PERMALINK}</Button>}
      summary={commit === undefined ? undefined : (
        <span className="repo-commit" aria-label="Head commit">
          <span>{commit.message}</span>
          <span>{commit.author}</span>
          <code>{commit.shortSha}</code>
          <RelativeTime ts={commit.at} />
        </span>
      )}
    />
  )
}
