# Catalog

Import `Catalog` and `CatalogRequest` from `@smthrs/cli`. `catalogRequest` encodes validated payloads without transport or credentials. `CatalogRequestError` carries typed refusal codes: `binding_unavailable`, `binding_invalid`, and `field_invalid`.

Flow listings carry discovery warnings as plain data (`code`, `path`, optional `name`, and `message`). Internal warning causes stay out of the listing so a refined input schema remains discoverable through JSON and human output.

Startup self-check enumerates tool bindings without repository authority. Each run resolves memory configuration only under its approved capability envelope.
