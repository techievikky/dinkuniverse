import React, { useState, useEffect, useMemo, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { useToast } from "@/components/ui/use-toast";
import BackBar from "@/components/BackBar";
import BracketView from "@/components/tournaments/BracketView";
import ManualScheduler from "@/components/tournaments/ManualScheduler";
import { buildBracket, buildRoundRobin, computeStandings } from "@/lib/bracket";
import { CATEGORIES, categoryLabel, formatLabel } from "@/components/tournaments/divisions";
import TournamentChatPanel from "@/components/tournaments/TournamentChatPanel";
import {
  Loader2, Plus, Trash2, Calendar, MapPin, Users, Layers, Trophy,
  Network, Save, ChevronRight, UserPlus, Medal, AlertTriangle,
} from "lucide-react";
import TeamAvatars from "@/components/tournaments/TeamAvatars";
import { promoteNext } from "@/lib/waitlist";
import { fetchForTournament, resolveAllForMatch } from "@/lib/discrepancy";
import ExportTournamentPanel from "@/components/tournaments/ExportTournamentPanel";
import TournamentLeaderboard from "@/components/tournaments/TournamentLeaderboard";
import RegistrationFinance from "@/components/tournaments/RegistrationFinance";
import TournamentCheckInPanel from "@/components/tournaments/TournamentCheckInPanel";

const statusStyles = {
  open: "bg-sky-500/15 text-sky-300 border-sky-500/20",
  plays: "bg-lime-500/15 text-lime-300 border-lime-500/20",
  completed: "bg-emerald-500/15 text-emerald-300 border-emerald-500/20",
  cancelled: "bg-rose-500/15 text-rose-300 border-rose-500/20",
};

const divisionKey = (d) => `${d.category}|${d.dupr_min}|${d.dupr_max}`;
const divisionLabel = (d) => `${categoryLabel(d.category)} · DUPR ${d.dupr_min ?? 0}-${d.dupr_max ?? 8}`;

export default function TournamentManager() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();

  const [tournament, setTournament] = useState(null);
  const [matches, setMatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newTeam, setNewTeam] = useState({});
  const [generating, setGenerating] = useState(false);
  const [savingScoreId, setSavingScoreId] = useState(null);
  const [scheduleMode, setScheduleMode] = useState("auto"); // "auto" | "manual"
  const [playersMap, setPlayersMap] = useState({});
  const [tDiscrepancies, setTDiscrepancies] = useState([]);
  const [adjustingMatch, setAdjustingMatch] = useState(null);
  const [adjA, setAdjA] = useState(0);
  const [adjB, setAdjB] = useState(0);

  const load = async () => {
    const t = await base44.entities.Tournament.get(id);
    setTournament(t);
    const ms = await base44.entities.Match.filter({ tournament_id: id }, "round", 500);
    setMatches(ms);
    // Map user_id -> player profile for avatar display on team listings.
    try {
      const players = await base44.entities.Player.list("-created_date", 500);
      const map = {};
      for (const p of players) if (p.user_id) map[p.user_id] = p;
      setPlayersMap(map);
    } catch {
      /* avatars are best-effort */
    }
    try {
      const ds = await fetchForTournament(id);
      setTDiscrepancies(ds.filter((d) => d.status === "open"));
    } catch { /* best-effort */ }
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
  const editable = tournament?.status === "plays" && isOwner;

  const [awarding, setAwarding] = useState(false);
  const awardedRef = useRef(false);

  const awardMedals = async () => {
    setAwarding(true);
    try {
      const res = await base44.functions.invoke("award-tournament-medals", { tournament_id: id });
      const awarded = res?.data?.awarded ?? 0;
      toast({ title: awarded ? `Medals awarded 🏅 (${awarded})` : "No finals decided yet" });
    } catch (e) {
      toast({ title: "Could not award medals", description: e.message, variant: "destructive" });
    } finally {
      setAwarding(false);
    }
  };

  // Auto-award medals once every division final is decided.
  useEffect(() => {
    if (!matches.length || !isOwner || awardedRef.current) return;
    const divs = [...new Set(matches.map((m) => m.division))];
    const allDone = divs.every((div) => {
      const ms = matches.filter((m) => m.division === div);
      const hasStage = ms.some((m) => m.stage);
      const finalMatch = hasStage
        ? ms.find((m) => m.stage === "final")
        : ms.find((m) => m.round === Math.max(...ms.map((x) => x.round)));
      return !!finalMatch && finalMatch.status === "completed" && !!finalMatch.winner;
    });
    if (allDone) {
      awardedRef.current = true;
      base44.functions.invoke("award-tournament-medals", { tournament_id: id }).catch(() => {});
    }
  }, [matches, isOwner, id]);

  const matchesByDivision = useMemo(() => {
    const groups = {};
    for (const m of matches) (groups[m.division] ||= []).push(m);
    return groups;
  }, [matches]);

  const entriesByDivision = useMemo(() => {
    const groups = {};
    for (const d of tournament?.divisions || []) groups[divisionKey(d)] = [];
    for (const e of tournament?.entries || []) {
      const k = divisionKey(e);
      (groups[k] ||= []).push(e);
    }
    return groups;
  }, [tournament]);

  const divisions = tournament?.divisions || [];

  // Resolve each bracket team name to its registering player's avatar so the
  // schedule is easy to scan.
  const teamMeta = useMemo(() => {
    const m = {};
    for (const e of tournament?.entries || []) {
      m[e.name] = {
        photo_url: playersMap[e.user_id]?.photo_url,
        partner_name: e.partner_name,
        needs_partner: e.needs_partner,
        arrived: !!e.arrived,
      };
    }
    return m;
  }, [tournament, playersMap]);

  const addEntry = async (d) => {
    const k = divisionKey(d);
    const name = (newTeam[k] || "").trim();
    if (!name) return;
    const entry = { name, category: d.category, dupr_min: d.dupr_min, dupr_max: d.dupr_max };
    const entries = [...(tournament.entries || []), entry];
    await base44.entities.Tournament.update(id, { entries });
    setTournament((t) => ({ ...t, entries }));
    setNewTeam((s) => ({ ...s, [k]: "" }));
    toast({ title: "Team added ✓" });
  };

  const removeEntry = async (idx) => {
    const removed = (tournament.entries || [])[idx];
    const entries = (tournament.entries || []).filter((_, i) => i !== idx);
    await base44.entities.Tournament.update(id, { entries });
    setTournament((t) => ({ ...t, entries }));
    if (removed) {
      try {
        await promoteNext({ event_type: "tournament", event_id: id, event_title: tournament.name, division: divisionKey(removed), sender: user });
      } catch { /* best-effort */ }
    }
  };

  const saveMatchScore = async (disc) => {
    try {
      const a = Number(adjA);
      const b = Number(adjB);
      const winner = a > b ? "A" : b > a ? "B" : null;
      if (!winner) {
        toast({ title: "No ties — pick a winner", variant: "destructive" });
        return;
      }
      await base44.entities.Match.update(disc.match_id, { score_a: a, score_b: b, winner, status: "completed" });
      await resolveAllForMatch(disc.match_id, { resolverId: user.id, resolverName: user.full_name || user.email, note: "Score adjusted after review" });
      setAdjustingMatch(null);
      await load();
      toast({ title: "Match score updated ✓", description: "Discrepancy report resolved." });
    } catch (e) {
      toast({ title: "Could not save", description: e.message, variant: "destructive" });
    }
  };

  const confirmMatchScore = async (disc) => {
    try {
      await resolveAllForMatch(disc.match_id, { resolverId: user.id, resolverName: user.full_name || user.email, note: "Score confirmed after review" });
      await load();
      toast({ title: "Score confirmed ✓", description: "Discrepancy report resolved." });
    } catch (e) {
      toast({ title: "Could not confirm", description: e.message, variant: "destructive" });
    }
  };

  const generate = async () => {
    if (entriesByDivision && Object.values(entriesByDivision).every((arr) => arr.length === 0)) {
      toast({ title: "Add some teams first", variant: "destructive" });
      return;
    }
    setGenerating(true);
    let toCreate = [];
    for (const d of divisions.length ? divisions : uniqueDivisionsFromEntries()) {
      const k = divisionKey(d);
      const teams = (entriesByDivision[k] || []).map((e) => e.name);
      if (!teams.length) continue;
      const grid = tournament.format === "round_robin" ? buildRoundRobin(teams) : buildBracket(teams);
      for (const m of grid.flat()) {
        toCreate.push({
          tournament_id: id,
          division: divisionLabel(d),
          category: d.category,
          round: m.round,
          index: m.index,
          stage: m.stage || null,
          team_a: m.team_a || null,
          team_b: m.team_b || null,
          score_a: null,
          score_b: null,
          winner: m.winner || null,
          status: m.status,
        });
      }
    }
    try {
      await base44.entities.Match.deleteMany({ tournament_id: id });
      if (toCreate.length) await base44.entities.Match.bulkCreate(toCreate);
      await load();
      toast({ title: "Brackets generated ✓" });
    } catch (e) {
      toast({ title: "Could not generate brackets", description: e.message, variant: "destructive" });
    } finally {
      setGenerating(false);
    }
  };

  // Fallback: if the organizer added entries but removed the matching division,
  // derive divisions from the entries themselves.
  const uniqueDivisionsFromEntries = () => {
    const seen = {};
    for (const e of tournament?.entries || []) {
      seen[divisionKey(e)] ||= { category: e.category, dupr_min: e.dupr_min, dupr_max: e.dupr_max };
    }
    return Object.values(seen);
  };

  const saveManualSchedule = async (toCreate) => {
    if (!toCreate.length) return;
    setGenerating(true);
    try {
      const payload = toCreate.map((m) => ({ ...m, tournament_id: id }));
      await base44.entities.Match.deleteMany({ tournament_id: id });
      await base44.entities.Match.bulkCreate(payload);
      await load();
      setScheduleMode("auto");
      toast({ title: "Manual schedule saved ✓" });
    } catch (e) {
      toast({ title: "Could not save schedule", description: e.message, variant: "destructive" });
    } finally {
      setGenerating(false);
    }
  };

  const recordScore = async (match, aStr, bStr) => {
    const a = Number(aStr);
    const b = Number(bStr);
    if (isNaN(a) || isNaN(b)) {
      toast({ title: "Enter scores for both teams", variant: "destructive" });
      return;
    }
    let winner = a > b ? "A" : b > a ? "B" : null;
    if (!winner) {
      toast({ title: "No ties — pick a winner", variant: "destructive" });
      return;
    }
    setSavingScoreId(match.id);
    try {
      await base44.entities.Match.update(match.id, { score_a: a, score_b: b, winner, status: "completed" });
      const divMatches = matches.filter((m) => m.division === match.division);

      if (match.stage === "pool") {
        // Seed the semifinals from the top 4 once every pool match is decided.
        const updatedPool = divMatches
          .filter((m) => m.stage === "pool")
          .map((m) => (m.id === match.id ? { ...m, score_a: a, score_b: b, winner, status: "completed" } : m));
        const allDone = updatedPool.length > 0 && updatedPool.every((m) => m.status === "completed");
        if (allDone) {
          const top4 = computeStandings(updatedPool).slice(0, 4).map((s) => s.name);
          // Seed 1 v 4 and 2 v 3.
          const seedings = [
            [top4[0] ?? null, top4[3] ?? null],
            [top4[1] ?? null, top4[2] ?? null],
          ];
          const sfMatches = divMatches
            .filter((m) => m.stage === "semifinal")
            .sort((x, y) => x.index - y.index);
          for (let i = 0; i < sfMatches.length; i++) {
            const sf = sfMatches[i];
            if (sf.status === "completed") continue; // don't overwrite a played semifinal
            const [ta, tb] = seedings[i] || [null, null];
            await base44.entities.Match.update(sf.id, {
              team_a: ta,
              team_b: tb,
              status: ta && tb ? "ready" : "pending",
            });
          }
        }
      } else if (match.stage === "semifinal") {
        // Advance the semifinal winner into the final.
        const finalMatch = divMatches.find((m) => m.stage === "final");
        if (finalMatch && finalMatch.status !== "completed") {
          const slot = match.index === 0 ? "team_a" : "team_b";
          const otherSlot = slot === "team_a" ? "team_b" : "team_a";
          const wName = winner === "A" ? match.team_a : match.team_b;
          const bothSet = wName && finalMatch[otherSlot];
          await base44.entities.Match.update(finalMatch.id, { [slot]: wName, status: bothSet ? "ready" : "pending" });
        }
      } else {
        // Single-elimination: advance winner to the next round's slot.
        const next = divMatches.find(
          (m) => m.round === match.round + 1 && m.index === Math.floor(match.index / 2)
        );
        if (next) {
          const slot = match.index % 2 === 0 ? "team_a" : "team_b";
          const otherSlot = slot === "team_a" ? "team_b" : "team_a";
          const wName = winner === "A" ? match.team_a : match.team_b;
          const bothSet = wName && next[otherSlot];
          await base44.entities.Match.update(next.id, { [slot]: wName, status: bothSet ? "ready" : "pending" });
        }
      }
      await load();
      toast({ title: "Score saved ✓" });
    } catch (e) {
      toast({ title: "Could not save score", description: e.message, variant: "destructive" });
    } finally {
      setSavingScoreId(null);
    }
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
    "w-full bg-white/5 border border-white/10 rounded-xl px-3.5 py-2.5 text-white placeholder:text-slate-500 focus:outline-none focus:border-lime-400/50 focus:ring-1 focus:ring-lime-400/30 transition";

  return (
    <div className="max-w-2xl mx-auto">
      <BackBar to="/tournaments" label="Tournaments" />

      <div className="flex items-start justify-between gap-3 mt-2">
        <div className="min-w-0">
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-white tracking-tight truncate">{tournament.name}</h1>
          <div className="text-slate-400 text-sm mt-1 flex flex-wrap items-center gap-x-4 gap-y-1">
            <span className="flex items-center gap-1.5"><Calendar className="w-4 h-4" />{new Date(tournament.date).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", year: "numeric" })}</span>
            {tournament.location && <span className="flex items-center gap-1.5"><MapPin className="w-4 h-4" />{tournament.location}</span>}
          </div>
        </div>
        <span className={`shrink-0 text-[11px] px-2.5 py-1 rounded-full border font-medium uppercase ${statusStyles[tournament.status] || statusStyles.open}`}>
          {tournament.status}
        </span>
      </div>

      <div className="mt-3 flex flex-wrap gap-2 text-xs">
        {tournament.format && <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/5 border border-white/10 text-slate-300"><Layers className="w-3.5 h-3.5" />{formatLabel(tournament.format)}</span>}
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/5 border border-white/10 text-slate-300"><Trophy className="w-3.5 h-3.5" />{divisions.length} division{divisions.length !== 1 ? "s" : ""}</span>
      </div>

      <p className="text-slate-400 text-sm mt-3">{tournament.notes}</p>

      {tournament.status === "open" && (
        <div className="mt-4 rounded-2xl border border-sky-500/20 bg-sky-500/[0.05] p-3 text-sm text-sky-200">
          Score tracking unlocks automatically the day before the tournament date.
        </div>
      )}

      {isOwner && (
        <div className="mt-6">
          <TournamentChatPanel tournament={tournament} onUpdated={load} />
        </div>
      )}

      {/* Divisions + registration */}
      <div className="mt-6">
        <h3 className="font-display text-lg font-semibold text-white mb-3">Divisions</h3>
        <div className="space-y-3">
          {(divisions.length ? divisions : uniqueDivisionsFromEntries()).map((d) => {
            const k = divisionKey(d);
            const teams = entriesByDivision[k] || [];
            return (
              <div key={k} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                <div className="flex items-center justify-between gap-2">
                  <h4 className="font-semibold text-white text-sm">{divisionLabel(d)}</h4>
                  <span className="text-xs text-slate-400 flex items-center gap-1"><Users className="w-3.5 h-3.5" />{teams.length} team{teams.length !== 1 ? "s" : ""}</span>
                </div>

                {isOwner && (
                  <form
                    onSubmit={(e) => { e.preventDefault(); addEntry(d); }}
                    className="mt-3 flex gap-2"
                  >
                    <input
                      className={inputCls}
                      placeholder="Player or team name"
                      value={newTeam[k] || ""}
                      onChange={(e) => setNewTeam((s) => ({ ...s, [k]: e.target.value }))}
                    />
                    <button type="submit" className="shrink-0 w-11 h-11 rounded-xl bg-lime-400 hover:bg-lime-300 text-slate-900 flex items-center justify-center">
                      <Plus className="w-5 h-5" />
                    </button>
                  </form>
                )}

                {teams.length > 0 && (
                  <ul className="mt-3 space-y-1.5">
                    {teams.map((e, i) => {
                      const idx = (tournament.entries || []).findIndex((x) => x.name === e.name && divisionKey(x) === k);
                      const doubles = d.category !== "singles";
                      return (
                        <li key={i} className="flex items-center justify-between gap-2 rounded-lg bg-white/[0.03] px-3 py-2">
                          <div className="flex items-center gap-2.5 min-w-0">
                            <TeamAvatars entry={e} isDoubles={doubles} players={playersMap} />
                            <div className="min-w-0">
                              <div className="text-sm text-slate-200 truncate">{e.name}</div>
                              {doubles && (
                                e.partner_name ? (
                                  <div className="text-[11px] text-slate-500 truncate">Partner: {e.partner_name}</div>
                                ) : e.needs_partner ? (
                                  <div className="text-[11px] text-amber-300 inline-flex items-center gap-1"><UserPlus className="w-3 h-3" />Needs a partner</div>
                                ) : null
                              )}
                            </div>
                          </div>
                          {isOwner && (
                            <button
                              onClick={() => removeEntry(idx)}
                              className="w-8 h-8 rounded-lg hover:bg-rose-500/15 hover:text-rose-300 text-slate-400 flex items-center justify-center"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Registration fee calculator & payment status (organizer) */}
      {isOwner && (
        <div className="mt-6">
          <RegistrationFinance tournament={tournament} />
        </div>
      )}

      {/* On-site player check-in (organizer) */}
      {isOwner && (
        <div className="mt-6">
          <TournamentCheckInPanel tournament={tournament} onUpdated={load} playersMap={playersMap} />
        </div>
      )}

      {/* Tournament report export (organizer) */}
      {isOwner && <ExportTournamentPanel tournament={tournament} matches={matches} />}

      {/* Score discrepancy reports (organizer) */}
      {isOwner && tDiscrepancies.length > 0 && (
        <div className="mt-6 rounded-2xl border border-amber-400/30 bg-amber-400/[0.06] p-4">
          <div className="flex items-center gap-2 text-amber-300 text-sm font-semibold mb-3">
            <AlertTriangle className="w-4 h-4" /> Score discrepancy reports
          </div>
          <div className="space-y-2">
            {tDiscrepancies.map((d) => {
              const m = matches.find((x) => x.id === d.match_id);
              return (
                <div key={d.id} className="rounded-xl bg-white/[0.03] border border-white/10 px-3 py-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm text-white font-medium">{d.reported_by_name}</span>
                    <span className="text-[10px] text-slate-500">{new Date(d.created_date).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span>
                  </div>
                  {d.reason && <p className="text-xs text-slate-400 mt-1 whitespace-pre-wrap">{d.reason}</p>}
                  {m && (
                    <div className="mt-2 text-xs text-slate-300">
                      {m.division} · {m.team_a || "TBD"} vs {m.team_b || "TBD"} — current {m.score_a ?? 0} / {m.score_b ?? 0}
                    </div>
                  )}
                  {adjustingMatch === d.id && m ? (
                    <div className="mt-3 flex items-center justify-center gap-3">
                      <input type="number" min="0" value={adjA} onChange={(e) => setAdjA(e.target.value)} className="w-16 bg-white/5 border border-white/10 rounded-lg px-2 py-1 text-center text-white" />
                      <span className="text-slate-500">:</span>
                      <input type="number" min="0" value={adjB} onChange={(e) => setAdjB(e.target.value)} className="w-16 bg-white/5 border border-white/10 rounded-lg px-2 py-1 text-center text-white" />
                      <div className="flex gap-2 ml-2">
                        <button onClick={() => saveMatchScore(d)} className="px-3 py-1.5 rounded-lg bg-amber-400 hover:bg-amber-300 text-slate-900 text-xs font-semibold">Save</button>
                        <button onClick={() => setAdjustingMatch(null)} className="px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-slate-200 text-xs">Cancel</button>
                      </div>
                    </div>
                  ) : (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {m && (
                        <button
                          onClick={() => { setAdjustingMatch(d.id); setAdjA(m.score_a ?? 0); setAdjB(m.score_b ?? 0); }}
                          className="px-3 py-1.5 rounded-lg bg-amber-400 hover:bg-amber-300 text-slate-900 text-xs font-semibold"
                        >
                          Adjust score
                        </button>
                      )}
                      <button onClick={() => confirmMatchScore(d)} className="px-3 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-900 text-xs font-semibold">
                        Confirm score
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Brackets */}
      {isOwner && (
        <div className="mt-6">
          <div className="flex items-center justify-between gap-3 mb-3">
            <h3 className="font-display text-lg font-semibold text-white flex items-center gap-2"><Network className="w-5 h-5" />Brackets</h3>
            <div className="flex items-center gap-2">
              {scheduleMode === "auto" && (
                <button
                  onClick={generate}
                  disabled={generating}
                  className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-lime-400 hover:bg-lime-300 disabled:opacity-60 text-slate-900 font-semibold text-sm transition shadow-lg shadow-lime-500/20"
                >
                  {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  {matches.length ? "Regenerate" : "Generate brackets"}
                </button>
              )}
              <button
                onClick={awardMedals}
                disabled={awarding}
                className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-amber-400/15 hover:bg-amber-400/25 disabled:opacity-60 text-amber-200 font-semibold text-sm transition border border-amber-400/30"
                title="Award gold, silver & bronze from final results"
              >
                {awarding ? <Loader2 className="w-4 h-4 animate-spin" /> : <Medal className="w-4 h-4" />}
                Award medals
              </button>
            </div>
          </div>

          {/* Schedule mode toggle */}
          <div className="flex gap-2 mb-4">
            {[
              { id: "auto", label: "Auto-generate" },
              { id: "manual", label: "Manual schedule" },
            ].map((m) => (
              <button
                key={m.id}
                onClick={() => setScheduleMode(m.id)}
                className={`px-3.5 py-1.5 rounded-full text-sm font-medium transition ${
                  scheduleMode === m.id
                    ? "bg-white text-slate-900"
                    : "bg-white/5 text-slate-300 hover:bg-white/10"
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>

          {matches.length > 0 && <TournamentLeaderboard tournament={tournament} />}

          {scheduleMode === "manual" ? (
            <ManualScheduler
              divisions={divisions.length ? divisions : uniqueDivisionsFromEntries()}
              entriesByDivision={entriesByDivision}
              onSave={saveManualSchedule}
              saving={generating}
            />
          ) : matches.length === 0 ? (
            <div className="text-center py-10 rounded-2xl border border-dashed border-white/10">
              <Network className="w-7 h-7 mx-auto text-slate-600 mb-2" />
              <p className="text-slate-400 text-sm">No brackets yet — add teams to each division, then generate.</p>
            </div>
          ) : (
            <div className="space-y-6">
              {Object.entries(matchesByDivision).map(([divLabel, ms]) => (
                <div key={divLabel} className="paddle-card border border-lime-300 bg-white/[0.03] p-5 shadow-[0_0_18px_-4px_#d4ff3a]">
                  <h4 className="font-display font-semibold text-white mb-1">{divLabel}</h4>
                  {!editable && (
                    <p className="text-[11px] text-slate-500 mb-3">Score entry opens when the tournament reaches play status.</p>
                  )}
                  <BracketView
                    matches={ms}
                    editable={editable}
                    saving={!!savingScoreId}
                    onSaveScore={recordScore}
                    teamMeta={teamMeta}
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}