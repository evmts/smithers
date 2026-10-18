import { useEffect, useRef, useState, type ReactNode } from "react"
import { useMock } from "../../../core/mock"
import { Link, navigate, useLocation } from "../../../core/router"
import { pull, repo, tags, to } from "../../fixtures"
import type { Release } from "../../fixtures/types"
import { Denied, Empty, Failed, Loading, registerSlash, SignInWall, useView, usePackageScope } from "../../frame"
import { ViewFrame as RepoFrame } from "../checklist/ViewFrame"
import { AgentMark, Box, Icon, Markdown, PageHeader, PersonChip, RelTime, StateIcon, toast } from "../../ui"
import {
  generateNotes, makeRelease, notesRun, readPublished, releaseList,
  releaseMarkdown, releaseTagError, savePublished, sourceSize
} from "./release-data"

const draftRoute = () => to("releases?draft=1")

const DraftButton = () => (
  <Link className="repo-ui-btn" title="/release.draft" to={draftRoute()}>
    Draft a new release
  </Link>
)

export const ReleasesLoading = () => <Loading variant="detail" rows={7} />
export const ReleasesError = () => <Failed what="releases" reason="The repository host didn't return the releases." />
export const ReleasesDenied = () => <Denied act="draft a release" />
export const ReleasesSignIn = () => <SignInWall act="draft a release" />

export const ReleasesEmpty = () => {
  const { flags } = useMock()
  return <Empty title="No releases yet" action={flags.as === "in" && flags.role === "member" ? <DraftButton /> : undefined} />
}

const ReleaseAssets = () => (
  <section className="repo-releases-assets" aria-label="Release assets">
    <h3>Assets</h3>
    <div>
      <Icon name="file" size={14} />
      <span>Source code (zip)</span>
      <span className="repo-releases-asset-size">{sourceSize()}</span>
    </div>
    <div>
      <Icon name="file" size={14} />
      <span>Source code (tar.gz)</span>
      <span className="repo-releases-asset-size">{sourceSize()}</span>
    </div>
  </section>
)

export const ReleaseCard = ({ item }: { item: Release }) => {
  const { withScope } = usePackageScope()
  const drafted = notesRun(item)
  return (
    <article className="repo-releases-entry">
      <aside className="repo-releases-meta">
        <RelTime date={item.date} />
        <Link className="repo-releases-tag" to={withScope(to(`tree/${encodeURIComponent(item.tag)}`))}>
          <code>{item.tag}</code>
        </Link>
      </aside>
      <Box className="repo-releases-card">
        <header className="repo-releases-card-header">
          <div className="repo-releases-card-title">
            <h2>
              <Link to={withScope(to(`releases/tag/${encodeURIComponent(item.tag)}`))}>{item.name}</Link>
            </h2>
            {item.latest && <span className="repo-releases-latest">Latest</span>}
            {item.prerelease && <span className="repo-releases-prerelease">Pre-release</span>}
          </div>
          <div className="repo-releases-publisher">
            {drafted ? (
              <>
                <span>Notes drafted by the {drafted.flow} flow in</span>
                <Link to={withScope(to(`runs/${drafted.id}`))}>run {drafted.id}</Link>
                <AgentMark run={drafted.id} />
                <span>; published by</span>
              </>
            ) : <span>Published by</span>}
            <PersonChip login={item.author} />
          </div>
        </header>
        <div className="repo-releases-notes">
          <Markdown source={releaseMarkdown(item.body)} />
        </div>
        {item.pulls.length > 0 && (
          <section className="repo-releases-changes" aria-label="Landed changes">
            <h3>Landed changes</h3>
            {item.pulls.map(n => {
              const change = pull(n)
              return (
                <div className="repo-releases-change" key={n}>
                  <StateIcon state="merged" size={15} />
                  <Link to={withScope(to(`pull/${n}`))}>{change?.title ?? `Pull request #${n}`}</Link>
                  <span>#{n}</span>
                  {change?.agent && <AgentMark agent={change.agent} />}
                </div>
              )
            })}
          </section>
        )}
        <ReleaseAssets />
      </Box>
    </article>
  )
}

