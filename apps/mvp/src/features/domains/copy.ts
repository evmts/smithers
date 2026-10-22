import type { CertificateState, DomainState } from "./contract"
import type { Domain, DomainOp } from "./schema"

// Custom domains' words (docs/features/domains.md#the-settings-section), Vercel's where Vercel has one. A
// Maintainer sees them; nobody else sees the section.

export const SETTINGS = "Settings"
export const DOMAINS_HEADING = "Domains"
export const DOMAIN_LABEL = "Domain"
export const DOMAIN_PLACEHOLDER = "example.com"
export const ADD = "Add"
export const REFRESH = "Refresh"
export const REMOVE = "Remove"
export const COPY = "Copy"
export const CERTIFICATE = "Certificate"
export const RECORDS_LABEL = "DNS records"
export const TYPE = "Type"
export const NAME = "Name"
export const VALUE = "Value"

/** A domain's state as its badge says it. */
export const STATE_TEXT: Record<DomainState, string> = {
  pending: "Pending verification",
  active: "Valid configuration",
  failed: "Invalid configuration",
  removing: "Removing",
}

/** The badge's tint for each state (`@smthrs/ui` `Badge` variants). */
export const STATE_TONE: Record<DomainState, "warning" | "success" | "destructive" | "muted"> = {
  pending: "warning",
  active: "success",
  failed: "destructive",
  removing: "muted",
}

/** The certificate's state. `Unmanaged`: the host, not the provider, terminates TLS. */
export const CERTIFICATE_TEXT: Record<CertificateState, string> = {
  pending: "Pending",
  active: "Active",
  failed: "Failed",
  unmanaged: "Unmanaged",
}

/** Why a domain isn't active, in product words; the provider's own reason as it gave it. */
export const problemText = (problem: Domain["problem"]): string | null => {
  switch (problem) {
    case null:
      return null
    case "taken":
      return "Another account uses this domain"
    case "blocked":
      return "The provider blocked this domain"
    case "timed_out":
      return "DNS records not found. Refresh after adding them"
    case "unreachable":
      return "Couldn't check. Retrying"
    default:
      return problem
  }
}

/** Why ChatApi refused a write, or `unavailable` when it couldn't be reached, in product words. */
export const refusalText = (code: string | null): string => {
  switch (code) {
    case "invalid":
    case "invalid_hostname":
    case "too_large":
      return "Not a valid domain"
    case "reserved":
      return "This domain is reserved"
    case "taken":
      return "Another repository uses this domain"
    case "authentication":
      return "Sign in again"
    case "forbidden":
    case "person_only":
      return "Only Maintainers can change domains"
    case "not_found":
      return "Repository not found"
    case "off":
      return "Custom domains are off"
    default:
      return "Couldn't save. Try again"
  }
}

/** A write in flight, as its row says it. */
export const SAVING_TEXT: Record<DomainOp, string> = {
  add: "Adding…",
  refresh: "Checking…",
  remove: "Removing…",
}
