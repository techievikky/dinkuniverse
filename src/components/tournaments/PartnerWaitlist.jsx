import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useToast } from "@/components/ui/use-toast";
import { categoryLabel } from "@/components/tournaments/divisions";
import { loadMyConversations, ensureDirectConversation, sendChatMessage } from "@/lib/chat";
import { Users, Send, Loader2 } from "lucide-react";

// Consolidated "partner waitlist" for a tournament: every entrant who signed up
// without a partner. Other players can nudge them with a pre-filled partnership
// request that opens (or creates) a 1:1 chat.
export default function PartnerWaitlist({ tournament, entries, user, myName }) {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [nudging, setNudging] = useState(null);

  const waitlist = (entries || []).filter((e) => e.needs_partner);
  if (waitlist.length === 0) return null;

  const nudge = async (entry) => {
    if (!entry.user_id) {
      toast({ title: "No contact available for this player" });
      return;
    }
    setNudging(entry.user_id);
    try {
      const myConvs = await loadMyConversations(user.id);
      const target = { user_id: entry.user_id, name: entry.name, photo_url: "" };
      const conv = await ensureDirectConversation(myConvs, user, target);
      const first = (entry.name || "there").split(" ")[0];
      const div = entry.category ? ` (${categoryLabel(entry.category)})` : "";
      const text = `Hi ${first}! I saw you're looking for a partner for "${tournament.name}"${div}. I'd love to team up — let me know if you're interested!`;
      await sendChatMessage(user, conv, text);
      navigate(`/chats?c=${conv.id}`);
    } catch (e) {
      toast({ title: "Could not send nudge", description: e.message, variant: "destructive" });
    } finally {
      setNudging(null);
    }
  };

  return (
    <div className="mt-4 rounded-2xl border border-amber-500/20 bg-amber-500/[0.05] p-3">
      <div className="flex items-center gap-1.5 mb-1">
        <Users className="w-3.5 h-3.5 text-amber-300" />
        <span className="text-xs font-semibold text-amber-300 uppercase tracking-wide">Partner waitlist</span>
        <span className="text-[11px] text-slate-500">· {waitlist.length} looking</span>
      </div>
      <p className="text-[11px] text-slate-400 mb-2">
        These players signed up without a partner — nudge someone to team up.
      </p>
      <div className="space-y-1.5">
        {waitlist.map((e, i) => {
          const mine = e.user_id === user?.id;
          return (
            <div key={i} className="flex items-center justify-between gap-2 rounded-lg bg-white/[0.03] px-2.5 py-1.5">
              <div className="min-w-0">
                <div className="text-sm text-slate-200 truncate">
                  {e.name}{mine ? " (you)" : ""}
                </div>
                <div className="text-[11px] text-slate-500 truncate">
                  {categoryLabel(e.category)} · DUPR {e.dupr_min ?? 0}–{e.dupr_max ?? 8}
                </div>
              </div>
              {mine ? (
                <span className="shrink-0 text-[11px] text-slate-500">waiting</span>
              ) : e.user_id ? (
                <button
                  onClick={() => nudge(e)}
                  disabled={nudging === e.user_id}
                  className="shrink-0 inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-amber-400/15 hover:bg-amber-400/25 text-amber-200 text-xs font-medium disabled:opacity-50"
                >
                  {nudging === e.user_id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                  Nudge
                </button>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}