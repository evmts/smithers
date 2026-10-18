import { Link } from "../../../core/router"
import { children, file, repo, to, tree } from "../../fixtures"
import { Empty, Failed, Loading, useView } from "../../frame"
import { ViewFrame as RepoFrame } from "../checklist/ViewFrame"
import { AgentMark, Box, Icon, Markdown, RelTime } from "../../ui"
import { entryCommit, FileTree, LatestCommit, latestCommitFor, parentPath, PathHeader, sourceRoute } from "./shared"

export const CodeLoading = () => <Loading variant="file" rows={12} />
export const CodeError = ({ path }: { path: string }) => (
  <Failed what={path || "repository files"} reason="The GitHub sync timed out. Try reading the files again." />
)
export const CodeNotFound = ({ path, revision }: { path: string; revision: string }) => (
  <Empty
    title={`No ${path || "files"} at ${revision}`}
    action={(
      <Link className="repo-ui-btn" to={sourceRoute("tree", revision, parentPath(path))}>
        <Icon name="folder" size={15} />
        Go up a directory
      </Link>
    )}
  />
)
export const TreeEmpty = () => <Empty title="This folder is empty." />

export const TreeReady = ({ path, revision }: { path: string; revision: string }) => {
  const entries = children(path)
  const readmePath = entries.find(entry => /(^|\/)readme\.md$/i.test(entry.path))?.path
  const readme = readmePath ? file(readmePath) : undefined
  return (
    <>
      <Box header={latestCommitFor(revision, path) && <LatestCommit path={path} revision={revision} />}>
        <div role="table" aria-label={path ? `Files in ${path}` : "Repository files"}>
          <div className="repo-ui-sr" role="row">
            <span role="columnheader">Name</span>
            <span role="columnheader">Last commit</span>
            <span role="columnheader">Updated</span>
          </div>
          {path && (
            <div className="repo-code-file-row" role="row">
              <span role="cell">
                <Link to={sourceRoute("tree", revision, parentPath(path))} aria-label="Parent directory">..</Link>
              </span>
              <span role="cell" />
              <span role="cell" />
            </div>
          )}
          {entries.map(entry => {
            const last = entryCommit(revision, entry.path, entry.sha)
            return (
              <div className="repo-code-file-row" role="row" key={entry.path}>
                <span role="cell">
                  <Link to={sourceRoute(entry.kind === "dir" ? "tree" : "blob", revision, entry.path)}>
                    <Icon name={entry.kind === "dir" ? "folder" : "file"} size={17} />
                    {entry.path.split("/").at(-1)}
                  </Link>
                </span>
                <span className="repo-code-file-message" role="cell">
                  {last && (
                    <>
                      <Link to={to(`commit/${last.sha}`)}>{last.title}</Link>
                      {last.agent && <AgentMark agent={last.agent} />}
                    </>
                  )}
                </span>
                <span role="cell">{last && <RelTime date={last.date} />}</span>
              </div>
            )
          })}
        </div>
      </Box>
      {readme && (
        <Box header={(
          <Link className="repo-code-readme-title" to={sourceRoute("blob", revision, readme.path)}>
            <Icon name="file" size={15} />
            {readme.path.split("/").at(-1)}
          </Link>
        )}>
          <article className="repo-code-readme">
            <Markdown source={readme.content} />
          </article>
        </Box>
      )}
    </>
  )
}

export const TreeView = ({ path, revision }: { path: string; revision: string }) => {
  const state = useView(`tree:${repo.slug}:${revision}:${path}`)
  const exists = !path || tree.some(entry => entry.path === path && entry.kind === "dir")
  const content = state === "loading" ? <CodeLoading />
    : state === "error" ? <CodeError path={path} />
    : !exists ? <CodeNotFound path={path} revision={revision} />
    : state === "empty" || !children(path).length ? <TreeEmpty />
    : <TreeReady path={path} revision={revision} />
  return (
    <RepoFrame tab="code" title={`${path || repo.name} at ${revision} · ${repo.slug}`} askView="tree" askContext={`${path || repo.name} at ${revision}`}>
      <div className="repo-code-layout" data-sidebar={Boolean(path) && state === "ready"}>
        {path && state === "ready" && <FileTree key={`${repo.slug}:${path}`} path={path} revision={revision} />}
        <div className="repo-code-main">
          <PathHeader path={path} revision={revision} />
          {content}
        </div>
      </div>
    </RepoFrame>
  )
}
