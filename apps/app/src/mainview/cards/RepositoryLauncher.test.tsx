import { afterEach, expect, test } from "bun:test"
import { act } from "react"
import { createRoot } from "./views/testDom"
import { LAUNCHER_ROWS, RepositoryLauncher, repositoryHref } from "./RepositoryLauncher"
import type { LauncherRepository, RepositoryLauncherProps } from "./RepositoryLauncher"
import type { SmithersUpdate } from "../state/seams/LauncherSeam"

/*
 * The launcher at `/` (M-45): open a repository Smithers already has, create
 * one, explore the others, and read genuine Smithers update news. A read
 * that did not answer is absent and says so; it never becomes an empty frame
 * a reader would take for "nothing happened".
 */

const mounted: Array<() => void> = []
afterEach(() => { while (mounted.length > 0) mounted.pop()?.() })

const UPDATE: SmithersUpdate = {
  id: "https://github.com/smithersai/smithers/releases/tag/1.2.0",
  title: "Smithers 1.2", date: "2026-10-14T10:00:00.000Z",
  url: "https://github.com/smithersai/smithers/releases/tag/1.2.0"
}

const render = (over: Partial<RepositoryLauncherProps> = {}) => {
  const calls: Array<[string, string | undefined]> = []
  const host = document.createElement("div")
  document.body.append(host)
  const root = createRoot(host)
  act(() => root.render(<RepositoryLauncher
    repositories={over.repositories ?? []}
    updates={over.updates}
    catalogRead={over.catalogRead}
    signedIn={over.signedIn ?? true}
    onRunCommand={over.onRunCommand ?? ((name, args) => { calls.push([name, args]) })}
  />))
  mounted.push(() => { act(() => root.unmount()); host.remove() })
  return { host, calls }
}

/* React tracks a controlled input's value, so a direct assignment is invisible to it: go through the DOM's own setter. */
const type = async (input: HTMLInputElement, value: string): Promise<void> => {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value)
    input.dispatchEvent(new Event("input", { bubbles: true }))
  })
}

const section = (host: HTMLElement, name: string) => host.querySelector<HTMLElement>(`[data-section="${name}"]`)!

test("every repository is offered at its own GitHub-shaped address, own rows apart from the public shelf", () => {
  const repositories: ReadonlyArray<LauncherRepository> = [
    { id: "Ada/Widgets" },
    { id: "smithersai/smithers", catalog: true, summary: "A durable workflow framework." }
  ]
  const { host } = render({ repositories, catalogRead: { kind: "read" } })
  const own = [...section(host, "open").querySelectorAll<HTMLAnchorElement>("a")]
  expect(own.map(link => link.getAttribute("href"))).toEqual(["/ada/widgets/"])
  const explore = [...section(host, "explore").querySelectorAll<HTMLAnchorElement>("a")]
  expect(explore.map(link => link.getAttribute("href"))).toEqual(["/smithersai/smithers/"])
  expect(explore[0]!.textContent).toContain("A durable workflow framework.")
  expect(repositoryHref("Ada/Widgets")).toBe("/ada/widgets/")
})

/*
 * Being listed publicly is not a fact about who the reader is. An account's
 * own public repository belongs on its own shelf, not on the shelf of
 * things to discover.
 */
test("an account's own public repository reads under its own repositories, not the explore shelf", () => {
  const { host } = render({
    repositories: [{ id: "will/public" }, { id: "smithersai/smithers", catalog: true }],
    catalogRead: { kind: "read" }
  })
  expect([...section(host, "open").querySelectorAll("a")].map(link => link.getAttribute("href"))).toEqual(["/will/public/"])
  expect([...section(host, "explore").querySelectorAll("a")].map(link => link.getAttribute("href"))).toEqual(["/smithersai/smithers/"])
})

test("a large account reads eight rows and the rest behind a native disclosure", () => {
  const repositories = Array.from({ length: LAUNCHER_ROWS + 5 }, (_, index) => ({ id: `ada/repo-${index}` }))
  const { host } = render({ repositories })
  const open = section(host, "open")
  expect(open.querySelector("ol")!.querySelectorAll("a")).toHaveLength(LAUNCHER_ROWS)
  const all = open.querySelector("details")!
  expect(all.querySelector("summary")!.textContent).toBe(`All ${repositories.length}`)
  expect(all.querySelectorAll("a")).toHaveLength(5)
})

