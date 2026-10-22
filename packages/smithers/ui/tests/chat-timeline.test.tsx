import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { act, useState } from "react";
import { createRoot } from "react-dom/client";
import { ChatTimeline, timelineKey, timelineLabel, type ChatTimelineEntry } from "../src/chat/ChatTimeline";
import { chatTimelineCss } from "../src/chat/chatTimelineCss";

test("inline group callbacks can update parent summaries without repeating unchanged groups", async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const entries = Array.from({ length: 100 }, (_, index) => ({ id: `group-entry-${index}`, kind: "ask" as const, state: "done" as const }));
  let notifications = 0;
  function Parent() {
    const [summaries, setSummaries] = useState<Readonly<Record<string, string>>>({});
    return <ChatTimeline entries={entries} groupSummaries={summaries} onGroupsChange={groups => {
      notifications++;
      // Bound the faulty build's feedback loop so the regression can fail without hanging.
      if (notifications <= 3) setSummaries(Object.fromEntries(groups.map(group => [group.id, "Group summary"])));
    }} />;
  }
  try {
    await act(async () => root.render(<Parent />));
    expect(host.textContent).toContain("Group summary");
    expect(notifications).toBe(1);
    await act(async () => {
      document.dispatchEvent(new Event("scroll"));
      window.dispatchEvent(new Event("resize"));
    });
    expect(notifications).toBe(1);
  } finally { await act(async () => root.unmount()); host.remove(); }
});

test("desktop timeline keeps zoom levels in flex columns", () => {
  // Check the shipped desktop override, including its higher-specificity open disclosure selector.
  const desktop = chatTimelineCss.slice(chatTimelineCss.indexOf("@media(min-width:1180px)"), chatTimelineCss.indexOf(".sui-timeline-band{position:"));
  const declarations = desktop.match(/\.sui-timeline-disclosure \.sui-chat-timeline,\.sui-timeline-disclosure\[open\] \.sui-chat-timeline\{([^}]+)\}/)?.[1];
  expect(declarations).toBeDefined();
  const style = document.createElement("div").style;
  style.cssText = `display:flex;flex-direction:row;${declarations}`;
  expect(style.display).toBe("flex");
  expect(style.flexDirection).toBe("row");
  expect(chatTimelineCss).toContain(".sui-chat-timeline ol{position:relative;display:flex;flex-direction:column");
});

test("enabling group callbacks requests current groups even without geometry changes", async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const entries = Array.from({ length: 100 }, (_, index) => ({ id: `late-group-${index}`, kind: "ask" as const, state: "done" as const }));
  const received: string[] = [];
  try {
    await act(async () => root.render(<ChatTimeline entries={entries} />));
    await act(async () => root.render(<ChatTimeline entries={entries} onGroupsChange={groups => { if (groups.length) received.push("first"); }} />));
    expect(received).toEqual(["first"]);
    await act(async () => root.render(<ChatTimeline entries={entries} />));
    await act(async () => root.render(<ChatTimeline entries={entries} onGroupsChange={groups => { if (groups.length) received.push("second"); }} />));
    expect(received).toEqual(["first", "second"]);
  } finally { await act(async () => root.unmount()); host.remove(); }
});

test("timeline keys are bounded and leave other keys to the host", () => {
  for (const key of ["ArrowDown", "j"]) { expect(timelineKey(key, 1, 3)).toBe(2); expect(timelineKey(key, 2, 3)).toBe(2); }
  for (const key of ["ArrowUp", "k"]) { expect(timelineKey(key, 1, 3)).toBe(0); expect(timelineKey(key, 0, 3)).toBe(0); }
  expect(timelineKey("Home", 2, 3)).toBe(0);
  expect(timelineKey("End", 0, 3)).toBe(2);
  expect(timelineKey("Enter", 0, 3)).toBeUndefined();
  expect(timelineKey("Home", 0, 0)).toBeUndefined();
});
test("pending rows use recorded state, never a copied first line", () => {
  const entry = { id: "a", kind: "answer" as const, state: "done" as const };
  expect(timelineLabel(entry)).toBe("Reply completed");
  expect(timelineLabel({ ...entry, kind: "ask" })).toBe("Question sent");
  expect(timelineLabel({ ...entry, kind: "ask", state: "queued" })).toBe("Waiting to send");
  for (const [state, label] of [["working", "Working"], ["waiting", "Needs you"], ["failed", "Reply failed"], ["queued", "Waiting for reply"]] as const) expect(timelineLabel({ ...entry, state })).toBe(label);
  expect(timelineLabel({ ...entry, summary: "Inspect both retry attempts" })).toBe("Inspect both retry attempts");
  const html = renderToStaticMarkup(<ChatTimeline entries={[entry, { ...entry, id: "b", summary: "Inspect both retry attempts" }]} />);
  expect(html).toContain('aria-label="Conversation timeline"');
  expect(html).toContain('aria-controls="a"');
  expect(html).toContain('data-summary="pending"');
  expect(html).toContain('data-summary="ready"');
});

