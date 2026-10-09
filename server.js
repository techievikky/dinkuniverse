import 'dotenv/config';
import 'express-async-errors';
import express from 'express';
import cors from 'cors';
import { OAuth2Client } from 'google-auth-library';
import cookieParser from 'cookie-parser';
import pg from 'pg';
import crypto from 'node:crypto';
import Stripe from 'stripe';

const app = express();
const port = Number(process.env.PORT || 4100);
const googleClient = new OAuth2Client(process.env.VITE_GOOGLE_CLIENT_ID);
const stripe = process.env.STRIPE_SECRET_KEY ? new Stripe(process.env.STRIPE_SECRET_KEY) : null;
const { Pool } = pg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : undefined,
});
const adminEmails = new Set(
  (process.env.ADMIN_EMAILS || process.env.VITE_ADMIN_EMAILS || '')
    .split(',')
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean),
);

app.use(cors({
  origin: process.env.APP_ORIGIN || true,
  credentials: true,
}));

// Registered before express.json() so the raw body is preserved for Stripe's signature check.
app.post('/api/stripe/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  if (!stripe || !process.env.STRIPE_WEBHOOK_SECRET) {
    return res.status(503).json({ error: 'Stripe is not configured on this server.' });
  }
  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, req.headers['stripe-signature'], process.env.STRIPE_WEBHOOK_SECRET);
  } catch (error) {
    return res.status(400).json({ error: `Webhook signature verification failed: ${error.message}` });
  }

  if (event.type === 'checkout.session.completed') {
    await finalizeTournamentPayment(event.data.object);
  } else if (event.type === 'account.updated') {
    await syncStripeAccountStatus(event.data.object);
  }
  return res.json({ received: true });
});

app.use(express.json({ limit: '5mb' }));
app.use(cookieParser());

const sanitizeUser = (user) => {
  if (!user) return null;
  const { password_hash, password_salt, session_token, ...rest } = user;
  return rest;
};

const hashPassword = (password, salt = crypto.randomBytes(16).toString('hex')) => ({
  salt,
  hash: crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha512').toString('hex'),
});

const verifyPassword = (password, salt, passwordHash) => {
  if (!password || !salt || !passwordHash) return false;
  return crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha512').toString('hex') === passwordHash;
};

const setSessionCookie = async (res, userId) => {
  const sessionToken = crypto.randomBytes(32).toString('hex');
  await pool.query('UPDATE users SET session_token = $1, updated_at = NOW() WHERE id = $2', [sessionToken, userId]);
  res.cookie('session_token', sessionToken, {
    httpOnly: true,
    secure: false,
    sameSite: 'lax',
    maxAge: 1000 * 60 * 60 * 24 * 7,
  });
  return sessionToken;
};

const upsertUser = async ({ id, email, name, picture, provider = 'google' }) => {
  const result = await pool.query(
    `INSERT INTO users (id, email, name, picture, provider, role)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (email) DO UPDATE SET
       id = EXCLUDED.id,
       name = EXCLUDED.name,
       picture = EXCLUDED.picture,
       provider = EXCLUDED.provider,
       updated_at = NOW()
     RETURNING id, email, name, picture, provider, user_type, role`,
    [id, email, name, picture || '', provider, adminEmails.has(email.toLowerCase()) ? 'admin' : 'user'],
  );
  return sanitizeUser(result.rows[0]);
};

const getSessionUser = async (req) => {
  const token = req.cookies?.session_token;

  if (!token) return null;

  const localSession = await pool.query(
    `SELECT id, email, name, picture, provider, user_type, role, phone, city, zip_code, bio, photo_url, dupr_score, home_club, timezone, blocked_users,
            stripe_account_id, stripe_charges_enabled, stripe_details_submitted
     FROM users WHERE session_token = $1 LIMIT 1`,
    [token],
  );

  if (localSession.rows[0]) return sanitizeUser(localSession.rows[0]);

  try {
    const tokenInfo = await googleClient.getTokenInfo(token);
    const result = await pool.query(
      `SELECT id, email, name, picture, provider, user_type, role, phone, city, zip_code, bio, photo_url, dupr_score, home_club, timezone, blocked_users,
              stripe_account_id, stripe_charges_enabled, stripe_details_submitted
       FROM users WHERE id = $1 OR email = $2 LIMIT 1`,
      [tokenInfo.sub, tokenInfo.email],
    );
    return sanitizeUser(result.rows[0] || null);
  } catch (error) {
    return null;
  }
};

const requireAuth = async (req, res, next) => {
  try {
    req.user = await getSessionUser(req);
    if (!req.user) return res.status(401).json({ error: 'Not authenticated' });
    return next();
  } catch (error) {
    return res.status(401).json({ error: 'Invalid session' });
  }
};

const requireAdmin = (req, res, next) => {
  if (req.user?.role !== 'admin') return res.status(403).json({ error: 'Admin access required' });
  return next();
};

app.get('/api/auth/session', requireAuth, async (req, res) => {
  return res.json({ user: req.user });
});

app.get('/api/players', requireAuth, async (req, res) => {
  const query = String(req.query.search || '').trim().toLowerCase();
  const result = await pool.query(
    `SELECT id AS user_id, name, email, photo_url, home_club, city, dupr_score
     FROM users
     WHERE user_type = 'player'
       AND ($1 = '' OR LOWER(name) LIKE '%' || $1 || '%' OR LOWER(email) LIKE '%' || $1 || '%')
     ORDER BY LOWER(name), LOWER(email)
     LIMIT 500`,
    [query],
  );
  return res.json({ players: result.rows });
});

app.get('/api/favorite-players', requireAuth, async (req, res) => {
  const result = await pool.query(
    `SELECT id, user_id AS created_by_id, player_user_id, player_name, player_photo,
            created_at AS created_date
     FROM favorite_players WHERE user_id = $1 ORDER BY created_at DESC`,
    [req.user.id],
  );
  return res.json({ favorites: result.rows });
});

app.post('/api/favorite-players', requireAuth, async (req, res) => {
  const playerUserId = String(req.body?.player_user_id || '');
  if (!playerUserId || playerUserId === req.user.id) {
    return res.status(400).json({ error: 'Choose another valid player to save.' });
  }
  const player = await pool.query(
    `SELECT id, COALESCE(name, email) AS name, photo_url FROM users WHERE id = $1`,
    [playerUserId],
  );
  if (!player.rows[0]) return res.status(404).json({ error: 'Player not found.' });

  const result = await pool.query(
    `INSERT INTO favorite_players (id, user_id, player_user_id, player_name, player_photo)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (user_id, player_user_id) DO UPDATE
       SET player_name = EXCLUDED.player_name, player_photo = EXCLUDED.player_photo
     RETURNING id, user_id AS created_by_id, player_user_id, player_name, player_photo, created_at AS created_date`,
    [crypto.randomUUID(), req.user.id, playerUserId, player.rows[0].name, player.rows[0].photo_url || ''],
  );
  return res.status(201).json({ favorite: result.rows[0] });
});

app.delete('/api/favorite-players/:id', requireAuth, async (req, res) => {
  await pool.query('DELETE FROM favorite_players WHERE id = $1 AND user_id = $2', [req.params.id, req.user.id]);
  return res.json({ success: true });
});

app.get('/api/players/:id/availability', requireAuth, async (req, res) => {
  const favorite = await pool.query(
    'SELECT 1 FROM favorite_players WHERE user_id = $1 AND player_user_id = $2 LIMIT 1',
    [req.user.id, req.params.id],
  );
  if (!favorite.rows[0]) return res.status(403).json({ error: 'Save this player as a favorite to view their availability.' });

  const result = await pool.query(
    `SELECT id, user_id AS created_by_id, date::text AS date, hours,
            created_at AS created_date, updated_at AS updated_date
     FROM availabilities WHERE user_id = $1 ORDER BY date ASC LIMIT 500`,
    [req.params.id],
  );
  return res.json({ availability: result.rows });
});

const clubRecord = (row) => ({
  ...row,
  created_date: row.created_at,
  updated_date: row.updated_at,
});

app.get('/api/clubs', requireAuth, async (req, res) => {
  const result = await pool.query('SELECT * FROM clubs ORDER BY created_at DESC LIMIT 200');
  return res.json({ clubs: result.rows.map(clubRecord) });
});

