---
"@smthrs/ui": major
"@smthrs/ui-styleguide": minor
"@smthrs/repo-view": patch
---

One calm loading pattern (apps/mvp decision 0020):

- `LoadingBar` and `LOADING_DELAY_MS` (300). A thin bar at the top of the page (`placement="page"`) or along the
  top edge of a busy card or button (`"inline"`). It stays mounted, shows only once `loading` has lasted
  `LOADING_DELAY_MS`, and fades out when it settles. With a `label` it is a named `progressbar`; without one it is
  decorative.
- `Skeleton` is invisible for its first `LOADING_DELAY_MS`, then fades in and pulses gently. Size it like the
  content it stands for, so the content takes its box without moving anything.
- **Breaking:** `Spinner`, `spinnerVariants` and `SpinnerProps` are removed. `Button` with `loading` keeps its label
  and runs an inline bar instead of inserting a spinner before it; `PromptInputSubmit` keeps its arrow while sending;
  `RefPicker`, `RepositoryHome`'s Markdown blocks, `IssuesView` and `ItemConversation` show skeletons in place, with
  a screen-reader status where they had a spinner.
- A pending `ChatMessage` is one skeleton line in its bubble, the height of the answer's first line, instead of
  three typing dots, so the transcript doesn't jump when the answer starts.
- `AgentStatusPill` shows Working only once it has lasted `LOADING_DELAY_MS`, and no longer pulses; nor does the run
  page's Working.
- `@smthrs/ui-styleguide`'s `reducedMotionCss` keeps a delay an element names in `--motion-hold` (registered with
  `@property`, not inherited): a wait is not motion, so a loading state stays hidden for its first moments under
  reduced motion too. `@smthrs/ui`'s `reducedMotionCss` is the styleguide's.
- `@smthrs/repo-view`'s `RepoView` shows skeletons in place of a loading file list or file.
- `LinkIntent` and `intentPath`: report the intent to follow a plain same-origin link (the pointer or focus resting on it
  for `delayMs`), so a host can preload its page as a router's own links do.
