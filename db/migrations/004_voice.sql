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
