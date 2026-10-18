import { expect, test } from "bun:test"
import { act } from "react"
import { createRoot } from "./views/testDom"
import { RepositoryOpenForm, repositoryInputTarget } from "./RepositoryOpenForm"

test("the shared open form uses the existing repository grammar", () => {
  for (const value of ["Ada/Widgets", "https://github.com/Ada/Widgets.git", "github.com/Ada/Widgets/tree/main", "/Ada/Widgets"]) {
    expect(repositoryInputTarget(value)).toEqual({ repo: "Ada/Widgets" })
  }
  for (const value of ["", "https://evil.example/a/b", "https://token@github.com/a/b", "javascript:alert(1)", "../.."]) {
    expect(repositoryInputTarget(value)).toHaveProperty("error")
  }
})
test("submit navigates to the repository and refuses an unsafe host without reflecting it", () => {
  const host = document.createElement("div")
  const root = createRoot(host)
  const opened: string[] = []
  act(() => root.render(<RepositoryOpenForm onOpenRepository={href => opened.push(href)} />))
  const field = host.querySelector("input")!
  const submit = (value: string) => {
    field.value = value
    act(() => host.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })))
  }
  submit("https://evil.example/a/b")
  expect(opened).toEqual([])
  expect(host.querySelector('[role="alert"]')!.textContent).toContain("Enter owner/name")
  expect(host.textContent).not.toContain("evil.example")
  submit("https://github.com/Ada/Widgets")
  expect(opened).toEqual(["/ada/widgets/"])
  act(() => root.unmount())
})
