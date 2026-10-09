import React, { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";

// Modal for a player to enter the final score of a match they just finished.
// The score then goes out for approval to every other player in the match.
export default function SubmitScoreDialog({ open, onClose, onSubmit, match }) {
  const [a, setA] = useState("");
  const [b, setB] = useState("");
  const [busy, setBusy] = useState(false);
  const inputCls =
    "w-16 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-center focus:outline-none focus:border-lime-400/50 text-lg font-bold";

  const submit = async () => {
    if (a === "" || b === "") return;
    setBusy(true);
    try {
      await onSubmit(a, b);
      setA("");
      setB("");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md bg-slate-900 border-white/10">
        <DialogHeader>
          <DialogTitle>Submit match score</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-slate-400 -mt-1">
          Enter the final score. Every player in this match must approve before it's recorded to the tournament.
        </p>
        <div className="flex items-center justify-center gap-4 py-2">
          <div className="text-center min-w-0">
            <div className="text-xs text-slate-400 mb-1 truncate max-w-[120px]">{match.team_a || "Team A"}</div>
            <input type="number" inputMode="numeric" min="0" className={inputCls} value={a} onChange={(e) => setA(e.target.value)} placeholder="0" />
          </div>
          <span className="text-slate-500 text-lg">:</span>
          <div className="text-center min-w-0">
            <div className="text-xs text-slate-400 mb-1 truncate max-w-[120px]">{match.team_b || "Team B"}</div>
            <input type="number" inputMode="numeric" min="0" className={inputCls} value={b} onChange={(e) => setB(e.target.value)} placeholder="0" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={busy} className="text-slate-300">
            Cancel
          </Button>
          <Button
            onClick={submit}
            disabled={busy || a === "" || b === "" || Number(a) === Number(b)}
            className="bg-lime-400 hover:bg-lime-300 text-slate-900"
          >
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : "Submit for approval"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}