/**
 * The one runtime module the terminal suite's Worker imports, typed for the
 * test's own compilation; workerd provides it at run time.
 */
declare module "cloudflare:workers" {
  export abstract class WorkerEntrypoint<Env = unknown, Props = unknown> {
    protected readonly ctx: { readonly props: Props }
    protected readonly env: Env
    fetch?(request: Request): Promise<Response>
  }
}
