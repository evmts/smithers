import type { Observation, ViewSpec } from "../mock-fidelity/scoring.ts"
export type Outcome = "compared" | "cut" | "not deployed" | "auth required" | "inconclusive"
export interface Structure {
  tabs: string[]
  header: { waiting: boolean; ask: boolean; sync: boolean; search?: boolean }
  sidebars: string[]
}
export interface Capture extends Observation { structure?: Structure; screenshot: string; status?: number; finalUrl?: string; blockedRequests?: string[] }
export interface Pair {
  id: string; state: "ready" | "signed-out"; width: number; outcome: Outcome; reason?: string
  mock?: Capture; live?: Capture
}
export interface ParityOutput {
  view: string; spec: ViewSpec; dist: string; liveBase: string; liveRepo: string
  outcome: Outcome; pairs: Pair[]; unobservable: string[]; runDir?: string; infrastructureError?: string; cutReason?: string
}
export interface Options { dist: string; liveBase: string; liveRepo: string; auth?: string; runDir: string }
