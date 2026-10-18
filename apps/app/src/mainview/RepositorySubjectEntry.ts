import type { RefLocation, RepositorySubject } from "@smthrs/rpc/RepositorySubjectPath"
import { isCommitRevision, resolveRefLocation } from "@smthrs/rpc/RepositorySubjectPath"
import { flowArgs } from "./flows/FlowArgs"
import type { AppController } from "./state/AppController"
import { accountOwnerOf } from "./state/AccountOwner"
import { parseRepoSelection } from "./state/AppState"
import type { AppStore } from "./state/AppStore"
import type { Message } from "./state/AppState"

/*
 * The subject a GitHub-shaped repository URL asks for, opened through the
 * flows that already read it. The URL names a target; it carries no authority
 * and no second reader: `/owner/repo/pull/2/files` runs the registered `pr`
 * read for that repository and then the registered tab choice (`prs.tab`), exactly as the
 * slash door and the Activity card do.
 *
 * Nothing here opens before the repository itself has been ADMITTED under the
 * request this URL started (RepoLink.ts `openRequestedRepo`). The ambient
 * selection is not the URL's authority: a page that still held the previous
 * repository would otherwise answer a URL for a repository Smithers does not
 * have with the previous repository's pull request #2, which is a different
 * pull request. The admission's own request id, the entry's phase, the
 * selected repository and the account owner are all checked, and checked
 * again after every await.
 */

/**
 * The subjects a URL names outright: a pull request, its tabs, the two lists
 * and one issue. A `tree` or `blob` location names a subject too, but only
 * after it has been divided against the repository's own refs, so it is read
 * by {@link openRequestedFile} and never by {@link subjectCommand}.
 */
export type RepositorySubjectView = Exclude<RepositorySubject, { readonly kind: "tree" | "blob" }>

/**
 * The registered read flow a subject opens, with its target bound explicitly.
 *
 * `repo` always rides the payload, so the read is of the repository the URL
 * named and never of whatever happens to be active. An issue URL carries
 * `source: "github"` because a GitHub-shaped URL names GitHub's issue: a
 * Smithers Cloud repository can hold a private conversation or an issue of its
 * own under the same number, and that is a different subject
 * (IssuesSeam `issueView` gives it a different card entirely).
 */
export const subjectCommand = (repo: string, subject: RepositorySubjectView): { readonly name: string; readonly args: string } =>
  subject.kind === "pull" ? { name: "pr", args: flowArgs("pr", { number: subject.number, repo }) }
    : subject.kind === "pulls" ? { name: "pr", args: flowArgs("pr", { operation: "list", repo }) }
      : subject.kind === "issue"
        ? { name: "issues.view", args: flowArgs("issues.view", { number: subject.number, repo, source: "github" }) }
        : { name: "issues.list", args: flowArgs("issues.list", { repo }) }

/** The pull request card this URL's subject names, under whichever id the surface mounted it with. */
const landingCardId = (store: AppStore, repo: string, number: number): string | undefined =>
  [...store.collections.cards.values()]
    .find(card => card.kind === "pr" && card.payload.number === number && card.payload.repo.toLowerCase() === repo.toLowerCase())?.id

export interface SubjectEntryOptions {
  /** The admission request this URL started; a later one is a different URL's. */
  readonly requestId: string | undefined
  /** Released on page teardown, so a tab that never arrives leaves nothing subscribed. */
  readonly signal?: AbortSignal
}

/**
 * True while the repository the URL named is this page's admitted, selected
 * repository for the account that asked. Re-read on every checkpoint rather
 * than captured: an account or repository change during a pending admission
 * must stop the subject, not open it somewhere else.
 */
const admitted = (
  store: AppStore,
  repo: string,
  requestId: string | undefined,
  owner: string | null | undefined
): boolean => {
  if (requestId === undefined) return false
  const session = store.session()
  const entry = session.repositoryEntry
  if (entry?.requestId !== requestId || entry.phase !== "ready" || entry.repo.toLowerCase() !== repo.toLowerCase()) return false
  if (accountOwnerOf(store.collections.identitySessions.get("identity")) !== owner) return false
  const selected = session.activeRepoKey == null ? null : parseRepoSelection(session.activeRepoKey)
  return selected !== null && selected.repoId.toLowerCase() === repo.toLowerCase()
}

/**
 * Apply the tab the URL asked for to the pull request card, as soon as that
 * card exists.
 *
 * The read does not always publish a card by the time it returns: signed out,
 * `pr` parks on its `repo-read` requirement and the card arrives after the
 * sign-in return resumes it. So the choice waits on the card instead of
 * guessing, under the same guards, and applies once. A tab is only ever set on
 * the card for THIS repository and number — the retained card of another
 * repository or another pull request is a different subject and is left alone.
 */
