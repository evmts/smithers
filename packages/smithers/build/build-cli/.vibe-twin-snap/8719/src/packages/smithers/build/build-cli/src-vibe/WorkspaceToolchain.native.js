// A-2/E-4 (D38) and E-7: `resolve` is an async boundary that reads manifests through SafeFs
// and node:path, so its body stays TypeScript, unchanged from WorkspaceToolchain.ts. The plain
// helpers it shares with `of` stay in WorkspaceToolchain.vibe and arrive as arguments.
import * as Input from "@smthrs/targets/Input";
import * as PackageManager from "@smthrs/targets/PackageManager";
import * as Runtime from "@smthrs/targets/Runtime";
import * as SafeFs from "@smthrs/targets/SafeFs";
import * as NodePath from "node:path";
/** `resolve`, unchanged. */
export const resolve = async (workspace, options, { isRecord, managerOf, requirement, runtimeOf }) => {
    options.signal?.throwIfAborted();
    const manifests = new Map();
    const readManifest = async (file) => {
        const path = Input.resolvePath("", file.path);
        const previous = manifests.get(path);
        if (previous !== undefined)
            return previous.contents;
        const text = await SafeFs.readText(NodePath.join(options.root, path), {
            root: options.root,
            signal: options.signal,
            limit: 1024 * 1024,
            what: "workspace toolchain manifest"
        });
        if (text === undefined)
            throw new Error(`workspace toolchain manifest is missing: ${path}`);
        let contents;
        try {
            contents = JSON.parse(text);
        }
        catch {
            throw new Error(`workspace toolchain manifest is not valid JSON: ${path}`);
        }
        if (!isRecord(contents))
            throw new Error(`workspace toolchain manifest must be a JSON object: ${path}`);
        manifests.set(path, { contents, digest: Input.digestText(text) });
        return contents;
    };
    let runtime = runtimeOf(workspace.runtime);
    if (Runtime.isNodeDeclaration(workspace.runtime) && workspace.runtime.manifest !== undefined) {
        const manifest = await readManifest(workspace.runtime.manifest);
        const engines = manifest["engines"];
        runtime = Runtime.ResolvedNodeRuntime.make({
            name: "node",
            version: requirement(isRecord(engines) ? engines["node"] : undefined, "manifest engines.node"),
            executable: "node"
        });
    }
    let packageManager = managerOf(workspace, runtime);
    if (PackageManager.isPnpmDeclaration(workspace.packageManager)) {
        const declared = workspace.packageManager;
        const manifest = await readManifest(declared.manifest);
        const pin = manifest["packageManager"];
        const manifestVersion = typeof pin === "string" && pin.startsWith("pnpm@") ? pin.slice(5) : undefined;
        if (declared.version === undefined && manifestVersion === undefined) {
            throw new Error("workspace toolchain manifest packageManager must declare pnpm@<version>");
        }
        const version = requirement(declared.version ?? manifestVersion, "pnpm version");
        if (runtime !== undefined) {
            packageManager = PackageManager.ResolvedPnpmPackageManager.make({
                name: "pnpm",
                version,
                executable: "pnpm",
                runtime
            });
        }
    }
    options.signal?.throwIfAborted();
    const manifestDigests = Object.freeze([...manifests].sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0).map(([path, manifest]) => Object.freeze({ path, digest: manifest.digest })));
    return Object.freeze({ runtime, packageManager, manifestDigests });
};
