/** @jsxImportSource react */
/**
 * The page the message-actions probes load: a transcript with a queued question (always-shown `Queued`, its time and
 * Edit as actions) and an answer (its time and Copy as actions), and a button before it to tab from.
 */
import { createRoot } from "react-dom/client";
import { Badge } from "../../src/badge";
import { Button } from "../../src/button";
import { ChatMessage } from "../../src/chat/ChatMessage";
import { ChatTranscript } from "../../src/chat/ChatTranscript";
import { CopyButton } from "../../src/copy-button";
import { SmithersUiStyles } from "../../src/styles";
import { RelativeTime } from "../../src/time/RelativeTime";

const asked = Date.now() - 3 * 60_000;

function Host() {
  return (
    <main style={{ display: "flex", flexDirection: "column", height: "100vh" }}>
      <SmithersUiStyles withTheme />
      <Button variant="ghost">Before</Button>
      <ChatTranscript>
        <ChatMessage
          role="user"
          data-id="question"
          meta={<Badge variant="muted">Queued</Badge>}
          actions={
            <>
              <RelativeTime ts={asked} />
              <Button variant="ghost" size="sm">
                Edit
              </Button>
            </>
          }
        >
          Reply with one word
        </ChatMessage>
        <ChatMessage
          role="assistant"
          data-id="answer"
          actions={
            <>
              <RelativeTime ts={asked} />
              <CopyButton variant="ghost" size="sm" onCopy={() => {}}>
                Copy
              </CopyButton>
            </>
          }
        >
          Word
        </ChatMessage>
      </ChatTranscript>
    </main>
  );
}

createRoot(document.getElementById("app")!).render(<Host />);
