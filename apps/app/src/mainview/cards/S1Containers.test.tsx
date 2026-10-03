import { describe, expect, test } from "bun:test"
import { renderToStaticMarkup } from "react-dom/server"
import type { ComponentType } from "react"
import { FileCardSchema, type CodeEditorViewProps } from "@smthrs/rpc/FileCard"
import { DiffCardSchema, type DiffViewProps } from "@smthrs/rpc/DiffCard"
import { MembersCardSchema, type MembersViewProps } from "@smthrs/rpc/MembersCard"
import { ConfirmCardSchema, type ConfirmViewProps, type ConfirmCard } from "@smthrs/rpc/ConfirmCard"
import { CatalogTagSchema, type CatalogTag } from "@smthrs/rpc/catalog/index"
import { fixtures as files } from "@smthrs/rpc/fixtures/File"
import { fixtures as diffs } from "@smthrs/rpc/fixtures/Diff"
import { fixtures as members } from "@smthrs/rpc/fixtures/Members"
import { fixtures as confirms } from "@smthrs/rpc/fixtures/Confirm"
import { FileContainer } from "./FileContainer"
import { DiffContainer } from "./DiffContainer"
import { MembersContainer } from "./MembersContainer"
import { ConfirmContainer } from "./ConfirmContainer"

const harness = <Props,>() => {
  let props: Props | undefined
  const calls: { tag: CatalogTag; input: unknown }[] = []
  const patches: unknown[] = []
  const View: ComponentType<Props> = value => { props = value; return null }
  return { View, dispatch: (tag: CatalogTag, input: unknown) => { calls.push({ tag, input }) },
    view: { maximized: false }, onView: (patch: unknown) => { patches.push(patch) },
    get props() { if (!props) throw new Error("View not rendered"); return props },
    get rendered() { return props !== undefined }, calls, patches }
}
const file = (model: unknown) => {
  const h = harness<CodeEditorViewProps>()
  renderToStaticMarkup(<FileContainer View={h.View} dispatch={h.dispatch} view={h.view} onView={h.onView} card={{ payload: { model } }} />)
  return h
}
const diff = (model: unknown) => {
  const h = harness<DiffViewProps>()
  renderToStaticMarkup(<DiffContainer View={h.View} dispatch={h.dispatch} view={h.view} onView={h.onView} card={{ payload: { model } }} />)
  return h
}
const roster = (role: "owner" | "maintainer" | "member" = "maintainer", session = true, model: unknown = members.team.model) => {
  const h = harness<MembersViewProps>()
  renderToStaticMarkup(<MembersContainer View={h.View} dispatch={h.dispatch} view={h.view} onView={h.onView} card={{ payload: { model } }} role={role} session={session} />)
  return h
}
const confirmation = (model: unknown, mayApprove = true, memberId = "ben", session = true) => {
  const h = harness<ConfirmViewProps>()
  renderToStaticMarkup(<ConfirmContainer View={h.View} dispatch={h.dispatch} view={h.view} onView={h.onView} card={{ id: "confirmation-17", audience_member_id: "ben", payload: { model } }}
    memberId={memberId} session={session} mayApprove={mayApprove} />)
  return h
}

