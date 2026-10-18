/** What workerd's toolchain hands a Worker for a `.wasm` import: the compiled module. */
declare module "@jitl/quickjs-wasmfile-release-sync/wasm" {
  const wasmModule: WebAssembly.Module
  export default wasmModule
}
