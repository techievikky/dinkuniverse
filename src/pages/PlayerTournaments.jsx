import React, { useEffect, useState, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { useToast } from "@/components/ui/use-toast";
import PullToRefresh from "@/components/PullToRefresh";
import { categoryLabel, formatLabel } from "@/components/tournaments/divisions";
import PartnerWaitlist from "@/components/tournaments/PartnerWaitlist";
import BracketView from "@/components/tournaments/BracketView";
import PlayerPlayMode from "@/components/tournaments/PlayerPlayMode";
import TournamentLeaderboard from "@/components/tournaments/TournamentLeaderboard";
import { getUserLocation, geocode, haversine, formatDistance } from "@/lib/distance";
import { ensureMemberInConversation } from "@/lib/chat";
import { addToWaitlist, myWaitlistEntries, markJoined } from "@/lib/waitlist";
import { reportTournamentDiscrepancy } from "@/lib/discrepancy";
import ReportDiscrepancyDialog from "@/components/ReportDiscrepancyDialog";
import AddToCalendarButton from "@/components/AddToCalendarButton";
import {
  Loader2, Calendar, MapPin, Users, Layers, Trophy, CheckCircle2, DollarSign,
  UserPlus, X, Network, Clock,
} from "lucide-react";

const statusStyles = {
  open: "bg-sky-500/15 text-sky-300 border-sky-500/20",
  plays: "bg-lime-500/15 text-lime-300 border-lime-500/20",
  completed: "bg-emerald-500/15 text-emerald-300 border-emerald-500/20",
  cancelled: "bg-rose-500/15 text-rose-300 border-rose-500/20",
};

const divisionKey = (d) => `${d.category}|${d.dupr_min ?? 0}|${d.dupr_max ?? 8}`;

// A division is relevant to this player when the player's DUPR falls in its
// [dupr_min, dupr_max] range. Unrated players only qualify for fully open
// divisions (low floor, high ceiling); other divisions require a set DUPR.
const isEligible = (d, dupr) => {
  const min = d.dupr_min ?? 0;
  const max = d.dupr_max ?? 8;
  if (dupr == null || dupr === "") {
    return min <= 2 && max >= 8;
  }
  const v = Number(dupr);
  return v >= min && v <= max;
};

export default function PlayerTournaments() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [registering, setRegistering] = useState(null); // divisionKey being registered
  const [distances, setDistances] = useState({});
  const [locDenied, setLocDenied] = useState(false);
  const [partnerDraft, setPartnerDraft] = useState({}); // divisionKey -> partner name input
  const [savingPartner, setSavingPartner] = useState(null); // divisionKey being saved
  const [filters, setFilters] = useState({ name: "", city: "", zip: "", from: "", to: "" });
  const [brackets, setBrackets] = useState({}); // tournamentId -> matches[]
  const [myWaitlistKeys, setMyWaitlistKeys] = useState(new Set()); // "tournamentId|divisionKey"
  const [reportTarget, setReportTarget] = useState(null); // { tournament, match }
  const [showReport, setShowReport] = useState(false);

  const dupr = user?.dupr_score ?? null;

  const load = async () => {
    try {
      const list = await base44.entities.Tournament.list("-date", 100);
      setItems(list);
      if (user?.id) {
        try {
          const wl = await myWaitlistEntries(user.id);
          setMyWaitlistKeys(new Set(wl.filter((w) => w.event_type === "tournament").map((w) => `${w.event_id}|${w.division}`)));
        } catch { /* best-effort */ }
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  // Stripe redirects back here after checkout; the actual registration is
  // finalized by the webhook, so just surface the result and refresh.
  useEffect(() => {
    const payment = searchParams.get("payment");
    if (!payment) return;
    if (payment === "success") {
      toast({ title: "Payment received \u2713", description: "Finalizing your registration\u2026" });
      load();
    } else if (payment === "cancelled") {
      toast({ title: "Checkout cancelled", description: "No charge was made." });
    }
    const next = new URLSearchParams(searchParams);
    next.delete("payment");
    next.delete("session_id");
    setSearchParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  // Distance labels (best-effort, same approach as the plays feed).
  useEffect(() => {
    let active = true;
    (async () => {
      if (!items.length) return;
      const u = await getUserLocation().catch(() => null);
      if (!u) { setLocDenied(true); return; }
      setLocDenied(false);
      const map = {};
      for (const t of items) {
        if (!active) return;
        if (!t.location?.trim()) continue;
        const coords = await geocode(t.location);
        await new Promise((r) => setTimeout(r, 1100));
        if (!coords) continue;
        const mi = haversine(u.lat, u.lng, coords.lat, coords.lon, "mi");
        map[t.id] = formatDistance(mi);
      }
      if (active) setDistances(map);
    })();
    return () => { active = false; };
  }, [items]);

  // Only upcoming, non-cancelled tournaments that are open for registration.
  const today = new Date().toISOString().slice(0, 10);
  const visible = useMemo(
    () =>
      items.filter(
        (t) =>
          t.status !== "cancelled" &&
          t.registration_open !== false &&
          t.date >= today
      ),
    [items, today]
  );

  // Client-side filters: name matches the tournament name; city/zip match
  // against the location text (which typically includes city and postcode);
  // from/to bound the tournament date.
  const filtered = useMemo(() => {
    const q = filters;
    return visible.filter((t) => {
      if (q.name && !(t.name || "").toLowerCase().includes(q.name.toLowerCase())) return false;
      const loc = (t.location || "").toLowerCase();
      if (q.city && !loc.includes(q.city.toLowerCase())) return false;
      if (q.zip && !loc.includes(q.zip.toLowerCase())) return false;
      if (q.from && (t.date || "") < q.from) return false;
      if (q.to && (t.date || "") > q.to) return false;
      return true;
    });
  }, [visible, filters]);

  const hasFilters = !!(filters.name || filters.city || filters.zip || filters.from || filters.to);

  // Load brackets (matches) for tournaments that are in play or completed so
  // players can follow which teams advanced to the semifinals and finals.
  useEffect(() => {
    let active = true;
    (async () => {
      const ids = visible
        .filter((t) => t.status === "plays" || t.status === "completed")
        .map((t) => t.id);
      if (!ids.length) return;
      try {
        const results = await Promise.all(
          ids.map((id) =>
            base44.entities.Match.filter({ tournament_id: id }, "round", 500).then((ms) => [id, ms])
          )
        );
        if (!active) return;
        const map = {};
        for (const [id, ms] of results) map[id] = ms;
        setBrackets(map);
      } catch {
        /* brackets are best-effort */
      }
    })();
    return () => { active = false; };
  }, [visible]);

  const myName = user?.full_name || user?.email || "Player";

  const submitTournamentReport = async (reason) => {
    try {
      await reportTournamentDiscrepancy({ tournament: reportTarget.tournament, match: reportTarget.match, user, userName: myName, reason });
      setShowReport(false);
      setReportTarget(null);
      toast({ title: "Report sent ✓", description: "The tournament organizer has been notified to review the score." });
    } catch (err) {
      toast({ title: "Could not send report", description: err.message, variant: "destructive" });
    }
  };

  const register = async (t, d, partnerVal) => {
    const k = divisionKey(d);
    setRegistering(k);
    try {
      const isDoubles = d.category !== "singles";
      const partner_name = isDoubles ? (partnerVal || "").trim() : "";
      const entry = {
        name: isDoubles && partner_name ? `${myName} & ${partner_name}` : myName,
        user_id: user?.id,
        category: d.category,
        dupr_min: d.dupr_min,
        dupr_max: d.dupr_max,
        ...(isDoubles ? { partner_name, needs_partner: !partner_name } : {}),
      };
      // Avoid duplicate registration in the same division (by user id, fall back to name).
      const exists = (t.entries || []).some(
        (e) =>
          divisionKey(e) === k &&
          (e.user_id ? e.user_id === entry.user_id : e.name === entry.name)
      );
      if (exists) {
        toast({ title: "You're already registered for this division" });
        return;
      }
      const capacity = d.teams || 0;
      const filled = (t.entries || []).filter((e) => divisionKey(e) === k).length;
      if (capacity > 0 && filled >= capacity) {
        const res = await addToWaitlist({ event_type: "tournament", event_id: t.id, event_title: t.name, division: k, user, userName: myName });
        if (res.already) {
          toast({ title: "You're already on the waitlist" });
        } else {
          setMyWaitlistKeys((s) => new Set(s).add(`${t.id}|${k}`));
          toast({ title: "Added to waitlist ✓", description: "We'll message you if a spot opens up." });
        }
        return;
      }
      await base44.entities.Tournament.update(t.id, { entries: [...(t.entries || []), entry] });
      setItems((prev) =>
        prev.map((x) => (x.id === t.id ? { ...x, entries: [...(x.entries || []), entry] } : x))
      );
      await markJoined(t.id, k, user?.id);
      setMyWaitlistKeys((s) => {
        const n = new Set(s);
        n.delete(`${t.id}|${k}`);
        return n;
      });
      if (t.conversation_id) {
        await ensureMemberInConversation(t.conversation_id, { user_id: user?.id, name: myName });
      }
      toast({
        title: "Registered ✓",
        description:
          isDoubles && !partner_name
            ? "Marked as needing a partner — check the list below to find one."
            : `${categoryLabel(d.category)} · ${t.name}`,
      });
    } catch (e) {
      toast({ title: "Could not register", description: e.message, variant: "destructive" });
    } finally {
      setRegistering(null);
    }
  };

  // Update the partner on an existing registration (used after paid checkouts or to revise a free entry).
  const savePartner = async (t, k, val) => {
    const partner_name = (val || "").trim();
    setSavingPartner(k);
    try {
      const entries = (t.entries || []).map((e) =>
        divisionKey(e) === k && (e.user_id ? e.user_id === user?.id : e.name === myName)
          ? { ...e, partner_name, needs_partner: !partner_name }
          : e
      );
      await base44.entities.Tournament.update(t.id, { entries });
      setItems((prev) => prev.map((x) => (x.id === t.id ? { ...x, entries } : x)));
      toast({ title: "Partner saved ✓" });
    } catch (e) {
      toast({ title: "Could not save partner", description: e.message, variant: "destructive" });
    } finally {
      setSavingPartner(null);
    }
  };

  const payAndRegister = async (t, d) => {
    const k = divisionKey(d);
    setRegistering(k);
    try {
      const productId = `tournament:${t.id}::${d.category}|${d.dupr_min ?? 0}|${d.dupr_max ?? 8}`;
      const res = await base44.functions.invoke("create-checkout", { productId });
      const redirectUrl = res?.data?.redirectUrl;
      if (!redirectUrl) throw new Error("No checkout URL returned");
      window.location.href = redirectUrl;
    } catch (e) {
      toast({ title: "Could not start payment", description: e.message, variant: "destructive" });
      setRegistering(null);
    }
  };

  return (
    <PullToRefresh onRefresh={load}>
      <div>
        <div className="mb-6">
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-white tracking-tight">Tournaments</h1>
          <p className="text-slate-400 text-sm mt-1">
            {dupr != null
              ? `Showing divisions for your DUPR ${Number(dupr).toFixed(1)}.`
              : "Set your DUPR rating in Profile to match divisions."}
          </p>
        </div>

        {loading ? (
          <div className="flex justify-center py-16">
            <div className="w-6 h-6 border-4 border-white/10 border-t-lime-400 rounded-full animate-spin" />
          </div>
        ) : visible.length === 0 ? (
          <div className="text-center py-16 rounded-2xl border border-dashed border-white/10">
            <Trophy className="w-7 h-7 mx-auto text-slate-600 mb-2" />
            <p className="text-slate-400 text-sm">No upcoming tournaments open for registration.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {/* Filters */}
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                <input
                  className="bg-white/5 border border-white/10 rounded-lg px-2.5 py-2 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-lime-400/50"
                  placeholder="Search by name"
                  value={filters.name}
                  onChange={(e) => setFilters((s) => ({ ...s, name: e.target.value }))}
                />
                <input
                  className="bg-white/5 border border-white/10 rounded-lg px-2.5 py-2 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-lime-400/50"
                  placeholder="City"
                  value={filters.city}
                  onChange={(e) => setFilters((s) => ({ ...s, city: e.target.value }))}
                />
                <input
                  className="bg-white/5 border border-white/10 rounded-lg px-2.5 py-2 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-lime-400/50"
                  placeholder="Zip code"
                  value={filters.zip}
                  onChange={(e) => setFilters((s) => ({ ...s, zip: e.target.value }))}
                />
                <div className="flex flex-col">
                  <span className="text-[10px] text-slate-500 mb-0.5">From date</span>
                  <input
                    type="date"
                    className="bg-white/5 border border-white/10 rounded-lg px-2.5 py-1.5 text-sm text-white focus:outline-none focus:border-lime-400/50"
                    value={filters.from}
                    onChange={(e) => setFilters((s) => ({ ...s, from: e.target.value }))}
                  />
                </div>
                <div className="flex flex-col">
                  <span className="text-[10px] text-slate-500 mb-0.5">To date</span>
                  <input
                    type="date"
                    className="bg-white/5 border border-white/10 rounded-lg px-2.5 py-1.5 text-sm text-white focus:outline-none focus:border-lime-400/50"
                    value={filters.to}
                    onChange={(e) => setFilters((s) => ({ ...s, to: e.target.value }))}
                  />
                </div>
                {hasFilters && (
                  <button
                    onClick={() => setFilters({ name: "", city: "", zip: "", from: "", to: "" })}
                    className="self-end justify-self-start inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/15 text-slate-200 text-xs font-medium"
                  >
                    <X className="w-3.5 h-3.5" /> Clear
                  </button>
                )}
              </div>
            </div>

            {filtered.length === 0 ? (
              <div className="text-center py-12 rounded-2xl border border-dashed border-white/10">
                <Trophy className="w-7 h-7 mx-auto text-slate-600 mb-2" />
                <p className="text-slate-400 text-sm">No tournaments match your filters.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {filtered.map((t) => {
              const divisions = t.divisions || [];
              const eligible = divisions.filter((d) => isEligible(d, dupr));
              const eligibleKeys = new Set(eligible.map(divisionKey));
              const myEntries = (t.entries || []).filter(
                (e) => (e.user_id ? e.user_id === user?.id : e.name === myName)
              );
              const myTeamNames = new Set(myEntries.map((e) => e.name));
              const canReportMatch = (m) =>
                m.status === "completed" && (myTeamNames.has(m.team_a) || myTeamNames.has(m.team_b));
              const openMatchReport = (m) => {
                setReportTarget({ tournament: t, match: m });
                setShowReport(true);
              };
              const fee = Number(t.entry_fee ?? 0);

              return (
                <div key={t.id} className="paddle-card border border-lime-300 bg-white/[0.03] p-5 shadow-[0_0_18px_-4px_#d4ff3a]">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="font-display font-semibold text-white text-lg truncate">{t.name}</h3>
                      {t.location && (
                        <div className="mt-0.5 flex items-center gap-1.5 text-sm text-slate-400">
                          <MapPin className="w-3.5 h-3.5" /> <span className="truncate">{t.location}</span>
                          {distances[t.id] && (
                            <span className="shrink-0 text-lime-300 font-medium">· {distances[t.id]}</span>
                          )}
                        </div>
                      )}
                    </div>
                    <span className={`shrink-0 text-[11px] px-2.5 py-1 rounded-full border font-medium uppercase ${statusStyles[t.status] || statusStyles.open}`}>
                      {t.status || "open"}
                    </span>
                  </div>

                  <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-slate-300">
                    <span className="flex items-center gap-1.5"><Calendar className="w-4 h-4 text-slate-500" />{new Date(t.date).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", year: "numeric" })}</span>
                    {t.format && <span className="flex items-center gap-1.5"><Layers className="w-4 h-4 text-slate-500" />{formatLabel(t.format)}</span>}
                    {t.max_players != null && <span className="flex items-center gap-1.5"><Users className="w-4 h-4 text-slate-500" />Max {t.max_players}</span>}
                    {fee > 0 && <span className="flex items-center gap-1.5"><DollarSign className="w-4 h-4 text-lime-400" />${fee.toFixed(2)} entry</span>}
                  </div>

                  {/* Divisions relevant to this player's DUPR */}
                  <div className="mt-4">
                    <div className="flex items-center gap-1.5 mb-2">
                      <Trophy className="w-3.5 h-3.5 text-lime-300" />
                      <span className="text-xs font-semibold text-lime-300 uppercase tracking-wide">Divisions for your level</span>
                    </div>
                    {eligible.length === 0 ? (
                      <p className="text-sm text-slate-500">
                        {dupr == null
                          ? "No open divisions for unrated players — set your DUPR rating in Profile to unlock level-based divisions."
                          : `No divisions match DUPR ${Number(dupr).toFixed(1)} for this tournament.`}
                      </p>
                    ) : (
                      <div className="space-y-2">
                        {eligible.map((d) => {
                          const k = divisionKey(d);
                          const isDoubles = d.category !== "singles";
                          const myEntry = myEntries.find((e) => divisionKey(e) === k);
                          const registered = !!myEntry;
                          const filled = (t.entries || []).filter((e) => divisionKey(e) === k).length;
                          const capacity = d.teams || 0;
                          const full = capacity > 0 && filled >= capacity;
                          const onWL = myWaitlistKeys.has(`${t.id}|${k}`);
                          return (
                            <div key={k} className="rounded-xl bg-white/[0.03] border border-white/10 px-3 py-2.5">
                              <div className="flex items-center justify-between gap-2">
                                <div className="min-w-0">
                                  <div className="text-sm text-slate-100 truncate">
                                    {categoryLabel(d.category)} · DUPR {d.dupr_min ?? 0}–{d.dupr_max ?? 8}
                                  </div>
                                  <div className="text-[11px] text-slate-500 mt-0.5">
                                    {capacity > 0 ? `${filled}/${capacity} spots` : `${filled} entered`}{fee > 0 ? ` · $${fee.toFixed(2)}` : " · Free"}
                                  </div>
                                </div>
                                {registered ? (
                                  <span className="shrink-0 inline-flex items-center gap-1.5 text-xs font-semibold text-lime-300 px-3 py-2">
                                    <CheckCircle2 className="w-4 h-4" /> Registered
                                  </span>
                                ) : onWL ? (
                                  <span className="shrink-0 inline-flex items-center gap-1.5 text-xs font-semibold text-amber-300 px-3 py-2">
                                    <Clock className="w-4 h-4" /> On waitlist
                                  </span>
                                ) : (
                                  <button
                                    onClick={() => (full ? register(t, d, partnerDraft[k] || "") : fee > 0 ? payAndRegister(t, d) : register(t, d, partnerDraft[k] || ""))}
                                    disabled={registering === k}
                                    className={`shrink-0 inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg disabled:opacity-60 text-slate-900 text-xs font-semibold transition ${full ? "bg-amber-400 hover:bg-amber-300" : "bg-lime-400 hover:bg-lime-300"}`}
                                  >
                                    {registering === k ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : full ? "Join waitlist" : fee > 0 ? `Register · $${fee.toFixed(2)}` : "Register"}
                                  </button>
                                )}
                              </div>

                              {/* Doubles: nominate a partner before registering (free divisions) */}
                              {isDoubles && !registered && fee === 0 && (
                                <div className="mt-2 flex items-center gap-2">
                                  <input
                                    className="flex-1 bg-white/5 border border-white/10 rounded-lg px-2.5 py-1.5 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-lime-400/50"
                                    placeholder="Partner name (optional)"
                                    value={partnerDraft[k] || ""}
                                    onChange={(e) => setPartnerDraft((s) => ({ ...s, [k]: e.target.value }))}
                                  />
                                  {!(partnerDraft[k] || "").trim() && (
                                    <span className="shrink-0 text-[11px] text-amber-300 inline-flex items-center gap-1">
                                      <UserPlus className="w-3 h-3" /> Need a partner
                                    </span>
                                  )}
                                </div>
                              )}

                              {/* Doubles: manage partner after registration (incl. paid checkouts) */}
                              {isDoubles && registered && (
                                <div className="mt-2 flex items-center gap-2">
                                  <input
                                    className="flex-1 bg-white/5 border border-white/10 rounded-lg px-2.5 py-1.5 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-lime-400/50"
                                    placeholder="Partner name (optional)"
                                    value={partnerDraft[k] ?? myEntry?.partner_name ?? ""}
                                    onChange={(e) => setPartnerDraft((s) => ({ ...s, [k]: e.target.value }))}
                                  />
                                  <button
                                    onClick={() => savePartner(t, k, partnerDraft[k] ?? "")}
                                    disabled={savingPartner === k}
                                    className="shrink-0 px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/15 text-slate-200 text-xs font-medium disabled:opacity-50"
                                  >
                                    {savingPartner === k ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Save"}
                                  </button>
                                  {myEntry?.needs_partner && (
                                    <span className="shrink-0 text-[11px] text-amber-300 inline-flex items-center gap-1">
                                      <UserPlus className="w-3 h-3" /> Looking for a partner
                                    </span>
                                  )}
                                </div>
                              )}

                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  <PartnerWaitlist tournament={t} entries={t.entries || []} user={user} myName={myName} />

                  {myEntries.length > 0 && (
                    <div className="mt-4">
                      <AddToCalendarButton tournament={t} />
                    </div>
                  )}

                  {t.status === "plays" && myEntries.length > 0 && (
                    <div className="mt-4 space-y-4">
                      <TournamentLeaderboard tournament={t} />
                      <PlayerPlayMode tournament={t} myTeamNames={myTeamNames} user={user} userName={myName} />
                    </div>
                  )}

                  {t.status === "completed" && brackets[t.id]?.length > 0 && (
                    <div className="mt-4 space-y-4">
                      <TournamentLeaderboard tournament={t} />
                      <div className="flex items-center gap-1.5 mb-2">
                        <Network className="w-3.5 h-3.5 text-lime-300" />
                        <span className="text-xs font-semibold text-lime-300 uppercase tracking-wide">Bracket</span>
                      </div>
                      <div className="space-y-4">
                        {Object.entries(
                          (brackets[t.id] || []).reduce((acc, m) => {
                            (acc[m.division] ||= []).push(m);
                            return acc;
                          }, {})
                        ).map(([divLabel, ms]) => (
                          <div key={divLabel} className="paddle-card border border-lime-300 bg-white/[0.03] p-4">
                            <h4 className="font-display font-semibold text-white mb-2 text-sm">{divLabel}</h4>
                            <BracketView matches={ms} editable={false} saving={false} onSaveScore={() => {}} canReport={canReportMatch} onReport={openMatchReport} />
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {t.notes && <p className="mt-3 text-sm text-slate-400 whitespace-pre-wrap">{t.notes}</p>}
                </div>
              );
                })}
              </div>
            )}
          </div>
        )}
      </div>
      <ReportDiscrepancyDialog
        open={showReport}
        onClose={() => { setShowReport(false); setReportTarget(null); }}
        onSubmit={submitTournamentReport}
      />
    </PullToRefresh>
  );
}