import React, { useState, useEffect, useMemo } from "react";
import { useParams, Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { useToast } from "@/components/ui/use-toast";
import BackBar from "@/components/BackBar";
import { Loader2, Clock, Flag, Radio, CheckCircle2, MapPin, ArrowRight, Save } from "lucide-react";

const STAGES = [
  { key: "queued", label: "Queued up", icon: Clock, color: "text-amber-300", chip: "bg-amber-400/15 border-amber-400/30" },
  { key: "staged", label: "Staged", icon: Flag, color: "text-orange-300", chip: "bg-orange-500/15 border-orange-500/30" },
  { key: "on_deck", label: "On Deck", icon: Radio, color: "text-rose-300", chip: "bg-rose-500/15 border-rose-500/30" },
  { key: "completed", label: "Completed", icon: CheckCircle2, color: "text-emerald-300", chip: "bg-emerald-500/15 border-emerald-500/30" },
];
const stageOf = (s) => STAGES.find((x) => x.key === s);
const isWaiting = (s) => s === "pending" || s === "ready";
const FLOW = ["queued", "staged", "on_deck"];

export default function PlayMode() {
  const { id } = useParams();
  const { user } = useAuth();
  const { toast } = useToast();
  const [tournament, setTournament] = useState(null);
  const [matches, setMatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);
  const [courts, setCourts] = useState({}); // matchId -> court draft
  const [scores, setScores] = useState({}); // matchId -> { a, b }

  const load = async () => {
    const t = await base44.entities.Tournament.get(id);
    setTournament(t);
    const ms = await base44.entities.Match.filter({ tournament_id: id }, "round", 500);
    setMatches(ms);
  };

  useEffect(() => {
    (async () => {
      try {
        await load();
      } catch (e) {
        toast({ title: "Tournament not found", description: e.message, variant: "destructive" });
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const isOwner = tournament && (tournament.created_by_id === user?.id || user?.role === "admin");

  const matchesByDivision = useMemo(() => {
    const g = {};
    for (const m of matches) (g[m.division] ||= []).push(m);
    return g;
  }, [matches]);

  const counts = useMemo(() => {
    const c = { queued: 0, staged: 0, on_deck: 0, completed: 0, waiting: 0 };
    for (const m of matches) {
      if (isWaiting(m.status)) c.waiting++;
      else if (c[m.status] != null) c[m.status]++;
    }
    return c;
  }, [matches]);

  const updateAndNotify = async (match, patch) => {
    setBusyId(match.id);
    try {
      await base44.entities.Match.update(match.id, patch);
      await base44.functions.invoke("notify-match-status", { match_id: match.id });
      await load();
    } catch (e) {
      toast({ title: "Update failed", description: e.message, variant: "destructive" });
    } finally {
      setBusyId(null);
    }
  };

  const saveCourt = async (match) => {
    const court = (courts[match.id] ?? "").trim();
    if (court === (match.court || "")) return;
    setBusyId(match.id);
    try {
      await base44.entities.Match.update(match.id, { court });
      await load();
    } catch (e) {
      toast({ title: "Could not save court", description: e.message, variant: "destructive" });
    } finally {
      setBusyId(null);
    }
  };

  const advance = async (match) => {
    const idx = FLOW.indexOf(match.status);
    const next = idx >= 0 ? FLOW[idx + 1] : "queued";
    if (!next) return;
    await updateAndNotify(match, { status: next });
  };

  const recordScore = async (match) => {
    const { a, b } = scores[match.id] || {};
    const sa = Number(a);
    const sb = Number(b);
    if (isNaN(sa) || isNaN(sb)) {
      toast({ title: "Enter both scores", variant: "destructive" });
      return;
    }
    if (sa === sb) {
      toast({ title: "No ties — pick a winner", variant: "destructive" });
      return;
    }
    const winner = sa > sb ? "A" : "B";
    await updateAndNotify(match, { score_a: sa, score_b: sb, winner, status: "completed" });
  };

  if (loading) {
    return (
      <div className="flex justify-center py-24">
        <div className="w-7 h-7 border-4 border-white/10 border-t-lime-400 rounded-full animate-spin" />
      </div>
    );
  }
  if (!tournament) return <div className="py-20 text-center text-slate-400">Tournament not found.</div>;

  const inputCls =
    "bg-white/5 border border-white/10 rounded-lg px-2.5 py-2 text-white placeholder:text-slate-500 focus:outline-none focus:border-lime-400/50 text-sm";

  return (
    <div className="max-w-2xl mx-auto">
      <BackBar to={`/tournaments/${id}`} label="Manage" />
      <div className="mt-2">
        <h1 className="font-display text-2xl font-bold text-white tracking-tight truncate">Play mode · {tournament.name}</h1>
        <p className="text-slate-400 text-sm mt-1">
          Assign courts, run matches through Queued → Staged → On Deck, and record scores. Players get a chat ping at each step.
        </p>
      </div>

      {/* Stage counters */}
      <div className="mt-4 grid grid-cols-4 gap-2">
        {STAGES.map((s) => (
          <div key={s.key} className={`rounded-xl border ${s.chip} p-2.5 text-center`}>
            <s.icon className={`w-4 h-4 mx-auto ${s.color}`} />
            <div className="text-xl font-bold text-white mt-0.5">{counts[s.key] || 0}</div>
            <div className="text-[10px] text-slate-400">{s.label}</div>
          </div>
        ))}
      </div>

      <div className="mt-6 space-y-6">
        {Object.entries(matchesByDivision).map(([div, ms]) => (
          <div key={div}>
            <h3 className="font-display font-semibold text-white text-sm mb-2">{div}</h3>
            <div className="space-y-2">
              {[...ms]
                .sort((a, b) => a.round - b.round || a.index - b.index)
                .map((m) => {
                  const st = stageOf(m.status);
                  const waiting = isWaiting(m.status);
                  const ready = m.team_a && m.team_b;
                  const sc = scores[m.id] || {};
                  return (
                    <div key={m.id} className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <div className="text-sm text-white truncate">
                            {m.team_a || "TBD"} <span className="text-slate-500">vs</span> {m.team_b || "TBD"}
                          </div>
                          <div className="text-[11px] text-slate-500 truncate">
                            Round {m.round}{m.stage ? ` · ${m.stage}` : ""}{m.court ? ` · Court ${m.court}` : ""}
                          </div>
                        </div>
                        {st ? (
                          <span className={`shrink-0 text-[11px] px-2 py-1 rounded-full border font-medium inline-flex items-center gap-1 ${st.chip} ${st.color}`}>
                            <st.icon className="w-3 h-3" /> {st.label}
                          </span>
                        ) : (
                          <span className="shrink-0 text-[11px] px-2 py-1 rounded-full border bg-white/5 text-slate-300 border-white/10">Waiting</span>
                        )}
                      </div>

                      {m.status === "completed" && (
                        <div className="mt-2 text-sm text-emerald-300">
                          Final: {m.team_a} {m.score_a} : {m.score_b} {m.team_b} · Winner {m.winner === "A" ? m.team_a : m.team_b}
                        </div>
                      )}

                      {isOwner && m.status !== "completed" && (
                        <div className="mt-2.5 flex flex-wrap items-center gap-2">
                          <div className="flex items-center gap-1">
                            <MapPin className="w-3.5 h-3.5 text-slate-500" />
                            <input
                              className={inputCls + " w-24"}
                              placeholder="Court"
                              value={courts[m.id] ?? m.court ?? ""}
                              onChange={(e) => setCourts((s) => ({ ...s, [m.id]: e.target.value }))}
                              onBlur={() => saveCourt(m)}
                            />
                          </div>
                          <div className="ml-auto flex items-center gap-2">
                            {waiting && (
                              <button
                                disabled={!ready || busyId === m.id}
                                onClick={() => advance(m)}
                                className="inline-flex items-center gap-1 px-3 py-2 rounded-lg bg-amber-400/15 hover:bg-amber-400/25 text-amber-200 text-xs font-medium disabled:opacity-50"
                              >
                                {busyId === m.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Clock className="w-3.5 h-3.5" />} Queue up
                              </button>
                            )}
                            {m.status === "queued" && (
                              <button
                                disabled={busyId === m.id}
                                onClick={() => advance(m)}
                                className="inline-flex items-center gap-1 px-3 py-2 rounded-lg bg-orange-500/15 hover:bg-orange-500/25 text-orange-200 text-xs font-medium disabled:opacity-50"
                              >
                                {busyId === m.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Flag className="w-3.5 h-3.5" />} Stage <ArrowRight className="w-3.5 h-3.5" />
                              </button>
                            )}
                            {m.status === "staged" && (
                              <button
                                disabled={busyId === m.id}
                                onClick={() => advance(m)}
                                className="inline-flex items-center gap-1 px-3 py-2 rounded-lg bg-rose-500/15 hover:bg-rose-500/25 text-rose-200 text-xs font-medium disabled:opacity-50"
                              >
                                {busyId === m.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Radio className="w-3.5 h-3.5" />} On deck <ArrowRight className="w-3.5 h-3.5" />
                              </button>
                            )}
                            {m.status === "on_deck" && (
                              <>
                                <input type="number" inputMode="numeric" className={inputCls + " w-14"} placeholder="A" value={sc.a ?? ""} onChange={(e) => setScores((s) => ({ ...s, [m.id]: { ...s[m.id], a: e.target.value } }))} />
                                <span className="text-slate-500 text-xs">:</span>
                                <input type="number" inputMode="numeric" className={inputCls + " w-14"} placeholder="B" value={sc.b ?? ""} onChange={(e) => setScores((s) => ({ ...s, [m.id]: { ...s[m.id], b: e.target.value } }))} />
                                <button
                                  disabled={busyId === m.id}
                                  onClick={() => recordScore(m)}
                                  className="inline-flex items-center gap-1 px-3 py-2 rounded-lg bg-emerald-400/15 hover:bg-emerald-400/25 text-emerald-200 text-xs font-medium disabled:opacity-50"
                                >
                                  {busyId === m.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />} Record
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
            </div>
          </div>
        ))}
        {matches.length === 0 && (
          <div className="text-center py-12 rounded-2xl border border-dashed border-white/10">
            <p className="text-slate-400 text-sm">No matches yet. Generate brackets from the manage page first.</p>
            <Link to={`/tournaments/${id}`} className="inline-flex mt-3 items-center gap-2 px-4 py-2 rounded-xl bg-lime-400 text-slate-900 font-semibold text-sm">
              Manage brackets
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}