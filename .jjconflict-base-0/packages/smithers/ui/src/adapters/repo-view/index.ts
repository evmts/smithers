/**
 * `@smthrs/ui/adapters/repo-view`
 *
 * A repository browser: file tree, directory listing with its README, and a
 * file as highlighted code or a rendered Markdown document. It composes the
 * code-view (`@pierre/diffs`) and markdown-editor (`@milkdown/*`) adapters, so
 * it ships behind this explicit subpath and the base barrel never reaches it.
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
