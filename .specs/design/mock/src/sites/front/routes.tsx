/* The front build (Kimi B): effeck.dev, the smithers.sh landing, launcher, docs and sign-in. */
import { useEffect, type ReactNode } from "react"
import { EFFECK_DOCS } from "./effeck-content"
import { LEGACY_DOCS } from "./legacy-docs"
import { SMITHERS_DOCS } from "./smithers-content"
import type { Route } from "../core/router"
import { ConverterPage, EffeckDocsPage } from "./effeck"
import { LandingPage, LauncherPage, SigninPage, SmithersDocsPage } from "./smithers"
import { useMock } from "../core/mock"

/* smithers.sh/ is the landing signed out and the launcher signed in. */
const Home = (props: Parameters<typeof LandingPage>[0]) => {
  const { flags } = useMock()
  return flags.as === "in" ? <LauncherPage /> : <LandingPage {...props} />
}

const routes: Array<Route> = [
  {
    pattern: "effeck.dev/",
    name: "E#1 Example hero (converter off), E#1/E#2 Converter (converter on)",
    render: context => <ConverterPage key={`${context.query.toString()}`} context={context} />,
    screens: [
      { id: "landing-example", route: "effeck.dev/", label: "Converter off: read-only example pair, install command", site: "effeck" },
      { id: "landing-example-copied", route: "effeck.dev/?state=copied", label: "Converter off: install command copied", site: "effeck" },
      { id: "converter-initial", route: "effeck.dev/?converter=on", label: "Precomputed pair, Compiles, Convert disabled", site: "effeck" },
      { id: "converter-edited", route: "effeck.dev/?converter=on&state=edited", label: "Edited left, out-of-date right, Convert enabled", site: "effeck" },
      { id: "converter-converting", route: "effeck.dev/?converter=on&state=converting", label: "Left locked, right mid-stream, Cancel", site: "effeck" },
      { id: "converter-compiled", route: "effeck.dev/?converter=on&state=compiled", label: "Converted output, Copy, Share, install and Smithers lines", site: "effeck" },
      { id: "converter-failed", route: "effeck.dev/?converter=on&state=failed", label: "Did not compile, diagnostics, Report this conversion", site: "effeck" },
      { id: "converter-not-effect", route: "effeck.dev/?converter=on&state=not-effect", label: "Left holds React; refusal replaces the right pane", site: "effeck" },
      { id: "converter-limit", route: "effeck.dev/?converter=on&state=limit", label: "Daily limit reached; install line offered", site: "effeck" },
      { id: "converter-shared", route: "effeck.dev/?converter=on&state=shared", label: "Opened from a share link, verified receipt", site: "effeck" },
      { id: "converter-shared-altered", route: "effeck.dev/?converter=on&state=shared-altered", label: "Share link content altered; Not verified, no Share", site: "effeck" }
    ]
  },
  {
    pattern: "effeck.dev/*",
    name: "E#3 VibeLang docs",
    render: context => <EffeckDocsPage key={context.path} context={context} />,
    screens: [
      { id: "effeck-docs-welcome", route: "effeck.dev/001-onboarding.html", label: "VibeLang", site: "effeck" },
      { id: "effeck-docs-why", route: "effeck.dev/getting-started/002-why-effect.html", label: "Why VibeLang?", site: "effeck" },
      { id: "effeck-docs-installation", route: "effeck.dev/getting-started/004-installation.html", label: "Installation", site: "effeck" },
      { id: "effeck-docs-two-error-types", route: "effeck.dev/error-management/006-two-error-types.html", label: "Two types of errors", site: "effeck" },
      { id: "effeck-docs-pipelines", route: "effeck.dev/getting-started/011-building-pipelines.html", label: "Building pipelines", site: "effeck" },
      { id: "effeck-docs-getting-started", route: "effeck.dev/013-getting-started.html", label: "Legacy getting started", site: "effeck" },
      { id: "effeck-docs-moved", route: "effeck.dev/old-guide.html", label: "Legacy page moved", site: "effeck" },
      { id: "effeck-docs-llms", route: "effeck.dev/llms.txt", label: "Documentation text index", site: "effeck" },
      { id: "effeck-docs-cli", route: "effeck.dev/setup/effeck-cli.html", label: "Build with the vibelang CLI", site: "effeck" }
    ]
  },
  {
    pattern: "smithers.sh/",
    name: "S#1 Landing (signed out), S#3/S#4 Launcher (signed in)",
    render: context => <Home key={context.query.toString()} context={context} />,
    screens: [
      { id: "landing-install", route: "smithers.sh/?as=out", label: "#4315: headline, npx command with a quiet Copy, Start app the one fill", site: "smithers" },
      { id: "landing-install-bunx", route: "smithers.sh/?as=out&runner=bunx", label: "bunx selected; the box keeps its height", site: "smithers" },
      { id: "landing-install-copied", route: "smithers.sh/?as=out&state=copied", label: "Command copied", site: "smithers" },
      { id: "landing-install-copy-failed", route: "smithers.sh/?as=out&state=failed", label: "Clipboard refused: Copy reads Try again", site: "smithers" },
      { id: "landing-open", route: "smithers.sh/?as=out&landing=open", label: "Held variant: the open box", site: "smithers" },
      { id: "landing-open-invalid", route: "smithers.sh/?as=out&landing=open&state=invalid", label: "Open box with the owner/name error", site: "smithers" },
      { id: "landing-open-opening", route: "smithers.sh/?as=out&landing=open&state=opening", label: "Open pressed; button reads Opening…", site: "smithers" },
      { id: "landing-open-from-effeck", route: "smithers.sh/?as=out&landing=open&utm_source=effeck.dev&utm_medium=convert&utm_campaign=effeck-launch", label: "Journey 9: VibeLang subhead, box prefilled effeck/effeck", site: "smithers" },
      { id: "launcher-repos", route: "smithers.sh/?as=in&repos=some", label: "Signed in with repos; Continue on the last one", site: "smithers" },
      { id: "launcher-none", route: "smithers.sh/?as=in&repos=none", label: "Signed in, no repos: Import rows and the example", site: "smithers" },
      { id: "launcher-loading", route: "smithers.sh/?as=in&net=slow", label: "Repo list loading: three skeleton rows", site: "smithers" },
      { id: "launcher-error", route: "smithers.sh/?as=in&net=error", label: "Repo list failed; Retry", site: "smithers" }
    ]
  },
  {
    pattern: "smithers.sh/signin",
    name: "GitHub sign-in (mock OAuth step)",
    render: context => <SigninPage key={context.query.toString()} context={context} />,
    screens: [
      { id: "signin-return-repo", route: "smithers.sh/signin?return=smithers.sh%2Fmaya%2Ftinyhttp", label: "Authorize Smithers, returning to a repo" },
      { id: "signin-return-bug", route: "smithers.sh/signin?return=smithers.sh%2Fsmithersai%2Fsmithers%3Fcard%3Dbug", label: "Authorize Smithers, returning to the bug card" }
    ]
  },
  {
    pattern: "smithers.sh/docs",
    name: "S#5 Smithers docs: index",
    render: context => <SmithersDocsPage key={context.path} context={context} />,
    screens: [
      { id: "docs-index", route: "smithers.sh/docs?as=out", label: "Index: Installation, HTTP API, quickstart on GitHub, Smithers on Smithers", site: "smithers" }
    ]
  },
  {
    pattern: "smithers.sh/docs/*",
    name: "S#5 Smithers docs page",
    render: context => <SmithersDocsPage key={context.path} context={context} />,
    screens: [
      { id: "docs-installation", route: "smithers.sh/docs/installation?as=out", label: "Installation; Copy the install command is primary", site: "smithers" },
      { id: "docs-http-api", route: "smithers.sh/docs/reference/http-api?as=out", label: "HTTP API reference", site: "smithers" }
    ]
  },
  {
    pattern: ":share",
    name: "E#2 Shared conversion fragment",
    render: context => <ConverterPage key={context.path} context={context} />,
    screens: [{ id: "converter-shared-invalid-fragment", route: "c=invalid", label: "Altered shared fragment", site: "effeck" }]
  }
]

