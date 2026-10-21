/**
 * Edges of graph building the rest of the suite runs through without pinning:
 * payloads that share or contain a container below the root, the descriptors
 * of what hydration writes, the outcome marker and its refusals, capability
 * inheritance and unparsable requirements, the depth an inline call adds,
 * and the topology of a catch.
 */
import { describe, expect, it } from "@effect/vitest"
import { Action, Flow, Graph } from "@smthrs/flow"
import { Node } from "@smthrs/plan"
import { Schema } from "effect"
import { OutcomeValueTypeId } from "../src/internal/OutcomeMarker.ts"

const Increment = Action.make("graph-edges/increment", {
  payload: { path: Schema.String },
  success: Schema.Number
})

/** Requires a capability no pattern parser accepts. */
const Unparsable = Action.make("graph-edges/unparsable", {
  payload: {},
  success: Schema.Number,
  capabilities: ["not-a-pattern"]
})

const node = (graph: Graph.Graph, id: string): Graph.GraphNode => {
  const found = Graph.nodes(graph).find((candidate) => candidate.id === id)
  expect(found, `node ${id}`).toBeDefined()
  return found!
}

const codeOf = (build: () => unknown): string => {
  try {
    build()
    return "built"
  } catch (thrown) {
    return (thrown as { code: string }).code
  }
}

/** An outcome node whose AST value was replaced after it was authored. */
const doneWith = (value: unknown) => {
  const done = Flow.done(1)
  ;(done.ast as { value: unknown }).value = value
  return done
}

describe("Graph.build payload walk", () => {
  it("hydrates one container a payload holds twice, since sharing it is not a cycle", () => {
    const shared = { value: 1 }
    const graph = Graph.build(Node.succeed({ left: shared, right: shared }))
    expect(node(graph, "root").payload).toEqual({ left: { value: 1 }, right: { value: 1 } })
  })

  it("refuses a payload whose inner container contains itself as cyclic, not as too deep", () => {
    const inner: { self?: unknown } = {}
    inner.self = inner
    expect(() => Graph.build(Node.succeed({ inner }))).toThrowError(expect.objectContaining({
      code: "cyclic_payload",
      node: "root"
    }))
  })

  it("hydrates every member as a writable, configurable data field", () => {
    const payload = node(Graph.build(Node.succeed({ outer: { inner: 1 }, list: [2] })), "root").payload
    expect(Object.getOwnPropertyDescriptor(payload, "outer")).toEqual({
      value: { inner: 1 },
      writable: true,
      enumerable: true,
      configurable: true
    })
    expect(Object.getOwnPropertyDescriptor((payload as { outer: object }).outer, "inner")).toEqual({
      value: 1,
      writable: true,
      enumerable: true,
      configurable: true
    })
  })
})

describe("Graph.build outcomes", () => {
  it("marks a hydrated outcome with a fixed, hidden marker", () => {
    const payload = node(Graph.build(Flow.done(1)), "root").payload
    expect(Object.getOwnPropertyDescriptor(payload, OutcomeValueTypeId)).toEqual({
      value: "Done",
      writable: false,
      enumerable: false,
      configurable: false
    })
  })

  it("keys an outcome by its outcome and a plain value without one", () => {
    expect(node(Graph.build(Flow.done(1)), "root").draft.material.body).toStrictEqual({
      _tag: "Succeed",
      outcome: "Done"
    })
    expect(node(Graph.build(Node.succeed(1)), "root").draft.material.body).toStrictEqual({ _tag: "Succeed" })
  })

  it("refuses an outcome whose payload is null or names another outcome", () => {
    for (const value of [null, { _tag: "To", value: 1 }]) {
      expect(() => Graph.build(doneWith(value))).toThrowError(expect.objectContaining({
        _tag: "@smthrs/plan/GraphBuildError",
        code: "invalid_payload",
        message: expect.stringContaining("lost its Done payload")
      }))
    }
  })
})

describe("Graph.build capabilities", () => {
  it("records no ceilings on a node nothing declares any for", () => {
    expect(node(Graph.build(Node.succeed(1)), "root").capabilityCeilings).toEqual([])
  })

  it("does not report an unparsable requirement when no flow above declares a ceiling", () => {
    const Open = Flow.make("graph-edges/open", {
      payload: {},
      success: Schema.Number,
      body: () => Unparsable.call({})
    })
    expect(Graph.diagnostics(Graph.build(Open, {}))).toEqual([])
  })

  it("reports an unparsable requirement under a ceiling as outside the grant", () => {
    const Ceilinged = Flow.make("graph-edges/ceilinged", {
      payload: {},
      success: Schema.Number,
      capabilities: ["fs:read:**"],
      body: () => Unparsable.call({})
    })
    expect(Graph.diagnostics(Graph.build(Ceilinged, {}))).toEqual([
      expect.objectContaining({ code: "capability_outside_grant", node: "root.flow", path: ["not-a-pattern"] })
    ])
  })

  it("gives an inline callee that declares no capabilities the caller's", () => {
    const Inner = Flow.make("graph-edges/inner", {
      payload: {},
      success: Schema.Number,
      body: () => Increment.call({ path: "counter.txt" })
    })
    const Outer = Flow.make("graph-edges/outer", {
      payload: {},
      success: Schema.Number,
      capabilities: ["fs:read:**"],
      body: () => Inner.call({})
    })
    const graph = Graph.build(Outer, {})
    expect(node(graph, "root.flow.flow").capabilities).toEqual(["fs:read:**"])
    expect((node(graph, "root.flow").draft.material.body as { declaration: unknown }).declaration).toMatchObject({
      capabilities: ["fs:read:**"]
    })
  })
})

describe("Graph.build topology", () => {
  it("counts a flow's own entry call toward the depth bound", () => {
    const nested = (depth: number) => {
      let deep: Node.Node<number> = Node.succeed(0)
      for (let index = 1; index <= depth; index++) deep = Node.andThen(deep, Node.succeed(index))
      return deep
    }
    const body = nested(Graph.maximumGraphDepth)
    const Deep = Flow.make("graph-edges/deep", { payload: {}, success: Schema.Number, body: () => body })

    expect(codeOf(() => Graph.build(body))).toBe("built")
    expect(codeOf(() => Graph.build(Deep, {}))).toBe("graph_too_deep")
  })

  it("makes a catch read its recovery arm by value", () => {
    const graph = Graph.build(
      Increment.call({ path: "counter.txt" }).pipe(Node.catch({ onFailure: () => Node.succeed(0) }))
    )
    expect(node(graph, "root").dependencies).toEqual(["root.protected", "root.failure"])
    expect(node(graph, "root").draft.material.inputs).toEqual([
      { _tag: "Ref", from: "root.protected", path: [] },
      { _tag: "Ref", from: "root.failure", path: [] }
    ])
  })
})
