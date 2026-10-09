import React from "react";
import { computeStandings } from "@/lib/bracket";

// Pool-play standings for a round-robin division, ordered by wins then point
// differential then name (computeStandings). Teams tied on both wins and
// differential share a rank so the tiebreak is visible to players/organizers.
export default function PoolStandings({ matches }) {
  const pool = (matches || []).filter((m) => m.stage === "pool");
  const standings = computeStandings(pool);
  if (standings.length < 2) return null;

  let displayRank = 0;
  let prevWins = null;
  let prevDiff = null;
  const rows = standings.map((s, i) => {
    const diff = s.pf - s.pa;
    if (!(prevWins === s.wins && prevDiff === diff)) displayRank = i + 1;
    prevWins = s.wins;
    prevDiff = diff;
    return { ...s, diff, rank: displayRank };
  });

  return (
    <div className="mb-4 rounded-xl border border-lime-400/20 bg-lime-400/[0.04] p-3">
      <div className="text-xs font-semibold text-lime-300 uppercase tracking-wide mb-2">
        Standings · ties broken by point differential
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-[10px] text-slate-500 uppercase">
              <th className="text-left font-medium py-1 px-2">#</th>
              <th className="text-left font-medium py-1 px-2">Team</th>
              <th className="text-center font-medium py-1 px-2">W</th>
              <th className="text-center font-medium py-1 px-2">PF</th>
              <th className="text-center font-medium py-1 px-2">PA</th>
              <th className="text-center font-medium py-1 px-2">Diff</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((s) => (
              <tr key={s.name} className="border-t border-white/5">
                <td className="py-1.5 px-2 text-slate-400">{s.rank}</td>
                <td className="py-1.5 px-2 text-slate-100 font-medium truncate">{s.name}</td>
                <td className="py-1.5 px-2 text-center text-lime-300 font-semibold">{s.wins}</td>
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
    </div>
  );
}