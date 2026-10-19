import { type Bridge } from "./ApprovalBridge.vibe";
import type { TargetApprovalRequest, TargetApprovals } from "./PackageOptions.vibe";
/** `serve`: the socket server. */
export declare const serve: (store: TargetApprovals | undefined, isRequest: (value: unknown) => value is TargetApprovalRequest) => Promise<Bridge>;
/** `withBridge`, through the module's `serve`. */
export declare const withBridge: <A>(store: TargetApprovals | undefined, run: (environment: Readonly<Record<string, string>>) => Promise<A>) => Promise<A>;
/** `client`'s `granted`: one question to the parent's store. */
export declare const ask: (path: string, token: string, request: TargetApprovalRequest) => Promise<boolean>;
