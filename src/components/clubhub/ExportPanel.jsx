import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Download, Loader2, FileSpreadsheet, Users } from "lucide-react";

// Lets a club manager download CSV reports for their club:
//  - match report: completed match scores + player attendance
//  - player participation & win-rate: per-player plays, wins, losses, win %
export default function ExportPanel({ clubs }) {
  const club = clubs[0];
  const [busyKey, setBusyKey] = useState(null); // "match" | "players" | null

  const escape = (v) => {
    const s = v == null ? "" : String(v);
    if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };

  const download = (csv, filename) => {
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const exportReport = async () => {
    if (!club) return;
    setBusyKey("match");
    try {
      const plays = await base44.entities.Play.filter({ club_id: club.id }, "-date", 500);
      const completed = plays.filter((p) => p.status === "completed");

      const header = [
        "Date", "Title", "Location", "Skill",
        "Team A Score", "Team B Score", "Winner",
        "Players (Attendance)",
      ];
      const rows = completed.map((p) => [
        p.date || "",
        p.title || "",
        p.location || "",
        p.skill_level || "",
        p.score_team_a ?? "",
        p.score_team_b ?? "",
        p.winner || "",
        (p.players || []).map((pl) => pl.name).filter(Boolean).join("; "),
      ]);

      const csv = [header, ...rows].map((r) => r.map(escape).join(",")).join("\n");
      download(csv, `${(club.name || "club").replace(/[^a-z0-9]+/gi, "_")}_match_report.csv`);
    } catch (e) {
      alert("Could not export report: " + e.message);
    } finally {
      setBusyKey(null);
    }
  };

  // Per-player participation + win rate across the club's completed plays.
  // Mirrors the app's win logic: even-index players are Team A, odd are Team B;
  // a player wins when the play's winner matches their team.
  const exportPlayers = async () => {
    if (!club) return;
    setBusyKey("players");
    try {
      const plays = await base44.entities.Play.filter({ club_id: club.id }, "-date", 500);
      const completed = plays.filter((p) => p.status === "completed" && (p.players || []).length);

      const stats = {};
      for (const p of completed) {
        (p.players || []).forEach((pl, idx) => {
          const uid = pl.user_id || pl.name;
          if (!uid) return;
          if (!stats[uid]) stats[uid] = { name: pl.name || "", plays: 0, wins: 0, losses: 0 };
          const s = stats[uid];
          s.plays++;
          const myTeam = idx % 2 === 0 ? "Team A" : "Team B";
          if (p.winner === myTeam) s.wins++;
          else s.losses++;
        });
      }

      const rows = Object.values(stats).sort(
        (a, b) => b.plays - a.plays || a.name.localeCompare(b.name)
      );
      const header = ["Player", "Plays", "Wins", "Losses", "Win Rate %"];
      const data = rows.map((s) => [
        s.name,
        s.plays,
        s.wins,
        s.losses,
        s.plays ? Math.round((s.wins / s.plays) * 100) : 0,
      ]);
      const csv = [header, ...data].map((r) => r.map(escape).join(",")).join("\n");
      download(csv, `${(club.name || "club").replace(/[^a-z0-9]+/gi, "_")}_player_winrate.csv`);
    } catch (e) {
      alert("Could not export player report: " + e.message);
    } finally {
      setBusyKey(null);
    }
  };

  const btnCls =
    "inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-lime-400 hover:bg-lime-300 disabled:opacity-60 text-slate-900 font-semibold text-sm transition";

  return (
    <div className="rounded-2xl border border-white/5 bg-white/[0.03] p-5">
      <div className="flex items-center gap-2 mb-2">
        <FileSpreadsheet className="w-4 h-4 text-lime-400" />
        <h3 className="font-semibold text-white">Exports</h3>
      </div>
      <p className="text-sm text-slate-400 mb-4">
        Download spreadsheet-ready CSVs of your club's match data and player performance for your records.
      </p>
      <div className="flex flex-wrap gap-3">
        <button onClick={exportReport} disabled={!!busyKey || !club} className={btnCls}>
          {busyKey === "match" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
          Match report (CSV)
        </button>
        <button onClick={exportPlayers} disabled={!!busyKey || !club} className={btnCls}>
          {busyKey === "players" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Users className="w-4 h-4" />}
          Player participation & win-rate (CSV)
        </button>
      </div>
    </div>
  );
}