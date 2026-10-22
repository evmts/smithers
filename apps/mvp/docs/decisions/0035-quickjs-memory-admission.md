# QuickJS memory admission

Date: 2026-10-22
Status: implementation decision

The harness keeps admission closed after a retained-memory estimate exceeds the
run ceiling or exceeds the probe's traversal bounds. Clearing the reading on
refusal allowed arbitrary allocating cells to run every other frame indefinitely.
Recovery requires closing the realm's scope and releasing its resources.

A failed or missed probe invalidates the previous reading. A later frame may
retry measurement under its fresh interrupt budget, but user code runs only after
a complete reading within the ceiling. This preserves ordinary compute-timeout
recovery without trusting stale memory accounting.

Strings and property names are estimated at two bytes per UTF-16 code unit.
QuickJS's one- or two-byte storage width is not exposed to realm JavaScript;
the conservative bound avoids scanning every string under the interrupt budget.
Array indices and custom enumerable own string properties are both traversed
through descriptors, without executing accessors.

The existing `@smthrs/harness` sandbox owns this policy, using the library catalog
entry for bounded persistent QuickJS realms. Outcomes retain the existing
`limit_exceeded` reporting and frame events; no persisted schema changes.
