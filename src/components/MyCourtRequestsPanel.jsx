import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { CalendarDays, Clock, Loader2 } from "lucide-react";

const formatDate = (value) => new Date(`${value}T00:00:00`).toLocaleDateString(undefined, {
  weekday: "short", month: "short", day: "numeric",
});

const statusStyle = {
  approved: "bg-lime-400/15 text-lime-300",
  rejected: "bg-rose-400/10 text-rose-300",
  pending: "bg-amber-400/10 text-amber-300",
};

// Shows a player's own submitted court-block requests and their live approval status.
export default function MyCourtRequestsPanel({ refreshKey }) {
  const { user } = useAuth();
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user?.id) return;
    (async () => {
      setLoading(true);
      try {
        const all = await base44.entities.ClubBookingRequest.list();
        setRequests(all.filter((request) => request.requester_id === user.id));
      } catch {
        setRequests([]);
      } finally {
        setLoading(false);
      }
    })();
  }, [user?.id, refreshKey]);

  if (loading) {
    return <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-slate-500" /></div>;
  }
  if (requests.length === 0) return null;

  return (
    <div className="mb-6 rounded-2xl border border-white/10 bg-white/[0.03] p-5">
      <h2 className="font-semibold text-white mb-3">Your court requests</h2>
      <div className="space-y-2">
        {requests.map((request) => (
          <div key={request.id} className="rounded-xl border border-white/10 bg-black/10 p-3.5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-medium text-white truncate">{request.title}</p>
                <p className="text-xs text-slate-400 mt-0.5">{request.club_name}</p>
              </div>
              <span className={`shrink-0 text-[11px] px-2 py-1 rounded-full font-medium capitalize ${statusStyle[request.status] || statusStyle.pending}`}>
                {request.status}
              </span>
            </div>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-300">
              <span className="inline-flex items-center gap-1.5"><CalendarDays className="w-3.5 h-3.5 text-slate-500" />{formatDate(request.date)}</span>
              <span className="inline-flex items-center gap-1.5"><Clock className="w-3.5 h-3.5 text-slate-500" />{request.start_time.slice(0, 5)}–{request.end_time.slice(0, 5)}</span>
              <span>Courts {request.court_numbers.join(", ")}</span>
            </div>
            {request.status === "approved" && request.play_id && (
              <Link to={`/plays/${request.play_id}`} className="mt-2 inline-block text-xs font-medium text-lime-300 hover:text-lime-200">
                View play →
              </Link>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
