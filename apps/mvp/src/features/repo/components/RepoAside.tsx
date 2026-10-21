import { Button, RepoAbout } from "@smthrs/ui"
import { INSTALL, RECLAIMABLE } from "../contract"
import type { AboutRow } from "../rows"
import type { Repository } from "../schema"
import { aboutOf, aboutProps, reclaimNoteOf } from "../view"

// The repository page's right column, as GitHub's: what GitHub says of the repository (`RepoAbout`), cloned or not, and
// under it, for a cloned copy storage may reclaim, the quiet note with Install, which opens the Smithers GitHub App's
// installation on GitHub.
export function RepoAside({ about, repository }: { readonly about: AboutRow | undefined; readonly repository: Repository | undefined }) {
  const note = reclaimNoteOf(repository, aboutOf(about))
  return (
    <RepoAbout
      {...aboutProps(about)}
      footer={note === undefined ? undefined : (
        <p className="repo-reclaim" role="note">
          <span>{RECLAIMABLE}</span>
          {note.installUrl === null ? null : (
            <Button asChild variant="outline" size="sm">
              <a href={note.installUrl} target="_blank" rel="noopener noreferrer">{INSTALL}</a>
            </Button>
          )}
        </p>
      )}
    />
  )
}
