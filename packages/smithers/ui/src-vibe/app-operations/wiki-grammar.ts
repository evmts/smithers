// C-1: JSON.parse throws native defects which a plain VibeLang catch bypasses.
export const wikiGrammar = (args?: string) => { if (!args?.trim()) return { payload: {} }; try { return { payload: JSON.parse(args) } } catch { return { error: "Enter a JSON object" } } }
