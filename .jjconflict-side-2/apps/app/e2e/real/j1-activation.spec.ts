import { activationJourney } from "./support/activationJourney"
import { scenario } from "./coverage/types"

const { test, run } = activationJourney("activation")
// First-TODO slice; the keyboard slice alone cannot qualify C-UI-01.
test("C-J1-04 first TODO activation", scenario("journey.j1-activation", {
  capabilities: [], coverage: ["action:sign-in", "dimension:activation", "host:local", "host:production", "path:success", "door:button", "evidence:activation"]
}), run)
