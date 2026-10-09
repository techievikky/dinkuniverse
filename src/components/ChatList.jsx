import React from "react";
import { Users, Search, MessageSquarePlus } from "lucide-react";
import UserAvatar from "@/components/UserAvatar";

export default function ChatList({ conversations, activeId, onSelect, onNew, user, isBlockedByMe }) {
  const sorted = [...conversations].sort(
    (a, b) => new Date(b.last_message_at || b.created_date || 0) - new Date(a.last_message_at || a.created_date || 0)
  );

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/5">
        <h2 className="font-display font-semibold text-white flex items-center gap-2">
          <Users className="w-4 h-4 text-lime-400" /> Chats
        </h2>
        <button
          onClick={onNew}
          className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-lime-400 hover:bg-lime-300 text-slate-900 font-semibold transition"
        >
          <MessageSquarePlus className="w-3.5 h-3.5" /> New
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {sorted.length === 0 ? (
          <div className="text-center py-12 px-4">
            <Search className="w-6 h-6 mx-auto text-slate-600 mb-2" />
            <p className="text-sm text-slate-500">No chats yet. Tap New to start one.</p>
          </div>
        ) : (
          sorted.map((c) => (
            <button
              key={c.id}
              onClick={() => onSelect(c.id)}
              className={`w-full text-left px-4 py-3 flex items-center gap-3 border-b border-white/5 transition ${
                c.id === activeId ? "bg-lime-400/10" : "hover:bg-white/5"
              }`}
            >
              {c.is_group ? (
                c.group_photo_url ? <img src={c.group_photo_url} alt={c.name || "Group"} className="w-10 h-10 shrink-0 rounded-full object-cover" /> : (
                  <div className="w-10 h-10 shrink-0 rounded-full flex items-center justify-center text-sm font-bold bg-gradient-to-br from-sky-400 to-indigo-500 text-slate-900">
                    <Users className="w-5 h-5" />
                  </div>
                )
              ) : (
                (() => {
                  const other = (c.members || []).find((m) => m.user_id !== user?.id);
                  return <UserAvatar name={c.name || other?.name} photo_url={other?.photo_url} size="md" />;
                })()
              )}
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium text-white truncate">{c.name}</span>
                  {c.last_message_at && (
                    <span className="text-[11px] text-slate-500 shrink-0">
                      {fmtTime(c.last_message_at)}
                    </span>
                  )}
                </div>
                <div className="text-xs text-slate-400 truncate flex items-center gap-1.5">
                  {isBlockedByMe?.(c) ? (
                    <span className="text-rose-400 font-medium">Blocked</span>
                  ) : (c.last_message ? c.last_message : "No messages yet")}
                </div>
              </div>
            </button>
          ))
        )}
      </div>
    </div>
  );
}

function fmtTime(iso) {
  const d = new Date(iso);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) {
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}