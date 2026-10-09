import React, { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Link } from "react-router-dom";
import { AlertTriangle, Loader2, ArrowRight } from "lucide-react";

// Lists open score discrepancy reports for the club owner's plays, linking to
// the play detail where they can review the match and confirm or adjust the score.
export default function DiscrepanciesPanel({ clubs }) {
  const club = clubs[0];
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    if (!club) { setLoading(false); return; }
    setLoading(true);
    try {
      const all = await base44.entities.ScoreDiscrepancy.list("-created_date", 200);
      setItems(all.filter((d) => d.club_id === club.id && d.status === "open"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [club?.id]);

  return (
    <div className="rounded-2xl border border-white/5 bg-white/[0.03] p-5">
      <div className="flex items-center gap-2 mb-3">
        <AlertTriangle className="w-4 h-4 text-amber-400" />
        <h3 className="font-semibold text-white">Score discrepancies</h3>
      </div>
      {loading ? (
        <div className="flex justify-center py-4"><Loader2 className="w-5 h-5 animate-spin text-slate-500" /></div>
      ) : items.length === 0 ? (
        <p className="text-slate-500 text-sm">No open score discrepancy reports.</p>
      ) : (
        <div className="space-y-2">
          {items.map((d) => (
            <Link key={d.id} to={`/plays/${d.play_id}`} className="flex items-center justify-between gap-3 rounded-xl border border-amber-400/20 bg-amber-400/[0.05] p-3 hover:bg-amber-400/[0.1] transition">
              <div className="min-w-0">
                <div className="text-sm text-white font-medium truncate">{d.play_title}</div>
                <div className="text-[11px] text-slate-400 mt-0.5">
                  Reported by {d.reported_by_name}{d.reason ? ` · ${d.reason}` : ""}
                </div>
              </div>
              <ArrowRight className="w-4 h-4 text-amber-300 shrink-0" />
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}