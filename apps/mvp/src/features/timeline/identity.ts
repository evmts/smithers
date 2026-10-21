import { digestSync } from "@smthrs/crypto"

/** Full content identity; the model may receive a bounded excerpt of it. */
export const revisionOf = (row: { readonly id: string; readonly role: string; readonly text: string }) => digestSync(JSON.stringify([1, row.id, row.role, row.text]))
