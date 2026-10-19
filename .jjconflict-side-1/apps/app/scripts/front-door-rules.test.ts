import { expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { FrontDoor, Facts, chooseJourney, journeyMatches, shadowedJourneys, DoorFlowName, DEFAULT_CHOICE } from "@smthrs/rpc/FrontDoor"
import { catalogFixtures, placeholderRules } from "@smthrs/rpc/fixtures/FrontDoor"
import { FLOW_NAMES } from "../src/mainview/flows/FlowName"
import type { FlowName } from "../src/mainview/flows/FlowName"

// Keep the safe, argument-free doors assignable to the app's real FlowName.
const doors: ReadonlyArray<FlowName> = DoorFlowName.options

function validate(input: unknown) {
  const rules = FrontDoor.parse(input)
  expect(shadowedJourneys(rules)).toEqual([])
  for (const door of doors) expect(FLOW_NAMES).toContain(door)
  for (const journey of rules.journeys) {
    for (const block of journey.lead) {
      if (block.type === "action") expect(FLOW_NAMES).toContain(block.flow)
    }
    // A new catalog row must supply its own witness before its rule can ship.
    const witnesses = catalogFixtures.filter(f => journeyMatches(journey, Facts.parse(f.facts)))
    expect(witnesses.length, "missing catalog fixture for " + journey.id).toBeGreaterThan(0)
    const selected = witnesses.filter(f => chooseJourney(rules, Facts.parse(f.facts)).journey === journey.id)
    expect(selected.length, "unreachable catalog fixture for " + journey.id).toBeGreaterThan(0)
    for (const f of selected) {
      const result = chooseJourney(rules, Facts.parse(f.facts))
      if (f.row === 5) expect(result.order[0]).toBe("open-existing")
      if (f.row === 9) expect(result.order[1]).toBe("explore")
      if (f.row === 16) {
        expect(result.lead).toEqual([])
        expect(result.order).toEqual(DEFAULT_CHOICE.order)
      }
    }
  }
  return rules
}

test("evergreen: committed front-door rules parse, resolve doors, have catalog witnesses and are not shadowed", () => {
  validate(JSON.parse(readFileSync(new URL("../../../.smithers/front-door.json", import.meta.url), "utf8")))
})
test("the S catalog's placeholder rules exercise the same validator", () => { validate(placeholderRules) })
test("the validator refuses a shadowed or unwitnessed rule", () => {
  expect(() => validate({ ...placeholderRules, journeys: [
    placeholderRules.journeys[2], placeholderRules.journeys[0]
  ] })).toThrow()
  expect(() => validate({ ...placeholderRules, journeys: [
    { ...placeholderRules.journeys[0], when: { signedIn: true, ownRepos: { min: 99 } } }
  ] })).toThrow()
})
