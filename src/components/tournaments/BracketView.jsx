import React, { useState } from "react";
import { Loader2, Save, AlertTriangle } from "lucide-react";
import { roundName } from "@/lib/bracket";
import UserAvatar from "@/components/UserAvatar";
import ArrivedAvatar from "@/components/ArrivedAvatar";
import PoolStandings from "@/components/tournaments/PoolStandings";

// Renders one division's single-elimination bracket grouped by round, with
// inline score entry when `editable` is true.
export default function BracketView({ matches, editable, onSaveScore, saving, teamMeta = {}, canReport, onReport }) {
  if (!matches || matches.length === 0) return null;

  const byRound = {};
  for (const m of matches) {
    (byRound[m.round] ||= []).push(m);
    byRound[m.round].sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
  }
  const roundNumbers = Object.keys(byRound).map(Number).sort((a, b) => a - b);
  const rounds = roundNumbers.length ? roundNumbers[roundNumbers.length - 1] : 1;
  const labelFor = (r) => {
    const stage = byRound[r]?.[0]?.stage;
    if (stage === "final") return "Final";
    if (stage === "semifinal") return "Semifinal";
    if (stage === "pool") return `Pool · Round ${r}`;
    return roundName(r, rounds);
  };

  return (
    <div className="space-y-4">
      {matches.some((m) => m.stage === "pool") && <PoolStandings matches={matches} />}
      {roundNumbers.map((r) => (
        <div key={r}>
          <h4 className="text-xs font-semibold text-lime-300 uppercase tracking-wide mb-2">{labelFor(r)}</h4>
          <div className="space-y-2">
            {byRound[r].map((m) => (
              <MatchRow key={m.id} match={m} editable={editable} onSaveScore={onSaveScore} saving={saving} teamMeta={teamMeta} canReport={canReport} onReport={onReport} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function MatchRow({ match, editable, onSaveScore, saving, teamMeta, canReport, onReport }) {
  const [a, setA] = useState(match.score_a ?? "");
  const [b, setB] = useState(match.score_b ?? "");
  const hasBoth = !!(match.team_a && match.team_b);
  const isBye = (!match.team_a || !match.team_b) && (match.team_a || match.team_b);
  const completed = match.status === "completed";
  const winnerA = completed && match.winner === "A";
  const winnerB = completed && match.winner === "B";

  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
      <div className="space-y-2">
        <TeamLine name={match.team_a} score={a} onScore={setA} won={winnerA} editable={editable && hasBoth} label="A" meta={teamMeta?.[match.team_a]} />
        <div className="border-t border-white/5" />
        <TeamLine name={match.team_b} score={b} onScore={setB} won={winnerB} editable={editable && hasBoth} label="B" meta={teamMeta?.[match.team_b]} />
      </div>
      {isBye && (
        <p className="mt-2 text-[11px] text-slate-500 italic">bye — {match.team_a || match.team_b} advances</p>
      )}
      {!hasBoth && !isBye && (
        <p className="mt-2 text-[11px] text-slate-500 italic">awaiting teams — seeded from pool results</p>
      )}
      {editable && hasBoth && (
        <button
          type="button"
          disabled={saving}
          onClick={() => onSaveScore(match, a, b)}
          className="mt-2 w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-lime-400/15 hover:bg-lime-400/25 text-lime-200 text-xs font-semibold transition disabled:opacity-50"
        >
          {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
          {completed ? "Update score" : "Record score"}
        </button>
      )}
      {completed && canReport && canReport(match) && (
        <button
          type="button"
          onClick={() => onReport(match)}
          className="mt-2 w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-amber-500/15 hover:bg-amber-500/25 text-amber-200 text-xs font-semibold transition"
        >
          <AlertTriangle className="w-3.5 h-3.5" /> Report score discrepancy
        </button>
      )}
      {completed && hasBoth && (
        <div className="mt-1 text-center text-[11px] text-slate-500">
          Point differential: {Math.abs((match.score_a ?? 0) - (match.score_b ?? 0))}
        </div>
      )}
    </div>
  );
}

function TeamLine({ name, score, onScore, won, editable, label, meta }) {
  const inputCls =
    "w-12 bg-white/5 border border-white/10 rounded-lg px-2 py-1 text-center text-sm text-white focus:outline-none focus:border-lime-400/50";
  return (
    <div className="flex items-center gap-2">
      <ArrivedAvatar arrived={!!meta?.arrived} name={name || "?"} photo_url={meta?.photo_url} size="xs" className="shrink-0" />
      <span className={`flex-1 text-sm truncate ${won ? "text-lime-300 font-semibold" : "text-slate-200"}`}>
        {name || <span className="text-slate-600 italic">TBD</span>}
      </span>
      {editable ? (
        <input
          type="number"
          min="0"
          inputMode="numeric"
          placeholder={label === "A" ? "0" : "0"}
          className={inputCls}
          value={score}
          onChange={(e) => onScore(e.target.value)}
        />
      ) : (
        <span className={`w-12 text-center text-sm ${won ? "text-lime-300 font-bold" : "text-slate-300"}`}>
          {score !== "" && score != null ? score : "–"}
        </span>
      )}
    </div>
  );
}