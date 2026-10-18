/*
 * Mock state: the facts a real server would answer, as flags a reviewer flips. A route's query sets them
 * (#/smithers.sh/?as=in&repos=none), the harness bar flips them, and product actions change them the way the real
 * product would (signing in sets as=in). They persist for the browser tab.
 */
import { createContext, useContext, useEffect, useState, type ReactNode } from "react"

export interface Flags {
  /**
   * Can hosted smithers.sh land an agent-made change yet? (CEO ruling 2026-10-17: not for Monday.)
   * "install": the landing's one action is `npm i -g smthrs@next`, and asking for a change on a repo gets one reply
   * pointing at the local install. "open": the open box, runs, pull requests and Merge on GitHub (Show HN day).
   */
  landing: "install" | "open"
  /** Signed out, or signed in as maya (GitHub). */
  as: "out" | "in"
  /** Signed-in launcher: maya has imported repos, or none yet (journey 5). */
  repos: "some" | "none"
  /** Hosted machines for runs and sandboxes: up, or paused as during plue#823. */
  hosted: "up" | "paused"
  /** Guest chat for signed-out visitors: off (Monday's state, also the kill switch), on, or on with today's ceiling reached. */
  guest: "ok" | "ceiling" | "off"
  /** Is the VibeLang converter switched on (golden gate passed)? Off for Monday: the hero is a read-only example. */
  converter: "off" | "on"
  /** VibeLang converter, when on: open, or the visitor's daily limit / the kill switch reached. */
  convert: "ok" | "limit"
  /** maya has connected a coding model (Claude or Codex subscription), or not yet. */
  model: "connected" | "none"
  /** Where the repo app runs: hosted smithers.sh (changes merge on GitHub) or a team's own install (in-app Review & merge). */
  host: "hosted" | "install"
  /** Every async read: answers at once, takes 1.5 s (loading states), or fails (error states). */
  net: "ok" | "slow" | "error"
  /** Lists hold their sample rows, or are empty (empty states). */
  data: "full" | "empty"
  /** On a repo, signed in: a reader (not a member) or a member, who sees Settings and every write act. */
  role: "reader" | "member"
}

export const DEFAULTS: Flags = { landing: "install", as: "out", repos: "some", hosted: "up", guest: "off", converter: "off", convert: "ok", model: "connected", host: "hosted", net: "ok", data: "full", role: "member" }

export const CHOICES: { [K in keyof Flags]: { label: string; values: Array<[Flags[K], string]> } } = {
  landing: { label: "Hosted can land", values: [["install", "No: install the CLI (Monday)"], ["open", "Yes: open your repo"]] },
  as: { label: "Visitor", values: [["out", "Signed out"], ["in", "Signed in as maya"]] },
  repos: { label: "maya's repos", values: [["some", "Has repos"], ["none", "None yet"]] },
  hosted: { label: "Hosted machines", values: [["up", "Up"], ["paused", "Paused (plue#823)"]] },
  guest: { label: "Guest chat", values: [["off", "Off (Monday)"], ["ok", "On"], ["ceiling", "On, ceiling reached"]] },
  converter: { label: "VibeLang converter", values: [["off", "Off (Monday)"], ["on", "On"]] },
  convert: { label: "Converter caps", values: [["ok", "Open"], ["limit", "Limit reached"]] },
  model: { label: "Coding model", values: [["connected", "Connected"], ["none", "Not connected"]] },
  host: { label: "Runs on", values: [["hosted", "smithers.sh (hosted)"], ["install", "Own install"]] },
  net: { label: "Network", values: [["ok", "Fast"], ["slow", "Slow (loading)"], ["error", "Failing (errors)"]] },
  data: { label: "Data", values: [["full", "Sample rows"], ["empty", "Empty"]] },
  role: { label: "Repo role", values: [["member", "Member"], ["reader", "Reader (not a member)"]] }
}

const KEY = "site-mock-flags"
const load = (): Flags => {
  try { return { ...DEFAULTS, ...JSON.parse(sessionStorage.getItem(KEY) ?? "{}") } } catch { return DEFAULTS }
}

/** Flags named in a route's query, validated against CHOICES. */
export const flagsIn = (query: URLSearchParams): Partial<Flags> => {
  const out: Record<string, string> = {}
  for (const [key, choice] of Object.entries(CHOICES)) {
    const value = query.get(key)
    if (value !== null && choice.values.some(([option]) => option === value)) out[key] = value
  }
  return out as Partial<Flags>
}

const Context = createContext<{ flags: Flags; set: (next: Partial<Flags>) => void }>({ flags: DEFAULTS, set: () => {} })

export const MockProvider = ({ children }: { children: ReactNode }) => {
  const [flags, setFlags] = useState<Flags>(load)
  const set = (next: Partial<Flags>) => setFlags(current => {
    const merged = { ...current, ...next }
    try { sessionStorage.setItem(KEY, JSON.stringify(merged)) } catch { /* private window: the tab still works */ }
    return merged
  })
  return <Context.Provider value={{ flags, set }}>{children}</Context.Provider>
}

/** const { flags, set } = useMock(); flags.as === "in"; set({ as: "in" }) */
export const useMock = () => useContext(Context)

/**
 * A read that obeys the net flag: "ready" at once when fast, "loading" for 1.5 s when slow, "error" when failing
 * (retry() then answers). Key it by what is being read so a new read starts over.
 *   const read = useRead(`issues:${repo}`); if (read.state === "loading") return <Skeleton/> ...
 */
export const useRead = (key: string): { state: "loading" | "error" | "ready"; retry: () => void } => {
  const { flags } = useMock()
  const initial = flags.net === "ok" ? "ready" : flags.net === "slow" ? "loading" : "error"
  const [state, setState] = useState<"loading" | "error" | "ready">(initial)
  useEffect(() => {
    setState(initial)
    if (initial !== "loading") return
    const timer = setTimeout(() => setState("ready"), 1500)
    return () => clearTimeout(timer)
  }, [key, initial])
  const retry = () => {
    setState("loading")
    setTimeout(() => setState("ready"), 700)
  }
  return { state, retry }
}

/** True when the page was opened for a screenshot (?still=1): the harness hides and timed demos stay put. */
export const still = new URLSearchParams(window.location.search).get("still") === "1"
