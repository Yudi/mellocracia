-- This first Prisma migration deliberately supports databases created by the
-- former custom runner. Applying it records the existing schema in Prisma's
-- migration history; new databases receive the same final schema.

CREATE TABLE IF NOT EXISTS polls (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  share_token_hash TEXT NOT NULL UNIQUE,
  results_token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  total_votes INTEGER NOT NULL DEFAULT 0 CHECK (total_votes >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS polls_expires_at_idx ON polls (expires_at);

CREATE TABLE IF NOT EXISTS poll_options (
  poll_id TEXT NOT NULL REFERENCES polls(id) ON DELETE CASCADE,
  post_id TEXT NOT NULL,
  title TEXT NOT NULL,
  excerpt TEXT NOT NULL DEFAULT '',
  tags TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  feature_image TEXT,
  feature_image_alt TEXT,
  source_url TEXT NOT NULL,
  position INTEGER NOT NULL,
  vote_count INTEGER NOT NULL DEFAULT 0 CHECK (vote_count >= 0),
  PRIMARY KEY (poll_id, post_id),
  UNIQUE (poll_id, position)
);

ALTER TABLE polls
  ADD COLUMN IF NOT EXISTS total_votes INTEGER NOT NULL DEFAULT 0;

ALTER TABLE poll_options
  ADD COLUMN IF NOT EXISTS tags TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

CREATE INDEX IF NOT EXISTS poll_options_poll_id_idx ON poll_options (poll_id);

CREATE TABLE IF NOT EXISTS poll_votes (
  poll_id TEXT NOT NULL REFERENCES polls(id) ON DELETE CASCADE,
  voter_nonce_hash TEXT NOT NULL,
  option_post_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (poll_id, voter_nonce_hash, option_post_id),
  FOREIGN KEY (poll_id, option_post_id)
    REFERENCES poll_options(poll_id, post_id)
    ON DELETE CASCADE
);

ALTER TABLE poll_votes DROP CONSTRAINT IF EXISTS poll_votes_pkey;
ALTER TABLE poll_votes
  ADD PRIMARY KEY (poll_id, voter_nonce_hash, option_post_id);

CREATE INDEX IF NOT EXISTS poll_votes_poll_id_idx ON poll_votes (poll_id);
