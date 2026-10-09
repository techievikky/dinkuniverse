import React from "react";
import { CalendarPlus } from "lucide-react";
import { buildIcs, downloadIcs } from "@/lib/calendar";

// Lets a player download an .ics file for a tournament they're registered for,
// so it lands on their personal calendar (Google, Apple, Outlook, etc).
export default function AddToCalendarButton({ tournament, className = "" }) {
  const onClick = () => {
    const desc = `Pickleball tournament${tournament.format ? ` · ${tournament.format}` : ""}.`;
    const ics = buildIcs({
      title: tournament.name,
      date: tournament.date,
      location: tournament.location,
      description: desc,
    });
    downloadIcs(`${(tournament.name || "tournament").replace(/[^a-z0-9]+/gi, "_")}.ics`, ics);
  };

  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-slate-200 text-sm font-semibold transition ${className}`}
    >
      <CalendarPlus className="w-4 h-4 text-lime-300" /> Add to calendar
    </button>
  );
}