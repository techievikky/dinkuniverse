import React from "react";
import { Clock } from "lucide-react";
import { formatDateInTimeZone } from "@/lib/timezone";

const localDateString = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

const fmtH = (h) => {
  const ap = h < 12 ? "a" : "p";
  const d = h === 0 ? 12 : h <= 12 ? h : h - 12;
  return `${d}${ap}`;
};

// Shows the earliest future slot from the player's persisted schedule.
export default function AvailabilityBadge({ records }) {
  const now = new Date();
  const today = localDateString(now);
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const candidates = (records || [])
    .flatMap((record) => {
      const date = String(record.date || "").slice(0, 10);
      if (!date || date < today) return [];
      return (record.hours || [])
        .map(Number)
        .filter((hour) => Number.isInteger(hour) && hour >= 0 && hour <= 23)
        .filter((hour) => date > today || hour * 60 >= nowMinutes)
        .map((hour) => ({ date, hour }));
    })
    .sort((a, b) => a.date.localeCompare(b.date) || a.hour - b.hour);
  const next = candidates[0];

  if (next?.date === today) {
    return (
      <div className="flex items-center gap-2">
        <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 shadow-[0_0_6px_#34d399]" />
        <span className="text-xs font-semibold text-emerald-300">Available today</span>
        <span className="text-[11px] text-slate-400 flex items-center gap-1 truncate">
          <Clock className="w-3 h-3 shrink-0" />
          <span className="truncate">Next: {fmtH(next.hour)}</span>
        </span>
      </div>
    );
  }

  if (next) {
    const d = formatDateInTimeZone(next.date, undefined, {
      weekday: "short",
      month: "short",
      day: "numeric",
    });
    return (
      <div className="flex items-center gap-2">
        <span className="w-2.5 h-2.5 rounded-full bg-rose-500 shadow-[0_0_6px_#f43f5e]" />
        <span className="text-xs font-semibold text-rose-300">Not available today</span>
        <span className="text-[11px] text-slate-400 flex items-center gap-1 truncate">
          <Clock className="w-3 h-3 shrink-0" />
          <span className="truncate">Next: {d} · {fmtH(next.hour)}</span>
        </span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <span className="w-2.5 h-2.5 rounded-full bg-rose-500 shadow-[0_0_6px_#f43f5e]" />
      <span className="text-xs font-semibold text-rose-300">
        {records?.length ? "No upcoming availability" : "No availability posted"}
      </span>
    </div>
  );
}