/**
 * What Alchemy's bundler hands a Worker for `#quickjs.wasm` (package.json `imports`, worker/AgentSandbox.ts): the
 * QuickJS build's `.wasm` file, uploaded as a CompiledWasm module, as its compiled `WebAssembly.Module`. The package's
 * own types can't say so: the shape depends on the bundler, not on the package.
 */
declare module "#quickjs.wasm" {
  const wasmModule: WebAssembly.Module
  export default wasmModule
}
