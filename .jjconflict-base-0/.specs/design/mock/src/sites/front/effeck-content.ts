/*
 * VibeLang content: the converter's precomputed hero pair (Launch/2026-10-19/effeck/above-the-fold.md, verified
 * against vibelang 0.0.1 and effect 4.0.5) and the six docs pages, trimmed from the effectscript repository's docs/user/src.
 */

/* ---- The converter ---- */

export const HERO_EFFECT = `import { Context, Effect, Schedule, Schema } from "effect"

class ApiError extends Schema.TaggedError<ApiError>()("ApiError", {
  status: Schema.Number
}) {}

class Users extends Context.Service<Users, {
  name(id: string): Effect.Effect<string, ApiError>
}>()("app/Users") {}

const nameOf = Effect.fn("nameOf")(function* (id: string) {
  const users = yield* Users
  return yield* users.name(id).pipe(
    Effect.retry(Schedule.exponential("100 millis")),
    Effect.timeout("2 seconds"),
    Effect.orElseSucceed(() => "unknown")
  )
})

export const names = Effect.fn("names")(function* (ids: ReadonlyArray<string>) {
  const all = yield* Effect.forEach(ids, nameOf, { concurrency: 8 })
  yield* Effect.log(\`Loaded \${all.length} names\`)
  return all
})`

export const HERO_EFFECK = `error ApiError { status: number }

service Users {
  name(id: string): string!ApiError
}

function nameOf(id: string) {
  return Users.name(id)
    |> retry(%, Schedule.exponential("100 millis"))
    |> timeout(%, "2 seconds")
    catch "unknown"
}

export function names(ids: ReadonlyArray<string>) {
  const all = forEach(ids, nameOf, { concurrency: 8 })
  log(\`Loaded \${all.length} names\`)
  return all
}`

/* The converter's output for the edited hero (timeout "2 seconds" → "5 seconds"). */
export const CONVERTED_EFFECK = HERO_EFFECK.replace(`"2 seconds"`, `"5 seconds"`)
export const EDITED_EFFECT = HERO_EFFECT.replace(`"2 seconds"`, `"5 seconds"`)

/* The left pane when the visitor's edit broke the syntax (unbalanced braces): the hero minus its last `})`. */
export const BROKEN_EFFECT = HERO_EFFECT.slice(0, HERO_EFFECT.lastIndexOf("})"))

/* What the converter returns for it: output up to the break, then diagnostics. */
export const FAILED_EFFECK = `error ApiError { status: number }

service Users {
  name(id: string): string!ApiError
}

function nameOf(id: string) {
  return Users.name(id)
    |> retry(%, Schedule.exponential("100 millis"))
    |> timeout(%, "2 seconds")
    catch "unknown"`

export const DIAGNOSTICS = [
  { file: "main.vibe", line: 7, col: 1, code: "EK1004", message: `Block opened here is never closed.` },
  { file: "main.vibe", line: 12, col: 1, code: "EK1001", message: `Unexpected end of input; expected "}".` }
]

/* The left pane for the not-Effect refusal: a small React component. */
export const REACT_SNIPPET = `import { useState } from "react"

export function Button({ label }: { label: string }) {
  const [count, setCount] = useState(0)
  return (
    <button onClick={() => setCount(count + 1)}>
      {label} {count}
    </button>
  )
}`

export const INSTALL_LINE = "npm create vibelang@latest my-app"


export const SMITHERS_HANDOFF = "smithers.sh/?utm_source=effeck.dev&utm_medium=convert&utm_campaign=effeck-launch"

/* ---- Docs pages (PM E#3). Trimmed from the effectscript repository's docs/user/src; hrefs are the source's relative links. ---- */

export interface EffeckDocPage {
  /** URL path after effeck.dev/, e.g. "getting-started/002-why-effect.html". */
  slug: string
  title: string
  section: string | null
  /** Source file under docs/user/src/, for "Edit this page" on smithers.sh. */
  file: string
  body: string
}

