/** Shared native agent equipment; the platform supplies its request executor.
 * @since 1.0.0
 */
import * as SeatResolver from "@smthrs/agent/SeatResolver";
import * as SeatRouter from "@smthrs/agent/SeatRouter";
import type * as FlowBinding from "@smthrs/harness/FlowBinding";
import type * as Sandbox from "@smthrs/harness/Sandbox";
import * as KernelChildProcessSpawner from "@smthrs/kernel/ChildProcessSpawner";
import * as Evaluator from "@smthrs/model/Evaluator";
import * as RequestExecutor from "@smthrs/model/RequestExecutor";
import type * as Checkpoints from "@smthrs/std/Checkpoints";
import * as Container from "@smthrs/std/Container";
import * as TestRunner from "@smthrs/std/TestRunner";
import { Context, Effect, FileSystem, Layer, Path } from "effect";
import type { Scope } from "effect";
import * as HttpClient from "effect/http/HttpClient";
import type * as Application from "../Application.ts";
import * as Providers from "../Providers.ts";
/**
 * The native seat resolver: it turns a `provider:modelId` seat into a live model
 * route, with the API key read from the given environment, usually
 * `process.env`, passed in as a value so nothing below this composition touches
 * the process directly.
 *
 * A seat with no separator is a bare model id on the Anthropic route, which is
 * the one provider convention this host assumes. A `claude-code:<model>` seat
 * runs on the user's own signed-in Claude Code (see `ClaudeCode`), and so does
 * a Claude alias (`opus`, `sonnet`, `fable`) when no Anthropic key is set.
 *
 * `SMITHERS_OPENAI_AUTH=chatgpt` swaps the `openai` provider's credential source
 * from `OPENAI_API_KEY` to the local Codex login (`$CODEX_HOME/auth.json`), as
 * `codex:<model>` does. The seat calls the ChatGPT backend directly, with the
 * run's cache key as its session id (#3808). Smithers reads the login's access
 * token and never writes the file: the Codex CLI refreshes its own login when
 * asked (`CodexLogin`). One store per login file is shared by every seat that
 * signs with it, so they ask for one refresh at a time.
 *
 * A Claude Code seat keeps its sessions open between turns. `retain` receives
 * each such seat's `close`, so the host can end the sessions when it shuts down.
 *
 * @category constructors
 * @since 0.1.0
 */
export declare const seatResolver: (environment: Readonly<Record<string, string | undefined>>, executor: RequestExecutor.RequestExecutor, retain?: (close: () => void) => void) => SeatResolver.Service;
/**
 * A startup default from the pool's currently connected, host-permitted routes.
 * @category constructors
 * @since 1.0.0
 */
export declare const accountPoolDefaultModel: (environment: Readonly<Record<string, string | undefined>>) => Effect.Effect<"anthropic:claude-sonnet-4-6" | "openai:gpt-6-luna" | undefined, never, RequestExecutor.RequestExecutor>;
/**
 * {@link seatResolver} bound to the current scope: closing the scope ends every
 * Claude Code session its seats still hold, so an idle session cannot keep the
 * host process alive after its runs finish.
 *
 * @category constructors
 * @since 1.0.0
 */
export declare const scopedSeatResolver: (environment: Readonly<Record<string, string | undefined>>, executor: RequestExecutor.RequestExecutor) => Effect.Effect<SeatResolver.Service, never, Scope.Scope>;
/**
 * Provides {@link scopedSeatResolver} over the composition's request dispatcher.
 *
 * @category layers
 * @since 0.1.0
 */
export declare const layerSeatResolver: (environment: Readonly<Record<string, string | undefined>>) => Layer.Layer<SeatResolver.SeatResolver, never, RequestExecutor.RequestExecutor>;
/**
 * The routing graph's seats (`SeatRouter.seats`) an `auto` run may be routed
 * to on this host: each whose {@link aliasSeat} {@link seatResolver} holds a
 * credential for, so a Claude seat is offered on an Anthropic key or on a
 * Claude subscription signed in to Claude Code.
 *
 * @category constructors
 * @since 1.0.0
 */
