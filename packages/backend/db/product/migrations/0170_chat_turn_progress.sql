-- Producer stages are metadata, separate from the model's sealed frame cursor.
ALTER TABLE chat_turns ADD COLUMN progress jsonb NOT NULL DEFAULT '[]'::jsonb
    CHECK (jsonb_typeof(progress) = 'array');