app.get('/api/clubs/:id', requireAuth, async (req, res) => {
  const result = await pool.query('SELECT * FROM clubs WHERE id = $1', [req.params.id]);
  if (!result.rows[0]) return res.status(404).json({ error: 'Club not found' });
  return res.json({ club: clubRecord(result.rows[0]) });
});

app.post('/api/clubs', requireAuth, async (req, res) => {
  const name = String(req.body?.name || '').trim();
  if (!name) return res.status(400).json({ error: 'Club name is required.' });
  const duplicate = await pool.query('SELECT id FROM clubs WHERE LOWER(name) = LOWER($1)', [name]);
  if (duplicate.rows[0]) return res.status(409).json({ error: `A club named "${name}" already exists.`, club_id: duplicate.rows[0].id });
  const result = await pool.query(
    `INSERT INTO clubs (id, created_by_id, name, location, description, logo_url, courts)
     VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb) RETURNING *`,
    [crypto.randomUUID(), req.user.id, name, String(req.body?.location || ''), String(req.body?.description || ''), req.body?.logo_url || null, JSON.stringify(req.body?.courts || [])],
  );
  return res.status(201).json({ club: clubRecord(result.rows[0]) });
});

app.patch('/api/clubs/:id', requireAuth, async (req, res) => {
  const existing = await pool.query('SELECT * FROM clubs WHERE id = $1 AND created_by_id = $2', [req.params.id, req.user.id]);
  if (!existing.rows[0]) return res.status(404).json({ error: 'Club not found' });
  const current = existing.rows[0];
  const name = req.body?.name != null ? String(req.body.name).trim() || current.name : current.name;
  if (name.toLowerCase() !== current.name.toLowerCase()) {
    const duplicate = await pool.query('SELECT id FROM clubs WHERE LOWER(name) = LOWER($1) AND id != $2', [name, req.params.id]);
    if (duplicate.rows[0]) return res.status(409).json({ error: `A club named "${name}" already exists.`, club_id: duplicate.rows[0].id });
  }
  const result = await pool.query(
    `UPDATE clubs SET name = $1, location = $2, description = $3, logo_url = $4, courts = $5::jsonb, updated_at = NOW()
     WHERE id = $6 RETURNING *`,
    [name, req.body?.location ?? current.location, req.body?.description ?? current.description, req.body?.logo_url ?? current.logo_url, JSON.stringify(req.body?.courts ?? current.courts), req.params.id],
  );
  return res.json({ club: clubRecord(result.rows[0]) });
});

app.delete('/api/clubs/:id', requireAuth, async (req, res) => {
  await pool.query('DELETE FROM clubs WHERE id = $1 AND created_by_id = $2', [req.params.id, req.user.id]);
  return res.json({ success: true });
});

const ownsClub = async (clubId, ownerId) => {
  const result = await pool.query('SELECT id, name FROM clubs WHERE id = $1 AND created_by_id = $2', [clubId, ownerId]);
  return result.rows[0] || null;
};

const validBookingDate = (value) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
};

const bookingMinutes = (value) => {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match || Number(match[1]) > 23 || Number(match[2]) > 59) return null;
  return Number(match[1]) * 60 + Number(match[2]);
};

const findBookingConflict = async (db, { clubId, date, startTime, endTime, courtNumbers, excludeId = null }) => {
  const result = await db.query(
    `SELECT id, title FROM club_booking_requests r
     WHERE club_id = $1 AND date = $2::date AND status = 'approved'
       AND start_time < $4::time AND end_time > $3::time
       AND ($5::text IS NULL OR id <> $5)
       AND EXISTS (
         SELECT 1 FROM jsonb_array_elements_text(r.court_numbers) AS court(number)
         WHERE court.number = ANY($6::text[])
       )
     LIMIT 1`,
    [clubId, date, startTime, endTime, excludeId, courtNumbers],
  );
  return result.rows[0] || null;
};

app.get('/api/club-booking-requests', requireAuth, async (req, res) => {
  const values = [req.user.id];
  let clubFilter = '';
  if (req.query.club_id) {
    values.push(String(req.query.club_id));
    clubFilter = ' AND r.club_id = $2';
  }
  const result = await pool.query(
    `SELECT r.id, r.club_id, c.name AS club_name, r.requester_id, r.requester_name,
            r.title, r.date::text AS date, r.start_time::text AS start_time, r.end_time::text AS end_time,
            r.court_numbers, r.notes, r.status, r.reviewed_by_id, r.reviewed_at, r.play_id,
            r.created_at AS created_date, r.updated_at AS updated_date
     FROM club_booking_requests r JOIN clubs c ON c.id = r.club_id
     WHERE (c.created_by_id = $1 OR r.requester_id = $1)${clubFilter}
     ORDER BY CASE WHEN r.status = 'pending' THEN 0 ELSE 1 END, r.date DESC, r.start_time DESC
     LIMIT 500`,
    values,
  );
  return res.json({ requests: result.rows });
});

app.post('/api/club-booking-requests', requireAuth, async (req, res) => {
  const clubId = String(req.body?.club_id || '');
  const title = String(req.body?.title || '').trim();
  const date = String(req.body?.date || '');
  const startTime = String(req.body?.start_time || '');
  const endTime = String(req.body?.end_time || '');
  const courtNumbers = Array.isArray(req.body?.court_numbers)
    ? [...new Set(req.body.court_numbers.map((number) => String(number).trim()).filter(Boolean))]
    : [];
  if (!clubId || !title || !validBookingDate(date) || bookingMinutes(startTime) == null || bookingMinutes(endTime) == null) {
    return res.status(400).json({ error: 'A club, title, valid date, start time and end time are required.' });
  }
  if (bookingMinutes(endTime) <= bookingMinutes(startTime)) {
    return res.status(400).json({ error: 'End time must be after start time.' });
  }
  if (!courtNumbers.length) return res.status(400).json({ error: 'Choose at least one court.' });

  const clubResult = await pool.query('SELECT id, name, courts, created_by_id FROM clubs WHERE id = $1', [clubId]);
  const club = clubResult.rows[0];
  if (!club) return res.status(404).json({ error: 'Club not found.' });
  const courts = Array.isArray(club.courts) ? club.courts : [];
  const unavailable = courtNumbers.filter((number) => !courts.some((court) => String(court.number) === number && !court.blocked && !court.disabled));
  if (unavailable.length) return res.status(409).json({ error: `Unavailable courts: ${unavailable.join(', ')}.` });

  const conflict = await findBookingConflict(pool, { clubId, date, startTime, endTime, courtNumbers });
  if (conflict) return res.status(409).json({ error: `Court request overlaps the approved booking "${conflict.title}".` });

  const result = await pool.query(
    `INSERT INTO club_booking_requests
       (id, club_id, requester_id, requester_name, title, date, start_time, end_time, court_numbers, notes)
     VALUES ($1, $2, $3, $4, $5, $6::date, $7::time, $8::time, $9::jsonb, $10)
     RETURNING id, club_id, requester_id, requester_name, title, date::text AS date,
               start_time::text AS start_time, end_time::text AS end_time, court_numbers, notes,
               status, created_at AS created_date`,
    [crypto.randomUUID(), clubId, req.user.id, req.user.full_name || req.user.name || req.user.email,
      title, date, startTime, endTime, JSON.stringify(courtNumbers), String(req.body?.notes || '').trim()],
  );
  const request = result.rows[0];
  await pool.query(
    `INSERT INTO club_alerts (id, club_id, club_name, created_by_id, recipient_user_id, title, message, type, active)
     VALUES ($1, $2, $3, $4, $5, $6, $7, 'booking', TRUE)`,
    [crypto.randomUUID(), club.id, club.name, req.user.id, club.created_by_id,
      'Court reservation request', `${request.requester_name} requested Courts ${courtNumbers.join(', ')} on ${date} from ${startTime} to ${endTime}.`],
  );
  return res.status(201).json({ request: { ...request, club_name: club.name } });
});

