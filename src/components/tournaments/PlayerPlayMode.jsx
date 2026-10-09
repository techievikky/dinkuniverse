import React, { useState, useEffect, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { useToast } from "@/components/ui/use-toast";
import { Clock, Flag, Radio, CheckCircle2, MapPin, Zap } from "lucide-react";
import PlayerMatchScoreActions from "@/components/tournaments/PlayerMatchScoreActions";
import PoolStandings from "@/components/tournaments/PoolStandings";

const STAGES = [
  { key: "queued", label: "Queued", icon: Clock, color: "text-amber-300", chip: "bg-amber-400/15 border-amber-400/30" },
  { key: "staged", label: "Staged", icon: Flag, color: "text-orange-300", chip: "bg-orange-500/15 border-orange-500/30" },
  { key: "on_deck", label: "On Deck", icon: Radio, color: "text-rose-300", chip: "bg-rose-500/15 border-rose-500/30" },
  { key: "completed", label: "Done", icon: CheckCircle2, color: "text-emerald-300", chip: "bg-emerald-500/15 border-emerald-500/30" },
];
const stageOf = (s) => STAGES.find((x) => x.key === s);
const isWaiting = (s) => s === "pending" || s === "ready";

// Read-only live play board for registered players. Shows every match grouped
// by division with its stage + court, highlights the player's own matches, and
// fires a toast alert whenever one of their matches changes status (via the
// Match realtime subscription).
export default function PlayerPlayMode({ tournament, myTeamNames, user, userName }) {
  const { toast } = useToast();
  const [matches, setMatches] = useState([]);
  const [submissions, setSubmissions] = useState({}); // matchId -> pending ScoreSubmission
  const prevStatus = useRef({}); // matchId -> last known status

  const involvesMe = (m) => myTeamNames.has(m.team_a) || myTeamNames.has(m.team_b);

  // Initial load + seed known statuses so we only alert on real transitions.
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const ms = await base44.entities.Match.filter({ tournament_id: tournament.id }, "round", 500);
        if (!active) return;
        const map = {};
        for (const m of ms) map[m.id] = m.status;
        prevStatus.current = map;
        setMatches(ms);
      } catch {
        /* best-effort */
      }
    })();
    return () => { active = false; };
  }, [tournament.id]);

  const loadSubmissions = async () => {
    try {
      const subs = await base44.entities.ScoreSubmission.filter({ tournament_id: tournament.id, status: "pending" });
      const map = {};
      for (const s of subs) map[s.match_id] = s;
      setSubmissions(map);
    } catch {
      /* best-effort */
    }
  };

  useEffect(() => {
    loadSubmissions();
    const unsub = base44.entities.ScoreSubmission.subscribe((event) => {
      const s = event.data;
      if (!s || s.tournament_id !== tournament.id) return;
      setSubmissions((prev) => {
        const next = { ...prev };
        if (event.type === "delete" || s.status !== "pending") delete next[s.match_id];
        else next[s.match_id] = s;
        return next;
      });
    });
    return unsub;
  }, [tournament.id]);

  // Realtime: refresh on any match change for this tournament and alert on the
  // player's own match status transitions.
  useEffect(() => {
    const unsub = base44.entities.Match.subscribe((event) => {
      const m = event.data;
      if (!m || m.tournament_id !== tournament.id) return;
      if (event.type === "delete") {
        setMatches((prev) => prev.filter((x) => x.id !== m.id));
        return;
      }
      setMatches((prev) => {
        const exists = prev.find((x) => x.id === m.id);
        return exists ? prev.map((x) => (x.id === m.id ? m : x)) : [...prev, m];
      });

      if (event.type === "update" && involvesMe(m)) {
        const before = prevStatus.current[m.id];
        if (before && before !== m.status) {
          const a = m.team_a || "TBD";
          const b = m.team_b || "TBD";
          const court = m.court ? ` · Court ${m.court}` : "";
          let title = "";
          let desc = tournament.name;
          if (m.status === "queued") title = `Queued up — ${a} vs ${b}`;
          else if (m.status === "staged") title = `Staged! Head to staging — ${a} vs ${b}${court}`;
          else if (m.status === "on_deck") title = `On Deck — be ready! ${a} vs ${b}${court}`;
          else if (m.status === "completed") title = `Final: ${a} ${m.score_a ?? 0} : ${m.score_b ?? 0} ${b}`;
          if (title) toast({ title, description: desc });
        }
      }
      prevStatus.current[m.id] = m.status;
    });
    return unsub;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tournament.id, tournament.name, myTeamNames]);

  const counts = { queued: 0, staged: 0, on_deck: 0, completed: 0, waiting: 0 };
  for (const m of matches) {
    if (isWaiting(m.status)) counts.waiting++;
    else if (counts[m.status] != null) counts[m.status]++;
  }

  const byDivision = {};
  for (const m of matches) (byDivision[m.division || "Matches"] ||= []).push(m);

  const myMatches = matches.filter(involvesMe);

  return (
    <div className="rounded-2xl border border-lime-400/40 bg-lime-400/[0.04] p-4">
      <div className="flex items-center gap-2 mb-3">
        <span className="relative flex h-2.5 w-2.5">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-lime-400 opacity-60" />
          <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-lime-400" />
        </span>
        <Zap className="w-4 h-4 text-lime-300" />
        <h4 className="font-display font-semibold text-lime-200 text-sm uppercase tracking-wide">Play mode is live</h4>
      </div>

      <div className="grid grid-cols-4 gap-2 mb-4">
        {STAGES.map((s) => (
          <div key={s.key} className={`rounded-xl border ${s.chip} p-2 text-center`}>
            <s.icon className={`w-3.5 h-3.5 mx-auto ${s.color}`} />
            <div className="text-lg font-bold text-white mt-0.5">{counts[s.key] || 0}</div>
            <div className="text-[10px] text-slate-400">{s.label}</div>
          </div>
        ))}
      </div>

      {matches.some((m) => m.stage === "pool") && <PoolStandings matches={matches} />}

      {myMatches.length > 0 && (
        <div className="mb-4">
          <div className="text-xs font-semibold text-lime-300 mb-2">Your matches</div>
          <div className="space-y-2">
            {myMatches.map((m) => (
              <MatchRow
                key={m.id}
                m={m}
                mine
                actions={<PlayerMatchScoreActions match={m} tournament={tournament} submission={submissions[m.id]} user={user} userName={userName} onRefresh={loadSubmissions} />}
              />
            ))}
          </div>
        </div>
      )}

      <div className="space-y-4">
        {Object.entries(byDivision).map(([div, ms]) => (
          <div key={div}>
            <div className="text-xs text-slate-400 mb-1.5">{div}</div>
            <div className="space-y-2">
              {[...ms].sort((a, b) => a.round - b.round || a.index - b.index).map((m) => (
                <MatchRow
                  key={m.id}
                  m={m}
                  mine={involvesMe(m)}
                  actions={<PlayerMatchScoreActions match={m} tournament={tournament} submission={submissions[m.id]} user={user} userName={userName} onRefresh={loadSubmissions} />}
                />
              ))}
            </div>
          </div>
        ))}
        {matches.length === 0 && (
          <p className="text-sm text-slate-400 text-center py-4">Waiting for the organizer to queue up matches…</p>
        )}
      </div>
    </div>
  );
}

