import { pathRepo } from "../RepoLink"

export interface FrameLocation {
  readonly workspaceId: string
  readonly branchId: string
  readonly frameId: string
}

export interface FrameHistoryPort {
  readonly current: () => FrameLocation | undefined
  readonly push: (location: FrameLocation) => void
  readonly replace: (location: FrameLocation) => void
  readonly back: () => void
  readonly forward: () => void
  readonly subscribe: (listener: (location: FrameLocation | undefined) => void) => () => void
}

/**
 * The explicitly addressable root app entry. `/` remounts the app on its own
 * since #4041, so this is what a spent entry marker is replaced WITH, not an
 * address the app has to move the visitor to.
 */
export const ROOT_APP_PATH = "/?tutorial"

const segment = (value: string): string => encodeURIComponent(value)

export const framePath = (location: FrameLocation): string =>
  `/w/${segment(location.workspaceId)}/b/${segment(location.branchId)}/f/${segment(location.frameId)}`

export const parseFramePath = (pathname: string): FrameLocation | undefined => {
  const match = /^\/w\/([^/]+)\/b\/([^/]+)\/f\/([^/]+)\/?$/.exec(pathname)
  if (match === null) return undefined
  try {
    const workspaceId = decodeURIComponent(match[1]!)
    const branchId = decodeURIComponent(match[2]!)
    const frameId = decodeURIComponent(match[3]!)
    if (workspaceId === "" || branchId === "" || frameId === "") return undefined
    return { workspaceId, branchId, frameId }
  } catch {
    return undefined
  }
}

interface BrowserHistoryHost {
  readonly location: { readonly pathname: string; readonly search?: string }
  readonly history: {
    readonly state: unknown
    pushState: (data: unknown, unused: string, url?: string | URL | null) => void
    replaceState: (data: unknown, unused: string, url?: string | URL | null) => void
    back: () => void
    forward: () => void
  }
  addEventListener: (type: "popstate", listener: () => void) => void
  removeEventListener: (type: "popstate", listener: () => void) => void
}

const isLocation = (value: unknown): value is FrameLocation =>
  typeof value === "object" && value !== null &&
  typeof (value as FrameLocation).workspaceId === "string" &&
  typeof (value as FrameLocation).branchId === "string" &&
  typeof (value as FrameLocation).frameId === "string"

/** The frame location a history entry's state carries, or undefined for a foreign or stateless entry. */
const stateLocation = (state: unknown): FrameLocation | undefined => {
  const location: unknown = typeof state === "object" && state !== null ? (state as { readonly location?: unknown }).location : undefined
  return isLocation(location) ? location : undefined
}

/**
 * Browser History is an adapter at the composition root, never React state.
 *
 * Two address-bar modes, chosen once from the entry URL:
 * - Booted from `/` or `/w/...`: every entry's URL is the frame pointer
 *   (`/w/<workspace>/b/<branch>/f/<frame>`) and the location is read back
 *   from the pathname.
 * - Booted from a repository path (`/owner/name`, RepoLink.pathRepo): the
 *   address bar keeps that exact path for the life of the page, so a reload
 *   or a shared link reselects the repository. Frame navigation still pushes
 *   history entries and back/forward still fire popstate; the location
 *   travels in each entry's state instead of its URL.
 * - Mounted with `keepUrl` (AppMount.tsx, the smithers.sh home page): the
 *   address the visitor is on is kept as it is. Other entry paths stay pinned.
 */
export interface BrowserFrameHistoryOptions {
  readonly keepUrl?: boolean
}

export const createBrowserFrameHistory = (
  host: BrowserHistoryHost,
  options: BrowserFrameHistoryOptions = {}
): FrameHistoryPort => {
  const path = host.location.pathname
  /*
   * Where a frame write puts the address. At the kept root it is whatever the
   * address is at that moment (#4041): `/` is the launcher and remounts the
   * app by itself, so a frame no longer rewrites it to `/?tutorial`, and
   * reading it at write time never restores an entry marker boot has spent.
   */
  const pinned: (() => string) | undefined = options.keepUrl === true && path === "/"
    ? () => `${host.location.pathname}${host.location.search}`
    : pathRepo(path) !== null || options.keepUrl === true ? () => path : undefined
  const current = (): FrameLocation | undefined =>
    pinned === undefined ? parseFramePath(host.location.pathname) : stateLocation(host.history.state)
  const url = (location: FrameLocation): string => pinned === undefined ? framePath(location) : pinned()
  return {
    current,
    push: (location) => host.history.pushState({ smithersFrame: true, location }, "", url(location)),
    replace: (location) => host.history.replaceState({ smithersFrame: true, location }, "", url(location)),
    back: () => host.history.back(),
    forward: () => host.history.forward(),
    subscribe: (listener) => {
      const onPopState = (): void => listener(current())
      host.addEventListener("popstate", onPopState)
      return () => host.removeEventListener("popstate", onPopState)
    }
  }
}
