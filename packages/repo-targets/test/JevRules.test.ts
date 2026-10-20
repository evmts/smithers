import { Smithers } from "@smthrs/targets"
import { describe, expect, it } from "vitest"
import type { JevRule } from "../src/index.ts"
import { JevRules } from "../src/index.ts"

/** The JevLint attrs a rule lowers to, as the target records them. */
interface LoweredRule {
  readonly id: string
  readonly files: ReadonlyArray<unknown>
  readonly lookFor: string
  readonly violation: string
  readonly compliant: string
  readonly severity?: string
}

/** What the macro has to get right is the JevLint attrs it emits, so these read them back. */
const attrsOf = (target: ReturnType<typeof JevRules>): {
  readonly rules: ReadonlyArray<LoweredRule>
  readonly threshold: number
  readonly failOn: string
  readonly manual: boolean
} => Smithers.Target.metadata(target).attrs as never

const rule: JevRule = {
  id: "durable.no-hand-rolled-durability",
  files: ["worker/!(*.test).ts"],
  lookFor: "Does this file implement its own retry loop?",
  violation: "The file hand-rolls a retry loop.",
  compliant: "The file has no retry loop of its own."
}

describe("JevRules", () => {
  it("declares one manual, non-cacheable lint-kind JevLint", () => {
    const metadata = Smithers.Target.metadata(JevRules({ cwd: "apps/mvp", rules: [rule] }))
    expect(metadata.target).toBe("JevLint")
    expect(metadata.kinds).toEqual(["lint"])
    expect(metadata.cacheable).toBe(false)
    expect(attrsOf(JevRules({ cwd: "apps/mvp", rules: [rule] })).manual).toBe(true)
  })

  it("anchors package-relative globs at cwd and keeps workspace-rooted globs, extglobs intact", () => {
    const attrs = attrsOf(JevRules({
      cwd: "apps/mvp",
      rules: [{ ...rule, files: ["worker/!(*.test).ts", "src/**/*.tsx", "//packages/rpc/src/**"] }]
    }))
    expect(attrs.rules[0]!.files).toEqual([
      { _tag: "Glob", pattern: "//apps/mvp/worker/!(*.test).ts", exclude: [] },
      { _tag: "Glob", pattern: "//apps/mvp/src/**/*.tsx", exclude: [] },
      { _tag: "Glob", pattern: "//packages/rpc/src/**", exclude: [] }
    ])
  })

  it("anchors a workspace-root declaration at the root", () => {
    const attrs = attrsOf(JevRules({ cwd: ".", rules: [{ ...rule, files: ["packages/rpc/src/**"] }] }))
    expect(attrs.rules[0]!.files).toEqual([{ _tag: "Glob", pattern: "//packages/rpc/src/**", exclude: [] }])
  })

  it("passes each rule's question and criteria through, and its severity only when given", () => {
    const attrs = attrsOf(JevRules({
      cwd: "apps/mvp",
      rules: [rule, { ...rule, id: "ui.minimal-text", severity: "warning" }]
    }))
    expect(attrs.rules.map(({ id, lookFor, violation, compliant, severity }) => ({
      id,
      lookFor,
      violation,
      compliant,
      severity
    }))).toEqual([
      { id: rule.id, lookFor: rule.lookFor, violation: rule.violation, compliant: rule.compliant, severity: undefined },
      {
        id: "ui.minimal-text",
        lookFor: rule.lookFor,
        violation: rule.violation,
        compliant: rule.compliant,
        severity: "warning"
      }
    ])
    expect("severity" in attrs.rules[0]!).toBe(false)
  })

  it("takes JevLint's defaults when the options name none", () => {
    const target = JevRules({ cwd: "apps/mvp", rules: [rule] })
    const attrs = attrsOf(target)
    // JevLint's own defaults: the macro adds none of its own.
    expect(attrs.threshold).toBe(0.8)
    expect(attrs.failOn).toBe("error")
    expect(Smithers.Target.metadata(target).summary).toBeUndefined()
    expect(Smithers.Target.metadata(target).featured).toBe(false)
  })

  it("passes the threshold, failure severity, summary and featured flag it is given", () => {
    const target = JevRules({
      cwd: "apps/mvp",
      rules: [rule],
      threshold: 0.7,
      failOn: "warning",
      summary: "Will's judgment rules for the MVP app, asked of Jev.",
      featured: true
    })
    expect(attrsOf(target).threshold).toBe(0.7)
    expect(attrsOf(target).failOn).toBe("warning")
    expect(Smithers.Target.metadata(target).summary).toBe("Will's judgment rules for the MVP app, asked of Jev.")
    expect(Smithers.Target.metadata(target).featured).toBe(true)
  })

  it.each(["", "/Users/someone/apps/mvp", "apps/../mvp"])("refuses the cwd %j", (cwd) => {
    expect(() => JevRules({ cwd, rules: [rule] })).toThrow(
      new TypeError(`JevRules cwd "${cwd}" must be a workspace-relative package directory`)
    )
  })

  it("refuses a declaration JevLint refuses: a repeated id, a malformed id, a blank question", () => {
    expect(() => JevRules({ cwd: "apps/mvp", rules: [rule, rule] })).toThrow(/declared more than once/)
    expect(() => JevRules({ cwd: "apps/mvp", rules: [{ ...rule, id: "Durable_Rule" }] })).toThrow()
    expect(() => JevRules({ cwd: "apps/mvp", rules: [{ ...rule, lookFor: "  " }] })).toThrow()
    expect(() => JevRules({ cwd: "apps/mvp", rules: [] })).toThrow()
  })
})
