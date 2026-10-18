import { pluralize } from "../../ui/pluralize"
import { WriteControl } from "../../frame/WriteControl"
import { useEffect, useState } from "react"
import { useMock } from "../../../core/mock"
import { Link, navigate, useLocation } from "../../../core/router"
import { branch, file, history, repo, tags, to, tree } from "../../fixtures"
import type { FileBlob, TreeEntry } from "../../fixtures/types"
import { Denied, Empty, registerSlash, SignInWall, useRepoFrame, useView } from "../../frame"
import { ViewFrame as RepoFrame } from "../checklist/ViewFrame"
import { Box, Icon, Markdown } from "../../ui"
import { CodeView, useLineSelection, type LineRange } from "./CodeView"
import { CodeError, CodeLoading, CodeNotFound } from "./Tree"
import { makeCodeTodo } from "../issues/model"
import { byteSize, copyText, entryCommit, FileTree, FormCard, LatestCommit, latestCommitFor, linesOf, PathHeader, sourceRoute } from "./shared"

export const FileSignedOut = () => <SignInWall act="make a TODO" />
export const FileDenied = () => <Denied act="add TODOs to the Stack" primary />
export const FileEmpty = () => <Empty title="This file is empty." />
export const FileUnavailable = ({ entry, revision }: { entry: TreeEntry; revision: string }) => (
  <Box header={(entryCommit(revision, entry.path, entry.sha) ?? latestCommitFor(revision, entry.path)) && <LatestCommit entry={entryCommit(revision, entry.path, entry.sha)} path={entry.path} revision={revision} />}>
    <div className="repo-code-file-toolbar">
      <strong>{entry.path.split("/").at(-1)}</strong>
      {entry.size !== undefined && <span className="repo-code-file-stats">{entry.size.toLocaleString("en-US")} B</span>}
      <span className="repo-code-toolbar-spacer" />
      <Link className="repo-code-toolbar-link" to={to(`commits/${encodeURIComponent(revision)}/${entry.path}`)}>History</Link>
      <Link className="repo-code-toolbar-link" to={`${sourceRoute("blob", revision, entry.path)}?raw=1`}>Raw</Link>
    </div>
    <p className="repo-code-unavailable" data-mock="missing-file-contents">This file's contents aren't part of the mock.</p>
  </Box>
)

const setQuery = (location: string, key: string, value?: string) => {
  const query = new URLSearchParams(location.split("?")[1])
  if (value === undefined) query.delete(key)
  else query.set(key, value)
  navigate(`${location.split("?")[0]}?${query}`, { replace: true })
}

export const useCodeActions = ({ path, revision, selected, onTodo }: {
  path: string
  revision: string
  selected: LineRange | null
  onTodo: () => void
}) => {
  const { openAsk } = useRepoFrame()
  const label = !selected ? "this file" : selected.start === selected.end ? `line ${selected.start}` : `lines ${selected.start}-${selected.end}`
  const sha = branch(revision)?.head ?? tags.find(tag => tag.name === revision)?.sha ?? history(revision)[0]?.sha ?? revision
  const anchor = selected ? `#L${selected.start}${selected.end === selected.start ? "" : `-L${selected.end}`}` : ""
  const permalink = `https://${sourceRoute("blob", sha, path)}${anchor}`
  const askLines = () => openAsk(`Explain ${label} of ${path} at ${revision}`)
  const copyPermalink = () => copyText(permalink, "Permalink copied")
  useEffect(() => {
    const dispose = [
      registerSlash("file.permalink", {
        purpose: "Copy the file permalink", fields: [], access: "public", confirm: false,
        run: () => copyPermalink()
      }),
      registerSlash("lines.ask", {
        purpose: "Ask about the selected lines", fields: [], access: "public", confirm: false,
        run: askLines
      }),
      registerSlash("todo.make", {
        purpose: "Make a TODO from code", fields: [], confirm: false,
        run: (_, { closeAsk }) => { closeAsk(); onTodo() }
      })
    ]
    return () => dispose.forEach(cleanup => cleanup())
  }, [path, revision, selected?.start, selected?.end, openAsk, onTodo])
  return { askLines, copyPermalink }
}

const TodoToast = ({ onClose }: { onClose: () => void }) => {
  useEffect(() => {
    const timer = setTimeout(onClose, 7000)
    return () => clearTimeout(timer)
  }, [onClose])
  return (
    <div className="repo-code-todo-toast" role="status">
      <span>TODO added to the <Link to={to("stack")}>Stack</Link></span>
      <button className="repo-ui-icon-btn" title="/notice.dismiss" aria-label="Dismiss notification" onClick={onClose}>×</button>
    </div>
  )
}

