/** @jsxImportSource react */
// The package's sheet: rendered once by a host, injected by the views otherwise, never twice, and held to
// @smthrs/ui's theming contract (tokens only, no page-level token block, `sui-` classes).
import { afterEach, describe, expect, test } from "bun:test";
import { act, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { PierreDiffView, REPO_VIEW_STYLE_ATTR, repoViewCss, RepoViewStyles } from "../src/index";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const sheets = () => document.querySelectorAll(`style[${REPO_VIEW_STYLE_ATTR}]`);
let root: Root | undefined;
let container: HTMLElement | undefined;

afterEach(async () => {
  const mounted = root;
  if (mounted) await act(async () => mounted.unmount());
  root = undefined;
  container?.remove();
  container = undefined;
  sheets().forEach((element) => element.remove());
});

const mount = async (element: ReactElement): Promise<void> => {
  container = document.createElement("div");
  document.body.appendChild(container);
  const created = createRoot(container);
  root = created;
  await act(async () => created.render(element));
};

describe("RepoViewStyles", () => {
  test("renders the sheet under its marker attribute, where effects never run", () => {
    expect(renderToStaticMarkup(<RepoViewStyles />)).toBe(`<style ${REPO_VIEW_STYLE_ATTR}="">${repoViewCss}</style>`);
  });

  test("a view rendered beside it injects nothing more", async () => {
    await mount(
      <>
        <RepoViewStyles />
        <PierreDiffView patch="" />
      </>,
    );
    expect(sheets()).toHaveLength(1);
  });

  test("without it, two views inject the sheet once", async () => {
    await mount(
      <>
        <PierreDiffView patch="" />
        <PierreDiffView patch="" />
      </>,
    );
    expect([...sheets()].map((element) => element.textContent)).toEqual([repoViewCss]);
    expect(document.head.contains(sheets()[0]!)).toBe(true);
  });
});

describe("the sheet's theming contract", () => {
  test("emits no page-level token block", () => {
    expect(repoViewCss).not.toContain(":root");
  });

  test("reads every color from a house token: no raw hex outside a var() fallback", () => {
    const stripped = repoViewCss.replace(/var\(--[\w-]+(?:,\s*(?:#[0-9a-fA-F]{3,8}|rgba?\([^)]*\)|[\w\s.%-]+))?\)/g, "VAR");
    expect(stripped).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(stripped).not.toMatch(/rgba?\(/);
  });

  test("namespaces every class `sui-`", () => {
    const classes = repoViewCss.match(/\.[a-zA-Z][\w-]*/g) ?? [];
    expect(classes.length).toBeGreaterThan(20);
    expect(classes.filter((name) => !name.startsWith(".sui-"))).toEqual([]);
  });
});
