import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useToast } from "@/components/ui/use-toast";
import { Loader2, Building2, Save, Pencil, MapPin } from "lucide-react";
import { Image } from "@/components/ui/image";
import LogoUploader from "@/components/LogoUploader";

export default function ClubSetup({ club, onSaved }) {
  const { toast } = useToast();
  const [editing, setEditing] = useState(!club);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: club?.name || "",
    location: club?.location || "",
    description: club?.description || "",
    logo_url: club?.logo_url || "",
  });

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) {
      toast({ title: "Club name is required", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        location: form.location.trim(),
        description: form.description.trim(),
        logo_url: form.logo_url || null,
      };
      if (club?.id) await base44.entities.Club.update(club.id, payload);
      else await base44.entities.Club.create(payload);
      toast({ title: "Club saved ✓" });
      setEditing(false);
      onSaved?.();
    } catch (err) {
      toast({ title: "Could not save club", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const inputCls =
    "w-full bg-white/5 border border-white/10 rounded-xl px-3.5 py-2.5 text-white placeholder:text-slate-500 focus:outline-none focus:border-lime-400/50 focus:ring-1 focus:ring-lime-400/30 transition";

  if (!editing && club) {
    return (
      <div className="rounded-2xl border border-white/5 bg-white/[0.03] p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0">
            <div className="w-11 h-11 shrink-0 rounded-2xl overflow-hidden bg-gradient-to-br from-sky-400 to-indigo-500 text-slate-900 flex items-center justify-center">
              {club.logo_url ? <Image src={club.logo_url} alt="logo" fittingType="fill" className="w-full h-full object-cover" /> : <Building2 className="w-5 h-5" />}
            </div>
            <div className="min-w-0">
              <h2 className="font-display text-lg font-semibold text-white truncate">{club.name}</h2>
              <p className="text-[11px] text-slate-500 mt-0.5 font-mono truncate">ID: {club.id}</p>
              {club.location && (
                <div className="flex items-center gap-1.5 text-sm text-slate-400 mt-0.5">
                  <MapPin className="w-3.5 h-3.5" /> <span className="truncate">{club.location}</span>
                </div>
              )}
              {club.description && <p className="text-sm text-slate-400 mt-2">{club.description}</p>}
            </div>
          </div>
          <button
            onClick={() => setEditing(true)}
            className="shrink-0 inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-white/10 hover:bg-white/5 text-slate-300 text-sm transition"
          >
            <Pencil className="w-3.5 h-3.5" /> Edit
          </button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 space-y-3">
      <div className="flex items-center gap-2">
        <Building2 className="w-5 h-5 text-sky-400" />
        <h2 className="font-display text-lg font-semibold text-white">
          {club ? "Edit your club" : "Create your club"}
        </h2>
      </div>
      <div>
        <label className="text-xs font-medium text-slate-400 mb-1.5 block">Club logo</label>
        <LogoUploader logoUrl={form.logo_url} onChange={(v) => set("logo_url", v)} label="logo" />
      </div>
      <div>
        <label className="text-xs font-medium text-slate-400 mb-1.5 block">Club name</label>
        <input className={inputCls} placeholder="e.g. Lincoln Park Pickleball Club" value={form.name} onChange={(e) => set("name", e.target.value)} />
      </div>
      <div>
        <label className="text-xs font-medium text-slate-400 mb-1.5 block">Location</label>
        <input className={inputCls} placeholder="City / address" value={form.location} onChange={(e) => set("location", e.target.value)} />
      </div>
      <div>
        <label className="text-xs font-medium text-slate-400 mb-1.5 block">Description</label>
        <textarea rows={2} className={inputCls} placeholder="About the club" value={form.description} onChange={(e) => set("description", e.target.value)} />
      </div>
      <div className="flex gap-2">
        {club && (
          <button type="button" onClick={() => setEditing(false)} className="px-4 py-2.5 rounded-xl border border-white/10 hover:bg-white/5 text-slate-300 text-sm transition">
            Cancel
          </button>
        )}
        <button type="submit" disabled={saving} className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-lime-400 hover:bg-lime-300 disabled:opacity-60 text-slate-900 font-semibold text-sm transition">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Save className="w-4 h-4" /> Save club</>}
        </button>
      </div>
    </form>
  );
}