// C-1: native payload inspection defects must be caught before producing the typed PlanError.
import { GraphBuildError } from "./GraphBuildError.vibe"
export const inspectMaterial = <A>(capture: () => A):
  | { readonly ok: true; readonly value: A }
  | { readonly ok: false; readonly path: ReadonlyArray<string> } => {
  try {
    return { ok: true, value: capture() }
  } catch (cause) {
    return { ok: false, path: cause instanceof GraphBuildError ? cause.path : [] }
  }
}
