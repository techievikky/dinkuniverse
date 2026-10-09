import React, { useEffect, useState, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { Loader2, Trophy } from "lucide-react";

// Live, tournament-wide leaderboard: every competing team ranked by wins then
// point differential. Stays in sync via the Match realtime subscription so
// rankings update the moment a score is posted or corrected.
export default function TournamentLeaderboard({ tournament }) {
  const [matches, setMatches] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchMatches = async () => {
    try {
      const ms = await base44.entities.Match.filter({ tournament_id: tournament.id }, "round", 500);
      setMatches(ms);
    } catch { /* best-effort */ }
  };

  useEffect(() => {
    let active = true;
    (async () => {
      await fetchMatches();
      if (active) setLoading(false);
    })();
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tournament.id]);

  useEffect(() => {
    const unsub = base44.entities.Match.subscribe((event) => {
      if (event.data?.tournament_id !== tournament.id) return;
      fetchMatches();
    });
    return () => unsub && unsub();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tournament.id]);

  const rows = useMemo(() => {
    const stats = {};
    for (const e of tournament.entries || []) {
      if (e.name) stats[e.name] = { name: e.name, wins: 0, losses: 0, pf: 0, pa: 0 };
    }
    const ensure = (name) => {
      if (!name) return null;
      if (!stats[name]) stats[name] = { name, wins: 0, losses: 0, pf: 0, pa: 0 };
      return stats[name];
    };
    for (const m of matches) {
      if (m.status !== "completed" || !m.winner) continue;
      const a = ensure(m.team_a);
      const b = ensure(m.team_b);
      if (!a || !b) continue;
      a.pf += m.score_a ?? 0; a.pa += m.score_b ?? 0;
      b.pf += m.score_b ?? 0; b.pa += m.score_a ?? 0;
      if (m.winner === "A") { a.wins++; b.losses++; } else { b.wins++; a.losses++; }
    }
    const list = Object.values(stats).map((s) => ({ ...s, diff: s.pf - s.pa }));
    list.sort((x, y) => y.wins - x.wins || y.diff - x.diff || x.name.localeCompare(y.name));
    let prevKey = null, displayRank = 0;
    return list.map((s, i) => {
      const key = `${s.wins}|${s.diff}`;
      if (key !== prevKey) displayRank = i + 1;
      prevKey = key;
      return { ...s, rank: displayRank };
    });
  }, [matches, tournament.entries]);

  if (loading) {
    return <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-slate-500" /></div>;
  }
  if (!rows.length) return null;

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
      <div className="flex items-center gap-1.5 mb-3">
        <Trophy className="w-4 h-4 text-amber-300" />
        <h3 className="text-sm font-semibold text-white">Live leaderboard</h3>
        <span className="ml-auto inline-flex items-center gap-1 text-[10px] text-lime-300 uppercase tracking-wide">
          <span className="w-1.5 h-1.5 rounded-full bg-lime-400 animate-pulse" /> Live
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-[10px] text-slate-500 uppercase">
              <th className="text-left font-medium py-1 px-2">#</th>
              <th className="text-left font-medium py-1 px-2">Team</th>
              <th className="text-center font-medium py-1 px-2">W</th>
              <th className="text-center font-medium py-1 px-2">L</th>
              <th className="text-center font-medium py-1 px-2">PF</th>
              <th className="text-center font-medium py-1 px-2">PA</th>
              <th className="text-center font-medium py-1 px-2">Diff</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((s) => (
              <tr key={s.name} className="border-t border-white/5">
                <td className="py-1.5 px-2 text-slate-400 font-medium">{s.rank}</td>
                <td className="py-1.5 px-2 text-slate-100 font-medium truncate max-w-[160px]">{s.name}</td>
                <td className="py-1.5 px-2 text-center text-lime-300 font-semibold">{s.wins}</td>
                <td className="py-1.5 px-2 text-center text-rose-300">{s.losses}</td>
                <td className="py-1.5 px-2 text-center text-slate-300">{s.pf}</td>
                <td className="py-1.5 px-2 text-center text-slate-300">{s.pa}</td>
                <td className={`py-1.5 px-2 text-center font-semibold ${s.diff > 0 ? "text-emerald-300" : s.diff < 0 ? "text-rose-300" : "text-slate-400"}`}>
                  {s.diff > 0 ? `+${s.diff}` : s.diff}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-[10px] text-slate-500">Ranked by wins, then point differential. Ties share a rank.</p>
    </div>
  );
}