export declare const seatCandidates: (host: Providers.Host) => Promise<ReadonlyArray<string>>;
/**
 * Provides the {@link SeatRouter.Catalog} of {@link seatCandidates} over the
 * given environment, read afresh each time a run is routed, with
 * {@link SeatRouter.defaultVariants}.
 *
 * @category layers
 * @since 1.0.0
 */
export declare const layerSeatCatalog: (environment: Readonly<Record<string, string | undefined>>) => Layer.Layer<SeatRouter.Catalog>;
/**
 * Routers: one key serves every vendor's model by its `vendor/model` id
 * (`vercel:` is the AI Gateway).
 *
 * @since 1.0.0
 * @private
 */
export declare const routers: ReadonlyArray<string>;
/**
 * The models a router judges or reviews on, by `vendor/model`, in order:
 * coding/review takes the first whose vendor is not the implementer's, and
 * the judge's backup takes the first.
 *
 * @since 1.0.0
 * @private
 */
export declare const routedReviewModels: ReadonlyArray<string>;
/**
 * The host's judge. With `AI_GATEWAY_API_KEY` it is Jev through the Vercel AI
 * Gateway, and a subscription judges in its place only when Jev is
 * unreachable, times out, or stays unavailable (5xx or 429) through its
 * retries. With no key the subscription is the judge itself.
 *
 * A subscription judges through the model-to-judge adapter
 * (`EvaluatorBackup.fromModel`), on the first of: Claude Haiku on a signed-in
 * Claude Code, GPT-6 Luna on the account pool or a ChatGPT session, then the
 * first router with a key on its first {@link routedReviewModels} model, so an
 * install with only its Gateway key still judges through a Jev outage. The
 * choice is read at each judgment, so an account connected after startup
 * counts. It never judges on a provider API key: a host that holds nothing
 * else fails `unconfigured`.
 *
 * Jev speaks over `jevHttp`, by default the environment's egress client on
 * Node and fetch on Bun, not the model executor: the gateway's own statuses, retries and deadline stay
 * Jev's, and its outages never count against the model transport.
 *
 * @category layers
 * @since 0.1.0
 */
export declare const layerSeatEvaluator: (environment: Readonly<Record<string, string | undefined>>, jevHttp?: Layer.Layer<HttpClient.HttpClient>) => Layer.Layer<Evaluator.Evaluator, never, RequestExecutor.RequestExecutor>;
/**
 * The explicit sandbox budget every locally executed cell runs under. Never
 * unlimited: an unbounded QuickJS cell can hang the frame.

 * @since 1.0.0
 * @private
 */
export declare const cellLimits: Sandbox.Limits;
/**
 * The repository's own test invocation, as this host declares it.
 *
 * `TestRun` is a declaration flow: a caller selects *which* tests, never *how*
 * to run them, so the composition has to supply the how. This host reads it off
 * the environment, which is the same place it reads a seat's credentials, and
 * the only field that decides anything is the command. The rest describe where
 * that command runs.
 *
 * `undefined` means this host knows of no runner, and then the `test` flow is
 * not bound at all. That is the rule the r91 wave broke in the other direction:
 * `StandardFlows.tests` existed, the cell contract's doctrine assumed it, and
 * no composition offered it, so all 45 graded runs saw zero `test` calls. A
 * flow no composition offers is a flow that does not exist, and a flow bound
 * over a declaration that can only refuse is worse, because the catalog then
 * advertises a call whose every answer is "not configured".
 *
 * `workspaceRoot` is the checkout this executor actually runs in, which is not
 * `root` once a resumed history fork binds the run to its own worktree. The
 * runner has to name that checkout, or the suite grades the files the forked
 * agent never touched. `root` still decides the *container's* name for the
 * tree: `SMITHERS_TEST_CWD` is the mount the project root is reachable at, so
 * a workspace inside the project is reachable at the same relative path under
 * that mount. A workspace the mount cannot name at all declares no runner,
 * because the only alternative is a `test` call that silently runs elsewhere.
 *
 * @category constructors
 * @since 0.1.0
 */
