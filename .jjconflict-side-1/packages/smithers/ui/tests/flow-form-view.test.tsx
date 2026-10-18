/** @jsxImportSource react */
// FlowFormView under happy-dom: real createRoot + act, native input and submit events.
import { afterEach, describe, expect, test } from "bun:test";
import { act, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { FlowFormView, type FlowFormSubmission } from "../src/flow-form-view";
import { flowFormViewCss } from "../src/flow-form-view";
import { SMITHERS_UI_STYLE_ATTR } from "../src/styles";
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
  if (!container) {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  }
  const mounted = root!;
  await act(async () => mounted.render(element));
}

const CLONE = {
  type: "object",
  properties: {
    url: { type: "string", title: "Repository URL" },
    depth: { type: "number" },
    shallow: { type: "boolean" },
    branch: { enum: ["main", "dev"] },
    token: { type: "string", writeOnly: true },
    tags: { type: "array", items: { type: "string" } },
  },
  required: ["url", "shallow"],
};

const field = (name: string) => container!.querySelector<HTMLElement>(`[data-field="${name}"]`)!;
const control = <E extends Element = HTMLInputElement>(name: string) => field(name).querySelector<E>("input, select")!;
const problem = () => container!.querySelector("[role=alert]")?.textContent;

/** Sets a control's value the way a person does: through the native setter, then the event React listens for. */
async function type(name: string, value: string): Promise<void> {
  const element = control<HTMLInputElement | HTMLSelectElement>(name);
  await act(async () => {
    const prototype = element instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(prototype, "value")!.set!.call(element, value);
    element.dispatchEvent(new Event(element instanceof HTMLSelectElement ? "change" : "input", { bubbles: true }));
  });
}

async function check(name: string): Promise<void> {
  await act(async () => {
    control(name).click();
  });
}

async function submit(): Promise<void> {
  await act(async () => {
    container!.querySelector("form")!.requestSubmit();
  });
}

function capture() {
  const submissions: Array<FlowFormSubmission> = [];
  return { submissions, onSubmit: (submission: FlowFormSubmission) => submissions.push(submission) };
}

