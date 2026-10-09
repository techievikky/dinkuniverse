import React, { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { useToast } from "@/components/ui/use-toast";
import { Loader2, Building2, MapPin, Check, Clock, Plus, X, BadgeCheck } from "lucide-react";

export default function Clubs() {
  const { user, checkUserAuth } = useAuth();
  const { toast } = useToast();
  const [clubs, setClubs] = useState([]);
  const [mine, setMine] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const [allClubs, allM] = await Promise.all([
        base44.entities.Club.list("-created_date", 200),
        base44.entities.ClubMembership.list("-created_date", 500),
      ]);
      setClubs(allClubs);
      const my = allM.filter((m) => m.created_by_id === user?.id);
      setMine(my);

      // sync home_club from approved memberships so the availability board + chat stay consistent
      const approvedName = my.find((m) => m.status === "approved")?.club_name;
      if (approvedName && user && user.home_club !== approvedName) {
        try {
          await base44.auth.updateMe({ home_club: approvedName });
          const existing = await base44.entities.Player.filter({ user_id: user.id });
          if (existing.length) await base44.entities.Player.update(existing[0].id, { home_club: approvedName });
          checkUserAuth?.();
        } catch { /* best-effort */ }
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const statusFor = (clubId) => mine.find((m) => m.club_id === clubId);

  const requestJoin = async (club) => {
    if (statusFor(club.id)) return;
    setBusy(club.id);
    try {
      await base44.entities.ClubMembership.create({
        club_id: club.id,
        club_name: club.name,
        user_name: user?.full_name || user?.email || "Player",
        status: "pending",
      });
      toast({ title: "Request sent — waiting for approval" });
      load();
    } catch (err) {
      toast({ title: "Could not request", description: err.message, variant: "destructive" });
    } finally {
      setBusy(null);
    }
  };

  const cancelRequest = async (m) => {
    setBusy(m.id);
    try {
      await base44.entities.ClubMembership.delete(m.id);
      toast({ title: "Request cancelled" });
      load();
    } finally {
      setBusy(null);
    }
  };

  const approved = mine.filter((m) => m.status === "approved");
  const pending = mine.filter((m) => m.status === "pending");

  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="font-display text-2xl sm:text-3xl font-bold text-white tracking-tight">Pickleball clubs</h1>
      <p className="text-slate-400 text-sm mt-1 mb-6">Request to join a club. Once the club owner approves, it shows on your profile.</p>

      {(approved.length > 0 || pending.length > 0) && (
        <div className="rounded-2xl border border-white/5 bg-white/[0.03] p-4 mb-6">
          <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">Your memberships</h2>
          <div className="flex flex-wrap gap-2">
            {approved.map((m) => (
              <span key={m.id} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-lime-400/15 text-lime-300 text-sm font-medium">
                <BadgeCheck className="w-3.5 h-3.5" /> {m.club_name}
              </span>
            ))}
            {pending.map((m) => (
              <span key={m.id} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-amber-400/10 text-amber-300 text-sm font-medium">
                <Clock className="w-3.5 h-3.5" /> {m.club_name} · pending
                <button onClick={() => cancelRequest(m)} disabled={busy === m.id} className="ml-1 hover:text-amber-100">
                  <X className="w-3.5 h-3.5" />
                </button>
              </span>
            ))}
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-slate-500" /></div>
      ) : clubs.length === 0 ? (
        <div className="text-center py-16 rounded-2xl border border-dashed border-white/10">
          <Building2 className="w-7 h-7 mx-auto text-slate-600 mb-2" />
          <p className="text-slate-400 text-sm">No clubs have been created yet. Ask a club owner to set one up.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {clubs.map((c) => {
            const st = statusFor(c.id);
            const owned = c.created_by_id === user?.id;
            return (
              <div key={c.id} className="rounded-2xl border border-white/5 bg-white/[0.03] p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3 min-w-0">
                    <div className="w-11 h-11 shrink-0 rounded-2xl bg-gradient-to-br from-sky-400 to-indigo-500 text-slate-900 flex items-center justify-center">
                      <Building2 className="w-5 h-5" />
                    </div>
                    <div className="min-w-0">
                      <h3 className="font-display font-semibold text-white truncate">{c.name}</h3>
                      <p className="text-[11px] text-slate-500 mt-0.5 font-mono truncate">ID: {c.id}</p>
                      {c.location && (
                        <div className="flex items-center gap-1.5 text-sm text-slate-400 mt-0.5">
                          <MapPin className="w-3.5 h-3.5" /> <span className="truncate">{c.location}</span>
                        </div>
                      )}
                      {c.description && <p className="text-sm text-slate-400 mt-2 line-clamp-2">{c.description}</p>}
                      {Array.isArray(c.courts) && c.courts.length > 0 && (
                        <div className="mt-3 flex flex-wrap items-center gap-1.5">
                          {c.courts.map((ct, i) => (
                            <span
                              key={i}
                              className={`text-[11px] px-2 py-1 rounded-full border font-medium ${
                                ct.blocked || ct.disabled
                                  ? "bg-rose-500/10 border-rose-500/20 text-rose-300/70 line-through"
                                  : "bg-lime-400/10 border-lime-400/20 text-lime-200"
                              }`}
                            >
                              Court {ct.number}
                            </span>
                          ))}
                          <span className="text-[11px] px-2 py-1 rounded-full text-slate-400 ml-auto">
                            {c.courts.filter((x) => !x.blocked && !x.disabled).length} available
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="shrink-0">
                    {owned ? (
                      <span className="text-xs px-3 py-1.5 rounded-lg bg-white/5 text-slate-300">Your club</span>
                    ) : st?.status === "approved" ? (
                      <span className="inline-flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg bg-lime-400/15 text-lime-300 font-medium">
                        <Check className="w-3.5 h-3.5" /> Member
                      </span>
                    ) : st?.status === "pending" ? (
                      <span className="inline-flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg bg-amber-400/10 text-amber-300 font-medium">
                        <Clock className="w-3.5 h-3.5" /> Pending
                      </span>
                    ) : st?.status === "rejected" ? (
                      <button onClick={() => requestJoin(c)} disabled={busy === c.id} className="inline-flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg border border-white/10 hover:bg-white/5 text-slate-300 transition disabled:opacity-60">
                        <Plus className="w-3.5 h-3.5" /> Request again
                      </button>
                    ) : (
                      <button onClick={() => requestJoin(c)} disabled={busy === c.id} className="inline-flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg bg-lime-400 hover:bg-lime-300 text-slate-900 font-semibold transition disabled:opacity-60">
                        {busy === c.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <><Plus className="w-3.5 h-3.5" /> Request to join</>}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}