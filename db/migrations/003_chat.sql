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
