export { presentationComponentNames, presentationComponents } from "./components";

/**
 * The presentation bundle a `PresentationRealm` loads, imported on first use
 * so a page that only shows stored views never downloads it.
 */
export const loadPresentationBundle = (): Promise<string> =>
  import("./bundle.generated").then((module) => module.presentationBundle);