describe("S1 File and Diff containers (T-APP-15)", () => {
  test("parse every File fixture and strip later-stage writable and presence state", () => {
    for (const fixture of Object.values(files)) {
      const h = file(fixture.model)
      expect(FileCardSchema.parse(h.props.model)).toEqual(h.props.model)
      expect(h.props.model.path).toBe(fixture.model.path)
      expect(h.props.model.content).toEqual(fixture.model.content)
      expect(h.props.model.mode).toBe("read_only")
      expect(h.props.model.authors).toEqual([])
      expect(h.props.model.editors).toEqual([])
      expect(h.props.actions).toEqual([])
      const gestures = Object.values(h.props.gestures)
      expect(gestures.map(action => CatalogTagSchema.parse(action!.tag))).toEqual(
        fixture.model.content.kind === "text" ? ["code.hover", "code.definition"] : [])
    }
  })
  test("code gestures bind the displayed path and reject malformed positions", () => {
    const h = file(files.text.model)
    for (const tag of ["code.hover", "code.definition"] as const) {
      h.props.onAction(tag, { path: "other.ts", line: "3", col: "7" })
      for (const [line, col] of [["0", "0"], ["1.5", "0"], ["2", "-1"], ["x", "2"], ["1", "NaN"]])
        h.props.onAction(tag, { line: line!, col: col! })
    }
    expect(h.calls).toEqual([
      { tag: "code.hover", input: { path: files.text.model.path, line: 3, col: 7 } },
      { tag: "code.definition", input: { path: files.text.model.path, line: 3, col: 7 } }
    ])
    h.props.onView({ line: 3 })
    expect(h.patches).toEqual([{ line: 3 }])
    const binary = file(files.binary.model)
    binary.props.onAction("code.hover", { line: "1", col: "0" })
    expect(binary.calls).toEqual([])
  })
  test("every Diff fixture parses and S1 never offers a restore write", () => {
    for (const fixture of Object.values(diffs)) {
      const h = diff(fixture.model)
      expect(h.props.model).toEqual(DiffCardSchema.parse(fixture.model))
      expect(h.props.actions).toEqual([])
      expect(h.props.gestures).toEqual({})
      h.props.onAction("file.restore")
      expect(h.calls).toEqual([])
    }
  })
  test("missing projections render nothing; invalid projections fail schema parsing", () => {
    expect(file(undefined).rendered).toBe(false)
    expect(diff(undefined).rendered).toBe(false)
    expect(() => file({ path: 12 })).toThrow()
    expect(() => diff({ path: 12 })).toThrow()
  })
})

describe("S1 Members container (T-APP-06)", () => {
  test("all fixtures parse; only person maintainers and owners receive mutations", () => {
    for (const fixture of Object.values(members)) for (const role of ["owner", "maintainer", "member"] as const) {
      const h = roster(role, true, fixture.model)
      expect(MembersCardSchema.parse(h.props.model)).toEqual(h.props.model)
      expect(h.props.model.members.map(({ actions: _, ...row }) => row)).toEqual(fixture.model.members.map(({ actions: _, ...row }) => row))
      expect(h.props.actions.map(action => CatalogTagSchema.parse(action.tag))).toEqual(role === "member" ? [] : ["members.add"])
      for (const row of h.props.model.members) {
        expect(row.actions.map(action => CatalogTagSchema.parse(action.tag))).toEqual(role === "member" || row.role === "owner" ? [] : ["members.role", "members.remove"])
        expect(row.actions.flatMap(action => action.input?.flatMap(field => field.choices ?? []) ?? [])).not.toContain("owner")
      }
    }
    expect(roster("owner", false).rendered).toBe(false)
  })
  test("invalid login and owner-role inputs send nothing; valid changes bind their member", () => {
    const h = roster()
    for (const login of ["", "-ben", "ben-", "b--en", "ben c", "a".repeat(40)])
      h.props.onAction("members.add", { login })
    expect(h.calls).toEqual([])
    for (const login of ["b", "Ben-Carter", "a".repeat(39)]) h.props.onAction("members.add", { login })
    const row = h.props.model.members.find(member => member.role !== "owner")!
    h.props.onAction("members.role", { login: row.login, role: "owner" })
    expect(h.calls).toHaveLength(3)
    h.props.onAction("members.role", { login: row.login, role: "member" })
    h.props.onAction("members.remove", { login: row.login })
    expect(h.calls.slice(3)).toEqual([
      { tag: "members.role", input: { login: row.login, role: "member" } },
      { tag: "members.remove", input: { login: row.login } }
    ])
    const readonly = roster("member")
    for (const tag of ["members.add", "members.role", "members.remove"] as const) readonly.props.onAction(tag)
    expect(readonly.calls).toEqual([])
  })
  test("source actions never grant authority and a new committed projection changes the model", () => {
    const original = roster("member")
    const updated = roster("member", true, members.suspended.model)
    expect(original.props.model.members).not.toEqual(updated.props.model.members)
    expect(updated.props.model.members.some(row => row.suspended)).toBe(true)
    expect(updated.props.model.members.every(row => row.actions.length === 0)).toBe(true)
    expect(() => roster("member", true, {})).toThrow()
  })
})