const selectTabWhenOpened = (
  controller: Pick<AppController, "store" | "runCommandForResult">,
  repo: string,
  number: number,
  tab: Extract<RepositorySubject, { kind: "pull" }>["tab"],
  owner: string | null | undefined,
  options: SubjectEntryOptions
): void => {
  /** True once there is nothing left to wait for: the tab is set, or this entry is no longer the page's. */
  const settled = (): boolean => {
    if (!admitted(controller.store, repo, options.requestId, owner)) return true
    const cardId = landingCardId(controller.store, repo, number)
    if (cardId === undefined) return false
    void controller.runCommandForResult("prs.tab", flowArgs("prs.tab", { cardId, tab }))
    return true
  }
  if (settled()) return
  let subscription: { readonly unsubscribe: () => void } | undefined
  let done = false
  const stop = () => { done = true; subscription?.unsubscribe() }
  subscription = controller.store.collections.cards.subscribeChanges(() => { if (!done && settled()) stop() })
  if (done) subscription.unsubscribe()
  options.signal?.addEventListener("abort", stop, { once: true })
}

/**
 * The registered read flow a divided file location opens.
 *
 * A file is `/file` with the revision the URL named, the same `?ref=`
 * parameter the Files card reads a pinned revision with. A folder is
 * `/files` at that revision. Both bind `repo` explicitly, as every other
 * subject does, so the read is of the repository the URL named.
 * @see FilesSeam.listFiles
 */
export const fileSubjectCommand = (
  repo: string,
  kind: "tree" | "blob",
  located: RefLocation
): { readonly name: string; readonly args: string } =>
  kind === "blob"
    ? { name: "file", args: flowArgs("file", { path: located.path, repo, ref: located.ref }) }
    : { name: "files", args: flowArgs("files", { operation: "repository", path: located.path, repo, ref: located.ref }) }

/** The repository id the admitted selection holds, in the inventory's own spelling. */
const selectedRepoId = (store: AppStore, repo: string): string => {
  const key = store.session().activeRepoKey
  const selected = key == null ? null : parseRepoSelection(key)
  return selected?.repoId ?? repo
}

/** The refs a reader could confirm for this repository, and whether that list is the whole one. */
interface RefInventory {
  /** Ref names, exactly as their source spells them. Empty when nothing could be read. */
  readonly refs: ReadonlyArray<string>
  /** True when the bookmark list itself could not be read, so only the default bookmark is known. */
  readonly partial: boolean
  /** The branch read's own refusal, when it refused. */
  readonly error?: string
}

/**
 * The refs this page can authoritatively name for a repository.
 *
 * Two declared reads, in the order of what each proves: the repository
 * document's default bookmark, which the mirror answers to a signed-out
 * reader and which `openRequestedRepo` already put on the row, and the
 * repository's bookmarks (`GET /api/repos/{o}/{r}/bookmarks`, the branch
 * selector's own read). Nothing is invented and nothing is inferred from the
 * URL: a list that could not be read leaves `partial` true, and the caller
 * says so rather than dividing a location against a guess.
 */
const authoritativeRefs = async (
  controller: Pick<AppController, "store" | "repositoryBranches">,
  repo: string
): Promise<RefInventory> => {
  const bookmark = controller.store.collections.repositories.get(repo)?.head?.bookmark
  const known = typeof bookmark === "string" && bookmark !== "" ? [bookmark] : []
  await controller.repositoryBranches.load(repo)
  const row = controller.repositoryBranches.rows.get(repo)
  if (row?.state === "ready") return { refs: [...new Set([...known, ...row.names])], partial: false }
  return { refs: known, partial: true, ...(row?.error === undefined ? {} : { error: row.error }) }
}

/**
 * What a reader is told when a file URL cannot be divided, and the one step
 * that exists for them.
 *
 * Never a guess and never a claim the read did not make: a bookmark list
 * that WAS read says no branch of this repository begins the location, and
 * names the other spelling that needs no list — a whole 40-character commit
 * id — so a reader holding a permalink knows what opens; a list that refused
 * says only that, names the default bookmark it does know, and offers the
 * read again. Signed out the one step is the page's own sign-in door, since
 * the bookmark list is an account's read. Tags are not claimed either way:
 * no read here lists them.
 */
