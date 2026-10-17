import { GlobalRegistrator } from "@happy-dom/global-registrator"
import { mock } from "bun:test"

GlobalRegistrator.register()
const calls: string[] = []
const initialUrl = window.location.href
// The live channel follows the identity session on every host (ControllerBootMemo.ts followSignIn).
// Recovery reads no identity, so the session never answers and the channel stays closed.
const fakeStore = {
  savedStoreUnavailable: true,
  dispose: async () => { calls.push("store.dispose") },
  collections: { identitySessions: { get: () => undefined, subscribeChanges: () => ({ unsubscribe: () => {} }) } }
}
const fakeController = {
  dispose: async () => { calls.push("controller.dispose") },
  adoptSession: async () => { calls.push("identity.adopt") },
  loadSession: async () => { calls.push("identity.load") },
  runCommand: () => { calls.push("command.run") },
  handleInstallReturn: () => { calls.push("install.return"); return false },
  handleAuthReturn: () => { calls.push("auth.return"); return false }
}
const fetchImpl = async () => Response.json({})
mock.module("./runtime/ApplicationTransport", () => ({
  loadRuntimeApplicationClient: async () => ({ fetch: fetchImpl, baseUrl: "https://smithers.sh", target: { kind: "hosted" } })
}))
mock.module("./runtime/Runtime", () => ({
  warmBootstrap: () => Promise.resolve({ host: "cloud", capabilities: ["identity"] }),
  createRuntime: () => ({ backend: { agent: {} }, http: fetchImpl, shell: { kind: "web" }, bootstrap: { host: "cloud", capabilities: ["identity"] } }),
  unavailableAgent: () => ({}),
  BootstrapFailure: class BootstrapFailure extends Error {}
}))
mock.module("./state/AppStore", () => ({ createAppStore: async () => fakeStore }))
mock.module("./state/AppController", () => ({ createAppController: () => fakeController }))
// Each door this fixture records keeps the rest of its module real. A double
// that lists only the doors it watches breaks the child with a missing-export
// SyntaxError as soon as the module graph imports another of its exports, and
// a re-listed constant is a second copy to keep in step: FrameHistory gained
// ROOT_APP_PATH (#3861), and RepoLink.pathRepo is read through FrameHistory.
const repoLink = await import("./RepoLink")
mock.module("./RepoLink", () => ({
  ...repoLink,
  requestedTarget: () => ({ repo: "roninjin10/smithers", subject: { kind: "pull", number: 2, tab: "files" } }),
  beginRepositoryEntry: () => { calls.push("repository.entry"); return "entry" },
  openRequestedRepo: async () => { calls.push("repository.open") },
  withoutRepoParam: () => "/roninjin10/smithers"
}))
/* A subject in the URL is URL-triggered work too: a temporary empty store opens none of it. */
const subjectEntry = await import("./RepositorySubjectEntry")
mock.module("./RepositorySubjectEntry", () => ({
  ...subjectEntry,
  openRequestedSubject: async () => { calls.push("repository.subject") }
}))
const frameHistory = await import("./runtime/FrameHistory")
mock.module("./runtime/FrameHistory", () => ({ ...frameHistory, createBrowserFrameHistory: () => ({}) }))
mock.module("./runtime/TurnErasure", () => ({ createTurnEraser: () => async () => {} }))
const { runControllerBoot } = await import("./ControllerBoot.client")
const controller = await runControllerBoot()
if ((controller as unknown) !== fakeController) throw new Error("boot did not return the recovery controller")
if (calls.length !== 0) throw new Error(`boot started actions: ${calls.join(",")}`)
if (window.location.href !== initialUrl) throw new Error("boot changed the recovery URL")
console.log("recovery boot stopped before repository, identity, or URL actions")
process.exit(0)
