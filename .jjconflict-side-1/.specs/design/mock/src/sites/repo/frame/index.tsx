/* Repo frame contract: RepoFrame(tab, title?, askContext?, askView?), useRepoFrame().openAsk(prompt?), shared states.
 * Slash registry: registerSlash(name, { purpose?, fields, run, confirm?, access?, userOnly? }) returns cleanup.
 * Register from a view's effect, using the same handler as its button:
 *   useEffect(() => registerSlash("issue.implement", {
 *     purpose: "Implement an issue",
 *     fields: [{ name: "issue", label: "Issue number", type: "number", min: 1 }],
 *     run: ({ issue }) => implementIssue(Number(issue))
 *   }), [implementIssue])
 * Arguments fill fields in order; the last field accepts multiple words, and quotes group earlier fields.
 * Ask collects only missing required fields, then confirms before calling run(values, { flags, location, closeAsk }).
 * confirm defaults to true; false opens a form or navigates directly. A string supplies confirmation copy.
 * access defaults to "member"; "signed-in" and "public" cover other acts. Registering the same name overrides it
 * while mounted; cleanup restores the earlier handler. Type / in Ask to browse the current registry.
 * userOnly is a one-line reason: Ask collects missing fields, then shows a button that requires a person's click.
 */
export { RepoFrame, useRepoFrame, useAsk } from "./RepoFrame"
export { Loading, Failed, Empty, Denied, SignInWall, useView } from "./states"
export { registerSlash } from "./slash"
export type { SlashCommand, SlashContext, SlashField, SlashValues } from "./slash"

export { usePackageScope } from "./packageScope"
