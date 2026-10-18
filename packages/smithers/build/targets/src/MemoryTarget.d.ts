/**
 * PACKAGE.ts memory surfaces: the `S.Memory.Retain` target and the
 * `S.Memory.SmithersCloud` workspace declaration.
 *
 * The target constructor validates attrs by schema. Its execution is owned by
 * the `@smthrs/build-cli` package runner, which dispatches `Memory.Retain` to
 * the workspace memory backend (`MemoryBackend.retain`); the target's own
 * implementation is {@link Target.notImplemented} so no other executor runs
 * it without that backend. The workspace declaration is inert data.
 *
 * @since 0.1.0
 */
import * as Schema from "effect/Schema";
import * as Input from "./Input.ts";
import * as Secret from "./Secret.ts";
import * as Target from "./Target.ts";
/**
 * Attrs for {@link Retain}.
 *
 * @category schemas
 * @since 0.1.0
 */
export declare const RetainAttrs: Schema.Struct<{
    readonly source: Schema.TaggedStruct<"GitCommit", {
        readonly ref: Schema.NonEmptyString;
    }>;
    readonly tags: Schema.$Array<Schema.NonEmptyString>;
}>;
/**
 * Retains the referenced commit in the configured memory bank. The
 * `@smthrs/build-cli` package runner executes it through the workspace
 * `S.Memory.SmithersCloud` backend.
 *
 * @category targets
 * @since 0.1.0
 */
export declare const Retain: Target.Definition<"Memory.Retain", Schema.Struct<{
    readonly source: Schema.TaggedStruct<"GitCommit", {
        readonly ref: Schema.NonEmptyString;
    }>;
    readonly tags: Schema.$Array<Schema.NonEmptyString>;
}>, Schema.Schema<never>, Schema.Schema<Target.NotImplemented>, import("@smthrs/flow/Action").Requirement<"smithers-build/not-implemented">>;
/**
 * The validated attrs of one `Memory.Retain` target.
 *
 * @category accessors
 * @since 0.1.0
 */
export declare const retainAttrsOf: (target: Target.AnyTarget) => (typeof RetainAttrs)["Type"];
/**
 * Schema for the Smithers Cloud memory workspace declaration.
 *
 * @category schemas
 * @since 0.1.0
 */
export declare const SmithersCloudDeclaration: Schema.TaggedStruct<"MemorySmithersCloud", {
    readonly bank: Schema.$Array<Schema.NonEmptyString>;
    readonly autoInject: Schema.optional<Schema.Number>;
    readonly init: Schema.optional<Schema.Struct<{
        readonly script: Schema.TaggedStruct<"File", {
            readonly path: Schema.NonEmptyString;
        }>;
        readonly secrets: Schema.optional<Schema.$Array<Schema.TaggedStruct<"HttpCredential", {
            readonly secret: Schema.TaggedStruct<"Secret", {
                readonly env: Schema.NonEmptyString;
                readonly fallback: Schema.optional<Schema.NonEmptyString>;
            }>;
            readonly audiences: Schema.NonEmptyArray<Schema.NonEmptyString>;
        }>>>;
    }>>;
}>;
/**
 * The Smithers Cloud memory workspace declaration.
 *
 * @category models
 * @since 0.1.0
 */
export type SmithersCloudDeclaration = typeof SmithersCloudDeclaration.Type;
/**
 * Checks whether a value is the Smithers Cloud memory declaration.
 *
 * @category guards
 * @since 0.1.0
 */
export declare const isSmithersCloudDeclaration: (value: unknown) => value is SmithersCloudDeclaration;
/**
 * Declares Smithers Cloud as the workspace memory bank.
 *
 * @category constructors
 * @since 0.1.0
 */
export declare const SmithersCloud: (options: {
    readonly bank: ReadonlyArray<string>;
    readonly autoInject?: number | undefined;
    readonly init?: {
        readonly script: Input.File;
        readonly secrets?: ReadonlyArray<Secret.HttpCredential> | undefined;
    } | undefined;
}) => SmithersCloudDeclaration;
