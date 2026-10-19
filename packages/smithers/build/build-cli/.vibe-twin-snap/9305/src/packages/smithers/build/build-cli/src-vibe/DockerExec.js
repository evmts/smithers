/**
 * Planning helpers for Docker services, OCI builds, bake targets, and pushes.
 *
 * Every Docker rule needs the same host facts before it can plan: the CLI
 * on PATH, a daemon that answers `docker info`, and a buildx builder that
 * supports the OCI exporter. This module resolves those once per plan
 * invocation through the shared host-probe cache and turns the declarations into argv: `docker create --rm` for supervised
 * services, `buildx build`/`buildx bake` writing an OCI archive into the
 * captured output directory, and an approval-gated `docker push` for the
 * outward effect. A silent daemon is a typed refusal, never a green no-op.
 *
 * @since 0.1.0
 */
import * as Input from "@smthrs/targets/Input";
import * as Stamp from "@smthrs/targets/Stamp";
import * as Schema from "effect/Schema";
import * as Native from "./DockerExec.native.js";
import { digestPattern } from "./DockerExec.native.js";
import * as HostProbes from "./internal/HostProbes.js";
import * as SharedNative from "./native-hatch.js";
/**
 * Resolves Docker and verifies that its daemon answers.
 *
 * `environment` is the environment the plan resolved, already stripped of the
 * workspace's remote-cache credential names. Without it these three probes
 * inherited the whole process environment, so `docker info` and `buildx ls` --
 * and any PATH-resolved impostor of the name -- read credentials every later
 * spawn withholds.
 *
 * `probes` is the invocation's host-probe cache: every Docker target of one
 * plan shares one `--version`, one `info`, and one `buildx ls` under the same
 * resolved path and environment. Without it each call probes afresh.
 *
 * @category planning
 * @since 0.1.0
 */
export const resolveDocker = Native.resolveDocker;
const safeTarget = (target) => target.replaceAll(/[^A-Za-z0-9._-]/g, "-");
/**
 * The package-relative output directory of a Docker build target.
 *
 * @category planning
 * @since 0.1.0
 */
export const outputDir = (rule, packagePath, attrs) => Input.resolvePath(packagePath, rule === "Docker.Bake"
    ? `docker-image-${safeTarget(attrs.target)}`
    : "docker-image");
const scalar = (value) => {
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean")
        return String(value);
    if (typeof value === "object" && value !== null &&
        value._tag === "Stamp" &&
        typeof value.name === "string") {
        return `{smthrs:stamp:${Native.base64url(JSON.stringify({ name: "docker-tag", value }))}}`;
    }
    return undefined;
};
/**
 * Refuses an empty or malformed resolved Docker tag before a push can spawn.
 *
 * @category planning
 * @since 1.0.0
 */
export const pushTagRefusal = (tag) => tag === ""
    ? "Docker.Push requires a non-empty value for every tag"
    // https://github.com/distribution/reference/blob/main/regexp.go
    : /^[A-Za-z0-9_][A-Za-z0-9_.-]{0,127}$/.test(tag)
        ? undefined
        : "Docker.Push tags must contain 1 to 128 ASCII letters, digits, underscores, dots or hyphens and start with a letter, digit or underscore";
/**
 * The archive a `Docker.Build` or `Docker.Bake` writes for its output directory.
 *
 * @category planning
 * @since 1.0.0
 */
export const imageArchive = (outDir) => `${outDir}/image.tar`;
/**
 * Reads the one image a `Docker.Build` or `Docker.Bake` archive holds from its
 * OCI layout. Attestation manifests are not images. An archive holding several
 * platform images is refused: the Docker daemon holds one platform per
 * reference, so pushing through it could publish only part of the build.
 *
 * @category execution
 * @since 1.0.0
 */
export const readImageArchive = Native.readImageArchive;
/**
 * Writes a copy of an OCI-layout archive that `docker load` accepts: the same
 * entries plus the `manifest.json` naming the image's config and layer blobs.
 * Docker's exporter writes this file itself; buildx's OCI exporter does not.
 *
 * @category execution
 * @since 1.0.0
 */
export const writeLoadableArchive = Native.writeLoadableArchive;
/**
 * The image IDs `docker load` reports, in order.
 *
 * @category execution
 * @since 1.0.0
 */
export const loadedImageIds = (stdout) => [...stdout.matchAll(/^Loaded image ID: (\S+)\s*$/gm)].map((match) => match[1]);
/**
 * The manifest digest `docker push` reports for the reference it published.
 *
 * @category execution
 * @since 1.0.0
 */
export const pushedDigest = (stdout) => {
    let digest;
    for (const match of stdout.matchAll(/: digest: (sha256:[0-9a-f]{64}) size: \d+/g))
        digest = match[1];
    return digest;
};
/**
 * The config digest of a raw registry image manifest, or undefined when the
 * document is not a single image manifest.
 *
 * @category execution
 * @since 1.0.0
 */
export const manifestConfig = (raw) => {
    try {
        const digest = JSON.parse(raw)?.config?.digest;
        return typeof digest === "string" && digestPattern.test(digest) ? digest : undefined;
    }
    catch {
        return undefined;
    }
};
/**
 * Plans one non-service Docker target.
 *
 * @category planning
 * @since 0.1.0
 */
