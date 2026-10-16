ALTER TABLE sandbox_egress_usage ADD COLUMN billing_owner_type text NOT NULL DEFAULT 'user' CHECK (billing_owner_type IN ('user','org'));
CREATE INDEX sandbox_egress_usage_billing_owner_day ON sandbox_egress_usage(billing_owner_type,billing_user_id,day);
