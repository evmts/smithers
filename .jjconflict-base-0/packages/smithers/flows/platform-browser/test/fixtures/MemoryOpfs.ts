/**
 * An origin private file system held in memory, for Node, where
 * `navigator.storage` does not exist.
 *
 * wa-sqlite's access-handle pool reads `navigator.storage.getDirectory()`
 * itself, so this is installed there for the suites that open
 * `BrowserSqlite.layer` under Node. It keeps the one rule the pool depends
 * on: a file has at most one open synchronous access handle, and a second
 * `createSyncAccessHandle` fails with `NoModificationAllowedError` until the
 * first is closed, as Chromium's does. Real Chromium OPFS is exercised by
 * `test/browser`.
 */

interface Contents {
  bytes: Uint8Array
  held: boolean
}

class SyncAccessHandle {
  private closed = false
  private readonly file: Contents
  constructor(file: Contents) {
    this.file = file
  }

  getSize(): number {
    return this.file.bytes.length
  }

  read(buffer: Uint8Array, { at }: { readonly at: number }): number {
    const view = new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength)
    const chunk = this.file.bytes.subarray(at, at + view.length)
    view.set(chunk)
    return chunk.length
  }

  write(buffer: Uint8Array, { at }: { readonly at: number }): number {
    const view = new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength)
    if (at + view.length > this.file.bytes.length) this.truncate(at + view.length)
    this.file.bytes.set(view, at)
    return view.length
  }

  truncate(size: number): void {
    const bytes = new Uint8Array(size)
    bytes.set(this.file.bytes.subarray(0, size))
    this.file.bytes = bytes
  }

  flush(): void {}

  close(): void {
    if (!this.closed) this.file.held = false
    this.closed = true
  }
}

class FileHandle {
  readonly kind = "file"
  readonly name: string
  private readonly file: Contents
  constructor(name: string, file: Contents) {
    this.name = name
    this.file = file
  }

  async createSyncAccessHandle(): Promise<SyncAccessHandle> {
    if (this.file.held) throw new DOMException("the file is open elsewhere", "NoModificationAllowedError")
    this.file.held = true
    return new SyncAccessHandle(this.file)
  }
}

class DirectoryHandle {
  readonly kind = "directory"
  private readonly directories = new Map<string, DirectoryHandle>()
  private readonly files = new Map<string, Contents>()

  async getDirectoryHandle(name: string, options?: { readonly create?: boolean }): Promise<DirectoryHandle> {
    let directory = this.directories.get(name)
    if (directory === undefined) {
      if (options?.create !== true) throw new DOMException(name, "NotFoundError")
      directory = new DirectoryHandle()
      this.directories.set(name, directory)
    }
    return directory
  }

  async getFileHandle(name: string, options?: { readonly create?: boolean }): Promise<FileHandle> {
    let file = this.files.get(name)
    if (file === undefined) {
      if (options?.create !== true) throw new DOMException(name, "NotFoundError")
      file = { bytes: new Uint8Array(0), held: false }
      this.files.set(name, file)
    }
    return new FileHandle(name, file)
  }

  async removeEntry(name: string): Promise<void> {
    this.files.delete(name)
    this.directories.delete(name)
  }

  async *[Symbol.asyncIterator](): AsyncGenerator<[string, FileHandle | DirectoryHandle]> {
    for (const [name, file] of this.files) yield [name, new FileHandle(name, file)]
    for (const entry of this.directories) yield entry
  }
}

/**
 * Installs a fresh in-memory OPFS as `navigator.storage` and returns the
 * function that removes it.
 */
export const install = (): () => void => {
  const root = new DirectoryHandle()
  Object.defineProperty(navigator, "storage", {
    configurable: true,
    value: { getDirectory: async () => root }
  })
  return () => {
    delete (navigator as { storage?: unknown }).storage
  }
}
