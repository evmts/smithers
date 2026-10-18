/*
 * Facts both builds read: which repos exist on the mock's smithers.sh, who maya is, and the routes that join the
 * front pages to the app. app/data holds each repo's full content; this file holds only what front/ also needs.
 */

/** Repos smithers.sh can show. Anything else at smithers.sh/<owner>/<name> is "isn't on Smithers yet" (PM #2). */
export const CATALOG: Array<{ slug: string; description: string; visibility: "public" | "private"; github: string }> = [
  /* Smithers' own repo. smithersai/smithers can't be served on smithers.sh until #3830 (an older private repo holds the
     name), so Smithers-on-Smithers is the working mirror smithers-canary/smithers (CEO ruling 2026-10-17 21:05 PT). */
  { slug: "smithers-canary/smithers", description: "Mirror of github.com/smithersai/smithers. Durable agent coding on your own subscription.", visibility: "public", github: "https://github.com/smithersai/smithers" },
  /* VibeLang's GitHub repo is private; its source and issues live on smithers.sh (effeck/app-spec.md). */
  { slug: "effeck/effeck", description: "Effect, as a language.", visibility: "public", github: "" },
  { slug: "effeck/effeck-example", description: "A runnable VibeLang starter: a typed error, a service and a retry.", visibility: "public", github: "" },
  /* The example template (app-spec #15): a TypeScript greeting function with tests. */
  { slug: "smithersai/hello-smithers", description: "Template: a TypeScript greeting function and its tests, for trying Smithers.", visibility: "public", github: "https://github.com/smithersai/hello-smithers" }
]

/** The signed-in visitor (flag as=in). A made-up GitHub user so screenshots name no real person. */
export const MAYA = {
  login: "maya",
  name: "Maya Okafor",
  /** maya's GitHub repos the Smithers GitHub App can read. imported = already on Smithers (flag repos=some). */
  github: [
    { slug: "maya/tinyhttp", description: "A 400-line HTTP router for Bun and Node.", language: "TypeScript", imported: true, lastActive: "2 hours ago" },
    { slug: "maya/notes-api", description: "Markdown notes over a small REST API.", language: "TypeScript", imported: true, lastActive: "3 days ago" },
    { slug: "maya/dotfiles", description: "", language: "Shell", imported: false, lastActive: "" }
  ]
}

/** maya's repos on Smithers under the current flags. */
export const importedRepos = (repos: "some" | "none") => repos === "some" ? MAYA.github.filter(repo => repo.imported) : []

/** The route to the mock GitHub sign-in, returning to `back` afterwards. */
export const signInRoute = (back: string) => `smithers.sh/signin?return=${encodeURIComponent(back)}`

/** smithersai/smithers on smithers.sh until #3830 lands: the name is held, so the app points at the mirror. */
export const SMITHERS_REPO = "smithers-canary/smithers"

/** Links that leave the mock. Always render them with target="_blank" rel="noopener noreferrer". */
export const EXTERNAL = {
  /* The landing's and docs' Source link (CEO ruling 21:05 PT) */
  smithersGithub: "https://github.com/smithersai/smithers",
  githubApp: "https://github.com/apps/smithers",
  npmSmthrs: "https://www.npmjs.com/package/smthrs",
  npmCreateEffeck: "https://www.npmjs.com/package/create-vibelang",
  status: "https://status.smithers.sh",
  /* The local quickstart (smithers.sh/docs doesn't host it) */
  smithersQuickstart: "https://github.com/smithersai/smithers/blob/main/packages/smithers/docs/quickstart.md",
  /* Bug reports from effeck.dev docs pages (SUPPORT.md): a prefilled email, until outsiders can file issues */
  support: "mailto:support@smithers.sh"
}
