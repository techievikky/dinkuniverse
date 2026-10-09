import React, { useCallback, useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { useToast } from "@/components/ui/use-toast";
import { AlertTriangle, CreditCard, ExternalLink, Loader2, ShieldCheck } from "lucide-react";

// Lets a tournament organizer link their own Stripe account so paid entry
// fees are transferred to them directly instead of sitting in the platform account.
export default function StripeConnectCard() {
  const { toast } = useToast();
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [connectError, setConnectError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await base44.functions.invoke("stripe-connect-status");
      setStatus(res?.data || { connected: false });
    } catch (e) {
      toast({ title: "Could not load payout status", description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const connect = async () => {
    setConnecting(true);
    setConnectError("");
    try {
      const res = await base44.functions.invoke("stripe-connect-link");
      if (res?.data?.url) window.location.href = res.data.url;
    } catch (e) {
      setConnectError(e.message);
      toast({ title: "Could not start Stripe setup", description: e.message, variant: "destructive" });
      setConnecting(false);
    }
  };

  if (loading) {
    return (
      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 mb-6 flex justify-center">
        <Loader2 className="w-5 h-5 animate-spin text-slate-500" />
      </div>
    );
  }

  const readyForPayouts = status?.connected && status?.charges_enabled;

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 mb-6">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-start gap-3 min-w-0">
          <div className={`w-10 h-10 shrink-0 rounded-xl flex items-center justify-center ${readyForPayouts ? "bg-emerald-400/15 text-emerald-300" : "bg-amber-400/15 text-amber-300"}`}>
            {readyForPayouts ? <ShieldCheck className="w-5 h-5" /> : <CreditCard className="w-5 h-5" />}
          </div>
          <div className="min-w-0">
            <h3 className="font-semibold text-white">Stripe payouts</h3>
            <p className="text-sm text-slate-400 mt-0.5">
              {readyForPayouts
                ? "Payouts enabled — paid entry fees are transferred to your Stripe account."
                : status?.connected
                ? "Finish your Stripe setup to start receiving entry fee payouts."
                : "Connect your own Stripe account so paid tournament entries are paid out to you."}
            </p>
          </div>
        </div>
        {!readyForPayouts && (
          <button
            onClick={connect}
            disabled={connecting}
            className="shrink-0 inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-lime-400 hover:bg-lime-300 disabled:opacity-60 text-slate-900 font-semibold text-sm transition"
          >
            {connecting ? <Loader2 className="w-4 h-4 animate-spin" /> : <ExternalLink className="w-4 h-4" />}
            {status?.connected ? "Finish setup" : "Connect Stripe"}
          </button>
        )}
      </div>
      {connectError && (
        <div className="mt-3 flex items-start gap-2 rounded-xl border border-rose-500/20 bg-rose-500/10 px-3.5 py-2.5 text-sm text-rose-200">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{connectError}</span>
        </div>
      )}
    </div>
  );
}
