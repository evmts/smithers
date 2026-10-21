/** @jsxImportSource react */
import { useLayoutEffect, useRef } from "react";
import { MarkdownEditor, type MarkdownEditorHandle, type MarkdownEditorProps } from "./MarkdownEditor";

export type LiveMarkdownEditorProps = Omit<MarkdownEditorProps, "onChange"> & {
  /** The person changed the document: the new Markdown, and the Markdown it was made on (`base`). */
  readonly onChange?: (markdown: string, edit: { readonly base: string }) => void;
};

/**
 * `MarkdownEditor` over a document several people edit at once. `value` is
 * the document as everyone wrote it: a change from outside goes in through
 * `setMarkdown`, which keeps the person's caret and never echoes back out,
 * and each of the person's own edits comes out with the Markdown it was made
 * on, so the host can merge it with edits that arrived meanwhile.
 */
export function LiveMarkdownEditor({ value, onChange, ...props }: LiveMarkdownEditorProps) {
  const editor = useRef<MarkdownEditorHandle>(null);
  // The document as this editor last had it: the base of the person's next edit.
  const known = useRef(value);
  useLayoutEffect(() => {
    if (value === known.current) return;
    known.current = value;
    editor.current?.setMarkdown(value);
  }, [value]);
  return (
    <MarkdownEditor
      {...props}
      ref={editor}
      value={value}
      onChange={(markdown) => {
        const base = known.current;
        known.current = markdown;
        onChange?.(markdown, { base });
      }}
    />
  );
}
