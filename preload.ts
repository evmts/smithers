import { SolidPlugin } from "@dschz/bun-plugin-solid";

await Bun.plugin(
  SolidPlugin({
    generate: "universal",
    moduleName: "smithers-orchestrator/solid",
    hydratable: false,
    debug: false,
  }),
);
