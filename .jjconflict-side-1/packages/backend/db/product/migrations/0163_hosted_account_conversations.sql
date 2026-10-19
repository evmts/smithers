-- Hosted foreground chat keeps each account's view separate from install
-- membership. Provider credentials and turn output remain in their existing stores.
CREATE TABLE chat_account_views (
    user_id bigint NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    conversation_id text NOT NULL,
    view_state jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(view_state) = 'object'),
    PRIMARY KEY (user_id, conversation_id)
);
