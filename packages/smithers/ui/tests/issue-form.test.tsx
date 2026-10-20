/** @jsxImportSource react */
// IssueForm under happy-dom: real createRoot + act, native events, so default-prevented flags are the browser's.
import { afterEach, describe, expect, test } from "bun:test";
import { act, type ReactElement, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { IssueForm, type IssueFormProps, SMITHERS_UI_STYLE_ATTR } from "../src/index";
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLElement | undefined;
let root: Root | undefined;

afterEach(async () => {
  if (root) {
    const mounted = root;
    await act(async () => mounted.unmount());
    root = undefined;
  }
  container?.remove();
  container = undefined;
  document.querySelectorAll(`style[${SMITHERS_UI_STYLE_ATTR}]`).forEach((el) => el.remove());
});

async function render(element: ReactElement): Promise<void> {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  const mounted = root;
  await act(async () => mounted.render(element));
}

async function key(el: Element, init: KeyboardEventInit): Promise<boolean> {
  let followed = true;
  await act(async () => {
    followed = el.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init }));
  });
  return followed;
}

async function click(el: Element): Promise<void> {
  await act(async () => {
    el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, button: 0 }));
  });
}

async function type(field: HTMLInputElement | HTMLTextAreaElement, value: string): Promise<void> {
  await act(async () => {
    const proto = field instanceof HTMLInputElement ? HTMLInputElement.prototype : HTMLTextAreaElement.prototype;
    Object.getOwnPropertyDescriptor(proto, "value")!.set!.call(field, value);
    field.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

const form = () => container!.querySelector<HTMLFormElement>("form[data-slot=issue-form]")!;
const titleField = () => form().querySelector<HTMLInputElement>("input")!;
const bodyField = () => form().querySelector<HTMLTextAreaElement>("textarea")!;
const submitButton = () => form().querySelector<HTMLButtonElement>("button[type=submit]")!;

type HarnessProps = Partial<Omit<IssueFormProps, "onSubmit" | "onTitle" | "onBody">> & {
  readonly onSubmit: (title: string, body: string) => void;
};

/** The form with the title and body the harness owns, reporting each submit with the values it saw. */
function Harness({ onSubmit, title: initialTitle = "", body: initialBody = "", ...rest }: HarnessProps) {
  const [title, setTitle] = useState(initialTitle);
  const [body, setBody] = useState(initialBody);
  return (
    <IssueForm
      {...rest}
      title={title}
      body={body}
      onTitle={setTitle}
      onBody={setBody}
      onSubmit={() => onSubmit(title, body)}
    />
  );
}

describe("IssueForm", () => {
  test("labels the fields Title and Description and passes form props through", async () => {
    await render(<Harness onSubmit={() => {}} aria-label="New issue" className="extra" />);
    expect(titleField().labels![0]!.textContent).toBe("Title");
    expect(bodyField().labels![0]!.textContent).toBe("Description");
    expect(form().getAttribute("aria-label")).toBe("New issue");
    expect(form().className).toBe("sui-issue-form extra");
    expect(submitButton().textContent).toBe("Create issue");
  });

  test("typing reports each field; submit enables only for a non-blank title and sends what was typed", async () => {
    const sent: Array<[string, string]> = [];
    await render(<Harness onSubmit={(title, body) => sent.push([title, body])} />);
    expect(submitButton().disabled).toBe(true);
    await type(bodyField(), "Steps to reproduce");
    expect(submitButton().disabled).toBe(true);
    await type(titleField(), "   ");
    expect(submitButton().disabled).toBe(true);
    await click(submitButton());
    expect(sent).toEqual([]);
    await type(titleField(), "Crash on empty body");
    expect([titleField().value, bodyField().value]).toEqual(["Crash on empty body", "Steps to reproduce"]);
    expect(submitButton().disabled).toBe(false);
    await click(submitButton());
    expect(sent).toEqual([["Crash on empty body", "Steps to reproduce"]]);
  });

  test("an empty description is allowed", async () => {
    const sent: Array<[string, string]> = [];
    await render(<Harness title="Only a title" onSubmit={(title, body) => sent.push([title, body])} />);
    await click(submitButton());
    expect(sent).toEqual([["Only a title", ""]]);
  });

  test("⌘Enter or Ctrl+Enter in either field submits; Enter in the description types a newline", async () => {
    let submits = 0;
    await render(<Harness title="Crash" onSubmit={() => (submits += 1)} />);
    expect(await key(titleField(), { key: "Enter", metaKey: true })).toBe(false);
    expect(await key(bodyField(), { key: "Enter", metaKey: true })).toBe(false);
    expect(await key(bodyField(), { key: "Enter", ctrlKey: true })).toBe(false);
    expect(submits).toBe(3);
    expect(await key(bodyField(), { key: "Enter" })).toBe(true);
    expect(await key(bodyField(), { key: "Enter", metaKey: true, isComposing: true })).toBe(true);
    expect(submits).toBe(3);
  });

  test("the form's submit event is always prevented, and calls onSubmit only when allowed", async () => {
    let submits = 0;
    await render(<Harness onSubmit={() => (submits += 1)} />);
    const submit = async () => {
      let followed = true;
      await act(async () => {
        followed = form().dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
      });
      return followed;
    };
    expect(await submit()).toBe(false);
    expect(submits).toBe(0);
    await type(titleField(), "Crash");
    expect(await submit()).toBe(false);
    expect(submits).toBe(1);
  });

  test("disabled blocks every way to submit but keeps the fields editable", async () => {
    let submits = 0;
    await render(<Harness title="Crash" disabled onSubmit={() => (submits += 1)} />);
    expect(submitButton().disabled).toBe(true);
    expect([titleField().disabled, bodyField().disabled]).toEqual([false, false]);
    await key(titleField(), { key: "Enter", metaKey: true });
    await key(bodyField(), { key: "Enter", ctrlKey: true });
    await click(submitButton());
    expect(submits).toBe(0);
  });

  test("an error shows as an alert that describes both fields; none means no alert", async () => {
    await render(<Harness title={"x".repeat(300)} error="Title is too long" onSubmit={() => {}} />);
    const alert = form().querySelector<HTMLElement>("[role=alert]")!;
    expect(alert.textContent).toBe("Title is too long");
    expect(titleField().getAttribute("aria-describedby")).toBe(alert.id);
    expect(bodyField().getAttribute("aria-describedby")).toBe(alert.id);
    await act(async () => root!.render(<Harness title="Crash" onSubmit={() => {}} />));
    expect(form().querySelector("[role=alert]")).toBeNull();
    expect(titleField().hasAttribute("aria-describedby")).toBe(false);
  });

  test("submitLabel renames the button", async () => {
    await render(<Harness title="Crash" submitLabel="Open issue" onSubmit={() => {}} />);
    expect(submitButton().textContent).toBe("Open issue");
  });
});
