const createEntityProxy = (entityName) => ({
  list: async () => [],
  get: async () => null,
  create: async (payload) => ({ id: crypto.randomUUID?.() ?? `${entityName}-local-${Date.now()}`, ...payload }),
  update: async (id, payload) => ({ id, ...payload }),
  delete: async () => ({ success: true }),
  filter: async () => [],
  subscribe: () => () => {},
});

const createFunctionsProxy = () => ({
  invoke: async (name, payload = {}) => {
    if (name === 'create-checkout') {
      const data = await fetchJson('/api/payments/create-checkout-session', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
      });
      return { data };
    }
    if (name === 'tournament-payment-status') {
      const params = new URLSearchParams({ tournament_id: payload.tournament_id || '' });
      const data = await fetchJson(`/api/payments/tournament-status?${params}`);
      return { data };
    }
    if (name === 'stripe-connect-link') {
      const data = await fetchJson('/api/stripe/connect/onboarding-link', { method: 'POST' });
      return { data };
    }
    if (name === 'stripe-connect-status') {
      const data = await fetchJson('/api/stripe/connect/status');
      return { data };
    }
    return { success: true, skipped: true };
  },
});

const fetchJson = async (url, options) => {
  const res = await fetch(url, { credentials: 'include', ...options });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
};

const playerEntity = {
  list: async (_sort, _limit) => (await fetchJson('/api/players')).players || [],
  filter: async ({ user_id: userId } = {}) => {
    const players = (await fetchJson('/api/players')).players || [];
    return players.filter((player) => !userId || player.user_id === userId);
  },
  create: async () => null,
  update: async () => null,
  get: async () => null,
  delete: async () => ({ success: true }),
  subscribe: () => () => {},
};

const favoritePlayerEntity = {
  list: async () => (await fetchJson('/api/favorite-players')).favorites || [],
  filter: async (filters = {}) => {
    const favorites = (await fetchJson('/api/favorite-players')).favorites || [];
    return favorites.filter((favorite) => Object.entries(filters).every(([key, value]) => favorite[key] === value));
  },
  create: async (payload) => (await fetchJson('/api/favorite-players', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })).favorite,
  delete: async (id) => fetchJson(`/api/favorite-players/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  get: async () => null,
  update: async () => null,
  subscribe: () => () => {},
};

const conversationEntity = {
  list: async () => (await fetchJson('/api/conversations')).conversations || [],
  get: async (id) => {
    const conversations = (await fetchJson('/api/conversations')).conversations || [];
    return conversations.find((conversation) => conversation.id === id) || null;
  },
  create: async (payload) => (await fetchJson('/api/conversations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })).conversation,
  update: async (id, payload) => (await fetchJson(`/api/conversations/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })).conversation,
  delete: async () => ({ success: true }),
  filter: async () => [],
  subscribe: () => () => {},
};

