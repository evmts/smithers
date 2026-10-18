import { Schema } from "effect"
import { flow } from "./Declare"
import type { CommandActions } from "./Declare"
import type { FlowEntry, Namespace } from "../registry"

export const namespace: Namespace = {id:"site",label:"Site",summary:"Publish and bind a repository site"}
const actions = ["status","enable","activate","domain.add","domain.verify","domain.remove"] as const
export const siteFlows = (controller: CommandActions): ReadonlyArray<FlowEntry> => [flow({
  name:"site",slash:"/site",cli:["site"],http:{method:"POST",path:"/api/repos/{owner}/{repo}/site"},
  journey:["J1"],group:"Repository",visibility:"core",actors:["person","app_agent","external_agent"],minimumRole:"owner",
  summary:"Manage the repository site",agent:"run",requires:["signed-in"],confirm:input=> {
    const repo = input.repo ?? controller.activeRepository() ?? "the selected repository"
    return input.action === "status" ? undefined : String(input.action).startsWith("domain.")
      ? `${String(input.action).slice(7)} ${input.domain} for ${repo}`
      : input.action === "activate" ? `activate ${input.version} for ${repo}` : `enable the site for ${repo}`
  },runtime:["identity"],
  input:Schema.Struct({action:Schema.Literals(actions),repo:Schema.optional(Schema.String),name:Schema.optional(Schema.String),appPrefix:Schema.optional(Schema.String),domain:Schema.optional(Schema.String),version:Schema.optional(Schema.String),expected:Schema.optional(Schema.String)}),
  unavailable:()=>controller.bootstrap?.capabilities.includes("sites") ? undefined : "Sites unavailable",
  grammar:args=> {
    if (!args?.trim()) return {payload:{}}
    if (!args.trim().startsWith("{")) return {payload:{action:args.trim()}}
    try { const input:unknown=JSON.parse(args); return typeof input === "object" && input !== null && !Array.isArray(input) ? {payload:input as Record<string,unknown>} : {error:"Enter a JSON object"} } catch {return {error:"Enter a JSON object"}}
  },
  form:{submitLabel:"Apply",args:input=>JSON.stringify(input),requires:input=>[
    ...(!input.repo && !controller.activeRepository() ? ["repo"] : []),
    ...(input.action==="activate"?["version","expected"]:String(input.action).startsWith("domain.")?["domain"]:[])
  ],
    optionalFields:input=>input.action==="enable"?["name","appPrefix"]:[],
    fields:{action:{label:"Action",kind:"select"},repo:{label:"Repository",kind:"text",optionsFrom:"cloud-repos"},name:{label:"Name",kind:"text",required:false},appPrefix:{label:"App prefix",kind:"text",required:false},domain:{label:"Domain",kind:"text"},version:{label:"Version",kind:"text"},expected:{label:"Current version",kind:"text"}}},
  confirmArgs:input=> {
    const repo = typeof input.repo === "string" ? input.repo : controller.activeRepository()
    return repo ? JSON.stringify({...input,repo}) : undefined
  },
  handler:input=>controller.repositorySite(input)
})]