app.patch('/api/club-booking-requests/:id', requireAuth, async (req, res) => {
  const status = req.body?.status;
  if (!['approved', 'rejected'].includes(status)) {
    return res.status(400).json({ error: 'Request status must be approved or rejected.' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const requestResult = await client.query(
      `SELECT r.id, r.club_id, r.requester_id, r.requester_name, r.title,
              r.date::text AS date, r.start_time::text AS start_time, r.end_time::text AS end_time,
              r.court_numbers, r.notes, r.status, r.reviewed_by_id, r.reviewed_at,
              c.created_by_id AS club_owner_id, c.name AS club_name
       FROM club_booking_requests r JOIN clubs c ON c.id = r.club_id
       WHERE r.id = $1 FOR UPDATE OF r`,
      [req.params.id],
    );
    const booking = requestResult.rows[0];
    if (!booking || booking.club_owner_id !== req.user.id) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Booking request not found.' });
    }
    if (booking.status !== 'pending') {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'This request has already been reviewed.' });
    }

    if (status === 'approved') {
      await client.query('SELECT id FROM clubs WHERE id = $1 FOR UPDATE', [booking.club_id]);
      const conflict = await findBookingConflict(client, {
        clubId: booking.club_id,
        date: booking.date,
        startTime: booking.start_time,
        endTime: booking.end_time,
        courtNumbers: booking.court_numbers,
        excludeId: booking.id,
      });
      if (conflict) {
        await client.query('ROLLBACK');
        return res.status(409).json({ error: `Court request overlaps the approved booking "${conflict.title}".` });
      }
    }

    // Approval creates the actual Play so the requester and other members see
    // the reserved courts on the player home screen, not just the request status.
    let playId = null;
    if (status === 'approved') {
      const requester = await client.query('SELECT photo_url FROM users WHERE id = $1', [booking.requester_id]);
      const playData = {
        title: booking.title,
        date: booking.date,
        time: booking.start_time,
        start_time: booking.start_time,
        end_time: booking.end_time,
        location: booking.club_name,
        club_id: booking.club_id,
        court_numbers: booking.court_numbers,
        members_only: true,
        skill_level: 'Open',
        max_players: Math.max(4, (booking.court_numbers || []).length * 4),
        notes: booking.notes || '',
        status: 'open',
        players: [{ user_id: booking.requester_id, name: booking.requester_name, photo_url: requester.rows[0]?.photo_url || '' }],
      };
      const playResult = await client.query(
        'INSERT INTO plays (id, created_by_id, data) VALUES ($1, $2, $3::jsonb) RETURNING id',
        [crypto.randomUUID(), booking.requester_id, JSON.stringify(playData)],
      );
      playId = playResult.rows[0].id;
    }

    const updatedResult = await client.query(
      `UPDATE club_booking_requests SET status = $1, reviewed_by_id = $2, reviewed_at = NOW(), updated_at = NOW(), play_id = $3
       WHERE id = $4
       RETURNING id, club_id, requester_id, requester_name, title, date::text AS date,
                 start_time::text AS start_time, end_time::text AS end_time, court_numbers,
                 notes, status, reviewed_by_id, reviewed_at, play_id, created_at AS created_date`,
      [status, req.user.id, playId, booking.id],
    );
    await client.query(
      `INSERT INTO club_alerts (id, club_id, club_name, created_by_id, recipient_user_id, title, message, type, active)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'general', TRUE)`,
      [crypto.randomUUID(), booking.club_id, booking.club_name, req.user.id, booking.requester_id,
        `Court request ${status}`, `Your request "${booking.title}" was ${status}.`],
    );
    await client.query('COMMIT');
    return res.json({ request: { ...updatedResult.rows[0], club_name: booking.club_name } });
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
});

app.get('/api/availability', requireAuth, async (req, res) => {
  const date = req.query.date;
  const result = await pool.query(
    `SELECT id, user_id AS created_by_id, date::text AS date, hours, created_at AS created_date, updated_at AS updated_date
     FROM availabilities WHERE user_id = $1 AND ($2::date IS NULL OR date = $2::date)
     ORDER BY date DESC LIMIT 500`,
    [req.user.id, date || null],
  );
  return res.json({ availability: result.rows });
});

app.post('/api/availability', requireAuth, async (req, res) => {
  const date = String(req.body?.date || '');
  const hours = Array.isArray(req.body?.hours) ? [...new Set(req.body.hours.map(Number).filter((hour) => Number.isInteger(hour) && hour >= 0 && hour <= 23))].sort((a, b) => a - b) : [];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return res.status(400).json({ error: 'A valid date is required.' });
  const result = await pool.query(
    `INSERT INTO availabilities (id, user_id, date, hours)
     VALUES ($1, $2, $3, $4::jsonb)
     ON CONFLICT (user_id, date) DO UPDATE SET hours = EXCLUDED.hours, updated_at = NOW()
    RETURNING id, user_id AS created_by_id, date::text AS date, hours, created_at AS created_date, updated_at AS updated_date`,
    [crypto.randomUUID(), req.user.id, date, JSON.stringify(hours)],
  );
  return res.status(201).json({ availability: result.rows[0] });
});

app.patch('/api/availability/:id', requireAuth, async (req, res) => {
  const hours = Array.isArray(req.body?.hours) ? [...new Set(req.body.hours.map(Number).filter((hour) => Number.isInteger(hour) && hour >= 0 && hour <= 23))].sort((a, b) => a - b) : [];
  const result = await pool.query(
    `UPDATE availabilities SET hours = $1::jsonb, updated_at = NOW()
     WHERE id = $2 AND user_id = $3
    RETURNING id, user_id AS created_by_id, date::text AS date, hours, created_at AS created_date, updated_at AS updated_date`,
    [JSON.stringify(hours), req.params.id, req.user.id],
  );
  if (!result.rows[0]) return res.status(404).json({ error: 'Availability record not found' });
  return res.json({ availability: result.rows[0] });
});

app.get('/api/clubs/:id/availability', requireAuth, async (req, res) => {
  res.set('Cache-Control', 'no-store');
  const clubResult = await pool.query('SELECT id, name, created_by_id FROM clubs WHERE id = $1', [req.params.id]);
  const club = clubResult.rows[0];
  if (!club) return res.status(404).json({ error: 'Club not found' });
  if (club.created_by_id !== req.user.id) {
    const membership = await pool.query(
      `SELECT 1 FROM club_memberships
       WHERE club_id = $1 AND created_by_id = $2 AND status = 'approved' AND member_type = 'member' LIMIT 1`,
      [club.id, req.user.id],
    );
    if (!membership.rows[0]) return res.status(403).json({ error: 'Approved club membership is required.' });
  }

  const result = await pool.query(
    `SELECT u.id AS user_id, COALESCE(u.name, u.email) AS name, u.email, u.photo_url,
            a.id AS availability_id, a.date::text AS date, COALESCE(a.hours, '[]'::jsonb) AS hours
     FROM club_memberships m
     JOIN users u ON u.id = m.created_by_id
     LEFT JOIN availabilities a ON a.user_id = u.id AND ($2::date IS NULL OR a.date = $2::date)
     WHERE m.club_id = $1 AND m.status = 'approved' AND m.member_type = 'member'
     ORDER BY LOWER(COALESCE(u.name, u.email))`,
    [club.id, req.query.date || null],
  );

  const members = result.rows.map((member) => ({ ...member, busy_hours: [] }));
  if (req.query.date && members.length) {
    const scheduledPlays = await pool.query(
      `SELECT created_by_id, data FROM plays
       WHERE data->>'date' = $1 AND COALESCE(data->>'status', 'open') NOT IN ('cancelled', 'completed')`,
      [req.query.date],
    );
    const membersById = new Map(members.map((member) => [member.user_id, member]));
    for (const row of scheduledPlays.rows) {
      const play = row.data || {};
      const start = String(play.start_time || play.time || '');
      const end = String(play.end_time || '');
      const parseMinutes = (value) => {
        const match = value.match(/^(\d{1,2}):(\d{2})$/);
        return match ? Number(match[1]) * 60 + Number(match[2]) : null;
      };
      const startMinutes = parseMinutes(start);
      const endMinutes = parseMinutes(end) ?? (startMinutes == null ? null : startMinutes + 60);
      if (startMinutes == null || endMinutes == null || endMinutes <= startMinutes) continue;
      const participants = new Set([
        row.created_by_id,
        ...(Array.isArray(play.players) ? play.players.map((player) => player?.user_id) : []),
      ].filter(Boolean));
      const busyHours = Array.from({ length: 24 }, (_, hour) => hour)
        .filter((hour) => hour * 60 < endMinutes && (hour + 1) * 60 > startMinutes);
      for (const userId of participants) {
        const member = membersById.get(userId);
        if (member) member.busy_hours = [...new Set([...member.busy_hours, ...busyHours])].sort((a, b) => a - b);
      }
    }
  }
  return res.json({ club: { id: club.id, name: club.name }, members });
});

