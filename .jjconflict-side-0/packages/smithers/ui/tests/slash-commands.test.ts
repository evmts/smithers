import { describe, expect, test } from "bun:test"
import { Schema } from "effect"
import { formFieldsFor } from "../src/flow-form"
import { type SlashCommand, slashMenu, slashSubmit } from "../src/slash-commands"

// The fields come from real payload schemas through `formFieldsFor`, as a host derives them from its flows.
const command = (name: string, description: string, payload: Schema.Struct.Fields): SlashCommand => ({
  name,
  description,
  fields: formFieldsFor(Schema.Struct(payload)),
})

const theme = command("theme", "Set this device's theme to light or dark.", { mode: Schema.Literals(["light", "dark"]) })
const help = command("help", "List what Smithers can do.", {})
const clone = command("clone", "Clone a repository.", { repo: Schema.String, branch: Schema.optional(Schema.String) })
const deploy = command("deploy", "Ship a build to a stage.", {
  stage: Schema.Literals(["staging", "production"]),
  note: Schema.String,
  dry: Schema.Boolean,
})
const watch = command("watch", "Watch the repository.", {
  level: Schema.optional(Schema.Literals(["all", "releases"])),
  quiet: Schema.optional(Schema.Boolean),
})
const commands = [theme, help, clone, deploy, watch]

const labels = (draft: string, offered: ReadonlyArray<SlashCommand> = commands) =>
  slashMenu(draft, offered).items.map((item) => item.label)

describe("slashMenu: commands", () => {
  test("a bare slash lists every command, in the order offered, each with its description", () => {
    const menu = slashMenu("/", commands)
    expect(menu.kind).toBe("commands")
    expect(menu.items).toEqual([
      { id: "command:theme", label: "/theme", detail: theme.description, draft: "/theme ", runs: false },
      { id: "command:help", label: "/help", detail: help.description, draft: "/help", runs: true },
      { id: "command:clone", label: "/clone", detail: clone.description, draft: "/clone ", runs: false },
      { id: "command:deploy", label: "/deploy", detail: deploy.description, draft: "/deploy ", runs: false },
      // Only optional arguments: Enter runs it as it is, and Tab still completes to its arguments.
      { id: "command:watch", label: "/watch", detail: watch.description, draft: "/watch ", runs: true },
    ])
  })

  test("typing filters, best first: the exact name, a prefix, a part of the name, then the description", () => {
    const offered = [
      command("lone", "Nothing to do with it.", {}),
      command("clone", "Copy.", {}),
      command("cl", "Short.", {}),
      command("other", "Mentions cl in passing.", {}),
      command("cleanup", "Tidy.", {}),
    ]
    expect(labels("/cl", offered)).toEqual(["/cl", "/clone", "/cleanup", "/other"])
    expect(labels("/one", offered)).toEqual(["/lone", "/clone"])
    expect(labels("/CL", offered)).toEqual(["/cl", "/clone", "/cleanup", "/other"])
  })

  test("a name nothing matches lists nothing", () => {
    expect(slashMenu("/zzz", commands)).toEqual({ kind: "none", items: [] })
    expect(slashMenu("/", [])).toEqual({ kind: "none", items: [] })
  })

  test("prose, a slash after the start, or a second line lists nothing", () => {
    for (const draft of ["", "theme", " /theme", "ask /theme", "/the\nme", "/theme dark\n"]) {
      expect(slashMenu(draft, commands)).toEqual({ kind: "none", items: [] })
    }
  })
})

describe("slashMenu: argument values", () => {
  test("a command and a space list its first argument's options", () => {
    const menu = slashMenu("/theme ", commands)
    expect(menu.kind).toBe("values")
    expect(menu.kind === "values" ? menu.field.name : undefined).toBe("mode")
    expect(menu.items).toEqual([
      { id: "value:theme:mode:light", label: "light", draft: "/theme light", runs: true },
      { id: "value:theme:mode:dark", label: "dark", draft: "/theme dark", runs: true },
    ])
  })

  test("typing filters the options, prefix first, ignoring case, and keeps what was typed before it", () => {
    expect(labels("/theme d")).toEqual(["dark"])
    expect(labels("/theme  D")).toEqual(["dark"])
    expect(slashMenu("/theme  D", commands).items[0]!.draft).toBe("/theme  dark")
    expect(labels("/theme ight")).toEqual(["light"])
    expect(labels("/theme dark")).toEqual(["dark"])
    expect(slashMenu("/theme blue", commands)).toEqual({ kind: "none", items: [] })
  })

  test("prefix matches rank above matches inside a value", () => {
    const offered = [command("pick", "Pick one.", { size: Schema.Literals(["xl", "large", "l"]) })]
    expect(labels("/pick l", offered)).toEqual(["large", "l", "xl"])
  })

  test("an option a later required argument needs completes with a space and doesn't run", () => {
    expect(slashMenu("/deploy st", commands).items).toEqual([
      { id: "value:deploy:stage:staging", label: "staging", draft: "/deploy staging ", runs: false },
    ])
  })

  test("an argument without options, a filled command, an unknown command or a flag lists nothing", () => {
    for (const draft of ["/clone ", "/clone own", "/deploy staging ", "/theme dark ", "/nope x", "/watch --quiet ", "/watch --q"]) {
      expect(slashMenu(draft, commands)).toEqual({ kind: "none", items: [] })
    }
  })

  test("an optional argument's options list, and choosing one runs", () => {
    expect(slashMenu("/watch ", commands).items.map(({ label, runs }) => ({ label, runs }))).toEqual([
      { label: "all", runs: true },
      { label: "releases", runs: true },
    ])
  })

  test("a disabled option is never listed", () => {
    const offered: ReadonlyArray<SlashCommand> = [{
      name: "model",
      description: "Pick a model.",
      fields: [{
        name: "id",
        label: "Id",
        kind: "select",
        required: true,
        options: [{ value: "a", label: "A" }, { value: "b", label: "B", disabled: true }],
      }],
    }]
    expect(labels("/model ", offered)).toEqual(["A"])
  })
})

