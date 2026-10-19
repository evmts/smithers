/**
 * Planning and service-spec helpers for `S.Anvil.Fork`.
 *
 * An Anvil fork is a supervised service, so this module resolves the host
 * `anvil` binary (with the typed host refusal as identity when absent) and
 * renders the fork declaration into a supervisor spec: loopback bind,
 * port readiness, and a loopback URL capability in place of the RPC secret.
 * The supervisor resolves the true destination only when Anvil makes its
 * outbound request, so the child argv never contains the credential.
 *
 * @since 0.1.0
 */
import type * as Anvil from "@smthrs/targets/Anvil";
import * as HostProbes from "./internal/HostProbes.ts";
import * as PackageTree from "./PackageTree.ts";
import type * as ServiceSupervisor from "./ServiceSupervisor.ts";
/**
 * Resolves anvil and returns the identity used by the package key.
 *
 * `probes` is the invocation's host-probe cache, so every fork target of one
 * plan shares a single `anvil --version`.
 *
 * @category planning
 * @since 0.1.0
 */
export declare const resolveAnvil: (probes?: HostProbes.HostProbes) => Promise<{
    ok: false;
    refusal: string;
    identity: {
        tag: string;
        absent: boolean;
        path?: never;
        probe?: never;
    };
    path?: never;
} | {
    refusal?: never;
    ok: true;
    path: string;
    identity: {
        absent?: never;
        tag: string;
        path: string;
        probe: PackageTree.Probe;
    };
}>;
/**
 * Resolves one fork target to the scoped service supervisor.
 *
 * @category planning
 * @since 0.1.0
 */
export declare const serviceSpec: (options: {
    readonly label: string;
    readonly cwd: string;
    readonly attrs: (typeof Anvil.ForkAttrs)["Type"];
    readonly probes?: HostProbes.HostProbes | undefined;
}) => Promise<ServiceSupervisor.ServiceSpec | {
    readonly error: string;
}>;
