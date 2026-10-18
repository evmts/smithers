// A-1/B-4: preserve synchronous validation throws; C-1: native failures must be caught; D-2: plain sibling TypeScript boundaries.
import { dual } from "effect/Function"
import type * as Pipeable from "effect/Pipeable"
import type * as Schema from "effect/Schema"
import type * as SchemaAST from "effect/SchemaAST"
import type * as Types from "effect/Types"
import { GraphBuildError } from "./GraphBuildError.vibe"
import * as internal from "./internal/node.vibe"
import * as internalSchemaIdentity from "./internal/SchemaIdentity.vibe"
import * as Planned from "./Planned.vibe"
import type { Ast, FunctionIdentity, Node, Any, Success, Error, Services, BranchOptions, CatchOptions, Succeed, Fail, Members, SchemaIdentity, SchemaIdentityOptions } from "./Node.vibe"
import { TypeId, CallMode, plannedReference, branchSubject, catchSubject, succeed, fail, map, bindPlanned, maximumArmDepth, declaredPriority, flowCall, actionCall, declaration, continuation, mapper, predicate, catchFilter, functionIdentity, SchemaIdentityError, representationIdentity } from "./Node.vibe"
export const subjectsKey = Symbol.for("@smthrs/plan/Node/subjects/v1")

export const globals = globalThis as typeof globalThis & { [subjectsKey]?: { branch: number; catch: number } }

export const subjects = globals[subjectsKey] ??= { branch: 0, catch: 0 }

export const isNode = (value: unknown): value is Any => internal.isNode(value)

export const all = <const Nodes extends Readonly<Record<string, Any>>>(
  nodes: Nodes
): Node<
  Types.Simplify<{ readonly [K in keyof Nodes]: Success<Nodes[K]> }>,
  Error<Nodes[keyof Nodes]>,
  Services<Nodes[keyof Nodes]>
> => internal.makeNode(internal.all(memberAsts(nodes, "all", "invalid_all_member")))

export const memberAsts = (
  nodes: Readonly<Record<string, unknown>>,
  combinator: string,
  code: "invalid_all_member" | "invalid_join"
): Record<string, Ast> => {
  const asts: Record<string, Ast> = Object.create(null) as Record<string, Ast>
  for (const [member, node] of Object.entries(nodes)) {
    if (!isNode(node)) {
      throw new GraphBuildError({
        code,
        node: member,
        path: [],
        message: `Node.${combinator} expected a Node at member "${member}"`
      })
    }
    Object.defineProperty(asts, member, {
      configurable: true,
      enumerable: true,
      value: node.ast,
      writable: true
    })
  }
  return asts
}

export const join = (mode: internal.RaceMode, count: number, nodes: Readonly<Record<string, unknown>>): Ast => {
  const asts = memberAsts(nodes, mode, "invalid_join")
  const width = Object.keys(asts).length
  if (!internal.isRaceCount(mode, count, width)) {
    throw new GraphBuildError({
      code: "invalid_join",
      node: mode,
      path: [],
      message: mode === "quorum"
        ? `Node.quorum needs a whole number of successes between 1 and its ${width} members, got ${String(count)}`
        : `Node.${mode} needs at least one member`
    })
  }
  return internal.race(mode, count, asts)
}

export const race = <const Nodes extends Members>(
  nodes: Nodes
): Node<Success<Nodes[keyof Nodes]>, Error<Nodes[keyof Nodes]>, Services<Nodes[keyof Nodes]>> =>
  internal.makeNode(join("race", 1, nodes))

export const any = <const Nodes extends Members>(
  nodes: Nodes
): Node<Success<Nodes[keyof Nodes]>, Error<Nodes[keyof Nodes]>, Services<Nodes[keyof Nodes]>> =>
  internal.makeNode(join("any", 1, nodes))

export const quorum = <const Nodes extends Members>(
  count: number,
  nodes: Nodes
): Node<
  Types.Simplify<{ readonly [K in keyof Nodes]?: Success<Nodes[K]> }>,
  Error<Nodes[keyof Nodes]>,
  Services<Nodes[keyof Nodes]>
> => internal.makeNode(join("quorum", count, nodes))

export const andThen: {
  <B, E2, R2>(next: Node<B, E2, R2>): <A, E, R>(self: Node<A, E, R>) => Node<B, E | E2, R | R2>
  <A, E, R, B, E2, R2>(self: Node<A, E, R>, next: Node<B, E2, R2>): Node<B, E | E2, R | R2>
} = dual(
  2,
  <A, E, R, B, E2, R2>(
    self: Node<A, E, R>,
    next: Node<B, E2, R2>
  ): Node<B, E | E2, R | R2> => {
    if (!isNode(next)) {
      throw new GraphBuildError({
        code: "invalid_continuation",
        node: "andThen/next",
        path: [],
        message:
          "Node.andThen expects a Node; use Node.bindPlanned for a symbolic builder or Node.map for value computation"
      })
    }
    return internal.makeNode<B, E | E2, R | R2>(internal.andThenNode(self.ast, next.ast))
  }
)

