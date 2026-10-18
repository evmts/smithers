-- One predicate for every user-facing run read, before pagination or counting.
-- Unknown ownership fails closed. Ordinary runs retain repository visibility.
CREATE FUNCTION may_view_workflow_run(run_id bigint, viewer_id bigint)
RETURNS boolean LANGUAGE sql STABLE AS $$
 WITH turn AS (
   SELECT r.*, j.payload AS binding,
     COALESCE(r.dispatch_inputs->>'agent_session_id',
       (SELECT s.id::text FROM agent_sessions s WHERE s.workflow_run_id=r.id AND s.repository_id=r.repository_id LIMIT 1),
       (SELECT t.payload->>'session_id' FROM workflow_tasks t WHERE t.workflow_run_id=r.id ORDER BY t.id LIMIT 1),
       j.payload#>>'{target,BindingID}',
       CASE WHEN r.execution_plane='agent' OR r.trigger_event='agent_message' THEN r.dispatch_inputs->>'session_id' END
     ) AS session_id
   FROM workflow_runs r
   LEFT JOIN product_job_requests j ON j.request_id='agent-run:'||r.id::text
     AND j.tenant_id='repository:'||r.repository_id::text
     AND j.operation='flow.runtime.launch' AND j.payload#>>'{target,BindingKind}'='agent-session'
   WHERE r.id=run_id
 )
 SELECT CASE WHEN r.execution_plane='agent' OR r.trigger_event='agent_message'
   OR r.dispatch_inputs->>'agent_session_id' IS NOT NULL OR r.binding IS NOT NULL
   OR EXISTS (SELECT 1 FROM agent_sessions s WHERE s.workflow_run_id=r.id AND s.repository_id=r.repository_id)
 THEN EXISTS (SELECT 1 FROM agent_sessions s
   WHERE s.repository_id=r.repository_id
     -- UUID spellings are equivalent; malformed identifiers never reach a cast.
     AND s.id=CASE WHEN translate(lower(btrim(r.session_id)), '-{}', '') ~ '^[0-9a-f]{32}$'
       THEN translate(lower(btrim(r.session_id)), '-{}', '')::uuid END
     AND s.user_id=viewer_id AND viewer_id>0)
 ELSE true END
 FROM turn r
$$;
