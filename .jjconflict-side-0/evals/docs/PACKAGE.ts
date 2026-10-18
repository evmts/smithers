/**
 * Offline docs scorer checks; live subscription judging is deliberate operator work.
 * @since 0.1.0
 */
import { Smithers } from "@smthrs/targets"
import { Package as appPackage } from "../../apps/app/PACKAGE.ts"

const cwd = "evals/docs"
// App deps below declare //apps/app/src/docs/pages/*.md and //apps/app/src/docs/images/*.
const sources = [
  Smithers.glob("//evals/docs/*.ts"),
  Smithers.glob("//evals/docs/evals/*.ts"),
  Smithers.glob("//evals/docs/fixtures/*"),
  Smithers.glob("//evals/docs/*.json"),
  Smithers.file("//apps/app/src/docs/toc.ts"),
  Smithers.file("//tsconfig.base.json"),
  Smithers.file("//evals/docs/package.json"),
  Smithers.file("//pnpm-lock.yaml")
]

const test = Smithers.NodeTest({
  runtime: Smithers.Runtime.Bun({ version: ">=1.4.0" }),
  runner: Smithers.testSuite(["checks.test.ts"]),
  cache: true,
  srcs: sources,
  deps: [appPackage.docsInputs, appPackage.docsImages],
  cwd
})
const check = Smithers.Typecheck({
  srcs: sources,
  deps: [appPackage.docsInputs, appPackage.docsImages],
  tsconfig: Smithers.file("tsconfig.json"),
  buildMode: false,
  incremental: false,
  cwd
})
export const Package = Smithers.Package({ targets: { test, check } })
