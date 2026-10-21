import { Smithers } from "@smthrs/targets"
import { Package as flowsJjPackage } from "../smithers/flows/jj-wasm/PACKAGE.ts"

export const nativeFfiInputs = [
  Smithers.file("//Cargo.toml"),
  Smithers.file("//Cargo.lock"),
  Smithers.file("//rust-toolchain.toml"),
  Smithers.file("//packages/smithers/flows/jj-wasm/Cargo.toml"),
  flowsJjPackage.nativeSources,
  Smithers.glob("//packages/smithers-ffi/**/*.rs"),
  Smithers.file("//packages/smithers-ffi/Cargo.toml")
]
// Native FFI builds with the toolchain rust-toolchain.toml pins, installed
// into a private rustup home so the declared output carries it.
export const nativeFfiLib = Smithers.Shell.Build({
  shell: "mkdir -p .native-ffi; export RUSTUP_HOME=\"$PWD/.native-ffi/rustup\" CARGO_TARGET_DIR=\"$PWD/.native-ffi/target\"; rustup toolchain install && cargo build -p smithers-ffi --lib --locked",
  outDirs: ["//.native-ffi"],
  data: nativeFfiInputs,
  sandbox: { network: true },
  timeout: "30m"
})
