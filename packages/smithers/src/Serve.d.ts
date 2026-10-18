/**
 * `smthrs serve`: the workspace gateway over HTTP, for the product UI and
 * for any client that is not this process.
 *
 * The assembly is `@smthrs/gateway`'s: the control plane on `/rpc`, the served
 * projections on `/projections`, the journal read path on `/sync`, and an
 * unauthenticated `GET /health` a supervisor probes to learn which workspace a
 * gateway belongs to. This module owns the two decisions the verb has to make:
 * whether the requested bind is allowed at all, and what it says it is
 * serving.
 *
 * The bind rule is strict: loopback reads need no bearer, but approval
 * decisions require a session token. Loopback accepts only loopback Host values
 * and browser origins; anything else needs both an explicit
 * `--listen` and a bearer token. It is
 * spelled out here, as data, because the failure mode it prevents,
 * an unauthenticated control plane on a laptop's LAN address, able to launch
 * agents with the operator's credentials, is silent when it happens.
 *
 * The banner is derived from {@link mounts}, the same list the composition is
 * built from, so it cannot advertise a route that answers 404.
 *
 * @since 1.0.0
 */
import type * as GatewayServer from "@smthrs/gateway/GatewayServer";
import type * as NodeGateway from "@smthrs/gateway/node/NodeGateway";
import { Context, Effect } from "effect";
import type { ServeError } from "effect/http/HttpServerError";
import * as CliError from "./CliError.ts";
/**
 * The addresses that need no opt-in.
 *
 * @category constants
 * @since 1.0.0
 */
export declare const loopbackHosts: ReadonlyArray<string>;
/**
 * The default bind.
 *
 * @category constants
 * @since 1.0.0
 */
export declare const defaultBind: {
    readonly host: "127.0.0.1";
    readonly port: 3000;
};
/**
 * One route the gateway serves.
 *
 * @category models
 * @since 1.0.0
 */
export interface Mount {
    readonly protocol: "http" | "ws";
    readonly path: string;
    readonly serves: string;
}
/**
 * Every route `@smthrs/gateway`'s `GatewayServer.layer` mounts, in the order
 * the banner prints them.
 *
 * This list and the composition are the same fact stated once: the banner is
 * rendered from it, so a mount that is not hosted cannot be advertised. The
 * previous banner named `/health` while the verb hosted the control server
 * alone, and an operator following the printed URL got a 404 with nothing to
 * explain it.
 *
 * @category constants
 * @since 1.0.0
 */
export declare const mounts: ReadonlyArray<Mount>;
/**
 * Whether a host is a loopback address.
 *
 * @category predicates
 * @since 1.0.0
 */
export declare const isLoopback: (host: string) => boolean;
/**
 * What the verb was asked to do.
 *
 * @category models
 * @since 1.0.0
 */
export interface Bind {
    readonly host: string;
    readonly port: number;
    readonly listen: boolean;
    readonly credential: string | undefined;
    /** Ephemeral approval credential for this serve session. */
    readonly operatorToken?: string | undefined;
}
/**
 * The already-composed Node gateway host used by the `serve` handler.
 *
 * Platform composition supplies this service so serving can reuse the control
 * database connection already open for the command. Launch failures remain in
 * the host effect instead of being hidden behind a second database build.
 *
 * @category services
 * @since 1.0.0-rc.0
 */
export interface GatewayHostService {
    readonly launch: (health: GatewayServer.Health, options: NodeGateway.ServerOptions, root: string) => Effect.Effect<never, ServeError>;
}
declare const GatewayHost_base: Context.ServiceClass<GatewayHost, "/cli/Serve/GatewayHost", GatewayHostService>;
/**
 * Service key for the Node gateway assembled beside the command control plane.
 *
 * Reach for it only from {@link host}; other callers should compose their own
 * platform host. A missing service is a composition defect reported by Effect.
 *
 * @category services
 * @since 1.0.0-rc.0
 */
export declare class GatewayHost extends GatewayHost_base {
}
/**
 * The refusal for a bind that is not allowed, or `undefined` when it is.
 *
 * @category getters
 * @since 1.0.0
 */
export declare const refuse: (bind: Bind) => CliError.UnsupportedError | undefined;
/**
 * The workspace this gateway belongs to, as a stable short hash of its root.
 *
 * A supervisor that finds a gateway on a port asks `/health` whether it is
 * this workspace's before deciding to keep or replace it, so the answer has to
 * be derived from the workspace and from nothing else. The path itself is not
 * published: it names directories on the operator's machine.
 *
 * @category getters
 * @since 1.0.0
 */
export declare const workspaceHash: (root: string) => string;
/**
 * The identity `GET /health` answers with.
 *
 * @category constructors
 * @since 1.0.0
 */
export declare const health: (root: string) => GatewayServer.Health;
/**
 * The line printed once the server is listening.
 *
 * @category constructors
 * @since 1.0.0
 */
export declare const banner: (bind: Bind) => string;
/**
 * Hosts the assembled gateway until the process is interrupted.
 *
 * `Layer.launch` keeps the scope alive, so the server lives exactly as long as
 * the command.
 *
 * @category constructors
 * @since 1.0.0
 */
export declare const host: (bind: Bind, root: string) => Effect.Effect<undefined, ServeError | CliError.UnsupportedError, never>;
export {};
