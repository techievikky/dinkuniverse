import React, { useState, useEffect, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { Loader2, Search, X, Users, MessageSquare, Camera } from "lucide-react";
import UserAvatar from "@/components/UserAvatar";

export default function NewChatDialog({ open, onClose, onCreated, blockedUsers }) {
  const { user } = useAuth();
  const [players, setPlayers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState([]);
  const [groupName, setGroupName] = useState("");
  const [groupPhotoUrl, setGroupPhotoUrl] = useState("");
  const [creating, setCreating] = useState(false);
  const groupPhotoRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    loadPlayers();
  }, [open]);

  useEffect(() => {
    if (selected.length <= 1) {
      setGroupName("");
      setGroupPhotoUrl("");
    }
  }, [selected.length]);

  const onGroupPhoto = (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) return;
    if (file.size > 2 * 1024 * 1024) return;
    const reader = new FileReader();
    reader.onload = () => setGroupPhotoUrl(reader.result);
    reader.readAsDataURL(file);
  };

  const loadPlayers = async () => {
    try {
      const list = await base44.entities.Player.list("-name", 500);
      setPlayers(list.filter((p) => p.user_id !== user?.id));
    } finally {
      setLoading(false);
    }
  };

  const blocked = blockedUsers || [];
  const filtered = players.filter((p) => {
    if (blocked.includes(p.user_id)) return false;
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return (p.name || "").toLowerCase().includes(q) || (p.email || "").toLowerCase().includes(q);
  });

  const toggle = (p) => {
    setSelected((prev) => {
      const exists = prev.find((x) => x.user_id === p.user_id);
      if (exists) return prev.filter((x) => x.user_id !== p.user_id);
      return [...prev, p];
    });
  };

  const meMember = { user_id: user?.id, name: user?.full_name || user?.email, photo_url: user?.photo_url || "" };

  const create = async () => {
    if (selected.length === 0) return;
    setCreating(true);
    try {
      const isGroup = selected.length > 1;
      const members = [meMember, ...selected.map((p) => ({ user_id: p.user_id, name: p.name, photo_url: p.photo_url || "" }))];
      const name = isGroup ? (groupName.trim() || selected.map((p) => p.name.split(" ")[0]).join(", ")) : selected[0].name;
      const conv = await base44.entities.Conversation.create({
        name,
        is_group: isGroup,
        group_photo_url: isGroup ? groupPhotoUrl : "",
        members,
        last_message: "",
      });
      onCreated(conv);
    } finally {
      setCreating(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-0 sm:p-4">
      <div className="w-full sm:max-w-md max-h-[90vh] flex flex-col bg-[#0b1220] border border-white/10 sm:rounded-2xl rounded-t-2xl">
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/5">
          <h3 className="font-display font-semibold text-white">
            {selected.length > 1 ? "New group" : "New chat"}
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Search */}
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

        {/* Selected chips */}
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

        {/* Group name */}
        {selected.length > 1 && (
          <div className="px-4 py-2.5 border-b border-white/5 space-y-2.5">
            <input ref={groupPhotoRef} type="file" accept="image/*" onChange={onGroupPhoto} className="hidden" />
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => groupPhotoRef.current?.click()}
                className="relative w-11 h-11 shrink-0 rounded-full overflow-hidden border border-white/10 bg-gradient-to-br from-sky-400 to-indigo-500 text-slate-900 flex items-center justify-center"
                title="Choose group photo"
              >
                {groupPhotoUrl ? <img src={groupPhotoUrl} alt="Group" className="w-full h-full object-cover" /> : <Camera className="w-4 h-4" />}
              </button>
              <input
                value={groupName}
                onChange={(e) => setGroupName(e.target.value)}
                placeholder="Group name"
                className="flex-1 bg-white/5 rounded-xl px-3 py-2.5 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-lime-400/30"
              />
            </div>
            <p className="text-[11px] text-slate-500">Add a name and optional photo for this group.</p>
          </div>
        )}

        {/* Player list */}
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
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition text-left ${
                    isSel ? "bg-lime-400/10" : "hover:bg-white/5"
                  }`}
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

        {/* Footer */}
        <div className="p-4 border-t border-white/5">
          <button
            onClick={create}
            disabled={selected.length === 0 || creating}
            className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-lime-400 hover:bg-lime-300 disabled:opacity-50 text-slate-900 font-semibold text-sm transition"
          >
            {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : (
              selected.length > 1 ? <><Users className="w-4 h-4" /> Create group ({selected.length + 1})</> :
              <><MessageSquare className="w-4 h-4" /> Start chat</>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}