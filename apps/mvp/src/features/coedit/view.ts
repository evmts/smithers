import type { Shared } from "./schema"

// Which open text a frontend shows (docs/features/coedit.md#the-browser). Pure, so the views only render.

/** The prompt of the conversation this tab shows: the one prompt it is in the room of. */
export const promptOf = (texts: ReadonlyArray<Shared>): Shared | undefined =>
  texts.find((row) => row.kind === "prompt" && row.shown)

/** The answer box of run `run`'s question `version`, while this tab has it open. */
export const answerOf = (texts: ReadonlyArray<Shared>, run: string, version: number): Shared | undefined =>
  texts.find((row) => row.kind === "answer" && row.key === `${run}/${version}`)

/** The answer box of run `run`'s open question: the one this tab is in the room of. */
export const openAnswerOf = (texts: ReadonlyArray<Shared>, run: string): Shared | undefined =>
  texts.find((row) => row.kind === "answer" && row.shown && row.key.startsWith(`${run}/`))

/** File `path` of conversation `conversation`'s branch, while this tab has it open. */
export const fileOf = (texts: ReadonlyArray<Shared>, conversation: string, path: string): Shared | undefined =>
  texts.find((row) => row.kind === "file" && row.key === `${conversation}/${path}`)

/** Whether a file's text is what this tab's last Save wrote. */
export const savedOf = (file: Shared): boolean => file.saved === file.text
