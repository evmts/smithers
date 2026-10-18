import { expect, test } from "bun:test"
import { readFilePage } from "./FilesSeam"

test("page read keeps the full file and requests the selected ref", async () => {
 const content = "λ".repeat(150*1024)
 let requested = ""
 const page = await readFilePage({baseUrl:"https://example.test",http:async (url) => {
  requested = String(url)
  return Response.json({type:"file",content,size:300*1024,encoding:"utf-8",commit_sha:"a".repeat(40),raw_url:"/api/repos/a/b/contents/x?raw=1"})
 }}, "a/b", "src/x.ts", "feature/x")
 expect(page.content).toBe(content)
 expect(requested).toBe("https://example.test/api/repos/a/b/contents/src/x.ts?ref=feature%2Fx")
})


test("rejected reads retain a typed failure and never fetch invalid paths", async () => {
 let calls = 0
 const ctx = { baseUrl: "", http: async () => { calls++; return new Response(null, { status: 403 }) } }
 await expect(readFilePage(ctx, "owner/repo", "../private")).rejects.toMatchObject({ _tag: "RepositoryFileReadFailed" })
 expect(calls).toBe(0)
 for (const status of [403, 404, 500]) {
  await expect(readFilePage({ ...ctx, http: async () => new Response(null, { status }) }, "owner/repo", "src/file.ts")).rejects.toMatchObject({ _tag: "RepositoryFileReadFailed", status })
 }
})
