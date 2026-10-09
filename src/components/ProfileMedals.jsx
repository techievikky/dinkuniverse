import React from "react";
import { Medal } from "lucide-react";

const STYLES = {
  gold: { color: "text-amber-300", ring: "from-amber-400/20 to-amber-500/[0.04]", border: "border-amber-400/30", label: "Gold" },
  silver: { color: "text-slate-300", ring: "from-slate-300/20 to-slate-400/[0.04]", border: "border-slate-300/30", label: "Silver" },
  bronze: { color: "text-orange-400", ring: "from-orange-500/20 to-orange-600/[0.04]", border: "border-orange-500/30", label: "Bronze" },
};
const ORDER = { gold: 0, silver: 1, bronze: 2 };

// Dedicated profile medals showcase: gold/silver/bronze icons always visible
// (with live counts), plus the earned-medal history. Icons populate
// automatically as tournament finals are finalized and approved.
export default function ProfileMedals({ medals }) {
  const counts = { gold: 0, silver: 0, bronze: 0 };
  for (const m of medals || []) if (counts[m.medal] != null) counts[m.medal]++;

  const sorted = [...(medals || [])].sort((a, b) => {
    const d = (ORDER[a.medal] ?? 9) - (ORDER[b.medal] ?? 9);
    if (d) return d;
    return (b.date || "").localeCompare(a.date || "");
  });

  return (
    <div className="rounded-2xl border border-white/5 bg-gradient-to-b from-white/[0.05] to-white/[0.02] p-5 mb-6">
      <h2 className="font-display text-lg font-semibold text-white flex items-center gap-2">
        <Medal className="w-5 h-5 text-amber-300" /> Tournament medals
      </h2>
      <p className="text-xs text-slate-400 mt-1 mb-4">Earned automatically when a bracket final is finalized.</p>

      <div className="grid grid-cols-3 gap-3">
        {["gold", "silver", "bronze"].map((k) => (
          <div key={k} className={`rounded-2xl border ${STYLES[k].border} bg-gradient-to-b ${STYLES[k].ring} p-4 text-center`}>
            <Medal className={`w-7 h-7 mx-auto ${STYLES[k].color}`} />
            <div className="text-3xl font-bold text-white mt-1.5">{counts[k]}</div>
            <div className="text-[11px] text-slate-400 mt-0.5">{STYLES[k].label}</div>
          </div>
        ))}
      </div>

      {sorted.length > 0 ? (
        <ul className="mt-4 divide-y divide-white/5">
          {sorted.map((m, i) => (
            <li key={i} className="py-2.5 flex items-center gap-2.5 text-sm">
              <Medal className={`w-4 h-4 shrink-0 ${STYLES[m.medal].color}`} />
              <div className="min-w-0">
                <div className="text-white truncate">{m.tournament_name}</div>
                <div className="text-[11px] text-slate-500 truncate">
                  {m.division}{m.date ? ` · ${new Date(m.date).toLocaleDateString()}` : ""}
                </div>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-4 text-sm text-slate-500 text-center">No medals yet — win a bracket final to earn one 🏅</p>
      )}
    </div>
  );
}