app.get('/api/check-ins', requireAuth, async (req, res) => {
  const clubId = req.query.club_id;
  if (!clubId) return res.status(400).json({ error: 'club_id is required.' });
  const club = await ownsClub(clubId, req.user.id);
  if (!club) return res.status(404).json({ error: 'Club not found' });

  const conditions = ['club_id = $1'];
  const values = [clubId];

  if (req.query.date) {
    values.push(req.query.date);
    conditions.push(`date = $${values.length}`);
  } else {
    if (req.query.from) {
      values.push(req.query.from);
      conditions.push(`date >= $${values.length}`);
    }
    if (req.query.to) {
      values.push(req.query.to);
      conditions.push(`date <= $${values.length}`);
    }
  }
  if (req.query.from_time) {
    values.push(req.query.from_time);
    conditions.push(`checked_in_at::time >= $${values.length}`);
  }
  if (req.query.to_time) {
    values.push(req.query.to_time);
    conditions.push(`checked_in_at::time <= $${values.length}`);
  }
  if (req.query.search) {
    values.push(`%${String(req.query.search).toLowerCase()}%`);
    conditions.push(`LOWER(player_name) LIKE $${values.length}`);
  }

  const rows = await pool.query(
    `SELECT id, club_id, club_name, player_user_id, player_name, checked_in_by_id, checked_in_by_name, date,
            checked_in_at, created_at AS created_date
     FROM check_ins WHERE ${conditions.join(' AND ')} ORDER BY checked_in_at DESC LIMIT 500`,
    values,
  );

  // Total prior visits per player at this club, used to show usage on each scan.
  const totals = await pool.query(
    'SELECT player_user_id, COUNT(*) AS visits FROM check_ins WHERE club_id = $1 GROUP BY player_user_id',
    [clubId],
  );
  const visitCounts = Object.fromEntries(totals.rows.map((row) => [row.player_user_id, Number(row.visits)]));

  return res.json({ checkins: rows.rows.map((row) => ({ ...row, visit_count: visitCounts[row.player_user_id] || 0 })) });
});

