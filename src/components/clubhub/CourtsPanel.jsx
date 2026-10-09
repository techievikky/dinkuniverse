import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useToast } from "@/components/ui/use-toast";
import { Loader2, Plus, Trash2, LayoutGrid, Lock, Ban, Unlock } from "lucide-react";

// Court inventory for a club. A court is unavailable to book either when an
// event assigns it (auto "blocked", event-driven) or when the club admin
// manually marks it unavailable ("disabled", independent of any event). The
// owner can still add/remove courts here, but a booked court can't be
// deleted until it's removed from its event (prevents orphaned assignments).
export default function CourtsPanel({ club, bookedNumbers = [], onSaved }) {
  const { toast } = useToast();
  const [number, setNumber] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const courts = club?.courts || [];
  const bookedSet = new Set(bookedNumbers);

  const persist = async (next) => {
    setBusy(true);
    try {
      await base44.entities.Club.update(club.id, { courts: next });
      onSaved?.();
    } catch (e) {
      toast({ title: "Could not save courts", description: e.message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const add = (e) => {
    e.preventDefault();
    const n = number.trim();
    if (!n) return;
    if (courts.some((c) => c.number === n)) {
      toast({ title: `Court ${n} already exists`, variant: "destructive" });
      return;
    }
    persist([...courts, { number: n, name: name.trim(), blocked: false, disabled: false }]);
    setNumber("");
    setName("");
  };

  const toggleDisabled = (i) => {
    persist(courts.map((c, idx) => (idx === i ? { ...c, disabled: !c.disabled } : c)));
  };

  const remove = (i) => {
    const c = courts[i];
    if (c && bookedSet.has(c.number)) {
      toast({
        title: `Court ${c.number} is booked by an event`,
        description: "Remove it from the event schedule first to free it.",
        variant: "destructive",
      });
      return;
    }
    persist(courts.filter((_, idx) => idx !== i));
  };

  const inputCls =
    "w-full bg-white/5 border border-white/10 rounded-xl px-3.5 py-2.5 text-white placeholder:text-slate-500 focus:outline-none focus:border-lime-400/50 text-sm";
  const available = courts.filter((c) => !bookedSet.has(c.number) && !c.disabled).length;

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-display font-semibold text-white flex items-center gap-2">
          <LayoutGrid className="w-5 h-5" /> Courts
        </h3>
        <span className="text-xs text-slate-400">
          {available} of {courts.length} available
        </span>
      </div>

      <form onSubmit={add} className="flex gap-2 mb-4">
        <input
          className={inputCls + " w-28"}
          placeholder="Court #"
          value={number}
          onChange={(e) => setNumber(e.target.value)}
        />
        <input
          className={inputCls}
          placeholder="Name (optional)"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <button
          type="submit"
          disabled={busy}
          className="shrink-0 w-11 h-11 rounded-xl bg-lime-400 hover:bg-lime-300 text-slate-900 flex items-center justify-center disabled:opacity-60"
        >
          {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : <Plus className="w-5 h-5" />}
        </button>
      </form>

      {courts.length === 0 ? (
        <p className="text-slate-400 text-sm text-center py-4">No courts yet. Add your first court above.</p>
      ) : (
        <div className="space-y-2">
          {courts.map((c, i) => {
            const booked = bookedSet.has(c.number);
            const unavailable = booked || c.disabled;
            return (
              <div
                key={i}
                className={`flex items-center gap-2 rounded-xl border px-3 py-2.5 ${
                  unavailable ? "border-rose-500/20 bg-rose-500/[0.04]" : "border-white/10 bg-white/[0.02]"
                }`}
              >
                <div className="min-w-0 flex-1">
                  <div className={`text-sm text-white truncate ${unavailable ? "line-through" : ""}`}>
                    Court {c.number}
                    {c.name ? ` · ${c.name}` : ""}
                  </div>
                  <div className={`text-[11px] flex items-center gap-1 ${unavailable ? "text-rose-300/80" : "text-emerald-300/80"}`}>
                    {booked ? (
                      <>
                        <Lock className="w-3 h-3" /> Booked by an event
                      </>
                    ) : c.disabled ? (
                      <>
                        <Ban className="w-3 h-3" /> Marked unavailable
                      </>
                    ) : (
                      "Available"
                    )}
                  </div>
                </div>
                <button
                  onClick={() => toggleDisabled(i)}
                  disabled={busy || booked}
                  title={booked ? "Remove from its event to change availability" : c.disabled ? "Mark available" : "Mark unavailable"}
                  className="shrink-0 w-9 h-9 rounded-lg hover:bg-white/10 text-slate-400 hover:text-white flex items-center justify-center disabled:opacity-40"
                >
                  {c.disabled ? <Unlock className="w-3.5 h-3.5" /> : <Ban className="w-3.5 h-3.5" />}
                </button>
                <button
                  onClick={() => remove(i)}
                  disabled={busy}
                  className="shrink-0 w-9 h-9 rounded-lg hover:bg-rose-500/15 hover:text-rose-300 text-slate-400 flex items-center justify-center"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            );
          })}
        </div>
      )}
      <p className="text-[11px] text-slate-500 mt-3">
        Courts are blocked automatically when assigned to an event. Use the ban icon to manually mark a court unavailable to players regardless of events.
      </p>
    </div>
  );
}