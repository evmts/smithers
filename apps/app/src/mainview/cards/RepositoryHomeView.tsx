import { Button, Markdown, StatusPill } from "@smthrs/ui"
import { useContext, useSyncExternalStore } from "react"
import type { RepositoryHome } from "@smthrs/rpc/RepositoryHome"
import type { MythicalStack } from "@smthrs/rpc/Mythical"
import { itemReason, itemStateLabel, itemTitle, stackCounts, stackRows } from "@smthrs/rpc/StackView"
import { ControllerContext } from "../ControllerContext"
import type { RepositorySnapshot, RepositorySnapshots } from "../state/seams/RepositoryHistorySeam"
import { dynamicFlowProps } from "../flows/FlowAction"
import type { RunDynamicCommand } from "./CardFamily"
import "./RepositoryHomeView.css"

/*
 * A repository's own default view at `/owner/repo` (mvp.md M-45, §6.14).
 *
 * The file tree is the default. A repository may replace it by declaring a
 * homepage in `.smithers/factory.json`, which the server resolves and
 * `GET /api/repos/{o}/{r}/home` serves as the ONE declaration
 * `@smthrs/rpc/RepositoryHome` already defines — the same declaration the
 * monitor's custom view is specified against. There is no second mechanism
 * and no new renderer contract here.
 *
 * What a repository declares is DATA, never code:
 *
 *  - the blocks are a closed union, each field bounded by the schema, so a
 *    repository cannot name a block this build would have to interpret;
 *  - markdown is the transcript's own renderer and link URLs are the
 *    schema's http/https ones, so nothing a repository writes executes on
 *    Smithers' authenticated origin or reads a credential;
 *  - a flow block renders a BUTTON. Arriving here runs nothing: the flow
 *    starts only when the person presses it, through the registry, with its
 *    own actor, role and confirmation rules intact. Navigation is not
 *    authorization (M-30: system flows stay non-overridable);
 *  - nothing here can grant a role, forge an actor, or render a secret: the
 *    declaration carries none of those, and the view reads nothing else.
 *
 * Honest fallback: a declaration that is absent, unreadable, invalid or
 * failed leaves the tree in place, and an outright failure says so. The
 * Files act is in the view either way, so the tree is one press away.
 *
 * A declared `stack` block reads the repository's OWN live snapshot from the
 * stack seam, which already watches a repository whose homepage declares one.
 * Where the host serves that snapshot it is the block's content, through the
 * shared `@smthrs/rpc/StackView` projections and the shipped StatusPill;
 * where it does not, the block is one honest line. An accepted declaration is
 * never dropped in silence.
 */

/** The transcript slot the repository's declared view occupies at `/owner/repo`. */
export const REPOSITORY_HOME_ENTRY_ID = "repository-home"

/** The homepage as the repository-flows row holds it, including a visible read failure. */
export type RepositoryHomeAnswer = RepositoryHome | { readonly kind: "error"; readonly message: string }

export interface RepositoryHomeViewProps {
  readonly repo: string
  /** Undefined while the read is still in flight. */
  readonly home: RepositoryHomeAnswer | undefined
  /** The copy the Files act lists; absent when this page has no copy to read. */
  readonly treeCopyId: string | undefined
  readonly onRunCommand: RunDynamicCommand
}

const NO_SNAPSHOTS: RepositorySnapshots = { get: () => undefined, subscribe: () => () => {} }

/**
 * The stack seam's live snapshot of ONE repository, read the way the Wiki
 * pane reads it (WorldSurface). `watchRepository` already keeps it live for a
 * homepage that declares a stack block (AppController), so this view only
 * reads; outside a controller there is no snapshot and no subscription.
 */
const useRepositorySnapshot = (repo: string): RepositorySnapshot | undefined => {
  const snapshots = useContext(ControllerContext)?.repositorySnapshots ?? NO_SNAPSHOTS
  return useSyncExternalStore(snapshots.subscribe, () => snapshots.get(repo), () => snapshots.get(repo))
}

/** The homepage shows the top of the stack; the stack's own view has the rest. */
const STACK_ROWS = 5

/**
 * The served snapshot: the shared counts projection, then the shared rows —
 * work not yet on the stack above the stack's own changes, exactly the order
 * `stackRows` already defines. Every row is text: nothing here is a control,
 * so this view holds no workflow UI of its own.
 */
const StackSummary = ({ stack }: { readonly stack: MythicalStack }) => {
  const counts = stackCounts(stack)
  const rows = stackRows(stack).slice(0, STACK_ROWS)
  return <>
    <p className="repository-home-stack-counts" data-testid="repository-home-stack-counts">
      {`${counts.busy} of ${counts.maxParallel} lanes working · ${counts.queued} queued · ${counts.open} to decide · ${counts.changes} changes, ${counts.landed} landed`}
    </p>
    {rows.length === 0
      ? <p className="repository-home-notice" role="status">Nothing on the stack right now.</p>
      : <ul className="repository-home-stack-rows">
        {rows.map((row) => {
          const title = row.kind === "item" ? itemTitle(stack, row.item) : row.change.title
          const state = row.kind === "item" ? row.item.state : row.change.state
          const label = row.kind === "item" ? itemStateLabel(row.item) : row.change.state
          const reason = row.kind === "item" ? itemReason(row.item) : row.item === undefined ? undefined : itemReason(row.item)
          return <li className="repository-home-stack-row" key={row.key}>
            <span className="repository-home-stack-title">{title}</span>
            <StatusPill status={state} label={label} />
            {reason === undefined ? null : <span className="repository-home-stack-reason">{reason}</span>}
          </li>
        })}
      </ul>}
  </>
}

