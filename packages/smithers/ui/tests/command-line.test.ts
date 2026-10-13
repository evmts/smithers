import { expect, test } from "bun:test"
import { canonicalCommandName, parseCommand, parseSubmit } from "../src/command-line"

test("both command doors preserve opaque multiline and Unicode arguments", () => {
  const line = ' /flow.run\tbuild {"text":"日本語\nhello"} '
  const head = parseCommand(line)!
  expect(head).toEqual({ name: "flow.run", argument: 'build {"text":"日本語\nhello"}' })
  expect(parseSubmit(line, [{ name: head.name, acceptsArgs: true }])).toEqual({
    kind: "command", name: head.name, args: head.argument
  })
  expect(canonicalCommandName(" //flow.run ")).toBe(head.name)
})

test("an unregistered command never becomes a model prompt", () => {
  expect(parseSubmit("/missing x", [])).toEqual({ kind: "unknown-command", name: "missing" })
  expect(parseSubmit("/", [])).toEqual({ kind: "empty" })
  expect(parseCommand("plain prompt")).toBeUndefined()
})

test("the command catalog owns argument admission, not a display hint", () => {
  expect(parseSubmit("/chat prose", [{ name: "chat" }])).toEqual({ kind: "prompt", text: "/chat prose" })
  expect(parseSubmit("/chat", [{ name: "chat" }])).toEqual({ kind: "command", name: "chat" })
  expect(parseSubmit("/not/command", [])).toEqual({ kind: "prompt", text: "/not/command" })
})

test("an alias submits the command it names, and a registered name wins over an alias", () => {
  const commands = [{ name: "archive", aliases: ["new", "clear"] }, { name: "history", acceptsArgs: true, aliases: ["resume"] }]
  expect(parseSubmit("/clear", commands)).toEqual({ kind: "command", name: "archive" })
  expect(parseSubmit("/resume 0b1c", commands)).toEqual({ kind: "command", name: "history", args: "0b1c" })
  // The named command takes no input, so text after its alias stays a prompt.
  expect(parseSubmit("/new idea", commands)).toEqual({ kind: "prompt", text: "/new idea" })
  expect(parseSubmit("/cle", commands)).toEqual({ kind: "unknown-command", name: "cle" })
  expect(parseSubmit("/clear", [...commands, { name: "clear" }])).toEqual({ kind: "command", name: "clear" })
})
