/** @jsxImportSource react */
import {
  type BreadcrumbItem,
  Breadcrumbs,
  cn,
  DirectoryListing,
  type DirectoryTarget,
  FileTree,
  isPlainNavigationClick,
  Spinner
} from "@smthrs/ui";
import { type ComponentProps, type ReactNode, useMemo, useState } from "react";
import { CodeFileView, type CodeViewMode } from "./CodeFileView";
import { MarkdownEditor, type MarkdownEditorProps } from "./MarkdownEditor";
import {
  ancestorsOf,
  directoriesOf,
  directoryEntries,
  formatBytes,
  isMarkdown,
  lineCount,
  parentOf,
  resolveLink,
  treeOrder
} from "./paths";
import { useInjectRepoViewCss } from "./styles";

/**
 * What the view shows: a directory (`tree`) or a file (`blob`), by its full
 * path at the revision. `""` is the root directory. `line` anchors a file at
 * a 1-based line, and `lineEnd` widens the mark to a range.
 */
export type RepoViewLocation = {
  readonly kind: "tree" | "blob";
  readonly path: string;
  readonly line?: number | undefined;
  readonly lineEnd?: number | undefined;
};

/** The repository's file list at the revision, as the host has loaded it. */
export type RepoViewTree =
  | { readonly state: "loading" }
  | {
    readonly state: "ready";
    /** Every file's full path. Directories are implied by the paths under them. */
    readonly paths: ReadonlyArray<string>;
    /** The host stopped listing before the end: the view says so under the tree. */
    readonly truncated?: boolean | undefined;
  }
  | { readonly state: "failed"; readonly message: ReactNode };

/** One file's contents, as the host has loaded them. Sizes are in bytes. */
export type RepoViewFile =
  | { readonly state: "loading" }
  | { readonly state: "text"; readonly contents: string; readonly size: number }
  | { readonly state: "binary"; readonly size: number }
  | { readonly state: "too-large"; readonly size: number }
  | { readonly state: "failed"; readonly message: ReactNode };

/** How a Markdown file shows: rendered as a document, or as its source. */
export type RepoViewMarkdownMode = "preview" | "source";

/**
 * `full` is the page: the file tree beside the content. `inline` fits in a
 * conversation: no tree, and the content scrolls inside a bounded height.
 */
export type RepoViewSize = "inline" | "full";

export type RepoViewProps = Omit<ComponentProps<"section">, "children"> & {
  /** The repository's name: the first step of the path trail. */
  name: string;
  tree: RepoViewTree;
  location: RepoViewLocation;
  /** The file at `location` when it is a `blob`. */
  file?: RepoViewFile | undefined;
  /** A directory's README, rendered under its listing. */
  readme?: { readonly path: string; readonly file: RepoViewFile } | undefined;
  /** Defaults to `full`. */
  size?: RepoViewSize | undefined;
  /** The URL of a location, so every link in the view is a real link. */
  href: (location: RepoViewLocation) => string;
  /** In-app navigation: a plain click on a link in the view, or a relative link in a README. */
  onNavigate: (location: RepoViewLocation) => void;
  /**
   * The tree's open directories, controlled. Absent, the view keeps its own,
   * starting with the location's ancestors and opening a location's
   * ancestors as it navigates. A host that controls it does the same.
   */
  expanded?: ReadonlySet<string> | undefined;
  /** A tree directory was opened or closed. */
  onToggle?: ((path: string, expanded: boolean) => void) | undefined;
  /** Controlled Markdown mode. Absent, the view keeps its own, starting at `preview`. */
  markdownMode?: RepoViewMarkdownMode | undefined;
  onMarkdownModeChange?: ((mode: RepoViewMarkdownMode) => void) | undefined;
  /** Leading the header, before the path trail: the revision, such as a branch name. */
  revision?: ReactNode;
  /** Trailing the header: the view's actions, such as Copy permalink or Open. */
  actions?: ReactNode;
  /** A row between the header and the content, such as the latest commit. */
  summary?: ReactNode;
  /** Trailing a file's toolbar, such as a Raw link. */
  fileActions?: ReactNode;
  /** Code theme mode; defaults to the page's. */
  codeMode?: CodeViewMode | undefined;
  /**
   * The Markdown editor's seams, for a host that bundles its own Milkdown
   * build or for a test: `fallback` forces the textarea (`true`) or the
   * WYSIWYG editor (`false`), and `loadEditor` supplies the editor modules.
   */
  markdownEditor?: Pick<MarkdownEditorProps, "fallback" | "loadEditor"> | undefined;
};

