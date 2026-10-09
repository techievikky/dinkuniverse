import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { Loader2, Search, X, Send } from "lucide-react";
import UserAvatar from "@/components/UserAvatar";

export default function PlayInviteDialog({ open, onClose, play, invites = [], onDone }) {
  const { user } = useAuth();
  const [players, setPlayers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState([]);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setSelected([]);
    setQuery("");
    (async () => {
      try {
        const list = await base44.entities.Player.list("-name", 500);
        const joinedIds = new Set((play?.players || []).map((p) => p.user_id));
        const invitedIds = new Set(invites.map((inv) => inv.invitee_id));
        setPlayers(list.filter((p) => p.user_id !== user?.id && !joinedIds.has(p.user_id) && !invitedIds.has(p.user_id)));
      } finally {
        setLoading(false);
      }
    })();
  }, [open, play, invites, user?.id]);

  const filtered = players.filter((p) => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return (p.name || "").toLowerCase().includes(q) || (p.email || "").toLowerCase().includes(q);
  });

  const toggle = (p) =>
    setSelected((prev) =>
      prev.find((x) => x.user_id === p.user_id)
        ? prev.filter((x) => x.user_id !== p.user_id)
        : [...prev, p]
    );

  if (!open) return null;

  const submit = async () => {
    if (!selected.length) return;
    setSending(true);
    try {
      await onDone(selected);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-0 sm:p-4">
      <div className="w-full sm:max-w-md max-h-[90vh] flex flex-col bg-[#0b1220] border border-white/10 sm:rounded-2xl rounded-t-2xl">
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/5">
          <h3 className="font-display font-semibold text-white">Invite players</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-4 py-3 border-b border-white/5">
          <div className="flex items-center gap-2 bg-white/5 rounded-xl px-3 py-2.5">
            <Search className="w-4 h-4 text-slate-500" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search players by name or email"
              className="flex-1 bg-transparent text-sm text-white placeholder:text-slate-500 focus:outline-none"
            />
          </div>
        </div>

        {selected.length > 0 && (
          <div className="px-4 py-2.5 border-b border-white/5 flex flex-wrap gap-1.5">
            {selected.map((p) => (
              <span key={p.user_id} className="inline-flex items-center gap-1 text-xs bg-lime-400/15 text-lime-300 rounded-full pl-2.5 pr-1 py-1">
                {p.name}
                <button onClick={() => toggle(p)} className="w-4 h-4 rounded-full hover:bg-lime-400/20 flex items-center justify-center">
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))}
          </div>
        )}

        <div className="flex-1 overflow-y-auto px-2 py-2">
          {loading ? (
            <div className="flex justify-center py-10">
              <Loader2 className="w-5 h-5 animate-spin text-slate-500" />
            </div>
          ) : filtered.length === 0 ? (
            <p className="text-center text-sm text-slate-500 py-10">No players found.</p>
          ) : (
            filtered.map((p) => {
              const isSel = selected.find((x) => x.user_id === p.user_id);
              return (
                <button
                  key={p.id}
                  onClick={() => toggle(p)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition text-left ${isSel ? "bg-lime-400/10" : "hover:bg-white/5"}`}
                >
                  <UserAvatar name={p.name} photo_url={p.photo_url} size="md" />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm text-white truncate">{p.name}</div>
                    <div className="text-xs text-slate-500 truncate">{p.email}</div>
                  </div>
                  {isSel && (
                    <div className="w-5 h-5 rounded-full bg-lime-400 text-slate-900 flex items-center justify-center text-[11px] font-bold">✓</div>
                  )}
                </button>
              );
            })
          )}
        </div>

        <div className="p-4 border-t border-white/5">
          <button
            onClick={submit}
            disabled={selected.length === 0 || sending}
            className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-lime-400 hover:bg-lime-300 disabled:opacity-50 text-slate-900 font-semibold text-sm transition"
          >
            {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : (
              <><Send className="w-4 h-4" /> Send invite{selected.length > 1 ? `s (${selected.length})` : ""}</>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}