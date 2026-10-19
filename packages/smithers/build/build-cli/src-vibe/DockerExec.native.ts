// E-4/E-5 and E-7: DockerExec.ts's Promise-returning host operations (the docker probes, the OCI
// archive reader and writer, output preparation) that TypeScript callers and tests await, built
// on node:fs/promises file handles and Buffer. VibeLang keeps async functions and platform calls
// out of .vibe files, so these operations and the private tar helpers they share stay TypeScript,
// verbatim from DockerExec.ts. DockerExec.vibe holds the types and the plain planning logic and
// rebinds these exports. digestPattern is exported only for DockerExec.vibe.
import * as Data from "effect/Data"
import * as Fs from "node:fs/promises"
import * as NodePath from "node:path"
import type { ArchiveImage, DockerTool } from "./DockerExec.vibe"
import * as HostProbes from "./internal/HostProbes.vibe"
import * as PackageTree from "./PackageTree.vibe"

/** `Buffer.from(text).toString("base64url")`, for DockerExec.vibe's stamp encoding. */
export const base64url = (text: string): string => Buffer.from(text).toString("base64url")

/**
 * The first `docker-container` builder `buildx ls` lists whose node lines are
 * not all in `error`. A builder whose every node is unreachable, such as a
 * remote one behind a dead tunnel, fails every build, while omitting
 * `--builder` leaves buildx on the current builder.
 */
const containerBuilder = (listing: string): string | undefined => {
  const lines = listing.split("\n")
  for (const [index, line] of lines.entries()) {
    const name = /^(\S+)\s+docker-container\s*$/.exec(line)?.[1]
    if (name === undefined) continue
    const nodes: Array<string> = []
    for (const next of lines.slice(index + 1)) {
      if (!/^\s/.test(next)) break
      nodes.push(next)
    }
    if (nodes.length > 0 && nodes.every((node) => /\serror\b/.test(node))) continue
    return name.replace(/\*$/, "")
  }
  return undefined
}

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
export const resolveDocker = async (
  environment?: Readonly<Record<string, string | undefined>> | undefined,
  probes: HostProbes.HostProbes = HostProbes.none()
): Promise<DockerTool> => {
  const path = PackageTree.findOnPath("docker", environment)
  if (path === undefined) {
    return {
      ok: false,
      refusal: "host binary \"docker\" is not present on PATH",
      identity: { tag: "Docker", absent: true }
    }
  }
  const probeOptions = environment === undefined ? undefined : { environment }
  const context = HostProbes.environmentKey(environment)
  const probe = (args: ReadonlyArray<string>): Promise<PackageTree.Probe> =>
    probes.once(["docker", path, args, context], () => PackageTree.probeCommand(path, args, probeOptions))
  const version = await probe(["--version"])
  const daemon = await probe(["info", "--format", "{{.ServerVersion}}"])
  const builders = daemon.exitCode === 0 ? await probe(["buildx", "ls"]) : undefined
  const builder = builders === undefined ? undefined : containerBuilder(builders.output)
  const identity = { tag: "Docker", path, version, daemon, builder: builder ?? null }
  return daemon.exitCode === 0
    ? { ok: true, path, builder, identity }
    : {
      ok: false,
      refusal: `docker daemon did not answer "docker info": ${daemon.output.trim() || `exit ${daemon.exitCode}`}`,
      identity
    }
}

export const digestPattern = /^sha256:[0-9a-f]{64}$/

/**
 * A build archive a push cannot read its image from.
 *
 * @category errors
 * @since 1.0.0
 */
class ImageArchiveError extends Data.TaggedError("smithers-build/ImageArchiveError")<{
  readonly message: string
}> {}

interface TarEntry {
  readonly offset: number
  readonly size: number
}

const block = 512

const tarString = (bytes: Buffer, start: number, length: number): string =>
  bytes.subarray(start, start + length).toString("utf8").replace(/\0[\s\S]*$/, "")

/** The value of the last `key` record of a PAX extended header. */
const paxRecord = (records: string, key: string): string | undefined =>
  [...records.matchAll(new RegExp(`^\\d+ ${key}=(.*)$`, "gm"))].at(-1)?.[1]

/**
 * Indexes a tar archive's regular files by normalized path. It reads the
 * ustar layout Go's `archive/tar` (and so BuildKit) writes: names split into
 * prefix and name, and PAX extended headers for longer paths or sizes.
 */
const tarIndex = async (
  handle: Fs.FileHandle
): Promise<{ readonly files: Map<string, TarEntry>; readonly end: number }> => {
  const { size: length } = await handle.stat()
  const files = new Map<string, TarEntry>()
  const header = Buffer.alloc(block)
  let offset = 0
  let pax = ""
  while (offset + block <= length) {
    await handle.read(header, 0, block, offset)
    if (header.every((byte) => byte === 0)) return { files, end: offset }
    const size = Number(paxRecord(pax, "size") ?? Number.parseInt(tarString(header, 124, 12).trim(), 8))
    const data = offset + block
    if (!Number.isSafeInteger(size) || data + size > length) break
    const type = tarString(header, 156, 1)
    if (type === "x") {
      const body = Buffer.alloc(size)
      await handle.read(body, 0, size, data)
      pax = body.toString("utf8")
    } else {
      const prefix = tarString(header, 345, 155)
      const name = paxRecord(pax, "path") ?? `${prefix}${prefix === "" ? "" : "/"}${tarString(header, 0, 100)}`
      pax = ""
      if (type === "0" || type === "") files.set(name.replace(/^(\.\/)+/, ""), { offset: data, size })
    }
    offset = data + Math.ceil(size / block) * block
  }
  throw new ImageArchiveError({ message: "the image archive is not a complete tar archive" })
}

