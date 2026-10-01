# @smthrs/model-host

Provider-neutral model streaming and the durable callback producer shared by the local Smithers and Plue host composition.

Model-turn replies withhold credential prefixes until they are safe to publish, including prefixes that an inner removal could join. Provider text, reasoning, and tool data share a 16 MiB byte budget before buffering; sealed responses also retain their existing 16 MiB serialized-frame ceiling. Exceeding the budget fails closed instead of flushing a held prefix. This byte budget is not a process-memory limit: prefix state and JSON decoding also use memory.

Tool IDs containing the credential are refused because changing an ID would break reply correlation. Arguments keep their original JSON bytes after literal credential removal; invalidated JSON, decoded credential-bearing keys, or remaining JSON-escaped credentials are refused rather than reserializing unrelated fields.