/** The path trail: the repository, then each directory, then the file. Every step but the last is a directory. */
function trail(name: string, location: RepoViewLocation, href: RepoViewProps["href"]): ReadonlyArray<BreadcrumbItem> {
  const parts = location.path.split("/").filter(Boolean);
  const steps = parts.map((part, index): BreadcrumbItem => {
    const path = parts.slice(0, index + 1).join("/");
    return { key: path, label: part, href: href({ kind: "tree", path }) };
  });
  return [{ key: "", label: name, href: href({ kind: "tree", path: "" }) }, ...steps];
}

/** A file's body for each loading state. */
function FileBody({ path, file, markdownMode, line, lineEnd, codeMode, markdownEditor, onLink }: {
  path: string;
  file: RepoViewFile;
  markdownMode: RepoViewMarkdownMode;
  line: number | undefined;
  lineEnd: number | undefined;
  codeMode: CodeViewMode | undefined;
  markdownEditor: RepoViewProps["markdownEditor"];
  onLink: (href: string) => boolean;
}) {
  switch (file.state) {
    case "loading":
      return <div className="sui-repo-note"><Spinner /></div>;
    case "failed":
      return <div className="sui-repo-note" role="alert">{file.message}</div>;
    case "binary":
      return <div className="sui-repo-note">Binary file</div>;
    case "too-large":
      return <div className="sui-repo-note">Too large to show</div>;
    case "text":
      if (file.contents === "") return <div className="sui-repo-note">Empty file</div>;
      return isMarkdown(path) && markdownMode === "preview" ?
        (
          <MarkdownEditor
            {...markdownEditor}
            value={file.contents}
            resetKey={path}
            readOnly
            aria-label={path}
            onLinkClick={onLink}
          />
        ) :
        (
          <CodeFileView
            className="sui-repo-code"
            name={path}
            contents={file.contents}
            line={line}
            lineEnd={lineEnd}
            mode={codeMode}
          />
        );
  }
}

/** The file's stats: lines and size for text, size alone otherwise. */
function stats(file: RepoViewFile): string | undefined {
  switch (file.state) {
    case "text":
      return `${lineCount(file.contents)} lines · ${formatBytes(file.size)}`;
    case "binary":
    case "too-large":
      return formatBytes(file.size);
    default:
      return undefined;
  }
}

/**
 * A repository browser: the file tree, a directory's listing with its README,
 * and a file, highlighted as code or rendered as a Markdown document. It
 * fetches nothing: the host passes the file list and the files it loaded, and
 * owns where the view is (`location`) and how it gets there (`href`,
 * `onNavigate`), so the same view serves a routed page and a conversation.
 *
 * Code renders through {@link CodeFileView} (`@pierre/diffs`, Shiki) and
 * Markdown through {@link MarkdownEditor} (Milkdown), read-only, which is why
 * this view ships in `@smthrs/repo-view` and not in `@smthrs/ui`.
 */
