// Generated from db/migrations/*.sql. Every statement is idempotent, so the server
// runs this once per instance before its first query: a fresh database just works.
export const SCHEMA_SQL = `
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
-- Google sign-in: link an account to a Google user id (the OpenID "sub" claim).
ALTER TABLE kc_accounts ADD COLUMN IF NOT EXISTS google_sub TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS kc_accounts_google_sub_idx ON kc_accounts (google_sub) WHERE google_sub IS NOT NULL;
-- In-match chat: messages belong to a room and go when the room does.
CREATE TABLE IF NOT EXISTS kc_chat (
  id BIGSERIAL PRIMARY KEY,
  room_code TEXT NOT NULL REFERENCES kc_rooms(code) ON DELETE CASCADE,
  account_id TEXT NOT NULL,
  player_id TEXT NOT NULL,
  username TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS kc_chat_room_idx ON kc_chat (room_code, id);
-- Voice chat: short-lived connection messages between players' browsers (never audio).
CREATE TABLE IF NOT EXISTS kc_signals (
  id BIGSERIAL PRIMARY KEY,
  room_code TEXT NOT NULL REFERENCES kc_rooms(code) ON DELETE CASCADE,
  from_player TEXT NOT NULL,
  to_player TEXT NOT NULL,
  kind TEXT NOT NULL,
  payload JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS kc_signals_to_idx ON kc_signals (room_code, to_player);

-- Player reports (chat or voice abuse). Kept after the room closes so complaints can be handled.
CREATE TABLE IF NOT EXISTS kc_reports (
  id BIGSERIAL PRIMARY KEY,
  room_code TEXT NOT NULL,
  reporter_account TEXT NOT NULL,
  reported_account TEXT NOT NULL,
  reported_name TEXT NOT NULL,
  reason TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
`;
