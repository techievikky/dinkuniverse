CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  name TEXT,
  picture TEXT,
  provider TEXT NOT NULL DEFAULT 'google',
  user_type TEXT CHECK (user_type IN ('player', 'club_owner', 'tournament_organizer')),
  role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin')),
  password_hash TEXT,
  password_salt TEXT,
  session_token TEXT,
  phone TEXT,
  city TEXT,
  zip_code TEXT,
  bio TEXT,
  photo_url TEXT,
  dupr_score NUMERIC,
  home_club TEXT,
  timezone TEXT,
  blocked_users JSONB DEFAULT '[]'::jsonb,
  stripe_account_id TEXT,
  stripe_charges_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  stripe_details_submitted BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS users_email_idx ON users (LOWER(email));

CREATE TABLE IF NOT EXISTS conversations (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL DEFAULT '',
  is_group BOOLEAN NOT NULL DEFAULT FALSE,
  group_photo_url TEXT NOT NULL DEFAULT '',
  members JSONB NOT NULL DEFAULT '[]'::jsonb,
  last_message TEXT NOT NULL DEFAULT '',
  last_message_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender_id TEXT NOT NULL,
  sender_name TEXT NOT NULL DEFAULT '',
  sender_photo TEXT NOT NULL DEFAULT '',
  text TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS conversations_members_idx ON conversations USING GIN (members);
CREATE INDEX IF NOT EXISTS messages_conversation_idx ON messages (conversation_id, created_at);

CREATE TABLE IF NOT EXISTS clubs (
  id TEXT PRIMARY KEY,
  created_by_id TEXT NOT NULL,
  name TEXT NOT NULL,
  location TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  logo_url TEXT,
  courts JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS club_memberships (
  id TEXT PRIMARY KEY,
  club_id TEXT NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  club_name TEXT NOT NULL DEFAULT '',
  created_by_id TEXT NOT NULL,
  user_name TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending',
  member_type TEXT NOT NULL DEFAULT 'member',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (club_id, created_by_id)
);

CREATE TABLE IF NOT EXISTS availabilities (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  date DATE NOT NULL,
  hours JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, date)
);

CREATE TABLE IF NOT EXISTS plays (
  id TEXT PRIMARY KEY,
  created_by_id TEXT NOT NULL,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS tournaments (
  id TEXT PRIMARY KEY,
  created_by_id TEXT NOT NULL,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS tournaments_date_idx ON tournaments ((data->>'date'));
CREATE INDEX IF NOT EXISTS tournaments_created_by_idx ON tournaments (created_by_id);

CREATE TABLE IF NOT EXISTS tournament_payments (
  id TEXT PRIMARY KEY,
  tournament_id TEXT NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  user_name TEXT NOT NULL DEFAULT '',
  division TEXT NOT NULL,
  amount NUMERIC NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'USD',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'failed', 'cancelled')),
  stripe_session_id TEXT UNIQUE,
  stripe_payment_intent_id TEXT,
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS tournament_payments_tournament_idx ON tournament_payments (tournament_id);

CREATE INDEX IF NOT EXISTS clubs_created_by_idx ON clubs (created_by_id);
CREATE UNIQUE INDEX IF NOT EXISTS clubs_name_lower_idx ON clubs (LOWER(name));

CREATE TABLE IF NOT EXISTS check_ins (
  id TEXT PRIMARY KEY,
  club_id TEXT NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  club_name TEXT NOT NULL DEFAULT '',
  player_user_id TEXT NOT NULL,
  player_name TEXT NOT NULL DEFAULT '',
  checked_in_by_id TEXT NOT NULL,
  checked_in_by_name TEXT NOT NULL DEFAULT '',
  date DATE NOT NULL,
  checked_in_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS check_ins_club_date_idx ON check_ins (club_id, date);
CREATE INDEX IF NOT EXISTS check_ins_player_idx ON check_ins (club_id, player_user_id);
CREATE TABLE IF NOT EXISTS club_booking_requests (
  id TEXT PRIMARY KEY,
  club_id TEXT NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  requester_id TEXT NOT NULL,
  requester_name TEXT NOT NULL DEFAULT '',
  title TEXT NOT NULL,
  date DATE NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  court_numbers JSONB NOT NULL DEFAULT '[]'::jsonb,
  notes TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  reviewed_by_id TEXT,
  reviewed_at TIMESTAMPTZ,
  play_id TEXT REFERENCES plays(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS club_booking_requests_club_status_date_idx
  ON club_booking_requests (club_id, status, date);

CREATE TABLE IF NOT EXISTS play_invites (
  id TEXT PRIMARY KEY,
  play_id TEXT NOT NULL REFERENCES plays(id) ON DELETE CASCADE,
  inviter_id TEXT NOT NULL,
  invitee_id TEXT NOT NULL,
  invitee_name TEXT NOT NULL DEFAULT '',
  invitee_photo TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'invited' CHECK (status IN ('invited', 'accepted', 'declined')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (play_id, invitee_id)
);
CREATE INDEX IF NOT EXISTS play_invites_play_idx ON play_invites (play_id);

CREATE INDEX IF NOT EXISTS memberships_user_idx ON club_memberships (created_by_id, status);
CREATE INDEX IF NOT EXISTS availabilities_date_idx ON availabilities (date);
CREATE INDEX IF NOT EXISTS plays_date_idx ON plays ((data->>'date'));

CREATE TABLE IF NOT EXISTS favorite_players (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  player_user_id TEXT NOT NULL,
  player_name TEXT NOT NULL DEFAULT '',
  player_photo TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, player_user_id)
);

CREATE INDEX IF NOT EXISTS favorite_players_user_idx ON favorite_players (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS club_alerts (
  id TEXT PRIMARY KEY,
  club_id TEXT REFERENCES clubs(id) ON DELETE CASCADE,
  club_name TEXT NOT NULL DEFAULT '',
  created_by_id TEXT NOT NULL,
  recipient_user_id TEXT,
  title TEXT NOT NULL,
  message TEXT NOT NULL DEFAULT '',
  type TEXT NOT NULL DEFAULT 'general',
  discount NUMERIC,
  expires DATE,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS club_alerts_club_idx ON club_alerts (club_id);
