import { Button, FileTabs, ItemConversation, SmithersUiStyles } from "@smthrs/ui"
import { RepoView, RepoViewStyles } from "@smthrs/repo-view"
import { createRoot } from "react-dom/client"

// Real library renderers, with the production file and conversation labels that
// exposed the defects. This host tests rendering without replacing any service.
const path = new URL(location.href).searchParams.get("file") ?? "README.md"
const markdown = `### Well hello there!\n\n${"A repository document remains readable below its toolbar. ".repeat(15)}\n\n[Read the guide](https://example.com/guide)\n`
createRoot(document.getElementById("app")!).render(<>
  <SmithersUiStyles withTheme />
  <RepoViewStyles />
  <section id="files">
    <FileTabs tabs={[{ key: path, label: path, href: `#${path}`, active: true }]} onOpen={() => {}} onClose={() => {}} />
    <RepoView name="Spoon-Knife" location={{ kind: "blob", path }} htmlMode="split" codeMode="plain"
      tree={{ state: "ready", paths: ["README.md", "index.html", "styles.css", "src/main.ts"] }}
      file={{ state: "text", contents: path === "README.md" ? markdown : "<h1>Hello</h1>", size: 780 }}
      href={(next) => `#${next.path}`} onNavigate={() => {}}
      fileActions={<><Button size="sm">Copy path</Button><Button size="sm">Copy</Button></>} />
  </section>
  <ItemConversation title="A synced issue" number={4432} state="open" body="A production issue." comments={[]}
    externalHref="https://github.com/smithersai/smithers/issues/4432" />
  <main className="conversations-screen" aria-label="Conversations">
    <ul className="conversation-list-rows" aria-label="Conversations">
      {[['smithers-e2e', 'roninjin10/smithers-github-tests'], ['a-very-long-branch-name-that-must-wrap', 'a-long-owner/a-long-repository-name']].map(([branch, repo]) =>
        <li className="conversation-list-row" key={branch}>
          <a href="#conversation"><span className="conversation-list-branch">{branch}</span>{" "}<span className="conversation-list-repo">{repo}</span></a>
          <Button variant="ghost" aria-label={`Archive ${branch}`}>Archive</Button>
        </li>)}
    </ul>
  </main>
</>)
