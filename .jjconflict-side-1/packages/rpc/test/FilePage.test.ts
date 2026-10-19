import { expect, test } from "vitest"
import { decodeFilePage } from "../src/FileRead.ts"

test("page reads preserve all bytes and binary stays opaque", () => {
 const content = "λ".repeat(150 * 1024)
 const wire = { type: "file", content, size: 300*1024, encoding: "utf-8", commit_sha: "a".repeat(40), raw_url: "/api/repos/a/b/contents/x?raw=1" }
 expect(decodeFilePage(wire).content).toBe(content)
 expect(decodeFilePage({...wire, content: "AAH/", encoding: "base64"}).binary).toBe(true)
 expect(decodeFilePage({...wire, content: "", size: 600*1024, too_large: true}).content).toBeNull()
 expect(() => decodeFilePage({...wire, commit_sha: "main"})).toThrow()
})
