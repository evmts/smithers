/**
 * One parse of a source file's module references and calls.
 *
 * The `ImportRules` macro and the repository dependency-boundary gate
 * (`contracts/check-dependency-boundaries.mjs`) both read imports, so both read
 * them here, with the TypeScript compiler API. Nothing scans source text with
 * a regular expression: a string or a comment that mentions an import is not
 * one.
 *
 * Node loads this module directly through type stripping, so it uses only
 * erasable TypeScript.
 *
 * @since 0.1.0
 */

import ts from "typescript"

/**
 * How a source names a module.
 *
 * `import` and `export` are declarations with a `from` clause (and
 * `import "x"`); `import-equals` is `import x = require("x")`;
 * `dynamic-import` is `import("x")`; `require` is `require("x")`;
 * `import-type` is an `import("x")` type.
 *
 * @category models
 * @since 0.1.0
 */
export type ReferenceForm = "import" | "export" | "import-equals" | "dynamic-import" | "require" | "import-type"

/**
 * One name a source takes from a module.
 *
 * @category models
 * @since 0.1.0
 */
export interface ReferencedName {
  /** The name the module exports: `useState` for `import { useState as s }`, `default` for a default import. */
  readonly name: string
  /** Whether only a type is taken: `import type`, `export type`, a `type` modifier, or an `import()` type. */
  readonly typeOnly: boolean
  /** The 1-based line it appears on. */
  readonly line: number
}

/**
 * A name read through a namespace or default import binding: `React.useState`
 * from `import * as React from "react"`, or the qualified type `X.Y`.
 *
 * @category models
 * @since 0.1.0
 */
export interface MemberName extends ReferencedName {
  /** The local binding the name is read through, `React` above. */
  readonly binding: string
}

/**
 * One place a source names a module.
 *
 * @category models
 * @since 0.1.0
 */
export interface ModuleReference {
  readonly specifier: string
  readonly form: ReferenceForm
  /** The 1-based line of the declaration, call or type. */
  readonly line: number
  /**
   * Whether nothing of the module loads at runtime: `import type`,
   * `export type`, `import type x = require("x")`, or an `import()` type.
   * A declaration whose every named element carries its own `type` modifier
   * is not type-only here, because `verbatimModuleSyntax` keeps it as a
   * side-effect import.
   */
  readonly typeOnly: boolean
  /** Names imported or re-exported by name, and an `import()` type's qualifier. */
  readonly names: ReadonlyArray<ReferencedName>
  /** Names read through this declaration's namespace or default binding. */
  readonly members: ReadonlyArray<MemberName>
}

/**
 * One call whose callee is a name or ends in a member name.
 *
 * @category models
 * @since 0.1.0
 */
export interface Call {
  /**
   * The callee as dotted names, with parentheses, type assertions, non-null
   * assertions and optional chaining removed: `Model.stream` for
   * `Model.stream(request)`, `this.client.send` for `this.client!.send()`.
   *
   * A string key reads as a member, so `page["route"]()` is `page.route`; a
   * key that is not an identifier keeps its brackets, as in
   * `headers["content-type"]`. A receiver that is a call ends in `()`, as in
   * `page.context().route`, and any other receiver, such as an `await` or a
   * computed key, reads as `(…)`, as in `(…).route`. A call whose callee does
   * not end in a name, such as `f()()` or `x[name]()`, is not recorded.
   */
  readonly callee: string
  readonly line: number
}

/**
 * Everything {@link analyze} reads from one source.
 *
 * @category models
 * @since 0.1.0
 */
export interface Analysis {
  /** Every module reference, in source order. */
  readonly references: ReadonlyArray<ModuleReference>
  /** Every call whose callee is a name or ends in a member name, outermost first, in source order. */
  readonly calls: ReadonlyArray<Call>
}

/** The parser's script kind for a file name. */
const scriptKind = (file: string): ts.ScriptKind => {
  if (file.endsWith(".tsx")) return ts.ScriptKind.TSX
  if (file.endsWith(".jsx")) return ts.ScriptKind.JSX
  if (/\.[mc]?ts$/.test(file)) return ts.ScriptKind.TS
  return ts.ScriptKind.JS
}

