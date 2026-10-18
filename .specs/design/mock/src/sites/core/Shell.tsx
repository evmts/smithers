/*
 * The mock's frame: resolves the route, applies the route's mock flags, renders the page, and adds the review
 * harness (MockBar) and the screen index (#/__screens). Nothing here is product UI; product pages live in app/ and
 * front/. Everything the harness draws carries data-mock, so crawl.mjs and screenshots ignore it.
 */
import { useEffect, useState } from "react"
import { CHOICES, DEFAULTS, flagsIn, still, useMock, type Flags } from "./mock"
import { allRoutes, Link, navigate, resolveRoute, useLocation, useScrollReset, type Screen, type Site } from "./router"

declare const __SITE__: Site
export const SITE: Site = __SITE__
export const START: Record<Site, string> = { effeck: "effeck.dev/", smithers: "smithers.sh/", default: "smithers.sh/maya/tinyhttp", effect: "smithers.sh/Effect-TS/effect", "smithers-site": "smithers.sh/", "effeck-site": "effeck.dev/" }

type Theme = "light" | "dark"
const systemTheme = (): Theme => matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"
const initialTheme = (): Theme => {
  const param = new URLSearchParams(window.location.search).get("theme")
  if (param === "light" || param === "dark") return param
  try { const saved = localStorage.getItem("site-mock-theme"); if (saved === "light" || saved === "dark") return saved } catch { /* no storage */ }
  return systemTheme()
}

export const screensFor = (site: Site): Array<Screen> =>
  allRoutes().flatMap(route => route.screens).filter(screen => screen.site === undefined || screen.site === site)

const NotFound = ({ path }: { path: string }) => (
  <main data-page="404" className="core-404">
    <h1>No page at {path}</h1>
    <p>This mock has no screen for that address.</p>
    <p><Link to={START[SITE]}>Go to the start</Link> · <Link to="__screens">All screens</Link></p>
  </main>
)

export const Shell = () => {
  const location = useLocation()
  const { flags, set } = useMock()
  const [theme, setTheme] = useState<Theme>(initialTheme)
  const resolved = resolveRoute(location === "" ? START[SITE] : location)
  const path = resolved?.context.path ?? location
  useScrollReset(path)

  useEffect(() => { if (location === "") navigate(START[SITE], { replace: true }) }, [location])
  /* A route's query flags are facts the page is opened with. */
  useEffect(() => {
    const query = new URLSearchParams(location.split("?")[1] ?? "")
    const named = flagsIn(query)
    if (Object.keys(named).length > 0) set(named)
  }, [location])
  useEffect(() => { document.documentElement.dataset.theme = theme }, [theme])
  useEffect(() => {
    document.documentElement.dataset.host = path.split("/")[0]
  }, [path])

  return (
    <>
      {resolved === null ? <NotFound path={location} /> : resolved.route.render(resolved.context)}
      {!still && <MockBar location={location} flags={flags} set={set} theme={theme} setTheme={next => {
        setTheme(next)
        try { localStorage.setItem("site-mock-theme", next) } catch { /* no storage */ }
      }} />}
    </>
  )
}

const MockBar = ({ location, flags, set, theme, setTheme }: { location: string; flags: Flags; set: (next: Partial<Flags>) => void; theme: Theme; setTheme: (theme: Theme) => void }) => {
  const [open, setOpen] = useState(false)
  return (
    <aside className="core-mockbar" data-mock data-open={open}>
      <button type="button" className="core-mockbar-toggle" onClick={() => setOpen(!open)} aria-expanded={open}>
        <span className="core-mockbar-tag">Mock</span>
        <span className="core-mockbar-url">{location.split("?")[0] || START[SITE]}</span>
      </button>
      {open && (
        <div className="core-mockbar-panel">
          {Object.entries(CHOICES).map(([key, choice]) => (
            <label key={key}>
              <span>{choice.label}</span>
              <select value={flags[key as keyof Flags]} onChange={event => set({ [key]: event.target.value } as Partial<Flags>)}>
                {choice.values.map(([value, text]) => <option key={value} value={value}>{text}</option>)}
              </select>
            </label>
          ))}
          <label>
            <span>Theme</span>
            <select value={theme} onChange={event => setTheme(event.target.value as Theme)}>
              <option value="light">Light</option>
              <option value="dark">Dark</option>
            </select>
          </label>
          <div className="core-mockbar-links">
            <button type="button" onClick={() => set(DEFAULTS)}>Reset flags</button>
            <a href="#/__screens" onClick={() => setOpen(false)}>All screens</a>
          </div>
        </div>
      )}
    </aside>
  )
}

const SITE_NAMES: Record<Site, string> = {
  effeck: "VibeLang app", smithers: "Smithers app", default: "Default repo UI", effect: "Effect monorepo",
  "smithers-site": "Smithers site", "effeck-site": "VibeLang site"
}

/** #/__screens: every reviewable screen of this mock, grouped by page-map entry. */
export const ScreensPage = () => {
  const { set } = useMock()
  const groups = allRoutes().map(route => ({ route, screens: route.screens.filter(screen => screen.site === undefined || screen.site === SITE) }))
    .filter(group => group.screens.length > 0 && group.route.pattern !== "__screens")
  const open = (screen: Screen) => {
    set({ ...DEFAULTS, ...flagsIn(new URLSearchParams(screen.route.split("?")[1] ?? "")) })
    navigate(screen.route)
  }
  return (
    <main className="core-screens" data-mock>
      <h1>{SITE_NAMES[SITE]}: every screen</h1>
      <p>Each row opens one page in one state. Flip states any time with the Mock button, bottom left.</p>
      {groups.map(({ route, screens }) => (
        <section key={route.pattern}>
          <h2>{route.name} <code>{route.pattern}</code></h2>
          <ul>
            {screens.map(screen => (
              <li key={screen.id}>
                <a href={`#/${screen.route}`} onClick={event => { event.preventDefault(); open(screen) }}>{screen.label}</a>
                <code>{screen.route}</code>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </main>
  )
}