test("create runs the real GitHub create flow with the typed name, and nothing before a name is typed", async () => {
  const { host, calls } = render()
  const create = section(host, "create")
  /*
   * The door it runs makes a repository on the person's own GitHub account
   * (flows/entries/repos.ts -> GitHubRepoCreateSeam -> POST
   * /api/user/github-repos), and the heading says exactly that. The note
   * beside it says what creating does NOT do: importing is a separate act.
   */
  expect(create.querySelector("h2")!.textContent).toBe("Create a repository on GitHub")
  expect(create.querySelector("p")!.textContent).toBe("A new repository is private, and on GitHub only until you open it here to import it.")
  const button = create.querySelector<HTMLButtonElement>('[data-flow="repos.create"]')!
  expect(button.disabled).toBe(true)
  button.click()
  expect(calls).toEqual([])
  const input = create.querySelector<HTMLInputElement>("input")!
  await type(input, "  my-project  ")
  expect(button.disabled).toBe(false)
  await act(async () => { create.querySelector<HTMLFormElement>("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })) })
  expect(calls).toEqual([["repos.create", "my-project"]])
})

test("signed out nothing signs anybody in, and the public shelf still reads", () => {
  const { host, calls } = render({
    signedIn: false,
    repositories: [{ id: "smithersai/smithers", catalog: true }],
    catalogRead: { kind: "read" }
  })
  expect(section(host, "open").querySelectorAll("a")).toHaveLength(0)
  expect(section(host, "create").querySelector("form")).toBeNull()
  expect(section(host, "explore").querySelectorAll("a")).toHaveLength(1)
  // The page's own sign-in door is the only one; the launcher opens none.
  expect(host.querySelector('[data-flow="sign-in"]')).toBeNull()
  expect(calls).toEqual([])
})

test("dated updates carry the source's date, title and page, and nothing the app wrote", () => {
  const { host } = render({ updates: { kind: "read", updates: [UPDATE] } })
  const row = section(host, "updates").querySelector("li")!
  expect(row.querySelector("time")!.getAttribute("datetime")).toBe(UPDATE.date)
  expect(row.querySelector("time")!.textContent).toBe("2026-10-14")
  const link = row.querySelector<HTMLAnchorElement>("a")!
  expect(link.getAttribute("href")).toBe(UPDATE.url)
  expect(link.textContent).toBe("Smithers 1.2")
})

test("an unreadable source says so and offers the read again; it never shows an empty updates frame", () => {
  const { host } = render({ updates: { kind: "unreadable" } })
  const updates = section(host, "updates")
  expect(updates.querySelector("[data-testid=repository-launcher-updates-unreadable]")).not.toBeNull()
  expect(updates.textContent).toContain("couldn't be read")
  for (const invented of ["No updates", "up to date", "Nothing new"]) expect(updates.textContent).not.toContain(invented)
  expect(updates.querySelectorAll("li")).toHaveLength(0)
  expect(updates.querySelector<HTMLButtonElement>('[data-flow="app.updates"]')!.textContent).toBe("Retry")
})

test("a refused catalog says so and offers the read again; it never shows an empty shelf", () => {
  const { host } = render({ catalogRead: { kind: "unreadable" } })
  const explore = section(host, "explore")
  expect(explore.textContent).toContain("couldn't be read")
  expect(explore.textContent).not.toContain("No repositories are public")
  expect(explore.querySelector<HTMLButtonElement>('[data-flow="repos.explore"]')!.textContent).toBe("Retry")
})

test("an answered empty catalog and an answered empty feed each state what the read actually found", () => {
  const { host } = render({ catalogRead: { kind: "read" }, updates: { kind: "read", updates: [] } })
  expect(section(host, "explore").textContent).toContain("No repositories are public yet.")
  expect(section(host, "updates").textContent).toContain("no published update yet")
})

test("every act is reachable from the keyboard: native links, buttons, a form and a disclosure", () => {
  const { host } = render({
    repositories: [{ id: "ada/widgets" }, { id: "smithersai/smithers", catalog: true }],
    catalogRead: { kind: "read" },
    updates: { kind: "unreadable" }
  })
  for (const element of host.querySelectorAll<HTMLElement>("a, button, input, summary")) {
    expect(element.getAttribute("tabindex")).not.toBe("-1")
    expect(["A", "BUTTON", "INPUT", "SUMMARY"]).toContain(element.tagName)
  }
})
