//! Keep the runnable native example checked against real temporary repositories.

#[path = "../examples/snapshot_restore.rs"]
mod snapshot_restore;

#[test]
fn example_entry_point_runs_without_external_repository_state() {
    snapshot_restore::main().unwrap();
}

#[test]
fn example_compares_saved_bytes_and_restores_them() {
    let temporary = tempfile::tempdir().unwrap();
    let root = temporary.path().join("repo");
    let patch = snapshot_restore::run(&root).unwrap();

    assert!(patch.starts_with("diff --git a/note.txt b/note.txt\n"));
    assert!(patch.contains("--- a/note.txt\n+++ b/note.txt\n"));
    assert!(patch.contains("@@ -1,1 +1,1 @@\n-before\n+after\n"));
    assert_eq!(std::fs::read(root.join("note.txt")).unwrap(), b"before\n");

    let restored = flows_jj::ops::snapshot(&root, None).unwrap();
    assert_eq!(
        flows_jj::ops::diff(&root, &restored.commit_id, "@").unwrap(),
        ""
    );
}
