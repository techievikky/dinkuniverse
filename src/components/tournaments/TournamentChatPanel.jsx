import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { useToast } from "@/components/ui/use-toast";
import { Link } from "react-router-dom";
import { MessageCircle, Plus, UserPlus, Loader2 } from "lucide-react";

// Lets a tournament organizer manage the group chat linked to their tournament:
// create it, open it, and backfill all registered players as members.
export default function TournamentChatPanel({ tournament, onUpdated }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [conv, setConv] = useState(null);
  const [busy, setBusy] = useState(false);
  const [loadingConv, setLoadingConv] = useState(false);

  const conversationId = tournament?.conversation_id;

  useEffect(() => {
    if (!conversationId) { setConv(null); return; }
    setLoadingConv(true);
    (async () => {
      try { setConv(await base44.entities.Conversation.get(conversationId)); } catch {}
      finally { setLoadingConv(false); }
    })();
  }, [conversationId]);

  const createChat = async () => {
    setBusy(true);
    try {
      const c = await base44.entities.Conversation.create({
        name: tournament.name,
        is_group: true,
        members: [{ user_id: user.id, name: user.full_name || user.email }],
        last_message: "",
      });
      await base44.entities.Tournament.update(tournament.id, { conversation_id: c.id });
      setConv(c);
      await onUpdated?.();
      toast({ title: "Tournament chat created ✓" });
    } catch (e) {
      toast({ title: "Could not create chat", description: e.message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const addAllPlayers = async () => {
    if (!conv) return;
    setBusy(true);
    try {
      const members = conv.members || [];
      const next = [...members];
      let added = 0;
      for (const e of tournament.entries || []) {
        if (e.user_id && !next.some((m) => m.user_id === e.user_id)) {
          next.push({ user_id: e.user_id, name: e.name });
          added++;
        }
      }
      if (added) {
        await base44.entities.Conversation.update(conv.id, { members: next });
        setConv({ ...conv, members: next });
      }
      toast({
        title: added
          ? `Added ${added} player${added !== 1 ? "s" : ""} to the chat`
          : "All registered players are already in the chat",
      });
    } catch (e) {
      toast({ title: "Could not add players", description: e.message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-2xl border border-lime-400/20 bg-lime-400/[0.04] p-4">
      <div className="flex items-center gap-2 mb-1">
        <MessageCircle className="w-4 h-4 text-lime-300" />
        <h3 className="font-display font-semibold text-white">Tournament chat</h3>
        {conv && (
          <span className="text-xs text-slate-400">{conv.members?.length ?? 0} members</span>
        )}
      </div>

      {!conversationId ? (
        <p className="text-sm text-slate-400 mt-1 mb-3">
          Create a group chat so registered players can ask questions and you can share updates.
        </p>
      ) : (
        <p className="text-sm text-slate-400 mt-1 mb-3">
          Registered players are added automatically. Use “Add all” to backfill anyone who registered before the chat existed.
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        {!conversationId ? (
          <button
            onClick={createChat}
            disabled={busy}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-lime-400 hover:bg-lime-300 disabled:opacity-60 text-slate-900 text-sm font-semibold transition"
          >
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            Create group chat
          </button>
        ) : (
          <>
            <Link
              to={`/chats?c=${conversationId}`}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-slate-100 text-sm font-semibold border border-white/10 transition"
            >
              <MessageCircle className="w-4 h-4" /> Open chat
            </Link>
            <button
              onClick={addAllPlayers}
              disabled={busy || loadingConv}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white/5 hover:bg-white/10 disabled:opacity-60 text-slate-100 text-sm font-semibold border border-white/10 transition"
            >
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
              Add all registered players
            </button>
          </>
        )}
      </div>
    </div>
  );
}