import React, { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { useToast } from "@/components/ui/use-toast";
import { CalendarDays, Check, Clock, Loader2, X } from "lucide-react";

const formatDate = (value) => new Date(`${value}T00:00:00`).toLocaleDateString(undefined, {
  weekday: "short", month: "short", day: "numeric", year: "numeric",
});

export default function BookingRequestsPanel({ club }) {
  const { toast } = useToast();
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      setRequests(await base44.entities.ClubBookingRequest.list(club.id));
    } catch (error) {
      toast({ title: "Could not load court requests", description: error.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (club?.id) load();
  }, [club?.id]);

  const review = async (request, status) => {
    setBusyId(request.id);
    try {
      await base44.entities.ClubBookingRequest.update(request.id, { status });
      toast({ title: status === "approved" ? "Court request approved" : "Court request declined" });
      await load();
    } catch (error) {
      toast({ title: "Could not review request", description: error.message, variant: "destructive" });
    } finally {
      setBusyId(null);
    }
  };

  const pending = requests.filter((request) => request.status === "pending");
  const reviewed = requests.filter((request) => request.status !== "pending");

  return (
    <section className="mb-6 rounded-2xl border border-white/10 bg-white/[0.03] p-5">
      <div className="flex items-center gap-2 mb-4">
        <Clock className="w-4 h-4 text-amber-300" />
        <h2 className="font-semibold text-white">Court requests</h2>
        <span className="ml-auto text-xs text-slate-400">{pending.length} pending</span>
      </div>

      {loading ? (
        <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-slate-500" /></div>
      ) : requests.length === 0 ? (
        <p className="py-2 text-sm text-slate-500">No court requests yet.</p>
      ) : (
        <div className="space-y-3">
          {[...pending, ...reviewed].map((request) => (
            <article key={request.id} className="rounded-xl border border-white/10 bg-black/10 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="font-medium text-white">{request.title}</h3>
                  <p className="text-xs text-slate-400 mt-1">Requested by {request.requester_name || "Player"}</p>
                </div>
                <span className={`text-[11px] px-2 py-1 rounded-full font-medium capitalize ${
                  request.status === "approved" ? "bg-lime-400/15 text-lime-300" :
                  request.status === "rejected" ? "bg-rose-400/10 text-rose-300" : "bg-amber-400/10 text-amber-300"
                }`}>
                  {request.status}
                </span>
              </div>
              <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-300">
                <span className="inline-flex items-center gap-1.5"><CalendarDays className="w-3.5 h-3.5 text-slate-500" />{formatDate(request.date)}</span>
                <span>{request.start_time.slice(0, 5)}–{request.end_time.slice(0, 5)}</span>
                <span>Courts {request.court_numbers.join(", ")}</span>
              </div>
              {request.notes && <p className="mt-2 text-sm text-slate-400 whitespace-pre-wrap">{request.notes}</p>}
              {request.status === "pending" && (
                <div className="mt-3 flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => review(request, "rejected")}
                    disabled={busyId === request.id}
                    title="Decline request"
                    className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-2 text-xs font-medium text-slate-300 hover:bg-rose-500/10 hover:text-rose-200 disabled:opacity-50"
                  >
                    <X className="w-3.5 h-3.5" /> Decline
                  </button>
                  <button
                    type="button"
                    onClick={() => review(request, "approved")}
                    disabled={busyId === request.id}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-lime-400 px-3 py-2 text-xs font-semibold text-slate-900 hover:bg-lime-300 disabled:opacity-50"
                  >
                    {busyId === request.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                    Approve
                  </button>
                </div>
              )}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}