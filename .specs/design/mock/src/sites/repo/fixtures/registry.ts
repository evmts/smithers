/* Every repo the mock's smithers.sh can show, by "owner/name". The first is the default dataset. */
import type { Dataset } from "./types"
import { dataset as tinyhttp } from "./data/maya__tinyhttp"
import { dataset as smithers } from "./data/smithers-canary__smithers"
import { dataset as effeck } from "./data/effeck__effeck"
import { dataset as effect } from "./data/Effect-TS__effect"

export const DATASETS: Record<string, Dataset> = {
  "maya/tinyhttp": tinyhttp,
  "smithers-canary/smithers": smithers,
  "effeck/effeck": effeck,
  "Effect-TS/effect": effect
}
