import { mondayClaim } from "../../mondayClaim"
import { journey } from "../../journey"
export default journey({
  id: "smithers/landing-install", site: "smithers", spec: "PM L1; smithers/app-spec page map #1, Sunday row 1; pm-walk E1-E6",
  world: { base: "smithers", variant: { as: "out", landing: "install" } }, live: { target: "smithers" },
  steps: [1280, 390].map(width => ({ viewport: { width, height: width === 390 ? 844 : 800 }, caption: "Install Smithers", spec: "E1 E2 E3 E4 E5 E6", go: "/", expect: [...mondayClaim,
    { see: { role: "heading", level: 1 } },
    { text: "Durable agent coding on your own subscription.", source: "html" },
    { text: "Smithers runs Claude Code or Codex on your repository as a durable flow, on your machine and your own subscription. A crash or a closed laptop doesn't lose the run. When it finishes, you review the diff and land it yourself. Open source, MIT.", source: "html" },
    { text: "npm i -g smthrs@next", source: "html" },
    { url: "https://github.com/smithersai/smithers/blob/main/packages/smithers/docs/quickstart.md", on: { role: "link", href: "https://github.com/smithersai/smithers/blob/main/packages/smithers/docs/quickstart.md" }, status: 200 }, { text: "npm i -g smthrs@next" },
    { see: { role: "button", name: "Copy" } }, { url: { startsWith: "" }, on: { role: "link", name: "Docs" }, status: 200 }, { see: { role: "link", name: "Sign in" } },
    { url: "https://github.com/smithersai/smithers", on: { role: "link", name: "Source" }, status: 200 },
    ...["Change github.com to smithers.sh", "Explore", "Smithers updates", "couldn't load", "Automate maintaining your codebase", "Get started for free", "lands it for you", "merges for you", "ready to merge"].map(absent => ({ absent })),
    { absent: { pattern: "\\bfree\\b|GitHub competitor|replace GitHub|\\b[0-9][0-9,]*\\s+(?:users|repos|runs)\\b" } },
    { see: { role: "textbox", editable: true }, count: 0 }
  ] }))
})
