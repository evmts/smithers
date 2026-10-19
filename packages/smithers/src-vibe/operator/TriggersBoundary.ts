// A-2/E-4 (D38): the `show` command's async body awaits two Promise reads, and
// VibeLang has no async or await outside a hatch (EK1003); Triggers.vibe composes
// them here exactly as Triggers.ts's async body does.
// E-7 (EK4402): node:fs and node:path are platform APIs that VibeLang code does
// not call directly; `register` reads its declaration file here.
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import type * as TriggerPlans from "./TriggerPlans.vibe"

/** The UTF-8 text of `file`, resolved against the project `root`. */
export const readProjectFile = (root: string, file: string): string => readFileSync(resolve(root, file), "utf8")

/** Awaits a trigger read, then the approval card of its active run, if any. */
export const withActivePlan = async <A extends { readonly activeRun: string | null }>(
  read: () => Promise<A>,
  inspect: (activeRun: string) => Promise<TriggerPlans.StoredPlan | null>
) => {
  const result = await read()
  return {
    ...result,
    activePlan: result.activeRun === null ?
      null :
      await inspect(result.activeRun)
  }
}
