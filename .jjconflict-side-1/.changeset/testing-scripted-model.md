---
"@smthrs/testing": minor
---

Adds `ScriptedModel` (answer chosen turns from a script, fall back to a recording), `BuiltinScript` (a script for Smithers' built-in flows, steered by directive tags such as `[ASK]` and `[HOLD key]`), and `TurnLog` (count and trace served turns). `smthrs-model-server` gains `--script builtin`, `--script-config`, `--trace` and `--trace-messages`, and serves `GET /__testing/turns`; `ModelServer` reads `max_completion_tokens` as `max_tokens`.