interface Entry {
  readonly position: number
  readonly reference: {
    readonly specifier: string
    readonly form: ReferenceForm
    readonly line: number
    readonly typeOnly: boolean
    readonly names: Array<ReferencedName>
    readonly members: Array<MemberName>
  }
}

/** An expression with its parentheses and type and non-null assertions removed. */
const unwrap = (expression: ts.Expression): ts.Expression =>
  ts.isParenthesizedExpression(expression) ||
  ts.isNonNullExpression(expression) ||
  ts.isAsExpression(expression) ||
  ts.isSatisfiesExpression(expression) ||
  ts.isTypeAssertionExpression(expression)
    ? unwrap(expression.expression)
    : expression

/** A string key as a member: `.route` for `["route"]`, `["content-type"]` for a key that is not an ASCII identifier. */
const keyText = (key: ts.Expression): string | undefined => {
  if (!ts.isStringLiteralLike(key)) return undefined
  return /^[A-Za-z_$][\w$]*$/.test(key.text) ? `.${key.text}` : `[${JSON.stringify(key.text)}]`
}

/** A receiver as text: a call ends in `()`, and anything that is not a callee reads as `(…)`. */
const receiverText = (expression: ts.Expression): string => {
  const receiver = unwrap(expression)
  if (ts.isCallExpression(receiver)) return `${receiverText(receiver.expression)}()`
  return calleeText(receiver) ?? "(…)"
}

/** The callee of a call as text, or undefined when it does not end in a name. */
const calleeText = (expression: ts.Expression): string | undefined => {
  const callee = unwrap(expression)
  if (ts.isIdentifier(callee)) return callee.text
  if (callee.kind === ts.SyntaxKind.ThisKeyword) return "this"
  if (callee.kind === ts.SyntaxKind.SuperKeyword) return "super"
  if (ts.isPropertyAccessExpression(callee)) return `${receiverText(callee.expression)}.${callee.name.text}`
  if (ts.isElementAccessExpression(callee)) {
    const key = keyText(callee.argumentExpression)
    return key === undefined ? undefined : `${receiverText(callee.expression)}${key}`
  }
  return undefined
}

/**
 * Reads one source's module references and calls.
 *
 * `file` names the source for its script kind: `.tsx` and `.jsx` parse with
 * JSX, `.ts`, `.mts` and `.cts` as TypeScript, anything else as JavaScript.
 * A syntax error does not throw; the parser recovers and the rest is read.
 *
 * A member is recorded only through a binding a top-level import declares,
 * and shadowing is not tracked: a local variable with the binding's name
 * reads as the binding.
 *
 * @category analysis
 * @since 0.1.0
 */
