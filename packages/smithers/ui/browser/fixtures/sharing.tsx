/** @jsxImportSource react */
/**
 * The page the sharing probes load: an AvatarStack and an open ShareDialog
 * over host state, logging every callback on `window.log`.
 */
import { useState } from "react";
import { createRoot } from "react-dom/client";
import { AvatarStack } from "../../src/avatar-stack";
import { type ShareGeneral, type SharePerson, ShareDialog } from "../../src/share-dialog";
import { SmithersUiStyles } from "../../src/styles";

declare global {
  interface Window {
    log: Array<ReadonlyArray<string | boolean>>;
  }
}

window.log = [];

const PRESENT = [
  { id: "u1", name: "maya", title: "maya · Terminal" },
  { id: "u2", name: "jo" },
  { id: "u3", name: "sam" },
  { id: "u4", name: "lee" },
  { id: "u5", name: "kim" },
  { id: "u6", name: "ali" },
];

function Host() {
  const [open, setOpen] = useState(true);
  const [people, setPeople] = useState<ReadonlyArray<SharePerson>>([
    { id: "u1", name: "maya", access: "owner" },
    { id: "u2", name: "jo", access: "edit" },
    { id: "u3", name: "sam", access: "view" },
  ]);
  const [general, setGeneral] = useState<ShareGeneral>("view");
  return (
    <main style={{ padding: 24 }}>
      <SmithersUiStyles withTheme />
      <AvatarStack people={PRESENT} onSelect={(id) => window.log.push(["follow", id])} />
      <ShareDialog
        open={open}
        onOpenChange={(next) => {
          window.log.push(["open", next]);
          setOpen(next);
        }}
        title="Share test-branch"
        people={people}
        self="u1"
        general={general}
        groupLabel="Anyone in this repository with the link"
        link="https://smithers.sh/maya/tinyhttp/branch/test-branch"
        onAdd={(name, access) => {
          window.log.push(["add", name, access]);
          setPeople((rows) => [...rows, { id: name, name, access }]);
        }}
        onAccessChange={(id, access) => window.log.push(["access", id, access])}
        onRemove={(id) => window.log.push(["remove", id])}
        onGeneralChange={(next) => {
          window.log.push(["general", next]);
          setGeneral(next);
        }}
      />
    </main>
  );
}

createRoot(document.getElementById("app")!).render(<Host />);
