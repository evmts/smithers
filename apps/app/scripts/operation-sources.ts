import { readdirSync, readFileSync, realpathSync } from "node:fs"
import { join } from "node:path"
import ts from "typescript"

export interface OperationSource {
  readonly file: string
  readonly source: string
}

/** Read each declaration owner once, including owners behind public re-exports. */
export const operationSources = (directory: string): ReadonlyArray<OperationSource> => {
  const sources: Array<OperationSource> = []
  const visited = new Set<string>()
  const visit = (file: string): void => {
    const canonical = realpathSync(file)
    if (visited.has(canonical)) return
    visited.add(canonical)
    const source = readFileSync(canonical, "utf8")
    sources.push({ file: canonical, source })
    const tree = ts.createSourceFile(canonical, source, ts.ScriptTarget.Latest, true)
    for (const statement of tree.statements) {
      if (
        !ts.isExportDeclaration(statement) || !statement.moduleSpecifier ||
        !ts.isStringLiteral(statement.moduleSpecifier)
      ) continue
      const specifier = statement.moduleSpecifier.text
      const resolved = ts.resolveModuleName(specifier, canonical, {
        moduleResolution: ts.ModuleResolutionKind.Bundler,
        customConditions: ["bun"]
      }, ts.sys).resolvedModule
      if (!resolved) throw new Error(`Cannot resolve operation re-export ${specifier} from ${canonical}`)
      visit(resolved.resolvedFileName)
    }
  }
  for (const file of readdirSync(directory).sort()) {
    if (/\.(?:ts|tsx)$/.test(file) && !/\.(?:test|d)\.tsx?$/.test(file)) visit(join(directory, file))
  }
  operationNames(sources)
  return sources
}

/** Names belong to operation declarations, not arbitrary fields in their host. */
export const operationNames = (sources: ReadonlyArray<OperationSource>): ReadonlyArray<string> => {
  const names = new Map<string, string>()
  for (const { file, source } of sources) {
    const tree = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true)
    const visit = (node: ts.Node): void => {
      if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === "operation") {
        const [argument] = node.arguments
        if (argument && ts.isObjectLiteralExpression(argument)) {
          for (const property of argument.properties) {
            if (
              !ts.isPropertyAssignment(property) || property.name.getText(tree) !== "name" ||
              !ts.isStringLiteral(property.initializer)
            ) continue
            const name = property.initializer.text
            if (names.has(name)) throw new Error(`Duplicate operation ${name} in ${names.get(name)} and ${file}`)
            names.set(name, file)
          }
        }
      }
      ts.forEachChild(node, visit)
    }
    visit(tree)
  }
  return [...names.keys()]
}
