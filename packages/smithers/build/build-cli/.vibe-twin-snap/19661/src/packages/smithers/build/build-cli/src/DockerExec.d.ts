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
import type * as Docker from "@smthrs/targets/Docker";
import * as HostProbes from "./internal/HostProbes.ts";
import type * as ServiceSupervisor from "./ServiceSupervisor.ts";
/**
 * Resolved docker CLI plus daemon identity.
 *
 * @category models
 * @since 0.1.0
 */
export type DockerTool = {
    readonly ok: true;
    readonly path: string;
    readonly builder: string | undefined;
    readonly identity: unknown;
} | {
    readonly ok: false;
    readonly refusal: string;
    readonly identity: unknown;
};
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
export declare const resolveDocker: (environment?: Readonly<Record<string, string | undefined>> | undefined, probes?: HostProbes.HostProbes) => Promise<DockerTool>;
/**
 * The package-relative output directory of a Docker build target.
 *
 * @category planning
 * @since 0.1.0
 */
export declare const outputDir: (rule: "Docker.Build" | "Docker.Bake", packagePath: string, attrs: unknown) => string;
/**
 * Refuses an empty or malformed resolved Docker tag before a push can spawn.
 *
 * @category planning
 * @since 1.0.0
 */
export declare const pushTagRefusal: (tag: string) => string | undefined;
/**
 * The archive a `Docker.Build` or `Docker.Bake` writes for its output directory.
 *
 * @category planning
 * @since 1.0.0
 */
export declare const imageArchive: (outDir: string) => string;
/**
 * The single image a build archive holds: its manifest and config digests,
 * its layer blobs, and where a synthesized `manifest.json` may be appended.
 *
 * @category models
 * @since 1.0.0
 */
export interface ArchiveImage {
    readonly manifest: string;
    readonly config: string;
    readonly layers: ReadonlyArray<string>;
    /** Whether the archive already carries the `manifest.json` `docker load` reads. */
    readonly loadable: boolean;
    /** Byte offset of the archive's end-of-archive marker. */
    readonly end: number;
}
/**
 * Reads the one image a `Docker.Build` or `Docker.Bake` archive holds from its
 * OCI layout. Attestation manifests are not images. An archive holding several
 * platform images is refused: the Docker daemon holds one platform per
 * reference, so pushing through it could publish only part of the build.
 *
 * @category execution
 * @since 1.0.0
 */
export declare const readImageArchive: (path: string) => Promise<ArchiveImage | {
    readonly error: string;
}>;
/**
 * Writes a copy of an OCI-layout archive that `docker load` accepts: the same
 * entries plus the `manifest.json` naming the image's config and layer blobs.
 * Docker's exporter writes this file itself; buildx's OCI exporter does not.
 *
 * @category execution
 * @since 1.0.0
 */
export declare const writeLoadableArchive: (source: string, destination: string, image: ArchiveImage) => Promise<void>;
/**
 * The image IDs `docker load` reports, in order.
 *
 * @category execution
 * @since 1.0.0
 */
export declare const loadedImageIds: (stdout: string) => ReadonlyArray<string>;
/**
 * The manifest digest `docker push` reports for the reference it published.
 *
 * @category execution
 * @since 1.0.0
 */
export declare const pushedDigest: (stdout: string) => string | undefined;
/**
 * The config digest of a raw registry image manifest, or undefined when the
 * document is not a single image manifest.
 *
 * @category execution
 * @since 1.0.0
 */
export declare const manifestConfig: (raw: string) => string | undefined;
/**
 * Reduced plan fields for a Docker build/bake/push.
 *
 * @category models
 * @since 0.1.0
 */
export interface Plan {
    readonly argv?: ReadonlyArray<string> | undefined;
    readonly commands?: ReadonlyArray<ReadonlyArray<string>> | undefined;
    readonly outDirs: ReadonlyArray<string>;
    readonly toolchain: unknown;
    readonly refusal?: string | undefined;
}
/**
 * Plans one non-service Docker target.
 *
 * @category planning
 * @since 0.1.0
 */
export declare const plan: (options: {
    readonly rule: "Docker.Build" | "Docker.Bake" | "Docker.Push";
    readonly packagePath: string;
    readonly attrs: (typeof Docker.BuildAttrs)["Type"] | (typeof Docker.BakeAttrs)["Type"] | (typeof Docker.PushAttrs)["Type"];
    readonly environment?: Readonly<Record<string, string | undefined>> | undefined;
    readonly probes?: HostProbes.HostProbes | undefined;
}) => Promise<Plan>;
/**
 * Creates output parents before Docker writes its OCI tar.
 *
 * @category execution
 * @since 0.1.0
 */
export declare const prepareOutputs: (root: string, outDirs: ReadonlyArray<string>) => Promise<void>;
/**
 * Stable container name prefix within one invocation, target and directory.
 * The supervisor appends a fresh nonce for each shared resource lifetime and
 * captures its container ID. Consumers of the live resource share that ID.
 *
 * @category planning
 * @since 0.1.0
 */
export declare const containerName: (label: string, cwd: string, invocationId: string) => string;
/**
 * Resolves one Docker service declaration into the supervisor's process spec.
 *
 * @category planning
 * @since 0.1.0
 */
export declare const serviceSpec: (options: {
    readonly invocationId: string;
    readonly label: string;
    readonly cwd: string;
    readonly attrs: (typeof Docker.ServeAttrs)["Type"];
    readonly environment?: Readonly<Record<string, string | undefined>> | undefined;
    readonly probes?: HostProbes.HostProbes | undefined;
}) => Promise<ServiceSupervisor.ServiceSpec | {
    readonly error: string;
}>;
