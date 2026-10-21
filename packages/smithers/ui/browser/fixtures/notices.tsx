/** @jsxImportSource react */
/**
 * The page the notices probes load at phone width: a transcript whose answer is still pending (the `…` bubble), the
 * toast stack, the top bar's bell while a run waits on the person, and the notifications panel with an expanded entry.
 */
import { createRoot } from "react-dom/client";
import { NeedsYouCard } from "../../src/agent-status/NeedsYouCard";
import { NotificationBell, NotificationEntry, NotificationPanel } from "../../src/agent-status/NotificationPanel";
import { Toast, ToastStack } from "../../src/agent-status/ToastStack";
import { ChatMessage } from "../../src/chat/ChatMessage";
import { ChatTranscript } from "../../src/chat/ChatTranscript";
import { SmithersUiStyles } from "../../src/styles";

const noop = () => {};
const panel = new URLSearchParams(location.search).has("panel");

function Host() {
  return (
    <main style={{ display: "flex", flexDirection: "column", gap: 12, height: "100vh", padding: 16, boxSizing: "border-box" }}>
      <SmithersUiStyles withTheme />
      <header style={{ display: "flex", justifyContent: "flex-end" }}>
        <NotificationBell unread={3} needsYou={2} />
      </header>
      <ToastStack placement="inline" moreCount={2} onMore={noop}>
        <Toast tone="needs_you" detail="Which branch should I deploy for the docs preview today?" onOpen={noop} onHide={noop} />
      </ToastStack>
      <ChatTranscript>
        <ChatMessage role="user" data-id="question">Deploy the docs preview, please.</ChatMessage>
        <ChatMessage role="assistant" data-id="answer" pending pendingLabel="Smithers is answering" />
      </ChatTranscript>
      <NotificationPanel open={panel} onOpenChange={noop}>
        <NotificationEntry
          entryId="run:1"
          tone="needs_you"
          detail="Which branch should I deploy for the docs preview today?"
          time="2m ago"
          unread
          expanded
          onExpandedChange={noop}
          onOpen={noop}
          onHide={noop}
          steps={[{ id: "1", label: "app/agent/ask", state: "running" }]}
        >
          <NeedsYouCard
            compact
            kind="question"
            prompt="Which branch should I deploy?"
            options={["main", "docs-v2"]}
            value=""
            onValueChange={noop}
            onAnswer={noop}
          />
        </NotificationEntry>
        <NotificationEntry entryId="run:2" tone="done" detail="Clone tinyhttp" time="5m ago" expanded={false} onExpandedChange={noop} onOpen={noop} onHide={noop} />
      </NotificationPanel>
    </main>
  );
}

createRoot(document.getElementById("app")!).render(<Host />);
