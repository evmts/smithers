# @smthrs/organization

## [Unreleased]

- New package: `Profile`, `Grants`, `Roster`, `Prompt`, `Skills`, `Hiring`, and `Meetings`.
- `Prompt.compose` refuses a skill the profile lists but the caller did not supply (`skill-missing`) and context whose
  retrieval time cannot be rendered (`invalid-context`), and escapes line breaks in fence attributes.
- The example organization references only case files it ships.
