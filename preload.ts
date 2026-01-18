import { SolidPlugin } from "@dschz/bun-plugin-solid";

await Bun.plugin(
  SolidPlugin({
    generate: "ssr", // SSR mode doesn't require DOM globals
    hydratable: false,
    debug: false,
  }),
);
