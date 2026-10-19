import { Flow } from "@smthrs/flow";
import { Schema } from "effect";
import { WikiError } from "./schema.ts";
declare const _default: Flow.Flow<"smithers/Wiki", Schema.Struct<{
    readonly pages: Schema.$Array<Schema.Struct<{
        readonly id: Schema.String;
        readonly title: Schema.String;
        readonly purpose: Schema.String;
        readonly kind: Schema.Literals<readonly ["current", "intent"]>;
        readonly document: Schema.String;
        readonly sourceDirectory: Schema.optionalKey<Schema.String>;
        readonly inputs: Schema.$Array<Schema.String>;
        readonly related: Schema.$Array<Schema.String>;
        readonly excerpts: Schema.optional<Schema.$Record<Schema.String, Schema.$Array<Schema.Struct<{
            readonly start: Schema.Int;
            readonly end: Schema.Int;
        }>>>>;
    }>>;
    readonly mode: Schema.Literals<readonly ["preview", "verified"]>;
    readonly reviewer: Schema.String;
}>, Schema.Struct<{
    readonly schemaVersion: Schema.Literal<1>;
    readonly sourceRevision: Schema.String;
    readonly inputDigest: Schema.String;
    readonly output: Schema.String;
    readonly pages: Schema.Int;
    readonly verification: Schema.Literals<readonly ["unreviewed", "verified", "needs-changes"]>;
}>, Schema.Union<readonly [typeof WikiError, Schema.Union<readonly [typeof import("@smthrs/harness/StructuredOutput").StructuredOutputFailure, typeof import("@smthrs/agent/Seat").SeatUnresolved, typeof import("@smthrs/agent/Seat").SeatUnrouted, typeof import("@smthrs/agent/Budget").BudgetExceeded, typeof import("@smthrs/agent/Budget").Skipped, typeof import("@smthrs/harness/HarnessError").HarnessError, typeof import("@smthrs/plugin").PluginError]>]>, import("@smthrs/flow/Action").Requirement<"wiki/assess-review"> | import("@smthrs/flow/Action").Requirement<"wiki/check-citations"> | import("@smthrs/flow/Action").Requirement<"wiki/collect-page"> | import("@smthrs/flow/Action").Requirement<"wiki/review-page"> | import("@smthrs/flow/Action").Requirement<"wiki/validate-review"> | import("@smthrs/flow/Action").Requirement<"wiki/write-snapshot">>;
export default _default;
