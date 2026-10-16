-- Keep billing attribution after the machine or repository disappears. user_id
-- remains the legacy storage identity so persisted intervals stay readable.
ALTER TABLE sandbox_usage_intervals
 ADD COLUMN billing_owner_type text NOT NULL DEFAULT 'user' CHECK (billing_owner_type IN ('user','org')),
 ADD COLUMN billing_owner_id bigint;
UPDATE sandbox_usage_intervals SET billing_owner_id=user_id;
UPDATE sandbox_usage_intervals i
 SET billing_owner_type=CASE WHEN r.org_id IS NOT NULL THEN 'org' ELSE 'user' END,
     billing_owner_id=COALESCE(r.org_id,r.user_id)
 FROM workspaces w JOIN repositories r ON r.id=w.repository_id
 WHERE i.sandbox_kind='workspace' AND w.id::text=i.sandbox_id;
ALTER TABLE sandbox_usage_intervals ALTER COLUMN billing_owner_id SET NOT NULL;
CREATE INDEX sandbox_usage_intervals_billing_owner_started ON sandbox_usage_intervals(billing_owner_type,billing_owner_id,started_at);

CREATE FUNCTION smithers_sandbox_usage_billing_owner() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 NEW.billing_owner_type := 'user';
 NEW.billing_owner_id := NEW.user_id;
 IF NEW.sandbox_kind='workspace' THEN
  SELECT CASE WHEN r.org_id IS NOT NULL THEN 'org' ELSE 'user' END,COALESCE(r.org_id,r.user_id)
   INTO NEW.billing_owner_type,NEW.billing_owner_id
   FROM workspaces w JOIN repositories r ON r.id=w.repository_id WHERE w.id::text=NEW.sandbox_id;
  IF NOT FOUND THEN
   NEW.billing_owner_type := 'user';
   NEW.billing_owner_id := NEW.user_id;
   IF EXISTS (SELECT 1 FROM users WHERE id=NEW.user_id AND lower_username='smithers-machines' AND prohibit_login) THEN
    RAISE EXCEPTION 'workspace billing owner unavailable' USING ERRCODE='23514';
   END IF;
  END IF;
 END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER sandbox_usage_billing_owner BEFORE INSERT ON sandbox_usage_intervals
 FOR EACH ROW EXECUTE FUNCTION smithers_sandbox_usage_billing_owner();

-- Cut an open interval at ownership transfer. Its replacement is stamped by
-- the same insert trigger under the new repository payer.
CREATE FUNCTION smithers_repository_sandbox_usage_boundary() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN
  UPDATE sandbox_usage_intervals i SET ended_at=GREATEST(i.started_at,now())
   FROM workspaces w WHERE w.repository_id=OLD.id AND w.id::text=i.sandbox_id
   AND i.sandbox_kind='workspace' AND i.ended_at IS NULL;
  RETURN OLD;
 ELSIF NEW.user_id IS DISTINCT FROM OLD.user_id OR NEW.org_id IS DISTINCT FROM OLD.org_id THEN
  WITH closed AS (
   UPDATE sandbox_usage_intervals i SET ended_at=GREATEST(i.started_at,now())
    FROM workspaces w WHERE w.repository_id=NEW.id AND w.id::text=i.sandbox_id
    AND i.sandbox_kind='workspace' AND i.ended_at IS NULL
    RETURNING i.user_id,i.sandbox_kind,i.sandbox_id
  ) INSERT INTO sandbox_usage_intervals(user_id,sandbox_kind,sandbox_id)
    SELECT user_id,sandbox_kind,sandbox_id FROM closed;
 END IF;
 RETURN NULL;
END;
$$;
CREATE TRIGGER repository_sandbox_usage_transfer AFTER UPDATE OF user_id,org_id ON repositories
 FOR EACH ROW EXECUTE FUNCTION smithers_repository_sandbox_usage_boundary();
CREATE TRIGGER repository_sandbox_usage_delete BEFORE DELETE ON repositories
 FOR EACH ROW EXECUTE FUNCTION smithers_repository_sandbox_usage_boundary();
