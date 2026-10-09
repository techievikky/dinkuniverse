import React, { useState } from "react";
import { Download, Loader2, FileSpreadsheet } from "lucide-react";
import { categoryLabel } from "@/components/tournaments/divisions";

// Lets a tournament organizer download a CSV with all sign-ups plus the
// detailed output (teams, scores, winners) of every completed match.
export default function ExportTournamentPanel({ tournament, matches }) {
  const [busy, setBusy] = useState(false);

  const escape = (v) => {
    const s = v == null ? "" : String(v);
    if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };

  const build = () => {
    const lines = [];
    lines.push(`Tournament: ${tournament.name}`);
    lines.push(`Date: ${tournament.date || ""}  ·  Location: ${tournament.location || ""}`);
    lines.push("");

    lines.push("SIGN-UPS");
    lines.push(["Name", "Category", "DUPR Range", "Partner", "Needs Partner"].map(escape).join(","));
    (tournament.entries || []).forEach((e) => {
      const dupr = [e.dupr_min, e.dupr_max].filter((x) => x != null).join("–");
      lines.push(
        [e.name || "", categoryLabel(e.category), dupr, e.partner_name || "", e.needs_partner ? "Yes" : "No"]
          .map(escape).join(",")
      );
    });

    lines.push("");
    lines.push("MATCH RESULTS (COMPLETED)");
    lines.push(
      ["Division", "Round", "Stage", "Team A", "Team B", "Score A", "Score B", "Winner", "Court"]
        .map(escape).join(",")
    );
    (matches || [])
      .filter((m) => m.status === "completed")
      .forEach((m) => {
        lines.push(
          [
            m.division || "",
            `Round ${m.round}`,
            m.stage || "",
            m.team_a || "",
            m.team_b || "",
            m.score_a ?? "",
            m.score_b ?? "",
            m.winner ? (m.winner === "A" ? m.team_a : m.winner === "B" ? m.team_b : "") : "",
            m.court || "",
          ].map(escape).join(",")
        );
      });

    return lines.join("\n");
  };

  const exportReport = async () => {
    setBusy(true);
    try {
      const csv = build();
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${(tournament.name || "tournament").replace(/[^a-z0-9]+/gi, "_")}_report.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e) {
      alert("Could not export: " + e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-6 rounded-2xl border border-white/5 bg-white/[0.03] p-5">
      <div className="flex items-center gap-2 mb-2">
        <FileSpreadsheet className="w-4 h-4 text-lime-400" />
        <h3 className="font-semibold text-white">Tournament report</h3>
      </div>
      <p className="text-sm text-slate-400 mb-4">
        Download all sign-ups plus completed match results and recorded scores for this tournament.
      </p>
      <button
        onClick={exportReport}
        disabled={busy}
        className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-lime-400 hover:bg-lime-300 disabled:opacity-60 text-slate-900 font-semibold text-sm transition"
      >
        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
        Export report (CSV)
      </button>
    </div>
  );
}