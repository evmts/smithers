/**
 * Observing verbs open existing stores read-only: they migrate nothing, start
 * no recovery, and answer while another process holds the writer.
 */
import { NodeCrypto, NodeServices } from "@effect/platform-node"
import { Control } from "@smthrs/control"
import * as NodeDatabase from "@smthrs/database/node/NodeDatabase"
import * as NodeRuntime from "@smthrs/flows/NodeRuntime"
import { Context, Effect, Exit, Layer } from "effect"
import { SqlClient } from "effect/unstable/sql/SqlClient"
import { spawn } from "node:child_process"
import { randomUUID } from "node:crypto"
import { mkdtemp, readdir, realpath, rm, unlink } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { DatabaseSync } from "node:sqlite"
import { fileURLToPath } from "node:url"
import { afterAll, describe, expect, it, vi } from "vitest"
import * as NodeControl from "../src/NodeControl.ts"

const directories: Array<string> = []
afterAll(async () => {
  await Promise.all(directories.map((directory) => rm(directory, { recursive: true, force: true })))
})

const scriptedHost = fileURLToPath(new URL("./fixtures/scripted-native-host.ts", import.meta.url))
const executable = fileURLToPath(new URL("../src/bin.ts", import.meta.url))

const run = (root: string, args: ReadonlyArray<string>) =>
  new Promise<{ code: number | null; stdout: string; stderr: string }>((resolve, reject) => {
    const child = spawn(
      process.execPath,
      ["--no-warnings", "--import", scriptedHost, executable, ...args, "--root", root, "--json", "--verbose"],
      { cwd: root, env: { ...process.env, SMITHERS_REMOTE: "", SMITHERS_BACKEND: "sqlite" } }
    )
    let stdout = ""
    let stderr = ""
    child.stdout.on("data", (chunk) => (stdout += chunk))
    child.stderr.on("data", (chunk) => (stderr += chunk))
    const timeout = setTimeout(() => child.kill("SIGKILL"), 120_000)
    child.once("error", reject)
    child.once("close", (code) => {
      clearTimeout(timeout)
      resolve({ code, stdout, stderr })
    })
  })

const open = (root: string, kind: "engine" | "control") => new DatabaseSync(join(root, ".flows", `${kind}.db`))

const edit = (root: string, kind: "engine" | "control", body: (db: DatabaseSync) => void) => {
  const db = open(root, kind)
  try {
    body(db)
  } finally {
    db.close()
  }
}

/** A migrated project holding one parked run with two journal events. */
const fixture = async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), "smthrs-observe-")))
  directories.push(root)
  await Effect.runPromise(Effect.void.pipe(
    Effect.provide(NodeRuntime.storage(join(root, ".flows", "engine.db"), root)),
    Effect.provide(NodeServices.layer),
    Effect.provide(NodeCrypto.layer)
  ))
  await Effect.runPromise(Effect.void.pipe(Effect.provide(NodeControl.engineDurable(root).runtime)))
  const state = { version: 1, flowName: "agent/run", payload: { runId: "run-1", planId: "plan-1" } }
  edit(root, "engine", (db) => {
    db.prepare("INSERT INTO flows_runs(run_id,status,created_at_ms,state_json) VALUES('run-1','suspended',0,?)")
      .run(JSON.stringify(state))
  })
  edit(root, "control", (db) => {
    db.prepare(
      "INSERT INTO control_plans(plan_id,card_json,decoded_input_json,decision) VALUES('plan-1','{}','{}','approved')"
    ).run()
    db.prepare("INSERT INTO flows_runs(run_id,status,created_at_ms,state_json) VALUES('run-1','suspended',0,?)").run(
      JSON.stringify({
        runId: "run-1",
        flowId: "fixture",
        planId: "plan-1",
        planDigest: "digest",
        status: "parked",
        createdAt: 0,
        updatedAt: 0
      })
    )
    const insert = db.prepare(
      "INSERT INTO flows_journal_events(run_id,seq,event_id,source_id,source_seq,emitted_at_ms,event_type,payload_json,meta_json) VALUES('run-1',?,?,'fixture',?,0,'example.output',?,'{}')"
    )
    insert.run(1, "one", 1, JSON.stringify({ value: 1 }))
    insert.run(2, "two", 2, JSON.stringify({ value: 2 }))
  })
  return root
}

/** Every schema object and every row count, for proving a command wrote nothing. */
const snapshot = (root: string) =>
  Object.fromEntries((["control", "engine"] as const).map((kind) => {
    const db = open(root, kind)
    try {
      const objects = db.prepare("SELECT type, name FROM sqlite_master ORDER BY type, name").all() as Array<
        { type: string; name: string }
      >
      const counts = objects.filter((object) => object.type === "table").map((table) => [
        table.name,
        (db.prepare(`SELECT count(*) AS n FROM "${table.name}"`).get() as { n: number }).n
      ])
      return [kind, { objects, counts }]
    } finally {
      db.close()
    }
  }))

/** Holds both stores' writer, as a live host mid-transaction does. */
const holdWriters = <A>(root: string, body: () => Promise<A>): Promise<A> => {
  const writers = (["control", "engine"] as const).map((kind) => open(root, kind))
  for (const writer of writers) writer.exec("BEGIN IMMEDIATE")
  return body().finally(() => {
    for (const writer of writers) {
      writer.exec("ROLLBACK")
      writer.close()
    }
  })
}

const ledger = (root: string) => {
  const db = open(root, "control")
  try {
    return (db.prepare("SELECT count(*) AS n FROM flows_migrations").get() as { n: number }).n
  } finally {
    db.close()
  }
}


describe("probe", { timeout: 240_000 }, () => {
  it("probe", async () => {
    const root = await fixture()
    edit(root, "control", (db) => { db.exec("DROP TABLE control_plans") })
    for (const args of [["approvals","list"],["runs","list"],["runs","show","run-1"],["runs","logs","run-1"]]) {
      const r = await run(root, args)
      console.log(JSON.stringify(args), r.code, r.stdout.slice(0,800), r.stderr.slice(0,1500))
    }
    const root2 = await fixture()
    edit(root2, "engine", (db) => { db.exec("DROP TABLE flows_runs") })
    for (const args of [["runs","show","run-1"],["runs","list"]]) {
      const r = await run(root2, args)
      console.log(JSON.stringify(args), r.code, r.stdout.slice(0,800), r.stderr.slice(0,1500))
    }
  })
})
