/**
 * Preload script for Smithers orchestration files.
 *
 * This sets up the Solid JSX transform using babel directly,
 * pointing to smithers-orchestrator/solid as the render module.
 */
import tsPreset from "@babel/preset-typescript";
import solidPreset from "babel-preset-solid";

const logPrefix = "\x1b[36m[smithers-solid-jsx]\x1b[0m";

await Bun.plugin({
  name: "smithers-solid-jsx",
  setup: (build) => {
    let babel: typeof import("@babel/core") | null = null;
    let babelTransformPresets: any[] | null = null;

    // Only match tsx/jsx files outside of node_modules
    // Use negative lookahead to exclude node_modules paths
    build.onLoad({ filter: /^(?!.*node_modules).*\.[tj]sx$/ }, async ({ path }) => {

      if (!babel) {
        babel = await import("@babel/core");
      }

      if (!babelTransformPresets) {
        babelTransformPresets = [
          [tsPreset, {}],
          [solidPreset, {
            // Use universal mode (non-DOM) for the custom renderer
            generate: "universal",
            // Point to smithers-orchestrator's solid module for JSX runtime
            moduleName: "smithers-orchestrator/solid",
            // No hydration needed for non-DOM rendering
            hydratable: false,
          }],
        ];
      }

      console.log(`${logPrefix} Transforming: ${path}`);
      const start = performance.now();

      try {
        const result = await babel.transformFileAsync(path, {
          presets: babelTransformPresets,
          filename: path,
          sourceMaps: "inline",
        });

        const end = performance.now();
        console.log(`${logPrefix} Transformed: ${path} in ${Math.round(end - start)}ms`);

        if (!result || !result.code) {
          console.warn(`${logPrefix} No code for: ${path}`);
          // Return undefined to let bun handle the file normally
          return undefined;
        }

        return {
          loader: "js",
          contents: result.code,
        };
      } catch (error) {
        console.error(`${logPrefix} Error transforming ${path}:`, error);
        throw error;
      }
    });
  },
});