export const MakeTodo = ({ path, selected, onClose, onCreated }: {
  path: string
  selected: LineRange
  onClose: () => void
  onCreated: () => void
}) => {
  const { flags } = useMock()
  const lineLabel = selected.start === selected.end ? `line ${selected.start}` : `lines ${selected.start}-${selected.end}`
  const context = `${lineLabel} of ${path}`
  const [title, setTitle] = useState(context)
  return (
    <FormCard title="Make TODO" onClose={onClose}>
      {flags.as === "out" ? <FileSignedOut /> : flags.role !== "member" ? <FileDenied /> : (
        <form
          className="repo-code-todo-form"
          onSubmit={event => {
            event.preventDefault()
            if (!title.trim()) return
            makeCodeTodo(title.trim(), `${path}:${selected.start}-${selected.end}`)
            onCreated()
            onClose()
          }}
        >
          <p className="repo-code-todo-context">{context}</p>
          <label htmlFor="repo-code-todo-title">Title</label>
          <input
            className="repo-ui-input"
            id="repo-code-todo-title"
            value={title}
            onChange={event => setTitle(event.target.value)}
            required
            autoFocus
          />
          <div className="repo-ui-actions">
            <button className="repo-ui-btn repo-ui-btn-primary" title="/todo.create" type="submit">Create</button>
            <button className="repo-ui-btn repo-ui-btn-quiet" title="/cancel" type="button" onClick={onClose}>Cancel</button>
          </div>
        </form>
      )}
    </FormCard>
  )
}

export const SelectionActions = ({ selected, onTodo, askLines, copyPermalink }: {
  selected: LineRange | null
  onTodo: () => void
  askLines: () => void
  copyPermalink: () => Promise<void>
}) => {
  if (!selected) return null
  const label = selected.start === selected.end ? `line ${selected.start}` : `lines ${selected.start}-${selected.end}`
  return (
    <div className="repo-code-selection" aria-label="Selected line actions">
      <span>{label}</span>
      <button
        className="repo-ui-btn repo-ui-btn-quiet"
        title="/lines.ask"
        onClick={askLines}
      >
        Ask about {label}
      </button>
      <WriteControl primary quiet act="make TODOs"><button className="repo-ui-btn repo-ui-btn-quiet" title="/todo.make" onClick={onTodo}>
        Make TODO
      </button></WriteControl>
      <button className="repo-ui-btn repo-ui-btn-quiet" title="/file.permalink" onClick={() => void copyPermalink()}>
        Copy link
      </button>
    </div>
  )
}

const FileTabs = ({ blob, revision, preview, raw, onPreview, onRaw }: {
  blob: FileBlob
  revision: string
  preview: boolean
  raw: boolean
  onPreview: (preview: boolean) => void
  onRaw: () => void
}) => {
  const location = useLocation()
  const diagnostics = blob.diagnostics ?? []
  const warnings = diagnostics.filter(item => item.severity === "warning").length
  const errors = diagnostics.filter(item => item.severity === "error").length
  const diagnosticLabel = [errors ? `${errors} ${pluralize(errors, "error")}` : "", warnings ? `${warnings} ${pluralize(warnings, "warning")}` : ""]
    .filter(Boolean).join(" · ")
  return (
    <div className="repo-code-file-toolbar">
      <nav className="repo-code-segmented" aria-label="File view">
        <button className="repo-code-segment" aria-current={!raw ? "page" : undefined} title={`/file.view code ${blob.path}`} onClick={() => onPreview(false)}>Code</button>
        <Link className="repo-code-segment" to={sourceRoute("blame", revision, blob.path)}>Blame</Link>
      </nav>
      {blob.lang === "md" && !raw && (
        <div className="repo-code-segmented repo-code-markdown-display" aria-label="Markdown display">
          <button className="repo-code-segment" title={`/file.view preview ${blob.path}`} aria-pressed={preview} onClick={() => onPreview(true)}>Preview</button>
          <button className="repo-code-segment" title={`/file.view code ${blob.path}`} aria-pressed={!preview} onClick={() => onPreview(false)}>Code</button>
        </div>
      )}
      <span className="repo-code-file-stats">{blob.lang === "vibe" && <>VibeLang · </>}{linesOf(blob.content).length} {pluralize(linesOf(blob.content).length, "line")}<span className="repo-code-file-bytes"> · {byteSize(blob.content)}</span></span>
      {diagnosticLabel && (
        <button
          className="repo-code-diagnostic-count"
          title={`/diagnostics.show ${blob.path}`}
          onClick={() => { onPreview(false); setQuery(location, "L", String(diagnostics[0].line)) }}
        >
          <span aria-hidden="true">!</span> {diagnosticLabel}
        </button>
      )}
      <span className="repo-code-toolbar-spacer" />
      <Link className="repo-code-toolbar-link" to={to(`commits/${encodeURIComponent(revision)}/${blob.path}`)}>
        <Icon name="clock" size={14} /> History
      </Link>
      <button className="repo-ui-btn repo-ui-btn-quiet repo-code-toolbar-desktop" title={`/file.view raw ${blob.path}`} onClick={onRaw}>{raw ? "Exit raw" : "Raw"}</button>
      <button
        className="repo-ui-icon-btn repo-code-toolbar-desktop"
        title={`/file.copy ${blob.path}`}
        aria-label="Copy file contents"
        onClick={() => void copyText(blob.content, "File copied")}
      >
        <Icon name="copy" size={15} />
      </button>
      <details className="repo-ui-dropdown repo-code-file-overflow">
        <summary className="repo-ui-icon-btn" title="/file.menu" aria-label="File actions"><span aria-hidden="true">⋯</span></summary>
        <div className="repo-ui-menu">
          <button title={`/file.view raw ${blob.path}`} onClick={onRaw}>{raw ? "Exit raw" : "Raw"}</button>
          <button title={`/file.copy ${blob.path}`} onClick={() => void copyText(blob.content, "File copied")}>Copy contents</button>
          <button title={`/copy ${blob.path}`} onClick={() => void copyText(blob.path, "Path copied")}>Copy path</button>
          {blob.lang === "md" && <button title={`/file.view ${preview ? "code" : "preview"} ${blob.path}`} onClick={() => onPreview(!preview)}>{preview ? "Code" : "Preview"}</button>}
          {diagnosticLabel && <button title={`/diagnostics.show ${blob.path}`} onClick={() => { onPreview(false); setQuery(location, "L", String(diagnostics[0].line)) }}>{diagnosticLabel}</button>}
        </div>
      </details>
    </div>
  )
}

