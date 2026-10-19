// D-10 and A-2 (D38): a plain function that hands an Effect to Effect.runSync is a
// runner boundary. VibeLang lifts a plain function that passes an Effect call as an
// argument (EK2003), so runSync and canonical stay in TypeScript.
import { Canonical } from "@smthrs/canonical"
import type * as Crypto from "effect/Crypto"
import * as Effect from "effect/Effect"
import * as Schema from "effect/Schema"
import { provideSync } from "./Digest.vibe"

const runSync = <A, E>(effect: Effect.Effect<A, E, Crypto.Crypto>): A => Effect.runSync(provideSync(effect))

const decodeCanonical = Schema.decodeUnknownEffect(Canonical)

export const canonicalImpl = (value: unknown): string => runSync(decodeCanonical(value))
