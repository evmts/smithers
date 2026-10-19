/**
 * The executor's half of the factory projection: registry discovery over the
 * flows directory, joined with the factory's `Smithers.Flow` declarations and
 * written or checked as `.smithers/factory.json`, beside the home pane the
 * same declaration file exports, written or checked as `.smithers/home.json`.
 *
 * The rendering rules live in `@smthrs/targets/Factory` and
 * `@smthrs/targets/FlowCatalog`, which own the projection shape and the row
 * ordering. This module only supplies what a pure module cannot: the
 * discovery walk, which is the same code path `smthrs ls` runs, so the
 * projection can never list a flow the CLI would not, and the publication
 * of the two files.
 *
 * @since 1.0.0
 */
import type { Action, FlowRuntime } from "@smthrs/flow";
import * as Factory from "@smthrs/targets/Factory";
import * as FlowCatalog from "@smthrs/targets/FlowCatalog";
import * as GeneratedFile from "@smthrs/targets/GeneratedFile";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import type * as Layer from "effect/Layer";
import * as Path from "effect/Path";
/**
 * Discovers every flow under one workspace-relative directory, reduced to the
 * fields the projection carries. Paths are workspace-relative and POSIX.
 *
 * @category effects
 * @since 1.0.0
 */
export declare const discoverFlows: (workspaceRoot: string, root: string) => Effect.Effect<ReadonlyArray<FlowCatalog.DiscoveredFlow>, FlowCatalog.FlowCatalogError, FileSystem.FileSystem | Path.Path>;
type ProjectionError = FlowCatalog.FlowCatalogError | Factory.FactoryProjectionError | GeneratedFile.WriteFileError | GeneratedFile.DriftError;
/**
 * Discovers, joins, and writes or checks both projection files.
 *
 * @category effects
 * @since 1.0.0
 */
export declare const renderProjection: (workspaceRoot: string, payload: Factory.Payload) => Effect.Effect<void, ProjectionError, FileSystem.FileSystem | Path.Path>;
/**
 * Implements the projection action over the registry's discovery and the
 * shared generated-file publication.
 *
 * @category layers
 * @since 1.0.0
 */
export declare const FactoryProjectionLive: (options: {
    readonly workspaceRoot: string;
}) => Layer.Layer<Action.Requirement<"smithers-build/factory-projection">, never, FlowRuntime.FlowRuntime | FileSystem.FileSystem | Path.Path>;
export {};