test("keyboard movement focuses and jumps; Escape returns to the entry", async () => {
  const { act } = await import("react");
  const { createRoot } = await import("react-dom/client");
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const jumps: string[] = [];
  const entries = ["first", "last"].map(id => ({ id, kind: "ask" as const, state: "done" as const }));
  try {
    await act(async () => root.render(<><div id="first">First entry</div><div id="last">Last entry</div><ChatTimeline entries={entries} onJump={id => { jumps.push(id); }} /></>));
    const buttons = host.querySelectorAll("button");
    await act(async () => buttons[0]!.click());
    expect(jumps).toEqual(["first"]);
    await act(async () => buttons[0]!.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true, cancelable: true })));
    expect(document.activeElement).toBe(buttons[1]);
    expect(jumps).toEqual(["first", "last"]);
    await act(async () => buttons[1]!.dispatchEvent(new KeyboardEvent("keydown", { key: "Home", bubbles: true, cancelable: true })));
    expect(document.activeElement).toBe(buttons[0]);
    await act(async () => buttons[0]!.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
    expect(document.activeElement?.id).toBe("first");
    await act(async () => buttons[0]!.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true })));
    expect(jumps).toEqual(["first", "last", "first"]);
  } finally { await act(async () => root.unmount()); host.remove(); }
});


test("fallback labels distinguish unsent asks, tools and flow runs", () => {
  const expected = {
    ask: ["Question sent", "Not sent", "Waiting to send"],
    answer: ["Reply completed", "Reply failed", "Waiting for reply"],
    tool: ["Tool completed", "Tool failed", "Waiting"],
    flow: ["Run completed", "Run failed", "Waiting"],
  } as const;
  for (const kind of ["ask", "answer", "tool", "flow"] as const) {
    expect(["done", "failed", "queued"].map(state => timelineLabel({ id: "a", kind, state: state as "done" | "failed" | "queued" }))).toEqual([...expected[kind]]);
  }
});

test("previews expose supplied evidence and mobile disclosure starts closed", async () => {
  const { ChatTranscript } = await import("../src/chat/ChatTranscript");
  const html = renderToStaticMarkup(<ChatTranscript rail={<ChatTimeline entries={[{ id: "proof", kind: "answer", state: "done", summary: "Checked retries", actor: "Reviewer", time: "19:58", duration: "4s", tokens: 240, cost: "$0.002" }]} />} />);
  expect(html).toContain('<details class="sui-timeline-disclosure">');
  expect(html).not.toContain('<details open');
  expect(html).toContain('<summary>Timeline</summary>');
  for (const evidence of ["Checked retries", "Reviewer", "19:58 · 4s", "240 tokens · $0.002", "Completed", "Enter to jump", 'role="tooltip"', 'aria-describedby="timeline-preview-0-proof"']) expect(html).toContain(evidence);
});

test("Escape closes an open timeline and restores its control", async () => {
  const { act } = await import("react");
  const { createRoot } = await import("react-dom/client");
  const { ChatTranscript } = await import("../src/chat/ChatTranscript");
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  try {
    await act(async () => root.render(<ChatTranscript rail={<ChatTimeline entries={[{ id: "escape-entry", kind: "ask", state: "done" }]} />} />));
    const disclosure = host.querySelector("details")!;
    const toggle = host.querySelector("summary")!;
    const entry = host.querySelector("nav button")!;
    expect(disclosure.open).toBe(false);
    disclosure.open = true;
    await act(async () => entry.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true })));
    expect(disclosure.open).toBe(true);
    await act(async () => entry.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
    expect(disclosure.open).toBe(false);
    expect(document.activeElement).toBe(toggle);
    await act(async () => toggle.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
    expect(disclosure.open).toBe(false);
  } finally { await act(async () => root.unmount()); host.remove(); }
});

test("preview evidence preserves zero usage and omits unavailable measurements", () => {
  const base = { id: "evidence", kind: "answer" as const, state: "done" as const };
  const preview = (evidence: Partial<ChatTimelineEntry>) =>
    renderToStaticMarkup(<ChatTimeline entries={[{ ...base, ...evidence }]} />);
  expect(preview({ tokens: 0 })).toContain("0 tokens");
  expect(preview({ cost: "$0.002" })).toContain("$0.002</span>");
  expect(preview({ duration: "4s" })).toContain("4s</span>");
  expect(preview({ time: "19:58" })).toContain("19:58</span>");
  const absent = preview({});
  expect(absent).not.toContain("tokens");
  expect(absent).not.toContain("$");
  for (const [kind, actor] of [["ask", "Person"], ["answer", "Agent"], ["tool", "Tool"], ["flow", "Flow"]] as const) {
    expect(preview({ kind })).toContain(`>${actor}</span>`);
  }
});
