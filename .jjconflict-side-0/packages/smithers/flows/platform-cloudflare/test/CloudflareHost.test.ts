import { describe, expect, it } from "@effect/vitest"
import { OwnerIdentity } from "@smthrs/engine-store"
import * as Jj from "@smthrs/jj"
import * as Effect from "effect/Effect"
import * as FileSystem from "effect/FileSystem"
import * as HttpClient from "effect/http/HttpClient"
import * as Path from "effect/Path"
import type * as PlatformError from "effect/PlatformError"
import * as ChildProcess from "effect/process/ChildProcess"
import { ChildProcessSpawner } from "effect/process/ChildProcessSpawner"
import * as Stream from "effect/Stream"
import { createServer } from "node:http"
import type { AddressInfo } from "node:net"
import { CloudflareHost } from "../src/index.ts"

describe("the host's OwnerIdentity", () => {
  const mint = Effect.gen(function*() {
    return yield* (yield* OwnerIdentity.OwnerIdentity).ownerId("object-1")
  }).pipe(Effect.provide(CloudflareHost.layer))

  it.effect("two incarnations in one process get different incarnation numbers, unlike by process id", () =>
    Effect.gen(function*() {
      const a = yield* mint
      const b = yield* mint
      expect(a.hostId).toBe("object-1")
      expect(a.pid).not.toBe(process.pid)
      expect(a.pid).not.toBe(b.pid)
      expect(a.nonce).not.toBe(b.nonce)
    }))
})

describe("layer", () => {
  const refusal = (error: PlatformError.PlatformError) => ({ tag: error.reason._tag, message: error.message })

  it.effect("every filesystem operation refuses with PermissionDenied, exists included", () =>
    Effect.gen(function*() {
      const fs = yield* FileSystem.FileSystem
      const calls: ReadonlyArray<readonly [string, Effect.Effect<unknown, PlatformError.PlatformError, any>]> = [
        ["access", fs.access("/a")],
        ["chmod", fs.chmod("/a", 0o644)],
        ["chown", fs.chown("/a", 1, 1)],
        ["copy", fs.copy("/a", "/b")],
        ["copyFile", fs.copyFile("/a", "/b")],
        ["exists", fs.exists("/a")],
        ["glob", fs.glob("*")],
        ["link", fs.link("/a", "/b")],
        ["makeDirectory", fs.makeDirectory("/a")],
        ["makeTempDirectory", fs.makeTempDirectory()],
        ["makeTempDirectoryScoped", Effect.scoped(fs.makeTempDirectoryScoped())],
        ["makeTempFile", fs.makeTempFile()],
        ["makeTempFileScoped", Effect.scoped(fs.makeTempFileScoped())],
        ["open", Effect.scoped(fs.open("/a"))],
        ["readDirectory", fs.readDirectory("/a")],
        ["readFile", fs.readFile("/a")],
        ["readFileString", fs.readFileString("/a")],
        ["readLink", fs.readLink("/a")],
        ["realPath", fs.realPath("/a")],
        ["remove", fs.remove("/a")],
        ["rename", fs.rename("/a", "/b")],
        ["sink", Stream.run(Stream.make(new Uint8Array(1)), fs.sink("/a"))],
        ["stat", fs.stat("/a")],
        ["stream", Stream.runDrain(fs.stream("/a"))],
        ["symlink", fs.symlink("/a", "/b")],
        ["truncate", fs.truncate("/a")],
        ["utimes", fs.utimes("/a", 0, 0)],
        ["watch", Stream.runDrain(fs.watch("/a"))],
        ["writeFile", fs.writeFile("/a", new Uint8Array(1))],
        ["writeFileString", fs.writeFileString("/a", "x")]
      ]
      for (const [method, call] of calls) {
        expect(refusal(yield* Effect.flip(call))).toEqual({
          tag: "PermissionDenied",
          message: `PermissionDenied: FileSystem.${method}: not_installed: a Cloudflare Worker has no filesystem`
        })
      }
    }).pipe(Effect.provide(CloudflareHost.layer)))

  it.effect("a spawn refuses with NotFound, the tag a missing program gets on Node", () =>
    Effect.gen(function*() {
      const spawner = yield* ChildProcessSpawner
      const refused = yield* Effect.flip(spawner.string(ChildProcess.make("echo", ["hi"])))
      expect(refusal(refused)).toEqual({
        tag: "NotFound",
        message: "NotFound: ChildProcess.spawn: not_installed: a Cloudflare Worker cannot start a process"
      })
    }).pipe(Effect.provide(CloudflareHost.layer)))

  it.effect("jj refuses with not_installed and Path is POSIX", () =>
    Effect.gen(function*() {
      const jj = yield* Jj.Jj
      expect((yield* Effect.flip(jj.snapshot("m"))).code).toBe("not_installed")
      expect((yield* Path.Path).join("/a", "b", "../c")).toBe("/a/c")
    }).pipe(Effect.provide(CloudflareHost.layer)))

  it.live("HttpClient returns a redirect instead of following it", () =>
    Effect.gen(function*() {
      const followed: Array<string> = []
      const server = createServer((request, response) => {
        followed.push(request.url ?? "")
        if (request.url === "/from") response.writeHead(302, { location: "/to" }).end()
        else response.writeHead(200).end("followed")
      })
      yield* Effect.acquireRelease(
        Effect.callback<void>((resume) => {
          server.listen(0, "127.0.0.1", () => resume(Effect.void))
        }),
        () => Effect.sync(() => server.close())
      )
      const { port } = server.address() as AddressInfo
      const response = yield* (yield* HttpClient.HttpClient).get(`http://127.0.0.1:${port}/from`)
      expect(response.status).toBe(302)
      expect(response.headers.location).toBe("/to")
      expect(followed).toEqual(["/from"])
    }).pipe(Effect.provide(CloudflareHost.layer), Effect.scoped))
})
