-- The stalled-job reclaim reads 'processing' rows by updated_at every minute
-- (ResetStalledGitHubWebhookJobs); without this it scans every job ever
-- received (#4296).
CREATE INDEX github_webhook_jobs_processing_updated_idx ON github_webhook_jobs (updated_at) WHERE status = 'processing';
