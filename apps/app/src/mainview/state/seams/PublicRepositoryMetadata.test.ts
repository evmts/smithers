import { expect, test } from "bun:test"
import { fetchRepositoryMetadata, readPublicRepositoryMetadata } from "./PublicRepositoryMetadata"
import { readLandingOptions } from "./LandingsSeam"
test("public metadata reads use the repository door", async () => {
 const row={number:1,title:"Issue",state:"open"}
 let requested=""
 const ctx={baseUrl:"https://example.test",http:async(url: RequestInfo | URL)=>{requested=String(url);return Response.json([row])}}
 expect(await readPublicRepositoryMetadata(ctx,"owner/repo","issues")).toEqual([row])
 expect(requested).toBe("https://example.test/api/repos/owner/repo/github/metadata/issues")
 await expect(readPublicRepositoryMetadata(ctx,"owner/repo","issues/../../user")).rejects.toThrow()
})

test("signed-out reads retry only metadata through the public mirror", async () => {
 const urls: string[]=[]
 const ctx={baseUrl:"https://example.test",http:async(url: RequestInfo | URL)=>{urls.push(String(url));return urls.length===1 ? new Response(null,{status:401}) : Response.json([{number:7,title:"Public",state:"open"}])}}
 const response=await fetchRepositoryMetadata(ctx,"https://example.test/api/user/github-repos/o/r/issues?state=all")
 expect(response.status).toBe(200)
 expect(urls).toEqual(["https://example.test/api/user/github-repos/o/r/issues?state=all","https://example.test/api/repos/o/r/github/metadata/issues?state=all"])
})

test("private denials and signed-in successes keep their original response", async () => {
 for (const status of [200,403,404]) {
  const urls: string[]=[]
  const ctx={baseUrl:"",http:async(url: RequestInfo | URL)=>{urls.push(String(url));return new Response(null,{status})}}
  expect((await fetchRepositoryMetadata(ctx,"/api/user/github-repos/o/r/issues")).status).toBe(status)
  expect(urls).toHaveLength(1)
 }
})

test("public detail reads preserve pull fields", async () => {
 const row={number:7,title:"Pull",state:"closed",merged:true}
 const ctx={baseUrl:"",http:async()=>Response.json(row)}
 expect(await readPublicRepositoryMetadata(ctx,"local/repo","pulls/7")).toEqual(row)
})

test("public pull choices follow the imported local repository permission", async () => {
 const calls: string[]=[]
 const ctx={baseUrl:"",http:async(url: RequestInfo | URL)=>{
  calls.push(String(url))
  if (String(url)==="/api/repos/local/mirror") return Response.json({full_name:"local/mirror",is_public:true,github_source:{owner:"upstream",repo:"source"}})
  if (String(url)==="/api/repos/local/mirror/github/metadata/pulls?state=open&per_page=100") return Response.json([{number:7,title:"Pull",state:"open"}])
  return new Response(null,{status:401})
 }}
 expect(await readLandingOptions(ctx,"local/mirror")).toEqual({options:[{value:"7",label:"#7 Pull"}]})
 expect(calls).toHaveLength(2)
})


test("rejected reads retain a typed failure and never fetch invalid paths", async () => {
 let calls = 0
 const ctx = { baseUrl: "", http: async () => { calls++; return new Response(null, { status: 403 }) } }
 await expect(readPublicRepositoryMetadata(ctx, "owner/repo", "issues/../../user")).rejects.toMatchObject({ _tag: "RepositoryMetadataReadFailed" })
 expect(calls).toBe(0)
 for (const status of [403, 404, 500]) {
  await expect(readPublicRepositoryMetadata({ ...ctx, http: async () => new Response(null, { status }) }, "owner/repo", "issues")).rejects.toMatchObject({ _tag: "RepositoryMetadataReadFailed", status })
 }
})
