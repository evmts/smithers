-- Member views belong on the roster. Stack positions are rewritten, so a
-- landed TODO instead keeps a repository-local, immutable merge sequence.
ALTER TABLE collaborators ADD COLUMN view_state jsonb NOT NULL DEFAULT '{}'::jsonb
 CHECK (jsonb_typeof(view_state) = 'object');
ALTER TABLE mythical_items ADD COLUMN merge_seq bigint CHECK (merge_seq > 0);
WITH merged AS (
 SELECT id, row_number() OVER (PARTITION BY repository_id ORDER BY updated_at, id) AS seq
 FROM mythical_items WHERE state = 'landed'
) UPDATE mythical_items i SET merge_seq = merged.seq FROM merged WHERE i.id = merged.id;
CREATE UNIQUE INDEX mythical_items_merge_seq_unique ON mythical_items(repository_id, merge_seq);
CREATE FUNCTION mythical_merge_sequence() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP = 'UPDATE' AND OLD.merge_seq IS NOT NULL THEN
  NEW.merge_seq := OLD.merge_seq;
 ELSIF NEW.state = 'landed' THEN
  -- Separate from the stack worker's advisory lock; concurrent merges serialize.
  PERFORM pg_advisory_xact_lock(74621, (NEW.repository_id % 2147483647)::integer);
  SELECT coalesce(max(merge_seq), 0) + 1 INTO NEW.merge_seq
   FROM mythical_items WHERE repository_id = NEW.repository_id;
 ELSE
  NEW.merge_seq := NULL;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER mythical_merge_sequence BEFORE INSERT OR UPDATE ON mythical_items
 FOR EACH ROW EXECUTE FUNCTION mythical_merge_sequence();