const messageEntity = {
  list: async () => [],
  filter: async ({ conversation_id: conversationId } = {}) => {
    if (conversationId) {
      return (await fetchJson(`/api/conversations/${encodeURIComponent(conversationId)}/messages`)).messages || [];
    }
    const conversations = (await fetchJson('/api/conversations')).conversations || [];
    const messageLists = await Promise.all(
      conversations.map((conversation) => fetchJson(`/api/conversations/${encodeURIComponent(conversation.id)}/messages`)),
    );
    return messageLists.flatMap((result) => result.messages || []);
  },
  create: async (payload) => (await fetchJson('/api/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })).message,
  get: async () => null,
  update: async () => null,
  delete: async () => ({ success: true }),
  subscribe: () => () => {},
};

const clubEntity = {
  list: async () => (await fetchJson('/api/clubs')).clubs || [],
  get: async (id) => (await fetchJson(`/api/clubs/${encodeURIComponent(id)}`)).club,
  create: async (payload) => (await fetchJson('/api/clubs', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
  })).club,
  update: async (id, payload) => (await fetchJson(`/api/clubs/${encodeURIComponent(id)}`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
  })).club,
  delete: async (id) => fetchJson(`/api/clubs/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  filter: async () => [],
  subscribe: () => () => {},
};

/** @type {{ list: (clubId?: string) => Promise<any[]>, create: (payload: object) => Promise<any>, update: (id: string, payload: object) => Promise<any> }} */
const clubBookingRequestEntity = {
  list: async (clubId) => {
    const params = new URLSearchParams();
    if (clubId) params.set('club_id', clubId);
    return (await fetchJson(`/api/club-booking-requests${params.size ? `?${params}` : ''}`)).requests || [];
  },
  create: async (payload) => (await fetchJson('/api/club-booking-requests', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
  })).request,
  update: async (id, payload) => (await fetchJson(`/api/club-booking-requests/${encodeURIComponent(id)}`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
  })).request,
};

const availabilityEntity = {
  list: async () => (await fetchJson('/api/availability')).availability || [],
  filter: async (filters = {}) => {
    const currentUser = JSON.parse(localStorage.getItem('frontend_user') || 'null');
    if (filters.created_by_id && filters.created_by_id !== currentUser?.id) return [];
    const params = new URLSearchParams();
    if (filters.date) params.set('date', filters.date);
    return (await fetchJson(`/api/availability${params.size ? `?${params}` : ''}`)).availability || [];
  },
  create: async (payload) => (await fetchJson('/api/availability', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
  })).availability,
  update: async (id, payload) => (await fetchJson(`/api/availability/${encodeURIComponent(id)}`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
  })).availability,
  forClub: async (clubId, date) => {
    const params = new URLSearchParams();
    if (date) params.set('date', date);
    return fetchJson(`/api/clubs/${encodeURIComponent(clubId)}/availability${params.size ? `?${params}` : ''}`, { cache: 'no-store' });
  },
  forPlayer: async (playerUserId) => (
    await fetchJson(`/api/players/${encodeURIComponent(playerUserId)}/availability`)
  ).availability || [],
  get: async () => null,
  delete: async () => ({ success: true }),
  subscribe: () => () => {},
};

const membershipEntity = {
  list: async () => (await fetchJson('/api/club-memberships')).memberships || [],
  filter: async (filters = {}) => {
    const memberships = (await fetchJson('/api/club-memberships')).memberships || [];
    return memberships.filter((membership) => Object.entries(filters).every(([key, value]) => membership[key] === value));
  },
  create: async (payload) => (await fetchJson('/api/club-memberships', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
  })).membership,
  update: async (id, payload) => (await fetchJson(`/api/club-memberships/${encodeURIComponent(id)}`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
  })).membership,
  get: async () => null,
  delete: async (id) => fetchJson(`/api/club-memberships/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  subscribe: () => () => {},
};

const playEntity = {
  list: async () => (await fetchJson('/api/plays')).plays || [],
  get: async (id) => (await fetchJson(`/api/plays/${encodeURIComponent(id)}`)).play,
  create: async (payload) => (await fetchJson('/api/plays', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
  })).play,
  update: async (id, payload) => (await fetchJson(`/api/plays/${encodeURIComponent(id)}`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
  })).play,
  join: async (id) => (await fetchJson(`/api/plays/${encodeURIComponent(id)}/join`, { method: 'POST' })).play,
  leave: async (id) => (await fetchJson(`/api/plays/${encodeURIComponent(id)}/leave`, { method: 'POST' })).play,
  delete: async (id) => fetchJson(`/api/plays/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  filter: async (filters = {}) => {
    const plays = (await fetchJson('/api/plays')).plays || [];
    return plays.filter((play) => Object.entries(filters).every(([key, value]) => play[key] === value));
  },
  subscribe: () => () => {},
};

const playInviteEntity = {
  list: async (playId) => (await fetchJson(`/api/plays/${encodeURIComponent(playId)}/invites`)).invites || [],
  create: async (playId, payload) => (await fetchJson(`/api/plays/${encodeURIComponent(playId)}/invites`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
  })).invite,
  decline: async (id) => (await fetchJson(`/api/play-invites/${encodeURIComponent(id)}`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'declined' }),
  })).invite,
};

const tournamentEntity = {
  list: async () => (await fetchJson('/api/tournaments')).tournaments || [],
  get: async (id) => (await fetchJson(`/api/tournaments/${encodeURIComponent(id)}`)).tournament,
  create: async (payload) => (await fetchJson('/api/tournaments', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
  })).tournament,
  update: async (id, payload) => (await fetchJson(`/api/tournaments/${encodeURIComponent(id)}`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
  })).tournament,
  delete: async (id) => fetchJson(`/api/tournaments/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  filter: async (filters = {}) => {
    const tournaments = (await fetchJson('/api/tournaments')).tournaments || [];
    return tournaments.filter((t) => Object.entries(filters).every(([key, value]) => t[key] === value));
  },
  subscribe: () => () => {},
};

