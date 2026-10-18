/** Repository URL navigation at the browser boundary; views subscribe to the same parser boot uses. */
import type { RepositorySubject } from "@smthrs/rpc/RepositorySubjectPath"
import { formatRepositorySubject } from "@smthrs/rpc/RepositorySubjectPath"
import { pathTarget, requestedTarget } from "./RepoLink"
import type { RequestedTarget } from "./RepoLink"

type NavigationTarget = RequestedTarget | RepositorySubject

const withRepository = (target: NavigationTarget, current: RequestedTarget | null): RequestedTarget => {
  if ("repo" in target) return target
  if (current === null) throw new Error("No repository route")
  return { repo: current.repo, subject: target }
}

/** A link to a subject in the current repository, or an explicitly named repository. */
export const hrefFor = (destination: NavigationTarget): string => {
  const target = "repo" in destination ? destination : withRepository(destination, getSnapshot())
  const path = `/${target.repo}${target.subject === undefined ? "" : `/${formatRepositorySubject(target.subject)}`}`
  const parsed = pathTarget(path)
  if (parsed === null || parsed.repo !== target.repo ||
    (parsed.subject === undefined ? "" : formatRepositorySubject(parsed.subject)) !== (target.subject === undefined ? "" : formatRepositorySubject(target.subject))) throw new Error("Invalid repository route")
  return path
}

/** Monday's deliberately unserved subjects share the frame's not-found state. */
export const routeStatus = (target: RequestedTarget | null): "served" | "not-found" =>
  target === null || target.subject?.kind === "runs" || target.subject?.kind === "run" || target.subject?.kind === "approvals"
    ? "not-found" : "served"

/** Build the browser adapter once at boot; external subscriptions follow FrameHistory's idiom. */
export const createRepositoryRouter = (host: Window, root: Document | Element) => {
  let snapshot = requestedTarget(host.location)
  const listeners = new Set<() => void>()
  const publish = () => {
    snapshot = requestedTarget(host.location)
    for (const listener of listeners) listener()
  }
  const write = (target: RequestedTarget, replace: boolean, search?: string) => {
    let href = hrefFor(target)
    if (target.subject?.kind === "redirect") href = `/${target.repo}/${target.subject.to}`
    if (search !== undefined) href = href.split("?")[0] + search
    host.history[replace ? "replaceState" : "pushState"](host.history.state, "", href)
    publish()
  }
  const navigate = (target: NavigationTarget, options: { readonly replace?: boolean } = {}) => write(withRepository(target, snapshot), options.replace === true)
  const click = (event: Event) => {
    const mouse = event as MouseEvent
    if (mouse.defaultPrevented || mouse.button !== 0 || mouse.metaKey || mouse.ctrlKey || mouse.shiftKey || mouse.altKey) return
    const element = mouse.target as Element | null
    const anchor = element?.closest?.("a[href]") as HTMLAnchorElement | null
    if (anchor === null || anchor === undefined || anchor.hasAttribute("download") || (anchor.target !== "" && anchor.target !== "_self")) return
    const url = new URL(anchor.href, host.location.href)
    if (url.origin !== host.location.origin || url.hash !== "" || !["http:", "https:"].includes(url.protocol)) return
    const target = pathTarget(url.pathname + url.search)
    if (target === null) return
    mouse.preventDefault()
    write(target, false, url.search)
  }
  host.addEventListener("popstate", publish)
  root.addEventListener("click", click)
  return {
    navigate,
    hrefFor: (target: NavigationTarget) => hrefFor(withRepository(target, snapshot)),
    getSnapshot: () => snapshot,
    subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener) } },
    dispose: () => {
      host.removeEventListener("popstate", publish)
      root.removeEventListener("click", click)
      listeners.clear()
    }
  }
}

let browserRouter: ReturnType<typeof createRepositoryRouter> | undefined
/** The single browser router, also used by ControllerBoot before frame history starts. */
export const repositoryRouter = () => {
  if (browserRouter !== undefined) return browserRouter
  const router = createRepositoryRouter(window, document)
  browserRouter = { ...router, dispose: () => { router.dispose(); browserRouter = undefined } }
  return browserRouter
}
/** Navigate from a view or event handler without reloading the document. */
export const navigate = (target: NavigationTarget, options?: { readonly replace?: boolean }) => repositoryRouter().navigate(target, options)
/** Subscribe to browser URL changes; pair with getSnapshot in useSyncExternalStore. */
export const subscribe = (listener: () => void) => repositoryRouter().subscribe(listener)
/** The current URL target; null is the server-rendered or unknown-path snapshot. */
export const getSnapshot = (): RequestedTarget | null => typeof window === "undefined" ? null : repositoryRouter().getSnapshot()
