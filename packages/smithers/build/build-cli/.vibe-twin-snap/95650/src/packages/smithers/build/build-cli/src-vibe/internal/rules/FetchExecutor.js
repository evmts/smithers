/**
 * Executes the exact planned Fetch payload. PackageExec owns cache and provenance.
 * @since 1.0.0
 */
import * as Effect_1 from "effect/Effect";
import * as EgressHttpClient from "@smthrs/platform-node/EgressHttpClient";
import * as Cause from "effect/Cause";
import * as Data from "effect/Data";
import * as Effect from "effect/Effect";
import * as HttpClient from "effect/http/HttpClient";
import * as HttpClientRequest from "effect/http/HttpClientRequest";
import * as Stream from "effect/Stream";
import { createHash } from "node:crypto";
import * as Diagnostic from "../../Diagnostic.js";
import * as Host from "../../native-hatch.js";
import * as Native from "./FetchExecutor.native.js";
/**
 * A typed fetch failure suitable for CLI diagnostics and direct callers.
 *
 * @category errors
 * @since 0.1.0
 */
export class FetchError extends Data.TaggedError("smithers-build/FetchError") {
    /**
     * Constructs a fetch failure without retaining response bytes or secrets.
     *
     * @since 0.1.0
     */
    constructor(code, message, expectedSha256, actualSha256, options) {
        super({
            code,
            message,
            expectedSha256,
            actualSha256,
            ...(options?.cause === undefined ? {} : { cause: options.cause })
        });
    }
}
/**
 * The most specific readable text in a rejected value's own `cause` chain.
 *
 * Effect's `HttpClientError` keeps its `message` on the prototype, so
 * {@link Diagnostic.message} — which reads own data properties only, on
 * purpose — sees nothing on the outermost value and would report every
 * transport failure with the same generic fallback. The underlying Node error
 * one or two `cause` hops down does carry an own `message`
 * (`connect ECONNREFUSED …`), so the walk recovers the actual reason without
 * ever invoking an accessor.
 */
const transportReason = (cause, fallback) => {
    let current = cause;
    for (let hop = 0; hop < 4; hop += 1) {
        const rendered = Diagnostic.message(current, "");
        if (rendered !== "")
            return rendered;
        if (typeof current !== "object" || current === null || Host.isProxy(current))
            break;
        const descriptor = Object.getOwnPropertyDescriptor(current, "cause");
        if (descriptor === undefined || !("value" in descriptor))
            break;
        current = descriptor.value;
    }
    return fallback;
};
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
export const maximumFetchBytes = 512 * 1024 * 1024;
/**
 * How long one fetch may take, in milliseconds, when the caller passed no
 * signal of its own.
 *
 * @category limits
 * @since 0.1.0
 */
export const fetchDeadlineMs = 30 * 60 * 1000;
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
export const redactUrl = (url) => {
    let parsed;
    try {
        parsed = new URL(url);
    }
    catch {
        return "<unparsable url>";
    }
    const credentials = parsed.username !== "" || parsed.password !== "";
    const query = parsed.search !== "" || parsed.hash !== "";
    return `${parsed.protocol}//${credentials ? "<redacted>@" : ""}${parsed.host}${parsed.pathname}` +
        `${query ? "?<redacted>" : ""}`;
};
/**
 * Most redirects one `S.Fetch` follows before it reports the redirect status.
 *
 * @category limits
 * @since 0.1.0
 */
export const maximumFetchRedirects = 10;
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
export const redirectTarget = (from, location) => {
    let next;
    try {
        next = new URL(location, from);
    }
    catch (cause) {
        throw new FetchError("insecure_redirect", `Fetch redirect from ${redactUrl(from)} names an unparsable location`, undefined, undefined, { cause });
    }
    const secure = new URL(from).protocol === "https:";
    if (next.protocol !== "https:" && (secure || next.protocol !== "http:")) {
        throw new FetchError("insecure_redirect", `Fetch refused a redirect from ${redactUrl(from)} to ${redactUrl(next.href)}: ${secure ? "it leaves https" : "it leaves http(s)"}`);
    }
    return next.href;
};
const writeFailure = (destination, cause) => new FetchError("write_failed", `Fetch could not publish ${destination}: ${Diagnostic.describe(cause)}`, undefined, undefined, { cause });
/**
 * The transfer itself: follows redirects, enforces the size limits, streams
 * accepted bytes to the temporary file, and owns its egress and deadline.
 */
