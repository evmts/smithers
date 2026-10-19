/**
 * Bounds selected Git paths without relying on stdin flags unsupported by diff.
 *
 * @since 1.0.0
 */
/**
 * Preserves path order in batches with room for the executable, fixed options,
 * and environment below platform argv limits. Count UTF-8 bytes, terminators,
 * and argv pointers. Literal pathspecs prevent a selected filename from matching
 * another batch's files through Git's pathspec syntax.
 *
 * @category internal
 * @since 1.0.0
 */
export declare const gitPathspecBatches: (paths: ReadonlyArray<string>) => ReadonlyArray<ReadonlyArray<string>>;
