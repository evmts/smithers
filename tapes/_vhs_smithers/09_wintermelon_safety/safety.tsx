import { Claude } from 'smithers-orchestrator';

<Claude
  allowedTools={['Bash', 'Edit', 'Write']}
  permissionMode='confirm'
  acceptEdits={false}
>
  Analyze the repo, propose a patch, but do not apply edits without approval.
</Claude>
