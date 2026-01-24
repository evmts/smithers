# uucode (Micro/µ Unicode)

## Project Overview

This library intends to provide a minimal set of unicode functionality to enable Ghostty and similar projects.

The architecture works in a few layers:

* Layer 1 (@src/build/Ucd.zig): Parses the Unicode Character Database (UCD).
* Layer 2 (@src/build/tables.zig): Generates table data written to a zig file.
* Layer 3 (@src/root.zig): Exposes methods to fetch information from the built tables.

## Build & Commands

* Build and test with: `zig build test`
* Format code with: `zig fmt`

Always `zig build test` to check that changes still pass.

## Code Style

Follow Zig standard conventions, also keeping imports at the top.

Prefer self-documenting code to comments, but add detailed comments for anything that needs explanation.

Never leave trailing whitespace in lines of source code.

## Testing

Add `test "<description here>"` blocks directly below code that it is testing, with more blocks at the bottom of module for testing the entire module.
