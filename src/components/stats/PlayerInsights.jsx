import React, { useMemo } from "react";
import {
  ResponsiveContainer, ComposedChart, BarChart, Bar, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from "recharts";
import { TrendingUp, BarChart3 } from "lucide-react";

const SKILL_ORDER = ["Beginner", "Intermediate", "Advanced", "Open"];
const skillRank = (lvl) => {
  const i = SKILL_ORDER.indexOf(lvl);
  return i === -1 ? 99 : i;
};
const fmtMonth = (ym) => {
  const [y, m] = ym.split("-");
  return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString(undefined, { month: "short", year: "2digit" });
};

// Player insights dashboard: win/loss trend over time (stacked monthly bars +
// cumulative win-rate line) and a win/loss breakdown by opponent skill level.
export default function PlayerInsights({ completed, userId }) {
  const wonPlay = (p) => {
    const idx = p.players?.findIndex((pl) => pl.user_id === userId);
    const myTeam = idx % 2 === 0 ? "Team A" : "Team B";
    return p.winner === myTeam;
  };

  const trend = useMemo(() => {
    const byMonth = {};
    for (const p of completed) {
      const ym = p.date?.slice(0, 7);
      if (!ym) continue;
      byMonth[ym] ||= { month: ym, label: fmtMonth(ym), wins: 0, losses: 0 };
      if (wonPlay(p)) byMonth[ym].wins++;
      else byMonth[ym].losses++;
    }
    let tw = 0, tl = 0;
    return Object.values(byMonth)
      .sort((a, b) => a.month.localeCompare(b.month))
      .map((t) => {
        tw += t.wins; tl += t.losses;
        return { ...t, winRate: tw + tl ? Math.round((tw / (tw + tl)) * 100) : 0 };
      });
  }, [completed, userId]);

  const bySkill = useMemo(() => {
    const map = {};
    for (const p of completed) {
      const lvl = p.skill_level || "Open";
      map[lvl] ||= { level: lvl, wins: 0, losses: 0 };
      if (wonPlay(p)) map[lvl].wins++;
      else map[lvl].losses++;
    }
    return Object.values(map).sort((a, b) => skillRank(a.level) - skillRank(b.level));
  }, [completed, userId]);

  if (!completed.length) return null;

  const tooltipStyle = { background: "#0f172a", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12, fontSize: 12 };

  return (
    <div className="mt-6 space-y-5">
      <div className="rounded-2xl border border-white/5 bg-white/[0.03] p-5">
        <h3 className="text-sm font-semibold text-white flex items-center gap-2 mb-4">
          <TrendingUp className="w-4 h-4 text-lime-400" /> Win-loss trend over time
        </h3>
        {trend.length ? (
          <ResponsiveContainer width="100%" height={220}>
            <ComposedChart data={trend} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
              <XAxis dataKey="label" tick={{ fill: "#94a3b8", fontSize: 11 }} tickLine={false} axisLine={{ stroke: "rgba(255,255,255,0.1)" }} />
              <YAxis tick={{ fill: "#94a3b8", fontSize: 11 }} tickLine={false} axisLine={false} allowDecimals={false} />
              <Tooltip contentStyle={tooltipStyle} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="wins" name="Wins" stackId="a" fill="#84cc16" />
              <Bar dataKey="losses" name="Losses" stackId="a" fill="#f43f5e" radius={[4, 4, 0, 0]} />
              <Line dataKey="winRate" name="Win rate %" stroke="#38bdf8" strokeWidth={2} dot={{ r: 3 }} />
            </ComposedChart>
          </ResponsiveContainer>
        ) : (
          <p className="text-sm text-slate-500">No completed games yet.</p>
        )}
      </div>

      <div className="rounded-2xl border border-white/5 bg-white/[0.03] p-5">
        <h3 className="text-sm font-semibold text-white flex items-center gap-2 mb-4">
          <BarChart3 className="w-4 h-4 text-sky-400" /> Performance by skill level
        </h3>
        {bySkill.length ? (
          <>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={bySkill} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                <XAxis dataKey="level" tick={{ fill: "#94a3b8", fontSize: 11 }} tickLine={false} axisLine={{ stroke: "rgba(255,255,255,0.1)" }} />
                <YAxis tick={{ fill: "#94a3b8", fontSize: 11 }} tickLine={false} axisLine={false} allowDecimals={false} />
                <Tooltip contentStyle={tooltipStyle} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="wins" name="Wins" stackId="a" fill="#84cc16" />
                <Bar dataKey="losses" name="Losses" stackId="a" fill="#f43f5e" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
            <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-2">
              {bySkill.map((s) => {
                const total = s.wins + s.losses;
                const rate = total ? Math.round((s.wins / total) * 100) : 0;
                return (
                  <div key={s.level} className="rounded-xl bg-white/[0.03] border border-white/5 p-3">
                    <div className="text-[11px] text-slate-400">{s.level}</div>
                    <div className="text-lg font-bold text-white">{rate}%</div>
                    <div className="text-[11px] text-slate-500">{s.wins}W · {s.losses}L</div>
                  </div>
                );
              })}
            </div>
          </>
        ) : (
          <p className="text-sm text-slate-500">No completed games yet.</p>
        )}
      </div>
    </div>
  );
}