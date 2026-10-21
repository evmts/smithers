/** @jsxImportSource react */
import type { MouseEvent } from "react";
import { isPlainNavigationClick } from "../internal/navigationClick";
import { safeHref } from "../internal/safeHref";

/** A link an item carries, such as its branch or its pull request. */
export type ItemLinkTarget = {
  readonly label: string;
  /** Through `safeHref`. An `http(s)` link opens in a new tab; any other is in-app. */
  readonly href: string;
};

/**
 * One item link: an `http(s)` link opens in a new tab; an in-app one calls
 * `onNavigate` on a plain left click, after `preventDefault`, and is the
 * browser's on a modified click or without `onNavigate`. An unsafe link
 * renders nothing.
 */
export function ItemLink({
  link,
  onNavigate,
  className,
}: {
  readonly link: ItemLinkTarget;
  readonly onNavigate?: ((href: string) => void) | undefined;
  readonly className: string;
}) {
  const target = safeHref(link.href);
  if (target === undefined) return null;
  if (/^https?:\/\//i.test(target)) {
    return (
      <a className={className} href={target} target="_blank" rel="noopener noreferrer">
        {link.label}
      </a>
    );
  }
  const follow = (event: MouseEvent<HTMLAnchorElement>) => {
    if (onNavigate === undefined || !isPlainNavigationClick(event)) return;
    event.preventDefault();
    onNavigate(target);
  };
  return (
    <a className={className} href={target} onClick={follow}>
      {link.label}
    </a>
  );
}
