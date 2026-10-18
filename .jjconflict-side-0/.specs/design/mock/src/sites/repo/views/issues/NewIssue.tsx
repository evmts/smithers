import { useEffect, useState } from "react"
import { useMock } from "../../../core/mock"
import { Link, navigate, useLocation } from "../../../core/router"
import { labels, people, repo, to } from "../../fixtures"
import { Failed, Loading, SignInWall, useView } from "../../frame"
import { ViewFrame as RepoFrame } from "../checklist/ViewFrame"
import { Box, LabelChip, PersonChip, toast } from "../../ui"
import { createIssue } from "./model"
import { MarkdownField } from "./shared"
import { useGitHubSync } from "../../frame/githubSync"

type Template = "bug" | "feature" | ""
type Draft = { template: Template; title: string; body: string; labels: string[]; assignees: string[] }
const templateBody = (template: Template) => template === "bug"
  ? "## What happened\n\n\n## Steps to reproduce\n\n1. \n\n## Expected behavior\n\n\n## Actual behavior\n\n"
  : template === "feature"
    ? "## Problem\n\n\n## Proposed change\n\n\n## Example\n\n"
    : ""
const draftKey = (template: Template) => `repo-issue-draft:${repo.slug}:${template || "blank"}`
const loadDraft = (template: Template): Draft => {
  try {
    const saved = JSON.parse(sessionStorage.getItem(draftKey(template)) ?? "null")
    if (saved && typeof saved.title === "string" && typeof saved.body === "string") {
      return {
        template: saved.template === "bug" || saved.template === "feature" ? saved.template : template,
        title: saved.title, body: saved.body, labels: saved.labels ?? [], assignees: saved.assignees ?? []
      }
    }
  } catch { /* An unavailable draft never blocks the form. */ }
  return { template, title: "", body: templateBody(template), labels: [], assignees: [] }
}
export const NewIssueLoading = () => <Loading variant="detail" rows={5}/>
export const NewIssueError = () => <Failed what="the issue form" reason={useGitHubSync().failure}/>
export const NewIssueSignedOut = () => (
  <div className="repo-issues-draft-wall">
    <SignInWall act="open an issue"><p>Drafting is allowed.</p></SignInWall>
  </div>
)

export const NewIssueBugContext = ({ query }: { query: URLSearchParams }) => {
  const values = [
    ["Route", query.get("route") ?? query.get("source") ?? `/${repo.slug}/issues`],
    ["Build", query.get("build") ?? "mock-preview"],
    ["Correlation ID", query.get("correlationId") ?? query.get("correlation") ?? "mock-sync-2102"]
  ]
  return (
    <dl className="repo-issues-bug-context" aria-label="Report context, read only">
      {values.map(([name, value]) => <div key={name}><dt>{name}</dt><dd>{value}</dd></div>)}
    </dl>
  )
}

