import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useToast } from "@/components/ui/use-toast";
import { ScanLine, UserCheck, Loader2, CheckCircle2, Circle } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import ArrivedAvatar from "@/components/ArrivedAvatar";
import CheckInScanner from "@/components/clubhub/CheckInScanner";

// Organizer on-site check-in for a tournament. Scans a player's QR (the same
// one used at clubs) to mark that registered entrant arrived, and shows a
// roster with manual toggles. Arrived players get a green badge on their
// bracket / roster avatars elsewhere in the manager.
export default function TournamentCheckInPanel({ tournament, onUpdated, playersMap = {} }) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const entries = tournament?.entries || [];
  const arrivedCount = entries.filter((e) => e.arrived || e.partner_arrived).length;
  const total = entries.length;

  const persist = async (nextEntries) => {
    await base44.entities.Tournament.update(tournament.id, { entries: nextEntries });
    onUpdated?.();
  };

  const toggle = async (index, field) => {
    const entry = entries[index];
    if (!entry) return;
    const next = !entry[field];
    const atField = field === "arrived" ? "arrived_at" : "partner_arrived_at";
    const nextEntries = entries.map((e, i) =>
      i === index ? { ...e, [field]: next, [atField]: next ? new Date().toISOString() : null } : e
    );
    try {
      await persist(nextEntries);
    } catch (e) {
      toast({ title: "Could not update check-in", description: e.message, variant: "destructive" });
    }
  };

  const handleScan = async (raw) => {
    if (busy) return;
    let data;
    try {
      data = JSON.parse(raw);
    } catch {
      toast({ title: "Not a valid player QR", variant: "destructive" });
      return;
    }
    const uid = data.u;
    const name = data.n;
    if (!uid) {
      toast({ title: "Not a valid player QR", variant: "destructive" });
      return;
    }
    setBusy(true);
    try {
      const idx = entries.findIndex(
        (e) => e.user_id === uid || (e.partner_user_id && e.partner_user_id === uid)
      );
      if (idx === -1) {
        toast({
          title: "Player not registered",
          description: `${name || "That player"} is not entered in this tournament.`,
          variant: "destructive",
        });
        return;
      }
      const entry = entries[idx];
      const field = entry.partner_user_id === uid ? "partner_arrived" : "arrived";
      const atField = field === "arrived" ? "arrived_at" : "partner_arrived_at";
      if (entry[field]) {
        toast({ title: `${name || "Player"} already checked in` });
        setOpen(false);
        return;
      }
      const nextEntries = entries.map((e, i) =>
        i === idx ? { ...e, [field]: true, [atField]: new Date().toISOString() } : e
      );
      await persist(nextEntries);
      toast({ title: `Checked in ${name || "player"} ✓` });
      setOpen(false);
    } catch (e) {
      toast({ title: "Check-in failed", description: e.message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-2xl border border-white/5 bg-white/[0.03] p-5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <UserCheck className="w-4 h-4 text-lime-400" />
          <h3 className="font-semibold text-white">Player check-in</h3>
          <span className="text-xs text-slate-400">{arrivedCount}/{total} arrived</span>
        </div>
        <button
          onClick={() => setOpen(true)}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-lime-400 hover:bg-lime-300 text-slate-900 font-semibold text-sm transition"
        >
          <ScanLine className="w-4 h-4" /> Scan to check in
        </button>
      </div>

      <p className="text-sm text-slate-400 mt-2">
        Scan a player's QR to mark them arrived. Arrived players show a green badge on brackets and rosters.
      </p>

      {total === 0 ? (
        <p className="text-sm text-slate-500 mt-4">No registered players yet.</p>
      ) : (
        <ul className="mt-4 space-y-2">
          {entries.map((e, idx) => {
            const p1 = e.user_id ? playersMap[e.user_id] : null;
            const doubles = e.category !== "singles";
            const hasPartner = doubles && (e.partner_user_id || e.partner_name);
            return (
              <li
                key={idx}
                className="flex items-center justify-between gap-3 rounded-xl bg-white/[0.03] border border-white/5 px-3 py-2.5"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <ArrivedAvatar arrived={!!e.arrived} name={p1?.name || e.name} photo_url={p1?.photo_url} size="sm" />
                  <div className="min-w-0">
                    <div className="text-sm text-slate-200 truncate">{e.name}</div>
                    {hasPartner && (
                      <div className="text-[11px] text-slate-500 truncate">
                        Partner: {e.partner_name || "—"}
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <ToggleBtn active={!!e.arrived} onClick={() => toggle(idx, "arrived")} label={e.arrived ? "Arrived" : "Mark"} />
                  {hasPartner && e.partner_user_id && (
                    <ToggleBtn
                      active={!!e.partner_arrived}
                      onClick={() => toggle(idx, "partner_arrived")}
                      label={e.partner_arrived ? "Partner in" : "Partner"}
                    />
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <Dialog open={open} onOpenChange={(o) => !busy && setOpen(o)}>
        <DialogContent className="bg-slate-900 border-white/10 text-white max-w-md">
          <DialogHeader>
            <DialogTitle>Scan player QR</DialogTitle>
            <DialogDescription className="text-slate-400">
              Point your camera at a registered player's check-in QR code.
            </DialogDescription>
          </DialogHeader>
          {busy ? (
            <div className="flex items-center justify-center gap-2 py-10 text-sm text-slate-300">
              <Loader2 className="w-4 h-4 animate-spin" /> Recording check-in…
            </div>
          ) : (
            <CheckInScanner
              onScan={handleScan}
              onError={(e) =>
                toast({ title: "Camera error", description: e.message, variant: "destructive" })
              }
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ToggleBtn({ active, onClick, label }) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition border ${
        active
          ? "bg-emerald-500 text-white border-emerald-500"
          : "bg-white/5 text-slate-300 border-white/10 hover:bg-white/10"
      }`}
    >
      {active ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Circle className="w-3.5 h-3.5" />}
      {label}
    </button>
  );
}