import { flowAction, flowProps, dynamicFlowProps } from "../flows/FlowAction"
import { flowArgs } from "../flows/FlowArgs"
import { FailureNotice, unavailableFailure } from "../FailureNotice"
import { markdownBlockParser } from "@smthrs/ui/markdown"
import { cloneElement, createElement, isValidElement, useContext, useId, useState, type ReactNode } from "react"
import { ChevronRight, CircleDot, Clock, ExternalLink, FileText, Folder, GitBranch, GitPullRequest } from "lucide-react"
import { ageLabel } from "../Timestamps"
import { ControllerContext } from "../ControllerContext"
import { RepositoryAskContext, RepositoryAskOpenContext } from "./RepoFrame"
import type { RepositoryBranches } from "../state/seams/RepositoryBranchesSeam"
import type { LatestCommit } from "../state/seams/LatestCommitSeam"
import type { RepoTreeRow } from "../state/AppState"
import type { RepositoryHome } from "@smthrs/rpc/RepositoryHome"
import { RepositoryHomeView, type RepositoryHomeAnswer } from "../cards/RepositoryHomeView"
import type { RunDynamicCommand } from "../cards/CardFamily"
import "./code-home.css"

// Reuse the shared safe parser, substituting native heading elements for its
// transcript typography wrappers. Fences, inline formatting and links stay shared.
export function RepositoryMarkdown({ content }: { content: string }) {
  const semantic = (node: ReactNode): ReactNode => {
    if (Array.isArray(node)) return node.map(semantic)
    if (!isValidElement<{ className?: string; children?: ReactNode }>(node)) return node
    const level = /sui-md-h([1-6])(?:\s|$)/.exec(node.props.className ?? "")?.[1]
    if (level) return createElement(`h${level}`, { key: node.key, className: node.props.className }, node.props.children)
    return cloneElement(node, undefined, semantic(node.props.children))
  }
  return <div className="repo-ui-markdown sui-md">{semantic(markdownBlockParser.render(content))}</div>
}

export const REPOSITORY_CLONE_HOST = "https://api.smithers.sh"

type HomeBlock = Extract<RepositoryHome, { kind: "blocks" }>["blocks"][number]
type AppBlock = Extract<HomeBlock, { type: "app" }>
type PromptBlock = Extract<HomeBlock, { type: "prompt" }>

/** The declared home's order (repo-ui-spec view 1): text, prompt, links, Fixed by agents (markdown), the live blocks, then the apps row. */
const BLOCK_ORDER: Record<HomeBlock["type"], number> = { text: 0, prompt: 1, links: 2, markdown: 3, stack: 4, flows: 5, view: 6, app: 7 }
const isReadmeBlock = (block: HomeBlock): boolean => block.type === "markdown" && /readme/i.test(block.path)

/** The quiet door a visitor meets in the prompt block's place: "Sign in to ask about Smithers". */
export const signInToAskLabel = (title: string): string =>
  /^ask\b/i.test(title) ? `Sign in to ${title[0]!.toLowerCase()}${title.slice(1)}` : "Sign in to ask"

const Box = ({ header, children }: { header?: ReactNode; children: ReactNode }) =>
  <div className="repo-ui-box">{header && <div className="repo-ui-box-header">{header}</div>}{children}</div>

/**
 * The prompt block (Design (B)): the home's own title; signed out, ONE quiet
 * sign-in button; signed in (or an admitted guest), an input plus Send that
 * opens Ask with the question. It steps aside while the Ask is open, so the
 * page has one prompt. No draft lives here: the text goes to the conversation
 * on Send and nowhere else.
 */