export const NewIssueReady = ({ template, preview = false }: { template: Template; preview?: boolean }) => {
  const { flags } = useMock()
  const location = useLocation()
  const query = new URLSearchParams(location.split("?")[1])
  const [draft, setDraft] = useState<Draft>(() => loadDraft(template))
  const selectedTemplate = draft.template
  const [submitting, setSubmitting] = useState(false)
  const member = flags.as === "in" && flags.role === "member"
  const update = (patch: Partial<Draft>) => setDraft(current => ({ ...current, ...patch }))
  useEffect(() => {
    try { sessionStorage.setItem(draftKey(template), JSON.stringify(draft)) } catch { /* Drafting still works in memory. */ }
  }, [draft, template])
  const chooseTemplate = (next: Template) => {
    update({ template: next, body: templateBody(next) })
  }
  const toggle = (key: "labels" | "assignees", value: string) => update({
    [key]: draft[key].includes(value) ? draft[key].filter(item => item !== value) : [...draft[key], value]
  })
  return (
    <div className="repo-issues-new">
      <header className="repo-issues-new-heading">
        <Link className="repo-issues-back" to={to("issues")}>Issues</Link>
        <span className="repo-ui-muted" aria-hidden="true">/</span>
        <h1>New issue</h1>
        {flags.as !== "out" && <button form="repo-issues-publish" className="repo-ui-btn repo-ui-btn-primary" title="/issue.create" disabled={!draft.title.trim() || submitting}>Publish issue</button>}
      </header>
      {flags.as === "out" && <NewIssueSignedOut/>}
      <Box>
        <form id="repo-issues-publish" className="repo-issues-new-form" onSubmit={event => {
          event.preventDefault()
          if (flags.as === "out" || !draft.title.trim() || submitting) return
          setSubmitting(true)
          let body = draft.body
          if (selectedTemplate === "bug") {
            const route = query.get("route") ?? query.get("source") ?? `/${repo.slug}/issues`
            const build = query.get("build") ?? "mock-preview"
            const correlation = query.get("correlationId") ?? query.get("correlation") ?? "mock-sync-2102"
            body += `\n\n## Report context\n\nRoute: \`${route}\`\n\nBuild: \`${build}\`\n\nCorrelation ID: \`${correlation}\``
          }
          const created = createIssue(draft.title.trim(), body, member ? draft.labels : [], member ? draft.assignees : [])
          try { sessionStorage.removeItem(draftKey(template)) } catch { /* The issue has still been created. */ }
          navigate(to(`issues/${created.n}`))
          setTimeout(() => toast(`Issue #${created.n} created.`), 0)
        }}>
          <div className="repo-issues-templates" aria-label="Issue templates">
            <span>Template</span>
            <button type="button" className="repo-ui-btn" aria-pressed={selectedTemplate === "bug"}
              title="/issue.new template:bug" onClick={() => chooseTemplate("bug")}>Bug report</button>
            <button type="button" className="repo-ui-btn" aria-pressed={selectedTemplate === "feature"}
              title="/issue.new template:feature" onClick={() => chooseTemplate("feature")}>Feature request</button>
          </div>
          {selectedTemplate === "bug" && <details className="repo-issues-report-context"><summary>Report context</summary><NewIssueBugContext query={query}/></details>}
          <div className="repo-issues-title-field">
            <label htmlFor="repo-issues-new-title">Title <span aria-hidden="true">*</span></label>
            <input id="repo-issues-new-title" className="repo-ui-input" value={draft.title}
              onChange={event => update({ title: event.target.value })} placeholder="Give your issue a clear title" required/>
          </div>
          <MarkdownField id="repo-issues-new-body" label="Description" value={draft.body}
            onChange={body => update({ body })} initialPreview={preview}/>
          {member && (
            <div className="repo-issues-new-metadata">
              <details className="repo-ui-dropdown">
                <summary className="repo-ui-btn" title="/issue.labels">Labels {draft.labels.length > 0 && <span>{draft.labels.length}</span>}</summary>
                <div className="repo-ui-menu">
                  {labels.map(label => (
                    <label className="repo-issues-check-option" key={label.name}>
                      <input type="checkbox" checked={draft.labels.includes(label.name)} onChange={() => toggle("labels", label.name)}/>
                      <LabelChip label={label}/>
                    </label>
                  ))}
                </div>
              </details>
              <details className="repo-ui-dropdown">
                <summary className="repo-ui-btn" title="/issue.assignees">Assignees {draft.assignees.length > 0 && <span>{draft.assignees.length}</span>}</summary>
                <div className="repo-ui-menu">
                  {people.filter(person => person.kind === "human").map(person => (
                    <label className="repo-issues-check-option" key={person.login}>
                      <input type="checkbox" checked={draft.assignees.includes(person.login)} onChange={() => toggle("assignees", person.login)}/>
                      <PersonChip login={person.login}/>
                    </label>
                  ))}
                </div>
              </details>
              <div className="repo-issues-new-selected">
                {draft.labels.map(name => <LabelChip key={name} name={name}/>)}
                {draft.assignees.map(login => <PersonChip key={login} login={login} compact/>)}
              </div>
            </div>
          )}
          <div className="repo-issues-public-note">
            <strong>What becomes public</strong>
            <p>{repo.visibility === "public"
              ? "Your title, description and comments are public. Keep secrets out."
              : "This issue is visible to people with repository access. Keep secrets out."}</p>
          </div>
          <div className="repo-issues-new-actions">
            <Link className="repo-ui-btn repo-ui-btn-quiet" title="/cancel" to={to("issues")}>Cancel</Link>

          </div>
        </form>
      </Box>
    </div>
  )
}
export const NewIssuePreview = ({ template }: { template: Template }) => <NewIssueReady template={template} preview/>
export const NewIssue = () => {
  const location = useLocation()
  const query = new URLSearchParams(location.split("?")[1])
  const value = query.get("template")
  const template: Template = value === "bug" || value === "feature" ? value : ""
  const state = useView(`new-issue:${repo.slug}`)
  return (
    <RepoFrame tab="issues" title={`New issue · ${repo.slug}`} askView="issue" askContext={`a new issue in ${repo.slug}`}>
      {state === "loading" ? <NewIssueLoading/> : state === "error" ? <NewIssueError/> : query.get("mode") === "preview" ? (
        <NewIssuePreview key={`${repo.slug}:${template}:preview`} template={template}/>
      ) : <NewIssueReady key={`${repo.slug}:${template}`} template={template}/>}
    </RepoFrame>
  )
}