export const analyze = (file: string, text: string): Analysis => {
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, scriptKind(file))
  const lineOf = (node: ts.Node): number => source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1
  const entries: Array<Entry> = []
  const calls: Array<Call> = []
  const bindings = new Map<string, Entry["reference"]>()
  const declared = new Set<ts.Node>()

  const add = (
    node: ts.Node,
    specifier: string,
    form: ReferenceForm,
    typeOnly: boolean,
    names: Array<ReferencedName> = []
  ): Entry["reference"] => {
    const reference = { specifier, form, line: lineOf(node), typeOnly, names, members: [] }
    entries.push({ position: node.getStart(source), reference })
    return reference
  }

  const addImport = (node: ts.ImportDeclaration & { readonly moduleSpecifier: ts.StringLiteral }): void => {
    const clause = node.importClause
    const typeOnly = clause?.isTypeOnly ?? false
    const names: Array<ReferencedName> = []
    if (clause?.name !== undefined) names.push({ name: "default", typeOnly, line: lineOf(clause.name) })
    const named = clause?.namedBindings
    if (named !== undefined && ts.isNamedImports(named)) {
      for (const element of named.elements) {
        names.push({
          name: (element.propertyName ?? element.name).text,
          typeOnly: typeOnly || element.isTypeOnly,
          line: lineOf(element)
        })
      }
    }
    const reference = add(node, node.moduleSpecifier.text, "import", typeOnly, names)
    if (clause?.name !== undefined) bindings.set(clause.name.text, reference)
    if (named !== undefined && ts.isNamespaceImport(named)) bindings.set(named.name.text, reference)
  }

  const addImportEquals = (
    node: ts.ImportEqualsDeclaration & { readonly moduleReference: ts.ExternalModuleReference }
  ): void => {
    const reference = add(
      node,
      (node.moduleReference.expression as ts.StringLiteral).text,
      "import-equals",
      node.isTypeOnly
    )
    bindings.set(node.name.text, reference)
  }

  const isModuleImport = (node: ts.Node): node is ts.ImportDeclaration & { readonly moduleSpecifier: ts.StringLiteral } =>
    ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)

  const isRequireImport = (
    node: ts.Node
  ): node is ts.ImportEqualsDeclaration & { readonly moduleReference: ts.ExternalModuleReference } =>
    ts.isImportEqualsDeclaration(node) &&
    ts.isExternalModuleReference(node.moduleReference) &&
    ts.isStringLiteral(node.moduleReference.expression)

  // Top-level imports first, so a member read above its import still binds.
  for (const statement of source.statements) {
    if (isModuleImport(statement)) addImport(statement)
    else if (isRequireImport(statement)) addImportEquals(statement)
    else continue
    declared.add(statement)
  }

  const member = (node: ts.Node, binding: string, name: string): void => {
    bindings.get(binding)?.members.push({
      name,
      binding,
      typeOnly: ts.isQualifiedName(node),
      line: lineOf(node)
    })
  }

  const visit = (node: ts.Node): void => {
    if (declared.has(node)) {
      // Already read above; its children hold no other reference.
    } else if (isModuleImport(node)) {
      addImport(node)
    } else if (isRequireImport(node)) {
      addImportEquals(node)
    } else if (ts.isExportDeclaration(node) && node.moduleSpecifier !== undefined && ts.isStringLiteral(node.moduleSpecifier)) {
      const names: Array<ReferencedName> = []
      if (node.exportClause !== undefined && ts.isNamedExports(node.exportClause)) {
        for (const element of node.exportClause.elements) {
          names.push({
            name: (element.propertyName ?? element.name).text,
            typeOnly: node.isTypeOnly || element.isTypeOnly,
            line: lineOf(element)
          })
        }
      }
      add(node, node.moduleSpecifier.text, "export", node.isTypeOnly, names)
    } else if (ts.isImportTypeNode(node)) {
      if (ts.isLiteralTypeNode(node.argument) && ts.isStringLiteral(node.argument.literal)) {
        let qualifier = node.qualifier
        while (qualifier !== undefined && ts.isQualifiedName(qualifier)) qualifier = qualifier.left
        add(
          node,
          node.argument.literal.text,
          "import-type",
          true,
          qualifier === undefined ? [] : [{ name: qualifier.text, typeOnly: true, line: lineOf(node) }]
        )
      }
    } else if (ts.isCallExpression(node)) {
      const argument = node.arguments.length === 1 ? node.arguments[0]! : undefined
      const literal = argument !== undefined && ts.isStringLiteralLike(argument) ? argument.text : undefined
      if (node.expression.kind === ts.SyntaxKind.ImportKeyword) {
        if (literal !== undefined) add(node, literal, "dynamic-import", false)
      } else {
        if (literal !== undefined && ts.isIdentifier(node.expression) && node.expression.text === "require") {
          add(node, literal, "require", false)
        }
        const callee = calleeText(node.expression)
        if (callee !== undefined) calls.push({ callee, line: lineOf(node) })
      }
    } else if (ts.isPropertyAccessExpression(node) && ts.isIdentifier(node.expression)) {
      member(node, node.expression.text, node.name.text)
    } else if (ts.isQualifiedName(node) && ts.isIdentifier(node.left)) {
      member(node, node.left.text, node.right.text)
    }
    ts.forEachChild(node, visit)
  }
  visit(source)

  return {
    references: entries.sort((a, b) => a.position - b.position).map((entry) => entry.reference),
    calls
  }
}

/**
 * The distinct module specifiers of an {@link Analysis}, sorted.
 *
 * @category analysis
 * @since 0.1.0
 */
export const specifiers = (analysis: Analysis): ReadonlyArray<string> =>
  [...new Set(analysis.references.map((reference) => reference.specifier))].sort()