const PageMetadata = ({ path, children }: { path: string; children: ReactNode }) => {
  useEffect(() => {
    const effeck = (path.startsWith("effeck.dev") || path.startsWith("c="))
    const slug = path.replace(/^effeck\.dev(?:\/|$)/, "").replace(/\.md$/, ".html")
    const doc = [...EFFECK_DOCS, ...LEGACY_DOCS].find(page => page.slug === slug)
    const smithersDoc = SMITHERS_DOCS.find(page => path === `smithers.sh/docs${page.slug ? "/" + page.slug : ""}`)
    document.title = effeck ? doc ? `${doc.title} · VibeLang docs` : (slug === "" || path.startsWith("c=")) ? "VibeLang: Effect, as a language" : slug === "llms.txt" ? "VibeLang documentation · VibeLang docs" : "Page moved · VibeLang docs"
      : smithersDoc ? `${smithersDoc.title} · Smithers docs` : path.endsWith("/signin") ? "Authorize Smithers" : "Smithers: durable agent coding on your own subscription"
  }, [path])
  return <>{children}</>
}
export const frontRoutes: Array<Route> = routes.map(route => ({ ...route, render: context => <PageMetadata path={context.path}>{route.render(context)}</PageMetadata> }))

/* The smithers.sh pages every product site shows next to its repos (landing, sign-in, docs). Entries filter frontRoutes
   with this list instead of copying patterns, so a front/ pattern change reaches every site. */
export const sharedSmithersPatterns: ReadonlySet<string> = new Set(["smithers.sh/", "smithers.sh/signin", "smithers.sh/docs", "smithers.sh/docs/*"])
