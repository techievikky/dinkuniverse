import React, { useEffect, useState, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import ChatList from "@/components/ChatList";
import ChatThread from "@/components/ChatThread";
import NewChatDialog from "@/components/NewChatDialog";
import { useChatNotifications } from "@/lib/ChatNotificationsContext";
import { useSearchParams } from "react-router-dom";
import { Send } from "lucide-react";

export default function Chats() {
  const { user } = useAuth();
  const { markRead, setActiveConversation } = useChatNotifications();
  const [conversations, setConversations] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [loadingConv, setLoadingConv] = useState(true);
  const [sending, setSending] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [mobileThread, setMobileThread] = useState(false);
  const [blockedUsers, setBlockedUsers] = useState(user?.blocked_users || []);

  const activeIdRef = useRef(activeId);
  const convsRef = useRef(conversations);
  useEffect(() => { activeIdRef.current = activeId; }, [activeId]);
  useEffect(() => { convsRef.current = conversations; }, [conversations]);
  useEffect(() => () => setActiveConversation(null), []);

  const activeConversation = conversations.find((c) => c.id === activeId) || null;

  // Ensure current user has a Player directory record (for others to search them)
  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        const existing = await base44.entities.Player.filter({ user_id: user.id });
        if (!existing.length) {
          await base44.entities.Player.create({
            user_id: user.id,
            name: user.full_name || user.email,
            email: user.email || "",
            photo_url: user.photo_url || "",
          });
        }
      } catch {
        // ignore — directory is non-critical
      }
    })();
  }, [user]);

  // Load my conversations (where I'm a member)
  const loadConversations = async () => {
    try {
      const all = await base44.entities.Conversation.list("-updated_date", 200);
      const mine = all.filter((c) => (c.members || []).some((m) => m.user_id === user?.id));
      setConversations(mine);
    } finally {
      setLoadingConv(false);
    }
  };

  useEffect(() => {
    if (user) loadConversations();
  }, [user]);

  // Deep-link: open a specific conversation via ?c=<id> (used by the tournament chat panel).
  const [searchParams] = useSearchParams();
  useEffect(() => {
    const c = searchParams.get("c");
    if (c && c !== activeId && conversations.some((x) => x.id === c)) {
      openConversation(c);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, conversations]);

  // Realtime subscription for messages
  useEffect(() => {
    const unsubscribe = base44.entities.Message.subscribe((event) => {
      const ev = event.data;
      if (!ev || !ev.conversation_id) return;

      // Update active thread messages
      if (activeIdRef.current === ev.conversation_id) {
        setMessages((prev) => {
          // If this real-time event echoes an optimistic message we just sent, replace the placeholder.
          const placeholderIdx = prev.findIndex(
            (m) => m._pending && m.sender_id === ev.sender_id && m.text === ev.text
          );
          if (placeholderIdx !== -1) {
            const copy = [...prev];
            copy[placeholderIdx] = { ...ev, _pending: false, _failed: false };
            return copy;
          }
          return upsert(prev, ev);
        });
      }

      // Update conversation preview + resort
      const conv = convsRef.current.find((c) => c.id === ev.conversation_id);
      if (conv) {
        setConversations((prev) =>
          [...prev].map((c) =>
            c.id === ev.conversation_id
              ? { ...c, last_message: ev.text, last_message_at: ev.created_date || c.last_message_at }
              : c
          ).sort((a, b) => new Date(b.last_message_at || b.created_date || 0) - new Date(a.last_message_at || a.created_date || 0))
        );
      }
    });
    return unsubscribe;
  }, []);

  // Load messages when active conversation changes
  useEffect(() => {
    if (!activeId) return;
    (async () => {
      try {
        const data = await base44.entities.Message.filter(
          { conversation_id: activeId },
          "-created_date",
          200
        );
        setMessages(data.reverse());
      } catch {
        setMessages([]);
      }
    })();
  }, [activeId]);

  const openConversation = (id) => {
    setActiveId(id);
    setMobileThread(true);
    setActiveConversation(id);
    markRead(id);
  };

  const onCreated = (conv) => {
    setConversations((prev) => [conv, ...prev]);
    openConversation(conv.id);
    setShowNew(false);
  };

  const onUpdateGroup = async (conversation, updates) => {
    const updated = await base44.entities.Conversation.update(conversation.id, updates);
    setConversations((prev) => prev.map((item) => (item.id === updated.id ? updated : item)));
  };

  const onSend = async (text) => {
    if (!activeConversation) return;
    const tempId = `opt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const optimistic = {
      id: tempId,
      conversation_id: activeConversation.id,
      text,
      sender_id: user.id,
      sender_name: user.full_name || user.email,
      sender_photo: user.photo_url || "",
      created_date: new Date().toISOString(),
      _pending: true,
    };
    setMessages((prev) => [...prev, optimistic]);
    setSending(true);
    try {
      const msg = await base44.entities.Message.create({
        conversation_id: activeConversation.id,
        text,
        sender_id: user.id,
        sender_name: user.full_name || user.email,
        sender_photo: user.photo_url || "",
      });
      // swap the optimistic placeholder for the persisted record
      setMessages((prev) => prev.map((m) => (m.id === tempId ? { ...msg, _pending: false } : m)));
      const updated = await base44.entities.Conversation.update(activeConversation.id, {
        last_message: text,
        last_message_at: new Date().toISOString(),
      });
      setConversations((prev) => upsert(prev, updated).sort(
        (a, b) => new Date(b.last_message_at || b.created_date || 0) - new Date(a.last_message_at || a.created_date || 0)
      ));
    } catch {
      setMessages((prev) => prev.map((m) => (m.id === tempId ? { ...m, _pending: false, _failed: true } : m)));
    } finally {
      setSending(false);
    }
  };

  const otherMember = (conv) => (conv?.members || []).find((m) => m.user_id !== user?.id);

  const isBlockedByMe = (conv) => {
    if (!conv || conv.is_group) return false;
    const other = otherMember(conv);
    return other ? blockedUsers.includes(other.user_id) : false;
  };

  const persistBlockList = async (next) => {
    try { await base44.auth.updateMe({ blocked_users: next }); } catch {}
  };

  const leaveConversation = async (conv) => {
    if (!conv) return;
    try {
      const members = (conv.members || []).filter((m) => m.user_id !== user.id);
      await base44.entities.Conversation.update(conv.id, { members });
      setConversations((prev) => prev.filter((c) => c.id !== conv.id));
      if (activeIdRef.current === conv.id) {
        setActiveId(null);
        setMobileThread(false);
      }
    } catch {}
  };

  const blockSender = async (conv) => {
    const other = otherMember(conv);
    if (!other) return;
    const next = Array.from(new Set([...(blockedUsers || []), other.user_id]));
    setBlockedUsers(next);
    persistBlockList(next);
  };

  const unblockSender = async (conv) => {
    const other = otherMember(conv);
    if (!other) return;
    const next = (blockedUsers || []).filter((id) => id !== other.user_id);
    setBlockedUsers(next);
    persistBlockList(next);
  };

  if (loadingConv) {
    return (
      <div className="flex justify-center py-20">
        <div className="w-6 h-6 border-4 border-white/10 border-t-lime-400 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div>
      <h1 className="font-display text-2xl sm:text-3xl font-bold text-white tracking-tight lg:hidden mb-4">Chats</h1>
      <div className="grid lg:grid-cols-[320px_1fr] gap-0 lg:gap-4 rounded-2xl border border-white/5 bg-white/[0.02] overflow-hidden h-[calc(100vh-10rem)]">
        <div className={`border-r border-white/5 ${mobileThread ? "hidden lg:block" : "block"}`}>
          <ChatList
            conversations={conversations}
            activeId={activeId}
            onSelect={openConversation}
            onNew={() => setShowNew(true)}
            user={user}
            isBlockedByMe={isBlockedByMe}
          />
        </div>
        <div className={`flex-1 ${mobileThread ? "block" : "hidden lg:flex"}`}>
          <div className="flex-1 flex flex-col min-h-0">
            <ChatThread
              conversation={activeConversation}
              messages={messages}
              user={user}
              sending={sending}
              onSend={onSend}
              onBack={() => setMobileThread(false)}
              onLeave={leaveConversation}
              onBlock={blockSender}
              onUnblock={unblockSender}
              onUpdateGroup={onUpdateGroup}
              blockedByMe={activeConversation ? isBlockedByMe(activeConversation) : false}
              otherName={activeConversation ? otherMember(activeConversation)?.name : null}
            />
          </div>
        </div>
      </div>

      <NewChatDialog open={showNew} onClose={() => setShowNew(false)} onCreated={onCreated} blockedUsers={blockedUsers} />
    </div>
  );
}

function upsert(list, item) {
  const idx = list.findIndex((x) => x.id === item.id);
  if (idx === -1) return [...list, item];
  const copy = [...list];
  copy[idx] = item;
  return copy;
}