export const clearStoredAuth = () => {
  localStorage.removeItem('frontend_user');
  localStorage.removeItem('frontend_access_token');
};

const USERS_STORAGE_KEY = 'frontend_users';
const configuredAdminEmails = (import.meta.env.VITE_ADMIN_EMAILS || '')
  .split(',')
  .map((email) => email.trim().toLowerCase())
  .filter(Boolean);
const readUsers = () => JSON.parse(localStorage.getItem(USERS_STORAGE_KEY) || '[]');
const writeUsers = (users) => localStorage.setItem(USERS_STORAGE_KEY, JSON.stringify(users));
const saveUserRecord = (user) => {
  const users = readUsers();
  const index = users.findIndex((item) => item.id === user.id || item.email === user.email);
  const nextUser = {
    ...(index === -1 ? {} : users[index]),
    ...user,
    role: configuredAdminEmails.includes((user.email || '').toLowerCase())
      ? 'admin'
      : user.role ?? (index === -1 ? undefined : users[index].role),
  };
  if (index === -1) users.push(nextUser);
  else users[index] = { ...users[index], ...nextUser };
  writeUsers(users);
  return nextUser;
};

const createAuthProxy = () => ({
  me: async () => {
    const res = await fetch('/api/auth/session', { credentials: 'include' });
    if (!res.ok) {
      const stored = localStorage.getItem('frontend_user');
      if (stored) {
        return JSON.parse(stored);
      }
      return null;
    }

    const data = await res.json();
    if (data?.user) {
      const user = saveUserRecord(data.user);
      localStorage.setItem('frontend_user', JSON.stringify(user));
      return user;
    }
    return data?.user ?? null;
  },
  loginViaEmailPassword: async (email, password) => {
    if (!email || !password) {
      throw new Error('Email and password are required');
    }

    const res = await fetch('/api/auth/login', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || 'Invalid email or password');
    }

    const data = await res.json();
    const user = saveUserRecord(data.user);
    localStorage.setItem('frontend_user', JSON.stringify(user));
    localStorage.setItem('frontend_access_token', 'session-token');
    return user;
  },
  loginWithProvider: async (provider, returnTo = '/') => {
    if (provider === 'google') {
      window.location.href = returnTo || '/';
      return null;
    }
    return null;
  },
  register: async (payload) => {
    const email = payload?.email;
    const password = payload?.password;
    const name = payload?.name || (email ? email.split('@')[0] : 'Player');

    if (!email || !password) {
      throw new Error('Email and password are required');
    }

    const res = await fetch('/api/auth/register', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, name }),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || 'Registration failed');
    }

    const data = await res.json();
    const user = saveUserRecord(data.user);
    localStorage.setItem('frontend_user', JSON.stringify(user));
    localStorage.setItem('frontend_access_token', 'session-token');
    return user;
  },
  verifyOtp: async ({ email, otpCode }) => {
    const user = {
      id: `otp-user-${Date.now()}`,
      email,
      name: email.split('@')[0],
      provider: 'email',
      role: 'player',
    };
    saveUserRecord(user);
    localStorage.setItem('frontend_user', JSON.stringify(user));
    localStorage.setItem('frontend_access_token', `otp-token-${otpCode}`);
    return { access_token: `otp-token-${otpCode}` };
  },
  resendOtp: async () => ({ success: true }),
  logout: async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
    } catch (error) {
      console.warn('Server logout failed:', error);
    }
    clearStoredAuth();
    return true;
  },
  redirectToLogin: () => {
    window.location.href = '/login';
  },
  updateMe: async (updates) => {
    const res = await fetch('/api/auth/me', {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    });
    if (!res.ok) throw new Error('Could not update your account');
    const data = await res.json();
    const next = saveUserRecord(data.user);
    localStorage.setItem('frontend_user', JSON.stringify(next));
    return next;
  },
  setToken: (token) => {
    if (token) localStorage.setItem('frontend_access_token', token);
  },
});