export const FileReady = ({ blob, revision }: { blob: FileBlob; revision: string }) => {
  const { flags } = useMock()
  const location = useLocation()
  const query = new URLSearchParams(location.split("?")[1])
  const { selected, select } = useLineSelection(linesOf(blob.content).length)
  const preview = blob.lang === "md" && !selected && query.get("view") !== "code"
  const [created, setCreated] = useState(false)
  const todoOpen = query.get("todo") === "1"
  const raw = query.get("raw") === "1"
  const latest = history(revision, blob.path)[0]
  const onTodo = () => setQuery(location, "todo", "1")
  const actions = useCodeActions({ path: blob.path, revision, selected, onTodo })
  return (
    <>
      <PathHeader path={blob.path} revision={revision}>
        <button
          className={`repo-ui-btn${todoOpen ? "" : " repo-ui-btn-primary"} repo-code-permalink`}
          title="/file.permalink"
          aria-label="Copy permalink"
          onClick={() => void actions.copyPermalink()}
        >
          <Icon name="link" size={14} />
          <span>Copy permalink</span>
        </button>
      </PathHeader>
      <Box header={latestCommitFor(revision, blob.path) && <LatestCommit entry={latest} revision={revision} path={blob.path} />}>
        <FileTabs
          blob={blob}
          revision={revision}
          preview={preview}
          raw={raw}
          onPreview={value => {
            const next = new URLSearchParams(location.split("?")[1])
            next.set("view", value ? "preview" : "code")
            next.delete("raw")
            if (value) next.delete("L")
            navigate(`${location.split("?")[0]}?${next}`, { replace: true })
          }}
          onRaw={() => setQuery(location, "raw", raw ? undefined : "1")}
        />
        {raw ? (
          <pre className="repo-code-raw" aria-label={`Raw ${blob.path}`}>{blob.content}</pre>
        ) : preview ? (
          <article className="repo-code-readme"><Markdown source={blob.content} /></article>
        ) : (
          <>
            <SelectionActions selected={selected} onTodo={onTodo} {...actions} />
            <CodeView blob={blob} revision={revision} selected={selected} onSelect={select} />
          </>
        )}
      </Box>
      {todoOpen && flags.as === "in" && (
        <MakeTodo
          path={blob.path}
          selected={selected ?? { start: 1, end: 1 }}
          onClose={() => setQuery(location, "todo")}
          onCreated={() => setCreated(true)}
        />
      )}
      {created && <TodoToast onClose={() => setCreated(false)} />}
    </>
  )
}

export const FileView = ({ path: requestedPath, revision }: { path: string; revision: string }) => {
  const blob = file(requestedPath)
  const path = blob?.path ?? requestedPath
  const state = useView(`blob:${repo.slug}:${revision}:${path}`)
  const entry = tree.find(item => item.path === path && item.kind === "file")
  const content = state === "loading" ? <CodeLoading />
    : state === "error" ? <CodeError path={path} />
    : state === "empty" && (blob || entry) ? <FileEmpty />
    : !blob ? entry ? <FileUnavailable entry={entry} revision={revision} /> : <CodeNotFound path={path} revision={revision} />
    : !blob.content ? <FileEmpty />
    : <FileReady key={`${repo.slug}:${revision}:${path}`} blob={blob} revision={revision} />
  return (
    <RepoFrame tab="code" title={`${path} at ${revision} · ${repo.slug}`} askView={`blob/${revision}/${path}`} askContext={`${path} at ${revision}`}>
      <div className="repo-code-layout" data-sidebar={state === "ready"}>
        {state === "ready" && <FileTree key={`${repo.slug}:${path}`} path={path} revision={revision} />}
        <div className="repo-code-main">
          {state !== "ready" || !blob || !blob.content ? <PathHeader path={path} revision={revision} /> : null}
          {content}
        </div>
      </div>
    </RepoFrame>
  )
}