function HomePrompt({ block, canAsk, onRunCommand }: { block: PromptBlock; canAsk: boolean; onRunCommand: RunDynamicCommand }) {
  const openAsk = useContext(RepositoryAskContext)
  const askOpen = useContext(RepositoryAskOpenContext)
  const id = useId()
  const title = block.title ?? block.placeholder ?? "Ask"
  if (askOpen) return null
  const open = (runCommand: RunDynamicCommand) => { if (openAsk) openAsk(runCommand); else runCommand(canAsk ? "chat.open" : "sign-in") }
  if (!canAsk) {
    return <Box header={title}><div className="repo-code-home-block">
      <button type="button" className="repo-ui-btn" {...flowProps("sign-in")} onClick={() => open(onRunCommand)}>{signInToAskLabel(title)}</button>
    </div></Box>
  }
  return <Box header={title}>
    <form className="repo-code-home-block" onSubmit={event => {
      event.preventDefault()
      const form = event.currentTarget
      const text = String(new FormData(form).get("ask") ?? "").trim()
      if (!text) return
      open(onRunCommand)
      // chat.send's line IS the text (SlashPayload), as the composer sends its draft.
      onRunCommand("chat.send", text)
      form.reset()
    }}>
      <label className="repo-ui-sr" htmlFor={id}>{title}</label>
      <input className="repo-ui-input" id={id} name="ask" placeholder={block.placeholder ?? ""} required autoComplete="off" />
      <div className="repo-ui-actions"><button type="submit" className="repo-ui-btn" {...flowProps("chat.send")}>Send</button></div>
    </form>
  </Box>
}

const APP_ICONS = { issue: CircleDot, review: GitPullRequest, schedule: Clock, wiki: FileText } as const

/** Members' app blocks in one wrapped row (Design (C)); only flows this host serves are offered. */
const HomeApps = ({ blocks, onRunCommand }: { blocks: ReadonlyArray<AppBlock>; onRunCommand: RunDynamicCommand }) =>
  <div className="repo-code-home-apps" role="group" aria-label="Repository apps">
    {blocks.map((block, index) => {
      const Icon = APP_ICONS[block.picture]
      return <button type="button" key={`${block.flow}:${index}`} className="repo-code-home-app" {...dynamicFlowProps(block.flow)} onClick={() => onRunCommand(block.flow)}>
        <Icon size={18} aria-hidden="true" /><span>{block.title}</span>
      </button>
    })}
  </div>

const HomeLinks = ({ block }: { block: Extract<HomeBlock, { type: "links" }> }) => {
  const nav = <nav className="repo-code-home-links" aria-label={block.title ?? "Repository links"}>
    {block.links.map(link => /^https?:/i.test(link.url)
      ? <a key={link.url} href={link.url} target="_blank" rel="noopener noreferrer">{link.label}<ExternalLink size={13} aria-hidden="true" /></a>
      : <a key={link.url} href={link.url}>{link.label}<ChevronRight size={13} aria-hidden="true" /></a>)}
  </nav>
  return block.title === undefined ? nav : <Box header={block.title}><div className="repo-code-home-block">{nav}</div></Box>
}