export const ReleasesReady = ({ items }: { items: Release[] }) => (
  <div className="repo-releases-list">
    {items.map(item => <ReleaseCard key={item.tag} item={item} />)}
  </div>
)
export const ReleasesSignedOut = ReleasesReady
export const ReleasesReader = ReleasesReady

export const ReleaseNotFound = ({ tag }: { tag: string }) => (
  <Empty
    title={`No release at ${tag}`}
    action={<Link className="repo-ui-btn" to={to("releases")}>All releases</Link>}
  />
)

export const ReleaseReady = ({ item, items }: { item: Release; items: Release[] }) => {
  const { withScope } = usePackageScope()
  const position = items.findIndex(release => release.tag === item.tag)
  const newer = items[position - 1]
  const older = items[position + 1]
  return (
    <>
      <ReleaseCard item={item} />
      <nav className="repo-releases-pagination" aria-label="Release navigation">
        <span>
          {older && <Link to={withScope(to(`releases/tag/${encodeURIComponent(older.tag)}`))}>← {older.tag}</Link>}
        </span>
        <span>
          {newer && <Link to={withScope(to(`releases/tag/${encodeURIComponent(newer.tag)}`))}>{newer.tag} →</Link>}
        </span>
      </nav>
    </>
  )
}
export const ReleaseLoading = ReleasesLoading
export const ReleaseError = ReleasesError
export const ReleaseEmpty = ReleasesEmpty
export const ReleaseSignedOut = ReleaseReady
export const ReleaseReader = ReleaseReady

