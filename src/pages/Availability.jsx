import React, { useState, useEffect, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { useToast } from "@/components/ui/use-toast";
import AvailabilityCalendar from "@/components/AvailabilityCalendar";
import ClubAvailabilityBoard from "@/components/ClubAvailabilityBoard";
import { Loader2, Save, Clock, Users } from "lucide-react";

// Playable hours: 6am - 9pm
const HOURS = Array.from({ length: 16 }, (_, i) => i + 6); // 6..21

const formatHour = (h) => {
  const ampm = h < 12 ? "AM" : "PM";
  const display = h === 0 ? 12 : h <= 12 ? h : h - 12;
  return `${display} ${ampm}`;
};

export default function Availability() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [monthDate, setMonthDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().slice(0, 10));
  const [availMap, setAvailMap] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [selectedHours, setSelectedHours] = useState(new Set());
  const [mode, setMode] = useState("mine"); // "mine" | "club"

  const load = async () => {
    try {
      const records = await base44.entities.Availability.filter(
        { created_by_id: user.id },
        "-date",
        300
      );
      const map = {};
      records.forEach((r) => {
        // keep first record if duplicates exist
        if (!map[r.date]) map[r.date] = r;
      });
      setAvailMap(map);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user) load();
  }, [user]);

  // When selected date changes, sync hour set with stored record
  useEffect(() => {
    const rec = availMap[selectedDate];
    setSelectedHours(new Set(rec?.hours || []));
  }, [selectedDate, availMap]);

  const goPrev = () => setMonthDate(new Date(monthDate.getFullYear(), monthDate.getMonth() - 1, 1));
  const goNext = () => setMonthDate(new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 1));

  const toggleHour = (h) => {
    setSelectedHours((prev) => {
      const next = new Set(prev);
      if (next.has(h)) next.delete(h);
      else next.add(h);
      return next;
    });
  };

  const save = async () => {
    setSaving(true);
    try {
      const hours = Array.from(selectedHours).sort((a, b) => a - b);
      const existing = availMap[selectedDate];
      let record;
      if (existing) {
        record = await base44.entities.Availability.update(existing.id, { hours });
      } else {
        record = await base44.entities.Availability.create({ date: selectedDate, hours });
      }
      setAvailMap((m) => ({ ...m, [selectedDate]: record }));
      toast({
        title: hours.length ? `Saved ${hours.length} hour${hours.length !== 1 ? "s" : ""} for ${selectedDate}` : "Availability cleared",
      });
    } catch (err) {
      toast({ title: "Could not save availability", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const selectedLabel = useMemo(() => {
    if (!selectedDate) return "";
    return new Date(selectedDate + "T00:00:00").toLocaleDateString(undefined, {
      weekday: "long",
      month: "long",
      day: "numeric",
    });
  }, [selectedDate]);

  return (
    <div>
      <h1 className="font-display text-2xl sm:text-3xl font-bold text-white tracking-tight">Free Times</h1>
      <p className="text-slate-400 text-sm mt-1 mb-4">Mark the days and hours you're free to play.</p>

      <div className="inline-flex rounded-xl border border-white/10 bg-white/[0.03] p-1 mb-6">
        <button
          onClick={() => setMode("mine")}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition ${mode === "mine" ? "bg-lime-400 text-slate-900" : "text-slate-300 hover:text-white"}`}
        >
          My free times
        </button>
        <button
          onClick={() => setMode("club")}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition inline-flex items-center gap-1.5 ${mode === "club" ? "bg-lime-400 text-slate-900" : "text-slate-300 hover:text-white"}`}
        >
          <Users className="w-3.5 h-3.5" /> Club board
        </button>
      </div>

      {mode === "club" && <ClubAvailabilityBoard />}

      {mode === "mine" && (loading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="w-6 h-6 animate-spin text-slate-500" />
        </div>
      ) : (
        <div className="grid lg:grid-cols-2 gap-5">
          <AvailabilityCalendar
            monthDate={monthDate}
            availMap={availMap}
            selectedDate={selectedDate}
            onSelectDate={setSelectedDate}
            onPrev={goPrev}
            onNext={goNext}
          />

          <div className="rounded-2xl border border-white/5 bg-white/[0.03] p-5">
            <h2 className="font-display text-lg font-semibold text-white mb-1">{selectedLabel}</h2>
            <p className="text-xs text-slate-400 mb-4 flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5" /> Tap the hours you can play
            </p>

            <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
              {HOURS.map((h) => {
                const active = selectedHours.has(h);
                return (
                  <button
                    key={h}
                    onClick={() => toggleHour(h)}
                    className={`px-2 py-2.5 rounded-xl text-sm font-medium transition border ${
                      active
                        ? "bg-lime-400 text-slate-900 border-lime-400"
                        : "bg-white/[0.02] text-slate-400 border-white/5 hover:bg-white/5 hover:text-slate-200"
                    }`}
                  >
                    {formatHour(h)}
                  </button>
                );
              })}
            </div>

            <div className="mt-4 text-xs text-slate-400">
              {selectedHours.size} hour{selectedHours.size !== 1 ? "s" : ""} selected
            </div>

            <button
              onClick={save}
              disabled={saving}
              className="mt-4 w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-lime-400 hover:bg-lime-300 disabled:opacity-60 text-slate-900 font-semibold transition shadow-lg shadow-lime-500/20"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Save className="w-4 h-4" /> Save availability</>}
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}