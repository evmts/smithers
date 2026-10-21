# VibeLang

Write Effect programs with TypeScript syntax, typed errors, and services checked by the compiler.

[Get started](https://vibelang.sh) · [Language guide](https://vibelang.sh/vibelang-features/115-cheat-sheet) · [Contribute](CONTRIBUTING.md)

## Why VibeLang?

Effect gives you typed failures, dependency injection, concurrency, and resource management. VibeLang gives those programs direct syntax. A function call produces a value. Its errors and required services stay in its type.

The compiler checks `.vibe` and `.ts` files together and emits JavaScript and TypeScript declarations. You can read the generated code and use the declarations from TypeScript.

## Start here

Install a starter and its dependencies:

```sh
bun create vibelang@latest my-app
```

Use Node 26 or later and Bun 1.4 or later, the toolchain documented by the source checkout. Then:

```sh
cd my-app
bun run start
bun run test
```

The starter prints:

```text
Hello, VibeLang!
Recovered from EmptyName
```

Replace `src/main.vibe` with this ten-line program:

```vibe
error EmptyName {}
function greet(name: string): string!EmptyName {
  if (name === "") throw new EmptyName()
  return `Hello, ${name}!`
}
export function main() {
  Console.log(greet("VibeLang"))
  const recovered = greet("") catch "Hello, stranger!"
  Console.log(recovered)
}
```

Run `bun run start` again:

```text
Hello, VibeLang!
Hello, stranger!
```

## Values here. Effects underneath.

A contract reads `Result!Error!Services`. A call runs the program where you write it. Expected failures are part of the contract:

```vibe
error NotFound { id: string }
service Users {
  find(id: string): string!NotFound
}
const UsersLive = Layer.succeed(Users, {
  find(id: string) {
    if (id !== "42") throw new NotFound({ id })
    return "Ada"
  }
})
export function main() {
  provide UsersLive {
    const [name, fallback] = await.all [
      Users.find("42"),
      Users.find("7") catch "Guest"
    ]
    Console.log(name, fallback)
  }
}
```

`service` declares a dependency. `provide` supplies it. `await.all` runs calls concurrently. `catch` handles the declared failure. Effect's `Console` and `Layer` are in scope without imports.

Calls already wait for their results. A plain JavaScript `await` is not VibeLang's way to sequence calls. See the [Effect comparison](https://vibelang.sh/vibelang-features/114-vibelang-for-effect-users) for the corresponding Effect code and interop boundaries.

## Editors

The npm compiler package includes a VS Code and Cursor extension at `node_modules/vibelang/editor/vibelang.vsix`. Install that VSIX through your editor's extension menu. It is not yet on the marketplaces.

The compiler also serves LSP diagnostics, hovers, completions, navigation, and renames. [Editor setup](editors/README.md) covers Neovim and other clients. The Zed configuration is documented but untested.

## Learn more

- [Guides and reference](https://vibelang.sh)
- [Syntax cheat sheet](https://vibelang.sh/vibelang-features/115-cheat-sheet)
- [Specification](docs/design/src/000-intro.md)
- [Examples](examples/): HTTP APIs, React, Vue, Svelte, services, and concurrency

## Status

VibeLang is v0. Expect major breaking changes. It is not suitable for production use. Pin versions when experimenting and include the compiler version in bug reports.

## Help build it

Bring a small reproducer to [Issues](https://github.com/smithersai/vibelang/issues). Questions and documentation corrections are welcome there too. Start with [CONTRIBUTING.md](CONTRIBUTING.md); release and review responsibilities live in [MAINTAINERS.md](MAINTAINERS.md).

## License

[MIT](LICENSE), except the TypeScript fork and compiler packages, which use [Apache 2.0](typescript/LICENSE.txt). Preserve the fork's [notices](typescript/NOTICE.txt).
