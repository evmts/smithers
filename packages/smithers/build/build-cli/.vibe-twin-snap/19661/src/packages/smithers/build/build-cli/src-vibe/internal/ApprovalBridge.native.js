// A-2/E-4 (D38) and E-7: the approval bridge is a local socket server and client. Its
// operations are Promise boundaries over node:net, node:fs and node:crypto, so they stay
// TypeScript, unchanged from ApprovalBridge.ts; ApprovalBridge.vibe keeps the declarations.
import { randomBytes, timingSafeEqual } from "node:crypto";
import * as Fs from "node:fs/promises";
import * as Net from "node:net";
import * as NodeOs from "node:os";
import * as NodePath from "node:path";
import { ApprovalBridgeError, environmentName, serve as served } from "./ApprovalBridge.js";
/** Longest request or answer line either side accepts. */
const lineLimit = 64 * 1024;
/** Reads one newline-terminated line, bounded; resolves undefined when the peer closes first. */
const readLine = (socket) => new Promise((resolve, reject) => {
    let buffered = "";
    const done = (value, error) => {
        socket.off("data", data);
        socket.off("end", end);
        socket.off("error", failed);
        if (error === undefined)
            resolve(value);
        else
            reject(error);
    };
    const data = (chunk) => {
        buffered += chunk.toString("utf8");
        const newline = buffered.indexOf("\n");
        if (newline !== -1)
            done(buffered.slice(0, newline));
        else if (buffered.length > lineLimit) {
            done(undefined, new ApprovalBridgeError({ message: "approval bridge line is too long" }));
        }
    };
    const end = () => done(undefined);
    const failed = (error) => done(undefined, error);
    socket.on("data", data);
    socket.on("end", end);
    socket.on("error", failed);
});
/** `serve`: the socket server. */
export const serve = async (store, isRequest) => {
    if (store === undefined)
        return { environment: {}, close: async () => { } };
    const token = randomBytes(32).toString("hex");
    const expected = Buffer.from(token);
    let directory;
    let path;
    if (process.platform === "win32") {
        path = `\\\\.\\pipe\\smthrs-approvals-${randomBytes(16).toString("hex")}`;
    }
    else {
        // Socket paths are limited to about 100 bytes; a long TMPDIR falls back to /tmp.
        const base = NodeOs.tmpdir().length > 60 ? "/tmp" : NodeOs.tmpdir();
        directory = await Fs.mkdtemp(NodePath.join(base, "smthrs-approvals-"));
        path = NodePath.join(directory, "s");
    }
    const sockets = new Set();
    let closing = false;
    const server = Net.createServer((socket) => {
        if (closing)
            return socket.destroy();
        sockets.add(socket);
        socket.once("close", () => sockets.delete(socket));
        void (async () => {
            let answer;
            try {
                const line = await readLine(socket);
                const message = JSON.parse(line ?? "null");
                const presented = Buffer.from(typeof message?.token === "string" ? message.token : "");
                if (presented.length !== expected.length || !timingSafeEqual(presented, expected)) {
                    answer = { error: "unauthorized" };
                }
                else if (!isRequest(message?.request)) {
                    answer = { error: "malformed request" };
                }
                else {
                    const { root, label, digest } = message.request;
                    answer = { granted: (await store.granted({ root, label, digest })) === true };
                }
            }
            catch (cause) {
                answer = { error: cause instanceof Error ? cause.message : String(cause) };
            }
            // Drain anything further so the peer's close is seen and the socket ends.
            socket.resume();
            socket.end(`${JSON.stringify(answer)}\n`);
        })();
    });
    await new Promise((resolve, reject) => {
        server.once("error", reject);
        server.listen(path, () => {
            server.off("error", reject);
            resolve();
        });
    });
    return {
        environment: { [environmentName]: `${token}@${path}` },
        close: async () => {
            closing = true;
            const closed = new Promise((resolve) => server.close(() => resolve()));
            // A child that never finished its question must not hold the parent open.
            for (const socket of sockets)
                socket.destroy();
            await closed;
            if (directory !== undefined)
                await Fs.rm(directory, { recursive: true, force: true });
        }
    };
};
/** `withBridge`, through the module's `serve`. */
export const withBridge = async (store, run) => {
    const bridge = await served(store);
    try {
        return await run(bridge.environment);
    }
    finally {
        await bridge.close();
    }
};
/** `client`'s `granted`: one question to the parent's store. */
export const ask = async (path, token, request) => {
    const socket = Net.createConnection(path);
    try {
        await new Promise((resolve, reject) => {
            socket.once("connect", resolve);
            socket.once("error", reject);
        });
        socket.write(`${JSON.stringify({ token, request })}\n`);
        const line = await readLine(socket);
        const answer = JSON.parse(line ?? "null");
        if (typeof answer?.granted === "boolean")
            return answer.granted;
        throw new ApprovalBridgeError({
            message: `the parent approval store did not answer: ${String(answer?.error ?? "no answer")}`
        });
    }
    finally {
        socket.destroy();
    }
};
