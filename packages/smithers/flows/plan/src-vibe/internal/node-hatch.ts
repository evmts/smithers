// A-1/B-4: preserve synchronous throwing validators; C-1: native catches; D-2: plain sibling TypeScript calls.
import { isRecord } from "@smthrs/canonical/Record"
import { digestSync } from "@smthrs/crypto"
import * as Identity from "@smthrs/crypto/Identity"
import { identity } from "effect/Function"
import { pipeArguments } from "effect/Pipeable"
import * as Schema from "effect/Schema"
import type { Node } from "../Node.vibe"
import type * as Planned from "../Planned.vibe"
import { jsonMirror } from "./JsonMirror.vibe"
import { schemaIdentity } from "./SchemaIdentity.vibe"
import type { Scheduled, Succeed, Fail, All, RaceMode, Race, Map, AndThen, Branch, Catch, FlowCall, ActionCall, FunctionIdentity, PlannedReference, NodeAst } from "./node.vibe"
import { TypeId, CallMode, IdentityAlgorithm, capture, plannedReference, functionIdentity, NodeProto, isRaceCount, makeNode, succeed, fail, all, race, map, andThen, flowCall, actionCall, operation, predicate, filter, declaration, withPriority } from "./node.vibe"
import type { LiveState, Operation, Predicate, AstVisit } from "./node-pure.vibe"
import { stateKey, globals, liveState, plannedReferences, makePlannedReference, operations, predicates, filters, declarations, payloadMirror, liveNodes, isIdentityAlgorithm, isCallMode, isRaceMode } from "./node-pure.vibe"
export const isFunctionIdentity = (value: unknown): value is FunctionIdentity =>
  isRecord(value) && value._tag === "FunctionIdentity" && isIdentityAlgorithm(value.algorithm) &&
  typeof value.digest === "string"

export const isNodeAst = (value: unknown): value is NodeAst => {
  const ancestors = new Set<object>()
  const pending: Array<AstVisit> = [{ enter: value }]
  while (pending.length > 0) {
    const visit = pending.pop()!
    if ("exit" in visit) {
      ancestors.delete(visit.exit)
      continue
    }
    const ast = visit.enter
    if (!isRecord(ast) || ancestors.has(ast)) return false
    if (ast.priority !== undefined && !Number.isSafeInteger(ast.priority)) return false
    const children: Array<unknown> = []
    switch (ast._tag) {
      case "Succeed":
      case "Fail":
        break
      case "All": {
        if (!isRecord(ast.nodes) || Array.isArray(ast.nodes)) return false
        for (const child of Object.values(ast.nodes)) children.push(child)
        break
      }
      case "Race": {
        if (!isRecord(ast.nodes) || Array.isArray(ast.nodes)) return false
        const members = Object.values(ast.nodes)
        if (!isRaceMode(ast.mode) || !isRaceCount(ast.mode, ast.count, members.length)) return false
        for (const child of members) children.push(child)
        break
      }
      case "Map": {
        if (!isFunctionIdentity(ast.mapper)) return false
        children.push(ast.first)
        break
      }
      case "AndThen": {
        if (!isFunctionIdentity(ast.continuation)) return false
        children.push(ast.first)
        if (ast.next !== undefined) children.push(ast.next)
        break
      }
      case "Branch": {
        if (typeof ast.subject !== "string" || !isFunctionIdentity(ast.predicate)) return false
        children.push(ast.first, ast.then, ast.else)
        break
      }
      case "Catch": {
        if (typeof ast.subject !== "string") return false
        if (ast.filterIdentity !== undefined && !isFunctionIdentity(ast.filterIdentity)) return false
        children.push(ast.protected, ast.failure)
        break
      }
      case "FlowCall": {
        if (typeof ast.flow !== "string" || !isCallMode(ast.mode)) return false
        break
      }
      case "ActionCall": {
        if (typeof ast.action !== "string") return false
        break
      }
      default:
        return false
    }
    if (children.length > 0) {
      ancestors.add(ast)
      pending.push({ exit: ast })
      for (const child of children) pending.push({ enter: child })
    }
  }
  return true
}

export const isNode = (value: unknown): value is Node<unknown, unknown, any> => {
  if (typeof value !== "object" || value === null) return false
  if (liveNodes.has(value)) return true
  if (Object.getPrototypeOf(value) !== NodeProto) return false
  const ast = Object.getOwnPropertyDescriptor(value, "ast")
  return ast !== undefined && "value" in ast && isNodeAst(ast.value)
}

export const andThenNode = (first: NodeAst, next: NodeAst): AndThen => ({
  _tag: "AndThen",
  first,
  continuation: { _tag: "FunctionIdentity", algorithm: "static-node/v1", digest: digestSync("static-node") },
  next
})

export const branch = (
  subject: string,
  first: NodeAst,
  predicate: Predicate,
  source: unknown,
  then: NodeAst,
  otherwise: NodeAst
): Branch => {
  const ast: Branch = {
    _tag: "Branch",
    subject,
    first,
    predicate: functionIdentity(source),
    then,
    else: otherwise
  }
  predicates.set(ast, predicate)
  return ast
}

export const filterIdentity = (filter: Schema.Top): FunctionIdentity => {
  const identities: Array<readonly [string, FunctionIdentity]> = []
  const pending: Array<readonly [string, unknown]> = [["$", filter.ast]]
  const seen = new WeakSet<object>()
  while (pending.length > 0) {
    const [path, current] = pending.pop()!
    if (typeof current === "function") {
      identities.push([path, functionIdentity(current)])
    } else if (typeof current === "object" && current !== null && !seen.has(current)) {
      seen.add(current)
      const descriptors = Object.getOwnPropertyDescriptors(current)
      for (const key of Object.keys(descriptors).sort()) {
        const descriptor = descriptors[key]!
        if ("value" in descriptor) pending.push([`${path}/${JSON.stringify(key)}`, descriptor.value])
        else {
          if (descriptor.get !== undefined) pending.push([`${path}/${JSON.stringify(key)}/get`, descriptor.get])
          if (descriptor.set !== undefined) pending.push([`${path}/${JSON.stringify(key)}/set`, descriptor.set])
        }
      }
    }
  }
  const ephemeral = identities.some(([, identity]) => identity.algorithm === "sha256-source-ephemeral/v4")
  const sourceComparable = identities.every(([, identity]) =>
    identity.algorithm !== "sha256-source-ephemeral/v4" || identity.sourceDigest !== undefined
  )
  return {
    _tag: "FunctionIdentity",
    algorithm: ephemeral
      ? "sha256-source-ephemeral/v4"
      : "sha256-source-captures/v5",
    digest: digestSync(JSON.stringify(identities)),
    ...(ephemeral && sourceComparable
      ? {
        sourceDigest: digestSync(JSON.stringify(identities.map(([path, identity]) => [path, {
          _tag: identity._tag,
          algorithm: identity.algorithm,
          digest: identity.sourceDigest ?? identity.digest
        }])))
      }
      : {})
  }
}

export const catch_ = (subject: string, protectedAst: NodeAst, failure: NodeAst, filter?: Schema.Top): Catch => {
  const ast: Catch = {
    _tag: "Catch",
    subject,
    protected: protectedAst,
    failure,
    ...(filter === undefined
      ? {}
      : {
        filter: schemaIdentity(filter, { onExcessProperty: "error" }),
        filterIdentity: filterIdentity(filter)
      })
  }
  if (filter !== undefined) filters.set(ast, filter)
  return ast
}
