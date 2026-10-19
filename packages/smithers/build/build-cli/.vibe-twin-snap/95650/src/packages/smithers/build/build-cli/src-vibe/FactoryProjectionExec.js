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
import * as Effect_1 from "effect/Effect";
import * as runtime from "vibelang-runtime";
import { inputDocument } from "@smthrs/registry/Descriptor";
import * as Discovery from "@smthrs/registry/Discovery";
import * as Factory from "@smthrs/targets/Factory";
import * as FlowCatalog from "@smthrs/targets/FlowCatalog";
import * as GeneratedFile from "@smthrs/targets/GeneratedFile";
import * as Home from "@smthrs/targets/Home";
import * as SafeFs from "@smthrs/targets/SafeFs";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Fs from "node:fs/promises";
import * as NodePath from "node:path";
import { posix } from "./internal/Text.js";
const kindOf = (entryPath) => {
    switch (Native.basename(entryPath)) {
        case "flow.ts":
            return "ts";
        case "flow.mdx":
            return "mdx";
        case "SKILL.md":
            return "skill";
        default:
            return undefined;
    }
};
/**
 * Discovers every flow under one workspace-relative directory, reduced to the
 * fields the projection carries. Paths are workspace-relative and POSIX.
 *
 * @category effects
 * @since 1.0.0
 */
export const discoverFlows = Effect_1.fnUntraced(function* discoverFlows(workspaceRoot, root) { return yield* (Effect_1.fnUntraced(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const absoluteRoot = Native.join(workspaceRoot, ...root.split("/"));
    const scan = yield* (Effect_1.fnUntraced(function* () {
        const completion_1 = yield* runtime.$catch(Effect_1.fnUntraced(function* () {
            return { kind: "return", value: yield* Discovery.make(fs, path).scan({ source: "project", root: absoluteRoot, naming: "path" }) };
        })(), Effect_1.fnUntraced(function* (error) {
            return yield* Effect_1.fail((((cause) => new FlowCatalog.FlowCatalogError({
                message: `could not discover the flows under ${root}: ${cause.message}`
            }))(error)));
        }));
        if (completion_1.kind === "return")
            return completion_1.value;
    }))();
    const flows = [];
    for (const descriptor of scan.entries) {
        const kind = kindOf(descriptor.body.path);
        if (kind === undefined) {
            return (yield* (Effect_1.fnUntraced(function* () {
                return yield* Effect_1.fail((new FlowCatalog.FlowCatalogError({
                    message: `discovery reported ${JSON.stringify(descriptor.name)} from an entry the projection does not know: ${Native.basename(descriptor.body.path)}`
                })));
            }))());
        }
        flows.push({
            id: descriptor.name,
            description: descriptor.description,
            kind,
            path: posix(Native.relative(workspaceRoot, descriptor.body.path)),
            capabilities: descriptor.capabilities,
            flows: descriptor.flows,
            ...(descriptor.budget === undefined ? {} : {
                budget: {
                    ...(descriptor.budget.tokens === undefined ? {} : { tokens: descriptor.budget.tokens }),
                    ...(descriptor.budget.milliseconds === undefined ? {} : { milliseconds: descriptor.budget.milliseconds }),
                    ...(descriptor.budget.usd === undefined ? {} : { usd: descriptor.budget.usd }),
                    ...(descriptor.budget.onExceeded === undefined ? {} : { onExceeded: descriptor.budget.onExceeded })
                }
            }),
            model: Option.getOrNull(descriptor.model),
            modelInvocable: descriptor.modelInvocable,
            ...(inputDocument(descriptor.input) === undefined ? {} : { inputSchema: inputDocument(descriptor.input) })
        });
    }
    return flows;
}))(); });
/** Reports whether a workspace-relative file exists as a regular file. */
const present = Effect_1.fnUntraced(function* present(workspaceRoot, path) { return yield* Effect_1.tryPromise({ try: (async (workspaceRoot, path) => {
        const root = await SafeFs.canonicalRoot(workspaceRoot);
        try {
            return (await Fs.lstat(Native.join(root, ...path.split("/")))).isFile();
        }
        catch {
            return false;
        }
    }).bind(undefined, workspaceRoot, path), catch: (cause) => new Factory.FactoryProjectionError({
        message: `${path} could not be read: ${GeneratedFile.failureMessage(cause)}`
    }) }); });
