import React, { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { useToast } from "@/components/ui/use-toast";
import { Loader2, UserCheck, UserX, Trash2, Clock, Users, Inbox, BadgeCheck } from "lucide-react";

export default function MembersPanel({ clubs }) {
  const { toast } = useToast();
  const [memberships, setMemberships] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);

  const clubIds = new Set(clubs.map((c) => c.id));

  const load = async () => {
    setLoading(true);
    try {
      const all = await base44.entities.ClubMembership.list("-created_date", 500);
      setMemberships(all.filter((m) => clubIds.has(m.club_id)));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (clubs.length) load();
    else setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clubs.length]);

  const act = async (m, action, member_type) => {
    setBusyId(m.id);
    try {
      if (action === "approve") {
        await base44.entities.ClubMembership.update(m.id, { status: "approved", member_type });
        toast({ title: `${m.user_name || "Player"} approved as ${member_type === "non_member" ? "non-member" : "member"} ✓` });
      } else if (action === "reject") {
        await base44.entities.ClubMembership.update(m.id, { status: "rejected" });
      } else if (action === "remove") {
        await base44.entities.ClubMembership.delete(m.id);
      }
      load();
    } catch (err) {
      toast({ title: "Action failed", description: err.message, variant: "destructive" });
    } finally {
      setBusyId(null);
    }
  };

  const pending = memberships.filter((m) => m.status === "pending");
  const approved = memberships.filter((m) => m.status === "approved");

  if (loading) {
    return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-slate-500" /></div>;
  }

  const Row = ({ m }) => (
    <div className="flex items-center justify-between gap-3 py-3 border-b border-white/5 last:border-0">
      <div className="min-w-0">
        <div className="text-white font-medium truncate">{m.user_name || "Unknown player"}</div>
        <div className="text-[11px] text-slate-500 truncate">{m.club_name}</div>
      </div>
      <div className="flex items-center gap-1.5 shrink-0">
        {m.status === "pending" ? (
          <>
            <button onClick={() => act(m, "approve", "member")} disabled={busyId === m.id} className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-lime-400 hover:bg-lime-300 text-slate-900 text-xs font-semibold transition disabled:opacity-60">
              <UserCheck className="w-3.5 h-3.5" /> Member
            </button>
            <button onClick={() => act(m, "approve", "non_member")} disabled={busyId === m.id} className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-sky-400/15 hover:bg-sky-400/25 border border-sky-400/30 text-sky-200 text-xs font-semibold transition disabled:opacity-60">
              <UserCheck className="w-3.5 h-3.5" /> Non-member
            </button>
            <button onClick={() => act(m, "reject")} disabled={busyId === m.id} className="w-8 h-8 rounded-lg border border-white/10 hover:bg-rose-500/15 hover:text-rose-300 text-slate-300 flex items-center justify-center transition disabled:opacity-60">
              <UserX className="w-4 h-4" />
            </button>
          </>
        ) : (
          <div className="flex items-center gap-2">
            {m.member_type && (
              <span className={`inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded-full font-medium ${m.member_type === "non_member" ? "bg-sky-400/15 text-sky-200" : "bg-lime-400/15 text-lime-300"}`}>
                <BadgeCheck className="w-3 h-3" /> {m.member_type === "non_member" ? "Non-member" : "Member"}
              </span>
            )}
            <button onClick={() => act(m, "remove")} disabled={busyId === m.id} title="Remove member" className="w-8 h-8 rounded-lg border border-white/10 hover:bg-rose-500/15 hover:text-rose-300 text-slate-300 flex items-center justify-center transition disabled:opacity-60">
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-white/5 bg-white/[0.03] p-5">
        <div className="flex items-center gap-2 mb-3">
          <Clock className="w-4 h-4 text-amber-400" />
          <h3 className="font-semibold text-white">Pending requests</h3>
          <span className="ml-auto text-xs text-slate-400">{pending.length}</span>
        </div>
        {pending.length === 0 ? (
          <div className="flex items-center gap-2 text-slate-500 text-sm py-2">
            <Inbox className="w-4 h-4" /> No pending requests
          </div>
        ) : (
          <div>{pending.map((m) => <Row key={m.id} m={m} />)}</div>
        )}
      </div>

      <div className="rounded-2xl border border-white/5 bg-white/[0.03] p-5">
        <div className="flex items-center gap-2 mb-3">
          <Users className="w-4 h-4 text-lime-400" />
          <h3 className="font-semibold text-white">Members</h3>
          <span className="ml-auto text-xs text-slate-400">{approved.length}</span>
        </div>
        {approved.length === 0 ? (
          <p className="text-slate-500 text-sm py-2">No approved members yet.</p>
        ) : (
          <div>{approved.map((m) => <Row key={m.id} m={m} />)}</div>
        )}
      </div>
    </div>
  );
}