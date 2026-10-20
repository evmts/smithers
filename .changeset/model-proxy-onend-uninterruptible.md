---
"@smthrs/model": patch
---

`ModelProxy.serve` runs `onEnd` to its end once it starts, even when the client
goes away meanwhile. A client that cancelled the response body while `onEnd`
ran interrupted it, so a host's settle could stop halfway and leave its
reservation at its worst case while the request was logged `success`.
