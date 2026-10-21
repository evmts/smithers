/** @jsxImportSource react */
import type { Home } from "@smthrs/views";
import type { ComponentProps, MouseEvent, ReactNode } from "react";
import { Button } from "../button";
import { cn } from "../cn";
import { isPlainNavigationClick } from "../internal/navigationClick";
import { safeHref } from "../internal/safeHref";
import { Markdown } from "../primitives/markdown";
import { Spinner } from "../spinner";
import { useInjectUiCss } from "../styles";

/** A markdown block's file as the host has read it so far. */
export type RepositoryHomeFile =
  | { readonly state: "loading" }
  | { readonly state: "text"; readonly text: string }
  | { readonly state: "failed" };

export type RepositoryHomeProps = Omit<ComponentProps<"section">, "children"> & {
  /** The declared blocks, in order, as `Home.read` from `@smthrs/views` answered them. */
  blocks: ReadonlyArray<Home.Block>;
  /** Each markdown block's file, by its repository path; a path absent here shows as loading. */
  files?: Readonly<Record<string, RepositoryHomeFile>>;
  /** Where a prompt or app block's button goes: a real link. Without it, prompt and app blocks aren't drawn. */
  askHref?: string;
  /**
   * A plain click on a prompt or app button: the block's `flow`, if any. The
   * click's default is prevented, so the host navigates to `askHref` itself. A
   * modified click (⌘, Ctrl, Shift, Alt, middle) keeps the browser's own
   * behavior and doesn't call it. Without it, the buttons are plain links.
   */
  onAsk?: (flow: string | undefined) => void;
  /** Whether this page has an app block's flow. An app block whose flow it hasn't is not drawn. Default: none. */
  offered?: (flow: string) => boolean;
};

type Drawn = { readonly key: number; readonly app: boolean; readonly node: ReactNode };

/** An absolute `http` or `https` URL, as `Home.Url` admits; anything else is not drawn. */
const linkHref = (url: string): string | undefined => (/^https?:\/\//i.test(url) ? safeHref(url) : undefined);

/** The file the host holds for `path`, never one an object inherits (`constructor` is a valid path). */
const fileAt = (files: RepositoryHomeProps["files"], path: string): RepositoryHomeFile | undefined =>
  files !== undefined && Object.hasOwn(files, path) ? files[path] : undefined;

const Title = ({ title }: { readonly title: string | undefined }) =>
  title === undefined ? null : <h2 className="sui-repository-home-title">{title}</h2>;

const MarkdownFile = ({ path, file }: { readonly path: string; readonly file: RepositoryHomeFile | undefined }) => {
  if (file === undefined || file.state === "loading") return <Spinner aria-label={`Loading ${path}`} />;
  if (file.state === "failed") {
    return (
      <p role="status" className="sui-repository-home-notice">
        {`Couldn't read ${path}`}
      </p>
    );
  }
  return <Markdown content={file.text} variant="document" />;
};

/**
 * A repository's home: the blocks its `.smithers/home.json` declares, drawn
 * as data. Text is always text, links open in a new tab, a markdown block is
 * the file the host read, and a prompt or app block is a real link to
 * `askHref` that `onAsk` turns into in-app navigation on a plain click.
 * Nothing runs on arrival; a button acts only when pressed.
 *
 * `flows`, `stack` and `view` blocks are not drawn yet: the page has no
 * source for their rows. When no block draws, this renders nothing.
 */
export function RepositoryHome({ blocks, files, askHref, onAsk, offered, className, ...props }: RepositoryHomeProps) {
  useInjectUiCss();

  // With onAsk, a plain click is the host's to navigate; a modified click stays the browser's.
  const ask = (flow: string | undefined) => (event: MouseEvent<HTMLAnchorElement>) => {
    if (onAsk === undefined || !isPlainNavigationClick(event)) return;
    event.preventDefault();
    onAsk(flow);
  };

  const askLink = (flow: string | undefined, label: string, picture?: string) => (
    <Button asChild variant="outline">
      <a href={askHref} data-picture={picture} onClick={ask(flow)}>
        {label}
      </a>
    </Button>
  );

  const draw = (block: Home.Block, key: number): Drawn | null => {
    const shell = (children: ReactNode, title?: string): Drawn => ({
      key,
      app: block.type === "app",
      node: (
        <div key={key} data-slot="repository-home-block" data-kind={block.type} className="sui-repository-home-block">
          <Title title={title} />
          {children}
        </div>
      ),
    });
    switch (block.type) {
      case "text":
        return shell(<p className="sui-repository-home-text">{block.text}</p>, block.title);
      case "links": {
        const links = block.links.flatMap((link, index) => {
          const href = linkHref(link.url);
          return href === undefined
            ? []
            : [
                <li key={index}>
                  <a className="sui-repository-home-link" href={href} target="_blank" rel="noopener noreferrer">
                    {link.label}
                  </a>
                </li>,
              ];
        });
        return links.length === 0 ? null : shell(<ul className="sui-repository-home-links">{links}</ul>, block.title);
      }
      case "markdown":
        return shell(<MarkdownFile path={block.path} file={fileAt(files, block.path)} />, block.title);
      case "prompt":
        return askHref === undefined ? null : shell(askLink(block.flow, block.placeholder ?? "Ask Smithers"), block.title);
      case "app":
        return askHref === undefined || offered === undefined || !offered(block.flow)
          ? null
          : shell(askLink(block.flow, block.title, block.picture));
      // No source for their rows in this slice: the catalog, the stack and the realm come later.
      case "flows":
      case "stack":
      case "view":
      default:
        return null;
    }
  };

  const drawn = blocks.flatMap((block, index) => {
    const one = draw(block, index);
    return one === null ? [] : [one];
  });
  if (drawn.length === 0) return null;

  // Adjacent app blocks share one wrapping row.
  const rows: Array<ReactNode> = [];
  for (let index = 0; index < drawn.length; ) {
    const first = drawn[index]!;
    if (!first.app) {
      rows.push(first.node);
      index += 1;
      continue;
    }
    const run: Array<ReactNode> = [];
    while (index < drawn.length && drawn[index]!.app) run.push(drawn[index++]!.node);
    rows.push(
      <div key={`apps-${first.key}`} data-slot="repository-home-apps" className="sui-repository-home-apps">
        {run}
      </div>,
    );
  }

  return (
    <section data-slot="repository-home" className={cn("sui-repository-home", className)} {...props}>
      {rows}
    </section>
  );
}
