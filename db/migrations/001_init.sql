-- Kingdom Chaos online persistence (prefixed kc_)

CREATE TABLE IF NOT EXISTS kc_accounts (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  pass_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS kc_rooms (
  code TEXT PRIMARY KEY,
  host_account TEXT NOT NULL REFERENCES kc_accounts(id),
  status TEXT NOT NULL CHECK (status IN ('lobby', 'playing', 'finished', 'ended')),
  state JSONB,
  version INT NOT NULL DEFAULT 0,
  seats JSONB NOT NULL DEFAULT '[]'::jsonb,
  activity_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS kc_rooms_expires_at_idx ON kc_rooms (expires_at);

CREATE TABLE IF NOT EXISTS kc_actions (
  room_code TEXT NOT NULL REFERENCES kc_rooms(code) ON DELETE CASCADE,
  client_action_id TEXT NOT NULL,
  account_id TEXT NOT NULL REFERENCES kc_accounts(id),
  result JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (room_code, client_action_id)
);
