import { pluralize } from "../../repo/ui/pluralize"
import { useMock, useRead } from '../../core/mock';
import { Link, navigate, useLocation } from '../../core/router';
import { repo, to, shortSha, branch } from '../../repo/fixtures';
import type { Run } from '../../repo/fixtures/types';
import { extras, type CiMatrix, type CiResult } from '../../repo/fixtures/data/Effect-TS__effect';
import { RepoFrame, Loading, Failed, Empty, usePackageScope } from '../../repo/frame';
import { Icon } from '../../app/lib';
import { ciRun, failureResult, families, matrixFor, runtimes, setupRun, slugOf } from './model';

export const stateLabel = (state: string): string => ({
  success: 'Passed', succeeded: 'Passed', failure: 'Failed', failed: 'Failed', skipped: 'Skipped',
  blocked: 'Not started — install failed', excluded: 'Excluded', missing: 'Not reported', queued: 'Pending', running: 'Running', cancelled: 'Cancelled', incomplete: 'Incomplete'
}[state] ?? state);
export const ResultStatus = ({ state }: { state: string }) => <span className="effect-ci-status" data-state={state}>
  {['success', 'succeeded', 'failure', 'failed', 'running', 'queued'].includes(state)
    ? <Icon name={['success', 'succeeded'].includes(state) ? 'check' : ['failed', 'failure'].includes(state) ? 'x' : 'clock'} size={14} />
    : <span aria-hidden="true" className="effect-ci-status-symbol">{state === 'excluded' ? '∅' : state === 'missing' ? '?' : state === 'cancelled' ? '×' : '−'}</span>}
  <span>{stateLabel(state)}</span>
</span>;

export const logRoute = (id: string, stage: string, result?: CiResult) => {
  const query = new URLSearchParams({ stage });
  if (result) query.set('project', result.project);
  if (result?.test) query.set('test', result.test);
  return to(`runs/${id}?${query}`);
};

const SharedChecks = ({ matrix, item }: { matrix: CiMatrix; item: Run }) => {
  const { withScope } = usePackageScope();
  return <section className="effect-ci-shared" aria-labelledby="effect-ci-shared-title">
    <h2 id="effect-ci-shared-title">Shared checks</h2>
    <div className="effect-ci-shared-grid">{matrix.sharedChecks.map(check => {
      const stage = item.stages.find(value => value.id === check.stage);
      const blocked = item.id === setupRun.id && (!stage || stage.state === 'queued');
      const state = blocked ? 'blocked' : stage?.state ?? check.state;
      return <Link key={check.stage} className="effect-ci-shared-check" data-state={state} title={blocked ? "Not started — install failed" : check.reason}
        to={withScope(logRoute(item.id, stage?.id ?? (item.id === setupRun.id ? 'setup-bun' : check.stage)))}>
        <strong>{check.stage === 'doctest' ? 'Documentation' : check.name}</strong>
        <span><ResultStatus state={state} /><span className="effect-ci-duration">{['skipped', 'queued', 'cancelled'].includes(state) ? '—' : stage?.duration ?? '—'}</span></span>
      </Link>;
    })}</div>
  </section>;
};

export const MatrixSetupFailure = ({ item }: { item: Run }) => <section className="effect-ci-failure" role="status">
  <h2><Icon name="x" />{item.failure?.reason}</h2>
  <pre aria-label="Install log tail">{item.stages[0]?.log.slice(-3).join('\n')}</pre>
</section>;
export const MatrixSignedOut = () => <p className="effect-ci-readonly">Public run · read only</p>;
export const MatrixLoading = () => <Loading variant="detail" rows={8} />;
export const MatrixError = ({ retry }: { retry: () => void }) => <Failed what="the CI matrix" reason="The run service didn't return the package results." onRetry={retry} />;
export const MatrixEmpty = () => <Empty title="No matrix results." action={<Link className="repo-ui-btn" to={to('runs')}>All runs</Link>} />;

