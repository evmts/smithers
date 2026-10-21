/** @jsxImportSource react */
import { type ComponentProps, type KeyboardEvent, useId } from "react";
import { Badge } from "../badge";
import { Button } from "../button";
import { cn } from "../cn";
import { Input, Textarea } from "../input";
import { isSubmitChord } from "../item-conversation/ItemConversation";
import { Field, Label } from "../label";
import { useInjectUiCss } from "../styles";
import { AcceptanceList } from "./TodoParts";

export type TodoDraftCardProps = Omit<ComponentProps<"form">, "children" | "onSubmit" | "title"> & {
  /** `owner/name`, shown in the header. */
  repo?: string;
  title: string;
  prompt: string;
  /** Read-only acceptance criteria the agent drafted, if any. */
  acceptance?: ReadonlyArray<string>;
  onTitleChange: (title: string) => void;
  onPromptChange: (prompt: string) => void;
  onCommit: () => void;
  onDiscard: () => void;
  /** Disables Commit while a commit is on its way. */
  committing?: boolean;
  /** Why the stack refused the last commit, as a short chip, such as "Stack full". */
  refused?: string;
  /** The longest title, in characters. Default 120. */
  maxTitleLength?: number;
};

/**
 * A private draft of a TODO that the person edits and commits, controlled:
 * the host owns the title and the prompt. The header reads `Draft` and
 * `Only you`. Commit (the button, Enter in the title, ⌘Enter or Ctrl+Enter in
 * the prompt) always prevents the browser's submission and calls `onCommit`
 * only while no commit is on its way, the trimmed title and prompt are
 * non-empty, and the title fits `maxTitleLength`.
 */
export function TodoDraftCard({
  repo,
  title,
  prompt,
  acceptance,
  onTitleChange,
  onPromptChange,
  onCommit,
  onDiscard,
  committing = false,
  refused,
  maxTitleLength = 120,
  className,
  ...props
}: TodoDraftCardProps) {
  useInjectUiCss();
  const titleId = useId();
  const promptId = useId();
  const canCommit = !committing && title.trim() !== "" && prompt.trim() !== "" && title.length <= maxTitleLength;
  const commit = () => {
    if (canCommit) onCommit();
  };
  return (
    <form
      aria-label="TODO draft"
      data-slot="todo-draft-card"
      className={cn("sui-todo-draft", className)}
      onSubmit={(event) => {
        event.preventDefault();
        commit();
      }}
      {...props}
    >
      <header className="sui-todo-draft-header">
        <span className="sui-todo-draft-name">Draft</span>
        <Badge variant="muted" className="sui-todo-draft-private">
          Only you
        </Badge>
        {repo === undefined ? null : <span className="sui-todo-draft-repo">{repo}</span>}
      </header>
      <Field>
        <Label htmlFor={titleId}>Title</Label>
        <Input
          id={titleId}
          value={title}
          maxLength={maxTitleLength}
          onChange={(event) => onTitleChange(event.target.value)}
          onKeyDown={(event: KeyboardEvent<HTMLInputElement>) => {
            if (event.key !== "Enter" || event.nativeEvent.isComposing) return;
            event.preventDefault();
            commit();
          }}
        />
      </Field>
      <Field>
        <Label htmlFor={promptId}>Prompt</Label>
        <Textarea
          id={promptId}
          value={prompt}
          onChange={(event) => onPromptChange(event.target.value)}
          onKeyDown={(event: KeyboardEvent<HTMLTextAreaElement>) => {
            if (!isSubmitChord(event)) return;
            event.preventDefault();
            commit();
          }}
        />
      </Field>
      {acceptance === undefined || acceptance.length === 0 ? null : <AcceptanceList items={acceptance} />}
      <div className="sui-todo-draft-actions">
        {refused === undefined || refused === "" ? null : (
          <Badge variant="destructive" role="alert" className="sui-todo-draft-refused">
            {refused}
          </Badge>
        )}
        <Button type="submit" disabled={!canCommit}>
          Commit
        </Button>
        <Button variant="ghost" onClick={() => onDiscard()}>
          Discard
        </Button>
      </div>
    </form>
  );
}