export const EFFECK_DOCS: Array<EffeckDocPage> = [
  {
    slug: "001-onboarding.html",
    title: "VibeLang",
    section: null,
    file: "001-onboarding.md",
    body: `
VibeLang gives Effect.ts a simple, readable syntax that compiles to TypeScript, with first-class access to the TypeScript ecosystem.

\`\`\`ts effect
class UserNotFound extends Schema.TaggedError<UserNotFound>()("UserNotFound", {
  id: Schema.String
}) {}

class Users extends Context.Service<Users, {
  find(id: string): Effect.Effect<User, UserNotFound>
}>()("app/Users") {}

const greet = Effect.fn("greet")(function* (id: string) {
  const users = yield* Users
  const user = yield* users.find(id).pipe(
    Effect.catchTag("UserNotFound", () => Effect.succeed({ name: "guest" }))
  )
  return \`Hello, \${user.name}\`
})
\`\`\`

\`\`\`vibe
interface User { id: string; name: string }

error UserNotFound { id: string }

service Users {
  find(id: string): User!UserNotFound
}

function greet(id: string) {
  const name = Users.find(id).name catch "guest"
  return \`Hello, \${name}\`
}
// string!!Users
\`\`\`

A user service, a typed error, and a fallback, in Effect and in VibeLang. The comment under \`greet\` is the type your editor shows: \`string!!Users\` is VibeLang's spelling of \`Effect<string, never, Users>\`. It returns a \`string\`, cannot fail, and needs the \`Users\` service. The compiler infers all three from the body, and TypeScript code that imports \`greet\` sees the Effect type.

## Why a language

**Effect makes TypeScript reliable.** A TypeScript signature says what a function returns, but not what can fail or what it depends on. Effect puts all three in one type, \`Effect<Success, Error, Requirements>\`, and the compiler checks it. Retries, timeouts, concurrency, resource cleanup, and tracing come with it.

**Effect pays for it in syntax.** Effect is a library, so it builds every feature out of what TypeScript already has: generators and \`yield*\` to run steps in order, \`pipe\` to compose them, and classes to declare errors and services. The code reads like a separate language written in library calls.

**VibeLang makes it a real language.** Each Effect idea gets its own syntax. Calls run in order, \`throw\` fails with a typed error, \`catch\` handles it, \`service\` declares a dependency, and \`fork\` starts a fiber. The compiler builds the same Effect program you would have written by hand.

## TypeScript stays one step away

A new language usually leaves its host's ecosystem behind. VibeLang keeps it in two ways:

1. **It compiles to TypeScript.** VibeLang's compiler is TypeScript's compiler, extended. It checks \`.vibe\` and \`.ts\` files together and emits JavaScript and \`.d.ts\` files, so npm packages, your \`.ts\` files, and every Effect library work unchanged, and TypeScript code calls VibeLang functions as ordinary Effect functions.
2. **You can opt out to plain TypeScript.** \`sync\`, \`try\`, and \`callback\` take a plain TypeScript function, and a \`.ts\` file can sit beside any \`.vibe\` file.

\`\`\`vibe
function slug(title: string) {
  return sync((title) => {
    // Plain TypeScript: nothing in here is an Effect.
    let s = title.trim().toLowerCase()
    s = s.replaceAll(/[^a-z0-9]+/g, "-")
    return s
  }, title)
}
// string!!
\`\`\`

A hatch's function is self-contained: it reads the \`.vibe\` file's values only as the arguments passed after it, here \`title\`.

## Try it

\`\`\`sh
npm create vibelang@latest my-app
cd my-app
npm start
\`\`\`

Then open the folder in VS Code or Cursor and install the editor extension that comes with the compiler: \`code --install-extension node_modules/vibelang/editor/vibelang.vsix\`. [Installation](getting-started/004-installation.md) covers existing projects.

## Where to go next

- **Coming from Effect:** [VibeLang for Effect users](effeck-features/114-effeck-for-effect-users.md) explains the rules, and the [cheat sheet](effeck-features/115-cheat-sheet.md) shows every change.
- **New to Effect:** start with [Why VibeLang?](getting-started/002-why-effect.md), then [Two types of errors](error-management/006-two-error-types.md).
- **The toolchain:** [Build with the vibelang CLI](setup/effeck-cli.md) covers \`vibelang\`, the compiler that replaces \`tsc\`.
`
  },
  {
    slug: "getting-started/002-why-effect.html",
    title: "Why VibeLang?",
    section: "Getting started",
    file: "getting-started/002-why-effect.md",
    body: `
VibeLang uses Effect to make a program's expected failures and dependencies visible to the compiler. Choose it when application logic needs coordinated retries, cancellation, resource cleanup, and service substitution.

## Describe work before running it

\`\`\`vibe
error InvalidQuantity {
  quantity: number
}

function unitPrice(total: number, quantity: number) {
  if (quantity <= 0) throw new InvalidQuantity({ quantity })
  return total / quantity
}
// number!InvalidQuantity!

const quote = () => unitPrice(72, 6)
\`\`\`

\`quote\` holds a reusable program. Calling \`quote()\` inside another function runs it and returns the number. The error channel records the validation failure, so callers can handle it without inspecting this implementation.

## Share an application foundation

\`\`\`vibe
service Prices {
  total(sku: string): number!InvalidQuantity
}

function receipt(sku: string) {
  const amount = Prices.total(sku)
  return \`Total: \${amount}\`
}
// string!InvalidQuantity!Prices

const PricesTest = Layer.succeed(Prices, {
  total(_sku) { return 18 }
})

function preview() {
  provide PricesTest { return receipt("pencil-box") }
}
\`\`\`

Services carry dependencies through the same contract as errors and successes. Layers supply implementations and manage their resources. Tests can provide an in-memory implementation while the application provides a database or HTTP implementation.

## Apply composable production tools

\`\`\`vibe
function resilientReceipt(sku: string) {
  return receipt(sku)
    |> retry(%, { times: 2 })
    |> timeout(%, "800 millis")
    |> withSpan(%, "receipt")
}
\`\`\`

These operators share Effect's execution and cleanup rules. Retry repeats the program from the beginning; timeout interrupts work that exceeds its deadline; the span describes the whole operation. Choose retry only for failures worth repeating, and make repeated writes safe before retrying them.

## Learn with practical programs

Start with one operation that reads data, validates it, and returns a result. Test its success and failure cases, then add a service boundary and a deadline. Continue with [Installation](004-installation.md) and [Building pipelines](011-building-pipelines.md).

[Upstream Effect page](https://effect.website/docs/v4/getting-started/why-effect)
`
  },
  {
    slug: "getting-started/004-installation.html",
    title: "Installation",
    section: "Getting started",
    file: "getting-started/004-installation.md",
    body: `
\`\`\`sh
npm create vibelang@latest my-app
cd my-app
npm start
\`\`\`

VibeLang compiles \`.vibe\` sources to JavaScript with the native \`vibelang\` compiler. Version 0.0.1 installs from npm.

> **For agents.** To set up VibeLang with a coding agent, give it this prompt: "Set up VibeLang in this project: read https://effeck.dev/setup.md and follow it." The agent detects the project's package manager, build, and editor, and follows the matching steps.

## Prerequisites

Install Node 26 or later and Bun 1.4 or later. The compiler is a native binary. \`vibelang\` lists one package per platform as an optional dependency, and your package manager installs only the one that matches your machine:

| Platform | Package | Tested for 0.0.1 |
| --- | --- | --- |
| macOS on Apple silicon | \`vibelang-darwin-arm64\` | Yes |
| macOS on Intel | \`vibelang-darwin-x64\` | No |
| Linux on x64 | \`vibelang-linux-x64\` | Yes |
| Linux on arm64 | \`vibelang-linux-arm64\` | No |
| Windows on x64 | \`vibelang-win32-x64\` | No |

Keep optional dependencies enabled. If an install skips them, for example with \`npm install --omit=optional\`, \`vibelang\` cannot find its binary and exits with an error.

## Create a project

\`\`\`sh
npm create vibelang@latest my-app
cd my-app
npm start
npm test
\`\`\`

Either command copies the starter into \`my-app\`, pins the VibeLang packages to the version that created it, and installs dependencies. \`npm start\` builds the project and prints:

\`\`\`out
Hello, VibeLang!
Recovered from EmptyName
\`\`\`

## Add VibeLang to an existing project

\`\`\`sh
npm install --save-exact vibelang-runtime@0.0.1 effect@4.0.5 @effect/platform-node@4.0.5
npm install --save-dev --save-exact vibelang@0.0.1 vibelang-vite@0.0.1 vitest@5.0.5 @effect/vitest@4.0.5
\`\`\`

| Package | Install as | Purpose |
| --- | --- | --- |
| \`vibelang-runtime\` | Dependency | The continuation kernel and helpers that compiled code imports |
| \`effect\`, \`@effect/platform-node\` | Dependency | Effect 4.0.5 and its Node platform |
| \`vibelang\` | Dev dependency | The compiler and language server, its native binary, and the VS Code extension |
| \`vibelang-vite\` | Dev dependency | Compiles \`.vibe\` modules for Vite and Vitest |

\`vibelang-runtime\` requires \`effect\` 4.0.5 exactly and checks Effect's version when it loads. Keep \`vibelang\`, \`vibelang-runtime\`, and \`vibelang-vite\` at the same version: they are released together.

## Configure your editor

From the project directory, after installing dependencies:

\`\`\`sh
code --install-extension node_modules/vibelang/editor/vibelang.vsix
# Or, for Cursor:
cursor --install-extension node_modules/vibelang/editor/vibelang.vsix
\`\`\`

Open the project directory. The extension starts the project's compiler as the language server, \`vibelang --lsp --stdio\`, for diagnostics, hovers, and completions. Other editors run \`vibelang --lsp --stdio\` through their LSP client for \`.vibe\` and \`.ts\` files.

## Compiler commands

From a project, run \`npm run build\`, or call the compiler directly:

\`\`\`sh
npx vibelang           # check and emit
npx vibelang --noEmit  # check only
npx vibelang --watch   # rebuild on every save
\`\`\`

\`vibelang\` accepts TypeScript compiler flags such as \`--noEmit\`, \`--watch\`, and \`-b\`. [Build with the vibelang CLI](../../setup/effeck-cli.md) walks a project from \`tsconfig.json\` to a first compiled module.
`
  },
  {
    slug: "error-management/006-two-error-types.html",
    title: "Two types of errors",
    section: "Error management",
    file: "error-management/006-two-error-types.md",
    body: `
A missing record and a broken invariant need different responses. VibeLang tracks recoverable domain failures in \`Effect<A, E, R>\` and keeps defects in the runtime's failure cause.

[Upstream Effect page](https://effect.website/docs/v4/error-management/two-error-types)

## Separating failures from defects

\`\`\`vibe
error UnknownProduct {
  sku: string
}

function price(sku: string) {
  if (sku !== "notebook") throw new UnknownProduct({ sku })
  return 12
}
// number!UnknownProduct!

function displayPrice(sku: string) {
  try {
    return \`$\${price(sku)}\`
  } catch (error) {
    return \`No price for \${error.sku}\`
  }
}
\`\`\`

\`throw\` declares an expected failure. A caller can recover with \`try\`/\`catch\`, and the caught value has the error type inferred from the protected code. A defect, such as an invalid property access or \`Effect.die(new Error("broken invariant"))\`, bypasses this catch.

Expected failures also come from a callee's \`E\` and exceptions listed by a trusted contract. An exception that no contract lists is a defect. When a cause contains several expected failures and nothing else, \`catch\` receives the first and handles the cause as a whole; use \`Effect.catchCause\` to inspect every reason.

Interruption is a third kind of termination. It also bypasses \`catch\`; both interruption and defects still run \`finally\` and release \`using\` resources. If a cause contains a failure together with a defect or interruption, ordinary \`catch\` propagates the entire cause.

## Choosing the error type

\`\`\`vibe
function percentage(part: number, total: number) {
  if (total <= 0) {
    die(new Error("validated total must be positive"))
  }
  return part / total * 100
}
// number!!
\`\`\`

Use this contract only when validation has already established the invariant. If users can submit an invalid total, represent that case with a typed error instead. Put a failure in \`E\` when callers have a useful response, such as asking for corrected input or choosing another source.

\`E = never\` promises no expected failures escape. It does not promise the absence of bugs or cancellation. Use \`Effect.exit\`, \`Effect.catchDefect\`, or \`Effect.catchCause\` at a boundary that must examine those outcomes.
`
  },
  {
    slug: "getting-started/011-building-pipelines.html",
    title: "Building pipelines",
    section: "Getting started",
    file: "getting-started/011-building-pipelines.md",
    body: `
Use statements for dependent steps and the pipe operator, \`|>\`, for a series of operators. In \`x |> f(%)\`, the topic \`%\` stands for \`x\`: the body after \`|>\` says where the value goes, so a stage can take it in any argument position.

## Compose reusable functions

\`\`\`vibe
function addMargin(n: number) { return n + 3 }
function double(n: number) { return n * 2 }

function priceLabel() {
  return 9 |> addMargin(%) |> double(%) |> \`Price: \${%}\`
}
// string!!; "Price: 24"
\`\`\`

Each body uses the previous stage's result through \`%\`. Standalone functions remain reusable without adding methods to a value's prototype, and bundlers can remove the Effect functions a program never calls.

For program operators, start with the work to run:

\`\`\`vibe
function preparedPrice() {
  return priceLabel() |> timeout(%, "1 second") |> withSpan(%, "price-label")
}
\`\`\`

Here each \`%\` stands where \`timeout\` and \`withSpan\` expect a program, so the expression before \`|>\` is passed by name: \`priceLabel()\` runs when \`timeout\` runs it, and the span covers the timed work. Wrap the whole pipeline in a function to keep it as reusable work: \`const prepared = () => priceLabel() |> timeout(%, "1 second")\`.

## Sequence dependent computations

\`\`\`vibe
error InvalidRate

function discounted(price: number, percent: number) {
  if (percent < 0 || percent > 100) throw new InvalidRate()
  return price * (1 - percent / 100)
}

function total() {
  const price = adjustedPrice()
  const reduced = discounted(price, 12)
  return reduced + 2
}
// number!InvalidRate!
\`\`\`

A call followed by another call expresses the dependency that \`flatMap\` or \`andThen\` handles in TypeScript Effect. Each call runs once, in order. A failure prevents later statements from executing unless you handle it.

## Observe intermediate results

\`\`\`vibe
function quotedTotal() {
  const amount = total()
  log(\`quoted amount=\${amount}\`)
  return amount
}
\`\`\`

The local variable remains available after logging, giving the behavior of \`Effect.tap\`. An observation that fails also fails the enclosing function. Use \`try\`/\`catch\` around the observation only when ignoring that failure is intentional.

## Collect multiple computations

\`\`\`vibe
function summary() {
  const details = all({
    price: total(),
    label: priceLabel()
  }, { concurrency: 2 })
  return \`\${details.label}, total=\${details.price}\`
}
\`\`\`

\`Effect.all\` preserves the input's tuple or object shape. It runs sequentially by default; this example explicitly starts up to two computations at once. If a branch fails, the combined computation fails and concurrent siblings are interrupted and cleaned up.
`
  },
  {
    slug: "setup/effeck-cli.html",
    title: "Build with the vibelang CLI",
    section: "Setup",
    file: "setup/effeck-cli.md",
    body: `
\`vibelang\` replaces \`tsc\`. It checks \`.vibe\` and \`.ts\` files as one program, emits JavaScript, and accepts TypeScript's compiler flags. Install the packages with [Installation](../getting-started/004-installation.md) first.

## 1. Configure tsconfig.json

If the project has no \`tsconfig.json\`, create this one. It selects \`.vibe\` files under \`src/\` and emits Node ESM to \`dist/\`:

\`\`\`json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "sourceMap": true,
    "rootDir": "src",
    "outDir": "dist",
    "noEmitOnError": true,
    "rewriteRelativeImportExtensions": true,
    "skipLibCheck": true,
    "types": []
  },
  "include": ["src/**/*.vibe"]
}
\`\`\`

If the project has a \`tsconfig.json\`, keep it, and check that \`include\` selects \`.vibe\` files. A directory entry such as \`"src"\` selects them. A glob such as \`"src/**/*.ts"\` does not; add \`"src/**/*.vibe"\` beside it.

## 2. Replace tsc in the scripts

In \`package.json\`, replace \`tsc\` with \`vibelang\` in every script. If the project has no build script, add these:

\`\`\`json
{
  "scripts": {
    "build": "vibelang",
    "start": "vibelang && node --enable-source-maps dist/main.js",
    "test": "vitest run"
  }
}
\`\`\`

\`vibelang\` with no arguments checks and emits the project, \`vibelang --noEmit\` only checks it, \`vibelang --watch\` rebuilds on every save, and \`vibelang -b\` builds project references.

## 3. Compile a first module

Create \`src/hello.vibe\`, in a directory that \`include\` selects:

\`\`\`vibe
// src/hello.vibe
export function hello(name: string) {
  return \`Hello, \${name}!\`
}
\`\`\`

Run \`npx vibelang\`. It prints nothing, exits with status 0, and writes \`hello.js\` to the \`outDir\`, \`dist/\` in the configuration above.

In \`.vibe\` files, import local modules by their source name: \`import { hello } from "./hello.vibe"\`. In \`.ts\` files, import \`./hello.js\`, which resolves to \`hello.vibe\`.

## 4. Test with Vitest

Create \`vitest.config.ts\`, which compiles \`.vibe\` tests through \`vibelang-vite\`:

\`\`\`ts
// vitest.config.ts
import { defineConfig } from "vitest/config"
import vibelang from "vibelang-vite"

export default defineConfig({
  plugins: [vibelang()],
  test: { include: ["src/**/*.test.vibe"] }
})
\`\`\`

Run \`npx vitest run\`. The output includes:

\`\`\`out
 Test Files  1 passed (1)
      Tests  1 passed (1)
\`\`\`

## Next

Set up the editor with [Installation](../getting-started/004-installation.md), then write your first service with [Two types of errors](../error-management/006-two-error-types.md).
`
  }
]
