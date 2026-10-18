import { z } from "zod"
import { RepositoryTabSchema } from "@smthrs/rpc/RepositoryHome"

const file = z.object({ path: z.string(), content: z.string() })
export const DeclaredTabsDataSchema = z.object({
  tabs: z.array(z.object({
    declaration: RepositoryTabSchema,
    files: z.array(file),
    cases: z.array(z.string()),
    navigation: z.array(z.object({ title: z.string(), path: z.string().optional() })).optional(),
    reads: z.record(z.string(), z.object({ state: z.enum(["loading", "loaded", "failed"]), error: z.string().optional() })).optional(),
    error: z.string().optional()
  })),
  error: z.string().optional()
})
export type DeclaredTabsData = z.infer<typeof DeclaredTabsDataSchema>