describe("slashSubmit", () => {
  test("a command with its argument runs with the payload by field name", () => {
    expect(slashSubmit("/theme dark", commands)).toEqual({ kind: "run", command: theme, payload: { mode: "dark" } })
    expect(slashSubmit("  /theme   light  ", commands)).toEqual({ kind: "run", command: theme, payload: { mode: "light" } })
  })

  test("the command answered is the very one offered, with the host's own fields", () => {
    const hosted = { ...theme, flow: "app/theme/set" as const }
    const submitted = slashSubmit("/theme dark", [hosted])
    expect(submitted.kind === "run" ? submitted.command : undefined).toBe(hosted)
    expect(submitted.kind === "run" ? submitted.command.flow : undefined).toBe("app/theme/set")
  })

  test("a command that takes nothing runs with an empty payload", () => {
    expect(slashSubmit("/help", commands)).toEqual({ kind: "run", command: help, payload: {} })
  })

  test("the last text argument takes the rest of the line, and an optional one may be left out", () => {
    expect(slashSubmit("/clone octocat/Spoon-Knife", commands)).toEqual({
      kind: "run",
      command: clone,
      payload: { repo: "octocat/Spoon-Knife" },
    })
    expect(slashSubmit("/deploy staging fix the build --dry", commands)).toEqual({
      kind: "run",
      command: deploy,
      payload: { stage: "staging", note: "fix the build", dry: true },
    })
  })

  test("a required boolean left out is false; an optional one stays absent", () => {
    expect(slashSubmit("/deploy production go", commands)).toEqual({
      kind: "run",
      command: deploy,
      payload: { stage: "production", note: "go", dry: false },
    })
    expect(slashSubmit("/watch all", commands)).toEqual({ kind: "run", command: watch, payload: { level: "all" } })
    expect(slashSubmit("/watch --quiet", commands)).toEqual({ kind: "run", command: watch, payload: { quiet: true } })
  })

  test("a missing required argument names its fields", () => {
    expect(slashSubmit("/theme", commands)).toEqual({ kind: "missing", command: theme, fields: ["mode"] })
    expect(slashSubmit("/deploy staging", commands)).toEqual({ kind: "missing", command: deploy, fields: ["note"] })
  })

  test("a value that isn't one of its field's options is invalid", () => {
    expect(slashSubmit("/theme blue", commands)).toEqual({ kind: "invalid", command: theme, field: "mode" })
  })

  test("command syntax naming no command offered is unknown, never a prompt", () => {
    expect(slashSubmit("/nope", commands)).toEqual({ kind: "unknown", name: "nope" })
    // Offered to nobody: a person without the role sees it as unknown too.
    expect(slashSubmit("/theme dark", [help])).toEqual({ kind: "unknown", name: "theme" })
  })

  test("prose stays a prompt, and a blank line or a bare slash is empty", () => {
    expect(slashSubmit("Switch to dark mode", commands)).toEqual({ kind: "prompt", text: "Switch to dark mode" })
    expect(slashSubmit("/etc/hosts is broken", commands)).toEqual({ kind: "prompt", text: "/etc/hosts is broken" })
    // A command that takes nothing, given text: the text is prose.
    expect(slashSubmit("/help me out", commands)).toEqual({ kind: "prompt", text: "/help me out" })
    expect(slashSubmit("  ", commands)).toEqual({ kind: "empty" })
    expect(slashSubmit("/", commands)).toEqual({ kind: "empty" })
  })

  test("what a value row's draft submits is what the menu promised", () => {
    for (const item of slashMenu("/theme ", commands).items) {
      expect(slashSubmit(item.draft, commands).kind).toBe(item.runs ? "run" : "missing")
    }
  })
})
