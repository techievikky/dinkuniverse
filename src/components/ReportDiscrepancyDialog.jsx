import React, { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";

export default function ReportDiscrepancyDialog({ open, onClose, onSubmit }) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!reason.trim()) return;
    setBusy(true);
    try {
      await onSubmit(reason.trim());
      setReason("");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md bg-slate-900 border-white/10">
        <DialogHeader>
          <DialogTitle>Report a score discrepancy</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-slate-400 -mt-1">
          Think the recorded score is wrong? Describe the issue and the organizer/manager will review and adjust it.
        </p>
        <textarea
          rows={4}
          className="w-full bg-white/5 border border-white/10 rounded-xl px-3.5 py-2.5 text-white placeholder:text-slate-500 focus:outline-none focus:border-amber-400/50 focus:ring-1 focus:ring-amber-400/30"
          placeholder="What's incorrect about the score?"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={busy} className="text-slate-300">
            Cancel
          </Button>
          <Button onClick={submit} disabled={busy || !reason.trim()} className="bg-amber-400 hover:bg-amber-300 text-slate-900">
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : "Send report"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}