/** Prepublication backend ancestry gate. Reuses the bootstrap check's SHA. */
import { readFileSync } from "node:fs"
import { Context, Effect, Layer } from "effect"
import { z } from "zod"
import { discardBody, fetchWithDeadline, readBoundedJson, Transport } from "../src/Http"

const sha = /^[a-f0-9]{40}$/
const requirementSchema = z.object({
  commit: z.string().regex(sha),
  reason: z.string().trim().min(1),
  issue: z.string().regex(/^#\d+$/)
}).strict()
const requirementsSchema = z.array(requirementSchema)
type Requirement = z.infer<typeof requirementSchema>

export interface BackendRequirementsReceipt {
  readonly liveSha: string | null
  readonly verdict: "satisfied" | "refused"
  readonly error: "invalid-file" | "unknown-live-sha" | "compare-api" | null
  readonly requirements: ReadonlyArray<Requirement & {
    readonly liveSha: string | null
    readonly verdict: "satisfied" | "unsatisfied" | "unverified"
  }>
}

/** File I/O is injected independently of HTTP; neither error retains source data. */
export class BackendRequirementsFile extends Context.Service<BackendRequirementsFile, {
  readonly read: Effect.Effect<string, Error>
}>()("smithers-server/BackendRequirementsFile") {}

export const BackendRequirementsFileLive = Layer.succeed(BackendRequirementsFile, {
  read: Effect.try({
    try: () => readFileSync(new URL("../../app/backend-requirements.json", import.meta.url), "utf8"),
    catch: () => new Error("BACKEND_REQUIREMENTS_FILE")
  })
})

/** GitHub compares required...live: only ahead or identical proves ancestry.
 * There is no local ancestry fallback in the deployment tooling. */
export const checkBackendRequirements = (
  liveSha: string | null,
  githubToken?: string
): Effect.Effect<BackendRequirementsReceipt, never, BackendRequirementsFile | Transport> => Effect.gen(function* () {
  const parsed = yield* Effect.gen(function* () {
    const file = yield* BackendRequirementsFile
    const content = yield* file.read
    return yield* Effect.try({
      try: () => requirementsSchema.parse(JSON.parse(content)),
      catch: () => new Error("BACKEND_REQUIREMENTS_FILE")
    })
  }).pipe(Effect.catch(() => Effect.succeed(null)))
  const live = liveSha !== null && sha.test(liveSha) ? liveSha : null
  if (parsed === null) return { liveSha: live, verdict: "refused", error: "invalid-file", requirements: [] }
  if (live === null) return {
    liveSha: null, verdict: "refused", error: "unknown-live-sha",
    requirements: parsed.map(row => ({ ...row, liveSha: null, verdict: "unverified" as const }))
  }
  const requirements: BackendRequirementsReceipt["requirements"][number][] = []
  for (const row of parsed) {
    const verdict = yield* Effect.gen(function* () {
      const headers: Record<string, string> = { accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" }
      if (githubToken) headers.authorization = `Bearer ${githubToken}`
      const response = yield* fetchWithDeadline("backend-requirements",
        `https://api.github.com/repos/smithersai/smithers/compare/${row.commit}...${live}`,
        { headers, redirect: "error" }, 30_000)
      if (!response.ok) {
        yield* discardBody(response)
        return "unverified" as const
      }
      const body = yield* readBoundedJson(response, 4 * 1024 * 1024)
      const status = z.object({ status: z.enum(["ahead", "identical", "behind", "diverged"]) }).safeParse(body)
      if (!status.success) return "unverified" as const
      return status.data.status === "ahead" || status.data.status === "identical" ? "satisfied" as const : "unsatisfied" as const
    }).pipe(
      Effect.timeoutOrElse({ duration: 30_000, orElse: () => Effect.succeed("unverified" as const) }),
      Effect.catch(() => Effect.succeed("unverified" as const))
    )
    requirements.push({ ...row, liveSha: live, verdict })
  }
  return {
    liveSha: live, verdict: requirements.every(row => row.verdict === "satisfied") ? "satisfied" : "refused",
    error: requirements.some(row => row.verdict === "unverified") ? "compare-api" : null, requirements
  }
})

/** Only declared public metadata enters diagnostics, never HTTP or file errors. */
export const backendRequirementsRefusal = (receipt: BackendRequirementsReceipt): string => {
  const rows = receipt.requirements.filter(row => row.verdict !== "satisfied")
    .map(row => `${row.commit} (${row.reason}; ${row.issue}): ${row.verdict}`)
  return `backend requirements refused: ${rows.join("; ") || receipt.error}; live SHA ${receipt.liveSha ?? "unknown"}; deploy the backend first`
}
