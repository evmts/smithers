/**
 * Dependency documentation a workspace declares for agent memory:
 * `S.Docs.Package` and `S.Docs.Url`.
 *
 * A workspace names each source under `docs` in `WORKSPACE.ts`. A wiki
 * refresh imports them into `.flows/wiki/deps/<name>/`, and `memory` reads
 * them from there as dependency pages; memory itself never fetches. Every
 * source is pinned: a package by the version its lockfile installed, a URL by
 * the SHA-256 digest of its bytes.
 *
 * @since 1.0.0
 */
/**
 * Markdown files of an installed package, read from `node_modules`.
 *
 * @category models
 * @since 1.0.0
 */
export interface PackageDocs {
    readonly _tag: "DocsPackage";
    readonly package: string;
    readonly files: ReadonlyArray<string>;
}
/**
 * One Markdown document at a URL, pinned by digest.
 *
 * @category models
 * @since 1.0.0
 */
export interface UrlDocs {
    readonly _tag: "DocsUrl";
    readonly url: string;
    readonly sha256: string;
}
/**
 * One declared documentation source.
 *
 * @category models
 * @since 1.0.0
 */
export type Declaration = PackageDocs | UrlDocs;
/**
 * Declares Markdown files of an installed package; `README.md` when `files`
 * is absent.
 *
 * @category constructors
 * @since 1.0.0
 */
export declare const Package: (name: string, options?: {
    readonly files?: ReadonlyArray<string>;
}) => PackageDocs;
/**
 * Declares one Markdown document at an https URL, pinned by the SHA-256 of
 * its bytes.
 *
 * @category constructors
 * @since 1.0.0
 */
export declare const Url: (url: string, options: {
    readonly sha256: string;
}) => UrlDocs;
/**
 * Whether a value is a source `Package` or `Url` declared; an object that
 * only carries the same `_tag` is not.
 *
 * @category guards
 * @since 1.0.0
 */
export declare const isDeclaration: (value: unknown) => value is Declaration;
