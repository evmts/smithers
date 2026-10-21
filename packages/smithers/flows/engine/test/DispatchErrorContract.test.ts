import { fileURLToPath } from "node:url"
import * as ts from "typescript"
import { expect, it } from "vitest"

it("dispatch preserves the driver's declared cycle failure in its Effect type", () => {
  const configPath = fileURLToPath(new URL("../tsconfig.json", import.meta.url))
  const config = ts.readConfigFile(configPath, ts.sys.readFile)
  const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, fileURLToPath(new URL("..", import.meta.url)))
  const path = fileURLToPath(new URL("../src/FlowEngine/Trampoline.ts", import.meta.url))
  const program = ts.createProgram([path], parsed.options)
  const checker = program.getTypeChecker()
  const source = program.getSourceFile(path)!
  let dispatch: ts.VariableDeclaration | undefined
  const visit = (node: ts.Node): void => {
    if (ts.isVariableDeclaration(node) && node.name.getText(source) === "dispatch") dispatch = node
    ts.forEachChild(node, visit)
  }
  visit(source)
  expect(dispatch).toBeDefined()
  const signature = checker.getSignaturesOfType(checker.getTypeAtLocation(dispatch!), ts.SignatureKind.Call)[0]!
  const result = checker.getReturnTypeOfSignature(signature) as ts.TypeReference
  const error = checker.getTypeArguments(result)[1]!
  expect(checker.typeToString(error)).toBe("FlowCycleDetected")
})
