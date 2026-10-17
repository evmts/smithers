# Chat diagnostics

The backend's server-free operator command reads one durable turn without
starting a server or changing account, producer or journal state:

```sh
./backend chat inspect 7e5fc00f-8f6b-47ca-9149-c9554031a2b4
```

Run the installed backend executable with its existing database configuration.
Access to that executable and the database configuration is the operator
boundary. The command is not an HTTP endpoint. Syntax is checked before opening
PostgreSQL, and the read has a ten-second deadline.

The JSON includes the producer generation and lease, provider start timestamp,
terminal state, journal head, last batch time, and frame and text-byte counts.
It excludes prompts, answers, frame bodies, tokens and credential hashes. These
are progress facts; the inspection does not verify journal integrity.

Correlate `turn_id`, `run_id` and `generation` in `chat turn progress` and
`chat turn awaiting progress` logs. The latter records the current host stage
and its age on each producer renewal. Deployment adapters can report sandbox
creation, service startup and health probes through `ports.ReportChatProgress`.
The sandbox identity joins this trace to worker metadata.

`chat producer callback` records the authenticated callback result and frame
count. `model proxy request started` and `model proxy request finished` record
the authenticated caller's `reference`, provider, status, bytes and duration.
For a hosted chat caller, `reference` is its turn ID. Neither log contains a
request or response body. A finished provider transfer followed by no durable
batch narrows investigation to the guest consumer or callback path; it does
not prove that the provider generated a complete answer.