app.post('/api/check-ins', requireAuth, async (req, res) => {
  const clubId = req.body?.club_id;
  const playerUserId = req.body?.player_user_id;
  if (!clubId || !playerUserId) return res.status(400).json({ error: 'club_id and player_user_id are required.' });
  const club = await ownsClub(clubId, req.user.id);
  if (!club) return res.status(404).json({ error: 'Club not found' });

  const player = await pool.query('SELECT name FROM users WHERE id = $1', [playerUserId]);
  const date = req.body?.date || new Date().toISOString().slice(0, 10);
  const result = await pool.query(
    `INSERT INTO check_ins (id, club_id, club_name, player_user_id, player_name, checked_in_by_id, checked_in_by_name, date, checked_in_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
    [
      crypto.randomUUID(),
      club.id,
      club.name,
      playerUserId,
      req.body?.player_name || player.rows[0]?.name || 'Player',
      req.user.id,
      req.user.name || req.user.email,
      date,
      req.body?.checked_in_at || new Date().toISOString(),
    ],
  );

  const priorVisits = await pool.query('SELECT COUNT(*) AS visits FROM check_ins WHERE club_id = $1 AND player_user_id = $2', [clubId, playerUserId]);
  return res.status(201).json({
    checkin: { ...result.rows[0], created_date: result.rows[0].created_at, visit_count: Number(priorVisits.rows[0].visits) },
  });
});

app.get('/api/club-memberships', requireAuth, async (req, res) => {
  const result = await pool.query('SELECT * FROM club_memberships ORDER BY created_at DESC LIMIT 500');
  return res.json({ memberships: result.rows.map((row) => ({ ...row, created_date: row.created_at, updated_date: row.updated_at })) });
});

app.post('/api/club-memberships', requireAuth, async (req, res) => {
  const club = await pool.query('SELECT id, name FROM clubs WHERE id = $1', [req.body?.club_id]);
  if (!club.rows[0]) return res.status(404).json({ error: 'Club not found' });
  const result = await pool.query(
    `INSERT INTO club_memberships (id, club_id, club_name, created_by_id, user_name, status, member_type)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (club_id, created_by_id) DO UPDATE SET status = EXCLUDED.status, updated_at = NOW()
     RETURNING *`,
    [crypto.randomUUID(), club.rows[0].id, club.rows[0].name, req.user.id, req.user.name || req.user.email, req.body?.status || 'pending', req.body?.member_type || 'member'],
  );
  return res.status(201).json({ membership: { ...result.rows[0], created_date: result.rows[0].created_at } });
});

app.patch('/api/club-memberships/:id', requireAuth, async (req, res) => {
  const status = req.body?.status;
  if (!['approved', 'rejected'].includes(status)) {
    return res.status(400).json({ error: 'Membership status must be approved or rejected.' });
  }

  const membershipResult = await pool.query(
    `SELECT m.*, c.created_by_id AS club_owner_id
     FROM club_memberships m JOIN clubs c ON c.id = m.club_id
     WHERE m.id = $1`,
    [req.params.id],
  );
  const membership = membershipResult.rows[0];
  if (!membership || membership.club_owner_id !== req.user.id) {
    return res.status(404).json({ error: 'Membership request not found' });
  }

  const memberType = req.body?.member_type === 'non_member' ? 'non_member' : 'member';
  const updatedResult = await pool.query(
    `UPDATE club_memberships SET status = $1, member_type = $2, updated_at = NOW()
     WHERE id = $3 RETURNING *`,
    [status, memberType, req.params.id],
  );
  const updated = updatedResult.rows[0];

  if (status === 'approved') {
    await pool.query(
      `INSERT INTO club_alerts (id, club_id, club_name, created_by_id, recipient_user_id, title, message, type, active)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'general', TRUE)`,
      [
        crypto.randomUUID(),
        membership.club_id,
        membership.club_name,
        req.user.id,
        membership.created_by_id,
        'Club membership approved',
        `Your request to join ${membership.club_name} was approved.`,
      ],
    );
  }

  return res.json({ membership: { ...updated, created_date: updated.created_at, updated_date: updated.updated_at } });
});

app.delete('/api/club-memberships/:id', requireAuth, async (req, res) => {
  await pool.query('DELETE FROM club_memberships WHERE id = $1 AND created_by_id = $2', [req.params.id, req.user.id]);
  return res.json({ success: true });
});

const playRecord = (row) => ({ ...row.data, id: row.id, created_by_id: row.created_by_id, created_date: row.created_at, updated_date: row.updated_at });

app.get('/api/plays', requireAuth, async (req, res) => {
  const memberships = await pool.query('SELECT club_id FROM club_memberships WHERE created_by_id = $1 AND status = $2', [req.user.id, 'approved']);
  const memberClubs = new Set(memberships.rows.map((row) => row.club_id));
  const result = await pool.query(`SELECT * FROM plays ORDER BY data->>'date' DESC, data->>'time' DESC LIMIT 100`);
  const visible = result.rows.filter((row) => {
    const play = row.data || {};
    return !play.members_only || !play.club_id || row.created_by_id === req.user.id || memberClubs.has(play.club_id);
  });
  return res.json({ plays: visible.map(playRecord) });
});

app.get('/api/plays/:id', requireAuth, async (req, res) => {
  const result = await pool.query('SELECT * FROM plays WHERE id = $1', [req.params.id]);
  if (!result.rows[0]) return res.status(404).json({ error: 'Play not found' });
  return res.json({ play: playRecord(result.rows[0]) });
});

const changePlayAttendance = async (req, res, action) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query('SELECT * FROM plays WHERE id = $1 FOR UPDATE', [req.params.id]);
    const row = result.rows[0];
    if (!row) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Play not found' });
    }

    const data = row.data || {};
    const players = Array.isArray(data.players) ? data.players : [];
    const alreadyJoined = players.some((player) => player.user_id === req.user.id);

    if (action === 'join' && data.members_only && data.club_id && row.created_by_id !== req.user.id) {
      const membership = await client.query(
        `SELECT 1 FROM club_memberships WHERE club_id = $1 AND created_by_id = $2 AND status = 'approved' LIMIT 1`,
        [data.club_id, req.user.id],
      );
      if (!membership.rows[0]) {
        await client.query('ROLLBACK');
        return res.status(403).json({ error: 'An approved club membership is required to join this play.' });
      }
    }

    if (action === 'join' && !alreadyJoined) {
      const capacity = Number(data.max_players) || 4;
      if (players.length >= capacity) {
        await client.query('ROLLBACK');
        return res.status(409).json({ error: 'This play is full.' });
      }
      players.push({
        user_id: req.user.id,
        name: req.user.full_name || req.user.name || req.user.email,
        photo_url: req.user.photo_url || '',
      });
      await client.query(
        `UPDATE play_invites SET status = 'accepted', updated_at = NOW()
         WHERE play_id = $1 AND invitee_id = $2 AND status = 'invited'`,
        [req.params.id, req.user.id],
      );
    } else if (action === 'leave' && alreadyJoined) {
      const index = players.findIndex((player) => player.user_id === req.user.id);
      players.splice(index, 1);
    }

    data.players = players;
    data.status = players.length >= (Number(data.max_players) || 4) ? 'full' : 'open';
    const updated = await client.query(
      'UPDATE plays SET data = $1::jsonb, updated_at = NOW() WHERE id = $2 RETURNING *',
      [JSON.stringify(data), req.params.id],
    );
    await client.query('COMMIT');
    return res.json({ play: playRecord(updated.rows[0]) });
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

app.post('/api/plays/:id/join', requireAuth, async (req, res) => changePlayAttendance(req, res, 'join'));
app.post('/api/plays/:id/leave', requireAuth, async (req, res) => changePlayAttendance(req, res, 'leave'));

const inviteRecord = (row) => ({ ...row, created_date: row.created_at, updated_date: row.updated_at });

app.get('/api/plays/:id/invites', requireAuth, async (req, res) => {
  const result = await pool.query(
    `SELECT id, play_id, inviter_id, invitee_id, invitee_name, invitee_photo, status,
            created_at, updated_at
     FROM play_invites WHERE play_id = $1 ORDER BY created_at DESC`,
    [req.params.id],
  );
  return res.json({ invites: result.rows.map(inviteRecord) });
});

app.post('/api/plays/:id/invites', requireAuth, async (req, res) => {
  const inviteeId = String(req.body?.invitee_id || '');
  if (!inviteeId) return res.status(400).json({ error: 'invitee_id is required.' });

  const playResult = await pool.query('SELECT id, created_by_id, data FROM plays WHERE id = $1', [req.params.id]);
  const play = playResult.rows[0];
  if (!play) return res.status(404).json({ error: 'Play not found' });

  const players = Array.isArray(play.data?.players) ? play.data.players : [];
  const canInvite = play.created_by_id === req.user.id || players.some((player) => player.user_id === req.user.id);
  if (!canInvite) return res.status(403).json({ error: 'Only players already in this play can invite others.' });
  if (players.some((player) => player.user_id === inviteeId)) {
    return res.status(409).json({ error: 'That player has already joined.' });
  }

  const result = await pool.query(
    `INSERT INTO play_invites (id, play_id, inviter_id, invitee_id, invitee_name, invitee_photo)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (play_id, invitee_id) DO UPDATE SET
       status = 'invited', inviter_id = EXCLUDED.inviter_id,
       invitee_name = EXCLUDED.invitee_name, invitee_photo = EXCLUDED.invitee_photo, updated_at = NOW()
     RETURNING id, play_id, inviter_id, invitee_id, invitee_name, invitee_photo, status, created_at, updated_at`,
    [crypto.randomUUID(), req.params.id, req.user.id, inviteeId, String(req.body?.invitee_name || ''), String(req.body?.invitee_photo || '')],
  );
  return res.status(201).json({ invite: inviteRecord(result.rows[0]) });
});

app.patch('/api/play-invites/:id', requireAuth, async (req, res) => {
  if (req.body?.status !== 'declined') {
    return res.status(400).json({ error: 'Invite status can only be set to declined.' });
  }
  const result = await pool.query(
    `UPDATE play_invites SET status = 'declined', updated_at = NOW()
     WHERE id = $1 AND invitee_id = $2
     RETURNING id, play_id, inviter_id, invitee_id, invitee_name, invitee_photo, status, created_at, updated_at`,
    [req.params.id, req.user.id],
  );
  if (!result.rows[0]) return res.status(404).json({ error: 'Invite not found.' });
  return res.json({ invite: inviteRecord(result.rows[0]) });
});

app.post('/api/plays', requireAuth, async (req, res) => {
  const data = { ...(req.body || {}) };
  delete data.id;
  const result = await pool.query(
    'INSERT INTO plays (id, created_by_id, data) VALUES ($1, $2, $3::jsonb) RETURNING *',
    [crypto.randomUUID(), req.user.id, JSON.stringify(data)],
  );
  const play = playRecord(result.rows[0]);

  if (data.club_id) {
    const club = await pool.query('SELECT id, name FROM clubs WHERE id = $1', [data.club_id]);
    if (club.rows[0]) {
      const when = data.date ? new Date(`${data.date}T00:00:00`).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' }) : '';
      const time = data.start_time && data.end_time ? `${data.start_time} - ${data.end_time}` : data.time || '';
      await pool.query(
        `INSERT INTO club_alerts (id, club_id, club_name, created_by_id, title, message, type, expires, active)
         VALUES ($1, $2, $3, $4, $5, $6, 'booking', $7, TRUE)`,
        [
          crypto.randomUUID(),
          club.rows[0].id,
          club.rows[0].name,
          req.user.id,
          `New play: ${data.title || 'Scheduled play'}`,
          [when, time, data.location].filter(Boolean).join(' · '),
          data.date || null,
        ],
      );
    }
  }

  return res.status(201).json({ play });
});

app.patch('/api/plays/:id', requireAuth, async (req, res) => {
  const existing = await pool.query('SELECT * FROM plays WHERE id = $1 AND created_by_id = $2', [req.params.id, req.user.id]);
  if (!existing.rows[0]) return res.status(404).json({ error: 'Play not found' });
  const data = { ...(existing.rows[0].data || {}), ...(req.body || {}) };
  delete data.id;
  const result = await pool.query('UPDATE plays SET data = $1::jsonb, updated_at = NOW() WHERE id = $2 RETURNING *', [JSON.stringify(data), req.params.id]);
  return res.json({ play: playRecord(result.rows[0]) });
});

app.delete('/api/plays/:id', requireAuth, async (req, res) => {
  await pool.query('DELETE FROM plays WHERE id = $1 AND created_by_id = $2', [req.params.id, req.user.id]);
  return res.json({ success: true });
});

const tournamentRecord = (row) => ({ ...row.data, id: row.id, created_by_id: row.created_by_id, created_date: row.created_at, updated_date: row.updated_at });

app.get('/api/tournaments', requireAuth, async (req, res) => {
  const result = await pool.query(`SELECT * FROM tournaments ORDER BY data->>'date' DESC LIMIT 200`);
  return res.json({ tournaments: result.rows.map(tournamentRecord) });
});

app.get('/api/tournaments/:id', requireAuth, async (req, res) => {
  const result = await pool.query('SELECT * FROM tournaments WHERE id = $1', [req.params.id]);
  if (!result.rows[0]) return res.status(404).json({ error: 'Tournament not found' });
  return res.json({ tournament: tournamentRecord(result.rows[0]) });
});

app.post('/api/tournaments', requireAuth, async (req, res) => {
  const name = String(req.body?.name || '').trim();
  if (!name) return res.status(400).json({ error: 'Tournament name is required.' });
  const data = { ...(req.body || {}), name };
  delete data.id;
  const result = await pool.query(
    'INSERT INTO tournaments (id, created_by_id, data) VALUES ($1, $2, $3::jsonb) RETURNING *',
    [crypto.randomUUID(), req.user.id, JSON.stringify(data)],
  );
  return res.status(201).json({ tournament: tournamentRecord(result.rows[0]) });
});

// Only the organizer (or an admin) may change tournament details; everyone else may
// only update their own registration via the `entries` field.
app.patch('/api/tournaments/:id', requireAuth, async (req, res) => {
  const existing = await pool.query('SELECT * FROM tournaments WHERE id = $1', [req.params.id]);
  const row = existing.rows[0];
  if (!row) return res.status(404).json({ error: 'Tournament not found' });

  const isOwner = row.created_by_id === req.user.id || req.user.role === 'admin';
  const bodyKeys = Object.keys(req.body || {});
  if (!isOwner && !(bodyKeys.length === 1 && bodyKeys[0] === 'entries')) {
    return res.status(403).json({ error: 'Only the tournament organizer can update this.' });
  }

  const data = { ...(row.data || {}), ...(req.body || {}) };
  delete data.id;
  const result = await pool.query(
    'UPDATE tournaments SET data = $1::jsonb, updated_at = NOW() WHERE id = $2 RETURNING *',
    [JSON.stringify(data), req.params.id],
  );
  return res.json({ tournament: tournamentRecord(result.rows[0]) });
});

app.delete('/api/tournaments/:id', requireAuth, async (req, res) => {
  await pool.query('DELETE FROM tournaments WHERE id = $1 AND created_by_id = $2', [req.params.id, req.user.id]);
  return res.json({ success: true });
});

const divisionKeyFor = (entry) => `${entry.category}|${entry.dupr_min ?? 0}|${entry.dupr_max ?? 8}`;

// Adds the paid entrant to the tournament roster once Stripe confirms the charge.
// Idempotent: webhooks can be redelivered, so a payment already marked 'paid' is a no-op.
const finalizeTournamentPayment = async (session) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const paymentResult = await client.query('SELECT * FROM tournament_payments WHERE stripe_session_id = $1 FOR UPDATE', [session.id]);
    const payment = paymentResult.rows[0];
    if (!payment || payment.status === 'paid') {
      await client.query('ROLLBACK');
      return;
    }

    const paymentIntentId = typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id || null;
    await client.query(
      `UPDATE tournament_payments SET status = 'paid', stripe_payment_intent_id = $1, paid_at = NOW(), updated_at = NOW() WHERE id = $2`,
      [paymentIntentId, payment.id],
    );

    const tournamentResult = await client.query('SELECT * FROM tournaments WHERE id = $1 FOR UPDATE', [payment.tournament_id]);
    const tournament = tournamentResult.rows[0];
    if (tournament) {
      const data = { ...(tournament.data || {}) };
      const entries = Array.isArray(data.entries) ? [...data.entries] : [];
      const alreadyRegistered = entries.some((entry) => divisionKeyFor(entry) === payment.division && entry.user_id === payment.user_id);
      if (!alreadyRegistered) {
        const [category, duprMinStr, duprMaxStr] = payment.division.split('|');
        const isDoubles = category !== 'singles';
        entries.push({
          name: payment.user_name,
          user_id: payment.user_id,
          category,
          dupr_min: Number(duprMinStr),
          dupr_max: Number(duprMaxStr),
          ...(isDoubles ? { partner_name: '', needs_partner: true } : {}),
        });
        data.entries = entries;
        await client.query('UPDATE tournaments SET data = $1::jsonb, updated_at = NOW() WHERE id = $2', [JSON.stringify(data), payment.tournament_id]);
      }
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

// Keeps a connected organizer's payout eligibility in sync with Stripe (via
// webhook and on-demand status checks), so checkout can decide whether to
// route funds straight to them.
const syncStripeAccountStatus = async (account) => {
  await pool.query(
    `UPDATE users SET stripe_charges_enabled = $1, stripe_details_submitted = $2, updated_at = NOW()
     WHERE stripe_account_id = $3`,
    [Boolean(account.charges_enabled), Boolean(account.details_submitted), account.id],
  );
};

app.post('/api/stripe/connect/onboarding-link', requireAuth, async (req, res) => {
  if (!stripe) return res.status(503).json({ error: 'Stripe is not configured on this server.' });
  if (req.user.user_type !== 'tournament_organizer') {
    return res.status(403).json({ error: 'Only tournament organizers can connect a payout account.' });
  }

  try {
    const appOrigin = process.env.APP_ORIGIN || 'http://localhost:5173';
    let accountId = req.user.stripe_account_id;
    if (!accountId) {
      const account = await stripe.accounts.create({
        type: 'express',
        email: req.user.email || undefined,
        business_type: 'individual',
        capabilities: { card_payments: { requested: true }, transfers: { requested: true } },
      });
      accountId = account.id;
      await pool.query('UPDATE users SET stripe_account_id = $1, updated_at = NOW() WHERE id = $2', [accountId, req.user.id]);
    }

    const accountLink = await stripe.accountLinks.create({
      account: accountId,
      refresh_url: `${appOrigin}/tournaments?stripe=refresh`,
      return_url: `${appOrigin}/tournaments?stripe=return`,
      type: 'account_onboarding',
    });
    return res.json({ url: accountLink.url });
  } catch (error) {
    if (error?.type === 'StripeInvalidRequestError' && /only create new accounts if you've signed up for connect/i.test(error.message)) {
      return res.status(503).json({ error: 'Stripe Connect is not enabled for this Stripe account. Enable Connect in the Stripe Dashboard, then try again.' });
    }
    throw error;
  }
});

app.get('/api/stripe/connect/status', requireAuth, async (req, res) => {
  if (!req.user.stripe_account_id) return res.json({ connected: false });
  if (!stripe) {
    return res.json({ connected: true, charges_enabled: req.user.stripe_charges_enabled, details_submitted: req.user.stripe_details_submitted });
  }
  const account = await stripe.accounts.retrieve(req.user.stripe_account_id);
  await syncStripeAccountStatus(account);
  return res.json({
    connected: true,
    charges_enabled: Boolean(account.charges_enabled),
    details_submitted: Boolean(account.details_submitted),
    payouts_enabled: Boolean(account.payouts_enabled),
  });
});

app.post('/api/payments/create-checkout-session', requireAuth, async (req, res) => {
  if (!stripe) return res.status(503).json({ error: 'Stripe is not configured on this server.' });

  const match = /^tournament:(.+)::(.+)$/.exec(String(req.body?.productId || ''));
  if (!match) return res.status(400).json({ error: 'Invalid checkout product.' });
  const [, tournamentId, divisionKey] = match;

  const result = await pool.query('SELECT * FROM tournaments WHERE id = $1', [tournamentId]);
  const tournament = result.rows[0];
  if (!tournament) return res.status(404).json({ error: 'Tournament not found' });
  const data = tournament.data || {};
  if (data.registration_open === false) return res.status(409).json({ error: 'Registration is closed for this tournament.' });

  const division = (Array.isArray(data.divisions) ? data.divisions : []).find((d) => divisionKeyFor(d) === divisionKey);
  if (!division) return res.status(404).json({ error: 'Division not found.' });

  const fee = Number(data.entry_fee ?? 0);
  if (fee < 0.5) return res.status(400).json({ error: 'This division does not require payment.' });

  const entries = Array.isArray(data.entries) ? data.entries : [];
  if (entries.some((entry) => divisionKeyFor(entry) === divisionKey && entry.user_id === req.user.id)) {
    return res.status(409).json({ error: "You're already registered for this division." });
  }
  const capacity = Number(division.teams) || 0;
  const filled = entries.filter((entry) => divisionKeyFor(entry) === divisionKey).length;
  if (capacity > 0 && filled >= capacity) return res.status(409).json({ error: 'This division is full.' });

  const userName = req.user.full_name || req.user.name || req.user.email;
  const currency = String(data.currency || 'USD');
  const appOrigin = process.env.APP_ORIGIN || 'http://localhost:5173';

  // Route funds straight to the organizer once their Stripe payout account is
  // enabled; otherwise the charge stays on the platform account.
  const organizer = (await pool.query(
    'SELECT stripe_account_id, stripe_charges_enabled FROM users WHERE id = $1',
    [tournament.created_by_id],
  )).rows[0];
  const destinationAccountId = organizer?.stripe_charges_enabled ? organizer.stripe_account_id : null;

  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    payment_method_types: ['card'],
    customer_email: req.user.email || undefined,
    line_items: [{
      price_data: {
        currency: currency.toLowerCase(),
        product_data: { name: `${data.name || 'Tournament'} — ${division.category}` },
        unit_amount: Math.round(fee * 100),
      },
      quantity: 1,
    }],
    success_url: `${appOrigin}/events?payment=success&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${appOrigin}/events?payment=cancelled`,
    metadata: { tournament_id: tournamentId, user_id: req.user.id, division: divisionKey },
    ...(destinationAccountId ? { payment_intent_data: { transfer_data: { destination: destinationAccountId } } } : {}),
  });

  await pool.query(
    `INSERT INTO tournament_payments (id, tournament_id, user_id, user_name, division, amount, currency, status, stripe_session_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending', $8)`,
    [crypto.randomUUID(), tournamentId, req.user.id, userName, divisionKey, fee, currency, session.id],
  );

  return res.status(201).json({ redirectUrl: session.url });
});

