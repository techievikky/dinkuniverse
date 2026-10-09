import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { ChevronLeft } from "lucide-react";
import CourtUtilizationReport from "@/components/clubhub/CourtUtilizationReport";
import DiscrepanciesPanel from "@/components/clubhub/DiscrepanciesPanel";
import ExportPanel from "@/components/clubhub/ExportPanel";
import MonthlyReportsPanel from "@/components/clubhub/MonthlyReportsPanel";

// Dedicated reports & exports page for club owners — keeps the main Club Hub
// tidy while making court utilization, discrepancy review and CSV exports one
// tap away from the bottom navigation.
export default function ClubReports() {
  const { user } = useAuth();
  const [clubs, setClubs] = useState([]);
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const [all, evs] = await Promise.all([
          base44.entities.Club.list("-created_date", 50),
          base44.entities.ClubEvent.list("-date", 200),
        ]);
        setClubs(all.filter((c) => c.created_by_id === user?.id));
        setEvents(evs.filter((e) => e.created_by_id === user?.id));
      } finally {
        setLoading(false);
      }
    })();
  }, [user?.id]);

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <div className="w-6 h-6 border-4 border-white/10 border-t-lime-400 rounded-full animate-spin" />
      </div>
    );
  }
  if (clubs.length === 0) {
    return <p className="text-slate-400 text-sm text-center py-16">No club found for your account.</p>;
  }

  return (
    <div>
      <Link to="/club" className="inline-flex items-center gap-1 text-sm text-slate-400 hover:text-white mb-3">
        <ChevronLeft className="w-4 h-4" /> Back to club
      </Link>
      <h1 className="font-display text-2xl sm:text-3xl font-bold text-white tracking-tight mb-5">Reports & exports</h1>
      <div className="space-y-5">
        <MonthlyReportsPanel />
        <CourtUtilizationReport club={clubs[0]} events={events} />
        <DiscrepanciesPanel clubs={clubs} />
        <ExportPanel clubs={clubs} />
      </div>
    </div>
  );
}