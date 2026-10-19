import { Crypto, Effect, FileSystem, Path } from "effect";
import type { Provenance } from "./reuse.ts";
import { type PageSpec, type ReviewedPage, WikiError } from "./schema.ts";
export declare const digest: (text: string) => Effect.Effect<string, import("effect/PlatformError").PlatformError, Crypto.Crypto>;
/** Heading sections keep the review obligation small and explicit. */
export declare const sections: (markdown: string) => {
    id: string;
    markdown: string;
}[];
export declare const operations: (options: {
    readonly root: string;
    readonly output: string;
    readonly fs?: FileSystem.FileSystem | undefined;
    /** Host policy is reevaluated at publication, after potentially slow review. */
    readonly publicationRoot?: Effect.Effect<string, Error, FileSystem.FileSystem | Path.Path> | undefined;
}) => {
    check: (specs: ReadonlyArray<PageSpec>, requireVerified?: boolean) => Effect.Effect<{
        pages: number;
        verification: string;
    }, WikiError, Crypto.Crypto | FileSystem.FileSystem | Path.Path>;
    collect: (spec: PageSpec) => Effect.Effect<{
        spec: {
            readonly id: string;
            readonly title: string;
            readonly purpose: string;
            readonly kind: "current" | "intent";
            readonly document: string;
            readonly sourceDirectory?: string;
            readonly inputs: readonly string[];
            readonly related: readonly string[];
            readonly excerpts?: {
                readonly [x: string]: readonly {
                    readonly start: number;
                    readonly end: number;
                }[];
            } | undefined;
        };
        sources: {
            path: string;
            digest: string;
            text: string;
        }[];
        markdown: string;
        contentDigest: string;
        inputDigest: string;
        sections: {
            id: string;
            markdown: string;
        }[];
    }, WikiError, Crypto.Crypto | FileSystem.FileSystem | Path.Path>;
    assess: (page: ReviewedPage) => Effect.Effect<{
        readonly evidence: {
            readonly spec: {
                readonly id: string;
                readonly title: string;
                readonly purpose: string;
                readonly kind: "current" | "intent";
                readonly document: string;
                readonly sourceDirectory?: string;
                readonly inputs: readonly string[];
                readonly related: readonly string[];
                readonly excerpts?: {
                    readonly [x: string]: readonly {
                        readonly start: number;
                        readonly end: number;
                    }[];
                } | undefined;
            };
            readonly inputDigest: string;
            readonly contentDigest: string;
            readonly markdown: string;
            readonly sections: readonly {
                readonly id: string;
                readonly markdown: string;
            }[];
            readonly sources: readonly {
                readonly path: string;
                readonly digest: string;
                readonly text: string;
            }[];
        };
        readonly review: {
            readonly sections: readonly {
                readonly id: string;
                readonly verdict: "supported" | "uncertain" | "unsupported";
                readonly explanation: string;
                readonly citations: readonly {
                    readonly path: string;
                    readonly line: number;
                    readonly quote: string;
                }[];
            }[];
        } | null;
        readonly reviewer: string | null;
    }, WikiError, never>;
    write: (pages: ReadonlyArray<ReviewedPage>, mode: "preview" | "verified", provenance?: Readonly<Record<string, Provenance>>) => Effect.Effect<{
        schemaVersion: 1;
        sourceRevision: string;
        inputDigest: string;
        output: string;
        pages: number;
        verification: "needs-changes" | "unreviewed" | "verified";
    }, WikiError, Crypto.Crypto | FileSystem.FileSystem | Path.Path>;
};
