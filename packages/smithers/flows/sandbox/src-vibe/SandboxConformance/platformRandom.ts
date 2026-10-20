/** effectscript-4a verification copy only: Web Crypto's getRandomValues, read outside VibeLang (EK4402). @vibelang trusted */
export const randomValues = (): typeof globalThis.crypto.getRandomValues | undefined => globalThis.crypto?.getRandomValues?.bind(globalThis.crypto)
