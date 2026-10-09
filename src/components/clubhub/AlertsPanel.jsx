import React, { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { useToast } from "@/components/ui/use-toast";
import { Loader2, Plus, Trash2, Tag, CalendarCheck, Megaphone, X, Power } from "lucide-react";

const empty = { title: "", message: "", type: "discount", discount: "", expires: "" };

const typeMeta = {
  discount: { icon: Tag, color: "text-amber-300", chip: "bg-amber-400/15 text-amber-200" },
  booking: { icon: CalendarCheck, color: "text-sky-300", chip: "bg-sky-400/15 text-sky-200" },
  general: { icon: Megaphone, color: "text-lime-300", chip: "bg-lime-400/15 text-lime-200" },
};

export default function AlertsPanel({ clubs }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const club = clubs[0];
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(empty);
  const [show, setShow] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const all = await base44.entities.ClubAlert.list("-created_date", 200);
      setAlerts(all.filter((a) => a.created_by_id === user?.id && a.club_id === club?.id));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (club) load();
    else setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [club?.id]);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async (e) => {
    e.preventDefault();
    if (!form.title.trim()) {
      toast({ title: "Title is required", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      await base44.entities.ClubAlert.create({
        club_id: club.id,
        club_name: club.name,
        title: form.title.trim(),
        message: form.message.trim(),
        type: form.type,
        discount: form.discount === "" ? null : Number(form.discount),
        expires: form.expires || null,
        active: true,
      });
      setShow(false);
      setForm(empty);
      toast({ title: "Alert posted ✓" });
      load();
    } catch (err) {
      toast({ title: "Could not save", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const toggle = async (a) => {
    try {
      await base44.entities.ClubAlert.update(a.id, { active: !a.active });
      load();
    } catch (err) {
      toast({ title: "Update failed", description: err.message, variant: "destructive" });
    }
  };

  const remove = async (id) => {
    try {
      await base44.entities.ClubAlert.delete(id);
      load();
    } catch (err) {
      toast({ title: "Delete failed", description: err.message, variant: "destructive" });
    }
  };

  const inputCls =
    "w-full bg-white/5 border border-white/10 rounded-xl px-3.5 py-2.5 text-white placeholder:text-slate-500 focus:outline-none focus:border-lime-400/50 focus:ring-1 focus:ring-lime-400/30 transition";

  return (
    <div className="rounded-2xl border border-white/5 bg-white/[0.03] p-5">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Megaphone className="w-4 h-4 text-amber-400" />
          <h3 className="font-semibold text-white">Member alerts</h3>
        </div>
        <button onClick={() => setShow((s) => !s)} className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-amber-400 hover:bg-amber-300 text-slate-900 text-xs font-semibold transition">
          <Plus className="w-3.5 h-3.5" /> New alert
        </button>
      </div>

      {show && (
        <form onSubmit={submit} className="mb-4 space-y-3 rounded-xl border border-white/10 bg-white/[0.02] p-4">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-white">New alert</span>
            <button type="button" onClick={() => setShow(false)} className="text-slate-400 hover:text-white"><X className="w-4 h-4" /></button>
          </div>
          <input className={inputCls} placeholder="Headline, e.g. 20% off Friday nights" value={form.title} onChange={(e) => set("title", e.target.value)} />
          <textarea rows={2} className={inputCls} placeholder="Details for players (optional)" value={form.message} onChange={(e) => set("message", e.target.value)} />
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-slate-400 mb-1.5 block">Type</label>
              <select className={inputCls} value={form.type} onChange={(e) => set("type", e.target.value)}>
                <option value="discount">Discount / pricing</option>
                <option value="booking">Court booking</option>
                <option value="general">General</option>
              </select>
            </div>
            {form.type === "discount" && (
              <div>
                <label className="text-xs font-medium text-slate-400 mb-1.5 block">Discount (%)</label>
                <input type="number" min="0" max="100" className={inputCls} placeholder="e.g. 20" value={form.discount} onChange={(e) => set("discount", e.target.value)} />
              </div>
            )}
          </div>
          <div>
            <label className="text-xs font-medium text-slate-400 mb-1.5 block">Expires (optional)</label>
            <input type="date" className={inputCls} value={form.expires} onChange={(e) => set("expires", e.target.value)} />
          </div>
          <button type="submit" disabled={saving} className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-lime-400 hover:bg-lime-300 disabled:opacity-60 text-slate-900 font-semibold text-sm transition">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : "Post alert"}
          </button>
        </form>
      )}

      {loading ? (
        <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-slate-500" /></div>
      ) : alerts.length === 0 ? (
        <p className="text-slate-500 text-sm py-2">No alerts yet. Post one to notify your members.</p>
      ) : (
        <div className="space-y-2">
          {alerts.map((a) => {
            const Icon = typeMeta[a.type]?.icon || Megaphone;
            return (
              <div key={a.id} className={`flex items-start gap-3 rounded-xl border p-3 transition ${a.active ? "border-white/10 bg-white/[0.02]" : "border-white/5 bg-white/[0.01] opacity-50"}`}>
                <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${typeMeta[a.type]?.chip || "bg-white/5"}`}>
                  <Icon className="w-4 h-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium text-white truncate">{a.title}</span>
                    {a.discount != null && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-400/20 text-amber-200 font-bold">{a.discount}% OFF</span>}
                    {a.expires && <span className="text-[10px] text-slate-500">until {new Date(a.expires).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span>}
                  </div>
                  {a.message && <p className="text-xs text-slate-400 mt-0.5 line-clamp-2">{a.message}</p>}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button onClick={() => toggle(a)} title={a.active ? "Deactivate" : "Activate"} className="w-8 h-8 rounded-lg border border-white/10 hover:bg-white/5 text-slate-300 flex items-center justify-center transition">
                    <Power className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={() => remove(a.id)} title="Delete" className="w-8 h-8 rounded-lg border border-white/10 hover:bg-rose-500/15 hover:text-rose-300 text-slate-300 flex items-center justify-center transition">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}