/**
 * The declared `stack` block (#4085). An accepted declaration gets a truthful
 * answer: the repository's own live stack where this host serves it, else ONE
 * honest line — the seam's refusal, the stack's own absence, or this build's
 * plain "unavailable" where nothing serves it. Files stays below either way,
 * and reading a snapshot runs no command and admits no model or agent.
 */
const StackBlock = ({ repo, title }: { readonly repo: string; readonly title: string | undefined }) => {
  const snapshot = useRepositorySnapshot(repo)
  /*
   * The seam's `readFailed` publishes the LAST GOOD stack together with the
   * error, so a non-null stack beside an error is not a live read. Stale work
   * is never shown as current: the refused read is the whole answer, and the
   * tree is still below it.
   */
  const refusal = snapshot?.error ?? undefined
  const stack = refusal === undefined ? snapshot?.stack ?? null : null
  /* `absent` is the stack saying it does not exist yet, not a failed read. */
  const absent = stack !== null && stack.state === "absent"
  const notice = stack === null
    ? refusal ?? "Stack unavailable"
    : absent ? stack.reason ?? "No stack on this repository yet." : undefined
  return <div className="repository-home-block repository-home-stack" data-testid="repository-home-stack"
    data-stack={stack === null ? refusal === undefined ? "unavailable" : "refused" : absent ? "absent" : "served"}>
    {title === undefined ? null : <h2>{title}</h2>}
    {notice === undefined
      ? <StackSummary stack={stack!} />
      : <p className="repository-home-notice" role="status">{notice}</p>}
  </div>
}

/** The repository's file tree, always one press from its own default view. */
const FilesAction = ({ treeCopyId, onRunCommand }: Pick<RepositoryHomeViewProps, "treeCopyId" | "onRunCommand">) =>
  treeCopyId === undefined ? null : <Button
    variant="outline"
    className="repository-home-files"
    {...dynamicFlowProps("files", JSON.stringify({ operation: "tree", copy: treeCopyId }))}
    onClick={() => onRunCommand("files", JSON.stringify({ operation: "tree", copy: treeCopyId }))}
  >Files</Button>

/**
 * The repository's declared default view, or nothing when it declares none
 * (the tree is then the view, as it always was).
 */
export function RepositoryHomeView({ repo, home, treeCopyId, onRunCommand }: RepositoryHomeViewProps) {
  if (home === undefined || home.kind === "none") return null
  if (home.kind === "error") {
    return <section className="repository-home" data-testid="repository-home" data-home="error" aria-label={`${repo} home`}>
      {/* What failed, in the seam's words; the tree below is untouched. */}
      <p className="repository-home-notice" role="status">{`${home.message}. Showing ${repo}'s files instead.`}</p>
      <FilesAction treeCopyId={treeCopyId} onRunCommand={onRunCommand} />
    </section>
  }
  const blocks = home.kind === "readme"
    ? [{ type: "markdown" as const, path: "README.md", markdown: home.markdown }]
    : home.blocks
  if (blocks.length === 0) return null
  return <section className="repository-home" data-testid="repository-home" data-home={home.kind} aria-label={`${repo} home`}>
    {blocks.map((block, index) => {
      const key = `${block.type}:${index}`
      switch (block.type) {
        case "stack":
          return <StackBlock key={key} repo={repo} title={block.title} />
        case "markdown":
          return <div className="repository-home-block" key={key}>
            {block.title === undefined ? null : <h2>{block.title}</h2>}
            <Markdown content={block.markdown} />
          </div>
        case "text":
          return <div className="repository-home-block" key={key}>
            {block.title === undefined ? null : <h2>{block.title}</h2>}
            <p>{block.text}</p>
          </div>
        case "links":
          return <div className="repository-home-block" key={key}>
            {block.title === undefined ? null : <h2>{block.title}</h2>}
            <ul className="repository-home-links">
              {block.links.map((link) => <li key={link.url}>
                <a href={link.url} rel="noreferrer noopener" target="_blank">{link.label}</a>
              </li>)}
            </ul>
          </div>
        /*
         * A declared flow is an offer, not a launch: the press runs it
         * through the registry, where its actor, role and confirmation live.
         */
        case "app":
          return <Button variant="outline" className="repository-home-app" key={key}
            {...dynamicFlowProps(block.flow)} onClick={() => onRunCommand(block.flow)}>{block.title}</Button>
        case "prompt":
          return <div className="repository-home-block" key={key}>
            {block.title === undefined ? null : <h2>{block.title}</h2>}
            <Button variant="outline" {...dynamicFlowProps(block.flow ?? "chat.open")}
              onClick={() => onRunCommand(block.flow ?? "chat.open")}>{block.placeholder ?? "Ask Smithers"}</Button>
          </div>
        case "flows":
          return <div className="repository-home-block" key={key}>
            <h2>{block.title ?? "Flows"}</h2>
            <Button variant="outline" {...dynamicFlowProps("flows")} onClick={() => onRunCommand("flows")}>All flows</Button>
          </div>
        default:
          return null
      }
    })}
    <FilesAction treeCopyId={treeCopyId} onRunCommand={onRunCommand} />
  </section>
}
