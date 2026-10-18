import { type Assertion, state } from "../../journey"
import { mondayClaim } from "../../mondayClaim"
// Every view, including Ask and Terminal. No invented transport fields.
export const views = [
  "",
  "/tree/main",
  "/blame/main/README.md",
  "/commits/main",
  "/commit/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  "/branches",
  "/issues",
  "/pulls",
  "/runs",
  "/flows",
  "/wiki",
  "/releases",
  "/settings",
  "/search?q=runtime",
  "/blob/main/README.md",
  "/branches/main/terminal"
] as const
export const cells = views.flatMap((path, view) =>
  ["empty", "loading", "error", "signed-out", "denied"].map((kind) => {
    const variant = {
      as: kind === "signed-out" ? "out" : "member",
      data: kind === "empty" ? "empty" : "full",
      access: kind === "denied" ? "denied" : "allowed",
      net: kind === "loading" ? "slow" : kind === "error" ? "error" : "ok"
    }
    const reason = kind === "empty"
      ? "empty|no\\b|nothing"
      : kind === "loading"
      ? "loading|waiting|fetching"
      : kind === "error"
      ? "failed|error|unavailable"
      : kind === "denied"
      ? "permission|access|denied|member"
      : "sign in|signed out|authentication"
    const expect: Assertion[] = [...mondayClaim, {
      see: { role: kind === "error" || kind === "denied" ? "alert" : "status" },
      text: { pattern: reason }
    }]
    if (kind === "error") expect.push({ absent: { pattern: "No (?:open issues|results|runs|files)" } })
    return state({
      id: "default/states",
      site: "default",
      lifecycle: "evergreen",
      spec: `PM D7; repo-ui-spec principle 6, view ${view + 1}; ${kind}`,
      world: { base: "default", variant },
      live: kind === "signed-out" ? { target: "default" } : { skip: "Member state is mock-only" },
      go: "/smithers-canary/smithers" + path,
      expect
    })
  })
)
export default cells[0]!
