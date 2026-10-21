/** @jsxImportSource react */
import { type KeyboardEvent, useId, useRef, useState } from "react";
import { Button } from "./button";
import { CopyButton } from "./copy-button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "./dialog";
import { Input } from "./input";
import { copyToClipboard } from "./internal/copyToClipboard";
import { personInitial, personLane } from "./internal/person";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./select";
import { useInjectUiCss } from "./styles";

/** What a person, or anyone with the link, may do. */
export type ShareAccess = "view" | "edit";

/**
 * Who else gets in: `restricted` is only the people added; `view` or `edit`
 * is anyone in the group with the link, at that access.
 */
export type ShareGeneral = "restricted" | ShareAccess;

/** One row of "People with access". */
export interface SharePerson {
  readonly id: string;
  readonly name: string;
  readonly access: ShareAccess | "owner";
}

export interface ShareDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  /** Such as "Share test-branch". */
  readonly title: string;
  /** In the order given, owner first. */
  readonly people: ReadonlyArray<SharePerson>;
  /** The viewer's id: that row reads "<name> (you)". */
  readonly self?: string | undefined;
  readonly general: ShareGeneral;
  /** The non-restricted choice, such as "Anyone in this repository with the link". */
  readonly groupLabel: string;
  /** What Copy link copies. */
  readonly link: string;
  /** Share in the add row, or Enter in its input, with the trimmed text; the input clears after. */
  readonly onAdd: (name: string, access: ShareAccess) => void;
  readonly onAccessChange: (id: string, access: ShareAccess) => void;
  readonly onRemove: (id: string) => void;
  readonly onGeneralChange: (general: ShareGeneral) => void;
  /** Shown under the add row, such as "No such person". */
  readonly error?: string | undefined;
  /** People being changed: their controls are disabled. */
  readonly pending?: ReadonlyArray<string> | undefined;
}

function AccessItems() {
  return (
    <>
      <SelectItem value="view">Can view</SelectItem>
      <SelectItem value="edit">Can edit</SelectItem>
    </>
  );
}

function Glyph({ d }: { readonly d: string }) {
  return (
    <svg
      aria-hidden="true"
      width="14"
      height="14"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={d} />
    </svg>
  );
}

const LOCK = "M4.5 7V5a3.5 3.5 0 0 1 7 0v2M3.5 7h9v6.5h-9z";
const PEOPLE = "M6 7.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zM1.5 13.5c0-2.5 2-4 4.5-4s4.5 1.5 4.5 4M11 7.5a2 2 0 1 0 0-4M12.5 9.8c1.2.5 2 1.6 2 3.7";
const LINK = "M6.5 9.5l3-3M7 4.5l1-1a2.8 2.8 0 0 1 4 4l-1 1M9 11.5l-1 1a2.8 2.8 0 0 1-4-4l1-1";

/**
 * A share dialog, after Google Docs: add people at an access, change or
 * remove each person's access, set who else gets in with the link, and copy
 * the link. Controlled: the host owns the people, the general access and
 * the writes; only the add row's text and access choice live here.
 */
export function ShareDialog({
  open,
  onOpenChange,
  title,
  people,
  self,
  general,
  groupLabel,
  link,
  onAdd,
  onAccessChange,
  onRemove,
  onGeneralChange,
  error,
  pending,
}: ShareDialogProps) {
  useInjectUiCss();
  const [draft, setDraft] = useState("");
  const [access, setAccess] = useState<ShareAccess>("view");
  const input = useRef<HTMLInputElement>(null);
  const id = useId();
  const errorId = `${id}-error`;
  const peopleId = `${id}-people`;
  const generalId = `${id}-general`;
  const name = draft.trim();
  const restricted = general === "restricted";

  const share = () => {
    if (name === "") return;
    onAdd(name, access);
    setDraft("");
    input.current?.focus();
  };
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== "Enter" || event.nativeEvent.isComposing) return;
    event.preventDefault();
    share();
  };
  const copyLink = async () => {
    const result = await copyToClipboard(link);
    if (!result.ok) throw new Error(result.code);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sui-share-dialog" showCloseButton={false} aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="sui-share-add">
          <Input
            ref={input}
            className="sui-share-add-input"
            placeholder="Add people"
            aria-label="Add people"
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? errorId : undefined}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={onKeyDown}
          />
          <Select value={access} onValueChange={(value) => setAccess(value as ShareAccess)}>
            <SelectTrigger aria-label="Access">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <AccessItems />
            </SelectContent>
          </Select>
          <Button disabled={name === ""} onClick={share}>
            Share
          </Button>
        </div>
        {error ? (
          <p id={errorId} role="alert" className="sui-share-error">
            {error}
          </p>
        ) : null}
        <div className="sui-share-section">
          <h3 id={peopleId} className="sui-share-heading">
            People with access
          </h3>
          <ul className="sui-share-people" aria-labelledby={peopleId}>
            {people.map((person) => {
              const busy = pending?.includes(person.id) ?? false;
              return (
                <li
                  key={person.id}
                  className="sui-share-person"
                  data-access={person.access}
                  data-pending={busy ? "true" : undefined}
                >
                  <span className="sui-avatar" data-lane={personLane(person.id)} aria-hidden="true">
                    {personInitial(person.name)}
                  </span>
                  <span className="sui-share-name">{person.id === self ? `${person.name} (you)` : person.name}</span>
                  {person.access === "owner" ? <span className="sui-share-owner">Owner</span> : (
                    <>
                      <Select
                        value={person.access}
                        disabled={busy}
                        onValueChange={(value) => onAccessChange(person.id, value as ShareAccess)}
                      >
                        <SelectTrigger className="sui-share-quiet" aria-label={`Access for ${person.name}`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <AccessItems />
                        </SelectContent>
                      </Select>
                      <Button
                        variant="ghost"
                        size="sm"
                        aria-label={`Remove ${person.name}`}
                        disabled={busy}
                        onClick={() => onRemove(person.id)}
                      >
                        Remove
                      </Button>
                    </>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
        <div className="sui-share-section">
          <h3 id={generalId} className="sui-share-heading">
            General access
          </h3>
          <div className="sui-share-general">
            <span className="sui-share-general-icon" data-general={restricted ? "restricted" : "link"}>
              <Glyph d={restricted ? LOCK : PEOPLE} />
            </span>
            <div className="sui-share-general-controls">
              <Select
                value={restricted ? "restricted" : "link"}
                onValueChange={(value) => onGeneralChange(value === "restricted" ? "restricted" : "view")}
              >
                <SelectTrigger className="sui-share-quiet" aria-labelledby={generalId}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="restricted">Restricted</SelectItem>
                  <SelectItem value="link">{groupLabel}</SelectItem>
                </SelectContent>
              </Select>
              {restricted ? null : (
                <Select value={general} onValueChange={(value) => onGeneralChange(value as ShareAccess)}>
                  <SelectTrigger className="sui-share-quiet" aria-label="Link access">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <AccessItems />
                  </SelectContent>
                </Select>
              )}
            </div>
          </div>
        </div>
        <DialogFooter className="sui-share-footer">
          <CopyButton variant="outline" onCopy={copyLink}>
            <Glyph d={LINK} />
            Copy link
          </CopyButton>
          <Button onClick={() => onOpenChange(false)}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
