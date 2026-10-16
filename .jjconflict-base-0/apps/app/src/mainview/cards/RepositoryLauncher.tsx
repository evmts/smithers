import { useState, useSyncExternalStore } from "react"
import { Button, Input } from "@smthrs/ui"
import { flowAction } from "../flows/FlowAction"
import { repositoryInputTarget } from "../RepoLink"
import type { RunCommand } from "./CardFamily"
import { useController } from "../ControllerContext"
import type { LauncherCatalogAnswer, SmithersUpdate, SmithersUpdatesAnswer } from "../state/seams/LauncherSeam"
import "./RepositoryLauncher.css"

/*
 * The launcher at `/` (mvp.md M-45): open a repository Smithers already has,
 * create one, explore the others, and read genuine Smithers update news.
 *
 * Every row is a link to that repository's own address, `/owner/name`, the
 * same path GitHub uses, and the Open box goes to exactly that address too.
 * One mechanism serves open, type-to-open and explore, a deep link is
 * copyable, Back and Forward work, and the route itself (RepoLink.ts) owns
 * selection, admission, import, installation and every refusal — the
 * launcher reports nothing about a repository it has not opened.
 *
 * Signed out nothing here signs anybody in. The public shelf and the update
 * news are readable, and the acts that need an account say so and carry the
 * ONE existing sign-in door, pressed by the person: at `/` the launcher is
 * the opening (#4041), so the door a signed-out visitor needs is here rather
 * than on a welcome screen in front of everything they can already read.
 */

/** A repository the launcher can offer: the row as the collection holds it. */
export interface LauncherRepository {
  readonly id: string
  /** True for a row the public catalog supplied; those are the explore shelf. */
  readonly catalog?: boolean
  readonly summary?: string
}

export interface RepositoryLauncherProps {
  /** The repositories collection: the account's own rows and the public catalog's. */
  readonly repositories: ReadonlyArray<LauncherRepository>
  readonly updates: SmithersUpdatesAnswer | undefined
  readonly catalogRead: LauncherCatalogAnswer | undefined
  readonly signedIn: boolean
  readonly onRunCommand: RunCommand
  /**
   * Go to a repository's own address. A full navigation, because that
   * address is the route that owns admission: the same thing a row's link
   * does, and the same thing typing the URL does.
   */
  readonly onOpenRepository?: (href: string) => void
}

/** The transcript slot the launcher occupies at `/`. */
export const LAUNCHER_ENTRY_ID = "repository-launcher"

/** The most rows each shelf shows before the rest wait behind a native disclosure. */
export const LAUNCHER_ROWS = 8

/** A repository's own address. Lower-cased, as the served app documents are. */
export const repositoryHref = (id: string): string => `/${id.toLowerCase()}/`

/** Where the Open box's refusal is written, so the field can point at it. */
export const LAUNCHER_OPEN_ERROR_ID = "repository-launcher-open-error"

/** The page's own navigation; a caller supplies its own in a test. */
const goToRepository = (href: string): void => { globalThis.location?.assign(href) }

const Rows = ({ repositories, label }: { readonly repositories: ReadonlyArray<LauncherRepository>; readonly label: string }) => {
  const first = repositories.slice(0, LAUNCHER_ROWS)
  const rest = repositories.slice(LAUNCHER_ROWS)
  const row = (repository: LauncherRepository) => <li key={repository.id}>
    <a className="repository-launcher-row" href={repositoryHref(repository.id)}>
      <span className="repository-launcher-name">{repository.id}</span>
      {repository.summary === undefined ? null : <span className="repository-launcher-summary">{repository.summary}</span>}
    </a>
  </li>
  return <>
    <ol className="repository-launcher-list" aria-label={label}>{first.map(row)}</ol>
    {rest.length === 0 ? null : <details className="repository-launcher-all">
      <summary>{`All ${repositories.length}`}</summary>
      <ol className="repository-launcher-list">{rest.map(row)}</ol>
    </details>}
  </>
}

/** The dated entries, each one the source's own date, title and page. */
const Updates = ({ updates }: { readonly updates: ReadonlyArray<SmithersUpdate> }) =>
  <ol className="repository-launcher-updates" aria-label="Smithers updates">
    {updates.map(update => <li key={update.id}>
      <time dateTime={update.date}>{update.date.slice(0, 10)}</time>
      {" "}
      <a href={update.url} rel="noreferrer noopener" target="_blank">{update.title}</a>
    </li>)}
  </ol>

/**
 * The launcher's body. Native lists, links, a form and a disclosure, so Tab,
 * Enter and Space already work and no shortcut is reinvented.
 */
