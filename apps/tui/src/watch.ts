/** Filesystem notifications invalidate the authoritative, metadata-only flow registry. */
import { maximumTraversalDepth } from "@smthrs/registry/Discovery"
import { type FSWatcher, watch } from "chokidar"
import { lstatSync, readlinkSync, realpathSync, type Stats } from "node:fs"
import { realpath } from "node:fs/promises"
import { dirname, join, normalize, resolve, sep } from "node:path"
import * as Log from "./log.js"

export interface Watcher {
  readonly dispose: () => void
}

export const debounceMs = 300

/** Reconcile after setup, then debounce changes under `<cwd>/flows`, including its creation. */
export const flows = (cwd: string, refresh: () => void, debounce = debounceMs): Watcher => {
  let timer: ReturnType<typeof setTimeout> | undefined
  let watcher: FSWatcher | undefined
  let closed = false
  const changed = () => {
    if (closed) return
    if (timer !== undefined) clearTimeout(timer)
    timer = setTimeout(() => {
      timer = undefined
      if (!closed) refresh()
    }, debounce)
  }
  void realpath(cwd).then((root) => {
    if (closed) return
    const directory = join(root, "flows")
    const scoped = (path: string) => path === directory || path.startsWith(directory + sep)
    // A disappeared symlink target does not change its logical parent. Keep
    // that target's parent subscribed through this same watcher for recovery.
    // These are filesystem subscriptions, never flow descriptors or contents.
    const links = new Map<string, ReadonlyArray<string>>()
    const anchors = new Set<string>()
    const anchored = (path: string) => {
      for (const parents of links.values()) {
        if (parents.some((parent) => path === parent || parent.startsWith(path + sep))) return true
      }
      return false
    }
    const reconcile = () => {
      if (closed) return
      for (const parent of anchors) {
        if (anchored(parent)) continue
        anchors.delete(parent)
        // unwatch also installs a recursive ignore. Clear that rule with add;
        // our predicate rejects the retired path, while future nested targets
        // remain eligible for their own subscription.
        watcher?.unwatch(parent).add(parent)
      }
      for (const parents of links.values()) {
        for (const parent of parents) {
          if (parent === root || scoped(parent) || anchors.has(parent)) continue
          anchors.add(parent)
          watcher?.add(parent)
        }
      }
    }
    const remember = (path: string, stats?: Stats) => {
      try {
        if (!(stats ?? lstatSync(path)).isSymbolicLink()) return
        const parents = new Set<string>()
        const visited = new Set<string>()
        let link = path
        for (let depth = 0; depth <= maximumTraversalDepth; depth++) {
          const target = resolve(realpathSync(dirname(link)), readlinkSync(link))
          parents.add(dirname(target))
          if (visited.has(target)) break
          visited.add(target)
          try {
            if (!lstatSync(target).isSymbolicLink()) break
          } catch (error) {
            if ((error as NodeJS.ErrnoException).code === "ENOENT") break
            throw error
          }
          link = target
        }
        const next = [...parents]
        const previous = links.get(path)
        if (previous?.length === next.length && previous.every((parent, index) => parent === next[index])) return
        links.set(path, next)
        queueMicrotask(reconcile)
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") Log.write("flow.watch", error)
      }
    }
    const forget = (path: string) => {
      const parent = links.get(path)
      if (parent === undefined) return
      try {
        // Target deletion leaves the link intact: retain its recovery anchor.
        if (lstatSync(path).isSymbolicLink()) return
      } catch { /* The link itself disappeared. */ }
      links.delete(path)
      queueMicrotask(reconcile)
    }
    watcher = watch([root, directory], {
      usePolling: true,
      interval: 100,
      binaryInterval: 100,
      followSymlinks: true,
      depth: maximumTraversalDepth + 1,
      ignored: (input, stats) => {
        // Chokidar normalizes matching paths to forward slashes on Windows.
        const path = normalize(input)
        if (scoped(path)) {
          // add(link) gets a fresh library depth budget. Keep cycles bounded
          // relative to the registry root across those recovery scans too.
          if (path.slice(directory.length + 1).split(sep).length > maximumTraversalDepth + 1) return true
          if (stats?.isSymbolicLink()) remember(path, stats)
          return false
        }
        return path !== root && !anchored(path)
      }
    })
    watcher.on("ready", changed)
    watcher.on("all", (event, input) => {
      const path = normalize(input)
      if (event === "unlink" || event === "unlinkDir") forget(path)
      if (scoped(path)) changed()
    })
    watcher.on("raw", (_event, input: string) => {
      const path = normalize(input)
      if (scoped(path)) changed()
      for (const [link, parents] of links) {
        if (!parents.some((parent) => path === parent || parent.startsWith(path + sep))) continue
        remember(link)
        // Chokidar closes a vanished target. Re-adding the logical path lets
        // its normal scan and add events arm any newly available descendants.
        watcher?.add(link)
        changed()
      }
    })
    watcher.on("error", (error) => Log.write("flow.watch", error))
  }, (error: unknown) => Log.write("flow.watch", error))
  return {
    dispose: () => {
      closed = true
      if (timer !== undefined) clearTimeout(timer)
      void watcher?.close().catch((error: unknown) => Log.write("flow.watch.close", error))
      watcher = undefined
    }
  }
}
