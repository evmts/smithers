#!/usr/bin/env node
// Node-only audit. Uses the workspace's existing TypeScript parser; no browser or new dependencies.
import { readFileSync, readdirSync, existsSync } from "node:fs"
import { createRequire } from "node:module"
import { dirname, resolve, relative } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"

const require = createRequire(import.meta.url)
const ts = require("typescript")
const here = dirname(fileURLToPath(import.meta.url))
const unknown = "\u0000"
const walk = (node, visit) => { visit(node); ts.forEachChild(node, child => walk(child, visit)) }
const filesUnder = directory => existsSync(directory) ? readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name)).flatMap(entry => {
  const path = resolve(directory, entry.name)
  return entry.isDirectory() ? filesUnder(path) : /\.tsx?$/.test(path) ? [path] : []
}) : []
const cross = (left, right) => [...new Set(left.flatMap(a => right.map(b => a + b)))].slice(0, 512)
const normalize = name => `/${name.replace(/^\//, "")}`

export const checkDoors = (sites = resolve(here, "../..")) => {
  const paths = ["repo", "effect"].flatMap(site => filesUnder(resolve(sites, site)))
  const program = ts.createProgram(paths, { noResolve: true, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX })
  const checker = program.getTypeChecker()
  const sources = paths.map(path => program.getSourceFile(path))
  const registrations = new Set()
  const titles = []
  const dependencies = new Map()
  const framed = new Set()
  const unresolved = []
  // Resolve literal names, conditional names, and array.map/for-of grouped registrations.
  const values = (node, seen = new Set()) => {
    if (!node || seen.has(node)) return [unknown]
    seen = new Set([...seen, node])
    if (ts.isStringLiteralLike(node) || ts.isNumericLiteral(node)) return [node.text]
    if (ts.isParenthesizedExpression(node) || ts.isAsExpression(node) || ts.isNonNullExpression(node) || ts.isSatisfiesExpression(node)) return values(node.expression, seen)
    if (ts.isArrayLiteralExpression(node)) return node.elements.flatMap(element => values(element, seen))
    if (ts.isConditionalExpression(node)) return [...new Set([...values(node.whenTrue, seen), ...values(node.whenFalse, seen)])]
    if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken) return cross(values(node.left, seen), values(node.right, seen))
    if (ts.isTemplateExpression(node)) return node.templateSpans.reduce((all, span) => cross(all, values(span.expression, seen)).map(value => value + span.literal.text), [node.head.text])
    if (ts.isIdentifier(node)) {
      const symbol = checker.getSymbolAtLocation(node)
      for (const declaration of symbol?.declarations ?? []) {
        if (ts.isVariableDeclaration(declaration) && declaration.initializer) return values(declaration.initializer, seen)
        if (ts.isVariableDeclaration(declaration) && ts.isVariableDeclarationList(declaration.parent) && ts.isForOfStatement(declaration.parent.parent)) return values(declaration.parent.parent.expression, seen)
        if (ts.isParameter(declaration)) {
          const fn = declaration.parent
          const call = fn.parent
          if (ts.isCallExpression(call) && ts.isPropertyAccessExpression(call.expression) && ["map", "flatMap", "forEach"].includes(call.expression.name.text)) return values(call.expression.expression, seen)
        }
      }
    }
    const type = checker.getTypeAtLocation(node)
    const literals = (type.isUnion() ? type.types : [type]).filter(item => item.isStringLiteral()).map(item => item.value)
    return literals.length ? literals : [unknown]
  }
  const location = node => `${relative(sites, node.getSourceFile().fileName)}:${node.getSourceFile().getLineAndCharacterOfPosition(node.getStart()).line + 1}`
  const addRegistration = expression => {
    for (const name of values(expression)) if (/^\/?[\w.-]+$/.test(name)) registrations.add(normalize(name))
  }
  for (const source of sources) {
    const imports = []
    walk(source, node => {
      if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
        const specifier = node.moduleSpecifier.text
        if (specifier.startsWith(".")) {
          const base = resolve(dirname(source.fileName), specifier)
          const imported = [base + ".tsx", base + ".ts", resolve(base, "index.tsx"), resolve(base, "index.ts")].find(path => paths.includes(path))
          if (imported) imports.push(imported)
          if (specifier.endsWith("/checklist/ViewFrame")) framed.add(source.fileName)
        }
      }
      if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
        if (node.expression.text === "registerSlash") addRegistration(node.arguments[0])
        // This helper forwards each object key directly to registerSlash.
        if (node.expression.text === "useSettingsCommands" && node.arguments[0] && ts.isObjectLiteralExpression(node.arguments[0])) {
          for (const property of node.arguments[0].properties) {
            if (!property.name) continue
            if (ts.isComputedPropertyName(property.name)) addRegistration(property.name.expression)
            else if (ts.isIdentifier(property.name)) registrations.add(normalize(property.name.text))
            else addRegistration(property.name)
          }
        }
      }
      if (!source.fileName.endsWith(".tsx") || !ts.isJsxAttribute(node) || node.name.getText() !== "title" || !node.initializer) return
      const expression = ts.isJsxExpression(node.initializer) ? node.initializer.expression : node.initializer
      if (!expression) return
      for (const title of values(expression)) {
        if (!title.startsWith("/")) continue
        const name = title.split(/\s| · /)[0]
        // A dynamic prop/identifier is supplied by its caller, rather than a literal / title here.
        if (name.includes(unknown) && !ts.isIdentifier(expression)) unresolved.push({ source: source.fileName, reason: `${location(node)}: computed command name needs a literal union` })
        else if (/^\/[\w.-]+$/.test(name)) titles.push({ name, source: source.fileName, location: location(node) })
      }
    })
    dependencies.set(source.fileName, imports)
  }
  // ViewFrame's MutationObserver registers actual titled controls in its content subtree.
  // Follow its view imports, keeping shared frame/UI controls outside that registration scope.
  const viewScope = new Set()
  const visitView = path => {
    if (viewScope.has(path) || !path.startsWith(resolve(sites, "repo/views") + "/")) return
    viewScope.add(path)
    for (const dependency of dependencies.get(path) ?? []) visitView(dependency)
  }
  const viewFrame = resolve(sites, "repo/views/checklist/ViewFrame.tsx")
  const hasViewRegistry = existsSync(viewFrame) && /registerSlash\(name,/.test(readFileSync(viewFrame, "utf8")) && /MutationObserver/.test(readFileSync(viewFrame, "utf8"))
  if (hasViewRegistry) {
    for (const path of framed) visitView(path)
    for (const title of titles) if (viewScope.has(title.source)) registrations.add(title.name)
  }
  const missing = titles.filter(title => !registrations.has(title.name))
  return { files: paths.filter(path => path.endsWith(".tsx")).length, titles, registrations, missing, unresolved: [...new Set(unresolved.filter(item => !viewScope.has(item.source)).map(item => item.reason))] }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const sites = process.argv.find(arg => arg.startsWith("--sites="))?.slice(8)
  const result = checkDoors(sites && resolve(sites))
  for (const title of result.missing) console.error(`Unregistered ${title.name} at ${title.location}`)
  for (const reason of result.unresolved) console.error(reason)
  if (!result.files) { console.error("No repo/effect TSX files found."); process.exitCode = 1 }
  else if (result.missing.length || result.unresolved.length) {
    console.error(`FAIL: ${result.missing.length} unregistered slash titles; ${result.unresolved.length} unresolved command names.`)
    process.exitCode = 1
  } else console.log(`PASS: ${result.titles.length} slash titles in ${result.files} TSX files; ${result.registrations.size} registered commands; 0 missing.`)
}
