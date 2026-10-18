import { pluralize } from "../../ui/pluralize"
import { useEffect, useRef, useState, type ReactNode } from "react"
import { Icon } from "../../../app/lib"
import { Link } from "../../../core/router"
import { commit, fmtDate, pull, repo, to } from "../../fixtures"
import type { Comment, Issue } from "../../fixtures/types"
import { AgentMark, Box, LabelChip, Markdown, PersonChip, RelTime } from "../../ui"
import { queueLanded, receiptStages } from "./model"

export const IssueLabels = ({ names }: { names: string[] }) => {
  return <span className="repo-issues-labels">{names.map(name => <IssueLabel key={name} name={name}/>)}</span>
}
const IssueLabel = ({ name }: { name: string }) => (
  <Link to={to(`issues?q=${encodeURIComponent(`is:open label:${name.includes(" ") ? `"${name}"` : name}`)}`)}>
    <LabelChip name={name}/>
  </Link>
)

export const FactoryReceipt = ({ issue, compact = false }: { issue: Issue; compact?: boolean }) => {
  const [wide, setWide] = useState(() => matchMedia("(min-width: 600px)").matches)
  useEffect(() => {
    const media = matchMedia("(min-width: 600px)")
    const resize = () => setWide(media.matches)
    media.addEventListener("change", resize)
    return () => media.removeEventListener("change", resize)
  }, [])
  const stages = receiptStages(issue)
  if (!stages.length) return null
  const landed = issue.receipt?.landed ? commit(issue.receipt.landed.sha) : undefined
  const linkedPull = issue.receipt?.review ? pull(issue.receipt.review.pull) : undefined
  const reviewers = linkedPull?.reviews.filter(review => review.state === "approved" && !review.agent) ?? []
  const current = stages.reduce((last, stage, index) => stage.date ? index : last, 0)
  return (
    <div className="repo-issues-receipt-block">
    <details className="repo-issues-receipt-disclosure" open={wide} key={String(wide)}>
    <summary>Stages</summary>
    <ol className={`repo-issues-receipt${compact ? " repo-issues-receipt-compact" : ""}`} style={{ gridTemplateColumns: `repeat(${stages.length}, minmax(0, 1fr))` }} aria-label="Factory evidence">
      {stages.map((stage, index) => (
        <li key={stage.name} data-complete={Boolean(stage.date)} data-neutral={Boolean(stage.date) || ["In review", "Landed"].includes(stage.name) || undefined} aria-current={index === current ? "step" : undefined}>
          <span className="repo-issues-receipt-dot" aria-hidden="true">
            {stage.date ? <Icon name="check" size={16}/> : <span/>}
          </span>
          <strong>{stage.label ?? stage.name}</strong>
          {stage.date && <Link className="repo-issues-step-evidence" to={to(stage.path)} aria-label={`${stage.label ?? stage.name}: ${stage.evidence}, ${fmtDate(stage.date)}`} title={`${stage.name} · ${stage.evidence} · ${fmtDate(stage.date)}`}>
            <time dateTime={stage.date}>{new Date(stage.date).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })}</time>
          </Link>}
        </li>
      ))}
    </ol>
    {!compact && landed && !queueLanded(issue) && <dl className="repo-issues-evidence-facts">
      <div><dt>Remote {repo.defaultBranch}</dt><dd><Link to={to(`commit/${landed.sha}`)}><code>{landed.sha}</code></Link></dd></div>
      <div><dt>Review</dt><dd>{reviewers.length ? reviewers.map(review => <PersonChip key={review.author} login={review.author} />) : "Evidence unavailable"}</dd></div>
      <div><dt>Checks</dt><dd>{landed.checks.length ? <Link to={to(`commit/${landed.sha}?checks=1`)}>{landed.checks.map(check => `${check.name}: ${check.state}`).join(" · ")}</Link> : "Evidence unavailable"}</dd></div>
      <div><dt>Merged by</dt><dd>{linkedPull?.merged ? <PersonChip login={linkedPull.merged.by} /> : "Evidence unavailable"}</dd></div>
    </dl>}
    </details>
    {landed && <p className="repo-issues-main-evidence" data-queue={queueLanded(issue)}>On main <Link to={to(`commit/${landed.sha}`)}><code>{landed.sha.slice(0, 7)}</code> ↗</Link></p>}
    </div>
  )
}

export const CommentBox = ({ comment, id, children, opened = false }: { comment: Comment; id?: string; children?: ReactNode; opened?: boolean }) => (
  <article className="repo-issues-comment" id={id}>
    <span className="repo-issues-comment-avatar"><PersonChip login={comment.author} compact/></span>
    <Box header={
      <div className="repo-issues-comment-heading">
        <strong>{comment.author}</strong>
        {comment.agent && <AgentMark agent={comment.agent}/>}
        <span>{opened ? "opened" : "commented"} <RelTime date={comment.date}/></span>
      </div>
    }>
      <div className="repo-issues-comment-body"><Markdown source={comment.body}/>{children}</div>
    </Box>
  </article>
)

export const MarkdownField = ({ id, label, value, onChange, initialPreview = false, required = false }: {
  id: string; label: string; value: string; onChange: (value: string) => void; initialPreview?: boolean; required?: boolean
}) => {
  const [preview, setPreview] = useState(initialPreview)
  return (
    <div className="repo-issues-markdown-field">
      <div className="repo-issues-write-tabs">
        <span id={`${id}-label`}>{label}</span>
        <div role="tablist" aria-label={`${label} mode`}>
          <button type="button" role="tab" id={`${id}-write-tab`} aria-selected={!preview} aria-controls={`${id}-panel`}
            title={`/issue.write ${id}`} onClick={() => setPreview(false)}>Write</button>
          <button type="button" role="tab" id={`${id}-preview-tab`} aria-selected={preview} aria-controls={`${id}-panel`}
            title={`/issue.preview ${id}`} onClick={() => setPreview(true)}>Preview</button>
        </div>
      </div>
      <div id={`${id}-panel`} role="tabpanel" aria-labelledby={`${id}-${preview ? "preview" : "write"}-tab`}>
        {preview ? (
          <div className="repo-issues-preview">{value.trim() ? <Markdown source={value}/> : <span className="repo-ui-muted">Nothing to preview.</span>}</div>
        ) : (
          <textarea className="repo-ui-input" id={id} aria-labelledby={`${id}-label`} rows={8}
            value={value} required={required} onChange={event => onChange(event.target.value)}
            placeholder="Add a description…"/>
        )}
      </div>
    </div>
  )
}

export const ConfirmCard = ({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) => {
  const card = useRef<HTMLElement>(null)
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    card.current?.focus({ preventScroll: true })
    return () => previous?.focus()
  }, [])
  return (
    <section className="repo-issues-confirm" role="region" aria-label={title} tabIndex={-1} ref={card}
      onKeyDown={event => { if (event.key === "Escape") onClose() }}>
      <div className="repo-issues-confirm-heading">
        <h3>{title}</h3>
        <button type="button" className="repo-ui-icon-btn" title="/cancel" aria-label="Dismiss confirmation" onClick={onClose}>
          <Icon name="x" size={15}/>
        </button>
      </div>
      {children}
    </section>
  )
}

export const CommentCount = ({ count }: { count: number }) => (
  <span className="repo-issues-count" aria-label={`${count} ${pluralize(count, "comment")}`}>
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
      <path d="M5 4h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H9l-6 4V6a2 2 0 0 1 2-2Z"/>
    </svg>
    {count}
  </span>
)
