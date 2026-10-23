import { IssuesView } from "@smthrs/ui"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { expect, test } from "vitest"
import { listProps, type ListRow } from "../src/features/issues/view"

test("an unsynced repository renders empty or Requested rows without a spinner or false counts", () => {
  const requested: ListRow = {
    id: "another-repository", number: 0, title: "New issue", state: "open", author: "", comments: 0,
    updatedAt: "", triage: "", pending: "requested", reason: "", local: 1,
  }
  for (const rows of [[], [requested]]) {
    const props = listProps(rows, undefined, { status: "allowed" })
    const html = renderToStaticMarkup(createElement(IssuesView, {
      repo: "octo/another", issues: props.issues, unknown: props.unknown,
    }))
    expect(html).not.toContain('aria-busy="true"')
    expect(html).not.toContain("Loading issues")
    expect(html).not.toContain("No issues")
    expect(html).not.toContain("0 open")
    if (rows.length !== 0) {
      expect(html).toContain("New issue")
      expect(html).toContain("Requested")
    }
  }
})
