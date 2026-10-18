/**
 * Repair Git patch headers using jj's structured path metadata.
 *
 * @since 1.0.0
 */
/**
 * jj 0.39 emits literal paths in Git headers (jj-vcs/jj v0.39.0,
 * cli/src/diff_util.rs::show_git_diff). Read paths from its JSON template:
 * splitting raw headers on whitespace cannot distinguish pathname bytes.
 * Consume complete known paths before looking for the next header, and never
 * rewrite hunk contents, even when they resemble headers. Accept the quoted
 * form as well so normalization is idempotent.
 *
 * @private
 * @since 1.0.0
 */
export declare const quoteGitPatchPaths: (patch: string, paths: string) => string;
