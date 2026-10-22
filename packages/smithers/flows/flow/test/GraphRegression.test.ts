import { expect, it } from "@effect/vitest"
import { Flow, Graph } from "@smthrs/flow"
import { Node, Plan, Planned } from "@smthrs/plan"
import { Effect } from "effect"
import { withCrypto } from "./Crypto.ts"

it("keys every repeated reference position by its source slot", () => {
  const inputs = (sources: ReadonlyArray<string>) =>
    Graph.drafts(Graph.build(Node.succeed(
      sources.map((source) => Planned.make(source))
    )))[0]!.material.inputs
  expect(inputs(["a", "b", "a"])).not.toEqual(inputs(["a", "b", "b"]))
  // Structural node addresses are not content identities.
  expect(inputs(["a", "b", "a"])[0]).toEqual(inputs(["x", "y", "x"])[0])
})

it.effect("changes the compiled consumer key when a repeated occurrence changes supplier", () =>
  withCrypto(Effect.gen(function*() {
    const left = Planned.make<number>("root.all.left")
    const right = Planned.make<number>("root.all.right")
    const compile = (last: Planned.Planned<number>) =>
      Plan.compile({
        planId: "reference-occurrences",
        flow: "reference-occurrences",
        nodes: Graph.drafts(Graph.build(Node.all({
          left: Node.succeed(1),
          right: Node.succeed(2),
          result: Node.succeed([left, right, last])
        })))
      })
    const before = yield* compile(left)
    const after = yield* compile(right)
    const key = (plan: Plan.Plan, id: string) => plan.nodes.find((node) => node.id === id)!.key
    expect(key(before, "root.all.left")).toBe(key(after, "root.all.left"))
    expect(key(before, "root.all.right")).toBe(key(after, "root.all.right"))
    expect(key(before, "root.all.result")).not.toBe(key(after, "root.all.result"))
  })))

it("placement diagnostics never invoke a Symbol.toStringTag getter", () => {
  let reads = 0
  class Placement {
    get [Symbol.toStringTag]() {
      reads++
      return "private-placement"
    }
  }
  const child = Flow.make("Regression/placement/child", {
    payload: {},
    body: () => Node.succeed(undefined)
  }).annotate(Flow.Placement, new Placement() as unknown as Flow.PlacementDirective)
  const parent = Flow.make("Regression/placement/parent", {
    payload: {},
    body: () => child.call({})
  }).annotate(Flow.Placement, "different" as unknown as Flow.PlacementDirective)
  expect(() => Graph.build(parent, {})).toThrowError(expect.objectContaining({ code: "placement_requires_boundary" }))
  expect(reads).toBe(0)
})

it("public node drafts refuse a graph with fatal diagnostics", () => {
  const original = Node.succeed(1).pipe(Node.bindPlanned(() => Node.succeed(2)))
  const detached = Object.assign(Object.create(Object.getPrototypeOf(original)), {
    ast: JSON.parse(JSON.stringify(original.ast))
  })
  const graph = Graph.build(detached)
  expect(Graph.diagnostics(graph)).toHaveLength(1)
  expect(Graph.nodes(graph).map((node) => node.id)).toEqual(["root.andThen", "root"])
  for (const node of graph.nodes) expect(() => node.draft).toThrow(Graph.diagnostics(graph)[0])
})