app.get('/api/payments/tournament-status', requireAuth, async (req, res) => {
  const tournamentId = String(req.query.tournament_id || '');
  const result = await pool.query('SELECT * FROM tournaments WHERE id = $1', [tournamentId]);
  const tournament = result.rows[0];
  if (!tournament) return res.status(404).json({ error: 'Tournament not found' });
  if (tournament.created_by_id !== req.user.id && req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Only the organizer can view payment status.' });
  }

  const data = tournament.data || {};
  const fee = Number(data.entry_fee ?? 0);
  const currency = data.currency || 'USD';
  const entries = Array.isArray(data.entries) ? data.entries : [];
  const payments = (await pool.query('SELECT * FROM tournament_payments WHERE tournament_id = $1', [tournamentId])).rows;
  const isFree = fee < 0.5;

  let paid = 0;
  let pending = 0;
  let unpaid = 0;
  let free = 0;
  let collected = 0;
  const rows = entries.map((entry, index) => {
    const divKey = divisionKeyFor(entry);
    if (isFree) {
      free += 1;
      return { index, name: entry.name, division: divKey, fee: 0, status: 'free' };
    }
    const payment = payments.find((p) => p.division === divKey && p.user_id === entry.user_id);
    const status = payment?.status === 'paid' ? 'paid' : payment?.status === 'pending' ? 'pending' : 'unpaid';
    if (status === 'paid') { paid += 1; collected += fee; } else if (status === 'pending') pending += 1; else unpaid += 1;
    return { index, name: entry.name, division: divKey, fee, status };
  });

  const registeredKeys = new Set(entries.map((entry) => `${entry.user_id}|${divisionKeyFor(entry)}`));
  const orphanPending = payments
    .filter((p) => p.status === 'pending' && !registeredKeys.has(`${p.user_id}|${p.division}`))
    .map((p) => ({ name: p.user_name, amount: Number(p.amount) }));

  return res.json({ fee, currency, total_entries: entries.length, free, collected, outstanding: pending * fee, paid, pending, unpaid, rows, orphanPending });
});