const unresolvedNotice = (
  store: AppStore,
  repo: string,
  subject: Extract<RepositorySubject, { readonly kind: "tree" | "blob" }>,
  inventory: RefInventory
): { readonly text: string; readonly action: Message["action"] } => {
  const signedIn = store.collections.identitySessions.get("identity")?.state === "signed-in"
  const subjectWord = subject.kind === "blob" ? "file" : "folder"
  const retry: Message["action"] = signedIn
    ? { flow: "branches", label: "List branches" }
    : { flow: "sign-in", label: "Sign in with GitHub" }
  const opening = `This URL names a ${subjectWord} in ${repo}, and Smithers cannot tell which part of ${subject.location} is the branch.`
  if (!inventory.partial) {
    return {
      text: `${opening} No branch of ${repo} begins it, and it does not begin with a whole 40-character commit id. Tags are not listed here.`,
      action: retry
    }
  }
  const only = inventory.refs[0]
  const read = inventory.error === undefined ? "" : ` ${inventory.error}`
  return {
    text: only === undefined
      ? `${opening} Its branches could not be read.${read}`
      : `${opening} Only its default branch ${only} is known here, and the URL does not begin with it.${read}`,
    action: retry
  }
}

/**
 * Open the folder or file a `tree`/`blob` URL named, once the repository has
 * been admitted.
 *
 * The division is the only new decision, and it is made against refs
 * somebody read, never against the URL's own shape: which slash in
 * `release/1.2/src/index.ts` divides the ref from the path is a fact about
 * this repository. The refs are re-read for THIS entry, and the admission is
 * checked again after that read, so an older outstanding read or a
 * repository switch cannot land one URL's file under another URL's
 * repository.
 */
const openRequestedFile = async (
  controller: Pick<AppController, "store" | "runCommandForResult" | "repositoryBranches">,
  repo: string,
  subject: Extract<RepositorySubject, { readonly kind: "tree" | "blob" }>,
  owner: string | null | undefined,
  options: SubjectEntryOptions
): Promise<string | void> => {
  const target = selectedRepoId(controller.store, repo)
  const inventory = await authoritativeRefs(controller, target)
  if (!admitted(controller.store, repo, options.requestId, owner)) return
  const located = resolveRefLocation(subject.location, inventory.refs)
  const say = async (text: string, action: Message["action"]): Promise<void> => {
    await controller.store.dispatch({ type: "message.appended", actor: "system", text, spoken: true, ...(action === undefined ? {} : { action }) }).isPersisted.promise
  }
  if (located === undefined) {
    const notice = unresolvedNotice(controller.store, target, subject, inventory)
    await say(notice.text, notice.action)
    return
  }
  if (subject.kind === "blob" && located.path === "") {
    // `/blob/<ref>` with nothing below it names a revision and no file at all.
    // Which revision it is, is said the way the URL named it: a commit id is
    // not a branch, and calling it one would be this page's own invention.
    const revision = isCommitRevision(located.ref) ? `commit ${located.ref}` : `branch ${located.ref}`
    await say(`This URL names the ${revision} of ${target} and no file in it.`, {
      flow: "files", label: `Browse ${located.ref}`, args: flowArgs("files", { operation: "repository", path: "", repo: target, ref: located.ref })
    })
    return
  }
  const { name, args } = fileSubjectCommand(target, subject.kind, located)
  const outcome = await controller.runCommandForResult(name, args)
  return outcome.status === "failed" ? outcome.error : outcome.status === "unavailable" ? outcome.reason : undefined
}

/**
 * Open the subject a repository URL asked for, once that repository has been
 * admitted. Returns the read's own refusal when it failed, so the caller can
 * report it the way every other command failure is reported; returns nothing
 * when the URL named no subject or when the admission is not this request's.
 */
export const openRequestedSubject = async (
  controller: Pick<AppController, "store" | "runCommandForResult" | "repositoryBranches">,
  repo: string,
  subject: RepositorySubject | undefined,
  options: SubjectEntryOptions
): Promise<string | void> => {
  if (subject === undefined) return
  const owner = accountOwnerOf(controller.store.collections.identitySessions.get("identity"))
  if (!admitted(controller.store, repo, options.requestId, owner)) return
  if (subject.kind === "tree" || subject.kind === "blob") return openRequestedFile(controller, repo, subject, owner, options)
  const { name, args } = subjectCommand(repo, subject)
  // The read runs to completion first: its own card is what the tab is chosen
  // on, and one command at a time is the lifecycle's own rule.
  const outcome = await controller.runCommandForResult(name, args)
  if (subject.kind === "pull") selectTabWhenOpened(controller, repo, subject.number, subject.tab, owner, options)
  return outcome.status === "failed" ? outcome.error : outcome.status === "unavailable" ? outcome.reason : undefined
}
