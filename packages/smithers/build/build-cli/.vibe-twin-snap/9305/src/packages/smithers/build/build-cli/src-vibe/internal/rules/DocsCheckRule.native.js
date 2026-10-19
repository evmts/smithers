// A-2/E-4 (D38): the Docs.Check executor is a Promise boundary the scheduler awaits. It runs
// GeneratedFile.writeGeneratedFile with Effect.runPromise and reads the stamp with node:fs
// (E-7), so its body stays TypeScript, unchanged from DocsCheckRule.ts `contract.execute`.
import * as DocsCheck from "@smthrs/targets/DocsCheck";
import * as GeneratedFile from "@smthrs/targets/GeneratedFile";
import * as Input from "@smthrs/targets/Input";
import * as Effect from "effect/Effect";
import * as Fs from "node:fs/promises";
import * as NodePath from "node:path";
import * as Diagnostic from "../../Diagnostic.js";
/** `contract.execute`: writes or judges the planned stamp. */
export const execute = async (node, { root, signal }) => {
    const lane = node.lane;
    const stampPath = NodePath.join(root, ...lane.stamp.split("/"));
    const output = {
        path: lane.output,
        digest: await Input.digestFile(NodePath.join(root, ...lane.output.split("/")), { workspaceRoot: root, signal })
    };
    if (node.mode === "write") {
        if (output.digest === undefined) {
            throw new Error(`${lane.output} is missing, so there is nothing to stamp; regenerate the page first`);
        }
        const stamp = DocsCheck.makeStamp({ producer: lane.producer, output, inputs: lane.files });
        try {
            await Effect.runPromise(GeneratedFile.writeGeneratedFile(root, { path: lane.stamp, contents: DocsCheck.renderStamp(stamp) }));
        }
        catch (cause) {
            throw new Error(`Docs.Check could not write ${lane.stamp}: ${GeneratedFile.failureMessage(cause)}`);
        }
        return { note: `stamped ${lane.stamp} over ${lane.files.length} input file(s)` };
    }
    let stampText;
    try {
        stampText = await Fs.readFile(stampPath, "utf8");
    }
    catch (cause) {
        if (cause.code !== "ENOENT") {
            throw new Error(`Docs.Check could not read ${lane.stamp}: ${Diagnostic.describe(cause)}`);
        }
    }
    const verdict = DocsCheck.judge({
        page: lane.output,
        stampPath: lane.stamp,
        stamp: stampText === undefined ? undefined : DocsCheck.parseStamp(stampText),
        output,
        inputs: lane.files
    });
    if (verdict !== undefined)
        throw new Error(`${verdict.reason}: ${verdict.message}`);
    return { output: { kind: "docs-check", closure: DocsCheck.closureDigest(lane.files) } };
};