export const ReleaseDraft = ({ items, onPublish }: { items: Release[]; onPublish: (item: Release) => void }) => {
  const [tagChoice, setTagChoice] = useState("__new__")
  const [newTag, setNewTag] = useState("")
  const [title, setTitle] = useState("")
  const [notes, setNotes] = useState("")
  const [tagError, setTagError] = useState("")
  const [generated, setGenerated] = useState(false)
  const [pendingRelease, setPendingRelease] = useState<Release | null>(null)
  const form = useRef<HTMLFormElement>(null)
  const tag = tagChoice === "__new__" ? newTag.trim() : tagChoice
  const availableTags = tags.filter(item => !items.some(release => release.tag === item.name))
  useEffect(() => {
    const offConfirm = registerSlash("release.publish.confirm", {
      purpose: "Confirm publication", fields: [], confirm: false,
      run: () => { if (!pendingRelease) throw new Error("Review a release draft first."); onPublish(pendingRelease) }
    })
    const offCancel = registerSlash("release.publish.cancel", {
      purpose: "Cancel publication", fields: [], confirm: false, access: "public", run: () => setPendingRelease(null)
    })
    return () => { offConfirm(); offCancel() }
  }, [pendingRelease, onPublish])
  const generate = () => {
    if (!tag) {
      form.current?.querySelector<HTMLInputElement>("#repo-releases-new-tag")?.reportValidity()
      form.current?.querySelector<HTMLInputElement>("#repo-releases-new-tag")?.focus()
      return
    }
    setNotes(generateNotes(tag))
    setGenerated(true)
    toast("Release notes generated.")
  }
  useEffect(() => { form.current?.querySelector<HTMLElement>("select")?.focus() }, [])
  useEffect(() => registerSlash("release.notes", {
    purpose: "Generate notes from landed changes",
    fields: [{ name: "tag", label: "Tag", required: false }],
    confirm: false,
    run: ({ tag: value }, { closeAsk }) => {
      const selected = value || tag
      if (!selected) {
        closeAsk()
        form.current?.querySelector<HTMLInputElement>("#repo-releases-new-tag")?.focus()
        return
      }
      if (value) { setTagChoice("__new__"); setNewTag(value) }
      setNotes(generateNotes(selected))
      setGenerated(true)
      toast("Release notes generated.")
      closeAsk()
    }
  }), [tag])
  return (
    <Box className="repo-releases-draft" header="Draft a new release">
      <form
        ref={form}
        className="repo-releases-draft-form"
        onChange={() => setPendingRelease(null)}
        onSubmit={event => {
          event.preventDefault()
          if (!tag) return
          const error = releaseTagError(tag) ?? (items.some(item => item.tag === tag) ? "That tag already has a release." : undefined)
          if (error) {
            setTagError(error)
            form.current?.querySelector<HTMLInputElement>("#repo-releases-new-tag")?.focus()
            return
          }
          const missing = [...event.currentTarget.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>("[required]")]
            .find(field => !field.value.trim())
          if (missing) {
            missing.setCustomValidity("Enter a value.")
            missing.reportValidity()
            missing.setCustomValidity("")
            missing.focus()
            return
          }
          setPendingRelease(makeRelease(tag, title, notes))
        }}
      >
        <div className="repo-releases-draft-fields">
        <div className="repo-releases-tag-fields">
          <div className="repo-releases-field">
            <label htmlFor="repo-releases-tag">Tag</label>
            <select
              className="repo-ui-input"
              id="repo-releases-tag"
              value={tagChoice}
              onChange={event => {
                setTagChoice(event.target.value)
                setTagError("")
                setGenerated(false)
                if (!title || title === tag) setTitle(event.target.value === "__new__" ? newTag : event.target.value)
              }}
            >
              <option value="__new__">Create a new tag</option>
              {availableTags.map(item => <option key={item.name} value={item.name}>{item.name}</option>)}
            </select>
          </div>
          {tagChoice === "__new__" && (
            <div className="repo-releases-field">
              <label htmlFor="repo-releases-new-tag">New tag</label>
              <input
                className="repo-ui-input"
                id="repo-releases-new-tag"
                value={newTag}
                required
                placeholder="v1.0.0"
                aria-invalid={Boolean(tagError)}
                aria-describedby={tagError ? "repo-releases-tag-error" : undefined}
                onChange={event => {
                  setNewTag(event.target.value)
                  setTagError("")
                  setGenerated(false)
                  if (!title || title === newTag) setTitle(event.target.value)
                }}
              />
              {tagError && <span id="repo-releases-tag-error" className="repo-releases-field-error" role="alert">{tagError}</span>}
            </div>
          )}
        </div>
        <div className="repo-releases-field">
          <label htmlFor="repo-releases-title">Release title</label>
          <input
            className="repo-ui-input"
            id="repo-releases-title"
            value={title}
            required
            onChange={event => setTitle(event.target.value)}
          />
        </div>
        <div className="repo-releases-field">
          <div className="repo-releases-notes-label">
            <label htmlFor="repo-releases-notes">Release notes</label>
            <button className="repo-ui-btn" type="button" title={`/release.notes ${tag}`} onClick={generate}>
              Generate notes from landed changes
            </button>
          </div>
          <textarea
            className="repo-ui-input"
            id="repo-releases-notes"
            value={notes}
            required
            rows={10}
            onChange={event => { setNotes(event.target.value); setGenerated(false) }}
          />
          {generated && <span className="repo-ui-sr" role="status">Notes filled from landed changes.</span>}
        </div>
        </div>
        <footer className="repo-releases-draft-actions">
          {pendingRelease ? <>
            <p>{pendingRelease.author} will publish <code>{pendingRelease.tag}</code>.</p>
            <div className="repo-ui-actions">
              <button type="button" className="repo-ui-btn repo-ui-btn-primary" title={`/release.publish.confirm ${tag}`} onClick={() => onPublish(pendingRelease)}>Confirm publish</button>
              <button type="button" className="repo-ui-btn repo-ui-btn-quiet" title="/release.publish.cancel" onClick={() => setPendingRelease(null)}>Cancel</button>
            </div>
          </> : <div className="repo-ui-actions">
            <button className="repo-ui-btn repo-ui-btn-primary" title={`/release.publish ${tag}`} disabled={!tag || !title.trim() || !notes.trim()}>Publish release</button>
            <Link className="repo-ui-btn repo-ui-btn-quiet" title="/release.cancel" to={to("releases")}>Cancel</Link>
          </div>}
        </footer>
      </form>
    </Box>
  )
}