export const plan = (options) => resolveDocker(options.environment, options.probes).then((tool) => {
    if (!tool.ok)
        return { outDirs: [], toolchain: tool.identity, refusal: tool.refusal };
    if (options.rule === "Docker.Push") {
        const attrs = options.attrs;
        if (attrs.tags.length === 0) {
            return { outDirs: [], toolchain: tool.identity, refusal: "Docker.Push requires at least one tag" };
        }
        const tags = attrs.tags.map(scalar);
        if (tags.some((tag) => tag === undefined)) {
            return {
                outDirs: [],
                toolchain: tool.identity,
                refusal: "Docker.Push tags must resolve to strings before execution"
            };
        }
        for (const [index, tag] of tags.entries()) {
            // Real stamps are late-bound; their resolved tag is checked at spawn.
            if (Schema.is(Stamp.Value)(attrs.tags[index]))
                continue;
            const refusal = pushTagRefusal(tag);
            if (refusal !== undefined)
                return { outDirs: [], toolchain: tool.identity, refusal };
        }
        const commands = tags.map((tag) => [tool.path, "push", `${attrs.registry}/${attrs.name}:${tag}`]);
        return {
            argv: commands[0],
            commands,
            outDirs: [],
            toolchain: tool.identity
        };
    }
    const outDir = outputDir(options.rule, options.packagePath, options.attrs);
    const destination = imageArchive(outDir);
    if (options.rule === "Docker.Build") {
        const attrs = options.attrs;
        const args = [
            tool.path,
            "buildx",
            "build",
            ...(tool.builder === undefined ? [] : ["--builder", tool.builder]),
            "--file",
            Input.resolvePath(options.packagePath, attrs.dockerfile.path)
        ];
        if ((attrs.platforms?.length ?? 0) > 0)
            args.push("--platform", attrs.platforms.join(","));
        for (const [name, value] of Object.entries(attrs.buildArgs ?? {}).sort(([a], [b]) => a.localeCompare(b))) {
            const rendered = scalar(value);
            if (rendered === undefined) {
                return {
                    outDirs: [outDir],
                    toolchain: tool.identity,
                    refusal: `Docker.Build buildArgs.${name} must resolve to a string before execution`
                };
            }
            args.push("--build-arg", `${name}=${rendered}`);
        }
        args.push("--output", `type=oci,dest=${destination}`, Input.resolvePath(options.packagePath, attrs.context) || ".");
        return { argv: args, outDirs: [outDir], toolchain: tool.identity };
    }
    const attrs = options.attrs;
    return {
        argv: [
            tool.path,
            "buildx",
            "bake",
            ...(tool.builder === undefined ? [] : ["--builder", tool.builder]),
            "--file",
            Input.resolvePath(options.packagePath, attrs.config.path),
            "--set",
            `${attrs.target}.output=type=oci,dest=${destination}`,
            attrs.target
        ],
        outDirs: [outDir],
        toolchain: tool.identity
    };
});
/**
 * Creates output parents before Docker writes its OCI tar.
 *
 * @category execution
 * @since 0.1.0
 */
export const prepareOutputs = Native.prepareOutputs;
/**
 * Stable container name prefix within one invocation, target and directory.
 * The supervisor appends a fresh nonce for each shared resource lifetime and
 * captures its container ID. Consumers of the live resource share that ID.
 *
 * @category planning
 * @since 0.1.0
 */
export const containerName = (label, cwd, invocationId) => `smthrs-${SharedNative.hash("sha256").update(JSON.stringify([SharedNative.resolve(cwd), label, invocationId])).digest("hex").slice(0, 32)}`;
/**
 * Resolves one Docker service declaration into the supervisor's process spec.
 *
 * @category planning
 * @since 0.1.0
 */
export const serviceSpec = (options) => resolveDocker(options.environment, options.probes).then((tool) => {
    if (!tool.ok)
        return { error: tool.refusal };
    const attrs = options.attrs;
    // Creation options stay canonical across consumers. The supervisor supplies
    // the unique name only when the refcounted resource is actually created.
    const argv = [tool.path];
    for (const [container, host] of Object.entries(attrs.ports ?? {}).sort(([a], [b]) => a.localeCompare(b))) {
        // Bind loopback explicitly. An unqualified `-p host:container` publishes on
        // 0.0.0.0, which puts a developer fixture or a CI container on the LAN and
        // on anything sharing the CI host's network. The HTTP readiness probe
        // already targets 127.0.0.1, so the port mapping was the one place the
        // local-only posture was not stated.
        argv.push("-p", `127.0.0.1:${host}:${container}`);
    }
    for (const [key, value] of Object.entries(attrs.env ?? {}).sort(([a], [b]) => a.localeCompare(b))) {
        argv.push("-e", `${key}=${value}`);
    }
    for (const [volume, destination] of Object.entries(attrs.volumes ?? {}).sort(([a], [b]) => a.localeCompare(b))) {
        argv.push("-v", `${volume}:${destination}`);
    }
    argv.push(attrs.tag === undefined ? attrs.image : `${attrs.image}:${attrs.tag}`);
    argv.push(...(attrs.command ?? []));
    return {
        key: options.label,
        cwd: options.cwd,
        docker: containerName(options.label, options.cwd, options.invocationId),
        argv: argv,
        readiness: attrs.readiness,
        health: attrs.health,
        stop: attrs.stop,
        init: (attrs.init ?? []).map((command) => [...command])
    };
});
