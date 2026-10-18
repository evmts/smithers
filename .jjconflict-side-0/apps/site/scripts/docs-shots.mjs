/**
 * Docs screenshot list — data only. Captured by capture-docs.mjs.
 *
 * Each shot is one screen of live smithers.sh shown in the docs. `ready` is
 * the Playwright selector the runner waits for before capture; `steps` run
 * after the first settle and the runner waits for `ready` again after them.
 * The runner dismisses first-visit hints as a returning visitor would;
 * `keepHints: true` keeps them for a shot about a hint. It also hides toasts
 * and refuses a shot that still shows one; `keepToasts: true` keeps them.
 * Selectors were verified against live https://smithers.sh (build 8b0fc466)
 * on 2026-10-18, and quickstart-issues against build ae86664e on 2026-10-19. The repository shots use smithersai/vibelang, a public
 * repository that opens on its file tree.
 */
export const shots = [
  {
    id: "welcome-home",
    page: "welcome",
    alt: "The smithers.sh home page: Sign in at the top right (1) and the command that adds a coding flow to a repository (2)",
    path: "/",
    auth: "signed-out",
    ready: 'role=link[name="Sign in"]',
    steps: [],
    callouts: [
      { n: 1, target: 'role=link[name="Sign in"]' },
      { n: 2, target: ".landing-command" }
    ],
    mask: []
  },
  {
    id: "quickstart-repo-home",
    page: "quickstart",
    alt: "The smithersai/vibelang repository on smithers.sh, open on its file tree: the branch (1) and a folder (2), with the latest commit's author hidden",
    path: "/smithersai/vibelang",
    auth: "signed-out",
    ready: ".repo-code-home-latest",
    steps: [],
    callouts: [
      { n: 1, target: ".repo-code-home-toolbar > details:first-child > summary" },
      { n: 2, target: 'a[href="/smithersai/vibelang/tree/main/docs"]' }
    ],
    // The latest commit's author is a real person; its relative time changes daily.
    mask: [".repo-code-home-latest > strong", ".repo-code-home-latest time"]
  },
  {
    id: "quickstart-file",
    page: "quickstart",
    alt: "package.json in smithersai/vibelang on smithers.sh, with the file's path at the top (1)",
    path: "/smithersai/vibelang/blob/main/package.json",
    auth: "signed-out",
    ready: '[aria-label="Source of package.json"]',
    steps: [],
    callouts: [{ n: 1, target: "nav.repo-code-breadcrumbs" }],
    mask: []
  },
  {
    id: "quickstart-issues",
    page: "quickstart",
    alt: "The Issues tab of smithersai/vibelang on smithers.sh: Issues (1) and Pull requests (2), with each issue's author hidden",
    path: "/smithersai/vibelang/issues",
    auth: "signed-out",
    ready: '[role="list"][aria-label="Issues"] [role="listitem"]',
    steps: [],
    callouts: [
      { n: 1, target: 'a[href="/smithersai/vibelang/issues"]:has-text("Issues")' },
      { n: 2, target: 'a[href="/smithersai/vibelang/pulls"]' }
    ],
    // Author names are real people's; the row's meta line carries them.
    mask: [".repo-issues-row-meta"]
  },
  {
    id: "quickstart-sign-in",
    page: "quickstart",
    alt: "GitHub's sign-in page, opened from Sign in on smithers.sh",
    path: "/",
    auth: "signed-out",
    ready: 'input[name="login"]',
    steps: [{ click: 'role=link[name="Sign in"]' }],
    callouts: [],
    mask: ['input[name="login"]']
  }
]
