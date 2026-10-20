# Host imports

`SdkRules` applies `forbidHostModules` to `src/**` for `library` and
`app-library` roles. The existing TypeScript AST analysis checks static imports,
re-exports, literal dynamic imports, require calls and import types.

The rule rejects every `node:` and `bun:` specifier, including nested paths,
`bun`, and bare names recognized by Node's builtin registry, such as
`fs/promises`, `stream/web`, `http` and `worker_threads`. Type-only references
are checked unless a custom rule explicitly sets `allowTypeOnly: true`.

Host and component roles do not receive this rule. Platform services imported
from package roots such as `@smthrs/platform-node` remain allowed. Similarly
named npm packages and relative files are not treated as builtins.

This uses the library catalog's private `@smthrs/repo-targets` import-rule
machinery. The declaration stays platform neutral; builtin classification
runs in the Node-hosted checker. This rule checks module references, not
ambient globals or dynamically computed specifiers; the existing hidden-host
and judgment checks cover those separately.
