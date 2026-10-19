// E-5 (D38): Port.load hands a Promise to TypeScript callers, so its async body stays
// TypeScript, unchanged from agents.ts `port`.
import { find } from "./agents.vibe"
import type * as Extension from "./extension.vibe"
import type * as Flows from "./flows.vibe"

/** `port`'s `load`: reuses a recent listing, then reads the current body. */
export const load = async (
  runs: {
    readonly listing: (options?: { readonly maxAgeMs?: number }) => Promise<ReadonlyArray<Extension.Descriptor>>
  },
  flows: Pick<Flows.Port, "body">,
  name: string
): Promise<{ readonly descriptor: Extension.Descriptor; readonly body: Flows.Body }> => {
  find(await runs.listing({ maxAgeMs: 1_000 }), name, "user")
  const body = await flows.body(name)
  // The listing is only an early refusal. Launch settings must describe the
  // same bytes as the fresh prompt, including edits made within the cache age.
  return { descriptor: find([body.descriptor], name, "user"), body }
}
