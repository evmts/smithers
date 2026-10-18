/**
 * The shared write-file and check-file actions used by every target that
 * generates a checked-in file from PACKAGE.ts attrs.
 *
 * This module used to also carry `PackageJsonGen`, a target that rendered a
 * manifest out of a fixed attrs struct. {@link PackageJson.PackageJson}
 * subsumes it: a package declares one manifest value, the workspace resolves
 * its labels, and the check and write halves become separate targets with
 * separate verbs.
 *
 * @since 0.1.0
 */
import { Action, type FlowRuntime } from "@smthrs/flow";
import type * as Node from "@smthrs/plan/Node";
import * as Effect from "effect/Effect";
import type * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";
/**
 * Output handling for a generated file. `write` emits the file. `check`
 * compares the checked-in file and fails on drift. The constructor default
 * is `write`.
 *
 * @category schemas
 * @since 0.1.0
 */
export declare const Mode: Schema.withConstructorDefault<Schema.Literals<readonly ["write", "check"]>>;
/**
 * Output handling for a generated file.
 *
 * @category models
 * @since 0.1.0
 */
export type Mode = typeof Mode.Type;
/**
 * Payload for one generated file: a workspace-relative path and the full
 * generated contents.
 *
 * @category schemas
 * @since 0.1.0
 */
export declare const FilePayload: Schema.Struct<{
    readonly path: Schema.NonEmptyString;
    readonly contents: Schema.String;
}>;
/**
 * Payload for one generated file.
 *
 * @category models
 * @since 0.1.0
 */
export type FilePayload = typeof FilePayload.Type;
declare const WriteFileError_base: Schema.Class<WriteFileError, Schema.TaggedStruct<"smithers-build/WriteFileError", {
    readonly path: Schema.NonEmptyString;
    readonly message: Schema.NonEmptyString;
}>, import("effect/Cause").YieldableError>;
/**
 * A generated file could not be written.
 *
 * @category errors
 * @since 0.1.0
 */
export declare class WriteFileError extends WriteFileError_base {
}
declare const DriftError_base: Schema.Class<DriftError, Schema.TaggedStruct<"smithers-build/DriftError", {
    readonly path: Schema.NonEmptyString;
    readonly message: Schema.NonEmptyString;
    /**
     * Why the check failed, as a stable code rather than prose.
     *
     * `missing` and `drifted` are both answered by regenerating the file.
     * `unreadable` is not: a permissions failure, a symlink where a generated
     * file belongs, invalid UTF-8, or an oversized file all reach this error,
     * and calling any of them drift would send an operator to regenerate a
     * file whose problem regeneration does not touch.
     *
     * Required, not optional: an optional discriminator left every public
     * error flow free to report the reasonless value this field exists to
     * eliminate, so a caller still had to read the prose to tell the three
     * apart.
     */
    readonly reason: Schema.Literals<readonly ["missing", "drifted", "unreadable"]>;
}>, import("effect/Cause").YieldableError>;
/**
 * A checked-in file is missing or differs from its generated form.
 *
 * @category errors
 * @since 0.1.0
 */
export declare class DriftError extends DriftError_base {
}
/**
 * Why one generated-file check failed.
 *
 * @category models
 * @since 0.1.0
 */
export type DriftReason = DriftError["reason"];
/**
 * Constructs a typed generated-file drift failure.
 *
 * @category constructors
 * @since 0.1.0
 */
export declare const driftError: (path: string, message: string, reason: DriftReason) => DriftError;
/**
 * Writes one generated file.
 *
 * @category actions
 * @since 0.1.0
 */
export declare const WriteFile: Action.Declared<"smithers-build/write-file", Schema.Struct<{
    readonly path: Schema.NonEmptyString;
    readonly contents: Schema.String;
}>, Schema.Void, typeof WriteFileError, Action.Requirement<"smithers-build/write-file">>;
/**
 * Compares one generated file against its checked-in form.
 *
 * @category actions
 * @since 0.1.0
 */
