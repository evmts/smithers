import { useMock, useRead } from '../../core/mock';
import { Link, useLocation } from '../../core/router';
import { repo, to } from '../../repo/fixtures';
import type { Run } from '../../repo/fixtures/types';
import { Empty, Failed, Loading, RepoFrame, usePackageScope } from '../../repo/frame';
import { ResultStatus, MatrixSignedOut, logRoute } from './Matrix';

// Locally launched mock runs and the setup-failure scenario use the same run URL/log anatomy.
// Existing fixture runs keep stage 1's complete detail view.
export const LocalRun = ({ item }: { item: Run }) => {
  const { flags } = useMock();
  const location = useLocation();
  const query = new URLSearchParams(location.split('?')[1]);
  const { scope, withScope } = usePackageScope();
  const read = useRead(`effect-ci-log:${repo.slug}:${item.id}:${scope?.name ?? 'all'}:${query.get('stage') ?? ''}`);
  const stage = item.stages.find(value => value.id === query.get('stage')) ?? item.stages[0]!;
  return <RepoFrame tab="runs" title={`${item.id} · ${repo.slug}`} askView="runs" askContext={`${repo.slug} / ${item.id} / ${stage.label}`}>
    {read.state === 'loading' ? <Loading variant="detail" rows={5} /> : read.state === 'error'
      ? <Failed what="the job log" reason="The run service didn't return the stage output." onRetry={read.retry} />
      : flags.data === 'empty' ? <Empty title="No stage output." /> : <div className="effect-ci-page">
        {flags.as === 'out' && <MatrixSignedOut />}
        <div className="effect-ci-breadcrumb"><Link to={withScope(to('runs'))}>Runs</Link><span>/</span><span>{item.id}</span></div>
        <header className="effect-ci-header"><div className="effect-ci-heading"><div className="effect-ci-title-line"><ResultStatus state={item.state} /><h1>{item.title}</h1></div>
          <div className="effect-ci-meta"><code>{item.branch}</code><span>·</span><span>{item.duration}</span><span>·</span><span>{item.trigger.by}</span></div></div>
          <Link className="repo-ui-btn" to={withScope(to(`runs/${item.id}/matrix`))}>Matrix</Link></header>
        <nav className="effect-ci-stage-tabs" aria-label="Run stages">{item.stages.map(value => <Link key={value.id} title={`/ci.job ${item.id} ${value.id}`} aria-current={value.id === stage.id ? 'page' : undefined} to={withScope(logRoute(item.id, value.id))}><ResultStatus state={value.state} /><span>{value.label}</span></Link>)}</nav>
        <section className="effect-ci-log"><header><h2>{stage.label}</h2><ResultStatus state={stage.state} /><span className="effect-ci-duration">{stage.duration ?? '—'}</span></header><p>{stage.summary}</p>
          {stage.log.length ? <pre tabIndex={0} aria-label={`${stage.label} log`}>{stage.log.join('\n')}</pre> : <p className="effect-ci-muted">No output yet.</p>}</section>
      </div>}
  </RepoFrame>;
};
