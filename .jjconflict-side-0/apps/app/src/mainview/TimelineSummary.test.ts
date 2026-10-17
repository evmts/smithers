import { expect,test } from "bun:test"
import { entrySummary,replyLabel } from "./TimelineSummary"
import { sharedRailLines } from "./ShellRail"

test("prompt intent and reply outcome are separate summaries of the same stored turn",()=>{
 const summary=JSON.stringify({v:2,prompt:"Switch to dark mode",answer:"Theme change unavailable"})
 expect(entrySummary(summary,"prompt")).toBe("Switch to dark mode")
 expect(entrySummary(summary,"answer")).toBe("Theme change unavailable")
 const rows=sharedRailLines({id:"main",entries:[{id:"turn",author:2,authorLogin:"alice",runId:"run",prompt:"Use the theme command to change my theme to dark. Reply only THEME REQUESTED.",title:"Copied old prompt",state:"completed",frames:[],summary}]},{role:"member"})
 expect(rows.map(row=>row.title)).toEqual(["Switch to dark mode","Theme change unavailable"])
})

test("historical plain answers remain readable; they never become prompt intent",()=>{
 expect(entrySummary("Quickstart opened","answer")).toBe("Quickstart opened")
 expect(entrySummary("Quickstart opened","prompt")).toBeUndefined()
 for(const value of [undefined," ",'{"v":2,"prompt":1,"answer":"Done"}','{"v":3,"prompt":"Find help","answer":"Opened"}']) expect(entrySummary(value,"prompt")).toBeUndefined()
})

test("pending, stopped and failed answers never claim success",()=>{
 expect(["accepted","running","failed","cancelled","uncertain","completed"].map(replyLabel)).toEqual(["Waiting for reply","Working","Reply failed","Reply stopped","Reply interrupted","Reply completed"])
})
