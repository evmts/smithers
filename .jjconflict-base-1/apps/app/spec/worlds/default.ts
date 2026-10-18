import { world } from "../world"
const tinyReadme = "# tinyhttp\n\nA small HTTP server.\n\n## Start\n\nnpm install\n"
const smithersReadme = "# Smithers\n\nDurable workflows for your repository.\n\nPeople review and merge pull requests.\n"
const effeckReadme = "# Effeck\n\nCompile effectful programs.\n"
const longTypeScript = Array.from({ length: 1200 }, (_, i) => `export const step${i + 1} = ${i + 1}`).join("\n") + "\n// END OF LONG TYPESCRIPT FILE\n"
// Synthetic onboarding prose in the real file's 6 KiB size class; not a live capture.
const onboarding = "# Effeck onboarding\n\n" + Array.from({ length: 100 }, (_, i) => `Step ${i + 1}: Install Effeck and compile your first effectful program.\n`).join("") + "\nEND OF EFFECK ONBOARDING\n"
const effeckBlocks = (origin: string) => [
  { type: "text" as const, title: "Install Effeck", text: "npm create effeck@latest my-app" },
  { type: "links" as const, links: [
    { label: "Install Effeck", url: "https://effeck.dev/" },
    { label: "Docs", url: `${origin}/effeck/effeck/blob/main/docs/user/src/001-onboarding.md` }
  ] },
  { type: "markdown" as const, path: "README.md", markdown: effeckReadme }
]
export const defaultWorld = (query = new URLSearchParams(), origin = "http://spec.invalid") => world({
  clock: "2026-10-17T22:00:00.000Z",
  seed: 4267,
  capabilities: ["identity", "cloud"],
  ahead: {},
  viewer: query.get("as") === "member" ? { username: "maya" } : null,
  repos: [
    { name: "maya/tinyhttp", files: { "README.md": tinyReadme, "index.ts": "export const port = 3000\n" }, home: { kind: "readme", markdown: tinyReadme }, issues: [{ number: 1, title: "Document the server API", state: "open" }] },
    { name: "smithers-canary/smithers", files: {
      "README.md": smithersReadme,
      "src/runtime.ts": longTypeScript,
      "PACKAGE.ts": longTypeScript
    }, home: { kind: "readme", markdown: smithersReadme }, issues: [{ number: 4267, title: "Build the living spec", state: "open" }] },
    { name: "effeck/effeck", files: {
      "README.md": effeckReadme,
      "home.json": JSON.stringify({ blocks: effeckBlocks(origin).map(block => block.type === "markdown" ? { type: block.type, path: block.path } : block) }, null, 2),
      "docs/user/src/001-onboarding.md": onboarding
    }, home: { kind: "blocks", blocks: effeckBlocks(origin) }, issues: [] }
  ],
  variants: { ...(query.get("access") === "denied" ? { access: "denied" as const } : {}), as: query.get("as") === "member" ? "member" : "out", data: query.get("data") === "empty" ? "empty" : "full", net: query.get("net") === "slow" ? "slow" : query.get("net") === "error" ? "error" : "ok" }
})
