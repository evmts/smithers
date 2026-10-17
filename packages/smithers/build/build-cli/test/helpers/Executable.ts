import { execFile } from "node:child_process"
import * as Fs from "node:fs/promises"
import * as Os from "node:os"
import * as Path from "node:path"
import { promisify } from "node:util"

/** A Rust string literal that never interprets fixture text as source code. */
const literal = (text: string): string => {
  let hashes = "#"
  while (text.includes(`"${hashes}`)) hashes += "#"
  return `r${hashes}"${text}"${hashes}`
}

/**
 * Writes an actual executable fixture. Windows cannot execute shebang scripts;
 * its native dispatcher retains literal argv, inherited pipes, and exit status.
 * Rust is already required by this repository's Windows native test lane.
 */
export const writeExecutable = async (
  path: string,
  source: string,
  platform: NodeJS.Platform = process.platform
): Promise<string> => {
  await Fs.mkdir(Path.dirname(path), { recursive: true })
  await Fs.writeFile(path, source, { mode: 0o755 })
  if (platform !== "win32") return path
  const shell = source.startsWith("#!/bin/sh\n")
  if (!shell && !source.startsWith("#!/usr/bin/env node\n")) throw new Error("Unknown fixture interpreter")
  const directory = await Fs.mkdtemp(Path.join(Os.tmpdir(), "smthrs-fixture-exe-"))
  const executable = `${path}.exe`
  try {
    const args = shell ? ["-c", source, "fixture"] : [path]
    const code = `use std::{env, fs, process::{Command, exit}};
fn main() {
  // The binary identity includes the fixture bytes; refuse stale compilation.
  if fs::read_to_string(${literal(path)}).ok().as_deref() != Some(${literal(source)}) {
    eprintln!("fixture source changed without recompilation"); exit(95);
  }
  let status = Command::new(${literal(shell ? "sh" : process.execPath)})
    .args([${args.map(literal).join(", ")}]).args(env::args_os().skip(1)).status();
  match status { Ok(status) => exit(status.code().unwrap_or(1)), Err(error) => { eprintln!("{}", error); exit(96); } }
}
`
    const program = Path.join(directory, "fixture.rs")
    await Fs.writeFile(program, code)
    await promisify(execFile)("rustc", ["--edition=2021", "--crate-name=fixture_cli", program, "-o", executable])
    return executable
  } finally {
    await Fs.rm(directory, { recursive: true, force: true })
  }
}
