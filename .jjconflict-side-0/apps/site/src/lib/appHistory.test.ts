import assert from "node:assert/strict"
import { test } from "node:test"
import { opensLauncher, shouldResumeApp } from "./appHistory"

test("the landing keeps Get started for free on ordinary return visits, including finished profiles", () => {
  assert.equal(shouldResumeApp(""), false)
  assert.equal(shouldResumeApp("?tutorial"), true)
})

test("authentication returns still resume the app immediately", () => {
  for (const search of ["?signed-in=github", "?auth=failed", "?auth=error"]) assert.equal(shouldResumeApp(search), true)
})

test("an explicit writer takeover enters the app without a tutorial or auth marker", () => {
  assert.equal(shouldResumeApp("", true), true)
  assert.equal(shouldResumeApp("?unrelated=1", true), true)
  assert.equal(shouldResumeApp("", false), false)
})

test("the default root opens the launcher without a press, and other pages stay pages", () => {
  for (const pathname of ["/", "/index.html"]) assert.equal(opensLauncher(pathname), true)
  for (const pathname of ["/docs/", "/smithersai/smithers/", "/demo", "//"]) assert.equal(opensLauncher(pathname), false)
})
