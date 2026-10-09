import React, { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Link } from "react-router-dom";
import { Loader2, Activity, Trophy, Medal, CalendarClock, MapPin } from "lucide-react";

const today = () => new Date().toISOString().slice(0, 10);

// Social activity feed for a player: a single timeline merging recent match
// results (plays + tournament matches), earned medals, and upcoming game
// registrations (plays + tournaments). Self-contained — fetches its own data.
export default function PlayerActivityFeed({ user }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    (async () => {
      if (!user?.id) return;
      try {
        const uid = user.id;
        const [plays, tournaments, medals] = await Promise.all([
          base44.entities.Play.list("-date", 100),
          base44.entities.Tournament.list("-date", 60),
          base44.entities.TournamentMedal.filter({ user_id: uid }).catch(() => []),
        ]);

        const feed = [];

        // Plays: completed results + upcoming registrations.
        for (const p of plays) {
          const mine = (p.players || []).some((pl) => pl.user_id === uid);
          if (!mine) continue;
          if (p.status === "completed") {
            let label = "Final";
            if (p.winner === "Team A") label = `Team A won ${p.score_team_a ?? 0}–${p.score_team_b ?? 0}`;
            else if (p.winner === "Team B") label = `Team B won ${p.score_team_b ?? 0}–${p.score_team_a ?? 0}`;
            else if (p.winner === "Tie") label = `Tie ${p.score_team_a ?? 0}–${p.score_team_b ?? 0}`;
            feed.push({
              kind: "result-play",
              date: p.date,
              title: p.title,
              detail: [p.location, label].filter(Boolean).join(" · "),
              link: `/plays/${p.id}`,
            });
          } else if (p.status === "open" && (p.date || "") >= today()) {
            feed.push({
              kind: "upcoming-play",
              date: p.date,
              title: p.title,
              detail: [p.location, `${(p.players || []).length}/${p.max_players || 4} players`].filter(Boolean).join(" · "),
              link: `/plays/${p.id}`,
            });
          }
        }

        // Tournaments: upcoming registrations + completed match results.
        const entered = tournaments.filter((t) => (t.entries || []).some((e) => e.user_id === uid));
        const myTeamNames = new Set();
        for (const t of entered) for (const e of t.entries || []) if (e.user_id === uid) myTeamNames.add(e.name);

        const withMatches = entered.filter((t) => t.status === "plays" || t.status === "completed");
        const matchResults = await Promise.all(
          withMatches.map((t) =>
            base44.entities.Match.filter({ tournament_id: t.id }, "round", 500).then((ms) => [t, ms])
          )
        );
        for (const [t, ms] of matchResults) {
          for (const m of ms) {
            if (m.status !== "completed" || !m.winner) continue;
            const aMine = myTeamNames.has(m.team_a);
            const bMine = myTeamNames.has(m.team_b);
            if (!aMine && !bMine) continue;
            const iWon = (m.winner === "A" && aMine) || (m.winner === "B" && bMine);
            const myScore = aMine ? m.score_a : m.score_b;
            const oppScore = aMine ? m.score_b : m.score_a;
            const opp = aMine ? m.team_b : m.team_a;
            feed.push({
              kind: iWon ? "result-win" : "result-loss",
              date: t.date,
              title: t.name,
              detail: `${m.division || "Tournament"} · vs ${opp || "TBD"} — ${myScore ?? 0}–${oppScore ?? 0}`,
            });
          }
        }
        for (const t of entered) {
          if ((t.status === "open" || t.status === "plays") && (t.date || "") >= today()) {
            feed.push({
              kind: "upcoming-tournament",
              date: t.date,
              title: t.name,
              detail: t.location || "Tournament",
            });
          }
        }

        // Medals.
        for (const m of medals) {
          feed.push({
            kind: `medal-${m.medal}`,
            date: m.date,
            title: m.tournament_name,
            detail: m.division || "Tournament",
          });
        }

        feed.sort((a, b) => (b.date || "").localeCompare(a.date || ""));
        if (active) setItems(feed.slice(0, 30));
      } catch {
        /* best-effort */
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [user?.id]);

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 mb-6">
      <h2 className="font-display text-lg font-semibold text-white flex items-center gap-2">
        <Activity className="w-5 h-5 text-lime-300" /> Activity feed
      </h2>
      <p className="text-xs text-slate-400 mt-1 mb-4">Recent results, medals, and upcoming games.</p>

      {loading ? (
        <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-slate-500" /></div>
      ) : items.length === 0 ? (
        <p className="text-sm text-slate-500 text-center py-6">No activity yet — join a game or tournament to get started.</p>
      ) : (
        <ul className="space-y-2">
          {items.map((it, i) => <FeedRow key={i} item={it} />)}
        </ul>
      )}
    </div>
  );
}

const KIND = {
  "result-play": { Icon: Trophy, wrap: "bg-slate-500/15 text-slate-300", badge: null },
  "result-win": { Icon: Trophy, wrap: "bg-emerald-500/15 text-emerald-300", badge: "Win", badgeCls: "bg-emerald-500/15 text-emerald-300 border-emerald-500/20" },
  "result-loss": { Icon: Trophy, wrap: "bg-rose-500/15 text-rose-300", badge: "Loss", badgeCls: "bg-rose-500/15 text-rose-300 border-rose-500/20" },
  "upcoming-play": { Icon: CalendarClock, wrap: "bg-lime-500/15 text-lime-300", badge: "Upcoming", badgeCls: "bg-lime-500/15 text-lime-300 border-lime-500/20" },
  "upcoming-tournament": { Icon: CalendarClock, wrap: "bg-sky-500/15 text-sky-300", badge: "Upcoming", badgeCls: "bg-sky-500/15 text-sky-300 border-sky-500/20" },
  "medal-gold": { Icon: Medal, wrap: "bg-amber-400/15 text-amber-300", badge: "Gold", badgeCls: "bg-amber-400/15 text-amber-300 border-amber-400/20" },
  "medal-silver": { Icon: Medal, wrap: "bg-slate-300/15 text-slate-300", badge: "Silver", badgeCls: "bg-slate-300/15 text-slate-300 border-slate-300/20" },
  "medal-bronze": { Icon: Medal, wrap: "bg-orange-500/15 text-orange-300", badge: "Bronze", badgeCls: "bg-orange-500/15 text-orange-300 border-orange-500/20" },
};

function FeedRow({ item }) {
  const cfg = KIND[item.kind] || KIND["result-play"];
  const Icon = cfg.Icon;
  const date = item.date ? new Date(item.date).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : "";

  const inner = (
    <div className="flex items-center gap-3 rounded-xl bg-white/[0.03] border border-white/5 px-3 py-2.5 hover:bg-white/[0.06] transition">
      <div className={`shrink-0 w-8 h-8 rounded-lg flex items-center justify-center ${cfg.wrap}`}>
        <Icon className="w-4 h-4" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <div className="text-sm text-slate-100 font-medium truncate">{item.title}</div>
          {date && <div className="text-[10px] text-slate-500 shrink-0">{date}</div>}
        </div>
        <div className="text-xs text-slate-400 truncate mt-0.5">{item.detail}</div>
      </div>
      {cfg.badge && (
        <span className={`shrink-0 text-[10px] px-2 py-0.5 rounded-full border font-medium ${cfg.badgeCls}`}>{cfg.badge}</span>
      )}
    </div>
  );

  return (
    <li>
      {item.link ? <Link to={item.link} className="block">{inner}</Link> : inner}
    </li>
  );
}