const readEntry = async (handle: Fs.FileHandle, entry: TarEntry): Promise<Buffer> => {
  const body = Buffer.alloc(entry.size)
  await handle.read(body, 0, entry.size, entry.offset)
  return body
}

const indexTypes = new Set([
  "application/vnd.oci.image.index.v1+json",
  "application/vnd.docker.distribution.manifest.list.v2+json"
])

const manifestTypes = new Set([
  "application/vnd.oci.image.manifest.v1+json",
  "application/vnd.docker.distribution.manifest.v2+json"
])

/** BuildKit marks attestation manifests, which are not images, with this annotation. */
const referenceType = "vnd.docker.reference.type"

interface Descriptor {
  readonly mediaType?: unknown
  readonly digest?: unknown
  readonly annotations?: Readonly<Record<string, unknown>> | undefined
}

const descriptors = (document: unknown): ReadonlyArray<Descriptor> => {
  const manifests = (document as { readonly manifests?: unknown } | null)?.manifests
  return Array.isArray(manifests) ? manifests as ReadonlyArray<Descriptor> : []
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
export const readImageArchive = async (path: string): Promise<ArchiveImage | { readonly error: string }> => {
  const handle = await Fs.open(path, "r")
  try {
    const { files, end } = await tarIndex(handle)
    const json = async (name: string): Promise<unknown> => {
      const entry = files.get(name)
      if (entry === undefined) throw new ImageArchiveError({ message: `the image archive has no ${name}` })
      return JSON.parse((await readEntry(handle, entry)).toString("utf8"))
    }
    const blob = (digest: string) => `blobs/sha256/${digest.slice("sha256:".length)}`
    const images: Array<string> = []
    const visit = async (list: ReadonlyArray<Descriptor>): Promise<void> => {
      for (const descriptor of list) {
        const digest = descriptor.digest
        if (typeof digest !== "string" || !digestPattern.test(digest)) {
          throw new ImageArchiveError({ message: "the image archive has a malformed digest" })
        }
        const mediaType = String(descriptor.mediaType)
        // Content addressing rules out cycles: an index cannot name its own digest.
        if (indexTypes.has(mediaType)) await visit(descriptors(await json(blob(digest))))
        else if (manifestTypes.has(mediaType) && descriptor.annotations?.[referenceType] === undefined) {
          if (!images.includes(digest)) images.push(digest)
        }
      }
    }
    await visit(descriptors(await json("index.json")))
    if (images.length !== 1) {
      return {
        error: images.length === 0
          ? "the image archive holds no image"
          : `Docker.Push publishes one platform image, but the build archive holds ${images.length}`
      }
    }
    const manifest = await json(blob(images[0]!)) as {
      readonly config?: { readonly digest?: unknown }
      readonly layers?: ReadonlyArray<{ readonly digest?: unknown }>
    }
    const config = manifest.config?.digest
    const layers = (manifest.layers ?? []).map((layer) => layer.digest)
    const digests = [config, ...layers]
    if (!digests.every((digest): digest is string => typeof digest === "string" && digestPattern.test(digest))) {
      return { error: "the image manifest has a malformed digest" }
    }
    const missing = digests.find((digest) => !files.has(blob(digest)))
    if (missing !== undefined) return { error: `the image archive has no blob ${missing}` }
    return {
      manifest: images[0]!,
      config: config as string,
      layers: layers as ReadonlyArray<string>,
      loadable: files.has("manifest.json"),
      end
    }
  } catch (error) {
    return { error: (error as Error).message }
  } finally {
    await handle.close()
  }
}

const tarHeader = (name: string, size: number): Buffer => {
  const header = Buffer.alloc(block)
  header.write(name, 0, 100, "utf8")
  header.write("0000444\0", 100, "ascii")
  header.write("0000000\0", 108, "ascii")
  header.write("0000000\0", 116, "ascii")
  header.write(`${size.toString(8).padStart(11, "0")}\0`, 124, "ascii")
  header.write("00000000000\0", 136, "ascii")
  header.write("        ", 148, "ascii")
  header.write("0", 156, "ascii")
  header.write("ustar\u000000", 257, "ascii")
  let sum = 0
  for (const byte of header) sum += byte
  header.write(`${sum.toString(8).padStart(6, "0")}\0 `, 148, "ascii")
  return header
}

/**
 * Writes a copy of an OCI-layout archive that `docker load` accepts: the same
 * entries plus the `manifest.json` naming the image's config and layer blobs.
 * Docker's exporter writes this file itself; buildx's OCI exporter does not.
 *
 * @category execution
 * @since 1.0.0
 */
export const writeLoadableArchive = async (source: string, destination: string, image: ArchiveImage): Promise<void> => {
  const blob = (digest: string) => `blobs/sha256/${digest.slice("sha256:".length)}`
  const manifest = Buffer.from(
    JSON.stringify([{ Config: blob(image.config), RepoTags: null, Layers: image.layers.map(blob) }]),
    "utf8"
  )
  await Fs.copyFile(source, destination)
  const handle = await Fs.open(destination, "r+")
  try {
    const padded = Math.ceil(manifest.length / block) * block
    const tail = Buffer.alloc(block + padded + 2 * block)
    tarHeader("manifest.json", manifest.length).copy(tail, 0)
    manifest.copy(tail, block)
    await handle.write(tail, 0, tail.length, image.end)
    await handle.truncate(image.end + tail.length)
  } finally {
    await handle.close()
  }
}

/**
 * Creates output parents before Docker writes its OCI tar.
 *
 * @category execution
 * @since 0.1.0
 */
export const prepareOutputs = async (root: string, outDirs: ReadonlyArray<string>): Promise<void> => {
  for (const outDir of outDirs) await Fs.mkdir(NodePath.join(root, ...outDir.split("/")), { recursive: true })
}
