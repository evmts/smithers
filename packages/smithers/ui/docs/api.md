---
title: "API reference"
description: "Every public export of @smthrs/ui and its ten subpaths: the styling and theming core, the status vocabulary, every component family, the pure helpers, and the six heavy adapters."
sidebar:
  order: 1
---

The `exports` map in `package.json` is the public API. It carries no wildcard,
so anything reachable only through a relative path carries no promise. Every
symbol below is exported from the specifier named in its section heading.

Component props types follow the shape `ComponentProps<"element"> & { ... }`,
so every component also accepts the host attributes and handlers of the element
it renders. Where a component renders a control the host does not own directly,
it takes an explicit props bag instead.

## Entry points

| Specifier                              | Contents                                                      | Heavy dependency |
| -------------------------------------- | ------------------------------------------------------------- | ---------------- |
| `@smthrs/ui`                           | Everything on this page except the adapter sections           | None             |
| `@smthrs/ui/copy` | `copyText`, `CopyResult`, `CopyFailureCode` (clipboard only) | None |
| `@smthrs/ui/status`                    | [The status vocabulary](#the-status-vocabulary)               | None             |
| `@smthrs/ui/time`                      | [Time](#time)                                                 | None             |
| `@smthrs/ui/calendar`                  | [Calendar](#calendar)                                         | None             |
| `@smthrs/ui/vault`                     | [Vault](#vault)                                               | None             |
| `@smthrs/ui/adapters/chart`            | [Chart](#chart)                                               | `recharts`       |
| `@smthrs/ui/adapters/terminal`         | [Terminal](#terminal)                                         | `@xterm/*`       |
| `@smthrs/ui/adapters/terminal-frame`   | [Terminal frame](#terminal-frame)                             | `@xterm/*`, as the frame's runtime |
| `@smthrs/ui/adapters/code-view`        | [Code view](#code-view)                                       | `@pierre/diffs`  |
| `@smthrs/ui/adapters/repo-view`        | [Repo view](#repo-view)                                       | `@pierre/diffs`, `@milkdown/*` |
| `@smthrs/ui/adapters/pierre-diff-view` | [Pierre diff view](#pierre-diff-view)                         | `@pierre/diffs`  |
| `@smthrs/ui/adapters/markdown-editor`  | [Markdown editor](#markdown-editor)                           | `@milkdown/*`    |
| `@smthrs/ui/adapters/knowledge-graph`  | [Knowledge graph](#knowledge-graph)                           | `d3-force`       |

The four non-adapter subpaths are slices of the root barrel, offered for import
ergonomics. Everything they export is also on `@smthrs/ui`.

## Styling

```ts
function SmithersUiStyles(props?: SmithersUiStylesProps): JSX.Element
function composeSmithersUiStyles(props?: SmithersUiStylesProps): string
function prefersReducedMotion(): boolean
function observeReducedMotion(listener: (reduced: boolean) => void): () => void
function cn(...inputs: ClassValue[]): string

const smithersUiCss: string
const standaloneThemeCss: string
const SMITHERS_UI_STYLE_ATTR: "data-smithers-ui"
const REDUCED_MOTION_MEDIA_QUERY: "(prefers-reduced-motion: reduce)"

type SmithersUiStylesProps = { withTheme?: boolean; extra?: string }
```

| Export                     | Meaning                                                                                                                          |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `SmithersUiStyles`         | Renders the composed sheet in a `<style>` element. Render exactly once per document. Safe under `renderToStaticMarkup`.           |
| `composeSmithersUiStyles`  | The string behind that element. `withTheme` prepends the styleguide token block; `extra` is appended last, so its rules win.      |
| `smithersUiCss`            | The component sheet alone, with no theme block and no extras.                                                                     |
| `standaloneThemeCss`       | Re-exported from [`@smthrs/ui-styleguide`](https://github.com/smithersai/smithers/tree/main/packages/smithers/ui/ui-styleguide).                                                                   |
| `SMITHERS_UI_STYLE_ATTR`   | The marker attribute on rendered and injected style elements. The self-injection fallback stands down when it finds one.          |
| `prefersReducedMotion`     | The current motion preference. Answers `false` with no `window`.                                                                  |
| `observeReducedMotion`     | Subscribes to preference changes. Returns an unsubscribe function; a no-op with no `window`.                                      |
| `cn`                       | `clsx` class composition. No `tailwind-merge`, because every class is `sui-` namespaced.                                          |

`useInjectUiCss` is deliberately not exported from the barrel: components call
it internally, and it is not a consumer styling API.

## Theming

```ts
const tokens: SmithersUiTokens
const themeRegistry: DeepReadonly<Record<ResolvedPalette, SmithersTheme>>
const DEFAULT_THEME_KEY: "paper"

function resolveTheme(root?: ThemeRoot | null, media?: ThemeMedia | null): ResolvedTheme
function subscribeTheme(onChange: () => void): () => void
function resolvePalette(root?: PaletteRoot | null): ResolvedPalette
function subscribePalette(onChange: () => void): () => void
function useResolvedPalette(): ResolvedPalette

type ResolvedTheme = "light" | "dark"
type ResolvedPalette = keyof typeof themeRegistry
type SmithersUiTokens = typeof tokens
```

| Export               | Meaning                                                                                                                                 |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `tokens`             | The semantic token table. Every value is a `var(--house-token, #lightFallback)` expression, not a color.                                 |
| `resolveTheme`       | An explicit `data-theme` on `<html>` wins; otherwise the OS `prefers-color-scheme` decides. Resolves `"light"` outside a browser.        |
| `subscribeTheme`     | Fires on a `data-theme` mutation and on an OS preference change. Returns an unsubscribe function.                                        |
| `resolvePalette`     | Reads `data-palette` on `<html>`, accepting only registered keys and falling back to `DEFAULT_THEME_KEY`.                                |
| `subscribePalette`   | Fires on a `data-palette` mutation. Returns an unsubscribe function.                                                                     |
| `useResolvedPalette` | The hook form of `resolvePalette`, re-rendering on change.                                                                               |
| `themeRegistry`      | Paper light/dark, re-exported from [`@smthrs/ui-styleguide`](https://github.com/smithersai/smithers/tree/main/packages/smithers/ui/ui-styleguide).                                                      |

Both `resolveTheme` and `resolvePalette` take optional injectable roots, which
is how the package tests them without a document.

## The status vocabulary

Also available from `@smthrs/ui/status`, which pulls in no React.

```ts
function normalizeStatus(status: string | undefined): string
function statusClass(status: string | undefined): StatusClass
function statusColor(status: string | undefined): string
function hasStatusTone(status: string | undefined): boolean
function formatStatus(status: string | undefined): string
function isTerminalRunStatus(status: string | undefined): boolean

const statusColors: Readonly<Record<string, string>> & Readonly<Record<StatusClass, string>>

type StatusClass = "ok" | "warn" | "bad" | "muted" | "run"
```

| Export                | Meaning                                                                                                                                          |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `normalizeStatus`     | Trims, lowercases, and maps `_` to `-`. `undefined` becomes `""`.                                                                                 |
| `statusClass`         | The tone bucket. Any `waiting-*` status is `"warn"`; an unknown status is `"muted"`.                                                              |
| `hasStatusTone`       | Whether the vocabulary knows this status, which distinguishes a deliberately neutral status from an unrecognized one.                             |
| `statusColor`         | The token expression the matching tone paints with.                                                                                              |
| `statusColors`        | Both keyings of the same table: by tone, and by every known normalized status.                                                                    |
| `formatStatus`        | The human label. Falls through to a title-cased rendering of the spelling; `undefined` becomes `"Unknown"`.                                       |
| `isTerminalRunStatus` | Whether the run finished, failed, or was cancelled. Narrower than "not running": a parked run is neither.                                         |

Every lookup table is a frozen null-prototype container, so a status string
sourced from a host cannot resolve through `Object.prototype`.

## Base components

| Export                                                                                     | Props type                     | Notes                                                                                        |
| ------------------------------------------------------------------------------------------ | ------------------------------ | -------------------------------------------------------------------------------------------- |
| `Button`, `buttonVariants`                                                                 | `ButtonProps`                  | Variants `default` (house tinted brand), `solid`, `secondary`, `outline`, `ghost`, `destructive`, `link`. Sizes `sm`, `default`, `lg`, `icon`. `asChild`, `loading`. Defaults `type="button"`. |
| `Wordmark`, `WORDMARK`                                                                     | `WordmarkProps`                | The Smithers mark: six rows of box-drawing text in brand color, sized to the viewport, with an entrance scan and hover ripple. Decorative (`aria-hidden`); name the surrounding element. |
| `Badge`, `badgeVariants`                                                                   | `BadgeProps`                   | `asChild`.                                                                                    |
| `StatusPill`                                                                               | `StatusPillProps`              | `status`, `label`, `withDot`.                                                                 |
| `Card`, `CardHeader`, `CardTitle`, `CardDescription`, `CardAction`, `CardContent`, `CardFooter` | Element props               | The panel family.                                                                             |
| `Input`, `Textarea`                                                                        | Element props                  | Themed form controls.                                                                         |
| `Label`, `Field`                                                                           | Element props                  | `Field` pairs a label with its control.                                                       |
| `Alert`, `AlertTitle`, `AlertDescription`, `alertVariants`                                  | `AlertProps`                   | Tone through the CVA recipe.                                                                  |
| `Table`, `TableHeader`, `TableBody`, `TableRow`, `TableHead`, `TableCell`, `TableCaption`   | Element props                  | Themed table anatomy.                                                                         |
| `Tabs`, `TabsList`, `TabsTrigger`, `TabsContent`                                            | `TabsTriggerProps`             | Radix Tabs.                                                                                   |
| `Dialog`, `DialogTrigger`, `DialogPortal`, `DialogClose`, `DialogOverlay`, `DialogContent`, `DialogHeader`, `DialogFooter`, `DialogTitle`, `DialogDescription` | `DialogContentProps` | Radix Dialog. Portal content is styled because every rule is document-global. |
| `Tooltip`, `TooltipProvider`, `TooltipTrigger`, `TooltipContent`                            | Element props                  | Radix Tooltip.                                                                                |
| `Select`, `SelectGroup`, `SelectValue`, `SelectTrigger`, `SelectContent`, `SelectLabel`, `SelectItem`, `SelectSeparator` | Element props | Radix Select.                                                       |
| `Progress`                                                                                  | `ProgressProps`                | Radix Progress.                                                                               |
| `Separator`, `Skeleton`                                                                     | Element props                  | Hairline rule and loading placeholder.                                                        |
| `Spinner`, `spinnerVariants`                                                                | `SpinnerProps`                 | Sizes through the CVA recipe.                                                                 |
| `EmptyState`                                                                                | `EmptyStateProps`              | `icon`, `title`, `description`, `action`.                                                     |
| `SectionHeader`, `Eyebrow`                                                                  | `SectionHeaderProps`           | `title`, `eyebrow`, `actions`.                                                                |
| `RowButton`                                                                                 | `RowButtonProps`               | `active` applies the house selected-row recipe.                                               |
| `KpiStat`                                                                                   | `KpiStatProps`                 | `label`, `value`, `hint`.                                                                     |
| `StageStrip`, `stageTone`                                                                   | `StageStripProps`, `StageStripItem`, `StageTone` | `stages`, `showSummary`, `summaryLabel`.                                    |
| `CollapsiblePanel`                                                                          | `CollapsiblePanelProps`        | `title`, `status`, `statusLabel`, `meta`, controlled or uncontrolled `open`.                  |
| `Markdown`                                                                                  | `MarkdownProps`, `MarkdownLinkClick`, `MarkdownVariant`, `MarkdownImageResolver` | Dependency-free renderer. Builds React children rather than `innerHTML`, and scheme-filters link hrefs. `variant="document"` reads a repository file as GitHub does: HTML comments dropped, `<pre>` kept preformatted, other tags reduced to their text, single newlines joined, `>` blockquotes nested, a quote whose first line is `[!NOTE]`, `[!TIP]`, `[!IMPORTANT]`, `[!WARNING]` or `[!CAUTION]` drawn as a GitHub alert, and images reduced to their alt text (no `<img>`, no request). `resolveImage` draws a line that is exactly `![alt](https://example.com/image.png)` as the light and dark files it returns, one shown per `html[data-theme]`; on a miss the line renders as it would without it. |
| `FileTree`                                                                                  | `FileTreeProps`, `FileTreeItem`, `FileTreeNode`, `FileTreeNodeProps`, `FileTreeDirectoryProps` | Flat `/`-delimited paths grouped into a nested tree, with controlled single selection. |
| `Breadcrumbs`                                                                               | `BreadcrumbsProps`, `BreadcrumbItem` | A path trail. Every step but the last is an `<a href>`, and the last is `aria-current="page"`. `onNavigate` takes a plain click; a modified click stays the browser's. |
| `Popover`, `PopoverTrigger`, `PopoverContent`                                               | Radix Popover props            | A panel anchored to its trigger, in a portal, on the overlay tokens. `PopoverContent` aligns to the trigger's start, 6px below it, unless `align` or `sideOffset` say otherwise. Escape, a click outside and the trigger close it. |
| `RefPicker`                                                                                 | `RefPickerProps`, `RefPickerRef`, `RefPickerRefs` | A branch and tag picker for a repository view's revision: a button showing `current`, opening a filter over `refs` (`loading`, `ready` with `branches`, `tags` and `truncated`, or `failed` with a `message`) on two tabs counted by length. Each choice is an `<a href>` from `href(ref)` with its short SHA; `selected` is marked and `defaultBranch` badged `default`. A full 40-hex SHA typed in the filter is offered too. `onSelect(ref)` takes a plain click or Enter on the first match; a modified click stays the browser's. |
| `CopyButton`                                                                                | `CopyButtonProps`              | A `Button` that copies through the host's `onCopy`, which resolves once the text is on the clipboard and rejects when it isn't. Shows `copiedLabel` ("Copied") for `copiedDurationMs` (2,000), sets `data-copy-failed` on a rejection, and ignores clicks while a copy is in flight (`data-copying`). It never touches the clipboard itself. |
| `DirectoryListing`                                                                          | `DirectoryListingProps`, `DirectoryEntry`, `DirectoryTarget` | One directory's entries as links with folder and file icons, under a `..` row when `parent` is set. `href` builds each link, `onOpen` takes a plain click, and `empty` shows when there is nothing to list. |
| `useDialogFocusTrap`                                                                        | `UseDialogFocusTrapOptions`    | `{ active, containerRef, initialFocusRef, onClose }`. Focus containment for a custom overlay. |

## Diffs

```ts
function parseUnifiedFile(diffText: string, overrides?: ParseUnifiedFileOverrides): DiffFile
function parseHunks(diffText: string): { lines: DiffLine[]; add: number; del: number; partial: boolean }
function groupHunks(file: DiffFile): Hunk[]
function paginateHunks(file: DiffFile, visibleCount: number): { hunks: Hunk[]; hidden: number }
function diffTotals(diff: Diff): { files: number; add: number; del: number }
function totalBytes(diff: Diff): number
function fileLineCount(file: DiffFile): number
function fileStatus(file: DiffFile): DiffFileStatus
function statusLetter(file: DiffFile): string
function detectBinary(file: DiffFile): boolean
function binaryBodyLabel(file: DiffFile): string
function byteCountString(bytes: number): string
function isLargeDiff(diff: Diff): boolean
function initialExpanded(diff: Diff): string[]

const LARGE_FILE_COUNT: 50
const LARGE_BYTE_LIMIT: 1000000
const PAGINATE_THRESHOLD: 2000
const PAGINATE_VISIBLE: 1000

type Diff, DiffFile, DiffFileStatus, DiffLine, DiffLineKind, Hunk, ParseUnifiedFileOverrides
```

`DiffHunks` (`DiffHunksProps`) is the renderer over that model, with no
third-party dependency. `byteCountString` answers `"unknown size"` for a
negative or non-finite count rather than rendering `NaN`. The four constants are
the pagination policy documented in
[Failure codes and limits](./reference/contracts.md).

`parseHunks` reports `partial: true` when a hunk body ends before it spends both
of the line budgets its `@@` header declares, whether the body is cut by the end
of the text, by the next header, or by a row that is not hunk content. It also
reports `partial` when the text mentions hunks but none parse. `parseUnifiedFile`
carries the flag onto `DiffFile.partial`, and `DiffHunks` renders a
`sui-diff-partial` warning above the hunks for such a file.

`detectBinary` reads the `GIT binary patch` and `Binary files ` markers off
patch metadata rows only: an unnumbered context line that is not a hunk header.
Hunk body rows carry a line number, so a text diff whose own content reads
`GIT binary patch` still renders its hunks instead of the binary placeholder.

## Time

Also available from `@smthrs/ui/time`.

```ts
function formatRelativeTime(ts: number, now?: number): string
function useRelativeTime(ts: number): string

type RelativeTimeProps // { ts: number; title?: string; relativeUntilMs?: number }
```

`RelativeTime` renders a `<time>` element that re-renders off one ref-counted
one-second interval shared by every mounted instance and hook. A timestamp
outside the range `Date` can hold still renders its label and omits `dateTime`
and `title` rather than throwing.

## Conversation

| Export                                                                                                                                                   | Types                                                                                       | Notes                                              |
| --------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| `ChatMessage`                                                                                                                                            | `ChatMessageProps`, `ChatMessageRole`                                                       | One message with an optional label, meta, and pending state. |
| `ChatTranscript`                                                                                                                                         | `ChatTranscriptProps`                                                                       | The drop-in transcript surface.                    |
| `ChatComposer`                                                                                                                                           | `ChatComposerProps`, `ChatComposerStatus`, `ChatComposerError`, `ChatComposerCompletions`   | Controlled glass composer. `submitProps` and `stopProps` stamp host attributes on the two buttons. `onError` receives a failed `onSubmit` as `submit-failed`. `completions` lists rows above the input, such as slash commands: arrows move, Enter accepts, Tab completes, Escape dismisses ([complete slash commands](./guides/complete-slash-commands.md)). |
| `CompletionList`                                                                                                                                         | `CompletionListProps`, `ComposerCompletion`                                                 | The listbox `completions` renders, for a host composing its own input. |
| `Message`, `MessageAvatar`, `MessageHeader`, `MessageContent`, `MessageFooter`, `MessageActions`, `MessageGroup`                                          | `MessageProps`, `MessageRole`, `MessageAvatarProps`, `MessageActionsProps`                  | The compound message anatomy.                      |
| `MessageBranch`, `MessageBranchContent`, `MessageBranchSelector`, `MessageBranchPrevious`, `MessageBranchNext`, `MessageBranchPage`                       | `MessageBranchProps`                                                                        | Alternate responses with a pager.                  |
| `MessageScrollerProvider`, `MessageScrollerViewport`, `MessageScrollerContent`, `MessageScrollerItem`, `MessageScrollerButton`                            | `MessageScrollerProviderProps`, `MessageScrollerViewportProps`, `MessageScrollerContentProps`, `MessageScrollerItemProps`, `MessageScrollerButtonProps` | Stick-to-bottom scrolling anatomy. |
| `useMessageScroller`, `useMessageVisibility`, `useMessageScrollerState`                                                                                  | `MessageScrollerCommands`                                                                   | Imperative commands, per-message visibility, and viewport state. |
| `Bubble`, `BubbleContent`, `BubbleActions`, `BubbleReactions`, `bubbleVariants`                                                                          | `BubbleProps`, `BubbleReaction`, `BubbleReactionsProps`                                     | The bubble surface family.                         |
| `Attachment`, `AttachmentMedia`, `AttachmentContent`, `AttachmentTitle`, `AttachmentDescription`, `AttachmentActions`, `AttachmentAction`, `AttachmentTrigger`, `AttachmentGroup`, `AttachmentPreview`, `AttachmentRemove` | `AttachmentProps`, `AttachmentState`, `AttachmentActionProps`, `AttachmentPreviewProps` | Attachment chips and previews. |
| `CompactGroup`, `ConversationCheckpoint`                                                                                                                 | `CompactGroupProps`, `ConversationCheckpointProps`                                          | Collapsed history and a conversation marker.       |
| `Marker`, `Shimmer`                                                                                                                                      | `MarkerProps`, `ShimmerProps`                                                               | Inline divider and the text shimmer.               |

## Prompt input

| Export                                                                                                                                                                                                              | Types                                                                                                       |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `PromptInput`, `PromptInputHeader`, `PromptInputBody`, `PromptInputTextarea`, `PromptInputFooter`, `PromptInputTools`, `PromptInputButton`, `PromptInputSubmit`, `PromptInputStop`, `PromptInputActionMenu`, `PromptInputActionMenuTrigger`, `PromptInputActionMenuContent`, `PromptInputActionAddAttachments` | `PromptInputProps`, `PromptInputTextareaProps`, `PromptInputActionMenuProps`, `PromptInputStatus` |
| `usePromptInputAttachments`                                                                                                                                                                                          | Returns `{ attachments, add, remove, clear, openFileDialog }`                                                |
|                                                                                                                                                                                                                      | `PromptInputMessage`, `PromptInputAttachmentItem`, `PromptInputError`                                       |

`onSubmit` receives `(message: PromptInputMessage, event)`. Returning a promise
holds the draft and its blob URLs until it settles. Every refusal reports a
`PromptInputError` through `onError`; the codes and the object-URL ownership
rule are in [Failure codes and limits](./reference/contracts.md).

## Reasoning and tools

```ts
function parseAgentOutput(value: unknown): AgentOutputModel | null
function formatJsonSafe(value: unknown): string
function formatPartialJson(text: string): { text: string; complete: boolean }
function toolCallStatus(state: ToolCallState): "running" | "pending" | "waiting-approval" | "complete" | "error" | "denied"
function chainOfThoughtStepStatus(status: ChainOfThoughtStepStatus | undefined): "pending" | "running" | "complete"

const TOOL_CALL_STATE_LABELS: Readonly<Record<ToolCallState, string>>
```

| Export                                                                                                            | Types                                                                                                                       | Notes                                                                              |
| ------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `Reasoning`, `ReasoningTrigger`, `ReasoningContent`, `ReasoningSummary`                                            | `ReasoningProps`, `ReasoningTriggerProps`, `ReasoningContentProps`, `ReasoningSummaryProps`                                  | Provider-disclosed summaries only. The parts throw outside `<Reasoning composed>`. |
| `ChainOfThought`, `ChainOfThoughtStep`                                                                             | `ChainOfThoughtProps`, `ChainOfThoughtStepProps`, `ChainOfThoughtStepStatus`                                                | Ordered thought steps.                                                             |
| `ToolCall`, `ToolCallHeader`, `ToolCallContent`, `ToolCallInput`, `ToolCallOutput`, `ToolCallError`, `ToolCallApproval` | `ToolCallProps`, `ToolCallState`, `ToolResultPart`, and one props type per part                                        | Eight lifecycle states from `input-streaming` to `output-denied`.                  |
| `CodeBlock`, `CodeBlockHeader`, `CodeBlockFilename`, `CodeBlockGroup`, `CodeBlockTabs`                              | `CodeBlockProps`, `CodeBlockHighlighter`, `HighlightLine`, `HighlightedToken`, `CodeBlockGroupItem`, and one props type per part | Copy, wrapping, line numbers, and a `highlight` seam that needs no adapter.     |
| `MessageResponse`                                                                                                  | `MessageResponseProps`                                                                                                      | Streaming markdown over the `Markdown` primitive.                                  |
| `AgentOutput`                                                                                                      | `AgentOutputProps`, `AgentOutputModel`, `AgentOutputToolCall`                                                               | Renders a parsed model: response, reasoning summary, and tool calls.               |

`CodeBlockHighlighter` is
`(code: string, language: string | undefined) => readonly HighlightLine[] | null`.

## Plans, tasks, and queues

| Export                                                                                                            | Types                                                                            |
| ------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| `Plan`, `PlanHeader`, `PlanTitle`, `PlanDescription`, `PlanTrigger`, `PlanContent`, `PlanStep`, `PlanAction`, `PlanFooter`, `planStepStatus` | `PlanProps`, `PlanStepProps`, `PlanStepStatus`                |
| `TaskItem`, `TaskItemFile`                                                                                        | `TaskItemProps`, `TaskItemFileProps`                                             |
| `AgentTask`, `AgentTaskTrigger`, `AgentTaskContent`, `AgentTaskGroup`                                             | `AgentTaskProps`, `AgentTaskContentProps`                                        |
| `Queue`, `QueueSection`, `QueueSectionTrigger`, `QueueSectionLabel`, `QueueSectionContent`, `QueueList`, `QueueItem`, `QueueItemIndicator`, `QueueItemContent`, `QueueItemDescription` | `QueueSectionProps`, `QueueSectionLabelProps`, `QueueItemProps`, `QueueItemIndicatorProps` |
| `ActivityTimeline`, `ActivityItem`, `ActivityGroup`                                                               | `ActivityTimelineProps`, `ActivityItemProps`, `ActivityGroupProps`, `ActivityKind`, `ActivityItemModel` |

`planStepStatus` maps a plan step onto
`"pending" | "running" | "complete" | "failed" | "skipped"`.

## Approvals and checkpoints

```ts
function approvalStateToStatus(state: ApprovalState): string
function approvalStateLabel(state: ApprovalState): string
function useCheckpoint(): CheckpointContextValue

const CHECKPOINT_ACTION_KINDS: readonly CheckpointActionKind[]
```

| Export                                                                                                                          | Types                                                                                                    |
| --------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `Confirmation`, `ConfirmationTitle`, `ConfirmationRequest`, `ConfirmationAccepted`, `ConfirmationRejected`, `ConfirmationActions`, `ConfirmationAction` | `ConfirmationProps`, `ConfirmationActionProps`, `ApprovalState`                       |
| `ApprovalCard`, `ApprovalRisk`, `ApprovalResources`, `ApprovalNote`                                                             | `ApprovalCardProps`, `ApprovalRiskProps`, `ApprovalResourcesProps`, `ApprovalNoteProps`, `ApprovalRiskLevel`, `ApprovalResource` |
| `Checkpoint`, `CheckpointIcon`, `CheckpointMetadata`, `CheckpointTrigger`, `CheckpointActions`                                  | `CheckpointProps`, `CheckpointModel`, `CheckpointActionKind`, `CheckpointTriggerProps`, `CheckpointActionsProps` |

`approvalStateToStatus` returns a string from the shared status vocabulary, so
an approval and a run agree on tone.

## Sources and citations

| Export                                                              | Types                                                                                             |
| --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `Sources`, `SourcesTrigger`, `SourcesContent`, `Source`             | `SourcesProps`, `SourceItem`, `SourcesTriggerProps`, `SourcesContentProps`, `SourceProps`         |
| `InlineCitation`, `CitationCard`, `CitationCarousel`, `CitationQuote` | `InlineCitationProps`, `CitationSource`, `CitationCardProps`, `CitationCarouselProps`, `CitationQuoteProps` |
| `Suggestion`, `SuggestionGroup`                                     | `SuggestionProps`, `SuggestionGroupProps`                                                         |
| `OpenInChat`                                                        | `OpenInChatProps`, `OpenInChatSubject`, `OpenInChatSubjectKind`                                   |

## Agents and context

```ts
function availabilityLabel(availability: AgentAvailability): string
function contextUsagePercent(usage: TokenUsageModel): number | undefined
```

| Export                                                                                                                                 | Types                                                                                                                    |
| ---------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `AgentDefinition`, `AgentHeader`, `AgentContent`, `AgentInstructions`, `AgentTools`, `AgentTool`, `AgentOutputSchema`, `AgentAvailabilityBadge` | `AgentDefinitionProps`, `AgentAvailability`, `AgentToolDescriptorModel`, `AgentAvailabilityBadgeProps`, `AgentInstructionsProps`, `AgentToolProps`, `AgentOutputSchemaProps` |
| `AgentCard`                                                                                                                            | `AgentCardProps`                                                                                                         |
| `ModelSelector`, `ModelSelectorTrigger`, `ModelSelectorContent`, `ModelSelectorGroup`, `ModelSelectorItem`                              | `ModelSelectorProps`, `ModelOption`, `ModelSelectorItemProps`                                                            |
| `ModelBadge`, `ProviderBadge`                                                                                                          | `ModelBadgeProps`, `ProviderBadgeProps`                                                                                  |
| `ContextUsage`, `ContextTrigger`, `ContextContent`, `ContextContentHeader`, `ContextContentBody`, `ContextContentFooter`, `ContextInputUsage`, `ContextOutputUsage`, `ContextReasoningUsage`, `ContextCacheUsage` | `ContextUsageProps`, `TokenUsageModel`                        |

`contextUsagePercent` answers `undefined` when `usedTokens` or `maxTokens` is
absent, or when `maxTokens` is not positive, rather than guessing at a
denominator. Otherwise it rounds and clamps to 100.

## Coding artifacts

```ts
function parseStackTrace(text: string): StackFrameData[]
function testCaseStatusToStatus(status: TestCaseStatus): string
function formatTestDuration(durationMs: number): string
function useCommitModel(): CommitModel | null
```

| Export                                                                                                                                                                       | Types                                                                                            |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------ |
| `Artifact`, `ArtifactHeader`, `ArtifactTitle`, `ArtifactDescription`, `ArtifactActions`, `ArtifactAction`, `ArtifactClose`, `ArtifactContent`                                 | `ArtifactActionProps`, `ArtifactCloseProps`                                                      |
| `Snippet`                                                                                                                                                                    | `SnippetProps`                                                                                   |
| `PackageInfo`                                                                                                                                                                | `PackageInfoProps`                                                                               |
| `SchemaDisplay`                                                                                                                                                              | `SchemaDisplayProps`                                                                             |
| `StackTrace`, `StackFrame`                                                                                                                                                   | `StackTraceProps`, `StackFrameProps`, `StackFrameData`                                           |
| `TestResults`, `TestResultsHeader`, `TestResultsSummary`, `TestResultsDuration`, `TestResultsProgress`, `TestResultsContent`, `TestSuite`, `TestSuiteName`, `TestSuiteStats`, `TestSuiteContent`, `TestRow`, `TestStatus`, `TestName` | `TestResultsProps`, `TestResultsDurationProps`, `TestSuiteProps`, `TestRowProps`, `TestStatusProps`, `TestCaseStatus`, `TestCaseModel`, `TestSuiteModel` |
| `Commit`, `CommitHeader`, `CommitAuthor`, `CommitInfo`, `CommitMessage`, `CommitMetadata`, `CommitHash`, `CommitTimestamp`, `CommitActions`, `CommitFiles`, `CommitFile`, `CommitFileStatus`, `CommitFilePath` | `CommitProps`, `CommitModel`, `CommitFileModel`, `CommitFileStatusKind`, and one props type per part |
| `ChangeSummary`                                                                                                                                                              | `ChangeSummaryProps`                                                                             |
| `EnvironmentVariables`, `EnvironmentVariable`                                                                                                                                | `EnvironmentVariablesProps`, `EnvironmentVariableProps`, `EnvironmentVariableModel`              |
| `SecretField`                                                                                                                                                                | `SecretFieldProps`                                                                               |

`SchemaDisplay` and `SecretField` enforce bounds documented in
[Failure codes and limits](./reference/contracts.md).

## Sandbox previews

```ts
function sandboxStateToStatus(state: SandboxState): string
```

| Export                                                                        | Types                                                                                                        |
| ------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `Sandbox`, `SandboxHeader`, `SandboxStatus`, `SandboxActions`, `SandboxContent` | `SandboxProps`, `SandboxStatusProps`, `SandboxActionsProps`, `SandboxState`                                  |
| `WebPreview`, `WebPreviewToolbar`, `WebPreviewAddress`, `WebPreviewContent`     | `WebPreviewProps`, `WebPreviewToolbarProps`, `WebPreviewAddressProps`, `WebPreviewContentProps`, `WebPreviewSandboxToken` |
| `JSXPreview`                                                                   | `JSXPreviewProps`                                                                                            |

`WebPreviewContent` takes `sandboxAllow`, a list of `WebPreviewSandboxToken`
values, defaulting to `["allow-scripts", "allow-forms"]`. It renders the iframe
`sandbox` attribute from that list under three rules it enforces itself:

- Each entry is trimmed, lowercased, and accepted only when the whole entry is
  one of the five known keywords. An unknown or packed entry is rejected
  wholesale with a console warning rather than salvaged into a capability.
- `allow-same-origin` is dropped whenever `allow-scripts` is also present. The
  pair would let the framed page remove its own sandbox.
- `src` must be an absolute `http` or `https` URL or a root-relative
  same-origin path. Anything else, including `javascript:`, `data:`, `blob:`,
  protocol-relative, and backslash network-path forms, is refused, and the
  sanitized string is what gets rendered.

## Workflow canvas

| Export                                                                                                                                                                | Types                                                                                                                             |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `WorkflowCanvas`, `WorkflowNode`, `WorkflowNodeHeader`, `WorkflowNodeContent`, `WorkflowNodeStatus`, `WorkflowEdge`, `WorkflowConnection`, `WorkflowControls`, `WorkflowPanel`, `WorkflowToolbar`, `WorkflowMinimap` | `WorkflowCanvasProps`, `WorkflowNodeProps`, `WorkflowNodeStatusProps`, `WorkflowEdgeProps`, `WorkflowConnectionProps`, `WorkflowControlsProps`, `WorkflowPanelProps` |

## Calendar

Also available from `@smthrs/ui/calendar`.

```ts
function monthGridDays(anchorMs: number, weekStartsOn?: number): number[]
function weekDays(anchorMs: number, weekStartsOn?: number): number[]
function eventsOnDay(events: CalendarEvent[], dayMs: number): CalendarEvent[]
function agendaGroups(events: CalendarEvent[]): AgendaDayGroup[]
function startOfDay(ms: number): number
function addDays(ms: number, days: number): number
function addMonths(ms: number, months: number): number
function daysInMonth(year: number, month: number): number
function isSameDay(a: number, b: number): boolean
function minutesIntoDay(ms: number): number
function atMinutesIntoDay(dayMs: number, minutes: number): number
function snapUp30(minutes: number): number
function snapDown30(minutes: number): number
function dayKey(ms: number): string
function monthLabel(ms: number): string
function weekLabel(days: number[]): string
function weekdayLabel(ms: number): string
function fullDayLabel(ms: number): string
function timeLabel(ms: number): string
function hourLabel(hour: number): string
function hashSource(source: string | undefined): number

const DAY_MS: 86400000
const HOUR_MS: 3600000
const MINUTE_MS: 60000
const CALENDAR_CSS_ID: "calendar"
const calendarCss: string
```

`Calendar` (`CalendarProps`) renders month, week, and agenda views over
`CalendarEvent` values, with `CalendarView` naming the three. Every timestamp is
Unix epoch milliseconds. `hashSource` is the per-source tint rotation, which is
what gives an event without an explicit `color` a stable one.

The week grid is a wall clock, not elapsed time. `atMinutesIntoDay` inverts
`minutesIntoDay` to turn a row offset back into an instant, and `hourLabel`
formats a gutter hour off a transition-free reference day. On a daylight-saving
transition day a slot inside the spring-forward gap resolves to the instant the
clock jumps to (02:30 becomes 03:30 local), and a slot inside the autumn
fall-back hour resolves to its first, still-daylight occurrence.

## Vault

Also available from `@smthrs/ui/vault`.

```ts
function parseWikilinks(markdown: string): Wikilink[]
function wikilinksToMarkdown(body: string, resolve: (target: string) => string): string
function restoreWikilinks(markdown: string): string
function noteHref(path: string): string
function pathFromHref(href: string): string
function noteLabel(path: string): string
function splitFrontmatter(source: string): { frontmatter: string | null; body: string }
function joinFrontmatter(frontmatter: string | null, body: string): string

function computeGraphModel(notes: readonly VaultNoteMeta[], links: readonly VaultLink[]): { nodes: VaultGraphNode[]; links: VaultGraphEdge[] }
function neighbourSet(hover: string | null, links: readonly VaultGraphEdge[]): Set<string> | null
function nodeRadius(degree: number): number
function shouldShowLabel(degree: number, threshold?: number): boolean
function noteFolder(path: string): string
function folderTint(folder: string): GraphFolderTint
function folderTintIndex(folder: string): number
function folderHue(folder: string): number

function parseOutline(markdown: string): OutlineHeading[]
function createAutosaveDoc(options: AutosaveDocOptions): AutosaveDoc
function useAutosaveDoc(options: UseAutosaveDocOptions): UseAutosaveDocResult
function autosaveStatusText(state: AutosaveState): string
function useVaultCss(): void

const NOTE_HREF: "#note/"
const GRAPH_FOLDER_TINTS: readonly ["brand", "success", "info", "warning"]
const HUB_LABEL_MIN_DEGREE: 6
const AUTOSAVE_STATUS_TEXT: Record<AutosaveState, string>
const VAULT_CSS_ID: "vault"
const vaultCss: string
```

`BacklinksPanel` (`BacklinksPanelProps`) and `OutlineView` (`OutlineViewProps`,
`OutlineHeading`) are the two panels. `VaultAdapter`, `VaultNoteMeta`, and
`VaultLink` are the host contract: `tree`, `read`, and `write` are required, and
`links` and `graph` are optional bulk reads.

`AutosaveState` is `"clean" | "dirty" | "saving" | "saved" | "conflict"`, and
`AutosaveSnapshot.failure` and readonly `UseAutosaveDocResult.failure` expose
`AutosaveFailure` (`code`, `cause`). `AutosaveFailureCode` is `"read-failed"`,
`"write-failed"`, or `"conflict"` (a refused conditional commit).

`save(value, expected)` receives the `AutosaveRevision` captured by
`readExternal`. The backend must atomically compare its content and revision
and write only on a match. Return `AutosaveSaveResult`: `{ mtimeMs? }` or
`{ status: "conflict", cause? }`. A successful writer may resolve `void`.
Reporting `mtimeMs` advances the conflict baseline. Without `readExternal`,
`expected` is undefined and the writer provides its own concurrency control.

`useAutosaveDoc` retains unsaved machines by `resetKey` across document switches
and unmounts. Use a stable, unique document key to reopen a retained draft;
omitting it gives the hook a private identity that cannot be reopened after
unmount. An optional stable `owner` object scopes keys to a vault or session;
keep it outside the component to recover drafts after remount. The default
owner is shared by browser hooks in this module. Server renders use private
owners. Retention is in memory, not across a page reload. Retired writes keep
retrying; conflicts and read failures wait for reopening and `saveNow()` or `discardExternal()`. Only clean or saved retired
machines are disposed.

`KnowledgeGraph` is not here. It ships from
[`@smthrs/ui/adapters/knowledge-graph`](#knowledge-graph).

## Chart

`@smthrs/ui/adapters/chart`. Pulls in `recharts`.

```ts
function chartConfig(series: ReadonlyArray<{ key: string; label?: ReactNode }>): ChartConfig
function chartSeriesColor(index: number, theme?: "light" | "dark"): string

const CHART_SERIES: ReadonlyArray<{ readonly light: string; readonly dark: string }>
```

`ChartProvider`, `ChartContainer`, `ChartTooltip`, `ChartTooltipContent`,
`ChartLegend`, and `ChartLegendContent` are the shadcn chart contract over
Recharts. `ChartConfig` maps a series key to a label, an icon, and either a
color or a light and dark pair.

`CHART_SERIES` is eight validated slots in fixed order. `chartSeriesColor`
clamps an index past the palette to the last slot rather than cycling: fold
extra series into an "Other" bucket or facet the chart.

## Terminal

`@smthrs/ui/adapters/terminal`. Pulls in `@xterm/xterm` and `@xterm/addon-fit`.

```ts
function terminalThemeFor(palette: ResolvedPalette, mode: TerminalColorTheme): ITheme

type TerminalWriter = (data: string | Uint8Array) => void
type TerminalStream = (write: TerminalWriter) => void | (() => void)
type TerminalColorTheme = "dark" | "light"
type TerminalInstance = XTerminal
type TerminalModules = { Terminal: typeof XTerminal; FitAddon: typeof FitAddon }
type TerminalError = { code: "terminal-start-failed"; cause: unknown }
```

`Terminal` (`TerminalProps`) owns the emulator, the fit addon, theming, and
resize. `lines` writes a snapshot once; `stream` subscribes to live output and
may return a teardown; `onData` carries keystrokes out; `onResize` fires after
every fit; `onReady` hands back the raw xterm.js instance. `theme`, `palette`,
and `colors` override the theme resolved from the document. `readOnly`,
`scrollback`, `fontSize`, `fontFamily`, and `cursorBlink` configure the
emulator.

When the emulator cannot start, `onError` receives a `TerminalError` with the
original cause. If no emulator opened, the surface sets `data-state="failed"`
and renders a `role="alert"` message instead of staying blank. `loadModules`
replaces the dynamic `@xterm/*` imports.

The xterm base stylesheet is vendored as a string and injected through the same
seam as the rest of the library, so a host must not import
`@xterm/xterm/css/xterm.css`.

## Terminal frame

`@smthrs/ui/adapters/terminal-frame`. xterm.js and its fit addon run in an
opaque-origin frame; the page bundles them only as the frame runtime's text.

```ts
function TerminalFrame(props: TerminalFrameProps): JSX.Element

type TerminalFrameProps = Omit<ComponentProps<"div">, "children" | "title" | "onInput" | "onResize" | "ref"> & {
  title: string
  theme: TerminalFrameTheme
  readOnly?: boolean
  stream: TerminalFrameStream
  onInput: (data: string) => void
  onResize: (cols: number, rows: number) => void
  onKey?: (key: TerminalFrameKey) => void
  onLink?: (url: string) => void
  runtime?: string
  ref?: Ref<TerminalFrameHandle>
}
type TerminalFrameStream = (write: TerminalFrameWriter) => () => void
type TerminalFrameWriter = { readonly output: (bytes: Uint8Array | string) => void }
type TerminalFrameHandle = { readonly focus: () => void }
type TerminalFrameKey = { key: string; metaKey: boolean; ctrlKey: boolean; shiftKey: boolean; altKey: boolean }
type TerminalFrameTheme = "light" | "dark"

const terminalFrameRuntime: string
```

`TerminalFrame` shows `<iframe sandbox="allow-scripts" srcdoc
referrerPolicy="no-referrer">` with the document `ViewCsp.frameDocument`
writes: the frame runtime is its only script, pinned by hash, and
`connect-src 'none'` leaves the frame no network. `style-src 'unsafe-inline'`
stays, because xterm.js injects `<style>` elements and writes 24-bit colors
as `style` attributes. The frame mounts only while it is within 200 px of the
screen, with a new nonce and document each time.

The frame asks with `terminal/initialize` and its nonce. The page answers
only its own frame's `contentWindow`, only with this mount's nonce and only
once, and transfers a `MessagePort`; everything after uses the port.

| Message | Direction | Params |
| --- | --- | --- |
| `terminal/initialize` | frame to page, window | `{ nonce }`; the answer's `result` is `{ theme, colors, readOnly }` |
| `terminal/output` | page to frame | `{ bytes }`, a transferred `Uint8Array` |
| `terminal/options` | page to frame | `{ theme, colors, readOnly }`, after any changes |
| `terminal/focus` | page to frame | `{}` |
| `terminal/input` | frame to page | `{ data }`, at most 1 MiB |
| `terminal/resize` | frame to page | `{ cols, rows }`, first and after each fit that changes them |
| `terminal/key` | frame to page | a `TerminalFrameKey`, for ⌘K and Ctrl+K only |
| `terminal/link` | frame to page | `{ url }`, an `http:` or `https:` URL of at most 2048 characters |

`stream` runs each time the frame connects; its teardown runs when the frame
unmounts or leaves the screen. `output` transfers a `Uint8Array` that spans
its whole buffer, so the caller must not reuse it; anything else is copied,
and a string is sent as UTF-8. `colors` is the terminal palette for `theme`
from the document's `data-palette`.

`readOnly` sets xterm's `disableStdin` and removes the frame's input listener,
and the page drops any `terminal/input` while it is set. ⌘K and Ctrl+K reach
`onKey` and never the shell; Esc stays in the shell. A link is posted only for
a person's click on an OSC 8 link or a URL in the text, and the page acts on
it only while it has the person's activation: `onLink`, or by default
`window.open(url, "_blank", "noopener,noreferrer")`. The frame loads no
clipboard (OSC 52) addon and follows no link itself. `ref.focus()` focuses the
terminal.

## Code view

`@smthrs/ui/adapters/code-view`. Pulls in `@pierre/diffs` and Shiki.

```ts
function languageForFile(name: string): string | null

const CODE_VIEW_REST_MS: 300
const CODE_VIEW_POOL_DEADLINE_MS: 15000
const currentCodeViewPool: () => CodeViewPool
const subscribeCodeViewPool: (listener: () => void) => () => void
```

`CodeFileView` (`CodeFileViewProps`) renders one file: `name` supplies the
grammar, `contents` the text, `line` a 1-based anchor that is marked and
scrolled into view, `lineEnd` widens the mark to the range from `line` to it,
and `mode` and `palette` override the document's theme.
`annotations` (`CodeLineAnnotation`) render under their lines, and the consumer
must memoize the array because a new one redraws the rows. `onTokenRest` fires
once per token after the pointer rests for `CODE_VIEW_REST_MS`, reporting a
`CodeTokenPosition`.

`languageForFile` answers `null` when no grammar claims the name, which is the
signal to keep your own plain text. Until the highlighter paints, the component
renders a plain `<pre>`.

## Repo view

`@smthrs/ui/adapters/repo-view`. Pulls in `@pierre/diffs`, Shiki and
`@milkdown/*`, through the code view and the Markdown editor.

```ts
type RepoViewLocation = { kind: "tree" | "blob"; path: string; line?: number; lineEnd?: number }
type RepoViewTree =
  | { state: "loading" }
  | { state: "ready"; paths: ReadonlyArray<string>; truncated?: boolean }
  | { state: "failed"; message: ReactNode }
type RepoViewFile =
  | { state: "loading" }
  | { state: "text"; contents: string; size: number }
  | { state: "binary"; size: number }
  | { state: "too-large"; size: number }
  | { state: "failed"; message: ReactNode }
type RepoViewSize = "inline" | "full"
type RepoViewMarkdownMode = "preview" | "source"
```

`RepoView` (`RepoViewProps`) is a repository browser. It shows the file tree
beside a directory's listing and its README, or a file as code or as a
Markdown document.

- **It fetches nothing.**
  - `tree` is every file's path at the revision.
  - `file` is the file at a `blob` location.
  - `readme` (`{ path, file }`) is a directory's README, which the host
    chooses.
- **The host owns the location.** `location` says where the view is, `href`
  builds every link, and `onNavigate` takes a plain click on any of them,
  including a relative link in a Markdown document, which resolves against the
  repository as GitHub resolves it. One view therefore serves a routed page
  and a conversation.
- **`size`:** `full` (the default) puts the tree beside the content. `inline`
  drops the tree and bounds the content's height. Below 720 px of its own
  width, a `full` view drops the tree too: the view measures its container,
  not the window.
- **The tree's open directories:** `expanded` and `onToggle`. Uncontrolled,
  the view opens the location's directories as it navigates; a host that
  controls `expanded` does the same.
- **Markdown:** a file renders as a read-only WYSIWYG document by default.
  Preview and Code switch it to its source and back, through `markdownMode`
  and `onMarkdownModeChange`, controlled or not.
- **The host's slots:** `revision` leads the header, `actions` trails it,
  `summary` sits between the header and the content, and `fileActions` trails
  a file's toolbar.
- **Other props:** `codeMode` sets the code theme. `markdownEditor` passes the
  editor's `fallback` and `loadEditor` seams.
- **States:**
  - A tree or file still `loading` shows a spinner.
  - A `failed` one shows its message as an alert.
  - A location that isn't in the tree shows "Not found".
  - A binary or too-large file shows its size.

## Pierre diff view

`@smthrs/ui/adapters/pierre-diff-view`. Pulls in `@pierre/diffs` and Shiki.

```ts
function patchToCodeViewItems(patch: string, selectedPath?: string | null): CodeViewItem[]
function diffsThemeForMode(mode: PierreDiffMode, palette?: ResolvedPalette): DiffsThemeNames
function diffStyleForLayout(layout: PierreDiffLayout): "split" | "unified"
function normalizeDiffPath(path: string | undefined): string

type PierreDiffMode = "light" | "dark"
type PierreDiffLayout = "split" | "inline"
```

`PierreDiffView` (`PierreDiffViewProps`) renders a unified patch: `layout`
chooses side by side against unified, `selectedPath` narrows a multi-file patch
to one file, and `emptyLabel` covers an empty or unparseable patch.

`normalizeDiffPath` decodes git's quoted, octal-escaped path form and strips a
leading `a/` or `b/`, which is why `selectedPath` compares equal across all four
spellings of a name.

Syntax token colors follow the resolved `mode` and `palette`, which default to
the document's theme and palette. `diffsThemeForMode` selects
`themeRegistry[palette].syntax.shikiLight` or `shikiDark` for light or dark mode.
Calling the helper without a palette uses `"paper"`, the registered Paper
palette. Set it explicitly on the component:

```tsx
<PierreDiffView patch={patch} palette="paper" />
```

Registered palettes select bundled Shiki themes. The adapter exposes no
registration prop for custom unregistered themes; those require a separate
highlighter and worker registration path.

## Markdown editor

`@smthrs/ui/adapters/markdown-editor`. Pulls in `@milkdown/*`.

```ts
function supportsRichTextEditing(): boolean

const markdownEditorCss: string
const MARKDOWN_EDITOR_STYLE_ATTR: string

type MarkdownEditorErrorCode = "editor-load-failed" | "editor-create-failed"
```

`MarkdownEditor` (`MarkdownEditorProps`) takes `value` as the initial document,
not a controlled value, and reports edits through `onChange`. `resetKey` forces
a re-seed when the host switches documents. `loadEditor`
(`MarkdownEditorModule`) is the injectable module loader, which is how a test or
a host with its own build drives the rich path. `escapeTabOrder` defaults to
true so Tab moves focus out rather than trapping a keyboard user. `fallback`
forces the textarea or the rich editor, overriding the
`supportsRichTextEditing` probe. `onLinkClick` receives a clicked link's
`href` as written in the markdown; returning true stops the browser from
following it, which is how a host opens a document's relative links itself.
`MarkdownEditorHandle` exposes `getMarkdown` and the imperative seams.
Images stay inline Markdown images, so their alt text and title round-trip
unchanged. Crepe's image block is off because it saves its display ratio as
the alt text.

`MarkdownEditorStyles` ships the Crepe theme through the library's style seam.
`MarkdownEditorError` carries a `code` and the original `cause`; both codes are
described in [Failure codes and limits](./reference/contracts.md).

## Knowledge graph

`@smthrs/ui/adapters/knowledge-graph`. Pulls in `d3-force`.

`KnowledgeGraph` (`KnowledgeGraphProps`) renders the vault graph over a force
simulation. The graph math it draws is not behind this subpath:
`computeGraphModel`, `nodeRadius`, `folderTint`, and `neighbourSet` are on the
base barrel, so a host can compute a graph without loading the renderer.

Under `prefers-reduced-motion: reduce` the graph skips the animated frames and
settles the layout in batches with an 8 ms budget checked after each tick,
yielding between batches and painting once the layout is settled. A single
tick can exceed the budget. Unmounting or changing the graph cancels pending
batches. `scheduleSettle` replaces the yield
(`requestIdleCallback`, falling back to `setTimeout`) and `loadPhysics`
replaces the lazy `d3-force` import; a rejecting loader renders the hub list.

## App operations

`@smthrs/ui/app-operations` declares Smithers acts apart from any host that
runs them. It is not on the root barrel.

An `Operation` is a name, an Effect Schema `input`, and the rules every host
applies: `summary`, `args`, `requires`, `confirm`, `userOnly` with its
`userOnlyReason`, `runtime`, `hosts`, and `form` hints. It has no handler.
`operation(declaration)` returns the declaration with its literal type, so a
host binding reads the exact input schema. `NoInput` is the input of an
operation that takes nothing.

A host binds its own implementation to each operation. The app binds
controller calls with an exhaustive handler map, so an operation without a
handler does not compile. A user-only operation is never offered to a model
or a robot; a consequential one sets `confirm` instead, so a model may ask and
the human confirms.

`@smthrs/ui/app-operations/wiki` exports `wikiSurfaceOperations` and
`wikiOperations`, the Wiki acts in registration order, with
`WIKI_DISPLAY_NAME` and the user-only reasons they quote.

## Generated views

Decision 0004's UI: views an agent writes, shown without running its code in
the page. See [show a generated view](./guides/show-a-generated-view.md) and
[`@smthrs/views`](../views/docs/api.md).

```ts
function GeneratedView(props: GeneratedViewProps): JSX.Element

type GeneratedViewProps = Omit<ComponentProps<"div">, "children" | "title"> & {
  html: string
  interactions: Interactions.Declared
  title: string
  theme: "light" | "dark"
  size?: "inline" | "full"                    // default "inline"
  onInteraction: (interaction: GeneratedViewInteraction) => void
  onRefused?: (reason: Bridge.Refusal) => void
  runtime?: string                            // default frameRuntime
  styles?: string                             // default the component sheet with its theme
  now?: () => number                          // default Date.now
}

type GeneratedViewInteraction =
  | { _tag: "State"; event: { name: string; arg?: string } }
  | { _tag: "Message"; event: { name: string; arg?: string }; label: string; values: Record<string, string | number | boolean> }
```

`GeneratedView` shows `html` in `<iframe sandbox="allow-scripts" srcdoc>`,
written by `ViewCsp.frameDocument` with a fresh nonce on each mount. It
answers one `ui/initialize`, from its own frame with that nonce, with the
HTML, theme and size and a `MessagePort`; every later message passes
`Bridge.receive`. A changed `html` or `theme` goes to the frame as
`ui/notifications/host-context-changed`. `inline` takes the reported height,
80 to 480 pixels; `full` fills its container. The frame mounts only while it
is near the screen.

| Export | What it is |
| --- | --- |
| `frameRuntime` | the frame runtime as one script, generated by `scripts/build-views.mjs` from `src/generated-view/runtime.ts` |
| `sanitizeViewHtml(html, document, parser)` | the frame's sanitizer: an inert `DOMParser` parse, then an allowlist copy into `document` |
| `generatedViewCss` | the component's sheet, part of `smithersUiCss` |
| `loadPresentationBundle()` | `Promise<string>`: the presentation bundle a `PresentationRealm` loads, imported on first use |
| `presentationComponents`, `presentationComponentNames` | the presentation subset, by the name a view imports, and its sorted names |

`node scripts/build-views.mjs` regenerates `frameRuntime` and the presentation
bundle; `tests/views-generated.test.ts` fails while either is stale.

## Templates: forms and issues

```ts
function FlowFormView(props: FlowFormViewProps): JSX.Element

type FlowFormViewProps = Omit<ComponentProps<"section">, "title" | "onSubmit"> & {
  title: string
  schema: unknown                     // a JSON Schema object, or a { schema, definitions } document
  submitLabel: string
  submitted?: boolean
  values?: Readonly<Record<string, unknown>>
  size?: "inline" | "full"
  onSubmit: (submission: FlowFormSubmission) => void
}

type FlowFormSubmission = { text: string; data: Readonly<Record<string, string | number | boolean>>; writeOnly: ReadonlyArray<string> }
```

The `form` template. Its fields come from `schema` through `declaredInput` and
`formFieldsFor`. Submit calls `onSubmit` once with `text` as the submit label;
a required field left blank blocks it. `writeOnly` names the secret fields.
`submitted` disables the form and shows `values`, never a write-only one. A
schema it cannot read shows `Form unavailable`.

```ts
function IssuesView(props: IssuesViewProps): JSX.Element

type IssuesViewProps = Omit<ComponentProps<"section">, "children"> & {
  repo: string
  issues: ReadonlyArray<IssuesViewIssue>
  size?: "inline" | "full"
  href?: (issue: IssuesViewIssue) => string | undefined    // the title becomes an <a href>
  onNavigate?: (issue: IssuesViewIssue, href: string) => void
  loading?: boolean                                        // first sync not complete
  actions?: ReactNode                                      // in the header, such as New issue
}

type IssuesViewIssue = {
  id?: string                                              // the row key; default the number
  number: number | null                                    // null: not numbered yet, shows #–
  title: string
  state: "open" | "closed"
  labels?: ReadonlyArray<string>
  author?: string
  comments?: number
  updatedAt?: string
  pending?: "requested" | "not_sent"                       // a Requested or Not sent chip
}
```

The `issues` template, and the issue list (`/issues`) of apps/mvp decision
0012. Without `href` it shows the issues the host passed in, with no
navigation. With `href`, each title is a link whose href passes `safeHref`; a
plain click calls `onNavigate` after `preventDefault`, and a modified click
(⌘, Ctrl, Shift, Alt, middle button) keeps the browser's behavior. `loading`
sets `aria-busy`, replaces the counts with a `Loading issues` status and, with
no rows, shows placeholders instead of `EmptyState`. A row carries
`data-pending`. An empty list shows `EmptyState`. `inline` scrolls inside 320
pixels.

`declaredInput(document)` and `formFieldsFor(input, hints?, payload?)`, with
their `FieldKind`, `FieldValue`, `FormDraft`, `FormField` and `FormHints`
types, are on the root as well as `@smthrs/ui/flow-form`.

`slashMenu(draft, commands)` and `slashSubmit(text, commands)`, with their
`SlashCommand`, `SlashCompletion`, `SlashMenu` and `SlashSubmit` types, list
what a composer's draft completes to and read a submitted line as a command
run, a refusal or a prompt
([complete slash commands](./guides/complete-slash-commands.md)).

## Issues

One issue's page and the new-issue form (apps/mvp decision 0012). Both are
controlled: the host owns every value and draft, and the components fetch
nothing.

```ts
function ItemConversation(props: ItemConversationProps): JSX.Element
function IssueForm(props: IssueFormProps): JSX.Element

type ItemConversationProps = Omit<ComponentProps<"article">, "children" | "title"> & {
  title: string
  number: number | null                         // null shows #–
  state: "open" | "closed"
  author?: string
  createdAt?: string                            // ISO 8601
  body: string                                  // Markdown
  pending?: "requested" | "not_sent"
  comments: ReadonlyArray<ItemConversationComment>
  externalHref?: string                         // Open on GitHub ↗
  loading?: boolean
  composer?: ItemConversationComposer           // absent: no composer at all
  headingLevel?: 1 | 2 | 3                      // default 1
}

type ItemConversationComment = {
  id: string
  author?: string
  createdAt?: string
  body: string
  pending?: "requested" | "not_sent"
  reason?: string                               // shown only when not_sent
  actions?: ReactNode                           // such as Edit and Discard
}

type ItemConversationComposer = {
  draft: string
  onDraft: (text: string) => void
  onSubmit: () => void
  disabled?: boolean
  label?: string                                // the textarea's name; default "Comment"
}

type IssueFormProps = Omit<ComponentProps<"form">, "children" | "onSubmit"> & {
  title: string
  body: string
  onTitle: (text: string) => void
  onBody: (text: string) => void
  onSubmit: () => void                          // called with the event prevented
  disabled?: boolean
  error?: string                                // an alert under the fields
  submitLabel?: string                          // default "Create issue"
}
```

`ItemConversation` renders an `article` (`data-slot="item-conversation"`,
`data-state`, `data-pending`) named by its title heading: the title with
`#12` or `#–`, an `Open` or `Closed` badge, a `Requested` or `Not sent` chip,
the author, a `RelativeTime`, and `Open on GitHub ↗` in a new tab when
`externalHref` passes `safeHref`. The body and each comment render through
`Markdown` with `variant="document"`, so an HTML comment is dropped and no tag
in the text, a `<script>` included, becomes an element. Comments are an `ol`
labelled `Comments`, each `li` with `data-pending`. The composer is a labelled
`Textarea` and a `Comment` button; the button, ⌘Enter and Ctrl+Enter submit
only while the trimmed draft is non-empty and `disabled` is unset. `loading`
shows a `Loading` status and placeholders, with no header, comments or
composer.

`IssueForm` labels a `Title` input and a `Description` textarea. The submit
button, Enter in the title, and ⌘Enter or Ctrl+Enter in either field submit
only while the trimmed title is non-empty and `disabled` is unset. `error` is a
`role="alert"` paragraph that describes both fields.

`itemConversationCss` is part of `smithersUiCss`.

## Web pages

An outside web page, framed or as a card that opens a new tab. See
[show a web page](./guides/show-a-web-page.md).

```ts
function WebPageView(props: WebPageViewProps): JSX.Element
function WebLinkCard(props: WebLinkCardProps): JSX.Element
function webPageTarget(url: string, hostOrigin?: string): WebPageTarget | null
function framedPageTarget(url: string, hostOrigin?: string): WebPageTarget | null

const WEB_PAGE_SANDBOX: "allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox"
const webPageCss: string

type WebPageViewProps = Omit<ComponentProps<"figure">, "children" | "title" | "ref" | "dangerouslySetInnerHTML"> & {
  url: string
  size?: "inline" | "full"     // default "inline"
  title?: string               // the frame's title; default `Web page from ${host}`
  actions?: ReactNode          // in the bar, before Open in new tab
}

type WebLinkCardProps = Omit<ComponentProps<"section">, "children" | "ref" | "dangerouslySetInnerHTML"> & {
  url: string
  openLabel?: string           // default "Open"
  onOpen?: () => void          // on click; never prevents it
}

type WebPageTarget = { readonly href: string; readonly origin: string; readonly host: string }
```

`WebPageView` renders a `figure` (`data-slot="web-page-view"`, `data-size`):
a `figcaption` with the origin (`web-page-origin`), `actions` and an
`Open in new tab` link (`web-page-open`), then an `iframe` (`web-page-frame`)
with `sandbox` set to `WEB_PAGE_SANDBOX`, `referrerPolicy="no-referrer"`,
`loading="lazy"` and no `allow` attribute. `inline` is 28rem high; `full` fills
its container. `WebLinkCard` renders a `Card` (`web-link-card`) with the origin
(`web-link-origin`) and an anchor styled as a `Button` (`web-link-open`). Both
links have `target="_blank"` and `rel="noopener noreferrer"`.

`webPageTarget`, `WebLinkCard`'s guard, accepts only an absolute `https:` or
`http:` URL with no credentials, and refuses one on `hostOrigin`.
`framedPageTarget`, `WebPageView`'s guard, also refuses `http:` and every page
on the site of `hostOrigin` (its last two labels, or the hostname for an IP
address or a single label); under a public suffix such as `pages.dev` that
over-refuses. An unknown host origin refuses framing, including during SSR;
an explicitly opaque origin (`"null"`) shares no host site. Both components pass `window.location.origin` and, on `null`,
render `EmptyState` titled `Can't show this page` with `data-refused="true"`
and no frame or link. `webPageCss` is part of `smithersUiCss`.

## Agent status

What the agent is doing, and whether it needs the person (apps/mvp decision
0015). Five states, one word and glyph each: `working` (`◌ Working`, brand,
pulsing), `waiting` (`○ Waiting`, quiet), `needs_you` (`◆ Needs you`, gold:
`--warning`), `failed` (`✕ Failed`, ember: `--danger`) and `done` (`✓ Done`).

| Export | Props type | Notes |
| --- | --- | --- |
| `AgentStatusPill` | `AgentStatusPillProps` | `state`, `count` (shown above 1), `onClick` (renders a button), `label` (the button's name). `data-slot="agent-status"`, `data-state`. |
| `NeedsYouCard` | `NeedsYouCardProps` | `kind` (`question` or `approval`), `prompt`, `options`, `value` and `onValueChange` (the app keeps the draft), `onAnswer` (the words or option, or `true` for Approve and `false` for Deny), `sending`, `answered` (collapses to the answer), `focusRequest` (each new value focuses the field and scrolls the card into view). |
| `ToastStack`, `Toast` | `ToastStackProps`, `ToastProps` | The stack is a polite live region, `max` toasts (3) then `+N`. `placement` `fixed` (the default) floats at the bottom-left, full width on a phone; `inline` sits where it is rendered, such as above a composer. A toast has a `tone` (an agent state), a one-line `detail`, at most one `action`, Hide (`onHide`), and `delayed`, which fades it in after 300 ms. |
| `AGENT_STATES`, `AGENT_STATUS_WORDS`, `AGENT_STATUS_GLYPHS`, `isAgentState` | `AgentState` | The vocabulary, most urgent first. |
| `agentStatusTitle(base, count)` | | The tab title: `(2) Smithers` while 2 runs need the person. |
| `answerText(answer)` | `NeedsYouAnswer` | An answer as it reads: the words, `Approved` or `Denied`. |

`agentStatusCss` is part of `smithersUiCss`.

## Runs and flows

A run's page and the card a flow is drafted in (apps/mvp decision 0014). The
host reads the run, redacts and clips each value; these components only show
what they are given, as text. See [show a run](./guides/show-a-run.md).

| Export | Props type | Notes |
| --- | --- | --- |
| `JsonValue` | `JsonValueProps` | `value` (`JsonValueData`: `text`, `bytes` before any clip, `clipped`), `label`, `defaultOpen`. A `<details>` (`data-slot="json-value"`, `data-clipped`) named by the label and size, with a `Clipped` marker; the text in a `<pre>`, pretty-printed when it is whole JSON. Never rendered as markup. |
| `RunHeader` | `RunHeaderProps` | `title`, `state`, `cancelRequested`, `word` (an override such as `On another device`), `startedAtMs`, `finishedAtMs`, `now`, `host`, `actions`, `headingLevel` (1 to 3, default 1). One line: title, the status pill in a polite `role="status"` live region, the elapsed clock (`aria-label="Elapsed"`) and the host. |
| `RunList` | `RunListProps` | `runs` (`RunRow`: `id`, `flow`, `state`, `cancelRequested`, `startedAtMs`, `finishedAtMs`, `href`), `now`, `renderLink(href, children)` (the router's link; a plain `<a>` takes only an href `safeHref` passes), `empty` (default `EmptyState` titled `No runs`). A table labelled `Runs`: flow, status, started, duration. |
| `RunStatusPill` | `RunStatusPillProps` | `state`, `cancelRequested`, `word`. A `Badge` (`data-slot="run-status"`, `data-state`, `data-word`) with the word's glyph and tone. |
| `SpanTree` | `SpanTreeProps` | `steps` (`StepRow`), `selected`, `onSelect`, `now`. A listbox labelled `Steps`, one option per step indented by `depth`: glyph, label, `N attempts` above one, duration. One row takes Tab; arrows, Home and End move; Enter, Space or a click selects. |
| `SpanDetail` | `SpanDetailProps` | `label`, `state`, `attempts` (`AttemptRow`), `input` and `output` (`JsonValueData` or `null`; open), `wait` (`WaitData`: `kind`, `sinceMs`, `wakeAtMs`), `now`, `actions`. Attempts read `1 ✕ unavailable · 2 ✓`. |
| `RunWaterfall` | `RunWaterfallProps` | `steps`, `now`, `selected`, `onSelect` (each bar becomes a button). A list labelled `Timeline`: one bar per step on one axis; an open step runs to `now`, an instant step is a marker. |
| `RunJournal` | `RunJournalProps` | `events` (`JournalRow`: `seq`, `eventType`, `emittedAtMs`, `payload`), `originMs` (default the first record's time), `hasMore`, `onMore` (`More`). A table labelled `Journal`: seq, type, time from the origin, payload collapsed. |
| `FlowDraftView` | `FlowDraftViewProps` | `where`, `name`, `request`, `status` (`DraftStatus` or `null` for the form), `round`, `questions` (`DraftQuestion`: `id`, `text`, `assumed`, `blocking`, `answer`), `answers` (the person's unsent answers; the app keeps them), `files`, `checks` (`DraftCheck`), `failure`, and `onNameChange`, `onRequestChange`, `onStart` (`Draft`), `onAnswerChange`, `onAnswer` (`Answer`, on once an answer changes what the draft holds), `onSave` and `saveDisabled` (`Save`), `onTry` (`Try`), `onPropose` (`Propose`). A button shows only with its handler. Inputs are labelled `Name`, `What it should do` and each question's text; the status line is a polite `role="status"`. |

The pure helpers the components use, for a terminal or a test:

| Export | What it does |
| --- | --- |
| `runWord(state, { cancelRequested })` | `pending` → `Queued`, `running` → `Working`, `suspended` → `Waiting`, each `Stopping` once a stop is requested; `completed` → `Done`, `failed` → `Failed`, `cancelled` → `Stopped`. |
| `RUN_WORDS`, `RUN_WORD_GLYPHS`, `RUN_WORD_TONES`, `isSettled` | The closed vocabulary (`RunWord`), adding `On another device`, `Expired` and `No access`; a glyph and a badge tone per word. `Failed` and `No access` are ember; `Done` is success; `Working` is brand and pulses; the rest are quiet. |
| `STEP_GLYPHS`, `STEP_WORDS` | A step's state (`StepState`: `running`, `completed`, `failed`, `waiting`, `skipped`) as a glyph and a word. |
| `clockDuration(ms)`, `stepDuration(ms)`, `untilWords(atMs, now)`, `offsetWords(atMs, originMs)`, `stepElapsed(step, now)` | `0:42` and `1:02:03`; `12 ms`, `1.2 s`, `42 s`, then a clock; `in 8 s`; `+1.2 s`; a step's elapsed time, to `now` while open. |
| `waterfallBars(steps, now)`, `waterfallAxis(steps, now)` | Each step's bar (`WaterfallBar`: `left` and `width` in percent, `instant`, `open`) on the shared axis. A zero-width axis makes every bar a marker at the start. |
| `attemptWords`, `waitWords` | One attempt (`2 ✓`, `1 ✕ unavailable`); a wait (`timer · since 10s ago · wakes in 1 m`). |
| `jsonValueText`, `formatBytes` | A value's text as shown; `512 B`, `1.5 KB`, `16 KB`. |
| `draftStatusLine`, `questionValue`, `isAssumed`, `changedAnswers` | `◌ Drafting · round 2`, `◆ Needs you`, `✓ Ready`, `✕ Failed`, `✓ Saved`, `✓ Proposed`; what a question's field shows; whether it shows the assumed default; the answers that change the draft. |

`jsonValueCss`, `runPageCss` and `flowDraftViewCss` are part of `smithersUiCss`.

## Related

- [Failure codes and limits](./reference/contracts.md): the codes and bounds
  referenced throughout this page.
- [The adapters boundary](./concepts/adapters.md): what the six adapter
  subpaths cost.
- [Troubleshooting](./troubleshooting.md): symptoms and fixes.

## Clipboard (`@smthrs/ui/copy`)

This isolated entry point exports `copyText`, `CopyResult`, and `CopyFailureCode` without importing Vault or autosave. Views import `copyText` from this subpath. The root export remains available. See [clipboard contracts](./reference/contracts.md#clipboard).
