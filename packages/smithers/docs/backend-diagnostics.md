# Backend diagnostics

Backend errors use the command's protected session values when rendering scalar
fallback fields, names and verbose stacks and causes. Frozen errors retain their
classification without mutation. Live stdout and stderr pass through both the
streaming redactor and terminal sanitization, including the final partial line.

Event streams retain at most 10,000 events and 4 MiB of event text and metadata.
Exceeding either bound refuses with `backend_protocol` and cancels the reader;
commands never present a silently truncated event history as complete.

These changes use the existing journal redaction library. Host service locking
uses the existing Node SQLite adapter and Effect resource scopes. No model,
workflow, UI or GitHub library is introduced from the library catalog.
