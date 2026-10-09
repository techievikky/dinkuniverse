import { base44 } from "@/api/base44Client";
import { loadMyConversations, ensureDirectConversation, sendChatMessage } from "@/lib/chat";

// All waiting entries for an event (and optional division), oldest first.
export async function fetchWaiting(eventId, division) {
  const all = await base44.entities.WaitlistEntry.list("created_date", 500);
  return all.filter(
    (w) => w.event_id === eventId && (!division || w.division === division) && w.status === "waiting"
  );
}

export async function isOnWaitlist(eventId, division, userId) {
  const list = await fetchWaiting(eventId, division);
  return list.some((w) => w.user_id === userId);
}

// A user's own active (waiting/notified) waitlist entries.
export async function myWaitlistEntries(userId) {
  const all = await base44.entities.WaitlistEntry.list("-created_date", 500);
  return all.filter((w) => w.user_id === userId && (w.status === "waiting" || w.status === "notified"));
}

// Add the current user to a waitlist (no-op if already on it).
export async function addToWaitlist({ event_type, event_id, event_title, division, user, userName }) {
  if (await isOnWaitlist(event_id, division, user.id)) return { already: true };
  await base44.entities.WaitlistEntry.create({
    event_type,
    event_id,
    event_title,
    division: division || null,
    user_id: user.id,
    user_name: userName || user.full_name || user.email,
    status: "waiting",
  });
  return { added: true };
}

// Mark the user's waitlist entry as joined once they actually register.
export async function markJoined(eventId, division, userId) {
  if (!userId) return;
  const all = await base44.entities.WaitlistEntry.list("-created_date", 500);
  const mine = all.filter(
    (w) =>
      w.event_id === eventId &&
      (!division || w.division === division) &&
      w.user_id === userId &&
      (w.status === "waiting" || w.status === "notified")
  );
  await Promise.all(mine.map((w) => base44.entities.WaitlistEntry.update(w.id, { status: "joined" })));
}

// Promote the next person on the waitlist: mark them notified and send a chat
// message so they can claim the newly opened spot. Returns the promoted entry.
export async function promoteNext({ event_type, event_id, event_title, division, sender }) {
  const list = await fetchWaiting(event_id, division);
  if (!list.length) return null;
  const next = list[0];
  try {
    await base44.entities.WaitlistEntry.update(next.id, { status: "notified", notified_at: new Date().toISOString() });
    if (next.user_id && next.user_id !== sender?.id) {
      const myConvs = await loadMyConversations(sender.id);
      const conv = await ensureDirectConversation(myConvs, sender, { user_id: next.user_id, name: next.user_name });
      const text =
        event_type === "tournament"
          ? `🎟️ A spot just opened in "${event_title}"! You're next on the waitlist — open Tournaments to claim it before someone else does.`
          : `🎾 A spot just opened in "${event_title}"! You're next on the waitlist — open the Plays tab to join in.`;
      await sendChatMessage(sender, conv, text);
    }
    return next;
  } catch {
    return null;
  }
}