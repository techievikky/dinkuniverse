import React, { useMemo, useState } from "react";
import { Users, X, Shuffle, Save, Loader2 } from "lucide-react";

const keyFn = (d) => `${d.category}|${d.dupr_min ?? 0}|${d.dupr_max ?? 8}`;
const labelFn = (d) =>
  `${d.categoryLabel ?? d.category} · DUPR ${d.dupr_min ?? 0}-${d.dupr_max ?? 8}`;

// ManualScheduler lets an organizer hand-pick team pairings per division to form
// round-1 matches, instead of auto-generating a bracket.
//
// Props:
//  - divisions: [{ category, dupr_min, dupr_max, ... }]
//  - entriesByDivision: { [divisionKey]: [{ name, category, dupr_min, dupr_max }] }
//  - onSave(matchesToCreate): called with an array of match payloads to persist.
//  - saving: boolean (disable while persisting)
export default function ManualScheduler({ divisions, entriesByDivision, onSave, saving }) {
  // pairs[divisionKey] = [{ a: name, b: name | null }]
  const [pairs, setPairs] = useState({});
  // picked[divisionKey] = name currently selected awaiting its opponent
  const [picked, setPicked] = useState({});

  const usedByDivision = useMemo(() => {
    const map = {};
    for (const d of divisions) {
      const k = keyFn(d);
      const set = new Set();
      (pairs[k] || []).forEach((p) => {
        if (p.a) set.add(p.a);
        if (p.b) set.add(p.b);
      });
      map[k] = set;
    }
    return map;
  }, [pairs, divisions]);

  const togglePick = (k, name) => {
    setPicked((s) => {
      const cur = s[k];
      if (cur === name) return { ...s, [k]: null };
      if (cur) {
        // Already have a pick — form a pair with this as the opponent.
        setPairs((p) => ({ ...p, [k]: [...(p[k] || []), { a: cur, b: name }] }));
        return { ...s, [k]: null };
      }
      return { ...s, [k]: name };
    });
  };

  const removePair = (k, idx) => {
    setPairs((p) => ({ ...p, [k]: (p[k] || []).filter((_, i) => i !== idx) }));
  };

  const autoPair = (k, names) => {
    const remaining = names.filter((n) => !usedByDivision[k].has(n) && picked[k] !== n);
    // carry over the current single pick as the first slot if present
    const startList = picked[k] ? [picked[k], ...remaining] : remaining;
    const newPairs = [];
    for (let i = 0; i + 1 < startList.length; i += 2) {
      newPairs.push({ a: startList[i], b: startList[i + 1] });
    }
    if (newPairs.length) {
      setPairs((p) => ({ ...p, [k]: [...(p[k] || []), ...newPairs] }));
      setPicked((s) => ({ ...s, [k]: null }));
    }
  };

  const submit = () => {
    const toCreate = [];
    for (const d of divisions) {
      const k = keyFn(d);
      (pairs[k] || []).forEach((p, idx) => {
        if (!p.a && !p.b) return;
        toCreate.push({
          tournament_id: undefined, // filled by parent
          division: labelFn(d),
          category: d.category,
          round: 1,
          index: idx,
          team_a: p.a || null,
          team_b: p.b || null,
          score_a: null,
          score_b: null,
          winner: null,
          status: p.a && p.b ? "ready" : "pending",
        });
      });
    }
    if (!toCreate.length) return;
    onSave(toCreate);
  };

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 space-y-4">
      <div className="flex items-center gap-2 text-slate-300 text-sm">
        <Users className="w-4 h-4 text-lime-400" />
        <span>Tap a team, then tap its opponent to form a match. Repeat for each division.</span>
      </div>

      {divisions.length === 0 && (
        <p className="text-slate-500 text-sm text-center py-4">No divisions yet — add teams above first.</p>
      )}

      {divisions.map((d) => {
        const k = keyFn(d);
        const all = (entriesByDivision[k] || []).map((e) => e.name);
        const available = all.filter((n) => !usedByDivision[k].has(n) && picked[k] !== n);
        const cur = picked[k];
        const divPairs = pairs[k] || [];

        return (
          <div key={k} className="rounded-xl border border-white/10 bg-white/[0.02] p-3">
            <div className="flex items-center justify-between gap-2 mb-2">
              <h4 className="font-semibold text-white text-sm">{labelFn(d)}</h4>
              <span className="text-xs text-slate-400">{all.length} teams</span>
            </div>

            {all.length === 0 ? (
              <p className="text-xs text-slate-500">No registered teams in this division.</p>
            ) : (
              <>
                <div className="flex flex-wrap gap-2 mb-3">
                  {all.map((name) => {
                    const used = usedByDivision[k].has(name);
                    const isPicked = cur === name;
                    return (
                      <button
                        key={name}
                        type="button"
                        disabled={used && !isPicked}
                        onClick={() => togglePick(k, name)}
                        className={[
                          "px-3 py-1.5 rounded-full text-xs font-medium border transition",
                          isPicked
                            ? "bg-lime-400 text-slate-900 border-lime-400"
                            : used
                            ? "bg-transparent text-slate-600 border-white/5 line-through cursor-not-allowed"
                            : "bg-white/5 text-slate-200 border-white/10 hover:border-lime-400/40 hover:text-lime-200",
                        ].join(" ")}
                      >
                        {name}
                      </button>
                    );
                  })}
                </div>

                {cur && (
                  <p className="text-[11px] text-lime-300 mb-2">
                    “{cur}” selected — tap an opponent to pair, or tap it again to deselect.
                  </p>
                )}

                {available.length >= 1 && (
                  <button
                    type="button"
                    onClick={() => autoPair(k, all)}
                    className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-white/10 text-slate-300 hover:bg-white/5 hover:text-white mb-3"
                  >
                    <Shuffle className="w-3.5 h-3.5" /> Auto-pair remaining
                  </button>
                )}

                {divPairs.length > 0 && (
                  <ul className="space-y-1.5">
                    {divPairs.map((p, i) => (
                      <li key={i} className="flex items-center justify-between gap-2 rounded-lg bg-white/[0.03] px-3 py-2">
                        <span className="text-sm text-slate-200 truncate">
                          <span className="text-white font-medium">{p.a || "—"}</span>
                          <span className="text-slate-500 mx-1.5">vs</span>
                          <span className="text-white font-medium">{p.b || "—"}</span>
                        </span>
                        <button
                          type="button"
                          onClick={() => removePair(k, i)}
                          className="w-7 h-7 rounded-lg hover:bg-rose-500/15 hover:text-rose-300 text-slate-400 flex items-center justify-center"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </div>
        );
      })}

      <button
        type="button"
        disabled={saving}
        onClick={submit}
        className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-lime-400 hover:bg-lime-300 disabled:opacity-60 text-slate-900 font-semibold transition"
      >
        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
        Save manual schedule
      </button>
    </div>
  );
}