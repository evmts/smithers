import {
  Button,
  CopyButton,
  EmptyState,
  Popover,
  PopoverContent,
  PopoverTrigger,
  RefPicker,
  RelativeTime,
  Snippet,
} from "@smthrs/ui"
// The one deep import the app allows: RepoView ships behind its adapter subpath so the base barrel stays light
// (decision 0006, question 2).
import { RepoView, type RepoViewLocation } from "@smthrs/ui/adapters/repo-view"
import { useLiveQuery } from "@tanstack/react-db"
import { useNavigate } from "@tanstack/react-router"
import {
  cloneUrl,
  CODE,
  COPY_CLONE_URL,
  COPY_CONTENTS,
  COPY_PATH,
  COPY_PERMALINK,
  DOWNLOAD,
  NOT_FOUND,
  RAW,
} from "../contract"
import { hrefFor } from "../paths"
import { commitOf, fileLinksOf, fileProps, refsProps, revisionLabel, treeProps } from "../view"
import { useRepo } from "./RepoContext"

// The repository at the routed location, once it is ready: the branch and tag picker, the file tree, the directory
// with its README or the file, the head commit, Code (the clone URL), Copy permalink, and a file's Raw, Download, Copy
// path and Copy. Every link is a real link to the app's GitHub-shaped URL; a plain click navigates through the router,
// and a ref chosen in the picker runs `app/navigate`. Each Copy runs `repo/copy`.
export function RepoPage() {
  const { queries, actions } = useRepo()
  const { data: current } = useLiveQuery(queries.view)
  const { data: refs } = useLiveQuery(queries.refs)
  const { data: tree } = useLiveQuery(queries.tree)
  const { data: file } = useLiveQuery(queries.file)
  const { data: readme } = useLiveQuery(queries.readme)
  const navigate = useNavigate()
  if (current === undefined) return null
  const { view, repository } = current
  if (view.missing) return <EmptyState title={NOT_FOUND} />
  if (view.failure !== null) return <EmptyState title={view.failure} />
  if (repository?.status !== "ready") return null
  const revision = view.revision ?? repository.defaultBranch ?? ""
  const href = (location: RepoViewLocation) => hrefFor(repository, revision, location)
  const at = (ref: string) => hrefFor(repository, ref, { kind: view.kind, path: view.path })
  const commit = commitOf(repository, view.sha)
  const links = fileLinksOf(view, file?.file)
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
      revision={
        <RefPicker
          current={revisionLabel(revision)}
          selected={revision}
          refs={refsProps(refs?.refs)}
          defaultBranch={repository.defaultBranch ?? undefined}
          href={at}
          onSelect={(ref) => actions.navigate(at(ref))}
        />
      }
      actions={
        <>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm">{CODE}</Button>
            </PopoverTrigger>
            <PopoverContent align="end">
              <Snippet
                code={cloneUrl(view.owner, view.name)}
                copyLabel={COPY_CLONE_URL}
                onCopyCode={() => actions.copy("clone-url")}
              />
            </PopoverContent>
          </Popover>
          <CopyButton variant="outline" size="sm" onCopy={() => actions.copy("permalink")}>{COPY_PERMALINK}</CopyButton>
        </>
      }
      fileActions={
        <>
          {links.raw === undefined ? null : (
            <Button asChild variant="ghost" size="sm">
              <a href={links.raw} target="_blank" rel="noopener noreferrer">{RAW}</a>
            </Button>
          )}
          {links.download === undefined ? null : (
            <Button asChild variant="ghost" size="sm">
              <a href={links.download.href} download={links.download.name}>{DOWNLOAD}</a>
            </Button>
          )}
          <CopyButton variant="ghost" size="sm" onCopy={() => actions.copy("path")}>{COPY_PATH}</CopyButton>
          {links.copyContents
            ? <CopyButton variant="ghost" size="sm" onCopy={() => actions.copy("contents")}>{COPY_CONTENTS}</CopyButton>
            : null}
        </>
      }
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
