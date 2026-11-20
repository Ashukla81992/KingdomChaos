-- Google sign-in: link an account to a Google user id (the OpenID "sub" claim).
ALTER TABLE kc_accounts ADD COLUMN IF NOT EXISTS google_sub TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS kc_accounts_google_sub_idx ON kc_accounts (google_sub) WHERE google_sub IS NOT NULL;
