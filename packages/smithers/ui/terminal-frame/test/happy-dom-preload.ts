// Test-only preload (bunfig.toml `[test] preload`): happy-dom is the DOM before any test file imports React or
// `@smthrs/ui`, whose Radix primitives read `globalThis.document` at module load. Frames never load a page: the
// tests drive the frame's side of the protocol themselves.
import { GlobalRegistrator } from "@happy-dom/global-registrator";

GlobalRegistrator.register();
(globalThis as { happyDOM?: { settings: Record<string, unknown> } }).happyDOM!.settings.disableIframePageLoading = true;
