import { Button, Markdown } from "@smthrs/ui"
import type { RepositoryHome } from "@smthrs/rpc/RepositoryHome"
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
          return <div className="repository-home-block" key={key}>
            {block.title === undefined ? null : <h2>{block.title}</h2>}
            <p className="repository-home-notice" role="status">Stack unavailable</p>
          </div>
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
