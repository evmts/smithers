import { mondayClaim } from "../../mondayClaim"
import { journey } from "../../journey"
export default journey({
  id: "smithers/landing-install", site: "smithers", spec: "PM L1; smithers/app-spec page map #1, Sunday row 1; pm-walk E1-E6",
  world: { base: "smithers", variant: { as: "out", landing: "install" } }, live: { target: "smithers" },
  steps: [1280, 390].map(width => ({ viewport: { width, height: width === 390 ? 844 : 800 }, caption: "Install Smithers", spec: "E1 E2 E3 E4 E5 E6", go: "/", expect: [...mondayClaim,
    { see: { role: "heading", level: 1 } },
    { text: "Durable agent coding on your own subscription.", source: "html" },
    { text: "When it finishes, you review the diff and land it yourself.", source: "html" },
    { text: "npm i -g smthrs@next", source: "html" },
    { see: { role: "link", href: "https://github.com/smithersai/smithers/blob/main/packages/smithers/docs/quickstart.md" } }, { text: "npm i -g smthrs@next" },
    { see: { role: "button", name: "Copy" } }, { see: { role: "link", name: "Docs" } }, { see: { role: "link", name: "Sign in" } },
    { url: "https://github.com/smithersai/smithers", on: { role: "link", name: "Source" } },
    ...["Change github.com to smithers.sh", "Explore", "Smithers updates", "couldn't load", "Automate maintaining your codebase", "Get started for free", "lands it for you", "merges for you", "ready to merge"].map(absent => ({ absent })),
    { see: { role: "textbox" }, count: 0 }
  ] }))
})
