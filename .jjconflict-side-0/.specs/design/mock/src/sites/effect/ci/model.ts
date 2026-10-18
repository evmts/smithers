import { run } from '../../repo/fixtures';
import type { PackageInfo, Run } from '../../repo/fixtures/types';
import { extras, type CiMatrix, type CiResult, type Runtime } from '../../repo/fixtures/data/Effect-TS__effect';
import scenarios from './scenarios.json';

export const runtimes: Runtime[] = ['Node', 'Deno', 'Bun'];
export const families = [['', 'Core'], ['ai', 'AI'], ['atom', 'Atom'], ['platform', 'Platform'], ['sql', 'SQL'], ['tools', 'Tools']] as const;
export const slugOf = (pkg: PackageInfo) => pkg.slug ?? pkg.name.replace(/^@effect\//, '');
export const sharedChecks = () => extras.ciProjects.jobs.filter(job => !job.runtime);
export const setupRun = scenarios.setupFailure as Run;

export const localRun = (id: string) => id === setupRun.id ? setupRun : undefined;
export const ciRun = (id: string) => localRun(id) ?? run(id);

export const matrixFor = (id: string, missing = false): CiMatrix | undefined => {
  const fixture = extras.ciProjects.matrices.find(matrix => matrix.run === id);
  if (fixture?.state === 'running') return { ...fixture, results: fixture.results.map(result =>
    result.package === scenarios.pendingResult.package && result.runtime === scenarios.pendingResult.runtime
      ? { ...result, state: 'queued', reason: scenarios.pendingResult.reason, duration: '—' } : result) };
  if (fixture) return missing ? {
    ...fixture, state: 'incomplete', results: fixture.results.map(result =>
      result.package === scenarios.missingResult.package && result.runtime === scenarios.missingResult.runtime
        ? { ...result, state: 'missing', reason: scenarios.missingResult.reason, duration: '—' } : result)
  } : fixture;
  const item = localRun(id);
  if (!item) return undefined;
  const base = extras.ciProjects.matrices.find(matrix => matrix.state === 'succeeded')!;
  return {
    ...base, run: id, state: item.state, event: item.trigger.kind,
    sharedChecks: base.sharedChecks.map(check => ({
      ...check, state: id === setupRun.id ? 'queued' : check.stage === 'static-checks' ? 'running' : 'queued',
      reason: id === setupRun.id ? 'Install failed before this check started.' : 'Waiting for the preceding stage.'
    })),
    results: base.results.map(result => {
      const eligible = !['excluded', 'skipped'].includes(result.state);
      const included = true;
      return {
        ...result, run: id, duration: '—',
        state: !eligible ? result.state : !included ? 'excluded' : id === setupRun.id ? 'missing' : 'queued',
        reason: !eligible ? result.reason : !included ? 'Outside the affected package set; not run.'
          : id === setupRun.id ? 'Install failed before tests started.' : 'Waiting for shared checks.'
      };
    })
  };
};

export const failureResult = (matrix: CiMatrix): CiResult | undefined => matrix.results.find(result => result.state === 'failure');
