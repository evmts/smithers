/**
 * `@smthrs/repo-view`
 *
 * The heavy views of a repository: the repository browser (`RepoView`), one
 * file highlighted by Shiki (`CodeFileView`), a highlighted diff
 * (`PierreDiffView`) and the Milkdown Markdown editor (`MarkdownEditor`).
 * They live apart from `@smthrs/ui` so a page that shows no code never pays
 * for `@pierre/diffs`, Shiki or Milkdown. Grammars, themes and the editor's
 * modules still load only when a view needs them.
 */
export {
  RepoView,
  type RepoViewFile,
  type RepoViewLocation,
  type RepoViewMarkdownMode,
  type RepoViewProps,
  type RepoViewSize,
  type RepoViewTree,
} from "./RepoView";
export {
  CODE_VIEW_REST_MS,
  CodeFileView,
  languageForFile,
  type CodeFileViewProps,
  type CodeLineAnnotation,
  type CodeTokenPosition,
  type CodeViewMode,
} from "./CodeFileView";
export {
  CODE_VIEW_POOL_DEADLINE_MS,
  currentCodeViewPool,
  disposeCodeViewPool,
  subscribeCodeViewPool,
  type CodeViewPool,
  type CodeViewPoolState,
} from "./workerPool";
export {
  diffStyleForLayout,
  diffsThemeForMode,
  normalizeDiffPath,
  patchToCodeViewItems,
  PierreDiffView,
  type PierreDiffLayout,
  type PierreDiffMode,
  type PierreDiffViewProps,
} from "./PierreDiffView";
export {
  MarkdownEditor,
  MarkdownEditorStyles,
  markdownEditorCss,
  MARKDOWN_EDITOR_STYLE_ATTR,
  supportsRichTextEditing,
  type MarkdownEditorError,
  type MarkdownEditorErrorCode,
  type MarkdownEditorHandle,
  type MarkdownEditorModule,
  type MarkdownEditorProps,
} from "./MarkdownEditor";
export { REPO_VIEW_STYLE_ATTR, repoViewCss, RepoViewStyles } from "./styles";
