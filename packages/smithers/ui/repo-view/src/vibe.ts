import { registerCustomLanguage, type LanguageRegistration } from "@pierre/diffs";

let registered = false;

/**
 * Maps `.vibe` (and the pre-rename `.effeck`) to VibeLang's TextMate grammar
 * (grammars/README.md). The grammar loads on the first VibeLang file; pierre resolves the loader on the
 * main thread and sends the grammar to its workers, so one registration
 * serves both paths. Idempotent: the code view, its pool and the diff view
 * each call it.
 */
export function registerVibe(): void {
  if (registered) return;
  registered = true;
  registerCustomLanguage("vibe", async () => {
    const { default: grammar } = await import("./grammars/VibeLang.tmLanguage.json");
    return { default: [{ ...grammar, name: "vibe" } as unknown as LanguageRegistration] };
  }, ["vibe", "effeck"]);
}
