import type { ArchiveImage, DockerTool } from "./DockerExec.vibe";
import * as HostProbes from "./internal/HostProbes.vibe";
/** `Buffer.from(text).toString("base64url")`, for DockerExec.vibe's stamp encoding. */
export declare const base64url: (text: string) => string;
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
export declare const digestPattern: RegExp;
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
 * Creates output parents before Docker writes its OCI tar.
 *
 * @category execution
 * @since 0.1.0
 */
export declare const prepareOutputs: (root: string, outDirs: ReadonlyArray<string>) => Promise<void>;
