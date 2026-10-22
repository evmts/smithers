import type { BranchView } from "./branch"
import type { TerminalView } from "../terminal/terminal"

/** Opens the live parts of a branch page only while this navigation still owns them. */
export const openBranchPage = async (
  branch: BranchView,
  terminal: TerminalView,
  signal: AbortSignal,
  params: { readonly owner: string; readonly repo: string; readonly ref: string; readonly _splat?: string },
  search: { readonly terminal?: string; readonly edit?: string },
): Promise<void> => {
  try {
    if (signal.aborted) return
    const branchId = await branch.actions.open(params.owner, params.repo, params.ref, signal)
    if (signal.aborted) return
    const { presence, coedit } = branch
    if (branchId === undefined) {
      await terminal.actions.show(null, undefined, signal)
      if (signal.aborted) return
      await presence.actions.leave(signal)
      return
    }
    await presence.actions.join(branchId, signal)
    if (signal.aborted) return
    // The file in the live editor under `?edit`, or none: its room is left with the editor.
    const editing = search.terminal === undefined ? search.edit : undefined
    await coedit.actions.showFile(branchId, editing, signal)
    if (signal.aborted) return
    if (search.terminal === undefined) {
      await terminal.actions.show(null, undefined, signal)
      if (signal.aborted) return
      await presence.actions.at(editing === undefined ? { view: "code", path: params._splat ?? "" } : { view: "edit", path: editing }, signal)
      return
    }
    terminal.actions.showInBackground(
      branchId,
      search.terminal === "me" ? undefined : search.terminal,
      (terminalId) => signal.aborted ? Promise.resolve() : presence.actions.at({ view: "terminal", terminalId }, signal),
      signal,
    )
  } catch (error) {
    if (!signal.aborted) throw error
  }
}
