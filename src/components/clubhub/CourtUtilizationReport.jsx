import React, { useEffect, useMemo, useState } from "react";
import { base44 } from "@/api/base44Client";
import {
  ResponsiveContainer, BarChart, ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, Cell, CartesianGrid,
} from "recharts";
import { LayoutGrid, TrendingUp, Clock, CalendarDays } from "lucide-react";

const OPERATING_HOURS = 14; // assumes 8am–10pm court availability window
const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// Court utilization report for a club manager. Derives court inventory from the
// club's courts and booking data from the club's ClubEvents (each event books
// `courts_available` courts for `duration_hours`). Highlights peak booking
// hours and busiest weekdays, and estimates an average utilization rate across
// the days the club is actually operating.
export default function CourtUtilizationReport({ club, events }) {
  const [windowDays, setWindowDays] = useState(0); // 0 = all events
  const [availability, setAvailability] = useState([]);

  // Player availability data — the demand signal that highlights peak hours
  // (hours when members are both available and courts are booked).
  useEffect(() => {
    base44.entities.Availability.list("-created_date", 200)
      .then(setAvailability)
      .catch(() => {});
  }, []);

  const courts = club?.courts || [];
  const totalCourts = courts.length;
  const blockedCourts = courts.filter((c) => c.blocked).length;
  const availableCourts = Math.max(totalCourts - blockedCourts, 1);

  const inWindow = useMemo(() => {
    if (!windowDays) return events;
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() + windowDays);
    const cutoffStr = cutoff.toISOString().slice(0, 10);
    return events.filter((e) => (e.date || "") >= new Date().toISOString().slice(0, 10) && (e.date || "") <= cutoffStr);
  }, [events, windowDays]);

  const stats = useMemo(() => {
    const hourBuckets = Array.from({ length: 24 }, (_, h) => ({ hour: h, label: `${((h + 11) % 12) + 1}${h < 12 ? "a" : "p"}`, courtHours: 0, count: 0, available: 0 }));
    const dowBuckets = DOW.map((label) => ({ label, courtHours: 0 }));
    const byDate = {};

    // Availability demand: count members available per hour across all records.
    for (const a of availability) {
      for (const h of a.hours || []) if (hourBuckets[h]) hourBuckets[h].available += 1;
    }

    for (const e of inWindow) {
      const dur = Number(e.duration_hours) || 1.5;
      const cu = Number(e.courts_available) || 1;
      const ch = dur * cu;
      const h = parseInt(String(e.time || "0").split(":")[0], 10) || 0;
      if (hourBuckets[h]) {
        hourBuckets[h].courtHours += ch;
        hourBuckets[h].count += 1;
      }
      const d = new Date((e.date || "") + "T00:00:00").getDay();
      if (dowBuckets[d]) dowBuckets[d].courtHours += ch;
      byDate[e.date] = (byDate[e.date] || 0) + ch;
    }

    const operatingDays = Object.keys(byDate).length;
    const totalBooked = Object.values(byDate).reduce((a, b) => a + b, 0);
    const capacity = operatingDays * availableCourts * OPERATING_HOURS;
    const utilization = capacity > 0 ? Math.min(100, (totalBooked / capacity) * 100) : 0;

    const displayHours = hourBuckets.filter((b) => b.hour >= 6 && b.hour <= 23);
    const maxCH = Math.max(...displayHours.map((b) => b.courtHours), 0);
    const peakHours = displayHours
      .filter((b) => b.courtHours > 0)
      .sort((a, b) => b.courtHours - a.courtHours)
      .slice(0, 3);

    return { displayHours, maxCH, peakHours, dowBuckets, operatingDays, totalBooked, utilization };
  }, [inWindow, availableCourts, availability]);

  if (!club) return null;

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
      <div className="flex items-center gap-2 mb-4">
        <TrendingUp className="w-4 h-4 text-lime-300" />
        <h3 className="font-display text-lg font-semibold text-white">Court utilization</h3>
        <select
          value={windowDays}
          onChange={(e) => setWindowDays(Number(e.target.value))}
          className="ml-auto bg-white/5 border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-lime-400/50"
        >
          <option value={0}>All events</option>
          <option value={30}>Next 30 days</option>
          <option value={60}>Next 60 days</option>
          <option value={90}>Next 90 days</option>
        </select>
      </div>

      {/* Court inventory + utilization headline */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
        <Stat icon={LayoutGrid} label="Total courts" value={totalCourts} />
        <Stat icon={LayoutGrid} label="Available" value={availableCourts} accent="emerald" />
        <Stat icon={LayoutGrid} label="Blocked" value={blockedCourts} accent="rose" />
        <Stat icon={TrendingUp} label="Avg utilization" value={`${stats.utilization.toFixed(0)}%`} accent="lime" />
      </div>

      {/* Utilization progress bar */}
      <div className="mb-5">
        <div className="flex justify-between text-[11px] text-slate-400 mb-1">
          <span>Booked court-hours vs capacity on operating days</span>
          <span>{stats.totalBooked.toFixed(0)} / {(stats.operatingDays * availableCourts * OPERATING_HOURS).toFixed(0)} court-hrs</span>
        </div>
        <div className="h-2.5 rounded-full bg-white/5 overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-lime-400 to-emerald-400 transition-all"
            style={{ width: `${stats.utilization}%` }}
          />
        </div>
        <p className="text-[10px] text-slate-500 mt-1">Assumes a {OPERATING_HOURS}h operating day (8am–10pm). Capacity = available courts × {OPERATING_HOURS}h × {stats.operatingDays} operating day{stats.operatingDays !== 1 ? "s" : ""}.</p>
      </div>

      {inWindow.length === 0 ? (
        <p className="text-sm text-slate-500 text-center py-6">No events in this window to analyze.</p>
      ) : (
        <>
          {/* Peak booking hours */}
          <div className="mb-5">
            <div className="flex items-center gap-1.5 mb-2">
              <Clock className="w-3.5 h-3.5 text-lime-300" />
              <span className="text-xs font-semibold text-lime-300 uppercase tracking-wide">Peak booking hours</span>
            </div>
            <ResponsiveContainer width="100%" height={180}>
              <ComposedChart data={stats.displayHours} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false} interval={1} />
                <YAxis yAxisId="left" tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
                <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10, fill: "#38bdf8" }} axisLine={false} tickLine={false} />
                <Tooltip
                  cursor={{ fill: "rgba(255,255,255,0.04)" }}
                  contentStyle={{ background: "#0b1220", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12, fontSize: 12 }}
                  labelStyle={{ color: "#e2e8f0" }}
                  formatter={(v, n) => n === "courtHours" ? [`${v.toFixed(1)} court-hrs`, "Booked"] : [`${v} members`, "Available"]}
                />
                <Bar yAxisId="left" dataKey="courtHours" radius={[4, 4, 0, 0]}>
                  {stats.displayHours.map((b, i) => (
                    <Cell key={i} fill={stats.maxCH > 0 && b.courtHours >= stats.maxCH * 0.75 && b.courtHours > 0 ? "#a3e635" : "rgba(148,163,184,0.35)"} />
                  ))}
                </Bar>
                <Line yAxisId="right" dataKey="available" stroke="#38bdf8" strokeWidth={2} dot={false} name="Available" />
              </ComposedChart>
            </ResponsiveContainer>
            <div className="mt-2 flex items-center gap-4 text-[10px] text-slate-400">
              <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-lime-400/70" />Booked court-hours</span>
              <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-sky-400" />Available members</span>
            </div>
            {stats.peakHours.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {stats.peakHours.map((h) => (
                  <span key={h.hour} className="text-[11px] px-2 py-0.5 rounded-full bg-lime-400/15 text-lime-300 border border-lime-400/20 font-medium">
                    {h.label} · {h.courtHours.toFixed(1)} hrs · {h.available} available
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Day of week */}
          <div>
            <div className="flex items-center gap-1.5 mb-2">
              <CalendarDays className="w-3.5 h-3.5 text-sky-300" />
              <span className="text-xs font-semibold text-sky-300 uppercase tracking-wide">Busiest weekdays</span>
            </div>
            <ResponsiveContainer width="100%" height={150}>
              <BarChart data={stats.dowBuckets} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
                <Tooltip
                  cursor={{ fill: "rgba(255,255,255,0.04)" }}
                  contentStyle={{ background: "#0b1220", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12, fontSize: 12 }}
                  labelStyle={{ color: "#e2e8f0" }}
                  formatter={(v) => [`${v.toFixed(1)} court-hrs`, "Booked"]}
                />
                <Bar dataKey="courtHours" radius={[4, 4, 0, 0]} fill="#38bdf8" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </>
      )}
    </div>
  );
}

function Stat({ icon: Icon, label, value, accent }) {
  const color =
    accent === "emerald" ? "text-emerald-300"
    : accent === "rose" ? "text-rose-300"
    : accent === "lime" ? "text-lime-300"
    : "text-slate-100";
  return (
    <div className="rounded-xl bg-white/[0.03] border border-white/10 p-3">
      <div className="flex items-center gap-1.5 text-[10px] text-slate-500 uppercase"><Icon className="w-3 h-3" />{label}</div>
      <div className={`text-lg font-bold mt-1 ${color}`}>{value}</div>
    </div>
  );
}