/** Safe, local action-cache inspection and retention operations.
 * @since 0.1.0
 */
import { type CachedResult } from "./Cache.ts";
/** Metadata for an individually removable local action-result file.
 * @category models
 * @since 0.1.0
 */
export interface Entry {
    readonly path: string;
    readonly bytes: number;
    readonly modifiedAt: string;
    readonly inode: number;
}
/** Resolves an existing cache directory without creating it or following links.
 * @category querying
 * @since 0.1.0
 */
export declare const directory: (root: string, cacheDirectory: string) => Promise<string | undefined>;
/** Lists only regular files in the local result cache's shard layout.
 * @category querying
 * @since 0.1.0
 */
export declare const entries: (root: string, cacheDirectory: string) => Promise<ReadonlyArray<Entry>>;
/** Reads only metadata from the requested local result, without hydrating or creating state.
 * @category querying
 * @since 0.1.0
 */
export declare const inspect: (root: string, cacheDirectory: string, key: string) => Promise<Pick<CachedResult, "key" | "target" | "label" | "exitOk" | "storedAt"> | undefined>;
/** Removes individual action result files; never removes a directory or other run state.
 * @category execution
 * @since 0.1.0
 */
export declare const remove: (options: {
    readonly root: string;
    readonly cacheDirectory: string;
    readonly olderThanDays?: number | undefined;
    readonly dryRun: boolean;
    readonly yes: boolean;
    readonly now?: number | undefined;
}) => Promise<{
    scope: string;
    dryRun: boolean;
    candidates: number;
    candidateBytes: number;
    removed: number;
    bytes: number;
    recoverable: boolean;
}>;
