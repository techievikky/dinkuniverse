import 'dotenv/config';
import fs from 'node:fs/promises';
import pg from 'pg';

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is required to run migrations.');
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : undefined,
});

try {
  const schema = await fs.readFile(new URL('../db/schema.sql', import.meta.url), 'utf8');
  await pool.query(schema);

  const patchStatements = [
    'ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash TEXT',
    'ALTER TABLE users ADD COLUMN IF NOT EXISTS password_salt TEXT',
    'ALTER TABLE users ADD COLUMN IF NOT EXISTS session_token TEXT',
    'ALTER TABLE users ADD COLUMN IF NOT EXISTS phone TEXT',
    'ALTER TABLE users ADD COLUMN IF NOT EXISTS city TEXT',
    'ALTER TABLE users ADD COLUMN IF NOT EXISTS zip_code TEXT',
    'ALTER TABLE users ADD COLUMN IF NOT EXISTS bio TEXT',
    'ALTER TABLE users ADD COLUMN IF NOT EXISTS photo_url TEXT',
    'ALTER TABLE users ADD COLUMN IF NOT EXISTS dupr_score NUMERIC',
    'ALTER TABLE users ADD COLUMN IF NOT EXISTS home_club TEXT',
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS blocked_users JSONB DEFAULT '[]'::jsonb",
    'ALTER TABLE users ADD COLUMN IF NOT EXISTS timezone TEXT',
    'CREATE UNIQUE INDEX IF NOT EXISTS users_session_token_idx ON users (session_token) WHERE session_token IS NOT NULL',
    'ALTER TABLE club_booking_requests ADD COLUMN IF NOT EXISTS play_id TEXT REFERENCES plays(id) ON DELETE SET NULL',
    'ALTER TABLE users ADD COLUMN IF NOT EXISTS stripe_account_id TEXT',
    'ALTER TABLE users ADD COLUMN IF NOT EXISTS stripe_charges_enabled BOOLEAN NOT NULL DEFAULT FALSE',
    'ALTER TABLE users ADD COLUMN IF NOT EXISTS stripe_details_submitted BOOLEAN NOT NULL DEFAULT FALSE',
  ];

  for (const statement of patchStatements) {
    await pool.query(statement);
  }

  await pool.query(`
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
    ALTER TABLE conversations ADD COLUMN IF NOT EXISTS group_photo_url TEXT NOT NULL DEFAULT '';
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
    ALTER TABLE club_alerts ADD COLUMN IF NOT EXISTS recipient_user_id TEXT;
    CREATE INDEX IF NOT EXISTS club_alerts_club_idx ON club_alerts (club_id);
  `);

  const adminEmails = (process.env.ADMIN_EMAILS || process.env.VITE_ADMIN_EMAILS || '')
    .split(',')
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
  if (adminEmails.length) {
    await pool.query('UPDATE users SET role = $1, updated_at = NOW() WHERE LOWER(email) = ANY($2::text[])', [
      'admin',
      adminEmails,
    ]);
  }
  console.log('Database schema is up to date.');
} finally {
  await pool.end();
}
