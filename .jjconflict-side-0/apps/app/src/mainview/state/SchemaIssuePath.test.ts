import { describe, expect, test } from "bun:test"
import { z } from "zod"
import { TodoCardSchema } from "@smthrs/rpc/TodoCard"
import { declaredIssuePath, schemaKeyNames } from "./SchemaIssuePath"

describe("a zod issue path spelled for a diagnostic", () => {
  test("spells the schema's own keys and keeps indices", () => {
    // A row missing every field rejects at schema-authored positions only.
    const parsed = TodoCardSchema.array().safeParse([{ n: 1 }])
    expect(parsed.success).toBe(false)
    if (parsed.success) return
    const spelled = parsed.error.issues.map(issue => declaredIssuePath(TodoCardSchema, issue.path))
    expect(spelled.length).toBeGreaterThan(0)
    for (const path of spelled) expect(path).not.toContain("*")
    expect(spelled).toContain("0.title")
    expect(declaredIssuePath(TodoCardSchema, [0, "prompt_revisions", 0, "by", "avatar_url"]))
      .toBe("0.prompt_revisions.0.by.avatar_url")
  })

  test("masks a key the data chose, however it is spelled", () => {
    for (
      const key of [
        "https://attacker.invalid/?token=secret",
        "x".repeat(400),
        "служба_🔑",
        "",
        "__proto__"
      ]
    ) expect(declaredIssuePath(TodoCardSchema, [0, "waits", 0, "actions", 0, "args", key]))
      .toBe("0.waits.0.actions.0.args.*")
  })

  test("a symbol segment is a key the data chose too", () => {
    expect(declaredIssuePath(TodoCardSchema, [Symbol("title")])).toBe("*")
  })

  test("an empty path is an empty spelling; the caller names the row", () => {
    expect(declaredIssuePath(TodoCardSchema, [])).toBe("")
  })

  test("reaches keys through optional, union, record value and lazy recursion", () => {
    interface Node { readonly label: string; readonly child?: Node }
    const NodeSchema: z.ZodType<Node> = z.lazy(() => z.object({ label: z.string(), child: NodeSchema.optional() }))
    const schema = z.object({
      head: z.union([z.object({ left: z.string() }), z.object({ right: z.string() })]),
      bag: z.record(z.string(), z.object({ leaf: z.string() })),
      tree: NodeSchema
    })
    const names = schemaKeyNames(schema)
    for (const name of ["head", "left", "right", "bag", "leaf", "tree", "label", "child"]) expect(names.has(name)).toBe(true)
    expect(declaredIssuePath(schema, ["bag", "anything-at-all", "leaf"])).toBe("bag.*.leaf")
    expect(declaredIssuePath(schema, ["tree", "child", "label"])).toBe("tree.child.label")
  })
})
