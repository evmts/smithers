// VibeLang limitation: synchronous throwing formatters must preserve their plain API.
/**
 * The one-line rendering of a permission failure.
 *
 * @since 0.1.0
 */

import { format } from "./Capability.vibe"
import { displayField } from "./internal/displayField.vibe"
import type { PermissionErrorPayload } from "./PermissionErrorPayload.vibe"

/**
 * Renders a permission failure as the one-line `description` a `SystemError`
 * carries, which is the string a log line or an unattended report shows.
 *
 * Every field escapes C0/C1 controls, Unicode format characters (including
 * bidi controls), and line/paragraph separators, and doubles a literal
 * backslash so `\n` text never reads as a newline. Each encoded field is limited to
 * `maxDisplayFieldLength` UTF-16 code units and ends with a visible
 * marker when truncated. Ordinary non-ASCII text remains unchanged.
 *
 * @category formatting
 * @since 0.1.0
 * @slop
 */
export const formatErrorImpl = (error: PermissionErrorPayload): string => {
  switch (error._tag) {
    case "@smthrs/capability/PermissionRequired":
      return `${displayField(error.code)}: ${displayField(format(error.capability))} (tier ${
        displayField(error.tier)
      }, request ${displayField(error.requestId)})`
    case "@smthrs/capability/PermissionDenied":
      return `${displayField(error.code)}: ${displayField(format(error.capability))}: ${displayField(error.reason)}`
    case "@smthrs/capability/GrantStoreError":
      // `message` is optional in the schema, but the `Error` base always
      // materializes it. An unset one is the empty string, not `undefined`.
      return `grant store ${displayField(error.code)}${error.message ? `: ${displayField(error.message)}` : ""}`
  }
}