const transfer = Effect_1.fnUntraced(function* transfer(url, safeUrl, destination, limitBytes, openTemporary, settle) {
    const body = Effect_1.fnUntraced(function* body() {
        const transport = yield* HttpClient.HttpClient;
        let current = url;
        let response = yield* transport.execute(HttpClientRequest.get(current));
        for (let hop = 0; hop < maximumFetchRedirects && response.status >= 300 && response.status < 400 &&
            response.headers.location !== undefined; hop += 1) {
            const location = response.headers.location;
            current = yield* Effect_1.try({ try: ((from, location, target) => target(from, location)).bind(undefined, current, location, redirectTarget), catch: (cause) => cause });
            response = yield* transport.execute(HttpClientRequest.get(current));
        }
        if (response.status < 200 || response.status >= 300) {
            return yield* Effect_1.fail(new FetchError("unexpected_status", `Fetch request for ${safeUrl} answered HTTP ${response.status}`));
        }
        const declared = response.headers["content-length"];
        if (declared !== undefined && /^\d+$/.test(declared)) {
            const declaredBytes = Number(declared);
            if (Number.isSafeInteger(declaredBytes) && declaredBytes > limitBytes) {
                return yield* Effect_1.fail(new FetchError("body_too_large", `Fetch response for ${safeUrl} declares ${declaredBytes} bytes, over the ${limitBytes} limit`));
            }
        }
        const hash = yield* Effect_1.sync(() => createHash("sha256"));
        let received = 0;
        yield* Stream.runForEach(response.stream, Effect_1.fnUntraced(function* (chunk) {
            const next = received + chunk.byteLength;
            if (next > limitBytes) {
                return yield* Effect_1.fail(new FetchError("body_too_large", `Fetch response for ${safeUrl} exceeded the ${limitBytes} byte limit`));
            }
            yield* Effect_1.tryPromise({ try: (async (openTemporary, chunk, hash) => {
                    const output = await openTemporary();
                    await Native.writeChunk(output, chunk);
                    hash.update(chunk);
                }).bind(undefined, openTemporary, chunk, hash), catch: (cause) => cause instanceof FetchError ? cause : writeFailure(destination, cause) });
            received = next;
        }));
        yield* Effect_1.tryPromise({ try: (async (settle) => settle()).bind(undefined, settle), catch: (cause) => writeFailure(destination, cause) });
        return { bytes: received, sha256: hash.digest("hex") };
    });
    const environment = yield* Effect_1.sync(() => process.env);
    return yield* Effect.timeoutOrElse(Effect_1.gen(function* () { return yield* Effect.provide(Effect_1.gen(function* () { return yield* Effect.scoped(Effect_1.gen(function* () { return yield* body(); })); }), EgressHttpClient.layer(environment)); }), {
        duration: fetchDeadlineMs,
        orElse: Effect_1.fnUntraced(function* orElse() {
            return yield* Effect_1.fail(new FetchError("request_failed", `Fetch request for ${safeUrl} did not finish in time`));
        })
    });
});
/**
 * Executes the Fetch variant selected by the family planner.
 *
 * The request is already reduced: no target declaration is read during dispatch.
 * The public declaration adapter and this contract share one download.
 *
 * @category execution
 * @since 1.0.0
 */
export const execute = (node, context) => download({
    root: context.root,
    signal: context.signal,
    outFile: node.outFiles[0],
    url: node.lane.url,
    sha256: node.lane.sha256
});
/** The shared transport used by the exact rule and the public declaration adapter.
 * @category execution
 * @since 1.0.0
 */
export const download = (options) => Native.download(options, { transfer, transportReason, writeFailure });
