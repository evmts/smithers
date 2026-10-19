/**
 * E-7/EK4402: `Buffer` and `node:crypto`'s `timingSafeEqual` are platform
 * APIs, which VibeLang code does not call directly. `Proxy.vibe` compares the
 * capability through this, the source's own `sameSecret`.
 */
import { timingSafeEqual } from "node:crypto"

/** @vibelang trusted */
export const sameSecret = (sent: string, expected: string): boolean => {
  const a = Buffer.from(sent)
  const b = Buffer.from(expected)
  return a.length === b.length && timingSafeEqual(a, b)
}
