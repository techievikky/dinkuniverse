import React, { useState, useEffect, useCallback } from "react";
import { base44 } from "@/api/base44Client";
import { useToast } from "@/components/ui/use-toast";
import { ScanLine, UserCheck, Loader2, Search } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import CheckInScanner from "./CheckInScanner";

// Club-owner check-in station: scan a player's QR to record a CheckIn, and
// list today's check-ins at this club so the owner can see who's arrived.
export default function CheckInsPanel({ club }) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [checkins, setCheckins] = useState([]);
  const [search, setSearch] = useState({ from: "", to: "", from_time: "", to_time: "", name: "" });
  const [searchResults, setSearchResults] = useState(null);
  const [searching, setSearching] = useState(false);

  // Local date, not UTC: avoids logging a check-in to the wrong day in
  // timezones behind UTC.
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

  const loadToday = useCallback(async () => {
    if (!club?.id) return;
    try {
      const rows = await base44.entities.CheckIn.filter(
        { club_id: club.id, date: today },
        "-created_date",
        100
      );
      setCheckins(rows);
    } catch {
      /* best-effort */
    }
  }, [club?.id, today]);

  useEffect(() => {
    loadToday();
    // Live-update the list as check-ins are created (e.g. from another device).
    const unsub = base44.entities.CheckIn.subscribe((event) => {
      if (event.type === "create" && event.data?.club_id === club?.id) {
        setCheckins((prev) => [event.data, ...prev.filter((c) => c.id !== event.data.id)]);
      }
    });
    return () => unsub && unsub();
  }, [club?.id]);

  const runSearch = async () => {
    if (!club?.id) return;
    setSearching(true);
    try {
      const rows = await base44.entities.CheckIn.filter({
        club_id: club.id,
        from: search.from || undefined,
        to: search.to || undefined,
        from_time: search.from_time || undefined,
        to_time: search.to_time || undefined,
        search: search.name.trim() || undefined,
      });
      setSearchResults(rows);
    } catch (e) {
      toast({ title: "Search failed", description: e.message, variant: "destructive" });
    } finally {
      setSearching(false);
    }
  };

  const clearSearch = () => {
    setSearch({ from: "", to: "", from_time: "", to_time: "", name: "" });
    setSearchResults(null);
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
      const checkin = await base44.entities.CheckIn.create({
        player_user_id: uid,
        player_name: name || "Player",
        club_id: club.id,
        club_name: club.name,
        date: today,
        checked_in_at: new Date().toISOString(),
      });
      setCheckins((prev) => [checkin, ...prev]);
      toast({ title: `Checked in ${name || "player"} ✓ (visit #${checkin.visit_count})` });
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
          <h3 className="font-semibold text-white">Player check-ins</h3>
        </div>
        <button
          onClick={() => setOpen(true)}
          disabled={!club}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-lime-400 hover:bg-lime-300 disabled:opacity-60 text-slate-900 font-semibold text-sm transition"
        >
          <ScanLine className="w-4 h-4" /> Scan to check in
        </button>
      </div>

      <p className="text-sm text-slate-400 mt-2 mb-4">
        Scan a player's QR code to record their arrival. {checkins.length} checked in today.
      </p>

      {checkins.length > 0 && (
        <div className="space-y-2">
          {checkins.map((c) => (
            <CheckInRow key={c.id} checkin={c} />
          ))}
        </div>
      )}

      <div className="mt-6 pt-5 border-t border-white/5">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-3">Search check-in history</h4>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mb-2.5">
          <div>
            <label className="text-[11px] text-slate-500 mb-1 block">From date</label>
            <input type="date" className={searchInputCls} value={search.from} onChange={(e) => setSearch((s) => ({ ...s, from: e.target.value }))} />
          </div>
          <div>
            <label className="text-[11px] text-slate-500 mb-1 block">To date</label>
            <input type="date" className={searchInputCls} value={search.to} onChange={(e) => setSearch((s) => ({ ...s, to: e.target.value }))} />
          </div>
          <div>
            <label className="text-[11px] text-slate-500 mb-1 block">From time</label>
            <input type="time" className={searchInputCls} value={search.from_time} onChange={(e) => setSearch((s) => ({ ...s, from_time: e.target.value }))} />
          </div>
          <div>
            <label className="text-[11px] text-slate-500 mb-1 block">To time</label>
            <input type="time" className={searchInputCls} value={search.to_time} onChange={(e) => setSearch((s) => ({ ...s, to_time: e.target.value }))} />
          </div>
        </div>
        <div className="flex gap-2.5 mb-3">
          <input
            className={`${searchInputCls} flex-1`}
            placeholder="Search by player name"
            value={search.name}
            onChange={(e) => setSearch((s) => ({ ...s, name: e.target.value }))}
          />
          <button
            onClick={runSearch}
            disabled={searching}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-white/10 hover:bg-white/20 disabled:opacity-60 text-white text-xs font-semibold transition"
          >
            {searching ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />} Search
          </button>
          {searchResults != null && (
            <button onClick={clearSearch} className="px-3.5 py-2 rounded-lg border border-white/10 hover:bg-white/5 text-slate-300 text-xs font-medium transition">
              Clear
            </button>
          )}
        </div>

        {searchResults != null && (
          searchResults.length === 0 ? (
            <p className="text-slate-500 text-sm py-2">No check-ins match those criteria.</p>
          ) : (
            <div className="space-y-2">
              <p className="text-xs text-slate-500">{searchResults.length} record{searchResults.length !== 1 ? "s" : ""} found.</p>
              {searchResults.map((c) => (
                <CheckInRow key={c.id} checkin={c} showDate />
              ))}
            </div>
          )
        )}
      </div>

      <Dialog open={open} onOpenChange={(o) => !busy && setOpen(o)}>
        <DialogContent className="bg-slate-900 border-white/10 text-white max-w-md">
          <DialogHeader>
            <DialogTitle>Scan player QR</DialogTitle>
            <DialogDescription className="text-slate-400">
              Point your camera at a player's check-in QR code.
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

const searchInputCls =
  "w-full bg-white/5 border border-white/10 rounded-lg px-2.5 py-2 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-lime-400/50 focus:ring-1 focus:ring-lime-400/30 transition";

function CheckInRow({ checkin, showDate }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl bg-white/[0.03] border border-white/5 px-3.5 py-2.5">
      <div className="min-w-0">
        <div className="text-sm font-medium text-white truncate">{checkin.player_name}</div>
        <div className="text-[11px] text-slate-500">
          {showDate && checkin.date ? `${checkin.date} · ` : ""}
          {checkin.checked_in_at
            ? new Date(checkin.checked_in_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
            : checkin.date}
          {checkin.visit_count ? ` · Visit #${checkin.visit_count}` : ""}
        </div>
      </div>
      <span className="text-[10px] px-2 py-0.5 rounded-full bg-lime-400/15 text-lime-300 font-medium shrink-0">
        Checked in
      </span>
    </div>
  );
}