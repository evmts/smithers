/** CLI fallback: node .specs/design/mock/evals/front-claims/run-direct.ts */
import { discoverDists, readDist, scorers } from "./scoring.ts"
for (const dist of discoverDists()) {
  const output = readDist(dist)
  console.log(JSON.stringify({ name: dist, dist, scores: Object.fromEntries(Object.entries(scorers).map(([name, score]) => [name, score(output)])) }))
}
