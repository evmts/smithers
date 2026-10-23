// A flow editor's row belongs to one browser tab. Session storage survives its reload; a Web Lock makes a duplicated
// tab choose a new id instead of writing the first tab's form or code. The lock ends when the page ends.

const KEY = "smithers-flow-editor-tab"
const valid = (id: string | null): id is string => id !== null && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)

export interface EditorTabHost {
  readonly storage: Pick<Storage, "getItem" | "setItem">
  readonly locks: Pick<LockManager, "request"> | undefined
  readonly page: Pick<Window, "addEventListener">
  readonly randomId: () => string
}

/** Claims this page's stable editor id; a second live page with a copied session-storage id receives its own. */
export const claimEditorTabId = async (host: EditorTabHost): Promise<{ readonly id: string; readonly persistent: boolean }> => {
  const reserve = (id: string): Promise<boolean> => {
    const locks = host.locks
    if (locks === undefined) return Promise.resolve(false)
    return new Promise((resolve, reject) => {
      void locks.request(`${KEY}:${id}`, { ifAvailable: true }, (lock) => {
        if (lock === null) {
          resolve(false)
          return
        }
        resolve(true)
        // A page in the back/forward cache can resume with this editor. Keep its claim until it really leaves.
        return new Promise<void>((release) => host.page.addEventListener("pagehide", (event) => {
          if (!event.persisted) release()
        }))
      }).catch(reject)
    })
  }
  let stored: string | null = null
  try { stored = host.storage.getItem(KEY) } catch { /* Session storage may be unavailable. */ }
  if (valid(stored) && await reserve(stored).catch(() => false)) return { id: stored, persistent: true }
  const id = host.randomId()
  const claimed = await reserve(id).catch(() => false)
  if (!claimed) return { id, persistent: false }
  try {
    host.storage.setItem(KEY, id)
    return { id, persistent: host.storage.getItem(KEY) === id }
  } catch {
    // A reload could not reclaim this row. The editor must refuse writes rather than strand a person's work.
    return { id, persistent: false }
  }
}
