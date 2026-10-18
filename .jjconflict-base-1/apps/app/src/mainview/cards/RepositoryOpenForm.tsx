/* One open box for the static first screen and the signed-in launcher. */
import { useState } from "react"
import { repositoryInputTarget } from "../RepositoryInput"
export { repositoryInputTarget } from "../RepositoryInput"

/** The existing parser's refusal, associated with the field. */
export const LAUNCHER_OPEN_ERROR_ID = "repository-launcher-open-error"

/** Navigate to the repository route; admission and import belong to that route. */
export function RepositoryOpenForm({ onOpenRepository = href => globalThis.location?.assign(href), initialValue = "" }: {
  readonly onOpenRepository?: (href: string) => void
  readonly initialValue?: string
}) {
  const [notice, setNotice] = useState<string | null>(null)
  return <>
    <form className="repository-launcher-open" onSubmit={event => {
      event.preventDefault()
      const input = event.currentTarget.elements.namedItem("repository") as HTMLInputElement
      const parsed = repositoryInputTarget(input.value)
      if ("error" in parsed) { setNotice(parsed.error); return }
      setNotice(null)
      onOpenRepository(`/${parsed.repo.toLowerCase()}/`)
    }}>
      <input className="sui-input" data-slot="input" aria-label="Open an existing repository" placeholder="owner/name"
        name="repository" autoComplete="off" spellCheck={false} defaultValue={initialValue}
        aria-invalid={notice === null ? undefined : true}
        aria-describedby={notice === null ? undefined : LAUNCHER_OPEN_ERROR_ID}
        onChange={() => setNotice(null)} />
      <button className="sui-button sui-button-outline" type="submit">Open</button>
    </form>
    {notice === null ? null : <p className="repository-launcher-note" id={LAUNCHER_OPEN_ERROR_ID}
      data-testid="repository-launcher-open-error" role="alert">{notice}</p>}
  </>
}