export function RepositoryLauncher({
  repositories, updates, catalogRead, signedIn, onRunCommand, onOpenRepository = goToRepository
}: RepositoryLauncherProps) {
  /* The typed repository name is transient chrome no reader would miss after a reload. */
  const [name, setName] = useState("")
  /*
   * So is the Open box and the sentence it answers with: a form, not a second
   * state engine. The sentence is one of `repositoryInputTarget`'s two
   * authored refusals — never a raw error and never the typed text.
   */
  const [opening, setOpening] = useState("")
  const [openNotice, setOpenNotice] = useState<string | null>(null)
  const own = repositories.filter(repository => repository.catalog !== true)
  const explore = repositories.filter(repository => repository.catalog === true)
  const trimmed = name.trim()
  return <section className="repository-launcher" data-testid="repository-launcher" aria-label="Open a repository">
    <section className="repository-launcher-section" data-section="open-existing">
      <h2>Open a repository</h2>
      {/*
        * The one act every reader has, signed in or out, with an account
        * Smithers knows nothing about yet: name a repository and go to its
        * address. The box decides nothing else — `repositoryInputTarget`
        * applies the same rule the repository path is read with, and the
        * address it navigates to is where sign-in, import, the GitHub App
        * installation path and every refusal already live.
        */}
      <form className="repository-launcher-open" onSubmit={event => {
        event.preventDefault()
        const parsed = repositoryInputTarget(opening)
        if ("error" in parsed) { setOpenNotice(parsed.error); return }
        setOpenNotice(null)
        onOpenRepository(repositoryHref(parsed.repo))
      }}>
        <Input aria-label="Open an existing repository" placeholder="owner/name"
          name="repository" autoComplete="off" spellCheck={false}
          value={opening} aria-invalid={openNotice === null ? undefined : true}
          aria-describedby={openNotice === null ? undefined : LAUNCHER_OPEN_ERROR_ID}
          onChange={event => { setOpening(event.currentTarget.value); setOpenNotice(null) }} />
        <Button type="submit" variant="outline">Open</Button>
      </form>
      {openNotice === null
        ? <p className="repository-launcher-note">
            A repository lives at <code>/owner/name</code>, the same path GitHub uses; its github.com URL works here too.
          </p>
        : <p className="repository-launcher-note" id={LAUNCHER_OPEN_ERROR_ID}
            data-testid="repository-launcher-open-error" role="alert">{openNotice}</p>}
    </section>

    <section className="repository-launcher-section" data-section="open">
      <h2>Your repositories</h2>
      {!signedIn
        ? <>
            <p className="repository-launcher-note">
              Sign in with GitHub to list your own repositories. Opening one by name, above, works either way.
            </p>
            {/* The existing sign-in flow, started by this press alone. Browsing above stays signed out. */}
            <Button className="repository-launcher-sign-in" variant="outline"
              {...flowAction(onRunCommand, "sign-in")}>Sign in with GitHub</Button>
          </>
        : own.length === 0
        ? <p className="repository-launcher-note">
            Smithers has none of your repositories yet. Open one you have on GitHub, above, to import it.
          </p>
        : <Rows repositories={own} label="Your repositories" />}
    </section>

    <section className="repository-launcher-section" data-section="create">
      {/*
        * The backend's REAL GitHub create (`POST /api/user/github-repos` ->
        * one POST /user/repos on github.com with this person's own
        * credential). It makes a private repository on their GitHub account,
        * so the heading says that, and the note says what it does NOT do:
        * creating is not importing.
        */}
      <h2>Create a repository on GitHub</h2>
      {!signedIn
        ? <p className="repository-launcher-note">Sign in with GitHub to create one.</p>
        : <form className="repository-launcher-create" onSubmit={event => {
          event.preventDefault()
          if (trimmed === "") return
          onRunCommand("repos.create", trimmed)
          setName("")
        }}>
          <Input aria-label="New repository name" placeholder="my-project" value={name}
            onChange={event => setName(event.currentTarget.value)} />
          <Button type="submit" variant="outline" disabled={trimmed === ""}
            {...flowAction(onRunCommand, "repos.create", trimmed)} onClick={undefined}>Create</Button>
        </form>}
      {!signedIn ? null : <p className="repository-launcher-note">
        A new repository is private, and on GitHub only until you open it here to import it.
      </p>}
    </section>

    <section className="repository-launcher-section" data-section="explore">
      <h2>Explore</h2>
      {explore.length > 0
        ? <Rows repositories={explore} label="Public repositories" />
        : catalogRead === undefined
        ? <p className="repository-launcher-note" role="status">Reading the public repositories…</p>
        /* A refused read states nothing about what is public; an empty shelf would. */
        : catalogRead.kind === "unreadable"
        ? <p className="repository-launcher-note" data-testid="repository-launcher-catalog-unreadable" role="status">
            The public repositories couldn't be read. <Button variant="ghost" {...flowAction(onRunCommand, "repos.explore")}>Retry</Button>
          </p>
        : <p className="repository-launcher-note">No repositories are public yet.</p>}
    </section>

    <section className="repository-launcher-section" data-section="updates">
      <h2>Smithers updates</h2>
      {updates === undefined
        ? <p className="repository-launcher-note" role="status">Reading the Smithers releases…</p>
        /*
         * An unread source has no entries to show. An empty frame here would
         * tell the reader there were no updates, which the read never proved.
         */
        : updates.kind === "unreadable"
        ? <p className="repository-launcher-note" data-testid="repository-launcher-updates-unreadable" role="status">
            Smithers updates couldn't be read. <Button variant="ghost" {...flowAction(onRunCommand, "app.updates")}>Retry</Button>
          </p>
        : updates.updates.length === 0
        ? <p className="repository-launcher-note">The Smithers releases carry no published update yet.</p>
        : <Updates updates={updates.updates} />}
    </section>
  </section>
}

const NO_LAUNCHER = { updates: undefined, catalog: undefined }
const NO_SNAPSHOTS = { get: () => NO_LAUNCHER, subscribe: (_listener: () => void) => () => {} }

/**
 * The launcher composed from the controller: the repositories collection,
 * the launcher seam's two reads and the registry dispatch.
 */
export function RepositoryLauncherCard({ repositories, signedIn }: {
  readonly repositories: ReadonlyArray<LauncherRepository>
  readonly signedIn: boolean
}) {
  const controller = useController()
  const seam = controller.launcher
  const snapshots = seam?.snapshots ?? NO_SNAPSHOTS
  const answer = useSyncExternalStore(snapshots.subscribe, snapshots.get, snapshots.get)
  return <RepositoryLauncher
    repositories={repositories}
    updates={answer.updates}
    catalogRead={answer.catalog}
    signedIn={signedIn}
    onRunCommand={(flow, args) => controller.runCommand(flow, args)}
  />
}
