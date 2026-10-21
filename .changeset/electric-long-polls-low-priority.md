---
"@smthrs/effect-electric": patch
---

`ShapeSource.fetchSource` sends a live request (a long poll) with `priority: "low"`. A browser opens at most six HTTP/1.1 connections to an origin; on a page whose shapes long-poll on all six, the page's other requests (a write, a sign-out, telemetry) queued behind long polls that were sent again as they ended, and waited 11 to 21 seconds. At low priority, a long poll never takes a connection another request is waiting for.
