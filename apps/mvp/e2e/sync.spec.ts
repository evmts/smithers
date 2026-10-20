import { expectSameThread, test } from "./devices"

// Two separate browsers hold the conversation Electric syncs from Postgres; ChatApi answers on the server.
test("sync: a message and Smithers' answer sent in one browser appear in another", async ({ devices }) => {
  const word = devices.word
  const [alice, bob] = await devices.open("Alice", "Bob")
  const question = `Reply with exactly the word: sync-${word}`
  await alice.ask(question)
  await bob.expectAnswered(question, `sync-${word}`)
  await alice.expectAnswered(question, `sync-${word}`)
  await expectSameThread([alice, bob], word, 2)
})
