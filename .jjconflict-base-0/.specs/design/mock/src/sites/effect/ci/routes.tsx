import type { Route, Screen } from '../../core/router';
import { selectRepo } from '../../repo/fixtures';
import { Run } from '../../repo/views/runs/Run';
import { Runs } from '../../repo/views/runs/Runs';
import { RepoNotFound } from "../../repo/frame/NotFound";
import { LocalRun } from './LocalRun';
import { Matrix } from './Matrix';
import { localRun } from './model';
import './commands';

const screen = (id: string, suffix: string, label: string, flags = ''): Screen => {
  const [path, raw] = suffix.split('?');
  const query = new URLSearchParams('as=in&role=member&landing=open&host=hosted&hosted=up&net=ok&data=full&still=1');
  for (const [key, value] of new URLSearchParams(raw)) query.set(key, value);
  for (const [key, value] of new URLSearchParams(flags)) query.set(key, value);
  return { id: `effect-ci-${id}`, route: `smithers.sh/Effect-TS/effect/${path}?${query}`, label, site: 'effect', ...(flags.includes('net=slow') ? { wait: 100 } : {}) };
};
export const routes: Route[] = [
  {
    pattern: 'smithers.sh/:owner/:repo/runs/:id/matrix', name: 'Effect CI matrix',
    render: ({ params }) => { selectRepo(`${params.owner}/${params.repo}`); return <Matrix id={params.id} />; },
    screens: [
      screen('matrix-failed', 'runs/run-4802/matrix', 'CI matrix · Bun SQLite failure'),
      screen('matrix-all-pass', 'runs/run-4806/matrix', 'CI matrix · passed; push-only jobs skipped'),
      screen('matrix-running', 'runs/run-4805/matrix', 'CI matrix · running'),
      screen('matrix-setup-failure', 'runs/run-ci-setup/matrix', 'CI matrix · install failed before tests'),
      screen('matrix-scoped', 'runs/run-4802/matrix?package=sql-pg&failures=0', 'CI matrix · PostgreSQL scope; overall failure'),
      screen('matrix-cancelled', 'runs/run-4807/matrix', 'CI matrix · cancelled'),
      screen('matrix-excluded', 'runs/run-4806/matrix?package=platform-bun', 'CI matrix · excluded runtimes'),
      screen('matrix-missing', 'runs/run-4806/matrix?package=sql-pg&result=missing', 'CI matrix · result not reported'),
      screen('matrix-loading', 'runs/run-4802/matrix', 'CI matrix · loading', 'net=slow'),
      screen('matrix-error', 'runs/run-4802/matrix', 'CI matrix · unavailable', 'net=error'),
      screen('matrix-empty', 'runs/run-4802/matrix', 'CI matrix · no results', 'data=empty'),
      screen('matrix-signed-out', 'runs/run-4802/matrix', 'CI matrix · public read only', 'as=out')
    ]
  },
  {
    pattern: 'smithers.sh/:owner/:repo/runs', name: 'Repository runs',
    render: ({ params, query }) => { selectRepo(`${params.owner}/${params.repo}`); return query.has('affected') ? <RepoNotFound /> : <Runs />; },
    screens: [
      screen("runs", "runs", "Repository runs"),
      screen("runs-loading", "runs", "Runs · loading", "net=slow"),
      screen("runs-error", "runs", "Runs · unavailable", "net=error"),
      screen("runs-empty", "runs", "Runs · empty", "data=empty"),
      screen("runs-signed-out", "runs", "Runs · public read only", "as=out"),
      screen("runs-reader", "runs", "Runs · reader", "role=reader")
    ]
  },
  {
    pattern: 'smithers.sh/:owner/:repo/runs/:id', name: 'CI run log or repository run',
    render: ({ params }) => {
      selectRepo(`${params.owner}/${params.repo}`);
      const item = localRun(params.id);
      return item ? <LocalRun item={item} /> : <Run id={params.id} />;
    },
    screens: [
      screen('setup-log', 'runs/run-ci-setup?stage=setup-bun', 'CI run · install failure log'),
      screen('failure-log', 'runs/run-4802?stage=test-bun', 'CI run · named Bun SQLite failure')
    ]
  }
];