export function CodeHome({ repo, branch, branches, latestCommit, onBranchesOpen, treeAvailable = true, onRunCommand, tree, home, member, canAsk = false, readme: readmeRead }: {
  repo: string; branch?: string; branches?: RepositoryBranches
  /** The head's record (LatestCommitSeam.LatestCommit) read for this admission; absent, there is no row. */
  latestCommit?: LatestCommit
  onBranchesOpen?: () => void; onRunCommand: RunDynamicCommand; treeAvailable?: boolean; tree?: RepoTreeRow; home?: RepositoryHomeAnswer
  /** The viewer is a member of this repository; app blocks are offered only then (app-spec row 6). */
  member?: boolean
  /** The viewer can Ask here (a member, or an admitted guest); otherwise the prompt block is a sign-in door. */
  canAsk?: boolean
  /** The repository README read from the tree, for a declared home that carries none (RepositorySubjectEntry): its state, so a failed read is shown as one, never as no README. */
  readme?: { readonly state: "loading" | "ready" | "failed"; readonly name: string; readonly markdown?: string; readonly error?: string }
}) {
  const [filter, setFilter] = useState("")
  const controller = useContext(ControllerContext)
  const openAsk = useContext(RepositoryAskContext)
  // A block's chat.open opens the frame's Ask (the disclosure the frame owns), as the header's Ask does; every other flow runs as it is.
  const run: RunDynamicCommand = (flow, args) => { if (flow === "chat.open" && openAsk) openAsk(onRunCommand); else onRunCommand(flow, args) }
  const names = branches?.state === "ready" ? branches.names : branch ? [branch] : []
  const fullSha = /^[a-f0-9]{40}$/i.test(filter)
  const base = `/${repo}`
  const ref = branch === undefined ? undefined : branch.split("/").map(encodeURIComponent).join("/")
  // The server's README answer first, then the declared home's README block, then the tree's own README for a declared home without one.
  const readme = home?.kind === "readme" ? { name: "README.md", markdown: home.markdown }
    : home?.kind === "blocks" ? home.blocks.flatMap(block => block.type === "markdown" && isReadmeBlock(block) ? [{ name: block.path.split("/").at(-1) ?? block.path, markdown: block.markdown }] : [])[0]
      ?? (readmeRead?.state === "ready" && readmeRead.markdown !== undefined ? { name: readmeRead.name, markdown: readmeRead.markdown } : undefined)
    : undefined
  // A tree README whose read failed is shown as a failure in its own region (an error is never shown as empty); a repository with no README shows nothing.
  const readmeFailed = readme === undefined && home?.kind === "blocks" && readmeRead?.state === "failed" ? readmeRead : undefined
  // App blocks render for members only, and only when this host's registry serves the flow: never a dead control. Outside a controller (a bare mount) nothing is known, and unknown is offered, never hidden.
  const blocks = home?.kind === "blocks" ? home.blocks
    .filter(block => !isReadmeBlock(block) && (block.type !== "app" || (member === true && (controller === null || controller.commands.find(block.flow) !== undefined))))
    .sort((left, right) => BLOCK_ORDER[left.type] - BLOCK_ORDER[right.type]) : []
  const apps = blocks.filter((block): block is AppBlock => block.type === "app")
  return <div className="repo-code-home-layout"><div className="repo-code-home-main">
    <div className="repo-code-home-toolbar">
      {branch && <details className="repo-ui-dropdown" onToggle={event => { if (event.currentTarget.open) onBranchesOpen?.() }}><summary className="repo-ui-btn"><GitBranch size={16}/>{branch}</summary><div className="repo-ui-menu repo-ui-branch-menu">
        <input className="repo-ui-input" aria-label="Filter branches or enter full SHA" placeholder="Find a branch or full SHA…" value={filter} onChange={event => setFilter(event.target.value)}/>
        {branches?.state === "loading" && <p role="status">Loading…</p>}
        {branches?.state === "failed" && <FailureNotice failure={unavailableFailure("repository.branches", "Couldn’t load branches.", branches.error ?? "")} />}
        {names.filter(name => name.toLowerCase().includes(filter.toLowerCase())).map(name => <a key={name} className="repo-ui-menu-item" aria-label={name} href={`${base}/tree/${name.split("/").map(encodeURIComponent).join("/")}`}><span>{name}</span>{branches?.commits?.[name] && <code>{branches.commits[name]}</code>}</a>)}
        {fullSha && <a className="repo-ui-menu-item" href={`${base}/tree/${filter}`}>{filter}</a>}
        {branches?.state === "ready" && !fullSha && !names.some(name => name.toLowerCase().includes(filter.toLowerCase())) && <p className="repo-ui-muted">No branches found.</p>}
      </div></details>}
      {branches?.state === "ready" && <span className="repo-ui-muted">{branches.names.length} {branches.names.length === 1 ? "branch" : "branches"}</span>}
      <div className="repo-code-home-toolbar-spacer"/>
      <details className="repo-ui-dropdown repo-code-home-code-menu"><summary className="repo-ui-btn">Code</summary><div className="repo-ui-menu"><h3>Clone</h3><div className="repo-code-home-command"><code>{`git clone ${REPOSITORY_CLONE_HOST}/${repo}.git`}</code><button className="repo-ui-btn" aria-label="Copy clone URL" {...flowAction(onRunCommand, "chat.copy-message", flowArgs("chat.copy-message", { text: `git clone ${REPOSITORY_CLONE_HOST}/${repo}.git` }))}>Copy</button></div></div></details>
    </div>
    {/* The declared home (Design (A)): below the toolbar, in spec order, with no Files button (Design (D)): the file table is right here. */}
    {home?.kind === "error" && <RepositoryHomeView repo={repo} home={home} treeCopyId={undefined} onRunCommand={onRunCommand} />}
    {blocks.map((block, index) => {
      const key = `${block.type}:${index}`
      switch (block.type) {
        case "text": return <div key={key} className="repo-code-home-block repo-code-home-intro">{block.title !== undefined && <h2>{block.title}</h2>}<p>{block.text}</p></div>
        case "prompt": return <HomePrompt key={key} block={block} canAsk={canAsk} onRunCommand={onRunCommand} />
        case "links": return <HomeLinks key={key} block={block} />
        case "markdown": return <Box key={key} header={block.title}><div className="repo-code-home-block"><RepositoryMarkdown content={block.markdown} /></div></Box>
        case "app": return null
        default: return <RepositoryHomeView key={key} repo={repo} home={{ kind: "blocks", blocks: [block] }} treeCopyId={undefined} member={member} onRunCommand={run} />
      }
    })}
    {apps.length > 0 && <HomeApps blocks={apps} onRunCommand={run} />}
    <section className="repo-ui-box repo-code-home-files" aria-label="Files">
      {/* The head's own record: message, author and age, the id as text (this host has no commit view to link it to). No record read for this viewer, no row: never a bare commit id. */}
      {latestCommit && <div className="repo-code-home-latest" role="group" aria-label="Latest commit">
        {latestCommit.author && <strong>{latestCommit.author}</strong>}
        <span className="repo-code-home-latest-title">{latestCommit.title}</span>
        <code className="repo-code-home-sha">{latestCommit.shortSha}</code>
        {latestCommit.committedAt && <time className="repo-ui-time" dateTime={latestCommit.committedAt}>{ageLabel(latestCommit.committedAt)}</time>}
      </div>}
      {!treeAvailable ? <div className="repo-frame-state" role="alert"><h2>Couldn't load repository files.</h2></div> : tree === undefined || tree.state === "loading" ? <div className="repo-frame-state" role="status">Loading…</div> : tree.state === "failed" ? <FailureNotice className="repo-frame-state" failure={unavailableFailure("repository.files", "Couldn’t load repository files.", tree.error ?? "")} /> : tree.entries.length === 0 ? <div className="repo-frame-state"><h2>This repository is empty.</h2></div> : <div role="table" aria-label="Repository files"><div className="repo-ui-sr" role="row"><span role="columnheader">Name</span></div>{tree.entries.map(entry => <div className="repo-code-home-file-row" role="row" key={entry.name}><span role="cell">{ref ? <a href={`${base}/${entry.kind === "dir" ? "tree" : "blob"}/${ref}/${encodeURIComponent(entry.name)}`}>{entry.kind === "dir" ? <Folder size={16}/> : <FileText size={16}/>} {entry.name}</a> : <>{entry.kind === "dir" ? <Folder size={16}/> : <FileText size={16}/>} {entry.name}</>}</span></div>)}</div>}
    </section>
    {readme !== undefined && <section className="repo-ui-box" aria-label="README"><div className="repo-ui-box-header">{readme.name}</div><div className="repo-code-home-readme"><RepositoryMarkdown content={readme.markdown}/></div></section>}
    {readmeFailed !== undefined && <section className="repo-ui-box" aria-label="README"><div className="repo-ui-box-header">{readmeFailed.name}</div><FailureNotice className="repo-frame-state" failure={unavailableFailure("repository.readme", "Couldn’t load this file.", readmeFailed.error ?? "")} /></section>}
  </div></div>
}
