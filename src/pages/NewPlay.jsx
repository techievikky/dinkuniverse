import React, { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { useNavigate, useLocation } from "react-router-dom";
import { useToast } from "@/components/ui/use-toast";
import { Loader2, ArrowLeft, CalendarDays, LayoutGrid } from "lucide-react";
import { Link } from "react-router-dom";
import DrawerSelect from "@/components/DrawerSelect";
import { Calendar } from "@/components/ui/calendar";
import MyCourtRequestsPanel from "@/components/MyCourtRequestsPanel";

const dateFromValue = (value) => {
  if (!value) return undefined;
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
};

const valueFromDate = (date) => {
  if (!date) return "";
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

export default function NewPlay() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [clubs, setClubs] = useState([]);
  const [loadingClubs, setLoadingClubs] = useState(true);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [requestType, setRequestType] = useState("play");
  const [selectedCourts, setSelectedCourts] = useState([]);
  const [requestsVersion, setRequestsVersion] = useState(0);
  const [form, setForm] = useState({
    title: "",
    date: "",
    start_time: "18:00",
    end_time: "20:00",
    location: "",
    club_id: "",
    address: "",
    skill_level: "Open",
    max_players: 4,
    notes: "",
  });

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  useEffect(() => {
    (async () => {
      try {
        setClubs(await base44.entities.Club.list("-created_date", 200));
      } finally {
        setLoadingClubs(false);
      }
    })();
  }, []);

  const selectClub = (clubId) => {
    const club = clubs.find((item) => item.id === clubId);
    setForm((current) => ({
      ...current,
      club_id: clubId,
      location: club?.name || "",
      address: club?.location || "",
    }));
    setSelectedCourts([]);
  };

  const selectedClub = clubs.find((club) => club.id === form.club_id);
  const availableCourts = (selectedClub?.courts || []).filter((court) => !court.blocked && !court.disabled);

  const submit = async (e) => {
    e.preventDefault();
    if (!form.title || !form.date || !form.start_time || !form.end_time || !form.club_id) {
      toast({ title: "Please fill in title, date, start time, end time and club location." });
      return;
    }
    if (requestType === "court_block" && selectedCourts.length === 0) {
      toast({ title: "Choose at least one available court.", variant: "destructive" });
      return;
    }
    const [startHour, startMinute] = form.start_time.split(":").map(Number);
    const [endHour, endMinute] = form.end_time.split(":").map(Number);
    const durationMinutes = (endHour * 60 + endMinute) - (startHour * 60 + startMinute);
    if (durationMinutes <= 0) {
      toast({ title: "End time must be after start time.", variant: "destructive" });
      return;
    }
    if (durationMinutes < 30) {
      toast({ title: "Start and end times must be at least 30 minutes apart.", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      if (requestType === "court_block") {
        await base44.entities.ClubBookingRequest.create({
          club_id: form.club_id,
          title: form.title,
          date: form.date,
          start_time: form.start_time,
          end_time: form.end_time,
          court_numbers: selectedCourts,
          notes: form.notes,
        });
        toast({ title: "Court request sent", description: "The club admin will review your request." });
        set("title", "");
        set("notes", "");
        setSelectedCourts([]);
        setRequestsVersion((v) => v + 1);
        return;
      }
      const created = await base44.entities.Play.create({
        ...form,
        time: form.start_time,
        max_players: Number(form.max_players),
        club_id: form.club_id,
        members_only: true,
        players: [{ user_id: user.id, name: user.full_name || user.email, photo_url: user.photo_url }],
      });
      toast({ title: "Play created 🎾" });
      navigate(`/plays/${created.id}`);
    } catch (err) {
      toast({ title: "Something went wrong", description: err.message });
    } finally {
      setSaving(false);
    }
  };

  const inputCls =
    "w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder:text-slate-500 focus:outline-none focus:border-lime-400/50 focus:ring-1 focus:ring-lime-400/30 transition";

  return (
    <div className="max-w-xl mx-auto">
      {pathname !== "/new" && (
        <Link to="/" className="inline-flex items-center gap-1.5 text-sm text-slate-400 hover:text-white mb-4">
          <ArrowLeft className="w-4 h-4" /> Back
        </Link>
      )}
      <h1 className="font-display text-2xl font-bold text-white mb-1">Schedule a play</h1>
      <p className="text-slate-400 text-sm mb-5">Create a play or ask a club admin to reserve courts.</p>

      <MyCourtRequestsPanel refreshKey={requestsVersion} />

      <div className="grid grid-cols-2 gap-1 rounded-xl border border-white/10 bg-white/[0.03] p-1 mb-5" role="group" aria-label="Request type">
        <button
          type="button"
          aria-pressed={requestType === "play"}
          onClick={() => setRequestType("play")}
          className={`rounded-lg px-3 py-2.5 text-sm font-medium transition ${requestType === "play" ? "bg-lime-400 text-slate-900" : "text-slate-300 hover:bg-white/5"}`}
        >
          Schedule a play
        </button>
        <button
          type="button"
          aria-pressed={requestType === "court_block"}
          onClick={() => setRequestType("court_block")}
          className={`rounded-lg px-3 py-2.5 text-sm font-medium transition ${requestType === "court_block" ? "bg-lime-400 text-slate-900" : "text-slate-300 hover:bg-white/5"}`}
        >
          Request court block
        </button>
      </div>
      {requestType === "court_block" && (
        <p className="mb-4 rounded-xl border border-amber-400/20 bg-amber-400/[0.06] px-3.5 py-3 text-xs text-amber-200">
          Your court reservation is sent to the club admin and is not confirmed until approved.
        </p>
      )}

      <form onSubmit={submit} className="space-y-4">
        <div>
          <label className="block text-xs font-medium text-slate-400 mb-1.5">{requestType === "play" ? "Play title" : "Request title"}</label>
          <input className={inputCls} placeholder={requestType === "play" ? "e.g. Evening Dinks at Lincoln Park" : "e.g. Saturday open play"} value={form.title} onChange={(e) => set("title", e.target.value)} />
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-400 mb-1.5">Date</label>
          <div className="relative">
            <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3.5 py-3 text-sm text-white">
              <span className="flex-1">
              {form.date
                ? dateFromValue(form.date).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", year: "numeric" })
                : <span className="text-slate-500">Choose a date</span>}
              </span>
              <button
                type="button"
                onClick={() => setCalendarOpen((open) => !open)}
                aria-label={calendarOpen ? "Hide calendar" : "Show calendar"}
                title={calendarOpen ? "Hide calendar" : "Show calendar"}
                className={`w-7 h-7 rounded-lg flex items-center justify-center transition ${calendarOpen ? "bg-lime-400 text-slate-900" : "text-lime-400 hover:bg-white/10"}`}
              >
                <CalendarDays className="w-4 h-4" />
              </button>
            </div>
            {calendarOpen && (
              <div className="absolute left-0 right-0 top-full z-20 mt-2 rounded-xl border border-white/10 bg-slate-900 shadow-2xl">
                <Calendar
                  mode="single"
                  selected={dateFromValue(form.date)}
                  onSelect={(date) => {
                    set("date", valueFromDate(date));
                    setCalendarOpen(false);
                  }}
                  disabled={{ before: new Date() }}
                  initialFocus
                  className="w-full text-white"
                  classNames={{
                    caption_label: "text-sm font-medium text-white",
                    head_cell: "text-slate-500 rounded-md w-8 font-normal text-[0.8rem]",
                    day: "h-8 w-8 p-0 font-normal text-slate-200 hover:bg-white/10 rounded-md",
                    day_selected: "bg-lime-400 text-slate-900 hover:bg-lime-300 hover:text-slate-900 focus:bg-lime-300 focus:text-slate-900",
                    day_today: "bg-white/10 text-lime-300",
                    day_outside: "text-slate-600",
                    day_disabled: "text-slate-600 opacity-50",
                  }}
                />
              </div>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">Start time</label>
            <input type="time" className={`${inputCls} accent-lime-400 [color-scheme:dark]`} value={form.start_time} onChange={(e) => set("start_time", e.target.value)} />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">End time</label>
            <input type="time" className={`${inputCls} accent-lime-400 [color-scheme:dark]`} value={form.end_time} onChange={(e) => set("end_time", e.target.value)} />
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-400 mb-1.5">Club location</label>
          <DrawerSelect
            triggerClassName={inputCls}
            value={form.club_id}
            onChange={selectClub}
            options={clubs.map((club) => ({ value: club.id, label: club.name }))}
            placeholder={loadingClubs ? "Loading clubs…" : "Select a club"}
            title="Choose a club"
          />
          {!loadingClubs && clubs.length === 0 && (
            <p className="text-xs text-amber-300 mt-1.5">No clubs are available yet. Join or create a club before scheduling a play.</p>
          )}
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-400 mb-1.5">Club address</label>
          <input className={inputCls} placeholder="Selected club address" value={form.address} readOnly />
        </div>

        {requestType === "court_block" && (
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-2">Courts to reserve</label>
            {availableCourts.length === 0 ? (
              <p className="rounded-xl border border-dashed border-white/10 px-3.5 py-3 text-sm text-slate-500">
                {form.club_id ? "This club has no available courts to request." : "Choose a club to see its available courts."}
              </p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {availableCourts.map((court) => {
                  const selected = selectedCourts.includes(String(court.number));
                  return (
                    <button
                      key={court.number}
                      type="button"
                      aria-pressed={selected}
                      onClick={() => setSelectedCourts((current) => selected
                        ? current.filter((number) => number !== String(court.number))
                        : [...current, String(court.number)])}
                      className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium transition ${selected ? "border-lime-400 bg-lime-400 text-slate-900" : "border-white/10 bg-white/[0.03] text-slate-300 hover:border-lime-400/40"}`}
                    >
                      <LayoutGrid className="h-3.5 w-3.5" /> Court {court.number}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {requestType === "play" && <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">Skill level</label>
            <DrawerSelect
              triggerClassName={inputCls}
              value={form.skill_level}
              onChange={(v) => set("skill_level", v)}
              options={["Open", "Beginner", "Intermediate", "Advanced"]}
              title="Skill level"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">Max players</label>
            <input type="number" min={2} max={16} className={inputCls} value={form.max_players} onChange={(e) => set("max_players", e.target.value)} />
          </div>
        </div>}

        <div>
          <label className="block text-xs font-medium text-slate-400 mb-1.5">Notes (optional)</label>
          <textarea rows={3} className={inputCls} placeholder="Bring water, paddles, balls…" value={form.notes} onChange={(e) => set("notes", e.target.value)} />
        </div>

        <button
          type="submit"
          disabled={saving}
          className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-lime-400 hover:bg-lime-300 disabled:opacity-60 text-slate-900 font-semibold transition shadow-lg shadow-lime-500/20"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : requestType === "play" ? "Create play" : "Send court request"}
        </button>
      </form>
    </div>
  );
}