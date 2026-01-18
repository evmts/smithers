import { SolidPlugin } from "@dschz/bun-plugin-solid";

await Bun.plugin(
  SolidPlugin({
    generate: "universal", // For custom renderers using solid-js/universal
    hydratable: false,
    debug: false,
  }),
);
