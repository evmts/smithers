/**
 * The presentation subset, rendered inside the real presentation bundle in
 * QuickJS: every component the realm offers renders there exactly as React
 * renders it here, with its classes, slots and data attributes intact.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import singlefile from "@jitl/quickjs-singlefile-browser-release-sync";
import { QuickJSVariant } from "@smthrs/harness";
import { PresentationRealm, ViewCode } from "@smthrs/views";
import { Effect, Exit, Scope } from "effect";
import type { QuickJSSyncVariant } from "quickjs-emscripten-core";
import { renderToStaticMarkup } from "react-dom/server";
import { loadPresentationBundle, presentationComponentNames } from "../src/presentation";
import { presentationComponents as ui } from "../src/presentation/components";

let scope: Scope.Closeable;
let realm: PresentationRealm.Realm;

beforeAll(async () => {
  scope = await Effect.runPromise(Scope.make());
  realm = await Effect.runPromise(
    PresentationRealm.make({ bundle: await loadPresentationBundle() }).pipe(
      Scope.provide(scope),
      Effect.provide(QuickJSVariant.layerVariant(singlefile as unknown as QuickJSSyncVariant)),
    ),
  );
});

afterAll(async () => {
  await Effect.runPromise(Scope.close(scope, Exit.void));
});

const inRealm = (jsx: string, imports: ReadonlyArray<string>) =>
  Effect.runPromise(
    ViewCode.check(
      `import { ${imports.join(", ")} } from "@smthrs/ui"\n` +
        `export const interactions = { go: { kind: "message", label: "Go" }, ask: { kind: "message", label: "Ask" } }\n` +
        `export default function View() { return (${jsx}) }`,
      { components: realm.components },
    ).pipe(Effect.flatMap((module) => realm.render({ module, props: {}, state: null }))),
  );

/** Each case: the JSX a view writes, and the same tree built here from the real components. */
const cases: ReadonlyArray<readonly [string, ReadonlyArray<string>, () => React.ReactElement]> = [
  [
    `<Card className="c"><CardHeader><CardTitle>Runs</CardTitle><CardAction><Badge variant="secondary">3</Badge></CardAction><CardDescription>Today</CardDescription></CardHeader><CardContent>Body</CardContent><CardFooter>Foot</CardFooter></Card>`,
    ["Badge", "Card", "CardAction", "CardContent", "CardDescription", "CardFooter", "CardHeader", "CardTitle"],
    () => (
      <ui.Card className="c">
        <ui.CardHeader>
          <ui.CardTitle>Runs</ui.CardTitle>
          <ui.CardAction><ui.Badge variant="secondary">3</ui.Badge></ui.CardAction>
          <ui.CardDescription>Today</ui.CardDescription>
        </ui.CardHeader>
        <ui.CardContent>Body</ui.CardContent>
        <ui.CardFooter>Foot</ui.CardFooter>
      </ui.Card>
    ),
  ],
  [
    `<div><Button data-event="go">Go</Button><Button variant="outline" size="sm" disabled>Off</Button><Button loading>Wait</Button></div>`,
    ["Button"],
    () => (
      <div>
        <ui.Button data-event="go">Go</ui.Button>
        <ui.Button variant="outline" size="sm" disabled>Off</ui.Button>
        <ui.Button loading>Wait</ui.Button>
      </div>
    ),
  ],
  [
    `<Table><TableCaption>DBs</TableCaption><TableHeader><TableRow><TableHead>Name</TableHead></TableRow></TableHeader><TableBody><TableRow><TableCell>Postgres</TableCell></TableRow></TableBody></Table>`,
    ["Table", "TableBody", "TableCaption", "TableCell", "TableHead", "TableHeader", "TableRow"],
    () => (
      <ui.Table>
        <ui.TableCaption>DBs</ui.TableCaption>
        <ui.TableHeader><ui.TableRow><ui.TableHead>Name</ui.TableHead></ui.TableRow></ui.TableHeader>
        <ui.TableBody><ui.TableRow><ui.TableCell>Postgres</ui.TableCell></ui.TableRow></ui.TableBody>
      </ui.Table>
    ),
  ],
  [
    `<div><StatusPill status="running" /><StatusPill status="failed" label="Broke" withDot={false} /><KpiStat label="Runs" value="12" hint="today" /></div>`,
    ["KpiStat", "StatusPill"],
    () => (
      <div>
        <ui.StatusPill status="running" />
        <ui.StatusPill status="failed" label="Broke" withDot={false} />
        <ui.KpiStat label="Runs" value="12" hint="today" />
      </div>
    ),
  ],
  [
    `<div><Alert variant="destructive"><AlertTitle>No</AlertTitle><AlertDescription>Failed</AlertDescription></Alert><EmptyState title="Nothing" description="Yet" /></div>`,
    ["Alert", "AlertDescription", "AlertTitle", "EmptyState"],
    () => (
      <div>
        <ui.Alert variant="destructive"><ui.AlertTitle>No</ui.AlertTitle><ui.AlertDescription>Failed</ui.AlertDescription></ui.Alert>
        <ui.EmptyState title="Nothing" description="Yet" />
      </div>
    ),
  ],
  [
    `<form data-event="ask"><Field><Label htmlFor="u">URL</Label><Input id="u" name="url" placeholder="https://" /></Field><Textarea name="note" /><Progress value={40} /><Separator /></form>`,
    ["Field", "Input", "Label", "Progress", "Separator", "Textarea"],
    () => (
      <form data-event="ask">
        <ui.Field><ui.Label htmlFor="u">URL</ui.Label><ui.Input id="u" name="url" placeholder="https://" /></ui.Field>
        <ui.Textarea name="note" />
        <ui.Progress value={40} />
        <ui.Separator />
      </form>
    ),
  ],
  [
    `<SectionHeader title="Compare" eyebrow={<Eyebrow>Databases</Eyebrow>} actions={<Button>More</Button>}>Three</SectionHeader>`,
    ["Button", "Eyebrow", "SectionHeader"],
    () => (
      <ui.SectionHeader title="Compare" eyebrow={<ui.Eyebrow>Databases</ui.Eyebrow>} actions={<ui.Button>More</ui.Button>}>
        Three
      </ui.SectionHeader>
    ),
  ],
];

describe("the presentation subset in the realm", () => {
  test("offers exactly the subset", () => {
    expect(realm.components).toEqual([...presentationComponentNames]);
  });

  test("covers every component in the subset with a conformance case", () => {
    const covered = new Set(cases.flatMap(([, imports]) => imports));
    expect([...covered].sort()).toEqual([...presentationComponentNames]);
  });

  for (const [jsx, imports, expected] of cases) {
    test(`renders ${imports.join(", ")} as React does`, async () => {
      const html = await inRealm(jsx, imports);
      expect(html).toBe(renderToStaticMarkup(expected()));
      expect(html).toContain("sui-");
    });
  }
});