/**
 * The home pane's publication. A factory that exports no `home` owns no
 * pane: `write` removes a stale file, `check` fails while one is checked in,
 * so the tree never carries a pane the declaration stopped exporting.
 */
const publishHome = Effect_1.fnUntraced(function* publishHome(workspaceRoot, payload) { return yield* (Effect_1.fnUntraced(function* () {
    if (payload.home !== null) {
        const file = { path: payload.homeOutput, contents: Home.render(payload.home) };
        return payload.mode === "write"
            ? yield* GeneratedFile.writeGeneratedFile(workspaceRoot, file) : yield* GeneratedFile.checkGeneratedFile(workspaceRoot, file);
    }
    const exists = yield* present(workspaceRoot, payload.homeOutput);
    if (!exists)
        return;
    if (payload.mode === "write") {
        return yield* Effect_1.tryPromise({ try: (async (workspaceRoot, payload) => {
                const root = await SafeFs.canonicalRoot(workspaceRoot);
                await Fs.rm(Native.join(root, ...payload.homeOutput.split("/")), { force: true });
            }).bind(undefined, workspaceRoot, payload), catch: (cause) => new GeneratedFile.WriteFileError({ path: payload.homeOutput, message: GeneratedFile.failureMessage(cause) }) });
    }
    return (yield* (Effect_1.fnUntraced(function* () {
        return yield* Effect_1.fail((new Factory.FactoryProjectionError({
            message: `${payload.homeOutput} is checked in but FACTORY.ts exports no home; export one or run the projection with --write to remove the file`
        })));
    }))());
}))(); });
/**
 * Discovers, joins, and writes or checks both projection files.
 *
 * @category effects
 * @since 1.0.0
 */
export const renderProjection = Effect_1.fnUntraced(function* renderProjection(workspaceRoot, payload) { return yield* (Effect_1.fnUntraced(function* () {
    const factory = payload.factory;
    if (factory === null) {
        return (yield* (Effect_1.fnUntraced(function* () {
            return yield* Effect_1.fail((new Factory.FactoryProjectionError({
                message: `the workspace declares no factory: create ${Factory.declarationPath} beside WORKSPACE.ts and export const factory = S.Factory({ ... })`
            })));
        }))());
    }
    const discovered = yield* discoverFlows(workspaceRoot, payload.root);
    const contents = yield* Effect_1.try({ try: ((factory, discovered) => Factory.renderProjection(factory, FlowCatalog.rows(discovered, factory.flows))).bind(undefined, factory, discovered), catch: (cause) => cause instanceof FlowCatalog.FlowCatalogError
            ? cause
            : new FlowCatalog.FlowCatalogError({ message: GeneratedFile.failureMessage(cause) }) });
    const file = { path: payload.output, contents };
    payload.mode === "write"
        ? yield* GeneratedFile.writeGeneratedFile(workspaceRoot, file) : yield* GeneratedFile.checkGeneratedFile(workspaceRoot, file);
    yield* publishHome(workspaceRoot, payload);
}))(); });
/**
 * Implements the projection action over the registry's discovery and the
 * shared generated-file publication.
 *
 * @category layers
 * @since 1.0.0
 */
export const FactoryProjectionLive = (options) => Factory.FactoryProjectionAction.toLayer(Effect_1.fnUntraced(function* (payload) { return yield* renderProjection(options.workspaceRoot, payload); }));
import * as Native from "./native-hatch.js";