const createIntegrationsProxy = () => ({
  Core: {
    UploadFile: async ({ file }) => ({
      file_url: file?.name ? URL.createObjectURL(file) : '',
    }),
  },
});

const clubAlertEntity = {
  list: async () => (await fetchJson('/api/club-alerts')).alerts || [],
  create: async (payload) => (await fetchJson('/api/club-alerts', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
  })).alert,
  update: async (id, payload) => (await fetchJson(`/api/club-alerts/${encodeURIComponent(id)}`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
  })).alert,
  delete: async (id) => fetchJson(`/api/club-alerts/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  get: async () => null,
  filter: async () => [],
  subscribe: () => () => {},
};

const checkInEntity = {
  list: async () => [],
  filter: async ({ club_id: clubId, date, from, to, from_time: fromTime, to_time: toTime, search } = {}) => {
    if (!clubId) return [];
    const params = new URLSearchParams({ club_id: clubId });
    if (date) params.set("date", date);
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    if (fromTime) params.set("from_time", fromTime);
    if (toTime) params.set("to_time", toTime);
    if (search) params.set("search", search);
    return (await fetchJson(`/api/check-ins?${params.toString()}`)).checkins || [];
  },
  create: async (payload) => (await fetchJson('/api/check-ins', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
  })).checkin,
  get: async () => null,
  update: async () => null,
  delete: async () => ({ success: true }),
  subscribe: () => () => {},
};

const base44 = {
  auth: createAuthProxy(),
  entities: {
    Availability: availabilityEntity,
    Club: clubEntity,
    ClubBookingRequest: clubBookingRequestEntity,
    ClubAlert: clubAlertEntity,
    CheckIn: checkInEntity,
    ClubEvent: createEntityProxy('ClubEvent'),
    ClubMembership: membershipEntity,
    ClubMonthlyReport: createEntityProxy('ClubMonthlyReport'),
    Conversation: conversationEntity,
    FavoritePlayer: favoritePlayerEntity,
    Match: createEntityProxy('Match'),
    Message: messageEntity,
    Play: playEntity,
    PlayInvite: playInviteEntity,
    Player: playerEntity,
    ScoreDiscrepancy: createEntityProxy('ScoreDiscrepancy'),
    ScoreSubmission: createEntityProxy('ScoreSubmission'),
    Tournament: tournamentEntity,
    TournamentMedal: createEntityProxy('TournamentMedal'),
    User: {
      list: async () => {
        const res = await fetch('/api/admin/users', { credentials: 'include' });
        if (!res.ok) throw new Error('Could not load users');
        const data = await res.json();
        return data.users || [];
      },
      filter: async ({ email } = {}) => {
        const users = await base44.entities.User.list();
        return users.filter((user) => !email || user.email === email);
      },
      update: async (id, payload) => {
        const res = await fetch(`/api/admin/users/${encodeURIComponent(id)}`, {
          method: 'PATCH',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (!res.ok) throw new Error('Could not update user');
        const data = await res.json();
        return data.user;
      },
      get: async (id) => {
        const users = await base44.entities.User.list();
        return users.find((user) => user.id === id) || null;
      },
      create: async (payload) => saveUserRecord({ id: `local-user-${Date.now()}`, ...payload }),
      delete: async () => ({ success: true }),
      subscribe: () => () => {},
    },
    WaitlistEntry: createEntityProxy('WaitlistEntry'),
  },
  functions: createFunctionsProxy(),
  integrations: createIntegrationsProxy(),
  users: {
    inviteUser: async () => ({ success: true }),
  },
};

export const base44Client = base44;
export { base44Client as base44 };
