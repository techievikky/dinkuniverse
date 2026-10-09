import React, { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Clock, MapPin } from "lucide-react";

const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const sameDay = (a, b) => a.toDateString() === b.toDateString();

// Month grid calendar of club events. Each event is pinned to its date cell;
// selecting a day filters the side list. Tap an event to edit it.
export default function EventsCalendar({ events, onEdit }) {
  const [cursor, setCursor] = useState(() => new Date());
  const [selected, setSelected] = useState(() => new Date());

  const byDay = useMemo(() => {
    const map = new Map();
    for (const e of events) {
      if (!e.date) continue;
      const key = new Date(e.date + "T00:00:00").toDateString();
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(e);
    }
    return map;
  }, [events]);

  const grid = useMemo(() => {
    const year = cursor.getFullYear();
    const month = cursor.getMonth();
    const first = new Date(year, month, 1);
    const start = new Date(first);
    start.setDate(1 - first.getDay());
    const cells = [];
    for (let i = 0; i < 42; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      cells.push(d);
    }
    return cells;
  }, [cursor]);

  const monthLabel = cursor.toLocaleDateString(undefined, { month: "long", year: "numeric" });
  const selectedEvents = byDay.get(selected.toDateString()) || [];

  const move = (delta) => {
    setCursor((c) => new Date(c.getFullYear(), c.getMonth() + delta, 1));
  };

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-display text-lg font-semibold text-white">{monthLabel}</h3>
        <div className="flex items-center gap-1.5">
          <button onClick={() => move(-1)} className="w-9 h-9 rounded-lg border border-white/10 hover:bg-white/5 text-slate-300 flex items-center justify-center transition">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button onClick={() => { setCursor(new Date()); setSelected(new Date()); }} className="px-3 h-9 rounded-lg border border-white/10 hover:bg-white/5 text-slate-300 text-xs font-medium transition">
            Today
          </button>
          <button onClick={() => move(1)} className="w-9 h-9 rounded-lg border border-white/10 hover:bg-white/5 text-slate-300 flex items-center justify-center transition">
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-1 mb-1">
        {DOW.map((d) => (
          <div key={d} className="text-center text-[11px] font-semibold text-slate-500 py-1">{d}</div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {grid.map((d, i) => {
          const inMonth = d.getMonth() === cursor.getMonth();
          const isToday = sameDay(d, new Date());
          const isSelected = sameDay(d, selected);
          const dayEvents = byDay.get(d.toDateString()) || [];
          return (
            <button
              key={i}
              onClick={() => setSelected(new Date(d))}
              className={`relative min-h-[3.25rem] rounded-lg p-1 text-left transition border ${
                isSelected
                  ? "border-lime-400/60 bg-lime-400/10"
                  : "border-white/5 hover:bg-white/5"
              } ${inMonth ? "" : "opacity-40"}`}
            >
              <div className={`text-[11px] font-medium ${isToday ? "text-lime-300" : inMonth ? "text-slate-300" : "text-slate-600"}`}>
                {d.getDate()}
              </div>
              <div className="mt-0.5 space-y-0.5">
                {dayEvents.slice(0, 2).map((e) => (
                  <div key={e.id} className={`truncate text-[10px] px-1 py-0.5 rounded ${e.members_only ? "bg-amber-400/20 text-amber-200" : "bg-lime-400/20 text-lime-200"}`}>
                    {e.title}
                  </div>
                ))}
                {dayEvents.length > 2 && (
                  <div className="text-[10px] text-slate-500">+{dayEvents.length - 2} more</div>
                )}
              </div>
            </button>
          );
        })}
      </div>

      <div className="mt-4 pt-4 border-t border-white/5">
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-sm font-semibold text-white">
            {selected.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" })}
          </h4>
          <span className="text-xs text-slate-500">{selectedEvents.length} event{selectedEvents.length === 1 ? "" : "s"}</span>
        </div>
        {selectedEvents.length === 0 ? (
          <p className="text-slate-500 text-sm py-2">No events scheduled.</p>
        ) : (
          <div className="space-y-2">
            {selectedEvents.map((e) => (
              <button
                key={e.id}
                onClick={() => onEdit?.(e)}
                className="w-full text-left rounded-xl border border-white/5 bg-white/[0.02] hover:bg-white/5 p-3 transition"
              >
                <div className="flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full ${e.members_only ? "bg-amber-400" : "bg-lime-400"}`} />
                  <span className="font-medium text-white text-sm truncate">{e.title}</span>
                  {e.recurring && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-sky-400/15 text-sky-300">Recurring</span>}
                </div>
                <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-slate-400">
                  <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{e.time}{e.duration_hours ? ` · ${e.duration_hours}h` : ""}</span>
                  {e.location && <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{e.location}</span>}
                  {e.courts_available != null && <span>{e.courts_available} courts</span>}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}