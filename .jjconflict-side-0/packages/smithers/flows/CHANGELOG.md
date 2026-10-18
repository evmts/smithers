# @smthrs/flows

## [Unreleased]

### Added

- `Runtime` is exported from the root, so a host package composes the engine
  from `@smthrs/flows` alone.
- `Runtime.Options.sweep` passes `"process"` or `{ host: executionId }` to the
  engine store, for a host such as a Cloudflare Durable Object alarm that
  drives one execution per invocation.
- `Runtime.validate`, `Runtime.decodeField`, `Runtime.RegistryArgs` and
  `Runtime.registryLayer`, for a host package that composes the engine itself
  and refuses its own options with the same `RuntimeConfigurationError`.

### Changed

- Breaking: `Runtime.layer` and `Runtime.make` name no file. The host injects
  the owner identity (`OwnerIdentity`), the workspace root (`Workspace`) and
  the artifact store (`ArtifactStore`) wherever its step boundary and
  workspace sandbox need them, so a host without a filesystem composes the
  runtime from its SQL client, `OwnerIdentity.layerWithoutPid`, and
  `StepBoundary.layerUnsupported` with `WorkspaceSandbox.layerUnsupported`.
  `Runtime.Options` drops `filename` and `workspaceRoot`; `NativeRuntime.Options`
  in `@smthrs/platform-node` keeps them for the native hosts. `Runtime.storage`
  is now the layer of migrated SQL stores alone. `NodeRuntime` and `BunRuntime`
  keep their API and inject the process identity, the workspace and filesystem
  artifacts themselves.

- Breaking: the package imports no platform code, so it bundles for a browser
  and a Cloudflare Worker. The `@smthrs/flows/NodeRuntime`, `/BunRuntime`,
  `/SandboxedFlow` and `/test/TestNodeRuntime` subpaths are removed:
  `NodeRuntime`, `SandboxedFlow` and `TestNodeRuntime` are exported from the
  `@smthrs/platform-node` root, and `BunRuntime` from the `@smthrs/platform-bun`
  root, with the same API. `NodeRuntime.RuntimeConfigurationError` is
  `Runtime.RuntimeConfigurationError`. The package no longer depends on
  `@smthrs/platform-node`, `@effect/sql-sqlite-node` or `esbuild`;
  `@smthrs/platform-node` depends on it instead.

- `Runtime.Options.requestResume`, passed through to the engine store, records
  that the engine has asked a parked execution to resume — a durable clock
  fired, a durable deferred completed, or a child settled under a parent that
  parked on it. A control plane that refuses to re-enter a parked run nobody
  asked for reads it to tell an engine wake from its own heartbeat sweep.

## [1.0.0-rc.0] - 2026-08-31

### Added

- Added the complete engine aggregate exports and the supported Node SQLite
  `NodeRuntime`, including the batteries-included guarded host composition.
- Bound runtime storage and Jj operations to an explicit workspace and kept
  engine snapshot authority separate from action-facing Jj permissions.
- Added the optional `registry` seam to `NodeRuntime.make`, `NodeRuntime.layer`
  and `NodeRuntime.layerHost`, built between the engine and the registration
  phase so a registration reading a discovered catalog has both in hand. The
  registry-free arities are separate overloads, so naming a registry service in
  the type arguments without passing its layer no longer compiles.

### Removed

- Dropped the `Plugin` namespace. Extension in flows is Effect dependency
  injection: you extend the engine by providing a `Layer` and replace a
  behavior by providing a different implementation of the service, or a
  different constructor option, at the seam that owns it. There is no plugin
  namespace and no hook catalog to import.
- Dropped the `Host` and `PlatformBrowser` namespaces. `@smthrs/host` was
  dissolved, and the `@smthrs/platform-*` bundles are deliberately not
  re-exported here — for the same reason `effect`'s index does not re-export
  `@effect/platform-node`, a platform bundle is chosen by the program that runs,
  not by the library it depends on. Import `@smthrs/platform-node`,
  `@smthrs/platform-bun`, or `@smthrs/platform-browser` directly.

## [0.1.0] - 2026-08-05

### Added

- Added the barrel package that re-exports every `@smthrs/*` engine package
  as a namespace — `Database`, `Engine`, `EngineStore`, `Host`, `Journal`,
  `Kernel`, `Keys`, `Plugin`, `Sync`, and `TimeTravel` — so one dependency
  gives you the whole engine surface without collapsing each package's
  `make` / `makeNoop` / `layerNoop` trio into a shared namespace.
- Added `namespaces`, the runtime list of the re-exported namespace names,
  which also gives the barrel's coverage gate a real denominator.
