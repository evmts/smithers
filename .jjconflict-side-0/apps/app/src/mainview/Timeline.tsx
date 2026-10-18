import { useCallback, useRef, useSyncExternalStore } from "react"
import type { TimelineLine, TimelineProps, TimelineZoom } from "@smthrs/rpc/TimelineCard"

import { Button } from "@smthrs/ui/button"

const WIDE = "(min-width: 1180px)"

const CLOCK: Intl.DateTimeFormatOptions = { hour: "numeric", minute: "2-digit" }
const DAY: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" }
const sameDay = (from: number, to: number): boolean => {
  const a = new Date(from), b = new Date(to)
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

/**
 * A zoomed line's span: the locale's range of clock readings inside one day (`11:48 – 12:05`), of dates when the run
 * crosses a day (`Oct 3 – 5`; a bare clock would lie, Timestamps.ts §28.9), and each end on its own for the
 * accessible name. Nothing without both ends.
 */
export const spanOf = ({ from, to }: Pick<TimelineZoom, "from" | "to">): { readonly text: string; readonly from: string; readonly to: string } | undefined => {
  if (from === undefined || to === undefined) return undefined
  const [start, end] = from <= to ? [from, to] : [to, from]
  const format = new Intl.DateTimeFormat([], sameDay(start, end) ? CLOCK : DAY)
  return { text: format.formatRange(start, end), from: format.format(start), to: format.format(end) }
}

function Line({ line, inView, onView, onAction }: { line: TimelineLine; inView: boolean } & Pick<TimelineProps, "onView" | "onAction">) {
  const { action, zoom } = line
  const jump = () => onView({ jump_to: line.entry_id })
  const span = zoom === undefined ? undefined : spanOf(zoom)
  return <li data-entry={line.entry_id} data-kind={line.kind} data-tone={line.tone} data-in-view={inView || undefined} data-fresh={line.fresh || undefined} data-zoom={zoom?.level}>
    <button type="button" onClick={jump}>
      <span className="tl-text"><b>{zoom ? line.title : line.summary?.trim() || line.title}</b>
        {zoom ? <span className="tl-zoom">{zoom.count} entries{span ? <> · <time>{span.text}</time></> : null}</span> : null}</span>
    </button>
    {action ? <span className="tl-actions"><Button size="sm" variant="outline" data-flow={action.tag} disabled={Boolean(action.disabled)} onClick={event => { event.stopPropagation(); onAction(action.tag, action.args ?? {}) }}>{action.label}</Button>
      {action.disabled ? <span>{action.disabled.reason}</span> : null}</span> : null}
  </li>
}

/** Keep the visible band in the rail's own viewport, including after zoom and resize. */
export const followBand = (rail: HTMLElement | null): void => {
  if (!rail || rail.clientHeight === 0) return
  const band = rail.querySelectorAll<HTMLElement>("li[data-in-view]")
  const first = band[0], last = band[band.length - 1]
  if (!first || !last) return
  const top = first.offsetTop, bottom = last.offsetTop + last.offsetHeight
  if (bottom > rail.scrollTop + rail.clientHeight) rail.scrollTop = bottom - rail.clientHeight
  if (top < rail.scrollTop) rail.scrollTop = top
}

/** One line per conversation entry, or one per run of entries far from the band (zoom); the band marks what is on screen (T-UI-08). */
export function Timeline({ lines, on_screen, onView, onAction }: TimelineProps) {
  const callback = useRef(onView)
  callback.current = onView
  const previous = useRef<boolean | undefined>(undefined)
  // The viewport is an external browser store: report only transitions, through React's store boundary.
  const subscribe = useCallback((notify: () => void) => {
    const media = window.matchMedia(WIDE)
    const report = () => {
      if (previous.current !== media.matches) {
        previous.current = media.matches
        callback.current({ timeline_visible: media.matches })
      }
      notify()
    }
    report()
    media.addEventListener("change", report)
    return () => { media.removeEventListener("change", report); previous.current = undefined; callback.current({ timeline_visible: false }) }
  }, [])
  useSyncExternalStore(subscribe, () => window.matchMedia(WIDE).matches, () => false)
  const first = lines.findIndex(line => line.entry_id === on_screen[0])
  const last = lines.findIndex(line => line.entry_id === on_screen[1])
  return <nav className="timeline" aria-label="Timeline" ref={rail => { followBand(rail) }}><ol>{lines.map((line, index) =>
    <Line key={line.entry_id} line={line} inView={first >= 0 && last >= first && index >= first && index <= last} onView={onView} onAction={onAction} />)}</ol></nav>
}