export function RepoView({
  name,
  tree,
  location,
  file,
  readme,
  size = "full",
  href,
  onNavigate,
  expanded: controlledExpanded,
  onToggle,
  markdownMode: controlledMarkdownMode,
  onMarkdownModeChange,
  revision,
  actions,
  summary,
  fileActions,
  codeMode,
  markdownEditor,
  className,
  ...props
}: RepoViewProps) {
  useInjectRepoViewCss();
  const [ownExpanded, setOwnExpanded] = useState<ReadonlySet<string>>(() =>
    new Set([...ancestorsOf(location.path), ...(location.kind === "tree" && location.path !== "" ? [location.path] : [])])
  );
  const [ownMarkdownMode, setOwnMarkdownMode] = useState<RepoViewMarkdownMode>("preview");
  const expanded = controlledExpanded ?? ownExpanded;
  const markdownMode = controlledMarkdownMode ?? ownMarkdownMode;
  const paths = tree.state === "ready" ? tree.paths : undefined;
  const ordered = useMemo(() => (paths === undefined ? [] : treeOrder(paths)), [paths]);
  const files = useMemo(() => new Set(ordered), [ordered]);
  const directories = useMemo(() => directoriesOf(ordered), [ordered]);
  const collapsed = useMemo(
    () => new Set([...directories].filter((directory) => !expanded.has(directory))),
    [directories, expanded]
  );

  const go = (next: RepoViewLocation) => {
    if (controlledExpanded === undefined) {
      const opened = [...ancestorsOf(next.path), ...(next.kind === "tree" && next.path !== "" ? [next.path] : [])];
      setOwnExpanded((current) => new Set([...current, ...opened]));
    }
    onNavigate(next);
  };
  const toggle = (path: string, open: boolean) => {
    if (controlledExpanded === undefined) {
      setOwnExpanded((current) => {
        const next = new Set(current);
        if (open) next.add(path);
        else next.delete(path);
        return next;
      });
    }
    onToggle?.(path, open);
  };
  const setMarkdownMode = (mode: RepoViewMarkdownMode) => {
    setOwnMarkdownMode(mode);
    onMarkdownModeChange?.(mode);
  };
  const openTarget = (target: DirectoryTarget) => go({ kind: target.kind === "directory" ? "tree" : "blob", path: target.path });
  const linkFrom = (files: ReadonlyArray<string>, from: string) => (link: string): boolean => {
    const target = resolveLink(from, link, files);
    if (target === undefined) return false;
    go(target);
    return true;
  };

  const content = (() => {
    if (tree.state === "loading") return <div className="sui-repo-note"><Spinner /></div>;
    if (tree.state === "failed") return <div className="sui-repo-note" role="alert">{tree.message}</div>;
    const exists = location.kind === "blob" ?
      files.has(location.path) :
      location.path === "" || directories.has(location.path);
    if (!exists) return <div className="sui-repo-note">Not found</div>;
    if (location.kind === "tree") {
      return (
        <>
          <DirectoryListing
            className="sui-repo-box"
            entries={directoryEntries(tree.paths, location.path)}
            parent={location.path === "" ? undefined : parentOf(location.path)}
            href={(target) => href({ kind: target.kind === "directory" ? "tree" : "blob", path: target.path })}
            onOpen={openTarget}
            label={location.path === "" ? name : location.path}
            empty={<div className="sui-repo-note">Empty repository</div>}
          />
          {readme === undefined ? null : (
            <article className="sui-repo-box sui-repo-readme" aria-label={readme.path}>
              <header className="sui-repo-toolbar">
                <a
                  className="sui-repo-readme-name"
                  href={href({ kind: "blob", path: readme.path })}
                  onClick={(event) => {
                    if (!isPlainNavigationClick(event)) return;
                    event.preventDefault();
                    go({ kind: "blob", path: readme.path });
                  }}
                >
                  {readme.path.split("/").at(-1)}
                </a>
              </header>
              <FileBody
                path={readme.path}
                file={readme.file}
                markdownMode="preview"
                line={undefined}
                lineEnd={undefined}
                codeMode={codeMode}
                markdownEditor={markdownEditor}
                onLink={linkFrom(tree.paths, readme.path)}
              />
            </article>
          )}
        </>
      );
    }
    const shown = file ?? { state: "loading" as const };
    const label = stats(shown);
    return (
      <article className="sui-repo-box sui-repo-file" aria-label={location.path}>
        <header className="sui-repo-toolbar">
          {isMarkdown(location.path) && shown.state === "text" ?
            (
              <div className="sui-repo-segmented" role="group" aria-label="Show as">
                {(["preview", "source"] as const).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    className="sui-repo-segment"
                    aria-pressed={markdownMode === mode}
                    onClick={() => setMarkdownMode(mode)}
                  >
                    {mode === "preview" ? "Preview" : "Code"}
                  </button>
                ))}
              </div>
            ) :
            null}
          {label === undefined ? null : <span className="sui-repo-stats">{label}</span>}
          {fileActions === undefined ? null : <div className="sui-repo-file-actions">{fileActions}</div>}
        </header>
        <FileBody
          path={location.path}
          file={shown}
          markdownMode={markdownMode}
          line={location.line}
          lineEnd={location.lineEnd}
          codeMode={codeMode}
          markdownEditor={markdownEditor}
          onLink={linkFrom(tree.paths, location.path)}
        />
      </article>
    );
  })();

  return (
    <section data-slot="repo-view" data-size={size} className={cn("sui-repo", className)} aria-label={name} {...props}>
      <div className="sui-repo-layout">
        {size === "full" && tree.state === "ready" ?
          (
            <aside className="sui-repo-side" aria-label="Files">
              <FileTree
                nodes={ordered}
                collapsed={collapsed}
                onToggle={toggle}
                selected={location.kind === "blob" ? location.path : null}
                onSelect={(path) => go({ kind: "blob", path })}
              />
              {tree.truncated === true ? <div className="sui-repo-note">More files not shown</div> : null}
            </aside>
          ) :
          null}
        <div className="sui-repo-main">
          <header className="sui-repo-head">
            {revision === undefined ? null : <div className="sui-repo-revision">{revision}</div>}
            <Breadcrumbs
              className="sui-repo-trail"
              aria-label="File path"
              items={trail(name, location, href)}
              onNavigate={(item) => go({ kind: "tree", path: item.key })}
            />
            {actions === undefined ? null : <div className="sui-repo-actions">{actions}</div>}
          </header>
          {summary === undefined ? null : <div className="sui-repo-summary">{summary}</div>}
          <div className="sui-repo-content">{content}</div>
        </div>
      </div>
    </section>
  );
}
