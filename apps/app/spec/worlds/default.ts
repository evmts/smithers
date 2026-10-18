import { world } from "../world"
const tinyReadme = "# tinyhttp\n\nA small HTTP server.\n\n## Start\n\nnpm install\n"
const smithersReadme = "# Smithers\n\nDurable workflows for your repository.\n\nPeople review and merge pull requests.\n"
const effeckReadme = "# Effeck\n\nCompile effectful programs.\n"
export const defaultWorld = (query = new URLSearchParams()) => world({
  clock: "2026-10-17T22:00:00.000Z",
  seed: 4267,
  capabilities: ["identity", "cloud"],
  ahead: {},
  viewer: query.get("as") === "member" ? { username: "maya" } : null,
  repos: [
    { name: "maya/tinyhttp", files: { "README.md": tinyReadme, "index.ts": "export const port = 3000\n" }, home: { kind: "readme", markdown: tinyReadme }, issues: [{ number: 1, title: "Document the server API", state: "open" }] },
    { name: "smithers-canary/smithers", files: {
      "README.md": smithersReadme,
      "src/runtime.ts": Array.from({ length: 1200 }, (_, i) => `export const step${i + 1} = ${i + 1}`).join("\n") + "\n// END OF LONG TYPESCRIPT FILE\n"
    }, home: { kind: "readme", markdown: smithersReadme }, issues: [{ number: 4267, title: "Build the living spec", state: "open" }] },
    { name: "effeck/effeck", files: {
      "README.md": effeckReadme,
      "home.json": JSON.stringify({ blocks: [{ type: "text", title: "Install Effeck", text: "npm create effeck@latest my-app" }, { type: "markdown", path: "README.md" }] }, null, 2),
      "docs/guide.md": "# Effeck guide\n\n" + Array.from({ length: 900 }, (_, i) => `## Section ${i + 1}\n\nThis is section ${i + 1} of the complete guide.\n`).join("\n") + "\nEND OF EFFECK GUIDE\n"
    }, home: { kind: "blocks", blocks: [{ type: "text", title: "Install Effeck", text: "npm create effeck@latest my-app" }, { type: "markdown", path: "README.md", markdown: effeckReadme }] }, issues: [] }
  ],
  variants: { as: query.get("as") === "member" ? "member" : "out", data: query.get("data") === "empty" ? "empty" : "full", net: query.get("net") === "slow" ? "slow" : query.get("net") === "error" ? "error" : "ok" }
})
