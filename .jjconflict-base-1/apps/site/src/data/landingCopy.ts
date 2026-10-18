/** The landing's editable claim, links and single action. */
export const landingCopy: {
  landingAction: "install" | "open"
  title: string
  headline: string
  subhead: string
  openHeadline: string
  source: string
  codingGuide: string
  installCommand: string
} = {
  landingAction: "install",
  title: "Smithers: durable agent coding on your own subscription",
  headline: "Durable agent coding on your own subscription.",
  subhead: "Smithers runs Claude Code or Codex on your repository as a durable flow, on your machine and your own subscription. If the run is killed mid-way, `smthrs runs resume` continues it where it stopped. When it finishes, you review the diff and land it yourself. Open source, MIT.",
  openHeadline: "Coding agents for your GitHub repo.",
  source: "https://github.com/smithersai/smithers",
  codingGuide: "https://github.com/smithersai/smithers/blob/main/packages/smithers/docs/guides/change-code.md",
  installCommand: "npm i -g smthrs@next"
}