const alertRecord = (row) => ({ ...row, created_date: row.created_at, updated_date: row.updated_at });

app.get('/api/club-alerts', requireAuth, async (req, res) => {
  const memberships = await pool.query('SELECT club_id FROM club_memberships WHERE created_by_id = $1 AND status = $2', [req.user.id, 'approved']);
  const memberClubs = new Set(memberships.rows.map((row) => row.club_id));
  const result = await pool.query('SELECT * FROM club_alerts ORDER BY created_at DESC LIMIT 200');
  const visible = result.rows.filter((row) => row.recipient_user_id
    ? row.recipient_user_id === req.user.id
    : !row.club_id || row.created_by_id === req.user.id || memberClubs.has(row.club_id));
  return res.json({ alerts: visible.map(alertRecord) });
});

app.post('/api/club-alerts', requireAuth, async (req, res) => {
  const title = String(req.body?.title || '').trim();
  if (!title) return res.status(400).json({ error: 'Alert title is required.' });
  const result = await pool.query(
    `INSERT INTO club_alerts (id, club_id, club_name, created_by_id, title, message, type, discount, expires, active)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, TRUE) RETURNING *`,
    [
      crypto.randomUUID(),
      req.body?.club_id || null,
      String(req.body?.club_name || ''),
      req.user.id,
      title,
      String(req.body?.message || ''),
      req.body?.type || 'general',
      req.body?.discount === '' || req.body?.discount == null ? null : Number(req.body.discount),
      req.body?.expires || null,
    ],
  );
  return res.status(201).json({ alert: alertRecord(result.rows[0]) });
});

app.patch('/api/club-alerts/:id', requireAuth, async (req, res) => {
  const existing = await pool.query('SELECT * FROM club_alerts WHERE id = $1 AND created_by_id = $2', [req.params.id, req.user.id]);
  if (!existing.rows[0]) return res.status(404).json({ error: 'Alert not found' });
  const current = existing.rows[0];
  const result = await pool.query(
    `UPDATE club_alerts SET active = $1, updated_at = NOW() WHERE id = $2 RETURNING *`,
    [req.body?.active ?? current.active, req.params.id],
  );
  return res.json({ alert: alertRecord(result.rows[0]) });
});

app.delete('/api/club-alerts/:id', requireAuth, async (req, res) => {
  await pool.query('DELETE FROM club_alerts WHERE id = $1 AND created_by_id = $2', [req.params.id, req.user.id]);
  return res.json({ success: true });
});

const memberIds = (members) => (Array.isArray(members) ? members : []).map((member) => member?.user_id).filter(Boolean);
const canAccessConversation = (conversation, userId) => memberIds(conversation.members).includes(userId);

app.get('/api/conversations', requireAuth, async (req, res) => {
  const result = await pool.query(
    `SELECT id, name, is_group, group_photo_url, members, last_message, last_message_at,
            created_at AS created_date, updated_at AS updated_date
     FROM conversations
     WHERE members @> $1::jsonb
     ORDER BY COALESCE(last_message_at, updated_at) DESC
     LIMIT 200`,
    [JSON.stringify([{ user_id: req.user.id }])],
  );
  return res.json({ conversations: result.rows });
});

app.post('/api/conversations', requireAuth, async (req, res) => {
  const members = Array.isArray(req.body?.members) ? req.body.members : [];
  if (!members.some((member) => member?.user_id === req.user.id)) {
    return res.status(400).json({ error: 'A conversation must include the signed-in user.' });
  }
  const result = await pool.query(
    `INSERT INTO conversations (id, name, is_group, group_photo_url, members, last_message)
     VALUES ($1, $2, $3, $4, $5::jsonb, $6)
     RETURNING id, name, is_group, group_photo_url, members, last_message, last_message_at,
               created_at AS created_date, updated_at AS updated_date`,
    [crypto.randomUUID(), String(req.body?.name || ''), Boolean(req.body?.is_group), String(req.body?.group_photo_url || ''), JSON.stringify(members), String(req.body?.last_message || '')],
  );
  return res.status(201).json({ conversation: result.rows[0] });
});

app.patch('/api/conversations/:id', requireAuth, async (req, res) => {
  const current = await pool.query('SELECT members FROM conversations WHERE id = $1', [req.params.id]);
  if (!current.rows[0] || !canAccessConversation(current.rows[0], req.user.id)) {
    return res.status(404).json({ error: 'Conversation not found' });
  }
  const members = Array.isArray(req.body?.members) ? req.body.members : current.rows[0].members;
  const result = await pool.query(
    `UPDATE conversations
     SET name = COALESCE($1, name), group_photo_url = COALESCE($2, group_photo_url), members = $3::jsonb,
       last_message = COALESCE($4, last_message),
       last_message_at = COALESCE($5::timestamptz, last_message_at), updated_at = NOW()
    WHERE id = $6
     RETURNING id, name, is_group, group_photo_url, members, last_message, last_message_at,
               created_at AS created_date, updated_at AS updated_date`,
    [req.body?.name ?? null, req.body?.group_photo_url ?? null, JSON.stringify(members), req.body?.last_message ?? null, req.body?.last_message_at ?? null, req.params.id],
  );
  return res.json({ conversation: result.rows[0] });
});