export declare const testRunner: (environment: Readonly<Record<string, string | undefined>>, root: string, workspaceRoot?: string) => TestRunner.Runner | undefined;
/**
 * The one container this host's `bash` may reach, when the host is sealed.
 *
 * `SMITHERS_BASH_CONTAINER` names it. A sealed host refuses every `bash` call
 * that names another container or none (`Bash.sealed`), and its file flows act
 * on that container's files, so a cell cannot read the host at all. A
 * benchmark host sets it: the host holds other tasks' tests and reference
 * solutions, and a task's agent may touch only the task's container.
 *
 * @category constructors
 * @since 1.0.0-rc.1
 */
export declare const sealedContainer: (environment: Readonly<Record<string, string | undefined>>) => string | undefined;
/**
 * The sandbox providers the CLI host offers a flow's `sandbox:` selection.
 *
 * `SMITHERS_SANDBOX_IMAGE` names the image `provider: container` runs in,
 * through the `docker` CLI, with the selection's network and limits. No other
 * provider is configured from the environment, and without the image a
 * container-sandboxed flow is refused rather than run on this host.
 *
 * @since 1.0.0
 * @private
 */
export declare const sandboxProvidersFrom: (environment: Readonly<Record<string, string | undefined>>) => Application.SandboxProviders;
/**
 * What an in-run `ask` does on this host.
 *
 * `SMITHERS_ASKS` names it. `park`, the default, parks the run on an approval
 * an operator answers with `smithers approve`. `refuse` declares a host nobody
 * answers — a benchmark, a cron, a CI lane — and every `ask` fails at once with
 * `ApprovalUnavailable`, which the cell reads and the journal records as the
 * call's failure. Nothing is approved on anyone's behalf. An unattended
 * benchmark trial that parked here spent the rest of its hour waiting.
 * Any other value throws a `UsageError` naming the variable.
 *
 * @category constructors
 * @since 1.0.0-rc.1
 */
export declare const askPolicy: (environment: Readonly<Record<string, string | undefined>>) => "park" | "refuse";
/**
 * Where this host pins the trees a run checkpoints, and where a container sees
 * them.
 *
 * The same two paths {@link testRunner} reads, for the same reason: a
 * checkpoint is materialized as a directory under the repository, and a
 * container reaches that directory through the mount it already has.
 * `SMITHERS_TEST_CWD` is the container's name for the repository when there is
 * one, and the workspace root is the host's. A host that declares neither
 * still pins, and pins on one path under both names.
 *
 * @category constructors
 * @since 0.1.0
 */
export declare const checkpointStore: (environment: Readonly<Record<string, string | undefined>>, root: string) => Checkpoints.GitOptions;
/**
 * The host services the standard tool bindings close over, and no others.
 *
 * `FlowBinding.provide` lays a binding's context over the calling run's, so a
 * whole ambient capture taken at registration would put the registration's
 * journal, run store, notification queue, raw flow runtime, scope and loggers
 * over the ones each tool call runs under. Each context is picked to exactly
 * the services its bindings declare (#2930).
 *
 * @category constructors
 * @since 1.0.0
 */
export declare const toolServices: Effect.Effect<{
    filesystem: Context.Context<FileSystem.FileSystem | Path.Path>;
    shell: Context.Context<KernelChildProcessSpawner.ChildProcessSpawner | Path.Path>;
    judge: Context.Context<Evaluator.Evaluator>;
}, never, KernelChildProcessSpawner.ChildProcessSpawner | Evaluator.Evaluator | FileSystem.FileSystem | Path.Path>;
/**
 * The `test` flow's binding source, or none when this host declares no runner.
 *
 * Named rather than spread inline because the r91 wave's whole finding about
 * this flow is that the *composition* was the untried link: the flow, its
 * declaration and its handler were all tested, and no test asked whether any
 * host offered them. This is that question, in the one place it can be asked
 * without booting a run.
 *
 * The runner's container is added to the same context, so the suite reaches the
 * image through the transport `bash` already uses. The `Evaluator` comes in
 * with it: the flow attributes a non-zero exit with Jev, and the host builds
 * that judge through `layerSeatEvaluator`, for this flow and
 * for the completion brake alike.
 *
 * @category constructors
 * @since 0.1.0
 */
export declare const testFlows: (services: Context.Context<Evaluator.Evaluator | KernelChildProcessSpawner.ChildProcessSpawner | Path.Path>, container: Container.Container, runner: TestRunner.Runner | undefined) => ReadonlyArray<FlowBinding.Source>;
