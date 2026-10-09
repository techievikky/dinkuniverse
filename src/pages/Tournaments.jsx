import React, { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { useToast } from "@/components/ui/use-toast";
import { Loader2, Plus, Pencil, Trash2, Calendar, MapPin, Users, Trophy, Save, X, Play } from "lucide-react";
import DrawerSelect from "@/components/DrawerSelect";
import PullToRefresh from "@/components/PullToRefresh";
import ConfirmDialog from "@/components/ConfirmDialog";
import DivisionsBuilder from "@/components/tournaments/DivisionsBuilder";
import { FORMATS, categoryLabel, formatLabel } from "@/components/tournaments/divisions";
import { getUserLocation, geocode, haversine, formatDistance } from "@/lib/distance";
import { Layers, Network } from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";
import { Image } from "@/components/ui/image";
import LogoUploader from "@/components/LogoUploader";
import StripeConnectCard from "@/components/tournaments/StripeConnectCard";

const empty = {
  name: "", date: "", location: "", skill_level: "Open",
  format: "single_elimination", divisions: [], status: "open",
  max_players: "", entry_fee: "", currency: "USD",
  registration_open: true, notes: "", logo_url: ""
};

const statusStyles = {
  open: "bg-sky-500/15 text-sky-300 border-sky-500/20",
  plays: "bg-lime-500/15 text-lime-300 border-lime-500/20",
  completed: "bg-emerald-500/15 text-emerald-300 border-emerald-500/20",
  cancelled: "bg-rose-500/15 text-rose-300 border-rose-500/20",
};

const skillStyles = {
  Beginner: "bg-sky-500/15 text-sky-300 border-sky-500/20",
  Intermediate: "bg-amber-500/15 text-amber-300 border-amber-500/20",
  Advanced: "bg-rose-500/15 text-rose-300 border-rose-500/20",
  Open: "bg-lime-500/15 text-lime-300 border-lime-500/20",
};

export default function Tournaments() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(empty);
  const [editingId, setEditingId] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirmId, setConfirmId] = useState(null);
  const [nearbyIds, setNearbyIds] = useState(null); // null = still resolving, array once computed
  const [distanceMap, setDistanceMap] = useState({});
  const [locDenied, setLocDenied] = useState(false);

  const load = async () => {
    try {
      const list = await base44.entities.Tournament.list("-date", 200);
      setItems(list);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  // Stripe redirects back here after onboarding; just drop the marker params
  // since StripeConnectCard independently refreshes the account status.
  useEffect(() => {
    if (!searchParams.get("stripe")) return;
    const next = new URLSearchParams(searchParams);
    next.delete("stripe");
    setSearchParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  // Keep only tournaments whose location is within 50 miles of the user's current position.
  useEffect(() => {
    let active = true;
    (async () => {
      if (!items.length) {
        setNearbyIds([]);
        return;
      }
      setNearbyIds(null);
      setDistanceMap({});
      const user = await getUserLocation().catch(() => null);
      if (!user) {
        if (active) {
          setLocDenied(true);
          setNearbyIds(items.map((t) => t.id)); // fallback: show all
        }
        return;
      }
      setLocDenied(false);
      const near = {};
      for (const t of items) {
        if (!active) return;
        const q = t.location;
        if (!q || !q.trim()) continue;
        const coords = await geocode(q);
        await new Promise((r) => setTimeout(r, 1100)); // respect Nominatim rate limit
        if (!coords) continue;
        const mi = haversine(user.lat, user.lng, coords.lat, coords.lon, "mi");
        if (mi <= 50) near[t.id] = mi;
      }
      if (active) {
        setDistanceMap(near);
        setNearbyIds(Object.keys(near));
      }
    })();
    return () => {
      active = false;
    };
  }, [items]);

  const visible = nearbyIds ? items.filter((t) => nearbyIds.includes(t.id)) : [];
  const resolvingDistances = !locDenied && nearbyIds === null;

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const startNew = () => { setForm(empty); setEditingId(null); setShowForm(true); };
  const startEdit = (t) => {
    setForm({ ...empty, ...t, date: t.date?.slice(0, 10), max_players: t.max_players ?? "" });
    setEditingId(t.id);
    setShowForm(true);
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!form.name || !form.date || !form.location) {
      toast({ title: "Name, date and location are required", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        date: form.date,
        location: form.location.trim(),
        skill_level: form.skill_level,
        format: form.format || "single_elimination",
        divisions: Array.isArray(form.divisions)
          ? form.divisions
              .filter((d) => d && d.category)
              .map((d) => ({
                category: d.category,
                dupr_min: d.dupr_min ?? 0,
                dupr_max: d.dupr_max ?? 8,
                teams: d.teams ?? null,
              }))
          : [],
        max_players: form.max_players === "" ? null : Number(form.max_players),
        entry_fee: form.entry_fee === "" ? null : Number(form.entry_fee),
        currency: form.currency || "USD",
        registration_open: !!form.registration_open,
        notes: form.notes.trim(),
        logo_url: form.logo_url || null,
      };
      if (editingId) {
        await base44.entities.Tournament.update(editingId, payload);
      } else {
        // Create a group chat for the tournament and link it, so registered players
        // can interact with the organizer and ask questions.
        const conv = await base44.entities.Conversation.create({
          name: payload.name,
          is_group: true,
          members: [{ user_id: user.id, name: user.full_name || user.email }],
          last_message: "",
        });
        await base44.entities.Tournament.create({ ...payload, conversation_id: conv.id });
      }
      setShowForm(false);
      setForm(empty);
      setEditingId(null);
      toast({ title: "Tournament saved ✓" });
      load();
    } catch (err) {
      toast({ title: "Could not save", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id) => {
    await base44.entities.Tournament.delete(id);
    setConfirmId(null);
    load();
  };

  const inputCls =
    "w-full bg-white/5 border border-white/10 rounded-xl px-3.5 py-2.5 text-white placeholder:text-slate-500 focus:outline-none focus:border-lime-400/50 focus:ring-1 focus:ring-lime-400/30 transition";

  return (
    <PullToRefresh onRefresh={load}>
    <div>
      <div className="flex items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-white tracking-tight">Tournaments</h1>
          <p className="text-slate-400 text-sm mt-1">Plan tournaments and manage registration.</p>
        </div>
        <button
          onClick={startNew}
          className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-lime-400 hover:bg-lime-300 text-slate-900 font-semibold text-sm transition shadow-lg shadow-lime-500/20"
        >
          <Plus className="w-4 h-4" /> New tournament
        </button>
      </div>

      <StripeConnectCard />

      {showForm && (
        <form onSubmit={submit} className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 mb-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-white">{editingId ? "Edit tournament" : "New tournament"}</h2>
            <button type="button" onClick={() => { setShowForm(false); setForm(empty); setEditingId(null); }} className="text-slate-400 hover:text-white">
              <X className="w-5 h-5" />
            </button>
          </div>
          <div>
            <label className="text-xs font-medium text-slate-400 mb-1.5 block">Name</label>
            <input className={inputCls} placeholder="e.g. Summer Slam 2026" value={form.name} onChange={(e) => set("name", e.target.value)} />
          </div>
          <div>
            <label className="text-xs font-medium text-slate-400 mb-1.5 block">Tournament logo</label>
            <LogoUploader logoUrl={form.logo_url} onChange={(v) => set("logo_url", v)} label="logo" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-slate-400 mb-1.5 block">Date</label>
              <input type="date" className={inputCls} value={form.date} onChange={(e) => set("date", e.target.value)} />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-400 mb-1.5 block">Location</label>
              <input className={inputCls} placeholder="Venue" value={form.location} onChange={(e) => set("location", e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-slate-400 mb-1.5 block">Skill level</label>
              <DrawerSelect
                triggerClassName={inputCls}
                value={form.skill_level}
                onChange={(v) => set("skill_level", v)}
                options={["Beginner", "Intermediate", "Advanced", "Open"]}
                title="Skill level"
              />
            </div>
            <div>
              <label className="flex items-center gap-1.5 text-xs font-medium text-slate-400 mb-1.5">
                <Layers className="w-3.5 h-3.5" /> Format
              </label>
              <DrawerSelect
                triggerClassName={inputCls}
                value={form.format}
                onChange={(v) => set("format", v)}
                options={FORMATS}
                title="Tournament format"
              />
            </div>
          </div>
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <Layers className="w-3.5 h-3.5 text-slate-400" />
              <label className="text-xs font-medium text-slate-400">Divisions</label>
            </div>
            <DivisionsBuilder
              value={form.divisions}
              onChange={(v) => set("divisions", v)}
              inputCls={inputCls}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-slate-400 mb-1.5 block">Entry fee ($)</label>
              <input type="number" step="0.01" min="0" inputMode="decimal" className={inputCls} placeholder="0 = free" value={form.entry_fee} onChange={(e) => set("entry_fee", e.target.value)} />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-400 mb-1.5 block">Currency</label>
              <input className={inputCls} placeholder="USD" value={form.currency} onChange={(e) => set("currency", e.target.value)} />
            </div>
          </div>
          <label className="flex items-center gap-2.5 cursor-pointer">
            <input type="checkbox" checked={form.registration_open} onChange={(e) => set("registration_open", e.target.checked)} className="w-4 h-4 accent-lime-400" />
            <span className="text-sm text-slate-300">Registration open</span>
          </label>
          <div>
            <label className="text-xs font-medium text-slate-400 mb-1.5 block">Notes</label>
            <textarea rows={2} className={inputCls} value={form.notes} onChange={(e) => set("notes", e.target.value)} />
          </div>
          <button type="submit" disabled={saving} className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-lime-400 hover:bg-lime-300 disabled:opacity-60 text-slate-900 font-semibold transition">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Save className="w-4 h-4" /> Save tournament</>}
          </button>
        </form>
      )}

      {loading ? (
        <div className="flex justify-center py-16"><div className="w-6 h-6 border-4 border-white/10 border-t-lime-400 rounded-full animate-spin" /></div>
      ) : resolvingDistances ? (
        <div className="flex flex-col items-center gap-3 py-16">
          <div className="w-6 h-6 border-4 border-white/10 border-t-lime-400 rounded-full animate-spin" />
          <p className="text-slate-400 text-sm">Finding tournaments within 50 miles…</p>
        </div>
      ) : visible.length === 0 ? (
        <div className="text-center py-16 rounded-2xl border border-dashed border-white/10">
          <Trophy className="w-7 h-7 mx-auto text-slate-600 mb-2" />
          <p className="text-slate-400 text-sm">
            {locDenied
              ? "Enable location to see nearby tournaments."
              : "No tournaments within 50 miles of your location."}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {visible.map((t) => (
            <div key={t.id} className="paddle-card border border-lime-300 bg-white/[0.03] p-5 shadow-[0_0_18px_-4px_#d4ff3a]">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    {t.logo_url && (
                      <div className="w-9 h-9 shrink-0 rounded-lg overflow-hidden">
                        <Image src={t.logo_url} alt="logo" fittingType="fill" className="w-full h-full object-cover" />
                      </div>
                    )}
                    <h3 className="font-display font-semibold text-white text-lg truncate">{t.name}</h3>
                    <span className={`text-[11px] px-2.5 py-1 rounded-full border font-medium ${skillStyles[t.skill_level] || skillStyles.Open}`}>{t.skill_level}</span>
                    {t.registration_open && <span className="text-[11px] px-2.5 py-1 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/20">Open</span>}
                  </div>
                  {t.location && (
                    <div className="mt-0.5 flex items-center gap-1.5 text-sm text-slate-400">
                      <MapPin className="w-3.5 h-3.5" /> <span className="truncate">{t.location}</span>
                      {distanceMap[t.id] != null && (
                        <span className="shrink-0 text-lime-300 font-medium">· {formatDistance(distanceMap[t.id])}</span>
                      )}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className={`text-[11px] px-2.5 py-1 rounded-full border font-medium uppercase ${statusStyles[t.status] || statusStyles.open}`}>
                    {t.status || "open"}
                  </span>
                  {t.created_by_id === user?.id && (
                    <>
                      {t.status === "plays" && (
                        <Link to={`/tournaments/${t.id}/play`} className="w-11 h-11 rounded-lg border border-lime-400/30 bg-lime-400/10 hover:bg-lime-400/20 text-lime-300 flex items-center justify-center" title="Play mode — assign courts & run matches">
                          <Play className="w-4 h-4" />
                        </Link>
                      )}
                      <Link to={`/tournaments/${t.id}`} className="w-11 h-11 rounded-lg border border-lime-400/30 hover:bg-lime-400/10 hover:text-lime-300 text-slate-300 flex items-center justify-center" title="Manage brackets & scores">
                        <Network className="w-4 h-4" />
                      </Link>
                      <button onClick={() => startEdit(t)} className="w-11 h-11 rounded-lg border border-white/10 hover:bg-white/5 text-slate-300 flex items-center justify-center">
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button onClick={() => setConfirmId(t.id)} className="w-11 h-11 rounded-lg border border-white/10 hover:bg-rose-500/15 hover:text-rose-300 text-slate-300 flex items-center justify-center">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </>
                  )}
                </div>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-slate-300">
                <span className="flex items-center gap-1.5"><Calendar className="w-4 h-4 text-slate-500" />{new Date(t.date).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", year: "numeric" })}</span>
                {t.format && <span className="flex items-center gap-1.5"><Layers className="w-4 h-4 text-slate-500" />{formatLabel(t.format)}</span>}
                {t.max_players != null && <span className="flex items-center gap-1.5"><Users className="w-4 h-4 text-slate-500" />Max {t.max_players}</span>}
                {Number(t.entry_fee) > 0 && <span className="flex items-center gap-1.5"><Trophy className="w-4 h-4 text-lime-400" />${Number(t.entry_fee).toFixed(2)} entry</span>}
              </div>
              {Array.isArray(t.divisions) && t.divisions.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {t.divisions.map((d, i) => (
                    d?.category ? (
                      <span key={i} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-lime-400/10 border border-lime-400/20 text-lime-200 text-xs font-medium">
                        {categoryLabel(d.category)} · DUPR {d.dupr_min ?? 0}–{d.dupr_max ?? 8} · {d.teams ?? "—"} teams
                      </span>
                    ) : null
                  ))}
                </div>
              )}
              {t.notes && <p className="mt-3 text-sm text-slate-400 whitespace-pre-wrap">{t.notes}</p>}
            </div>
          ))}
        </div>
      )}
      <ConfirmDialog
        open={!!confirmId}
        onOpenChange={(o) => { if (!o) setConfirmId(null); }}
        title="Delete this tournament?"
        description="This action cannot be undone."
        confirmText="Delete"
        destructive
        onConfirm={() => remove(confirmId)}
      />
    </div>
    </PullToRefresh>
  );
}