import { base44 } from "@/api/base44Client";
import { formatDateInTimeZone } from "@/lib/timezone";

// Load all conversations the given user is a member of.
export async function loadMyConversations(userId) {
  const all = await base44.entities.Conversation.list("-updated_date", 200);
  return all.filter((c) => (c.members || []).some((m) => m.user_id === userId));
}

// Find an existing 1:1 (non-group, 2-member) conversation between two users.
export function findDirectConversation(myConvs, meId, targetId) {
  return myConvs.find(
    (c) =>
      !c.is_group &&
      (c.members || []).length === 2 &&
      (c.members || []).some((m) => m.user_id === meId) &&
      (c.members || []).some((m) => m.user_id === targetId)
  );
}

export async function createDirectConversation(meUser, target) {
  const members = [
    { user_id: meUser.id, name: meUser.full_name || meUser.email, photo_url: meUser.photo_url || "" },
    { user_id: target.user_id, name: target.name, photo_url: target.photo_url || "" },
  ];
  return base44.entities.Conversation.create({
    name: target.name,
    is_group: false,
    members,
    last_message: "",
  });
}

// Get-or-create a 1:1 conversation, given a preloaded list of my conversations (mutated when a new one is created).
export async function ensureDirectConversation(myConvs, meUser, target) {
  let conv = findDirectConversation(myConvs, meUser.id, target.user_id);
  if (!conv) {
    conv = await createDirectConversation(meUser, target);
    myConvs.push(conv);
  }
  return conv;
}

export async function sendChatMessage(meUser, conversation, text) {
  const msg = await base44.entities.Message.create({
    conversation_id: conversation.id,
    text,
    sender_id: meUser.id,
    sender_name: meUser.full_name || meUser.email,
    sender_photo: meUser.photo_url || "",
  });
  await base44.entities.Conversation.update(conversation.id, {
    last_message: text,
    last_message_at: new Date().toISOString(),
  });
  return msg;
}

function whenLabel(play) {
  return `${formatDateInTimeZone(play.date, undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  })} at ${formatPlayTime(play)}`;
}

function formatPlayTime(play) {
  if (play.start_time && play.end_time) return `${play.start_time} - ${play.end_time}`;
  return play.time || "the scheduled time";
}

export function playInviteText(hostName, play) {
  return `🎾 ${hostName} invited you to join "${play.title}" on ${whenLabel(play)} at ${play.location}. Open the Plays tab to join in!`;
}

export function playNudgeText(hostName, play) {
  return `🔔 Reminder from ${hostName}: "${play.title}" is coming up on ${whenLabel(play)} at ${play.location}. See you on court!`;
}

// Add a member to a conversation if not already present. Returns the updated conversation shape.
export async function addMemberToConversation(conv, member) {
  const members = conv?.members || [];
  if (members.some((m) => m.user_id === member.user_id)) return conv;
  const next = [...members, member];
  await base44.entities.Conversation.update(conv.id, { members: next });
  return { ...conv, members: next };
}

// Load a conversation by id and ensure the given member is in it (used when a player
// registers for a tournament, to drop them into the tournament's group chat).
export async function ensureMemberInConversation(conversationId, member) {
  if (!conversationId) return null;
  try {
    const conv = await base44.entities.Conversation.get(conversationId);
    return await addMemberToConversation(conv, member);
  } catch {
    return null;
  }
}