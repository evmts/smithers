import { Context, Data, Effect, Layer } from "effect"

// The system clipboard, a host capability: main.tsx gives the browser's (`navigator.clipboard.writeText`), a test its
// own. Copy permalink writes through it.

/** The clipboard refused the write, for example without the page's focus or permission. */
export class ClipboardRefused extends Data.TaggedError("ClipboardRefused") {}

export class Clipboard extends Context.Service<
  Clipboard,
  { readonly write: (text: string) => Effect.Effect<void, ClipboardRefused> }
>()("@smthrs/mvp/repo/Clipboard") {
  /** The clipboard `writeText` writes to: `(text) => navigator.clipboard.writeText(text)` in the browser. */
  static readonly layer = (writeText: (text: string) => Promise<void>) =>
    Layer.succeed(
      Clipboard,
      Clipboard.of({
        write: (text) => Effect.tryPromise({ try: () => writeText(text), catch: () => new ClipboardRefused() }),
      }),
    )
}
