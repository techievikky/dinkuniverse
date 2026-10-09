import React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default function AvailabilityCalendar({ monthDate, availMap, selectedDate, onSelectDate, onPrev, onNext }) {
  const year = monthDate.getFullYear();
  const month = monthDate.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const todayStr = new Date().toISOString().slice(0, 10);

  const cells = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  return (
    <div className="rounded-2xl border border-white/5 bg-white/[0.03] p-4 sm:p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-display text-lg font-semibold text-white">
          {monthDate.toLocaleDateString(undefined, { month: "long", year: "numeric" })}
        </h2>
        <div className="flex gap-1">
          <button onClick={onPrev} className="w-8 h-8 rounded-lg bg-white/5 hover:bg-white/10 text-slate-300 flex items-center justify-center transition">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button onClick={onNext} className="w-8 h-8 rounded-lg bg-white/5 hover:bg-white/10 text-slate-300 flex items-center justify-center transition">
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-1.5 text-center">
        {WEEKDAYS.map((w) => (
          <div key={w} className="text-[11px] font-medium text-slate-500 py-1">{w}</div>
        ))}
        {cells.map((d, i) => {
          if (d === null) return <div key={i} />;
          const dateStr = new Date(year, month, d).toISOString().slice(0, 10);
          const record = availMap[dateStr];
          const hourCount = record?.hours?.length || 0;
          const isToday = dateStr === todayStr;
          const isSelected = dateStr === selectedDate;
          return (
            <button
              key={i}
              onClick={() => onSelectDate(dateStr)}
              className={`relative aspect-square rounded-xl flex flex-col items-center justify-center transition border ${
                isSelected
                  ? "bg-lime-400 text-slate-900 border-lime-400 font-semibold"
                  : hourCount > 0
                  ? "bg-lime-500/10 text-white border-lime-500/20 hover:bg-lime-500/20"
                  : "bg-white/[0.02] text-slate-400 border-transparent hover:bg-white/5"
              }`}
            >
              <span className={`text-sm ${isToday && !isSelected ? "text-lime-400 font-semibold" : ""}`}>{d}</span>
              {hourCount > 0 && (
                <span className={`text-[10px] mt-0.5 ${isSelected ? "text-slate-700" : "text-lime-400"}`}>
                  {hourCount}h
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}