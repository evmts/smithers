import type { AgentTurnFrame } from "@smthrs/rpc/NativeAgent"

/** One run of a shared turn's answer, in the order its frames arrived. */
export type TurnSegment =
  | { readonly kind: "text"; readonly text: string }
  | { readonly kind: "reasoning"; readonly text: string }
  | { readonly kind: "card"; readonly id: string }
  | { readonly kind: "activity"; readonly link: number; readonly script?: string; readonly calls: readonly ActivityCall[]; readonly rejected?: string }

interface ActivityCall { name: string; ordinal: number; arguments?: string; description?: string; settled: boolean }
type Activity = { kind: "activity"; link: number; script?: string; calls: ActivityCall[]; rejected?: string }

/**
 * Projects a turn's frames into text, reasoning and code-mode activity in
 * arrival order. A link appears where its first frame arrived; a link that
 * called nothing and was not rejected only emitted a message, so it has no row.
 */
export function turnSegments(frames: readonly AgentTurnFrame[]): TurnSegment[] {
  const segments: Array<{ kind: "text" | "reasoning"; text: string } | { kind: "card"; id: string } | Activity> = []
  const links = new Map<number, Activity>()
  const link = (n: number) => {
    let activity = links.get(n)
    if (!activity) { activity = { kind: "activity", link: n, calls: [] }; links.set(n, activity); segments.push(activity) }
    return activity
  }
  for (const frame of frames) {
    if (frame.type === "delta") {
      const last = segments.at(-1)
      if (last && last.kind === frame.kind) last.text += frame.text
      else segments.push({ kind: frame.kind, text: frame.text })
    } else if (frame.type === "link.authored") link(frame.link).script = frame.script
    else if (frame.type === "call.started" && frame.name !== "message" && frame.name !== "say") {
      link(frame.link).calls.push({ name: frame.name, ordinal: frame.ordinal, settled: false,
        ...(frame.arguments === undefined ? {} : { arguments: frame.arguments }),
        ...(frame.description === undefined ? {} : { description: frame.description }) })
    } else if (frame.type === "call.settled") {
      const call = links.get(frame.link)?.calls.find(call => call.ordinal === frame.ordinal)
      if (call) call.settled = true
    } else if (frame.type === "gate.rejected") link(frame.link).rejected = frame.message ?? frame.kind
    else if (frame.type === "card") segments.push({ kind: "card", id: frame.card.id })
  }
  return segments.filter(segment => segment.kind !== "activity" || segment.calls.length > 0 || segment.rejected !== undefined)
}

/** The row's words, from the calls the link actually made. */
export function activityLabel(segment: Extract<TurnSegment, { kind: "activity" }>): string {
  if (segment.rejected !== undefined) return "Action failed"
  return [...new Set(segment.calls.map(call => {
    switch (call.name) {
      case "file": case "files": case "files.read": case "files.list": case "read": return "Read files"
      case "docs": return "Read docs"
      case "write": case "edit": case "files.write": return call.settled ? "Edited files" : "Editing files"
      case "commands": case "bash": case "exec": return call.settled ? "Ran commands" : "Running commands"
      default: return call.description ?? (call.settled ? "Used a tool" : "Using a tool")
    }
  }))].join(", ")
}

/** Authored code, or the recorded command inputs; never reconstructed JavaScript. */
export function activityCode(segment: Extract<TurnSegment, { kind: "activity" }>): string | undefined {
  if (segment.script !== undefined) return segment.script
  if (segment.calls.length === 0) return undefined
  return segment.calls.map(call => JSON.stringify({ name: call.name,
    ...(call.arguments === undefined ? {} : { arguments: call.arguments }) }, null, 2)).join("\n\n")
}

/** The authored script as one fenced block, longer than any fence inside it. */
export function scriptFence(script: string): string {
  const longest = Math.max(2, ...[...script.matchAll(/`+/g)].map(run => run[0].length))
  const fence = "`".repeat(longest + 1)
  return `${fence}\n${script}\n${fence}`
}

/** `41s`, `2m 5s`, `1h 3m`: whole elapsed seconds, never rounded up. */
export function elapsed(ms: number): string {
  const seconds = Math.max(0, Math.floor(ms / 1000))
  if (seconds < 60) return `${seconds}s`
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`
  return `${Math.floor(seconds / 3600)}h ${Math.floor(seconds / 60) % 60}m`
}
