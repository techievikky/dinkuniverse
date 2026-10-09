import React, { useEffect, useState, useCallback } from "react";
import { base44 } from "@/api/base44Client";
import { categoryLabel } from "@/components/tournaments/divisions";
import { useToast } from "@/components/ui/use-toast";
import {
  Loader2, DollarSign, CheckCircle2, Clock, Users, RefreshCw, AlertCircle,
} from "lucide-react";

const statusBadge = {
  paid: "bg-emerald-500/15 text-emerald-300 border-emerald-500/20",
  pending: "bg-amber-500/15 text-amber-300 border-amber-500/20",
  free: "bg-slate-500/15 text-slate-300 border-slate-500/20",
  unpaid: "bg-rose-500/15 text-rose-300 border-rose-500/20",
};
const statusLabel = { paid: "Paid", pending: "Pending", free: "Free", unpaid: "Unpaid" };

const divLabel = (key) => {
  const [cat, min, max] = key.split("|");
  return `${categoryLabel(cat)} · DUPR ${min}-${max}`;
};

// Organizer registration finance panel: an automatic fee calculator driven by
// the tournament signup data, plus per-entrant payment status tracking. Pulls
// status server-side (other users' purchases are RLS-protected) and refreshes
// on demand so payments posted via the checkout flow show up immediately.
export default function RegistrationFinance({ tournament }) {
  const { toast } = useToast();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await base44.functions.invoke("tournament-payment-status", { tournament_id: tournament.id });
      setData(res?.data || null);
    } catch (e) {
      toast({ title: "Could not load payment status", description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [tournament.id]);

  useEffect(() => { load(); }, [load]);

  const cur = (n) =>
    `${data?.currency || "USD"} ${Number(n || 0).toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;

  const fee = data?.fee ?? Number(tournament.entry_fee ?? 0);
  const isFree = fee < 0.5;

  if (loading) {
    return <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-slate-500" /></div>;
  }
  if (!data) return null;

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
      <div className="flex items-center gap-2 mb-4">
        <DollarSign className="w-4 h-4 text-lime-300" />
        <h3 className="font-display text-lg font-semibold text-white">Registration & fees</h3>
        <button
          onClick={load}
          className="ml-auto inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-slate-300 text-xs"
        >
          <RefreshCw className="w-3.5 h-3.5" /> Refresh
        </button>
      </div>

      {/* Fee calculator summary — auto-computed from current signups */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        <Stat label="Entry fee" value={isFree ? "Free" : cur(fee)} icon={DollarSign} />
        <Stat label="Entrants" value={data.total_entries} icon={Users} />
        <Stat
          label={isFree ? "Free entries" : "Collected"}
          value={isFree ? data.free : cur(data.collected)}
          icon={CheckCircle2}
          accent="emerald"
        />
        {!isFree && <Stat label="Outstanding" value={cur(data.outstanding)} icon={AlertCircle} accent="amber" />}
      </div>

      {!isFree && (
        <div className="flex flex-wrap gap-2 mb-4 text-xs">
          <Badge icon={CheckCircle2} tone="emerald">{data.paid} paid</Badge>
          <Badge icon={Clock} tone="amber">{data.pending} pending</Badge>
          {data.unpaid > 0 && <Badge icon={AlertCircle} tone="rose">{data.unpaid} unpaid</Badge>}
        </div>
      )}

      {/* Per-entrant payment status */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-[10px] text-slate-500 uppercase">
              <th className="text-left font-medium py-1 px-2">Team</th>
              <th className="text-left font-medium py-1 px-2">Division</th>
              <th className="text-center font-medium py-1 px-2">Fee</th>
              <th className="text-center font-medium py-1 px-2">Status</th>
            </tr>
          </thead>
          <tbody>
            {data.rows.map((r) => (
              <tr key={r.index} className="border-t border-white/5">
                <td className="py-1.5 px-2 text-slate-100 font-medium truncate max-w-[160px]">{r.name}</td>
                <td className="py-1.5 px-2 text-slate-400 text-xs">{divLabel(r.division)}</td>
                <td className="py-1.5 px-2 text-center text-slate-300">{isFree ? "—" : cur(r.fee)}</td>
                <td className="py-1.5 px-2 text-center">
                  <span className={`inline-block text-[10px] px-2 py-0.5 rounded-full border font-medium ${statusBadge[r.status]}`}>
                    {statusLabel[r.status]}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {data.rows.length === 0 && (
        <p className="text-sm text-slate-500 text-center py-4">No registrants yet.</p>
      )}

      {/* Pending checkouts not yet joined */}
      {!isFree && data.orphanPending?.length > 0 && (
        <div className="mt-4 rounded-xl border border-amber-400/20 bg-amber-400/[0.05] p-3">
          <div className="text-xs font-semibold text-amber-300 mb-1.5">Started checkout, not yet registered</div>
          <ul className="space-y-1">
            {data.orphanPending.map((p, i) => (
              <li key={i} className="text-xs text-slate-300 flex justify-between gap-2">
                <span className="truncate">{p.name}</span>
                <span className="text-amber-300 shrink-0">{cur(p.amount)} · pending</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, icon: Icon, accent }) {
  const color =
    accent === "emerald" ? "text-emerald-300" : accent === "amber" ? "text-amber-300" : "text-slate-100";
  return (
    <div className="rounded-xl bg-white/[0.03] border border-white/10 p-3">
      <div className="flex items-center gap-1.5 text-[10px] text-slate-500 uppercase">
        <Icon className="w-3 h-3" />{label}
      </div>
      <div className={`text-lg font-bold mt-1 ${color}`}>{value}</div>
    </div>
  );
}

function Badge({ icon: Icon, tone, children }) {
  const tones = { emerald: "text-emerald-300", amber: "text-amber-300", rose: "text-rose-300" };
  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-white/5 border border-white/10 ${tones[tone]}`}>
      <Icon className="w-3 h-3" />{children}
    </span>
  );
}