export type ReleasesConfiguration = {
  items: Release[]
  action?: ReactNode
  title?: string
  emptyTitle?: string
  footer?: ReactNode
}

const ReleasesContent = ({ tag, configuration }: { tag?: string; configuration?: ReleasesConfiguration }) => {
  const { flags, set } = useMock()
  const state = useView(`releases:${repo.slug}:${tag ?? "list"}`)
  const location = useLocation()
  const query = new URLSearchParams(location.split("?")[1])
  const { withScope } = usePackageScope()
  const draft = !configuration && query.get("draft") === "1"
  const [local, setLocal] = useState(readPublished)
  const items = flags.data === "empty" ? [] : configuration?.items ?? releaseList(local)
  const item = items.find(release => release.tag === tag)
  const member = flags.as === "in" && flags.role === "member"
  const publish = (added: Release) => {
    const next = [added, ...local]
    savePublished(next)
    setLocal(next)
    set({ data: "full" })
    navigate(to(`releases/tag/${encodeURIComponent(added.tag)}`))
    toast(`Published ${added.tag}.`)
  }
  useEffect(() => {
    const cleanup = [
      registerSlash("release.draft", {
        purpose: "Draft a new release", fields: [], confirm: false,
        run: (_, { closeAsk }) => { navigate(draftRoute()); closeAsk() }
      }),
      registerSlash("release.publish", {
        purpose: "Publish a release",
        fields: [
          { name: "tag", label: "Tag" },
          { name: "title", label: "Release title" },
          { name: "notes", label: "Release notes", type: "textarea" }
        ],
        confirm: "Publish this release?",
        run: ({ tag: value, title, notes }, { closeAsk }) => {
          if (items.some(item => item.tag === value)) throw new Error("That tag already has a release.")
          publish(makeRelease(value, title, notes))
          closeAsk()
        }
      }),
      registerSlash("release.cancel", {
        purpose: "Close the release draft", fields: [], access: "public", confirm: false,
        run: (_, { closeAsk }) => { navigate(to("releases")); closeAsk() }
      })
    ]
    return () => cleanup.forEach(dispose => dispose())
  }, [repo.slug, local, flags.data])
  const Ready = flags.as === "out" ? ReleasesSignedOut : flags.role === "reader" ? ReleasesReader : ReleasesReady
  const Single = flags.as === "out" ? ReleaseSignedOut : flags.role === "reader" ? ReleaseReader : ReleaseReady
  const action = configuration ? configuration.action : member && !draft && items.length > 0 && state !== "loading" && state !== "error" ? <DraftButton /> : undefined
  return (
    <div className="repo-releases-page">
      <PageHeader title={draft ? "New release" : tag ?? configuration?.title ?? "Releases"} actions={action}>
        <nav className="repo-releases-subnav" aria-label="Releases and tags">
          <Link to={withScope(to("releases"))} aria-current={!draft && !tag ? "page" : undefined}>Releases</Link>
          <Link to={withScope(to("tags"))}>Tags</Link>
        </nav>
      </PageHeader>
      {state === "loading" ? <ReleasesLoading />
        : state === "error" ? <ReleasesError />
        : draft ? flags.as === "out" ? <ReleasesSignIn />
          : !member ? <ReleasesDenied /> : <ReleaseDraft items={items} onPublish={publish} />
        : !items.length ? configuration ? <Empty title={configuration.emptyTitle ?? "No releases yet"} /> : <ReleasesEmpty />
        : tag ? item ? <Single item={item} items={items} /> : <ReleaseNotFound tag={tag} />
        : <Ready items={items} />}
      {state !== "loading" && state !== "error" && configuration?.footer}
    </div>
  )
}

export const Releases = ({ tag, configuration }: { tag?: string; configuration?: ReleasesConfiguration }) => (
  <RepoFrame tab="code" title={`${tag ?? "Releases"} · ${repo.slug}`} askView="releases" askContext={`${repo.slug} · releases${tag ? ` · ${tag}` : ""}`}>
    <ReleasesContent key={repo.slug} tag={tag} configuration={configuration} />
  </RepoFrame>
)
