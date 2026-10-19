/** Review through the ordinary flow registry and host; result includes the custom walkthrough. */
import { Flow } from "@smthrs/flow";
export { layer } from "./src/workflow/reviewLayer.ts";
declare const _default: Flow.Flow<"review", import("effect/Schema").Struct<{
    readonly repo: import("effect/Schema").withDecodingDefaultKey<import("effect/Schema").withConstructorDefault<import("effect/Schema").String>, never>;
    readonly from: import("effect/Schema").withDecodingDefaultKey<import("effect/Schema").withConstructorDefault<import("effect/Schema").String>, never>;
    readonly to: import("effect/Schema").withDecodingDefaultKey<import("effect/Schema").withConstructorDefault<import("effect/Schema").String>, never>;
    readonly commit: import("effect/Schema").withDecodingDefaultKey<import("effect/Schema").withConstructorDefault<import("effect/Schema").String>, never>;
    readonly background: import("effect/Schema").withDecodingDefaultKey<import("effect/Schema").withConstructorDefault<import("effect/Schema").String>, never>;
    readonly rule: import("effect/Schema").withDecodingDefaultKey<import("effect/Schema").withConstructorDefault<import("effect/Schema").String>, never>;
    readonly concurrency: import("effect/Schema").withDecodingDefaultKey<import("effect/Schema").withConstructorDefault<import("effect/Schema").Number>, never>;
    readonly timeout: import("effect/Schema").withDecodingDefaultKey<import("effect/Schema").withConstructorDefault<import("effect/Schema").Finite>, never>;
    readonly runReview: import("effect/Schema").withDecodingDefaultKey<import("effect/Schema").withConstructorDefault<import("effect/Schema").Boolean>, never>;
    readonly out: import("effect/Schema").withDecodingDefaultKey<import("effect/Schema").withConstructorDefault<import("effect/Schema").String>, never>;
    readonly narrate: import("effect/Schema").withDecodingDefaultKey<import("effect/Schema").withConstructorDefault<import("effect/Schema").Boolean>, never>;
    readonly title: import("effect/Schema").withDecodingDefaultKey<import("effect/Schema").withConstructorDefault<import("effect/Schema").String>, never>;
    readonly split: import("effect/Schema").withDecodingDefaultKey<import("effect/Schema").withConstructorDefault<import("effect/Schema").Boolean>, never>;
    readonly verify: import("effect/Schema").withDecodingDefaultKey<import("effect/Schema").withConstructorDefault<import("effect/Schema").Boolean>, never>;
}>, import("effect/Schema").Struct<{
    readonly target: import("effect/Schema").Struct<{
        readonly repoDir: import("effect/Schema").String;
        readonly mode: import("effect/Schema").Literals<readonly ["workspace", "range", "commit"]>;
        readonly ref: import("effect/Schema").String;
    }>;
    readonly review: import("effect/Schema").Struct<{
        readonly status: import("effect/Schema").Literals<readonly ["success", "skipped", "completed_with_warnings", "completed_with_errors", "failed"]>;
        readonly ok: import("effect/Schema").Boolean;
        readonly reviewer: import("effect/Schema").withDecodingDefaultKey<import("effect/Schema").withConstructorDefault<import("effect/Schema").String>, never>;
        readonly message: import("effect/Schema").withDecodingDefaultKey<import("effect/Schema").withConstructorDefault<import("effect/Schema").String>, never>;
        readonly summary: import("effect/Schema").withDecodingDefaultKey<import("effect/Schema").withConstructorDefault<import("effect/Schema").NullOr<import("effect/Schema").Struct<{
            readonly filesReviewed: import("effect/Schema").withDecodingDefaultKey<import("effect/Schema").withConstructorDefault<import("effect/Schema").Number>, never>;
            readonly comments: import("effect/Schema").withDecodingDefaultKey<import("effect/Schema").withConstructorDefault<import("effect/Schema").Number>, never>;
            readonly totalTokens: import("effect/Schema").withDecodingDefaultKey<import("effect/Schema").withConstructorDefault<import("effect/Schema").NullOr<import("effect/Schema").Number>>, never>;
            readonly inputTokens: import("effect/Schema").withDecodingDefaultKey<import("effect/Schema").withConstructorDefault<import("effect/Schema").NullOr<import("effect/Schema").Number>>, never>;
            readonly outputTokens: import("effect/Schema").withDecodingDefaultKey<import("effect/Schema").withConstructorDefault<import("effect/Schema").NullOr<import("effect/Schema").Number>>, never>;
            readonly elapsed: import("effect/Schema").withDecodingDefaultKey<import("effect/Schema").withConstructorDefault<import("effect/Schema").String>, never>;
        }>>>, never>;
        readonly comments: import("effect/Schema").withDecodingDefaultKey<import("effect/Schema").withConstructorDefault<import("effect/Schema").mutable<import("effect/Schema").$Array<import("effect/Schema").Struct<{
            readonly path: import("effect/Schema").withDecodingDefaultKey<import("effect/Schema").withConstructorDefault<import("effect/Schema").String>, never>;
            readonly content: import("effect/Schema").withDecodingDefaultKey<import("effect/Schema").withConstructorDefault<import("effect/Schema").String>, never>;
            readonly suggestionCode: import("effect/Schema").withDecodingDefaultKey<import("effect/Schema").withConstructorDefault<import("effect/Schema").String>, never>;
            readonly existingCode: import("effect/Schema").withDecodingDefaultKey<import("effect/Schema").withConstructorDefault<import("effect/Schema").String>, never>;
            readonly startLine: import("effect/Schema").withDecodingDefaultKey<import("effect/Schema").withConstructorDefault<import("effect/Schema").Number>, never>;
            readonly endLine: import("effect/Schema").withDecodingDefaultKey<import("effect/Schema").withConstructorDefault<import("effect/Schema").Number>, never>;
            readonly thinking: import("effect/Schema").withDecodingDefaultKey<import("effect/Schema").withConstructorDefault<import("effect/Schema").String>, never>;
            readonly severity: import("effect/Schema").withDecodingDefaultKey<import("effect/Schema").withConstructorDefault<import("effect/Schema").Literals<readonly ["critical", "major", "minor", "info"]>>, never>;
            readonly category: import("effect/Schema").withDecodingDefaultKey<import("effect/Schema").withConstructorDefault<import("effect/Schema").Literals<readonly ["correctness", "security", "performance", "data-loss", "tests", "docs", "style", "other"]>>, never>;
            readonly confidence: import("effect/Schema").withDecodingDefaultKey<import("effect/Schema").withConstructorDefault<import("effect/Schema").Literals<readonly ["confirmed", "plausible"]>>, never>;
        }>>>>, never>;
        readonly warnings: import("effect/Schema").withDecodingDefaultKey<import("effect/Schema").withConstructorDefault<import("effect/Schema").mutable<import("effect/Schema").$Array<import("effect/Schema").Struct<{
            readonly file: import("effect/Schema").withDecodingDefaultKey<import("effect/Schema").withConstructorDefault<import("effect/Schema").String>, never>;
            readonly message: import("effect/Schema").withDecodingDefaultKey<import("effect/Schema").withConstructorDefault<import("effect/Schema").String>, never>;
            readonly type: import("effect/Schema").withDecodingDefaultKey<import("effect/Schema").withConstructorDefault<import("effect/Schema").String>, never>;
        }>>>>, never>;
        readonly error: import("effect/Schema").withDecodingDefaultKey<import("effect/Schema").withConstructorDefault<import("effect/Schema").String>, never>;
    }>;
    readonly walkthrough: import("effect/Schema").Struct<{
        readonly path: import("effect/Schema").String;
        readonly artifactPath: import("effect/Schema").withDecodingDefaultKey<import("effect/Schema").withConstructorDefault<import("effect/Schema").String>, never>;
        readonly bytes: import("effect/Schema").Number;
        readonly chapters: import("effect/Schema").Number;
        readonly files: import("effect/Schema").Number;
        readonly findings: import("effect/Schema").Number;
        readonly message: import("effect/Schema").withDecodingDefaultKey<import("effect/Schema").withConstructorDefault<import("effect/Schema").String>, never>;
    }>;
    readonly story: import("effect/Schema").Struct<{
        readonly headline: import("effect/Schema").withDecodingDefaultKey<import("effect/Schema").withConstructorDefault<import("effect/Schema").String>, never>;
        readonly synopsis: import("effect/Schema").withDecodingDefaultKey<import("effect/Schema").withConstructorDefault<import("effect/Schema").String>, never>;
        readonly chapters: import("effect/Schema").withDecodingDefaultKey<import("effect/Schema").withConstructorDefault<import("effect/Schema").mutable<import("effect/Schema").$Array<import("effect/Schema").Struct<{
            readonly title: import("effect/Schema").withDecodingDefaultKey<import("effect/Schema").withConstructorDefault<import("effect/Schema").String>, never>;
            readonly blocks: import("effect/Schema").withDecodingDefaultKey<import("effect/Schema").withConstructorDefault<import("effect/Schema").mutable<import("effect/Schema").$Array<import("effect/Schema").Struct<{
                readonly kind: import("effect/Schema").withDecodingDefaultKey<import("effect/Schema").withConstructorDefault<import("effect/Schema").String>, never>;
                readonly text: import("effect/Schema").withDecodingDefaultKey<import("effect/Schema").withConstructorDefault<import("effect/Schema").String>, never>;
                readonly path: import("effect/Schema").withDecodingDefaultKey<import("effect/Schema").withConstructorDefault<import("effect/Schema").String>, never>;
                readonly intro: import("effect/Schema").withDecodingDefaultKey<import("effect/Schema").withConstructorDefault<import("effect/Schema").String>, never>;
                readonly title: import("effect/Schema").withDecodingDefaultKey<import("effect/Schema").withConstructorDefault<import("effect/Schema").String>, never>;
                readonly mermaid: import("effect/Schema").withDecodingDefaultKey<import("effect/Schema").withConstructorDefault<import("effect/Schema").String>, never>;
            }>>>>, never>;
        }>>>>, never>;
    }>;
    readonly ui: import("effect/Schema").Struct<{
        readonly kind: import("effect/Schema").Literal<"html">;
        readonly title: import("effect/Schema").String;
        readonly html: import("effect/Schema").String;
    }>;
}>, import("effect/Schema").Union<readonly [typeof import("./src/workflow/reviewFailureSchema.ts").ChangeSetUnreadable, typeof import("./src/workflow/reviewFailureSchema.ts").WalkthroughUnwritable]>, import("@smthrs/flow/Action").Requirement<"smithers-review/PrepareReview">>;
export default _default;
