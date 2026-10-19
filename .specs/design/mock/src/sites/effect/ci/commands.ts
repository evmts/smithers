import { navigate } from '../../core/router';
import { to } from '../../repo/fixtures';
import { registerSlash } from '../../repo/frame/slash';

registerSlash('ci.job', {
  purpose: 'Open a CI job log', access: 'public', confirm: false,
  fields: [{ name: 'run', label: 'Run' }, { name: 'stage', label: 'Stage' }],
  run: ({ run, stage }, { location, closeAsk }) => {
    const query = new URLSearchParams(location.split('?')[1]);
    for (const field of ['failures', 'result', 'affected', 'confirm', 'ref']) query.delete(field);
    query.set('stage', stage); closeAsk(); navigate(to(`runs/${encodeURIComponent(run)}?${query}`));
  }
});
registerSlash('ci.failures', {
  purpose: 'Filter matrix results', access: 'public', confirm: false,
  fields: [{ name: 'filter', label: 'Results', options: ['only', 'all'] }],
  run: ({ filter }, { location, closeAsk }) => {
    const query = new URLSearchParams(location.split('?')[1]); query.set('failures', filter === 'only' ? '1' : '0');
    const path = location.split('?')[0]; closeAsk();
    navigate(`${path.endsWith('/matrix') ? path : to('runs/run-4802/matrix')}?${query}`);
  }
});