function MatchRow({ m, mine, actions }) {
  const st = stageOf(m.status);
  const a = m.team_a || "TBD";
  const b = m.team_b || "TBD";
  return (
    <div className={`rounded-xl border p-2.5 ${mine ? "border-lime-400/40 bg-lime-400/[0.06]" : "border-white/10 bg-white/[0.03]"}`}>
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="text-sm text-white truncate">
            {a} <span className="text-slate-500">vs</span> {b}
            {mine && <span className="ml-1.5 text-[10px] font-bold text-lime-300 align-middle">YOU</span>}
          </div>
          <div className="text-[11px] text-slate-500 truncate flex items-center gap-1.5">
            Round {m.round}{m.stage ? ` · ${m.stage}` : ""}
            {m.court && <><MapPin className="w-3 h-3" />Court {m.court}</>}
          </div>
        </div>
        {st ? (
          <span className={`shrink-0 text-[11px] px-2 py-1 rounded-full border font-medium inline-flex items-center gap-1 ${st.chip} ${st.color}`}>
            <st.icon className="w-3 h-3" /> {st.label}
          </span>
        ) : (
          <span className="shrink-0 text-[11px] px-2 py-1 rounded-full border bg-white/5 text-slate-400 border-white/10">Waiting</span>
        )}
      </div>
      {m.status === "completed" && (
        <div className="mt-1.5 text-sm text-emerald-300">
          Final: {a} {m.score_a ?? 0} : {m.score_b ?? 0} {b}
          <span className="ml-2 text-[11px] text-slate-400">diff {Math.abs((m.score_a ?? 0) - (m.score_b ?? 0))}</span>
        </div>
      )}
      {actions}
    </div>
  );
}