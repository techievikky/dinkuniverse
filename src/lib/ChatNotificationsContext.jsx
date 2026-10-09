import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { MessageCircle, X } from "lucide-react";

const ChatNotificationsContext = createContext(null);
const readKey = (userId) => `dinkrally_chat_read_${userId}`;

export function ChatNotificationsProvider({ children }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [unread, setUnread] = useState({}); // { [conversationId]: count }
  const [notification, setNotification] = useState(null);
  const activeConvRef = useRef(null);
  const convIdsRef = useRef(new Set());
  const convMapRef = useRef({});
  const locationRef = useRef(location.pathname);

  useEffect(() => { locationRef.current = location.pathname; }, [location.pathname]);

  const setActiveConversation = useCallback((id) => {
    activeConvRef.current = id;
  }, []);

  const refreshUnread = useCallback(async () => {
    if (!user) return;
    const all = await base44.entities.Conversation.list("-updated_date", 200);
    const mine = all.filter((c) => (c.members || []).some((m) => m.user_id === user.id));
    convIdsRef.current = new Set(mine.map((c) => c.id));
    convMapRef.current = Object.fromEntries(mine.map((c) => [c.id, c]));

    const rawRead = localStorage.getItem(readKey(user.id));
    const lastRead = rawRead ? JSON.parse(rawRead) : {};
    if (Object.keys(lastRead).length === 0) {
      const seed = {};
      mine.forEach((c) => { seed[c.id] = new Date().toISOString(); });
      localStorage.setItem(readKey(user.id), JSON.stringify(seed));
      setUnread({});
      return;
    }

    const messages = await base44.entities.Message.filter({});
    const counts = {};
    for (const message of messages) {
      if (message.sender_id === user.id || !convIdsRef.current.has(message.conversation_id)) continue;
      const readAt = lastRead[message.conversation_id] ? new Date(lastRead[message.conversation_id]).getTime() : 0;
      if (new Date(message.created_date).getTime() > readAt) {
        counts[message.conversation_id] = (counts[message.conversation_id] || 0) + 1;
      }
    }
    setUnread(counts);
  }, [user]);

  const markRead = useCallback((conversationId) => {
    if (!user || !conversationId) return;
    setUnread((prev) => {
      if (!prev[conversationId]) return prev;
      const next = { ...prev };
      delete next[conversationId];
      return next;
    });
    try {
      const raw = localStorage.getItem(readKey(user.id));
      const obj = raw ? JSON.parse(raw) : {};
      obj[conversationId] = new Date().toISOString();
      localStorage.setItem(readKey(user.id), JSON.stringify(obj));
    } catch {}
  }, [user]);

  // Initial load: resolve membership + compute unread from stored last-read times.
  useEffect(() => {
    if (!user) {
      setUnread({});
      convIdsRef.current = new Set();
      convMapRef.current = {};
      return;
    }
    let active = true;
    (async () => {
      try {
        const all = await base44.entities.Conversation.list("-updated_date", 200);
        if (!active) return;
        const mine = all.filter((c) => (c.members || []).some((m) => m.user_id === user.id));
        convIdsRef.current = new Set(mine.map((c) => c.id));
        convMapRef.current = Object.fromEntries(mine.map((c) => [c.id, c]));

        const rawRead = localStorage.getItem(readKey(user.id));
        const lastRead = rawRead ? JSON.parse(rawRead) : {};
        const firstRun = Object.keys(lastRead).length === 0;
        if (firstRun) {
          const seed = {};
          mine.forEach((c) => { seed[c.id] = new Date().toISOString(); });
          localStorage.setItem(readKey(user.id), JSON.stringify(seed));
          setUnread({});
          return;
        }
        const minRead = Object.values(lastRead).reduce(
          (m, v) => Math.min(m, new Date(v).getTime()),
          Date.now()
        );
        const recent = await base44.entities.Message.filter(
          { created_date: { $gt: new Date(minRead).toISOString() } },
          "-created_date",
          500
        );
        if (!active) return;
        const counts = {};
        for (const m of recent) {
          if (m.sender_id === user.id) continue;
          if (!convIdsRef.current.has(m.conversation_id)) continue;
          const lr = lastRead[m.conversation_id] ? new Date(lastRead[m.conversation_id]).getTime() : 0;
          if (new Date(m.created_date).getTime() > lr) {
            counts[m.conversation_id] = (counts[m.conversation_id] || 0) + 1;
          }
        }
        setUnread(counts);
      } catch {
        // offline count is best-effort; live notifications still work
      }
    })();
    return () => { active = false; };
  }, [user]);

  useEffect(() => {
    if (!user) return undefined;
    const refresh = () => refreshUnread().catch(() => {});
    const timer = window.setInterval(refresh, 3000);
    return () => window.clearInterval(timer);
  }, [user, refreshUnread]);

  // Realtime subscription for live incoming messages.
  useEffect(() => {
    if (!user) return;
    const unsubscribe = base44.entities.Message.subscribe((event) => {
      const ev = event.data;
      if (!ev || !ev.conversation_id || ev.sender_id === user.id) return;
      if ((user?.blocked_users || []).includes(ev.sender_id)) return;
      if (!convIdsRef.current.has(ev.conversation_id)) return;
      const onChats = locationRef.current === "/chats";
      const isActive = onChats && activeConvRef.current === ev.conversation_id;
      if (!isActive) {
        setUnread((prev) => ({ ...prev, [ev.conversation_id]: (prev[ev.conversation_id] || 0) + 1 }));
      }
      if (!onChats) {
        setNotification({
          key: Date.now() + Math.random(),
          conversationId: ev.conversation_id,
          senderName: ev.sender_name || "New message",
          text: ev.text || "",
        });
      }
    });
    return unsubscribe;
  }, [user]);

  const totalUnread = Object.values(unread).reduce((a, b) => a + b, 0);

  return (
    <ChatNotificationsContext.Provider value={{ unread, totalUnread, markRead, setActiveConversation }}>
      {children}
      <MessageBanner
        notification={notification}
        onOpen={() => { setNotification(null); navigate("/chats"); }}
        onDismiss={() => setNotification(null)}
      />
    </ChatNotificationsContext.Provider>
  );
}

function MessageBanner({ notification, onOpen, onDismiss }) {
  useEffect(() => {
    if (!notification) return;
    const t = setTimeout(onDismiss, 5000);
    return () => clearTimeout(t);
  }, [notification, onDismiss]);
  if (!notification) return null;
  return (
    <div className="fixed left-1/2 -translate-x-1/2 bottom-[calc(5.75rem+env(safe-area-inset-bottom))] z-40 w-[calc(100%-2rem)] max-w-md">
      <div
        onClick={onOpen}
        className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl bg-lime-400 text-slate-900 shadow-2xl shadow-lime-500/30 cursor-pointer"
      >
        <div className="w-9 h-9 shrink-0 rounded-full bg-slate-900/10 flex items-center justify-center">
          <MessageCircle className="w-5 h-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold truncate">{notification.senderName}</div>
          <div className="text-xs text-slate-800/80 truncate">{notification.text}</div>
        </div>
        <button
          onClick={(e) => { e.stopPropagation(); onDismiss(); }}
          className="shrink-0 p-1 rounded-full hover:bg-slate-900/10"
          aria-label="Dismiss"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

export const useChatNotifications = () => useContext(ChatNotificationsContext);