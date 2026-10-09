import React, { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { Link } from "react-router-dom";
import { Clock, Flag, Radio, MapPin } from "lucide-react";

// Live banner on the player home page: shows the current stage (queued /
// staged / on deck) for any of the player's matches in tournaments that are
// in play, so they know when to head to the court.
const STAGE = {
  on_deck: { label: "On Deck", color: "text-rose-300", chip: "bg-rose-500/15 border-rose-500/30", icon: Radio, priority: 3 },
  staged: { label: "Staged", color: "text-orange-300", chip: "bg-orange-500/15 border-orange-500/30", icon: Flag, priority: 2 },
  queued: { label: "Queued up", color: "text-amber-300", chip: "bg-amber-400/15 border-amber-400/30", icon: Clock, priority: 1 },
};

export default function MatchStatusAlert() {
  const { user } = useAuth();
  const [alerts, setAlerts] = useState([]);

  useEffect(() => {
    let active = true;
    (async () => {
      if (!user?.id) return;
      try {
        const tourns = await base44.entities.Tournament.filter({ status: "plays" });
        const matches = await base44.entities.Match.list("-updated_date", 500);
        const list = [];
        for (const t of tourns) {
          const myEntries = (t.entries || []).filter(
            (e) => e.user_id === user.id || e.partner_user_id === user.id
          );
          const myNames = new Set(myEntries.map((e) => e.name));
          if (!myNames.size) continue;
          for (const m of matches) {
            if (m.tournament_id !== t.id) continue;
            if (!(m.team_a && m.team_b)) continue;
            const mineA = myNames.has(m.team_a);
            const mineB = myNames.has(m.team_b);
            if (!mineA && !mineB) continue;
            const stage = STAGE[m.status];
            if (!stage) continue;
            const opponent = mineA ? m.team_b : m.team_a;
            list.push({ tournament: t, match: m, opponent, stage });
          }
        }
        list.sort((a, b) => b.stage.priority - a.stage.priority);
        if (active) setAlerts(list.slice(0, 3));
      } catch {
        /* best-effort */
      }
    })();
    return () => {
      active = false;
    };
  }, [user?.id]);

  if (!alerts.length) return null;

  return (
    <div className="mb-5 space-y-2">
      {alerts.map((a, i) => {
        const S = a.stage;
        const Icon = S.icon;
        return (
          <Link to="/chats" key={i} className={`block rounded-2xl border ${S.chip} p-3.5 hover:opacity-90 transition`}>
            <div className="flex items-center gap-3">
              <Icon className={`w-5 h-5 shrink-0 ${S.color}`} />
              <div className="min-w-0 flex-1">
                <div className={`text-sm font-semibold ${S.color}`}>Your match is {S.label.toLowerCase()}</div>
                <div className="text-xs text-slate-300 truncate">
                  {a.tournament.name} · you vs {a.opponent || "TBD"}
                  {a.match.court ? (
                    <span className="inline-flex items-center gap-1 ml-1">
                      <MapPin className="w-3 h-3" /> Court {a.match.court}
                    </span>
                  ) : null}
                </div>
              </div>
              <span className="text-xs text-slate-400 shrink-0">View chat →</span>
            </div>
          </Link>
        );
      })}
    </div>
  );
}