app.get('/api/conversations/:id/messages', requireAuth, async (req, res) => {
  const conversation = await pool.query('SELECT members FROM conversations WHERE id = $1', [req.params.id]);
  if (!conversation.rows[0] || !canAccessConversation(conversation.rows[0], req.user.id)) {
    return res.status(404).json({ error: 'Conversation not found' });
  }
  const result = await pool.query(
    `SELECT id, conversation_id, sender_id, sender_name, sender_photo, text, created_at AS created_date
     FROM messages WHERE conversation_id = $1 ORDER BY created_at ASC LIMIT 200`,
    [req.params.id],
  );
  return res.json({ messages: result.rows });
});

app.post('/api/messages', requireAuth, async (req, res) => {
  const conversation = await pool.query('SELECT members FROM conversations WHERE id = $1', [req.body?.conversation_id]);
  const text = String(req.body?.text || '').trim();
  if (!conversation.rows[0] || !canAccessConversation(conversation.rows[0], req.user.id) || !text) {
    return res.status(400).json({ error: 'A valid conversation and message are required.' });
  }
  const result = await pool.query(
    `INSERT INTO messages (id, conversation_id, sender_id, sender_name, sender_photo, text)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id, conversation_id, sender_id, sender_name, sender_photo, text, created_at AS created_date`,
    [crypto.randomUUID(), req.body.conversation_id, req.user.id, req.user.name || req.user.email, req.user.photo_url || '', text],
  );
  await pool.query(
    'UPDATE conversations SET last_message = $1, last_message_at = NOW(), updated_at = NOW() WHERE id = $2',
    [text, req.body.conversation_id],
  );
  return res.status(201).json({ message: result.rows[0] });
});

app.post('/api/auth/login', async (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  const password = String(req.body?.password || '');

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required.' });
  }

  const result = await pool.query(
    `SELECT id, email, name, picture, provider, user_type, role, password_hash, password_salt, phone, city, zip_code, bio, photo_url, dupr_score, home_club, timezone, blocked_users,
            stripe_account_id, stripe_charges_enabled, stripe_details_submitted
     FROM users WHERE LOWER(email) = $1 LIMIT 1`,
    [email],
  );

  const user = result.rows[0];
  if (!user || !verifyPassword(password, user.password_salt, user.password_hash)) {
    return res.status(401).json({ error: 'Invalid email or password.' });
  }

  await setSessionCookie(res, user.id);
  return res.json({ user: sanitizeUser(user) });
});

app.post('/api/auth/register', async (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  const password = String(req.body?.password || '');
  const name = String(req.body?.name || email.split('@')[0] || 'Player');

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required.' });
  }

  const existing = await pool.query('SELECT id FROM users WHERE LOWER(email) = $1 LIMIT 1', [email]);
  if (existing.rows[0]) {
    return res.status(409).json({ error: 'An account with that email already exists.' });
  }

  const userId = crypto.randomUUID();
  const { salt, hash } = hashPassword(password);
  const role = adminEmails.has(email) ? 'admin' : 'user';

  const result = await pool.query(
    `INSERT INTO users (id, email, name, picture, provider, user_type, role, password_hash, password_salt)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING id, email, name, picture, provider, user_type, role, phone, city, zip_code, bio, photo_url, dupr_score, home_club, timezone, blocked_users,
               stripe_account_id, stripe_charges_enabled, stripe_details_submitted`,
    [userId, email, name, '', 'email', 'player', role, hash, salt],
  );

  const user = result.rows[0];
  await setSessionCookie(res, user.id);
  return res.status(201).json({ user: sanitizeUser(user) });
});

app.patch('/api/auth/me', requireAuth, async (req, res) => {
  const allowed = ['user_type', 'phone', 'city', 'zip_code', 'bio', 'photo_url', 'dupr_score', 'home_club', 'timezone', 'blocked_users'];
  const updates = Object.fromEntries(Object.entries(req.body || {}).filter(([key]) => allowed.includes(key)));
  const entries = Object.entries(updates);
  if (!entries.length) return res.json({ user: req.user });

  const setClause = entries.map(([key], index) => `${key} = $${index + 1}`).join(', ');
  const values = entries.map(([, value]) => value);
  values.push(req.user.id);
  const result = await pool.query(
    `UPDATE users SET ${setClause}, updated_at = NOW() WHERE id = $${values.length}
     RETURNING id, email, name, picture, provider, user_type, role, phone, city, zip_code, bio, photo_url, dupr_score, home_club, timezone, blocked_users,
               stripe_account_id, stripe_charges_enabled, stripe_details_submitted`,
    values,
  );
  return res.json({ user: sanitizeUser(result.rows[0]) });
});

app.get('/api/admin/users', requireAuth, requireAdmin, async (req, res) => {
  const result = await pool.query(
    'SELECT id, email, name, picture, provider, user_type, role, created_at, updated_at FROM users ORDER BY created_at DESC LIMIT 200',
  );
  return res.json({ users: result.rows });
});

app.patch('/api/admin/users/:id', requireAuth, requireAdmin, async (req, res) => {
  const updates = {};
  if (req.body?.role === 'admin' || req.body?.role === 'user') updates.role = req.body.role;
  if (['player', 'club_owner', 'tournament_organizer'].includes(req.body?.user_type)) updates.user_type = req.body.user_type;
  const entries = Object.entries(updates);
  if (!entries.length) return res.status(400).json({ error: 'No valid user updates supplied' });
  const setClause = entries.map(([key], index) => `${key} = $${index + 1}`).join(', ');
  const values = entries.map(([, value]) => value);
  values.push(req.params.id);
  const result = await pool.query(
    `UPDATE users SET ${setClause}, updated_at = NOW() WHERE id = $${values.length}
     RETURNING id, email, name, picture, provider, user_type, role, created_at, updated_at`,
    values,
  );
  if (!result.rows[0]) return res.status(404).json({ error: 'User not found' });
  return res.json({ user: result.rows[0] });
});

app.post('/api/auth/google', async (req, res) => {
  const { credential, access_token, user: requestUser } = req.body || {};
  const token = credential || access_token;

  try {
    let payload = requestUser || null;

    if (credential && credential.includes('.')) {
      const ticket = await googleClient.verifyIdToken({
        idToken: credential,
        audience: process.env.VITE_GOOGLE_CLIENT_ID,
      });
      payload = ticket.getPayload();
    } else if (token) {
      try {
        const tokenInfo = await googleClient.getTokenInfo(token);
        payload = {
          sub: tokenInfo.sub,
          email: tokenInfo.email,
          name: tokenInfo.name || tokenInfo.email?.split('@')[0] || 'Google User',
          picture: tokenInfo.picture || '',
        };
      } catch (error) {
        payload = payload || requestUser;
      }
    }

    if (!payload?.email || !payload?.sub) {
      return res.status(400).json({ error: 'Google profile is incomplete.' });
    }

    const user = await upsertUser({
      id: payload.sub,
      email: payload.email,
      name: payload.name,
      picture: payload.picture,
      provider: 'google',
    });

    await setSessionCookie(res, user.id);
    return res.json({ user });
  } catch (error) {
    return res.status(401).json({ error: 'Google verification failed' });
  }
});

app.post('/api/auth/logout', async (req, res) => {
  const token = req.cookies?.session_token;
  if (token) {
    await pool.query('UPDATE users SET session_token = NULL WHERE session_token = $1', [token]);
  }
  res.clearCookie('session_token');
  return res.json({ success: true });
});

// Catches errors from any route (including async ones, patched by express-async-errors)
// so a single failing request returns 500 instead of crashing the whole process.
app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);
  console.error(err);
  return res.status(500).json({ error: 'Internal server error' });
});

process.on('unhandledRejection', (err) => {
  console.error('Unhandled promise rejection:', err);
});

app.listen(port, () => {
  console.log(`Google auth backend listening on http://localhost:${port}`);
});