export let armDepth = 0

export const arm = <A, B, E, R>(
  build: (value: Planned.Planned<A>) => Node<B, E, R>,
  subject: Planned.Planned<A>,
  side: string
): Ast => {
  if (armDepth >= maximumArmDepth) {
    throw new GraphBuildError({
      code: "graph_too_deep",
      node: `${branchSubject}/${side}`,
      path: [],
      message: "Node.branch recursion needs a plan-time bound, such as a payload-derived round count. " +
        "Both arms are built before the run-time predicate is evaluated."
    })
  }
  armDepth++
  try {
    const node = build(subject)
    if (!isNode(node)) {
      throw new GraphBuildError({
        code: "invalid_continuation",
        node: `${branchSubject}/${side}`,
        path: [],
        message: `Node.branch expected its "${side}" arm to return a Node`
      })
    }
    return node.ast
  } finally {
    armDepth--
  }
}

export const branch: {
  <A, B1, E1, R1, B2, E2, R2>(
    options: BranchOptions<A, B1, E1, R1, B2, E2, R2>
  ): <E, R>(self: Node<A, E, R>) => Node<B1 | B2, E | E1 | E2, R | R1 | R2>
  <A, E, R, B1, E1, R1, B2, E2, R2>(
    self: Node<A, E, R>,
    options: BranchOptions<A, B1, E1, R1, B2, E2, R2>
  ): Node<B1 | B2, E | E1 | E2, R | R1 | R2>
} = dual(
  2,
  <A, E, R, B1, E1, R1, B2, E2, R2>(
    self: Node<A, E, R>,
    options: BranchOptions<A, B1, E1, R1, B2, E2, R2>
  ): Node<B1 | B2, E | E1 | E2, R | R1 | R2> => {
    const predicate = options.if
    const subjectToken = `${branchSubject}/${subjects.branch++}`
    const subject = Planned.make<A>(subjectToken)
    return internal.makeNode<B1 | B2, E | E1 | E2, R | R1 | R2>(
      internal.branch(
        subjectToken,
        self.ast,
        (value) => predicate(value as A),
        predicate,
        arm(options.then, subject, "then"),
        arm(options.else, subject, "else")
      )
    )
  }
)

export const catch_: {
  <Handled, B, E2, R2>(
    options: CatchOptions<unknown, B, E2, R2, Handled> & {
      readonly error: Schema.Schema<Handled>
    }
  ): <A, E, R>(self: Node<A, E, R>) => Node<A | B, E | E2, R | R2>
  <E, B, E2, R2>(
    options: CatchOptions<E, B, E2, R2> & {
      readonly error?: undefined
    }
  ): <A, R>(self: Node<A, E, R>) => Node<A | B, E2, R | R2>
  <A, E, R, Handled, B, E2, R2>(
    self: Node<A, E, R>,
    options: CatchOptions<E, B, E2, R2, Handled> & {
      readonly error: Schema.Schema<Handled>
    }
  ): Node<A | B, E | E2, R | R2>
  <A, E, R, B, E2, R2>(
    self: Node<A, E, R>,
    options: CatchOptions<E, B, E2, R2> & {
      readonly error?: undefined
    }
  ): Node<A | B, E2, R | R2>
} = dual(
  2,
  <A, E, R, Handled, B, E2, R2>(
    self: Node<A, E, R>,
    options: CatchOptions<E, B, E2, R2, Handled>
  ): Node<A | B, E | E2, R | R2> => {
    const subjectToken = `${catchSubject}/${subjects.catch++}`
    const failure = options.onFailure(Planned.make<Handled>(subjectToken))
    if (!isNode(failure)) {
      throw new GraphBuildError({
        code: "invalid_continuation",
        node: catchSubject,
        path: [],
        message: "Node.catch expected its failure arm to return a Node"
      })
    }
    return internal.makeNode(internal.catch_(subjectToken, self.ast, failure.ast, options.error))
  }
)

export const priority: {
  (value: number): <A, E, R>(self: Node<A, E, R>) => Node<A, E, R>
  <A, E, R>(self: Node<A, E, R>, value: number): Node<A, E, R>
} = dual(
  2,
  <A, E, R>(self: Node<A, E, R>, value: number): Node<A, E, R> => {
    if (!Number.isSafeInteger(value)) {
      throw new GraphBuildError({
        code: "invalid_priority",
        node: self.ast._tag,
        path: [],
        message: `Node.priority expects a safe integer, received ${value}`
      })
    }
    return internal.makeNode<A, E, R>(internal.withPriority(self.ast, value))
  }
)

export const schemaIdentity = (schema: Schema.Top, options?: SchemaIdentityOptions): SchemaIdentity =>
  internalSchemaIdentity.schemaIdentity(schema, options)

export const capture = <C extends Readonly<Record<string, unknown>>, Args extends ReadonlyArray<unknown>, A>(
  captures: C,
  operation: (this: Readonly<C>, ...args: Args) => A
): (...args: Args) => A => internal.capture(captures, operation)
