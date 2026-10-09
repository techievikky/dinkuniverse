import React, { useState, useEffect, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import PlayCard from "@/components/PlayCard";
import UserAvatar from "@/components/UserAvatar";
import { PlusCircle, Loader2 } from "lucide-react";
import { Link } from "react-router-dom";
import PullToRefresh from "@/components/PullToRefresh";
import MatchStatusAlert from "@/components/MatchStatusAlert";
import ClubAlertsBanner from "@/components/ClubAlertsBanner";
import { useDistances } from "@/hooks/useDistances";

export default function Home() {
  const { user } = useAuth();
  const [plays, setPlays] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("upcoming");
  const [memberClubs, setMemberClubs] = useState(() => new Set());

  useEffect(() => {
    loadPlays();
    (async () => {
      try {
        const mems = await base44.entities.ClubMembership.filter({ status: "approved" }, "-created_date", 200);
        const mine = mems.filter((m) => m.created_by_id === user?.id && m.member_type === "member" && m.club_id);
        setMemberClubs(new Set(mine.map((m) => m.club_id)));
      } catch {
        setMemberClubs(new Set());
      }
    })();
  }, [user?.id]);

  const visible = (p) => {
    if (p.members_only && p.club_id && p.created_by_id !== user?.id && !memberClubs.has(p.club_id)) return false;
    return true;
  };

  const loadPlays = async () => {
    try {
      setLoading(true);
      const data = await base44.entities.Play.list("-date", 100);
      setPlays(data);
    } finally {
      setLoading(false);
    }
  };

  // Local date, not UTC: toISOString() rolls over a day early in timezones
  // behind UTC, hiding a host's own same-day play from Upcoming.
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

  const upcoming = useMemo(
    () => plays.filter((p) => p.date >= today && p.status !== "cancelled" && visible(p)),
    [plays, today, memberClubs]
  );
  const distances = useDistances(upcoming);

  const filtered = plays.filter((p) => {
    if (!visible(p)) return false;
    if (filter === "upcoming") return p.date >= today && p.status !== "cancelled";
    if (filter === "mine") return p.players?.some((pl) => pl.user_id === user?.id);
    if (filter === "past") return p.date < today || p.status === "completed";
    return true;
  });

  const filters = [
    { id: "upcoming", label: "Upcoming" },
    { id: "mine", label: "My Plays" },
    { id: "past", label: "Past" },
  ];

  return (
    <PullToRefresh onRefresh={loadPlays}>
    <div>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <UserAvatar name={user?.full_name || user?.email} photo_url={user?.photo_url} size="lg" />
          <div>
            <h1 className="font-display text-2xl sm:text-3xl font-bold text-white tracking-tight">
              Hey {user?.full_name?.split(" ")[0] || "there"} 👋
            </h1>
            <p className="text-slate-400 text-sm mt-1">Find a game or rally your crew.</p>
          </div>
        </div>
        <Link
          to="/new"
          className="hidden sm:inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-lime-400 hover:bg-lime-300 text-slate-900 font-semibold text-sm transition shadow-lg shadow-lime-500/20"
        >
          <PlusCircle className="w-4 h-4" /> New Play
        </Link>
      </div>

      <MatchStatusAlert />
      <ClubAlertsBanner />

      <div className="flex gap-2 mb-5 overflow-x-auto pb-1">
        {filters.map((f) => (
          <button
            key={f.id}
            onClick={() => setFilter(f.id)}
            className={`px-4 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition ${
              filter === f.id
                ? "bg-white text-slate-900"
                : "bg-white/5 text-slate-300 hover:bg-white/10"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="w-6 h-6 animate-spin text-slate-500" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20">
          <div className="w-14 h-14 mx-auto rounded-2xl bg-white/5 flex items-center justify-center mb-4">
            <PlusCircle className="w-6 h-6 text-slate-500" />
          </div>
          <p className="text-slate-400 text-sm">No plays here yet.</p>
          <Link
            to="/new"
            className="inline-flex mt-4 items-center gap-2 px-4 py-2 rounded-xl bg-lime-400 text-slate-900 font-semibold text-sm"
          >
            <PlusCircle className="w-4 h-4" /> Create one
          </Link>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 gap-4">
          {filtered.map((play) => (
            <PlayCard
              key={play.id}
              play={play}
              distanceLabel={filter === "upcoming" ? distances[play.id] : undefined}
            />
          ))}
        </div>
      )}

      <Link
        to="/new"
        className="sm:hidden fixed right-4 bottom-20 z-20 inline-flex items-center gap-2 px-4 py-3 rounded-full bg-lime-400 text-slate-900 font-semibold text-sm shadow-xl shadow-lime-500/30"
      >
        <PlusCircle className="w-5 h-5" />
      </Link>
    </div>
    </PullToRefresh>
  );
}