describe("FlowFormView", () => {
  test("derives one labelled control per schema property, in schema order", async () => {
    await render(<FlowFormView title="Clone" schema={CLONE} submitLabel="Clone" onSubmit={() => {}} />);
    const rows = [...container!.querySelectorAll<HTMLElement>("[data-field]")];
    expect(rows.map((row) => [row.dataset.field, row.dataset.kind])).toEqual([
      ["url", "text"],
      ["depth", "number"],
      ["shallow", "boolean"],
      ["branch", "select"],
      ["token", "write-only"],
      ["tags", "text"],
    ]);
    // The title names the field; the label points at its control.
    const label = field("url").querySelector("label")!;
    expect(label.textContent).toBe("Repository URL *");
    expect(container!.querySelector(`#${CSS.escape(label.htmlFor)}`)).toBe(control("url"));
    expect(field("depth").querySelector("label")!.textContent).toBe("Depth");
    expect(control("url").required).toBe(true);
    expect(control("depth").required).toBe(false);
    expect(control("depth").type).toBe("number");
    expect(control("shallow").type).toBe("checkbox");
    expect(control("token").type).toBe("password");
    expect([...control<HTMLSelectElement>("branch").options].map((option) => option.value)).toEqual(["", "main", "dev"]);
    expect(container!.querySelector("form")!.getAttribute("aria-label")).toBe("Clone");
    expect(container!.querySelector<HTMLButtonElement>("button")!.type).toBe("submit");
  });

  test("submits once with the label as text and exactly the filled values", async () => {
    const { onSubmit, submissions } = capture();
    await render(<FlowFormView title="Clone" schema={CLONE} submitLabel="Clone it" onSubmit={onSubmit} />);
    await type("url", "https://github.com/maya/tinyhttp");
    await type("depth", "3");
    await check("shallow");
    await type("branch", "dev");
    await type("tags", "a b");
    await submit();
    expect(submissions).toEqual([{
      text: "Clone it",
      data: { url: "https://github.com/maya/tinyhttp", depth: 3, shallow: true, branch: "dev", tags: "[\"a\",\"b\"]" },
      writeOnly: [],
    }]);
  });

  test("leaves unpicked and cleared optional fields out of the data", async () => {
    const { onSubmit, submissions } = capture();
    await render(<FlowFormView title="Clone" schema={CLONE} submitLabel="Clone" onSubmit={onSubmit} />);
    await type("url", "u");
    await type("branch", "main");
    await type("branch", "");
    await type("depth", "4");
    await type("depth", "");
    await submit();
    expect(submissions.map((submission) => submission.data)).toEqual([{ url: "u", shallow: false }]);
  });

  test("blocks a submit that misses a required field and names it, then clears the notice on the next edit", async () => {
    const { onSubmit, submissions } = capture();
    const schema = { ...CLONE, required: ["url", "token", "shallow"] };
    await render(<FlowFormView title="Clone" schema={schema} submitLabel="Clone" onSubmit={onSubmit} />);
    await submit();
    expect(submissions).toEqual([]);
    expect(problem()).toBe("Needs: Repository URL, Token");
    await type("url", "u");
    expect(problem()).toBeUndefined();
    await submit();
    expect(problem()).toBe("Needs: Token");
    expect(submissions).toEqual([]);
  });

  test("refuses a value its control cannot carry", async () => {
    const { onSubmit, submissions } = capture();
    await render(<FlowFormView title="Clone" schema={CLONE} submitLabel="Clone" onSubmit={onSubmit} />);
    await type("url", "u");
    await type("tags", "[");
    await submit();
    // Words are the array grammar, so "[" is one word, not a JSON failure; a number field is stricter.
    expect(submissions).toHaveLength(1);
    const numeric = { type: "object", properties: { count: { type: "number" } }, required: ["count"] };
    await render(<FlowFormView key="numeric" title="Count" schema={numeric} submitLabel="Go" onSubmit={onSubmit} />);
    await type("count", "1e999");
    await submit();
    expect(problem()).toBe("Count: not a number");
    expect(submissions).toHaveLength(1);
  });

  test("hands a write-only value to onSubmit once, marks it, and clears its input", async () => {
    const { onSubmit, submissions } = capture();
    await render(<FlowFormView title="Key" schema={CLONE} submitLabel="Save" onSubmit={onSubmit} />);
    await type("url", "u");
    await type("token", "sk-secret");
    await submit();
    expect(submissions).toEqual([{ text: "Save", data: { url: "u", shallow: false, token: "sk-secret" }, writeOnly: ["token"] }]);
    expect(control("token").value).toBe("");
    // format: "password" is write-only too.
    const password = { type: "object", properties: { pin: { type: "string", format: "password" } } };
    await render(<FlowFormView key="pin" title="Pin" schema={password} submitLabel="Save" onSubmit={onSubmit} />);
    expect(field("pin").dataset.kind).toBe("write-only");
  });

  test("once submitted, shows the values disabled, hides write-only values, and cannot submit again", async () => {
    const { onSubmit, submissions } = capture();
    const values = { url: "https://x", depth: 2, shallow: true, branch: "main", token: "sk-leak" };
    await render(<FlowFormView title="Clone" schema={CLONE} submitLabel="Clone" submitted values={values} onSubmit={onSubmit} />);
    const section = container!.querySelector<HTMLElement>("[data-slot=flow-form-view]")!;
    expect(section.hasAttribute("data-submitted")).toBe(true);
    expect(container!.querySelector("button")).toBeNull();
    expect([...container!.querySelectorAll<HTMLInputElement>("input, select")].every((element) => element.disabled)).toBe(true);
    expect(control("url").value).toBe("https://x");
    expect(control("depth").value).toBe("2");
    expect(control("shallow").checked).toBe(true);
    expect(control<HTMLSelectElement>("branch").value).toBe("main");
    expect(control("token").value).toBe("");
    expect(container!.innerHTML).not.toContain("sk-leak");
    await submit();
    expect(submissions).toEqual([]);
  });

  test("reads a { schema, definitions } document and a $defs reference", async () => {
    const document = { schema: { type: "object", properties: { name: { type: "string" } } }, definitions: {} };
    await render(<FlowFormView title="Name" schema={document} submitLabel="Go" onSubmit={() => {}} />);
    expect(field("name").dataset.kind).toBe("text");
    const referenced = {
      type: "object",
      properties: { mode: { $ref: "#/$defs/Mode" } },
      $defs: { Mode: { enum: ["fast", "slow"] } },
    };
    await render(<FlowFormView key="ref" title="Mode" schema={referenced} submitLabel="Go" onSubmit={() => {}} />);
    expect(field("mode").dataset.kind).toBe("select");
  });

  test.each([
    ["a string", "not a schema"],
    ["null", null],
    ["an array", [1]],
    ["a non-object schema", { type: "string" }],
    ["an object with no properties", { type: "object" }],
  ])("shows a short failure, never a crash, for %s", async (_, schema) => {
    await render(<FlowFormView title="Broken" schema={schema} submitLabel="Go" onSubmit={() => {}} />);
    expect(problem()).toBe("Form unavailable");
    expect(container!.querySelector("form")).toBeNull();
    expect(container!.querySelector(".sui-card-title")!.textContent).toBe("Broken");
  });

  test("keyboard: every control and a native submit button sit in the tab order, and the button submits", async () => {
    // Enter in a text field is the browser's implicit submission of a form with
    // a submit button; happy-dom does not implement it, so this pins the parts
    // that make it work: a real <form>, a type=submit button, nothing removed
    // from the tab order.
    const { onSubmit, submissions } = capture();
    await render(<FlowFormView title="Clone" schema={CLONE} submitLabel="Clone" onSubmit={onSubmit} />);
    const focusable = [...container!.querySelectorAll<HTMLElement>("input, select, button")];
    expect(focusable).toHaveLength(7);
    expect(focusable.every((element) => element.tabIndex >= 0)).toBe(true);
    await type("url", "u");
    const button = container!.querySelector<HTMLButtonElement>("button[type=submit]")!;
    button.focus();
    expect(document.activeElement).toBe(button);
    await act(async () => {
      button.click();
    });
    expect(submissions).toHaveLength(1);
  });

  test("passes host attributes through and marks its size; inline is the default", async () => {
    await render(<FlowFormView title="T" schema={CLONE} submitLabel="Go" onSubmit={() => {}} id="host" className="extra" />);
    const section = container!.querySelector<HTMLElement>("section")!;
    expect(section.id).toBe("host");
    expect(section.className).toContain("sui-flow-form-view");
    expect(section.className).toContain("extra");
    expect(section.dataset.size).toBe("inline");
    await render(<FlowFormView title="T" schema={CLONE} submitLabel="Go" size="full" onSubmit={() => {}} />);
    expect(container!.querySelector<HTMLElement>("section")!.dataset.size).toBe("full");
  });

  test("its sheet styles both sizes and only sui- classes", () => {
    expect(flowFormViewCss).toContain(".sui-flow-form-view[data-size='inline']");
    expect(flowFormViewCss).toContain(".sui-flow-form-view[data-size='full']");
    expect(flowFormViewCss.match(/\.[a-z][\w-]*/g)!.every((name) => name.startsWith(".sui-"))).toBe(true);
  });
});
