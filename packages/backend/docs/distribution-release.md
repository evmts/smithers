---
title: "Mac releases"
description: "Homebrew release qualification."
---

Apple Silicon releases use GitHub Release assets and the `smithersai/tap` Homebrew tap. Publication requires qualified bottle and fresh-user install/start receipts. Homebrew release qualification is tracked by T-INS-05; no bottle is qualified yet.

Apple Silicon macOS is the supported host. [Bundle assembly and verification](../../../apps/app/scripts/README.md#server-bundle) describes what a release contains. `smthrs host backup`, `smthrs host upgrade` and `smthrs host restore <directory>` own backup, upgrade and restore; see [upgrade recovery](./upgrade-recovery.md).
