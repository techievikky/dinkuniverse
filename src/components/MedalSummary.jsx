import React from "react";
import { Medal } from "lucide-react";

const STYLES = {
  gold: { color: "text-amber-300", chip: "bg-amber-400/15 border-amber-400/30", label: "Gold" },
  silver: { color: "text-slate-300", chip: "bg-slate-400/15 border-slate-400/30", label: "Silver" },
  bronze: { color: "text-orange-400", chip: "bg-orange-500/15 border-orange-500/30", label: "Bronze" },
};
const ORDER = { gold: 0, silver: 1, bronze: 2 };

export function MedalCounts({ medals }) {
  const counts = { gold: 0, silver: 0, bronze: 0 };
  for (const m of medals || []) counts[m.medal] = (counts[m.medal] || 0) + 1;
  return (
    <div className="grid grid-cols-3 gap-2">
      {["gold", "silver", "bronze"].map((k) => (
        <div key={k} className={`rounded-2xl border ${STYLES[k].chip} p-3 text-center`}>
          <Medal className={`w-5 h-5 mx-auto ${STYLES[k].color}`} />
          <div className="text-2xl font-bold text-white mt-1">{counts[k]}</div>
          <div className="text-[11px] text-slate-400">{STYLES[k].label}</div>
        </div>
      ))}
    </div>
  );
}

// Shows gold/silver/bronze counts and (unless compact) the medal history list.
export default function MedalSummary({ medals, compact = false }) {
  if (!medals || medals.length === 0) {
    return compact ? null : (
      <div className="text-sm text-slate-500">No tournament medals yet — win a bracket to earn one 🏅</div>
    );
  }
  const sorted = [...medals].sort((a, b) => {
    const d = (ORDER[a.medal] ?? 9) - (ORDER[b.medal] ?? 9);
    if (d) return d;
    return (b.date || "").localeCompare(a.date || "");
  });
  return (
    <div>
      <MedalCounts medals={medals} />
      {!compact && (
        <ul className="mt-3 divide-y divide-white/5">
          {sorted.map((m, i) => (
            <li key={i} className="py-2 flex items-center gap-2.5 text-sm">
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
      )}
    </div>
  );
}