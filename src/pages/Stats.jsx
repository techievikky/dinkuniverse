import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { Loader2, Trophy, Activity, Target, Flame } from "lucide-react";
import MedalSummary from "@/components/MedalSummary";
import PlayerInsights from "@/components/stats/PlayerInsights";

export default function Stats() {
  const { user } = useAuth();
  const [plays, setPlays] = useState([]);
  const [medals, setMedals] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const data = await base44.entities.Play.list("-date", 200);
        setPlays(data);
        try {
          const ms = await base44.entities.TournamentMedal.filter({ user_id: user.id });
          setMedals(ms);
        } catch { /* ignore */ }
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-slate-500" />
      </div>
    );
  }

  const myPlays = plays.filter((p) => p.players?.some((pl) => pl.user_id === user?.id));
  const completed = myPlays.filter((p) => p.status === "completed");
  const wins = completed.filter((p) => {
    // Approximate win: host's team. We treat the player as Team A if host, else by parity of index.
    const idx = p.players?.findIndex((pl) => pl.user_id === user.id);
    const myTeam = idx % 2 === 0 ? "Team A" : "Team B";
    return p.winner === myTeam;
  }).length;
  const losses = completed.length - wins;
  const winRate = completed.length ? Math.round((wins / completed.length) * 100) : 0;

  const stats = [
    { label: "Plays joined", value: myPlays.length, icon: Activity, color: "text-lime-400" },
    { label: "Games completed", value: completed.length, icon: Target, color: "text-sky-400" },
    { label: "Wins", value: wins, icon: Trophy, color: "text-amber-400" },
    { label: "Win rate", value: `${winRate}%`, icon: Flame, color: "text-rose-400" },
  ];

  return (
    <div>
      <h1 className="font-display text-2xl sm:text-3xl font-bold text-white tracking-tight">My stats</h1>
      <p className="text-slate-400 text-sm mt-1 mb-6">Your pickleball track record.</p>

      <div className="grid grid-cols-2 gap-3">
        {stats.map((s) => {
          const Icon = s.icon;
          return (
            <div key={s.label} className="rounded-2xl border border-white/5 bg-white/[0.03] p-5">
              <Icon className={`w-5 h-5 ${s.color} mb-3`} />
              <div className="text-3xl font-bold text-white">{s.value}</div>
              <div className="text-xs text-slate-400 mt-1">{s.label}</div>
            </div>
          );
        })}
      </div>

      <PlayerInsights completed={completed} userId={user?.id} />

      <div className="mt-6 rounded-2xl border border-white/5 bg-white/[0.03] p-5">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-3">Tournament medals</h3>
        <MedalSummary medals={medals} />
      </div>

      <div className="mt-6 rounded-2xl border border-white/5 bg-white/[0.03] p-5">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-3">Recent plays</h3>
        {myPlays.length === 0 ? (
          <p className="text-sm text-slate-500">You haven't joined any plays yet.</p>
        ) : (
          <ul className="divide-y divide-white/5">
            {myPlays.slice(0, 6).map((p) => (
              <li key={p.id} className="py-3 flex items-center justify-between text-sm">
                <div className="min-w-0">
                  <div className="text-white truncate">{p.title}</div>
                  <div className="text-xs text-slate-500">{new Date(p.date).toLocaleDateString()} · {p.location}</div>
                </div>
                <span className={`text-xs px-2 py-1 rounded-full ${
                  p.status === "completed" ? "bg-emerald-500/15 text-emerald-300" : "bg-white/5 text-slate-300"
                }`}>
                  {p.status === "completed" ? "Done" : p.status}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}