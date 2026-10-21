/** @jsxImportSource react */
/**
 * The page the live-state probes load: a stack of two items as `IssuesView` lists them, one Working and live, one
 * Queued, and the live one's page as `ItemConversation` shows its state pill.
 */
import { createRoot } from "react-dom/client";
import { IssuesView } from "../../src/issues-view/IssuesView";
import { ItemConversation } from "../../src/item-conversation/ItemConversation";
import { SmithersUiStyles } from "../../src/styles";

function Host() {
  return (
    <main style={{ display: "flex", flexDirection: "column", gap: 16, padding: 16 }}>
      <SmithersUiStyles withTheme />
      <IssuesView
        repo="octo/hello"
        numberPrefix="T"
        ordered
        issues={[
          { id: "a", number: 4, title: "Retry webhook delivery", state: "open", status: { kind: "running", label: "Working", live: true } },
          { id: "b", number: 5, title: "Add rate limit headers", state: "open", status: { kind: "queued", label: "Queued" } },
        ]}
      />
      <ItemConversation
        title="Retry webhook delivery"
        number={4}
        numberPrefix="T"
        state="open"
        status={{ kind: "running", label: "Working", live: true }}
        body="Retry a failed delivery."
        comments={[]}
      />
    </main>
  );
}

createRoot(document.getElementById("app")!).render(<Host />);
