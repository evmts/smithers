import { randomUuid } from "../../runtime/RandomUuid"
import type { Session } from "../AppState"
import type { SeamContext } from "./SeamContext"
import type { ControllerContext } from "../controller/context"
import { refusalOf } from "@smthrs/rpc/Refusal"
import { refusalLine } from "@smthrs/rpc/RefusalCopy"

type Request = NonNullable<Session["repositorySiteRequests"]>[number]
const cell = (value: unknown): string => String(value ?? "").replace(/[|\r\n]/g," ")
const summary = (value: unknown): string => {
  if (typeof value !== "object" || value === null) return "Site unavailable"
  const row = value as Record<string, unknown>
  const hosts = Array.isArray(row.hosts) ? row.hosts : typeof row.hostname === "string" ? [row] : []
  const lines: string[] = []
  for (const item of hosts) {
    if (typeof item !== "object" || item === null) continue
    const host = item as Record<string, unknown>
    lines.push(`${host.bound ? `[${cell(host.hostname)}](https://${cell(host.hostname)})` : cell(host.hostname)} · ${host.removed ? "Removed" : host.bound ? "Active" : host.verified ? "Certificate pending" : "Verify DNS"}`)
    if (!host.removed && Array.isArray(host.records) && host.records.length) {
      lines.push("", "Type | Name | Value", "--- | --- | ---")
      for (const record of host.records) if (typeof record === "object" && record !== null) {
        const r = record as Record<string,unknown>
        lines.push(`${cell(r.type)} | ${cell(r.name)} | ${cell(r.value)}`)
      }
    }
  }
  if (lines.length) return lines.join("\n")
  const site = typeof row.site === "object" && row.site !== null ? row.site as Record<string,unknown> : row
  return typeof site.active === "string" && site.active ? `Version · ${site.active}` : site.enabled === true ? typeof site.url === "string" && site.url ? `[${site.url}](${site.url})` : "Site enabled" : "Site unavailable"
}

/** Persist before acknowledging, deduplicate unresolved input and resume it
 * after reload. HTTP completion, rather than launch, settles the shared toast. */
export function createRepositorySiteSeam(ctx: SeamContext, withToast: ControllerContext["withToast"], epoch: () => number = () => 0) {
  const active = new Set<string>()
  const starting = new Map<string,Promise<string | {value:string}>>()
  let disposed = false
  let saving = Promise.resolve<unknown>(undefined)
  const owner = () => ctx.store.collections.identitySessions.get("identity")?.login
  const rows = () => ctx.store.session().repositorySiteRequests ?? []
  const save = (request: Request, actor: "user" | "smithers" | "system" = "system") => {
    const result = saving.then(async () => {
      if (owner() !== request.owner || disposed) return false
      if (request.state === "requested" && !rows().some(row=>row.id===request.id) && rows().filter(row=>row.state==="requested").length >= 16) return false
      await ctx.dispatch({ type:"repository.site.requests.changed", actor,
      requests:(() => { const all=[...rows().filter(row => row.id !== request.id),request]; return [...all.filter(row=>row.state==="requested"),...all.filter(row=>row.state!=="requested").slice(-48)] })() }).isPersisted.promise
      return true
    })
    saving = result.catch(() => {})
    return result
  }
  const pump = (request: Request) => {
    if (disposed || active.has(request.id) || owner() !== request.owner || request.state !== "requested") return
    active.add(request.id)
    const startedEpoch = epoch()
    const current = () => !disposed && owner() === request.owner && epoch() === startedEpoch
    void withToast(`site.${request.id}`,"Site","Site",async () => {
      try {
        const response = await ctx.http(`${ctx.baseUrl}/api/repos/${request.repo.split("/").map(encodeURIComponent).join("/")}/site`, {
          method:"POST", credentials:"same-origin", headers:{"Content-Type":"application/json","Idempotency-Key":request.id}, body:JSON.stringify(request.input)
        })
        if (!current()) return
        const body: unknown = await response.json()
        if (!response.ok) {
          const message = refusalLine(refusalOf({ body,status:response.status,message:"Site unavailable" }),"Site unavailable")
          await save({...request,state:"failed",result:message})
          if (current()) ctx.dispatch({type:"message.appended",actor:"system",text:message})
          return message
        }
        const result = summary(body)
        await save({...request,state:"completed",result})
        if (current()) ctx.dispatch({type:"message.appended",actor:"system",text:result})
      } catch {
        if (!current()) return
        await save({...request,state:"failed",result:"Site unavailable"})
        if (current()) ctx.dispatch({type:"message.appended",actor:"system",text:"Site unavailable"})
        return "Site unavailable"
      }
    },false,current).catch(() => {}).finally(() => { active.delete(request.id); if (!disposed && epoch() !== startedEpoch) { const latest=rows().find(row=>row.id===request.id); if(latest) pump(latest) } })
  }
  const request = (repo:string,input:Record<string,string>): Promise<string | {value:string}> => {
    const key=JSON.stringify([owner(),repo,input])
    const previous=starting.get(key)
    if(previous) return previous
    const work=(async ():Promise<string|{value:string}> => {
      const login = owner()
      if (!login || disposed || !/^[\w.-]+\/[\w.-]+$/.test(repo)) return "Owner required"
      const same = rows().find(row => row.owner === login && row.repo === repo && row.state === "requested" && JSON.stringify(row.input) === JSON.stringify(input))
      if (same) { pump(same); return {value:"Requested"} }
      if (rows().filter(row=>row.state==="requested").length >= 16) return "Site busy"
      const request: Request = {id:randomUuid(),owner:login,repo,input,state:"requested"}
      const persisted=await save(request,ctx.actor())
      if(persisted===false) return owner()===login ? "Site busy" : "Owner required"
      pump(request)
      return {value:"Requested"}

    })().finally(()=>{if(starting.get(key)===work) starting.delete(key)})
    starting.set(key,work)
    return work
  }
  return { request,
    resume: () => { for (const row of rows()) pump(row) },
    dispose: () => { disposed = true }
  }
}
