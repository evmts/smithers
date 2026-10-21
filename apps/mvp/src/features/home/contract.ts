import { Home } from "@smthrs/views"
import { encodePath } from "../repo/paths"

// A repository's own home (decision 0014 §4, docs/features/home.md): what it reads, where its tabs go, the words it
// shows and the records it keeps.

/** The file a repository declares its home in, read at its default branch's head. */
export const HOME_FILE = Home.path

/** The tab that shows the home, and the one that shows the code. */
export const HOME_TAB = "Home"
export const CODE_TAB = "Code"

/** The one line over the tree when a declared home can't show. */
export const HOME_INVALID = "Home is invalid"
export const HOME_UNREADABLE = "Couldn't read home"

/** `/$owner/$repo/tree/<default branch>`: the code at the default branch, and its workspace with the composer. */
export const codeHref = (owner: string, name: string, defaultBranch: string): string =>
  `/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/tree/${encodePath(defaultBranch)}`

/**
 * What the home records (docs/observability.md#a-repositorys-home): each resolve and each file a block reads, by
 * outcome. Never a block, a title, a text, a path or a link: only outcomes, counts, statuses and durations.
 */
export const HOME_TELEMETRY = {
  records: ["home.resolve", "home.file.load", "smithers_web_home_resolves"],
  fields: [
    "outcome",
    "blocks",
    "skipped",
    "reason",
    "status",
    "durationMs",
    "smithers.home.outcome",
    "smithers.home.blocks",
    "smithers.home.skipped",
  ],
} as const
