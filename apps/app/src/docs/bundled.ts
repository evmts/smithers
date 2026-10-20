/*
 * The docs this build ships: Vite inlines every pages/*.md file as text and
 * emits every images/*.webp screenshot as a hashed asset, handing back its
 * URL, at build time. Bun's test runner has no import.meta.glob, so nothing
 * under test calls this; suites pass the same files from DiskPages.ts through
 * the controller's `docs` service instead.
 */
import { loadDocs, type Docs } from "./Docs"
import { TOC } from "./toc"

let docs: Docs | undefined

export const bundledDocs = (): Docs =>
  docs ??= loadDocs(
    import.meta.glob<string>("./pages/*.md", { query: "?raw", import: "default", eager: true }),
    TOC,
    import.meta.glob<string>("./images/*.webp", { query: "?url", import: "default", eager: true })
  )
