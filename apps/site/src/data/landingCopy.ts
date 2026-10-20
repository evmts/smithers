/**
 * Every word, command and link on the landing, in one place to rewrite.
 * The commands are the published CLI's; each one was run from a clean HOME
 * before it went on the page.
 */
export const landingCopy: {
  landingAction: "install" | "open"
  title: string
  headline: string
  tagline: string
  openHeadline: string
  runLabel: string
  runnerLabel: string
  commands: { readonly npx: string; readonly bunx: string }
  runNote: string
  startApp: string
  docs: { readonly label: string; readonly href: string }
  source: { readonly label: string; readonly href: string }
} = {
  landingAction: "install",
  title: "Smithers: a codebase maintainer agent",
  headline: "Smithers is a codebase maintainer agent.",
  tagline: "Automate any git repo as a coding factory.",
  openHeadline: "Coding agents for your GitHub repo.",
  runLabel: "Try it in any git repo",
  runnerLabel: "Package runner",
  commands: {
    npx: "npx smthrs@next generate flow coding",
    bunx: "bunx smthrs@next generate flow coding"
  },
  runNote: "Needs Node.js 22.19 or later. Adds a coding flow to `.smithers/flows/`.",
  startApp: "Start app",
  docs: { label: "Docs", href: "/docs/installation/" },
  source: { label: "Source", href: "https://github.com/smithersai/smithers" }
}
