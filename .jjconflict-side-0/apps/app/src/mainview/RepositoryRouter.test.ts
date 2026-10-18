import { GlobalRegistrator } from "@happy-dom/global-registrator"
import { afterAll, afterEach, expect, test } from "bun:test"
import { createRepositoryRouter, getSnapshot, hrefFor, navigate, repositoryRouter, routeStatus, subscribe } from "./RepositoryRouter"

GlobalRegistrator.register({ url: "https://smithers.sh/o/r/flows/build" })
afterAll(() => GlobalRegistrator.unregister())
let stop = () => {}
afterEach(() => { stop(); document.body.innerHTML = "" })

test("boot, navigate, replace and popstate publish the URL's subject without reload", () => {
  window.history.replaceState({ retained: true }, "", "/o/r/flows/build")
  const router = createRepositoryRouter(window, document)
  stop = router.dispose
  expect(router.getSnapshot()).toEqual({ repo: "o/r", subject: { kind: "flows", name: "build" } })
  expect(router.hrefFor({ kind: "branches" })).toBe("/o/r/branches")
  const seen: unknown[] = []
  const unsubscribe = router.subscribe(() => seen.push(router.getSnapshot()))
  const historyLength = window.history.length
  router.navigate({ kind: "settings", section: "secrets" })
  expect(window.history.length).toBe(historyLength + 1)
  expect(window.location.pathname).toBe("/o/r/settings/secrets")
  expect(window.history.state).toEqual({ retained: true })
  router.navigate({ repo: "o/r", subject: { kind: "search", q: "a/b + c" } }, { replace: true })
  expect(window.location.search).toBe("?q=a%2Fb+%2B+c")
  expect(window.history.length).toBe(historyLength + 1)
  window.history.replaceState(null, "", "/o/r/commits/main/src")
  window.dispatchEvent(new PopStateEvent("popstate"))
  expect(router.getSnapshot()).toEqual({ repo: "o/r", subject: { kind: "commits", location: "main/src" } })
  expect(seen).toHaveLength(3)
  unsubscribe()
  router.navigate({ repo: "o/r" })
  expect(seen).toHaveLength(3)
})

test("plain nested link clicks navigate; browser gestures, assets and unknown routes stay native", () => {
  window.history.replaceState(null, "", "/o/r")
  const router = createRepositoryRouter(window, document)
  stop = router.dispose
  document.body.innerHTML = '<div><a href="/o/r/flows"><span>Flows</span></a></div>'
  const span = document.querySelector("span")!
  const click = (options: MouseEventInit = {}) => {
    // Happy DOM runs MouseEvent anchor defaults before document bubbling.
    // Dispatch the browser click fields on an Event to exercise delegation without that platform default.
    const event = Object.assign(new Event("click", { bubbles: true, cancelable: true }), {
      button: 0, metaKey: false, ctrlKey: false, shiftKey: false, altKey: false, ...options
    })
    span.dispatchEvent(event)
    return event.defaultPrevented
  }
  for (const options of [{ metaKey: true }, { ctrlKey: true }, { shiftKey: true }, { altKey: true }, { button: 1 }]) expect(click(options)).toBe(false)
  const anchor = document.querySelector("a")!
  for (const href of ["https://example.com/o/r/flows", "/o/r/unknown", "/_astro/script.js", "#line-2", "/o/r/flows#graph"]) {
    anchor.setAttribute("href", href)
    expect(window.location.origin).toBe("https://smithers.sh")
    expect(anchor.href).toBe(new URL(href, window.location.href).href)
    expect(click(), href).toBe(false)
  }
  anchor.href = "/o/r/flows"
  anchor.target = "_blank"
  expect(click()).toBe(false)
  anchor.removeAttribute("target")
  anchor.download = "flows"
  expect(click()).toBe(false)
  anchor.removeAttribute("download")
  expect(click()).toBe(true)
  expect(document.querySelector("span")).toBe(span)
  expect(router.getSnapshot()?.subject).toEqual({ kind: "flows" })
})

test("redirects canonicalize; unserved and unknown subjects report not-found", () => {
  window.history.replaceState(null, "", "/o/r")
  const router = createRepositoryRouter(window, document)
  stop = router.dispose
  router.navigate({ repo: "o/r", subject: { kind: "redirect", to: "issues", from: "labels" } })
  expect(window.location.pathname).toBe("/o/r/issues")
  for (const subject of [{ kind: "runs" }, { kind: "run", id: "1" }, { kind: "approvals" }] as const) {
    expect(routeStatus({ repo: "o/r", subject })).toBe("not-found")
  }
  expect(routeStatus(null)).toBe("not-found")
  expect(hrefFor({ repo: "o/r", subject: { kind: "blob", location: "main/A%20B" } })).toBe("/o/r/blob/main/A%20B")
  expect(() => hrefFor({ repo: "../bad" })).toThrow()
})


test("delegation respects canceled clicks and disposal removes both subscriptions", () => {
  window.history.replaceState(null, "", "/o/r")
  const router = createRepositoryRouter(window, document)
  stop = router.dispose
  document.body.innerHTML = '<a href="/o/r/branches">Branches</a>'
  const anchor = document.querySelector("a")!
  const canceled = Object.assign(new Event("click", { bubbles: true, cancelable: true }), { button: 0 })
  canceled.preventDefault()
  anchor.dispatchEvent(canceled)
  expect(router.getSnapshot()).toEqual({ repo: "o/r" })
  const seen: unknown[] = []
  router.subscribe(() => seen.push(router.getSnapshot()))
  router.dispose()
  window.history.replaceState(null, "", "/o/r/branches")
  window.dispatchEvent(new PopStateEvent("popstate"))
  expect(seen).toEqual([])
  const click = Object.assign(new Event("click", { bubbles: true, cancelable: true }), { button: 0 })
  anchor.dispatchEvent(click)
  expect(click.defaultPrevented).toBe(false)
})


test("named view exports share boot's router and release it on teardown", () => {
  window.history.replaceState(null, "", "/o/r")
  const router = repositoryRouter()
  stop = router.dispose
  let changes = 0
  const unsubscribe = subscribe(() => { changes++ })
  expect(hrefFor({ kind: "flows" })).toBe("/o/r/flows")
  navigate({ kind: "flows" })
  expect(getSnapshot()).toBe(router.getSnapshot())
  expect(getSnapshot()?.subject).toEqual({ kind: "flows" })
  expect(changes).toBe(1)
  unsubscribe()
  router.dispose()
  window.history.replaceState(null, "", "/other/repo/settings")
  const remounted = repositoryRouter()
  stop = remounted.dispose
  expect(remounted).not.toBe(router)
  expect(getSnapshot()).toEqual({ repo: "other/repo", subject: { kind: "settings" } })
})
