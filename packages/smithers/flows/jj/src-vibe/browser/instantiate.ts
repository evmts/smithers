/**
 * E-7/EK4402 and A-2/E-5: instantiating the reactor awaits `WebAssembly`, a
 * platform API, and is a Promise-returning boundary; VibeLang has no `async`
 * outside a hatch. `BrowserJj.vibe` waits for it through its `try` hatch,
 * which maps the rejection exactly as the source's `Effect.tryPromise` did.
 * The body is the source's `instantiate`, byte for byte.
 */
import { JjInternalFault } from "../internal/JjInternalFault.vibe"
import type { SyncFsLike } from "./WasiFs.vibe"
import * as WasiPreview1 from "./WasiPreview1.vibe"

/**
 * The exports the frozen `flows_jj.wasm` ABI guarantees: a reactor
 * initializer, an allocator pair, and one call entrypoint taking UTF-8 JSON
 * and returning `(ptr << 32) | len` packed into a `u64`.
 */
export interface AbiExports {
  readonly memory: WebAssembly.Memory
  readonly _initialize: () => void
  readonly flows_jj_alloc: (size: number) => number
  readonly flows_jj_free: (ptr: number, size: number) => void
  readonly flows_jj_call: (ptr: number, len: number) => bigint
}

const REQUIRED_EXPORTS = ["memory", "_initialize", "flows_jj_alloc", "flows_jj_free", "flows_jj_call"] as const

/**
 * One live reactor: the ABI exports and the WASI host they were instantiated
 * over. The two are disposed together, because the host's fd table is the
 * only record of which backend descriptors the guest holds.
 */
export interface Reactor {
  readonly abi: AbiExports
  readonly wasi: WasiPreview1.WasiPreview1
}

/**
 * Compile (when handed bytes), instantiate over a fresh WASI shim, check the
 * frozen export surface, bind memory, and run the reactor initializer —
 * memory must be bound first because `_initialize` may already issue
 * syscalls.
 *
 * A failure after the WASI host exists (a missing export, a trapping
 * `_initialize`) disposes the host before rethrowing: an initializer that
 * opened a file and then panicked would otherwise leave that descriptor on
 * the backend with no instance left to close it.
 */
export const instantiate = async (
  host: {
    readonly fs: SyncFsLike
    readonly onStdout?: ((text: string) => void) | undefined
    readonly onStderr?: ((text: string) => void) | undefined
  },
  wasm: WebAssembly.Module | BufferSource
): Promise<Reactor> => {
  const wasi = WasiPreview1.make({
    fs: host.fs,
    ...(host.onStdout === undefined ? {} : { onStdout: host.onStdout }),
    ...(host.onStderr === undefined ? {} : { onStderr: host.onStderr })
  })
  try {
    const imports: WebAssembly.Imports = { wasi_snapshot_preview1: { ...wasi.imports } }
    // The two `instantiate` overloads return different shapes, and the lib
    // definitions disagree across type environments (lib.dom returns a
    // `WebAssemblyInstantiatedSource` for bytes; workers-types returns the
    // instance for both). Discriminate the value, not the overload.
    const instantiated: unknown = await WebAssembly.instantiate(wasm as never, imports)
    const instance = instantiated instanceof WebAssembly.Instance
      ? instantiated
      : (instantiated as { readonly instance: WebAssembly.Instance }).instance
    const exports = instance.exports as Record<string, unknown>
    const missing = REQUIRED_EXPORTS.filter((name) =>
      name === "memory" ? !(exports[name] instanceof WebAssembly.Memory) : typeof exports[name] !== "function"
    )
    if (missing.length > 0) {
      throw new JjInternalFault({
        code: "reactor_abi_incomplete",
        message: `the module does not export the flows_jj ABI (missing: ${missing.join(", ")})`
      })
    }
    const abi = exports as unknown as AbiExports
    wasi.initialize(abi.memory)
    abi._initialize()
    return { abi, wasi }
  } catch (cause) {
    try {
      wasi.dispose()
    } catch {
      // The instantiation failure is the one to report; a backend that also
      // refuses to close what the initializer opened cannot improve on it.
    }
    throw cause
  }
}