describe("S1 Confirm container (T-APP-04)", () => {
  test("all fixtures parse and never dispatch the initiating tag", () => {
    for (const fixture of Object.values(confirms)) {
      const h = confirmation(fixture.model)
      expect(h.props.model).toEqual(ConfirmCardSchema.parse(fixture.model))
      for (const action of h.props.actions) {
        expect(CatalogTagSchema.parse(action.tag)).toBe(action.tag)
        expect(["confirm.approve", "confirm.cancel"]).toContain(action.tag)
        expect(action.args).toEqual({ confirmation: "confirmation-17", revision: (fixture.model as ConfirmCard).subject.revision!,
          subject_kind: fixture.model.subject.kind, subject_ref: fixture.model.subject.ref })
      }
      h.props.onAction(fixture.model.action.tag)
      expect(h.calls).toEqual([])
      if (fixture.model.receipt) expect(h.props.actions).toEqual([])
    }
  })
  test("approve and deny bind ID, subject and revision; role cannot add an approval", () => {
    const model = confirms.one_click.model
    const h = confirmation(model)
    for (const action of h.props.actions) h.props.onAction(action.tag, { ...action.args })
    expect(h.calls).toEqual([
      { tag: "confirm.approve", input: { confirmation: "confirmation-17", revision: model.subject.revision,
        subject: { kind: "todo", ref: "T12" } } },
      { tag: "confirm.cancel", input: { confirmation: "confirmation-17", revision: model.subject.revision } }
    ])
    const denied = confirmation(model, false)
    expect(denied.props.actions.map(action => action.tag)).toEqual(["confirm.cancel"])
    denied.props.onAction("confirm.approve")
    expect(denied.calls).toEqual([])
  })
  test("privacy applies before decoding in every state and non-session callers get nothing", () => {
    for (const fixture of Object.values(confirms)) {
      expect(confirmation(fixture.model, true, "other").rendered).toBe(false)
      expect(confirmation(fixture.model, true, "ben", false).rendered).toBe(false)
    }
    expect(confirmation({}, true, "other").rendered).toBe(false)
    expect(confirmation(undefined).rendered).toBe(false)
    expect(() => confirmation({})).toThrow()
  })
  test("missing or mismatched revisions cannot approve; terminal receipts cannot cancel", () => {
    const base = confirms.one_click.model
    const unbound = confirmation({ ...base, subject: { kind: "todo", ref: "T12" } })
    expect(unbound.props.actions).toEqual([])
    for (const result of ["done", "cancelled", "expired"] as const) {
      const h = confirmation({ ...base, receipt: { by: { login: "ben", name: "Ben", avatar_url: "https://example.com/avatar" }, result, at: "2026-10-03T00:00:00Z" } })
      h.props.onAction("confirm.cancel")
      h.props.onAction("confirm.approve")
      expect(h.calls).toEqual([])
    }
    for (const fixture of Object.values(confirms).filter(fixture => fixture.model.kind === "review_merge" && !fixture.model.receipt)) {
      const model: ConfirmCard = fixture.model
      for (const source of [model, { ...model, subject: { ...model.subject, revision: "moved-head" } }]) {
        const h = confirmation(source)
        const enabled = source.review?.merge.state === "ready" && source.subject.revision === source.review.evidence.revision &&
          (source.review.approved_revision === undefined || source.review.approved_revision === source.subject.revision)
        expect(h.props.actions.find(action => action.tag === "confirm.approve")?.disabled === undefined).toBe(enabled)
        h.props.onAction("confirm.approve")
        expect(h.calls).toHaveLength(enabled ? 1 : 0)
      }
    }
  })
})


test("containers render their real design Views when no test View is injected", () => {
  const props = { view: { maximized: false }, onView: () => {}, dispatch: () => {} }
  expect(renderToStaticMarkup(<FileContainer {...props} card={{ payload: { model: files.binary.model } }} />)).toContain('data-kind="file"')
  const binary = { ...Object.values(diffs)[0]!.model, hunks: [], binary: { before_bytes: 1, after_bytes: 2 } }
  expect(renderToStaticMarkup(<DiffContainer {...props} card={{ payload: { model: binary } }} />)).toContain('data-kind="diff"')
  expect(renderToStaticMarkup(<MembersContainer {...props} card={{ payload: { model: members.team.model } }} role="member" session />)).toContain('data-kind="members"')
  expect(renderToStaticMarkup(<ConfirmContainer {...props} card={{ id: "confirmation-17", audience_member_id: "ben", payload: { model: confirms.one_click.model } }} memberId="ben" session mayApprove />)).toContain('data-kind="confirm"')
})
