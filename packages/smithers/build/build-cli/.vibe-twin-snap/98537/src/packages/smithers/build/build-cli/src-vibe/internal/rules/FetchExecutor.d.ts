/**
 * Executes the exact planned Fetch payload. PackageExec owns cache and provenance.
 * @since 1.0.0
 */
import * as Cause from "effect/Cause";
import type * as Rule from "../RuleContract.js";
declare const FetchError_base: new <A extends Record<string, any> = {}>(args: import("effect/Types").VoidIfEmpty<{ readonly [P in keyof A as P extends "_tag" ? never : P]: A[P]; }>) => Cause.YieldableError & {
    readonly _tag: "smithers-build/FetchError";
} & Readonly<A>;
/**
 * A typed fetch failure suitable for CLI diagnostics and direct callers.
 *
 * @category errors
 * @since 0.1.0
 */
export declare class FetchError extends FetchError_base<{
    readonly code: "invalid_output" | "request_failed" | "unexpected_status" | "digest_mismatch" | "write_failed" | "body_too_large" | "insecure_redirect";
    readonly expectedSha256: string | undefined;
    readonly actualSha256: string | undefined;
    readonly message: string;
    readonly cause?: unknown;
}> {
    /**
     * Constructs a fetch failure without retaining response bytes or secrets.
     *
     * @since 0.1.0
     */
    constructor(code: "invalid_output" | "request_failed" | "unexpected_status" | "digest_mismatch" | "write_failed" | "body_too_large" | "insecure_redirect", message: string, expectedSha256?: string, actualSha256?: string, options?: ErrorOptions);
}
/**
 * Largest response body one `S.Fetch` will accept, in bytes.
 *
 * A fetch used to call `arrayBuffer` with no bound and no deadline of its own,
 * so a large or endless chunked response exhausted memory or hung until an
 * optional caller-supplied signal fired — and a declared Fetch may pass none.
 * The body is measured as it arrives and abandoned the moment it crosses this
 * line. Accepted bytes stream to a same-directory temporary file rather than
 * accumulating in memory.
 *
 * @category limits
 * @since 0.1.0
 */
export declare const maximumFetchBytes: number;
/**
 * How long one fetch may take, in milliseconds, when the caller passed no
 * signal of its own.
 *
 * @category limits
 * @since 0.1.0
 */
export declare const fetchDeadlineMs: number;
/**
 * Renders a URL without its credentials.
 *
 * The accepted grammar admits userinfo and a query, so a signed S3 URL or a
 * `https://user:token@host/...` form used to land verbatim in CLI output, the
 * reporter's stream, and every cached diagnostic. Only the origin and path
 * survive here; the full value stays in the failure's `cause`.
 *
 * @category rendering
 * @since 0.1.0
 */
export declare const redactUrl: (url: string) => string;
/**
 * Most redirects one `S.Fetch` follows before it reports the redirect status.
 *
 * @category limits
 * @since 0.1.0
 */
export declare const maximumFetchRedirects = 10;
/**
 * The URL a redirect leads to, or a refusal to follow it.
 *
 * The sha256 pin stops content substitution but not where the request goes:
 * a followed redirect used to accept any scheme change, so an `https` Fetch
 * could be steered onto cleartext `http`, where anyone on the path reads the
 * URL (a signed query included) and steers every further hop. A redirect must
 * stay on `http` or `https` and never leave `https` once the chain is on it.
 * Cross-host redirects stay allowed: release downloads (GitHub, S3) hop hosts.
 *
 * @category execution
 * @since 0.1.0
 */
export declare const redirectTarget: (from: string, location: string) => string;
/**
 * The successful result logged by the package executor.
 *
 * @category models
 * @since 0.1.0
 */
export interface Result {
    readonly bytes: number;
    readonly sha256: string;
}
/**
 * Executes the Fetch variant selected by the family planner.
 *
 * The request is already reduced: no target declaration is read during dispatch.
 * The public declaration adapter and this contract share one download.
 *
 * @category execution
 * @since 1.0.0
 */
export declare const execute: (node: Rule.Planned<Rule.Fetch>, context: Rule.ExecutionContext) => Promise<Result>;
/** The shared transport used by the exact rule and the public declaration adapter.
 * @category execution
 * @since 1.0.0
 */
export declare const download: (options: {
    readonly root: string;
    readonly url: string;
    readonly sha256: string;
    readonly outFile: string;
    readonly signal?: AbortSignal | undefined;
    /** Internal test seam; production callers use {@link maximumFetchBytes}. */
    readonly limitBytes?: number | undefined;
}) => Promise<Result>;
export {};
