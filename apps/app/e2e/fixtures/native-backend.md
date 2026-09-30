# Canonical native fixture prerequisites

The configured-model integration starts the full `apps/backend` server with
supervised PostgreSQL and the production model host. It creates a disposable
owner through public bootstrap/token APIs and enrolls its controlled HTTP
provider through the public model credential API. It does not replace durable
storage or authentication responses.

Supply `SMITHERS_POSTGRES_TEST_BIN` (PostgreSQL 18) and
`SMITHERS_FFI_LIBRARY_PATH` (this source's native library).

The real native entrypoint probes additionally require a fresh `build:web`
and `SMITHERS_NATIVE_TEST_ASSETS`, pointing to the maintained native package's
`Contents/Resources/app` directory. The fixture copies public relocated assets
into an owned temporary directory and rebuilds the Go backend, coding host and
model host from the tested checkout. Qualification must retain the package
artifact receipt and establish that reused native/toolchain inputs match the
checkout; a bundle path alone is not source evidence.

Both compositions isolate application state and credentials. Build-only Go
caches remain in the existing tool cache; disposable runtime homes contain no
ambient provider credentials. Native probes mock only the SDK window/browser
boundary and exercise actual backend selection, renderer HTTP, RPC and URL
handling. Their existing per-test deadlines remain unchanged. Builds run in
setup, and missing prerequisites fail rather than skip.
