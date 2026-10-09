import React from "react";
import { Link } from "react-router-dom";
import { MapPin, Clock, Users, Calendar } from "lucide-react";
import UserAvatar from "@/components/UserAvatar";
import { useAuth } from "@/lib/AuthContext";
import { formatDateInTimeZone, getUserTimeZone } from "@/lib/timezone";

const skillStyles = {
  Beginner: "bg-sky-500/15 text-sky-300 border-sky-500/20",
  Intermediate: "bg-amber-500/15 text-amber-300 border-amber-500/20",
  Advanced: "bg-rose-500/15 text-rose-300 border-rose-500/20",
  Open: "bg-lime-500/15 text-lime-300 border-lime-500/20",
};

export default function PlayCard({ play, distanceLabel }) {
  const { user } = useAuth();
  const spotsLeft = (play.max_players || 4) - (play.players?.length || 0);
  const full = spotsLeft <= 0;
  const completed = play.status === "completed";

  return (
    <Link
      to={`/plays/${play.id}`}
      className="paddle-card block border border-lime-300 bg-white/[0.03] hover:bg-white/[0.06] transition-all p-5 group shadow-[0_0_18px_-4px_#d4ff3a]"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-display font-semibold text-white text-lg leading-snug truncate">
            {play.title}
          </h3>
          <div className="mt-1 flex items-center gap-1.5 text-sm text-slate-400">
            <MapPin className="w-3.5 h-3.5" />
            <span className="truncate">{play.location}</span>
            {distanceLabel && (
              <span className="shrink-0 text-lime-300 font-medium">· {distanceLabel}</span>
            )}
          </div>
        </div>
        <span
          className={`shrink-0 text-[11px] px-2.5 py-1 rounded-full border font-medium ${
            skillStyles[play.skill_level] || skillStyles.Open
          }`}
        >
          {play.skill_level}
        </span>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-slate-300">
        <span className="flex items-center gap-1.5">
          <Calendar className="w-4 h-4 text-slate-500" />
          {formatDateInTimeZone(play.date, getUserTimeZone(user), { weekday: "short", month: "short", day: "numeric" })}
        </span>
        <span className="flex items-center gap-1.5">
          <Clock className="w-4 h-4 text-slate-500" />
          {formatPlayTime(play)}
        </span>
        <span className="flex items-center gap-1.5">
          <Users className="w-4 h-4 text-slate-500" />
          {play.players?.length || 0}/{play.max_players || 4}
        </span>
      </div>

      <div className="mt-4 flex items-center justify-between">
        <div className="flex items-center">
          {play.players?.slice(0, 4).map((pl, i) => (
            <div key={pl.user_id + i} className="rounded-full border-2 border-[#0b1220] -ml-2.5 first:ml-0">
              <UserAvatar name={pl.name} photo_url={pl.photo_url} size="sm" />
            </div>
          ))}
          {play.players?.length > 4 && (
            <div className="-ml-2.5 w-7 h-7 rounded-full bg-white/10 border-2 border-[#0b1220] flex items-center justify-center text-[10px] font-bold text-slate-200">
              +{play.players.length - 4}
            </div>
          )}
        </div>
        {completed ? (
          <span className="text-xs font-medium text-emerald-400">✓ Completed</span>
        ) : full ? (
          <span className="text-xs font-medium text-rose-400">Full</span>
        ) : (
          <span className="text-xs font-medium text-lime-400">{spotsLeft} spot{spotsLeft !== 1 ? "s" : ""} left</span>
        )}
      </div>
    </Link>
  );
}

function formatPlayTime(play) {
  if (play.start_time && play.end_time) return `${play.start_time} - ${play.end_time}`;
  return play.time || "Time TBD";
}