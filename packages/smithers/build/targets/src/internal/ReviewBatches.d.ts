/**
 * Review batch planning: related changed code stays together, unchanged
 * callers and dependencies travel with it, and every request fits the
 * selected model's token budget with output capacity reserved.
 * @since 1.0.0
 */
/**
 * Conservative token estimate for provider-bound text: three UTF-8 bytes per token.
 * @category budget
 * @since 1.0.0
 */
export declare const estimateTokens: (text: string) => number;
/**
 * One changed file, or one symbol-aligned slice of a changed file too large for a single request.
 * @category models
 * @since 1.0.0
 */
export interface Segment {
    readonly path: string;
    readonly contents: string;
    readonly deleted?: boolean;
    /** 1-based line of the file this slice starts at. */
    readonly firstLine: number;
    readonly lastLine: number;
    readonly totalLines: number;
}
/**
 * One planned model request: its changed slices plus the unchanged related files it carries.
 * @category models
 * @since 1.0.0
 */
export interface PlannedBatch {
    readonly changed: ReadonlyArray<Segment>;
    readonly related: ReadonlyArray<string>;
    readonly omittedRelated: ReadonlyArray<string>;
}
/**
 * Whether static relative imports of a file can be resolved.
 * @category graph
 * @since 1.0.0
 */
export declare const isScript: (path: string) => boolean;
/**
 * Relative module specifiers a script names in static imports, re-exports, dynamic imports and requires.
 * @category graph
 * @since 1.0.0
 */
export declare const importSpecifiers: (contents: string) => ReadonlyArray<string>;
/**
 * The workspace paths one relative specifier can name, in resolution order.
 * Specifiers that leave the workspace resolve to nothing.
 * @category graph
 * @since 1.0.0
 */
export declare const importCandidates: (from: string, specifier: string) => ReadonlyArray<string>;
/**
 * The first candidate of a specifier that `exists` accepts.
 * @category graph
 * @since 1.0.0
 */
export declare const resolveImport: (from: string, specifier: string, exists: (path: string) => boolean) => string | undefined;
/**
 * Module stems a caller's relative specifier ends with when it names `path`.
 * @category graph
 * @since 1.0.0
 */
export declare const importStems: (path: string) => ReadonlyArray<string>;
/**
 * Go files in one directory form one package and are always related.
 * @category graph
 * @since 1.0.0
 */
export declare const goPackage: (path: string) => string | undefined;
/**
 * Splits one file into slices whose `cost` fits `budget`, cutting at top-level
 * symbol boundaries when possible, then at lines, then within an overlong line.
 * @category splitting
 * @since 1.0.0
 */
export declare const splitFile: (file: {
    readonly path: string;
    readonly contents: string;
    readonly deleted?: boolean;
}, budget: number, cost: (segment: Segment) => number) => ReadonlyArray<Segment>;
/**
 * Inputs for {@link planBatches}. `edges` relate changed paths to each other,
 * `related` lists each changed path's unchanged related files in priority
 * order (dependencies before callers), and `cost` prices one rendered file.
 * @category models
 * @since 1.0.0
 */
export interface PlanInput {
    readonly files: ReadonlyArray<{
        readonly path: string;
        readonly contents: string;
        readonly deleted?: boolean;
    }>;
    readonly edges: ReadonlyMap<string, ReadonlySet<string>>;
    readonly related: ReadonlyMap<string, ReadonlyArray<string>>;
    readonly relatedCost: (path: string) => number;
    readonly segmentCost: (segment: Segment) => number;
    readonly budget: number;
    readonly maximumFiles: number;
}
/**
 * Groups changed files into connected components of the relation graph, keeps
 * each component together whenever it fits one request, and fills remaining
 * budget with the batch's unchanged related files.
 * @category planning
 * @since 1.0.0
 */
export declare const planBatches: (input: PlanInput) => ReadonlyArray<PlannedBatch>;
interface Source {
    readonly path: string;
    readonly contents: string;
}
/**
 * Unchanged paths the changed scripts import, resolved against `exists`.
 * @category graph
 * @since 1.0.0
 */
export declare const calleePaths: (changed: ReadonlyArray<Source>, exists: (path: string) => boolean) => ReadonlyArray<string>;
/**
 * Extended regular expressions matching a relative specifier that can name a changed script.
 * @category graph
 * @since 1.0.0
 */
export declare const callerPatterns: (changed: ReadonlyArray<string>) => ReadonlyArray<string>;
/**
 * Directories whose Go files share a package with a changed Go file.
 * @category graph
 * @since 1.0.0
 */
export declare const goDirectories: (changed: ReadonlyArray<string>) => ReadonlyArray<string>;
/**
 * The relation graph among changed files and each changed file's related
 * unchanged files, dependencies first, then Go package siblings, then callers.
 * @category graph
 * @since 1.0.0
 */
export declare const relate: (changed: ReadonlyArray<Source>, unchanged: ReadonlyArray<Source>, exists: (path: string) => boolean) => {
    readonly edges: ReadonlyMap<string, ReadonlySet<string>>;
    readonly related: ReadonlyMap<string, ReadonlyArray<string>>;
};
export {};