const ResultCell = ({ result, id }: { result: CiResult; id: string }) => {
  const { withScope } = usePackageScope();
  const exclusions = extras.ciProjects.projects.find(project => project.package === result.package)?.exclusions[result.runtime] ?? [];
  return <Link className="effect-ci-cell-link" data-state={result.state}
    title={`${result.runtime}: ${result.reason}${result.test ? `\n${result.test}` : ''}${exclusions.length ? `\nExcluded files: ${exclusions.join(', ')}` : ''}`}
    aria-label={`${result.runtime}: ${stateLabel(result.state)}. ${result.package}. ${result.reason}`}
    to={withScope(logRoute(id, id === setupRun.id ? 'setup-bun' : result.stage, result))}>
    <span className="effect-ci-runtime-name">{result.runtime}</span>
    <ResultStatus state={result.state} />
    {result.duration !== '—' && <span className="effect-ci-duration">{result.duration}</span>}
    {exclusions.length > 0 && <span className="effect-ci-cell-note">{exclusions.length} {pluralize(exclusions.length, "file")} excluded</span>}
  </Link>;
};

export const MatrixReady = ({ matrix, item }: { matrix: CiMatrix; item: Run }) => {
  const location = useLocation();
  const query = new URLSearchParams(location.split('?')[1]);
  const { flags } = useMock();
  const { scope, withScope } = usePackageScope();
  const scopedResults = matrix.results.filter(result => !scope || result.package === scope.name);
  const failure = failureResult({ ...matrix, results: scopedResults });
  const packages = (repo.config.packages ?? []).filter(pkg => !scope || pkg.name === scope.name);
  const onlyFailures = query.has('failures') ? query.get('failures') === '1'
    : Boolean(failure);
  const visible = packages.filter(pkg => !onlyFailures || matrix.results.some(result => result.package === pkg.name && result.state === 'failure'));
  const target = failure ?? scopedResults.find(result => result.state === 'missing') ?? scopedResults.find(result => result.state === 'running') ?? scopedResults.find(result => result.state === 'success') ?? scopedResults[0];
  const setupFailed = item.id === setupRun.id;
  const targetStage = setupFailed ? 'setup-bun' : target?.stage ?? item.stages[0]?.id ?? '';
  const counts = (state: string) => scopedResults.filter(result => result.state === state).length;
  const ref = item.branch ?? repo.defaultBranch;
  const sha = branch(ref)?.head;
  const changeFilter = (value: boolean) => {
    const next = new URLSearchParams(query); next.set('failures', value ? '1' : '0');
    navigate(`${location.split('?')[0]}?${next}`);
  };
  return <div className="effect-ci-page">
    {flags.as === 'out' && <MatrixSignedOut />}
    <div className="effect-ci-breadcrumb"><Link to={withScope(to('runs'))}>Runs</Link><span>/</span><Link to={withScope(to(`runs/${item.id}`))}>{item.id}</Link><span>/</span><span>Matrix</span></div>
    <header className="effect-ci-header">
      <div className="effect-ci-heading"><div className="effect-ci-title-line"><ResultStatus state={matrix.state} /><h1>{item.title}</h1></div>
        <div className="effect-ci-meta"><code>{ref}</code>{sha && <Link to={withScope(to(`commit/${sha}`))}>{shortSha(sha)}</Link>}<span>·</span><span>{item.duration}</span><span>·</span><span>{matrix.event === 'pull' ? 'pull request' : matrix.event}</span></div>
      </div>
      <div className="effect-ci-actions">
        {(failure || setupFailed) && <Link className="repo-ui-btn repo-ui-btn-primary" title={`/ci.job ${item.id} ${targetStage}`}
          to={withScope(logRoute(item.id, targetStage, setupFailed ? undefined : target))}>{setupFailed ? 'Open setup-bun failure' : `Open ${failure!.runtime} · ${failure!.package} failure`}<Icon name="chevron" size={14} /></Link>}
      </div>
    </header>
    {setupFailed ? <MatrixSetupFailure item={item} /> : failure ? <section className="effect-ci-failure">
      <div className="effect-ci-failure-title"><ResultStatus state="failure" /><strong>{failure.runtime} · {failure.package}</strong>
        {scope && scope.name !== failure.package && <span className="effect-ci-outside">Outside this package</span>}</div>
      <Link className="effect-ci-test-name" to={withScope(logRoute(item.id, failure.stage, failure))}>{failure.test}</Link>
      {failure.path && <Link className="effect-ci-source" to={withScope(to(`blob/${encodeURIComponent(ref)}/${failure.path}?L=${failure.line ?? 1}`))}>{failure.path}:{failure.line}</Link>}
    </section> : matrix.state === 'cancelled' ? <p className="effect-ci-notice">Cancelled · superseded by a newer revision.</p>
      : matrix.state === 'incomplete' ? <p className="effect-ci-notice">Deno did not report a result for @effect/sql-pg.</p> : null}
    <SharedChecks matrix={matrix} item={item} />
    <section className="effect-ci-results" aria-labelledby="effect-ci-results-title">
      <div className="effect-ci-toolbar"><h2 id="effect-ci-results-title">{scope?.name ?? 'Package results'} <span>{visible.length}</span></h2>
        <label className="effect-ci-filter"><input type="checkbox" checked={onlyFailures} title={`/ci.failures ${onlyFailures ? 'all' : 'only'}`} onChange={event => changeFilter(event.target.checked)} />Failures only</label>
      </div>
      {visible.length ? <table className="effect-ci-table"><caption className="repo-ui-sr">Package results for {item.id}. Overall status: {stateLabel(matrix.state)}.</caption>
        <thead><tr><th scope="col">Package</th>{runtimes.map(runtime => <th key={runtime} scope="col">{runtime}</th>)}</tr></thead>
        {families.map(([family, label]) => {
          const members = visible.filter(pkg => (pkg.family ?? '') === family);
          return members.length ? <tbody key={family}><tr className="effect-ci-family"><th scope="rowgroup" colSpan={4}>{label}</th></tr>
            {members.map(pkg => <tr key={pkg.name} className="effect-ci-package-row"><th scope="row"><Link to={to(`packages/${slugOf(pkg)}?package=${slugOf(pkg)}`)}>{pkg.name}</Link><span className="effect-ci-package-path">{pkg.path}</span></th>
              {runtimes.map(runtime => {
                const result = matrix.results.find(value => value.package === pkg.name && value.runtime === runtime)
                  ?? { package: pkg.name, project: pkg.name, runtime, state: 'missing' as const, reason: 'No project result was recorded.', stage: `test-${runtime.toLowerCase()}`, run: item.id, duration: '—' };
                return <td key={runtime}><ResultCell result={result} id={item.id} /></td>;
              })}</tr>)}
          </tbody> : null;
        })}</table> : <div className="effect-ci-no-results"><p>No failed packages in this scope.</p><button className="repo-ui-btn" title="/ci.failures all" onClick={() => changeFilter(false)}>Show all results</button></div>}
      <div className="effect-ci-totals" aria-label={scope ? `${scope.name} result counts` : "All packages result counts"}><span>{counts('success')} passed</span><span>{counts('failure')} failed</span><span>{counts('skipped')} skipped</span><span>{counts('excluded')} excluded</span>
        {counts('running') > 0 && <span>{counts('running')} running</span>}{counts('queued') > 0 && <span>{counts('queued')} pending</span>}{counts('missing') > 0 && <span>{counts('missing')} not reported</span>}{counts('cancelled') > 0 && <span>{counts('cancelled')} cancelled</span>}
      </div>
    </section>
    <div className="effect-ci-sources"><Link to={withScope(to(`blob/${encodeURIComponent(ref)}/${matrix.workflow}`))}>Check workflow</Link><Link to={withScope(to(`blob/${encodeURIComponent(ref)}/vitest.config.ts`))}>Test projects</Link></div>
  </div>;
};
export const MatrixRunning = MatrixReady;
export const MatrixCancelled = MatrixReady;

export const Matrix = ({ id }: { id: string }) => {
  const { flags } = useMock();
  const location = useLocation();
  const { scope } = usePackageScope();
  const query = new URLSearchParams(location.split('?')[1]);
  const read = useRead(`effect-ci:${repo.slug}:${id}:${scope?.name ?? 'all'}:${query.get('result') ?? ''}`);
  const matrix = matrixFor(id, query.get('result') === 'missing');
  const item = ciRun(id);
  return <RepoFrame tab="runs" title={`Matrix · ${id}`} askView="runs" askContext={`${repo.slug} / ${id} / CI matrix`}>
    {read.state === 'loading' ? <MatrixLoading /> : read.state === 'error' ? <MatrixError retry={read.retry} />
      : flags.data === 'empty' || !matrix || !item ? <MatrixEmpty /> : <MatrixReady matrix={matrix} item={item} />}
  </RepoFrame>;
};
