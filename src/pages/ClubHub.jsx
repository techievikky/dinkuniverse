import React, { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { useToast } from "@/components/ui/use-toast";
import ClubSetup from "@/components/clubhub/ClubSetup";
import MembersPanel from "@/components/clubhub/MembersPanel";
import CourtsPanel from "@/components/clubhub/CourtsPanel";
import AlertsPanel from "@/components/clubhub/AlertsPanel";
import CheckInsPanel from "@/components/clubhub/CheckInsPanel";
import {
  Loader2, Plus, Pencil, Trash2, Calendar, Clock, Percent,
  DollarSign, LayoutGrid, MapPin, Save, X
} from "lucide-react";
import PullToRefresh from "@/components/PullToRefresh";
import ConfirmDialog from "@/components/ConfirmDialog";
import EventsCalendar from "@/components/clubhub/EventsCalendar";
import BookingRequestsPanel from "@/components/clubhub/BookingRequestsPanel";

const empty = {
  title: "", date: "", time: "", duration_hours: "",
  discount: "", rate_per_hour: "", courts_available: "", location: "", notes: "",
  members_only: false, recurring: false, recurrence_type: "daily", recurrence_weekdays: [], recurrence_end: "",
  court_numbers: []
};

export default function ClubHub() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(empty);
  const [editingId, setEditingId] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [clubs, setClubs] = useState([]);
  const [tab, setTab] = useState("manage");
  const [confirmId, setConfirmId] = useState(null);
  const [view, setView] = useState("list");

  // Loads events + clubs, then auto-syncs each court's blocked state from the
  // current event assignments. A court is blocked while ≥1 event assigns it and
  // becomes available again once no event references it — the only way to free a
  // court is to remove it from the event schedule.
  const refresh = async () => {
    try {
      const [list, all] = await Promise.all([
        base44.entities.ClubEvent.list("-date", 200),
        base44.entities.Club.list("-created_date", 50),
      ]);
      const mine = list.filter((e) => e.created_by_id === user?.id);
      setEvents(mine);
      const myClubs = all.filter((c) => c.created_by_id === user?.id);
      setClubs(myClubs);

      const club = myClubs[0];
      if (club) {
        const booked = new Set();
        for (const ev of mine) for (const cn of ev.court_numbers || []) booked.add(cn);
        const courts = (club.courts || []).map((c) => ({ ...c, blocked: booked.has(c.number) }));
        if (JSON.stringify(courts) !== JSON.stringify(club.courts || [])) {
          await base44.entities.Club.update(club.id, { courts });
          setClubs(myClubs.map((c) => (c.id === club.id ? { ...club, courts } : c)));
        }
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  // Courts already booked by other events (the one being edited is excluded) —
  // these can't be reassigned, which prevents double-booking the same court.
  const takenCourts = new Set();
  for (const ev of events) {
    if (ev.id === editingId) continue;
    for (const cn of ev.court_numbers || []) takenCourts.add(cn);
  }
  const bookedNumbers = new Set();
  for (const ev of events) for (const cn of ev.court_numbers || []) bookedNumbers.add(cn);

  const startNew = () => { setForm(empty); setEditingId(null); setShowForm(true); };
  const startEdit = (e) => {
    setForm({ ...empty, ...e, date: e.date?.slice(0, 10) });
    setEditingId(e.id);
    setShowForm(true);
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!form.title || !form.date || !form.time) {
      toast({ title: "Title, date and time are required", variant: "destructive" });
      return;
    }
    if (!form.court_numbers || form.court_numbers.length === 0) {
      toast({ title: "Assign at least one court to the event", variant: "destructive" });
      return;
    }
    // Hard validation: a court can only be assigned to one event at a time —
    // reject the save if any selected court is already held by another event.
    const conflicts = [];
    for (const cn of form.court_numbers) {
      const holder = events.find((ev) => ev.id !== editingId && (ev.court_numbers || []).includes(cn));
      if (holder) conflicts.push({ court: cn, title: holder.title });
    }
    if (conflicts.length) {
      const detail = conflicts.map((c) => `Court ${c.court} is already booked by "${c.title}"`).join("; ");
      toast({ title: "Court conflict", description: `${detail}. Remove it from that event first.`, variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const clubId = clubs[0]?.id || null;
      const membersOnly = !!form.members_only;
      const basePayload = {
        title: form.title.trim(),
        time: form.time,
        duration_hours: form.duration_hours === "" ? null : Number(form.duration_hours),
        discount: form.discount === "" ? null : Number(form.discount),
        rate_per_hour: form.rate_per_hour === "" ? null : Number(form.rate_per_hour),
        courts_available: form.courts_available === "" ? null : Number(form.courts_available),
        court_numbers: form.court_numbers,
        location: form.location.trim(),
        notes: form.notes.trim(),
        members_only: membersOnly,
        club_id: clubId,
      };
      const playBase = {
        title: basePayload.title,
        time: basePayload.time,
        location: basePayload.location || clubs[0]?.name || "Club event",
        max_players: basePayload.courts_available ? basePayload.courts_available * 4 : 4,
        skill_level: "Open",
        status: "open",
        notes: basePayload.notes,
        members_only: membersOnly,
        club_id: clubId,
      };

      // Build the list of occurrence dates (single unless recurring).
      let dates = [form.date];
      if (form.recurring && !editingId) {
        dates = [];
        const start = new Date(form.date + "T00:00:00");
        const cap = form.recurrence_end ? new Date(form.recurrence_end + "T00:00:00") : new Date(start.getTime() + 90 * 86400000);
        const weekdays = form.recurrence_weekdays || [];
        for (let d = new Date(start); d <= cap && dates.length < 90; d.setDate(d.getDate() + 1)) {
          const dow = d.getDay();
          let include = false;
          if (form.recurrence_type === "daily") include = true;
          else if (form.recurrence_type === "weekdays") include = dow >= 1 && dow <= 5;
          else if (form.recurrence_type === "weekends") include = dow === 0 || dow === 6;
          else if (form.recurrence_type === "custom") include = weekdays.includes(dow);
          if (include) dates.push(d.toISOString().slice(0, 10));
        }
        if (dates.length === 0) dates = [form.date];
      }
      const recurringMeta = form.recurring && !editingId
        ? { recurring: true, recurrence_type: form.recurrence_type, recurrence_weekdays: form.recurrence_weekdays || [], recurrence_end: form.recurrence_end || null }
        : {};

      if (editingId) {
        await base44.entities.ClubEvent.update(editingId, { ...basePayload, date: form.date });
        const existing = events.find((e) => e.id === editingId);
        const playPayload = { ...playBase, date: form.date };
        if (existing?.play_id) {
          await base44.entities.Play.update(existing.play_id, playPayload);
        } else {
          const play = await base44.entities.Play.create(playPayload);
          await base44.entities.ClubEvent.update(editingId, { play_id: play.id });
        }
      } else {
        for (const dt of dates) {
          const play = await base44.entities.Play.create({ ...playBase, date: dt });
          await base44.entities.ClubEvent.create({ ...basePayload, ...recurringMeta, date: dt, play_id: play.id });
        }
      }
      setShowForm(false);
      setForm(empty);
      setEditingId(null);
      toast({ title: "Event saved ✓" });
      refresh();
    } catch (err) {
      toast({ title: "Could not save", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id) => {
    const ev = events.find((e) => e.id === id);
    if (ev?.play_id) {
      try {
        await base44.entities.Play.delete(ev.play_id);
      } catch {
        /* play already removed */
      }
    }
    await base44.entities.ClubEvent.delete(id);
    setConfirmId(null);
    refresh();
  };

  const inputCls =
    "w-full bg-white/5 border border-white/10 rounded-xl px-3.5 py-2.5 text-white placeholder:text-slate-500 focus:outline-none focus:border-lime-400/50 focus:ring-1 focus:ring-lime-400/30 transition";

  return (
    <PullToRefresh onRefresh={refresh}>
    <div>
      <div className="mb-5">
        <h1 className="font-display text-2xl sm:text-3xl font-bold text-white tracking-tight">Club Hub</h1>
        <p className="text-slate-400 text-sm mt-1">Manage your club, members and event calendar.</p>
      </div>

      <div className="flex gap-1 rounded-xl border border-white/10 bg-white/[0.03] p-1 mb-6">
        {[
          { id: "manage", label: "Manage" },
          { id: "checkin", label: "Check-in" },
          { id: "events", label: "Events" },
        ].map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex-1 px-3 py-2 rounded-lg text-sm font-semibold transition ${
              tab === t.id ? "bg-lime-400 text-slate-900" : "text-slate-300 hover:bg-white/5"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "manage" && (
        <>
          <ClubSetup club={clubs[0]} onSaved={refresh} />
          {clubs[0] && <BookingRequestsPanel club={clubs[0]} />}
          {clubs.length > 0 && (
            <div className="mt-5 space-y-5">
              <MembersPanel clubs={clubs} />
              <CourtsPanel club={clubs[0]} bookedNumbers={[...bookedNumbers]} onSaved={refresh} />
              <AlertsPanel clubs={clubs} />
            </div>
          )}
        </>
      )}

      {tab === "checkin" && <CheckInsPanel club={clubs[0]} />}

      {tab === "events" && (
      <>
      <div className="flex items-center justify-between gap-3 mt-8 mb-5">
        <h2 className="font-display text-xl font-semibold text-white">Events</h2>
        <div className="flex items-center gap-2">
          <div className="flex rounded-xl border border-white/10 overflow-hidden">
            <button onClick={() => setView("list")} className={`px-3 py-2 text-xs font-semibold transition ${view === "list" ? "bg-lime-400 text-slate-900" : "bg-white/5 text-slate-300 hover:bg-white/10"}`}>List</button>
            <button onClick={() => setView("calendar")} className={`px-3 py-2 text-xs font-semibold transition ${view === "calendar" ? "bg-lime-400 text-slate-900" : "bg-white/5 text-slate-300 hover:bg-white/10"}`}>Calendar</button>
          </div>
          <button
            onClick={startNew}
            className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-lime-400 hover:bg-lime-300 text-slate-900 font-semibold text-sm transition shadow-lg shadow-lime-500/20"
          >
            <Plus className="w-4 h-4" /> New event
          </button>
        </div>
      </div>

      {showForm && (
        <form onSubmit={submit} className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 mb-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-white">{editingId ? "Edit event" : "New event"}</h2>
            <button type="button" onClick={() => { setShowForm(false); setForm(empty); setEditingId(null); }} className="text-slate-400 hover:text-white">
              <X className="w-5 h-5" />
            </button>
          </div>
          <div>
            <label className="text-xs font-medium text-slate-400 mb-1.5 block">Event title</label>
            <input className={inputCls} placeholder="e.g. Friday Night Social" value={form.title} onChange={(e) => set("title", e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-slate-400 mb-1.5 block">Date</label>
              <input type="date" className={inputCls} value={form.date} onChange={(e) => set("date", e.target.value)} />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-400 mb-1.5 block">Start time</label>
              <input type="time" className={inputCls} value={form.time} onChange={(e) => set("time", e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-slate-400 mb-1.5 block">Duration (hours)</label>
              <input type="number" step="0.5" min="0" className={inputCls} placeholder="e.g. 2" value={form.duration_hours} onChange={(e) => set("duration_hours", e.target.value)} />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-400 mb-1.5 block">Courts available</label>
              <input type="number" min="0" className={inputCls} placeholder="e.g. 6" value={form.courts_available} onChange={(e) => set("courts_available", e.target.value)} />
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-slate-400 mb-1.5 block">Assign courts <span className="text-rose-400">*</span></label>
            {(!clubs[0]?.courts || clubs[0].courts.length === 0) ? (
              <p className="text-xs text-slate-500">Add courts in the Courts panel above first.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {clubs[0].courts.map((c) => {
                  const on = (form.court_numbers || []).includes(c.number);
                  const taken = takenCourts.has(c.number);
                  return (
                    <button
                      key={c.number}
                      type="button"
                      disabled={taken}
                      onClick={() => set("court_numbers", on ? (form.court_numbers || []).filter((n) => n !== c.number) : [...(form.court_numbers || []), c.number])}
                      className={`px-3 py-2 rounded-xl text-sm font-medium border transition ${
                        on ? "bg-lime-400 text-slate-900 border-lime-400" :
                        taken ? "bg-white/5 text-slate-600 border-white/10 line-through cursor-not-allowed" :
                        "bg-white/5 text-slate-200 border-white/10 hover:border-lime-400/40"
                      }`}
                    >
                      {c.number}
                    </button>
                  );
                })}
              </div>
            )}
            <p className="text-[11px] text-slate-500 mt-1">Courts are auto-blocked while assigned. Struck-through courts are booked by another event — remove the court from that event to reassign it.</p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-slate-400 mb-1.5 block">Rate per hour ($)</label>
              <input type="number" step="0.01" min="0" className={inputCls} placeholder="e.g. 15" value={form.rate_per_hour} onChange={(e) => set("rate_per_hour", e.target.value)} />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-400 mb-1.5 block">Discount (%)</label>
              <input type="number" step="1" min="0" max="100" className={inputCls} placeholder="e.g. 10" value={form.discount} onChange={(e) => set("discount", e.target.value)} />
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-slate-400 mb-1.5 block">Location</label>
            <input className={inputCls} placeholder="Court / venue name" value={form.location} onChange={(e) => set("location", e.target.value)} />
          </div>
          <div>
            <label className="text-xs font-medium text-slate-400 mb-1.5 block">Notes</label>
            <textarea rows={2} className={inputCls} value={form.notes} onChange={(e) => set("notes", e.target.value)} />
          </div>

          <div className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.02] px-3.5 py-2.5">
            <div>
              <div className="text-sm font-medium text-white">Members only</div>
              <div className="text-[11px] text-slate-500">Hide from non-members of this club</div>
            </div>
            <button type="button" onClick={() => set("members_only", !form.members_only)} className={`relative w-11 h-6 rounded-full transition ${form.members_only ? "bg-lime-400" : "bg-white/10"}`}>
              <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform ${form.members_only ? "translate-x-5" : ""}`} />
            </button>
          </div>

          <div className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.02] px-3.5 py-2.5">
            <div>
              <div className="text-sm font-medium text-white">Recurring event</div>
              <div className="text-[11px] text-slate-500">Repeat this session on a schedule</div>
            </div>
            <button type="button" onClick={() => set("recurring", !form.recurring)} className={`relative w-11 h-6 rounded-full transition ${form.recurring ? "bg-lime-400" : "bg-white/10"}`}>
              <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform ${form.recurring ? "translate-x-5" : ""}`} />
            </button>
          </div>

          {form.recurring && !editingId && (
            <div className="space-y-3 rounded-xl border border-white/10 bg-white/[0.02] p-3.5">
              <div>
                <label className="text-xs font-medium text-slate-400 mb-1.5 block">Repeat</label>
                <select className={inputCls} value={form.recurrence_type} onChange={(e) => set("recurrence_type", e.target.value)}>
                  <option value="daily">Every day</option>
                  <option value="weekdays">Weekdays (Mon–Fri)</option>
                  <option value="weekends">Weekends (Sat–Sun)</option>
                  <option value="custom">Specific days</option>
                </select>
              </div>
              {form.recurrence_type === "custom" && (
                <div>
                  <label className="text-xs font-medium text-slate-400 mb-1.5 block">Pick days</label>
                  <div className="flex gap-1.5">
                    {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => {
                      const on = (form.recurrence_weekdays || []).includes(i);
                      return (
                        <button key={i} type="button" onClick={() => set("recurrence_weekdays", on ? (form.recurrence_weekdays || []).filter((x) => x !== i) : [...(form.recurrence_weekdays || []), i].sort((a, b) => a - b))} className={`w-9 h-9 rounded-lg text-xs font-semibold transition ${on ? "bg-lime-400 text-slate-900" : "bg-white/5 text-slate-300 hover:bg-white/10"}`}>{d}</button>
                      );
                    })}
                  </div>
                </div>
              )}
              <div>
                <label className="text-xs font-medium text-slate-400 mb-1.5 block">End date (optional)</label>
                <input type="date" className={inputCls} value={form.recurrence_end} onChange={(e) => set("recurrence_end", e.target.value)} />
              </div>
              <p className="text-[11px] text-slate-500">The date above is the first occurrence. Up to 90 occurrences are created.</p>
            </div>
          )}

          <button type="submit" disabled={saving} className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-lime-400 hover:bg-lime-300 disabled:opacity-60 text-slate-900 font-semibold transition">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Save className="w-4 h-4" /> Save event</>}
          </button>
        </form>
      )}

      {loading ? (
        <div className="flex justify-center py-16"><div className="w-6 h-6 border-4 border-white/10 border-t-lime-400 rounded-full animate-spin" /></div>
      ) : events.length === 0 ? (
        <div className="text-center py-16 rounded-2xl border border-dashed border-white/10">
          <Calendar className="w-7 h-7 mx-auto text-slate-600 mb-2" />
          <p className="text-slate-400 text-sm">No events yet. Tap "New event" to add one.</p>
        </div>
      ) : view === "calendar" ? (
        <EventsCalendar events={events} onEdit={startEdit} />
      ) : (
        <div className="space-y-3">
          {events.map((e) => (
            <div key={e.id} className="paddle-card border border-lime-300 bg-white/[0.03] p-5 shadow-[0_0_18px_-4px_#d4ff3a]">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="font-display font-semibold text-white text-lg truncate">{e.title}</h3>
                  {e.location && (
                    <div className="mt-0.5 flex items-center gap-1.5 text-sm text-slate-400">
                      <MapPin className="w-3.5 h-3.5" /> <span className="truncate">{e.location}</span>
                    </div>
                  )}
                  {(e.members_only || e.recurring) && (
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {e.members_only && <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-400/15 text-amber-300 font-medium">Members only</span>}
                      {e.recurring && <span className="text-[10px] px-2 py-0.5 rounded-full bg-sky-400/15 text-sky-300 font-medium">Recurring</span>}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button onClick={() => startEdit(e)} className="w-11 h-11 rounded-lg border border-white/10 hover:bg-white/5 text-slate-300 flex items-center justify-center">
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button onClick={() => setConfirmId(e.id)} className="w-11 h-11 rounded-lg border border-white/10 hover:bg-rose-500/15 hover:text-rose-300 text-slate-300 flex items-center justify-center">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-slate-300">
                <span className="flex items-center gap-1.5"><Calendar className="w-4 h-4 text-slate-500" />{new Date(e.date).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}</span>
                <span className="flex items-center gap-1.5"><Clock className="w-4 h-4 text-slate-500" />{e.time}{e.duration_hours ? ` · ${e.duration_hours}h` : ""}</span>
                {e.court_numbers?.length ? (
                  <span className="flex items-center gap-1.5"><LayoutGrid className="w-4 h-4 text-slate-500" />Courts {e.court_numbers.join(", ")}</span>
                ) : e.courts_available != null ? (
                  <span className="flex items-center gap-1.5"><LayoutGrid className="w-4 h-4 text-slate-500" />{e.courts_available} courts</span>
                ) : null}
                {e.rate_per_hour != null && <span className="flex items-center gap-1.5"><DollarSign className="w-4 h-4 text-slate-500" />{e.rate_per_hour}/hr</span>}
                {e.discount != null && <span className="flex items-center gap-1.5"><Percent className="w-4 h-4 text-slate-500" />{e.discount}% off</span>}
              </div>
              {e.notes && <p className="mt-3 text-sm text-slate-400 whitespace-pre-wrap">{e.notes}</p>}
            </div>
          ))}
        </div>
      )}
      </>
      )}
      <ConfirmDialog
        open={!!confirmId}
        onOpenChange={(o) => { if (!o) setConfirmId(null); }}
        title="Delete this event?"
        description="This action cannot be undone."
        confirmText="Delete"
        destructive
        onConfirm={() => remove(confirmId)}
      />
    </div>
    </PullToRefresh>
  );
}