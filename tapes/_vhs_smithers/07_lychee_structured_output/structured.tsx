import { z } from 'zod';
import { Claude } from 'smithers-orchestrator';

const ReviewSummary = z.object({
  summary: z.string(),
  changedFiles: z.array(z.string()),
  risks: z.array(z.string()),
});

<Claude
  schema={ReviewSummary}
  schemaRetries={2}
  onFinished={(r) => console.log(r.structuredOutput)}
>
  Summarize this PR for a reviewer.
</Claude>
