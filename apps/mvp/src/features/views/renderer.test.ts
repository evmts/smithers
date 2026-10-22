// The renderer's component list (src/features/views/renderer.ts) is `@smthrs/ui`'s presentation subset: the engine
// worker that teaches the renderer loads no UI library, so the list is the app's, held to the package's here.
import { presentationComponentNames } from "@smthrs/ui"
import { expect, test } from "vitest"
import { PRESENTATION_COMPONENTS } from "./renderer"

test("names exactly the components ChatApi's realm resolves", () => {
  expect([...PRESENTATION_COMPONENTS].sort()).toEqual([...presentationComponentNames].sort())
})
