/* Only public diagnostics enter GitHub's report form; never the current URL or card payload. */

/** Operator configuration; the flow does not own the destination repository. */
export const bugReportRepository = (): string =>
  import.meta.env?.VITE_SMITHERS_BUG_REPOSITORY ?? "smithersai/smithers"

/** Classify the route without retaining either repository segment or a subject ID. */
export const bugRouteKind = (pathname: string): string => {
  if (pathname === "/") return "launcher"
  const subject = pathname.split("/").filter(Boolean)[2]
  if (subject === "blob" || subject === "tree") return "file"
  if (subject === "issues") return "issues"
  if (subject === "pull" || subject === "pulls") return "pull-request"
  if (pathname.split("/").filter(Boolean).length >= 2) return "repository"
  return "other"
}

/** GitHub owns issue creation. This URL only opens its prefilled form. */
export const bugReportUrl = ({ repository, build, pathname, failureCode, correlationId }: {
  readonly repository: string
  readonly build: string
  readonly pathname: string
  readonly failureCode?: string
  readonly correlationId?: string
}): string => {
  if (!/^[\w.-]+\/[\w.-]+$/.test(repository) || repository.split("/").some(part => part === "." || part === "..")) {
    throw new Error("Invalid bug report repository configuration")
  }
  const safeId = (value: string | undefined): string | undefined =>
    value !== undefined && /^[a-zA-Z0-9_.:-]{1,160}$/.test(value) ? value : undefined
  const code = safeId(failureCode)
  const correlation = safeId(correlationId)
  const body = [
    "## What happened\n\n", "## Expected\n\n", "## Steps\n\n",
    `Route kind: ${bugRouteKind(pathname)}`,
    `Build: ${build}`,
    ...(code === undefined ? [] : [`Failure code: ${code}`]),
    ...(correlation === undefined ? [] : [`Correlation id: ${correlation}`])
  ].join("\n")
  const url = new URL(`https://github.com/${repository}/issues/new`)
  url.searchParams.set("title", "Bug report")
  url.searchParams.set("body", body)
  return url.href
}
