import { Alert, AlertDescription, isPlainNavigationClick } from "@smthrs/ui"
import { EDIT_SOURCE_INSTEAD } from "../contract"
import { editInsteadOf, type GeneratedLinks } from "../view"

// Over the branch's editor of a generated file (docs/features/repo.md#generated-files): one warning that edits are
// overwritten, with a link to the source to edit instead when the repository has one.
export function GeneratedWarning({ links, onNavigate }: {
  readonly links: GeneratedLinks
  readonly onNavigate: (href: string) => void
}) {
  const instead = editInsteadOf(links)
  const href = instead?.href
  return (
    <Alert variant="warning" className="generated-warning" role="note">
      <AlertDescription>
        {EDIT_SOURCE_INSTEAD}
        {instead === undefined || href === undefined ? null : (
          <>
            {" "}
            <a
              href={href}
              onClick={(event) => {
                if (!isPlainNavigationClick(event)) return
                event.preventDefault()
                onNavigate(href)
              }}
            >
              <code>{instead.label}</code>
            </a>
          </>
        )}
      </AlertDescription>
    </Alert>
  )
}
