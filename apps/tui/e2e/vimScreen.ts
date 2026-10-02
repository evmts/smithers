/** Test observation only; never normalize the shared captured screen. */
const filename = new RegExp(
  "prompt.md".split("").map((character) => character === "." ? "\\." : character).join("(?:\\r?\\n[ \\t]*)?")
)
export const hitEnter = (screen: string): boolean => /Press ENTER or type command to continue/.test(screen)
export const vimForeground = (screen: string, tuiVisible: boolean): boolean =>
  !tuiVisible && new RegExp(`(?:^|[/"\\s])${filename.source}(?=["\\s]|$)`, "m").test(screen)
/** Call only after vimForeground establishes ownership and startup dismissal. */
export const vimEditable = (screen: string, marker: string, tuiVisible: boolean): boolean =>
  !tuiVisible && !hitEnter(screen) && screen.split("\n").some((row) => row.trim() === marker)

/** One original foreground budget, including dismissal and buffer readiness. */
export const awaitVimBuffer = async (
  tui: {
    until: (predicate: (screen: string) => boolean, ms: number, label: string) => Promise<string>
    press: (keys: string) => Promise<void>
  },
  marker: string,
  drawn: (screen: string) => boolean,
  label: string,
  now: () => number = Date.now
): Promise<string> => {
  const deadline = now() + 5_000
  const remaining = () => {
    const ms = deadline - now()
    if (ms <= 0) throw new Error("Vim readiness deadline exceeded")
    return ms
  }
  const startup = await tui.until((screen) => vimForeground(screen, drawn(screen)), remaining(), label)
  if (hitEnter(startup)) {
    remaining()
    await tui.press("\r")
  }
  return tui.until((screen) => vimEditable(screen, marker, drawn(screen)), remaining(), `${label} editable buffer`)
}
