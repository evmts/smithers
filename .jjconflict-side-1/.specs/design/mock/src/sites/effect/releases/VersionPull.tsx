import { repo } from "../../repo/fixtures"
import { PullPage, type PullTab } from "../../repo/views/pulls/PullPage"
import { hydrateVersionPull, versionPullNumber } from "./model"

/** Reuse the default PR, review, checks and diff UI for the newly prepared mock change. */
export const VersionPull = ({ tab = "conversation" }: { tab?: PullTab }) => {
  if (repo.slug === "Effect-TS/effect") hydrateVersionPull()
  return <PullPage n={versionPullNumber} tab={tab} />
}
