//! Capture, compare and restore files in a temporary native repository.
//!
//! Run from the repository root:
//! `cargo run --locked -p flows-jj --example snapshot_restore`
//! This uses jj's Simple backend, without Git interop or a jj executable.

use std::error::Error;
use std::path::Path;

use flows_jj::ops;

/// Runs the example in a disposable repository at `root`, returning its patch.
///
/// The caller supplies a new or empty directory. Filesystem and repository
/// failures propagate to the caller; the saved commit id identifies the exact
/// captured tree even after the current change is rewritten.
pub fn run(root: &Path) -> Result<String, Box<dyn Error>> {
    ops::init(root)?;
    std::fs::write(root.join("note.txt"), "before\n")?;
    let saved = ops::snapshot(root, Some("before editing"))?;

    std::fs::write(root.join("note.txt"), "after\n")?;
    let patch = ops::diff(root, &saved.commit_id, "@")?;
    ops::restore(root, &saved.commit_id)?;
    Ok(patch)
}

/// Prints the patch from a temporary repository, removed when this call returns.
pub fn main() -> Result<(), Box<dyn Error>> {
    let temporary = tempfile::tempdir()?;
    print!("{}", run(&temporary.path().join("repo"))?);
    Ok(())
}
