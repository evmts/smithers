import { repo } from "../../fixtures"
import type { EvalSuite } from "../../fixtures/types"

export type SuiteRecord = EvalSuite & { note?: string; runnable?: boolean; unavailable?: string; unexecuted?: boolean; sourceFile?: string; importedSnapshot?: boolean;
  gate?: { holdout: "valid" | "invalid"; identities: Record<"model" | "prompt" | "compiler" | "dependencies", string | null>; validation: { passed: number; total: number; kind: string; run: string } }
}

/* Dataset adapters expose their JSON through config so the shared fixture loader stays read-only.
 * This is repo-independent: another dataset can supply the same configured suite array. */
export const configuredEvals = (): SuiteRecord[] =>
  (repo.config.evals as { title: string; suites?: SuiteRecord[] } | undefined)?.suites ?? []

export const percent = (score: number): string => `${Number((score * 100).toFixed(1))}%`
export const stateLabel = (state: EvalSuite["latest"]["state"]): string =>
  state === "pass" ? "Pass" : state === "regressed" ? "Regressed" : "Inconclusive"
