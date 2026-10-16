import type { RepositorySubject } from "@smthrs/rpc/RepositorySubjectPath"
import { flowArgs } from "./flows/FlowArgs"
import type { AppController } from "./state/AppController"
import { accountOwnerOf } from "./state/AccountOwner"
import { parseRepoSelection } from "./state/AppState"
import type { AppStore } from "./state/AppStore"

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
 * The registered read flow a subject opens, with its target bound explicitly.
 *
 * `repo` always rides the payload, so the read is of the repository the URL
 * named and never of whatever happens to be active. An issue URL carries
 * `source: "github"` because a GitHub-shaped URL names GitHub's issue: a
 * Smithers Cloud repository can hold a private conversation or an issue of its
 * own under the same number, and that is a different subject
 * (IssuesSeam `issueView` gives it a different card entirely).
 */
export const subjectCommand = (repo: string, subject: RepositorySubject): { readonly name: string; readonly args: string } =>
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
 * Open the subject a repository URL asked for, once that repository has been
 * admitted. Returns the read's own refusal when it failed, so the caller can
 * report it the way every other command failure is reported; returns nothing
 * when the URL named no subject or when the admission is not this request's.
 */
export const openRequestedSubject = async (
  controller: Pick<AppController, "store" | "runCommandForResult">,
  repo: string,
  subject: RepositorySubject | undefined,
  options: SubjectEntryOptions
): Promise<string | void> => {
  if (subject === undefined) return
  const owner = accountOwnerOf(controller.store.collections.identitySessions.get("identity"))
  if (!admitted(controller.store, repo, options.requestId, owner)) return
  const { name, args } = subjectCommand(repo, subject)
  // The read runs to completion first: its own card is what the tab is chosen
  // on, and one command at a time is the lifecycle's own rule.
  const outcome = await controller.runCommandForResult(name, args)
  if (subject.kind === "pull") selectTabWhenOpened(controller, repo, subject.number, subject.tab, owner, options)
  return outcome.status === "failed" ? outcome.error : outcome.status === "unavailable" ? outcome.reason : undefined
}
