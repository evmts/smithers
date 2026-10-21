// Test-only preload (bunfig.toml `[test] preload`): happy-dom is the DOM before any test file imports React or
// `@smthrs/ui`, whose Radix primitives read `globalThis.document` at module load.
import { GlobalRegistrator } from "@happy-dom/global-registrator";

GlobalRegistrator.register();
