# Worker replay and notification updates

A model-setting step claims its invocation key in the audit table before changing the setting, in the same transaction. A replay changes neither row; it cannot overwrite a later setting. Concurrent calls with one key have one winner, and a failed setting write rolls the claim back.

Run notifications check current branch access for every recipient, including the launcher and existing rows. Muting still allows an accessible existing row to settle. Revoked recipients' rows receive no further updates. Unscoped historical runs reach their launcher alone.

A changed question title raises an existing needs-you row; a change to quiet alone preserves its attention version. Distinct default-branch pushes with equal timestamps advance in delivery order; strictly older pushes and an unchanged commit remain ignored. The webhook's delivery receipt deduplicates redelivery.

These changes retain the existing catalog libraries: `@smthrs/model` for model metering, `@smthrs/flow` for invocation identity and `@smthrs/notifications` for routing and attention transitions. They add no runtime or retry loop.

The database-fault fixtures protect harness construction with the same cleanup boundary as their assertions. Trigger acquisition is transactional, so a setup failure cannot leave half a fixture installed.
