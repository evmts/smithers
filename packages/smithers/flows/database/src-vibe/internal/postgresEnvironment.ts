// E-7/EK4402: process.env, node:crypto and node:path are platform APIs, which VibeLang
// code does not call directly; `PostgresSelection.location` reads them through these.
import { createHash } from "node:crypto"
import { basename, resolve } from "node:path"

export const environment = (name: string): string | undefined => process.env[name]

export const fileName = (filename: string): string => basename(filename)

export const pathDigest = (filename: string): string => createHash("sha256").update(resolve(filename)).digest("hex")