export declare const CheckFile: Action.Declared<"smithers-build/check-file", Schema.Struct<{
    readonly path: Schema.NonEmptyString;
    readonly contents: Schema.String;
}>, Schema.Void, typeof DriftError, Action.Requirement<"smithers-build/check-file">>;
/**
 * Maximum code units one rendered failure may add to a diagnostic.
 *
 * @category constants
 * @since 0.1.0
 */
export declare const maximumFailureMessageCodeUnits: number;
/**
 * Renders a failure cause as a bounded non-empty message without invoking
 * object getters, proxy traps, or user-defined string conversion.
 *
 * @category rendering
 * @since 0.1.0
 */
export declare const failureMessage: (cause: unknown) => string;
/**
 * Normalizes a generated output into one workspace-relative path.
 *
 * A leading `//` uses the declared-input workspace-root notation. Native
 * absolute paths and parent traversals are refused before an action is
 * planned, so a generator can never be pointed at a file outside the
 * workspace it belongs to.
 *
 * @category validation
 * @since 0.1.0
 */
export declare const resolveOutputPath: (path: string) => string;
/**
 * Hard in-memory ceiling for one generated file.
 *
 * @category constants
 * @since 0.1.0
 */
export declare const maximumGeneratedFileBytes: number;
/**
 * Writes contents to a sibling temp file, then renames it into place.
 *
 * Exported so every generator that renders its own contents publishes them the
 * same way, and so the publication itself stays directly testable.
 *
 * @category effects
 * @since 0.1.0
 */
export declare const writeGeneratedFile: (workspaceRoot: string, payload: FilePayload) => Effect.Effect<void, WriteFileError>;
/**
 * Publishes a generated symlink without traversing symlinked parent directories.
 * The link target is stored as text and is never opened.
 *
 * @category effects
 * @since 1.0.0
 */
export declare const writeGeneratedSymlink: (workspaceRoot: string, payload: {
    readonly path: string;
    readonly target: string;
}) => Effect.Effect<void, WriteFileError>;
/**
 * Checks the link itself after proving its parents; never reads its target.
 *
 * @category effects
 * @since 1.0.0
 */
export declare const checkGeneratedSymlink: (workspaceRoot: string, payload: {
    readonly path: string;
    readonly target: string;
}) => Effect.Effect<void, DriftError>;
/**
 * Fails with {@link DriftError} unless the checked-in file matches.
 *
 * The failure carries a `reason`: `missing` and `drifted` are answered by
 * regenerating the file, `unreadable` never is.
 *
 * @category effects
 * @since 0.1.0
 */
export declare const checkGeneratedFile: (workspaceRoot: string, payload: FilePayload) => Effect.Effect<void, DriftError>;
/**
 * Implements {@link WriteFile} with an atomic write: contents go to a sibling
 * temp file that is renamed over the payload path. Parent directories are
 * created as needed. The payload path resolves against `workspaceRoot`.
 *
 * @category layers
 * @since 0.1.0
 */
export declare const WriteFileLive: (options: {
    readonly workspaceRoot: string;
}) => Layer.Layer<Action.Requirement<"smithers-build/write-file">, never, FlowRuntime.FlowRuntime>;
/**
 * Implements {@link CheckFile} with a read and byte comparison. The payload
 * path resolves against `workspaceRoot`.
 *
 * @category layers
 * @since 0.1.0
 */
export declare const CheckFileLive: (options: {
    readonly workspaceRoot: string;
}) => Layer.Layer<Action.Requirement<"smithers-build/check-file">, never, FlowRuntime.FlowRuntime>;
/**
 * What executing a generated-file node may require: the write or the check
 * implementation.
 *
 * @category models
 * @since 0.1.0
 */
export type FileRequirement = Action.Requirement<"smithers-build/write-file"> | Action.Requirement<"smithers-build/check-file">;
/**
 * Plans one generated file: {@link WriteFile} in `write` mode,
 * {@link CheckFile} in `check` mode.
 *
 * @category constructors
 * @since 0.1.0
 */
export declare const generateFile: (mode: Mode, payload: FilePayload) => Node.Node<void, WriteFileError | DriftError, FileRequirement>;
export {};
