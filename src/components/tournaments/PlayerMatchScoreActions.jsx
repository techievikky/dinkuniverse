import React, { useState } from "react";
import { useToast } from "@/components/ui/use-toast";
import { Loader2, Check, X, Pencil } from "lucide-react";
import SubmitScoreDialog from "@/components/tournaments/SubmitScoreDialog";
import {
  submitScore,
  approveSubmission,
  rejectSubmission,
  matchParticipants,
} from "@/lib/scoreSubmission";

// Shown under a player's own match in the live play board: lets them submit a
// final score (when the match is on deck) or approve/reject a score another
// player has already submitted. Returns null for non-participants.
export default function PlayerMatchScoreActions({ match, tournament, submission, user, userName, onRefresh }) {
  const { toast } = useToast();
  const [showSubmit, setShowSubmit] = useState(false);
  const [busy, setBusy] = useState(false);

  const participants = matchParticipants(match, tournament.entries || []);
  const amParticipant = participants.some((p) => p.user_id === user?.id);
  if (match.status === "completed" || !amParticipant) return null;
  const canSubmit = match.status === "on_deck";

  const onApprove = async () => {
    setBusy(true);
    try {
      await approveSubmission(submission, user, userName);
      toast({ title: "Score approved ✓" });
      onRefresh();
    } catch (e) {
      toast({ title: "Could not approve", description: e.message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const onReject = async () => {
    setBusy(true);
    try {
      await rejectSubmission(submission, user, userName, "Disputed by player");
      toast({ title: "Score rejected", description: "A new score can be submitted." });
      onRefresh();
    } catch (e) {
      toast({ title: "Could not reject", description: e.message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const onSubmit = async (a, b) => {
    await submitScore({ match, tournament, entries: tournament.entries || [], user, userName, scoreA: a, scoreB: b });
    setShowSubmit(false);
    toast({ title: "Score submitted ✓", description: "Waiting for all players to approve." });
    onRefresh();
  };

  return (
    <div className="mt-2.5">
      {submission ? (
        <div className="rounded-lg bg-white/5 border border-white/10 px-3 py-2">
          <div className="flex items-center justify-between gap-2">
            <div className="text-xs text-slate-300">
              Proposed:{" "}
              <span className="text-white font-medium">
                {submission.team_a} {submission.score_a} : {submission.score_b} {submission.team_b}
              </span>
            </div>
            <div className="text-[10px] text-slate-500">
              {(submission.approvals || []).length}/{(submission.participants || []).length} approved
            </div>
          </div>
          {submission.approvals?.some((x) => x.user_id === user?.id) ? (
            <div className="mt-1.5 text-[11px] text-slate-400">You approved — awaiting the other players.</div>
          ) : (
            <div className="mt-2 flex items-center gap-2">
              <button
                onClick={onApprove}
                disabled={busy}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-400/15 hover:bg-emerald-400/25 text-emerald-200 text-xs font-medium disabled:opacity-50"
              >
                {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />} Approve
              </button>
              <button
                onClick={onReject}
                disabled={busy}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-rose-400/15 hover:bg-rose-400/25 text-rose-200 text-xs font-medium disabled:opacity-50"
              >
                {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <X className="w-3.5 h-3.5" />} Reject
              </button>
            </div>
          )}
        </div>
      ) : canSubmit ? (
        <button
          onClick={() => setShowSubmit(true)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-lime-400/15 hover:bg-lime-400/25 text-lime-200 text-xs font-medium"
        >
          <Pencil className="w-3.5 h-3.5" /> Submit score
        </button>
      ) : null}
      <SubmitScoreDialog open={showSubmit} onClose={() => setShowSubmit(false)} onSubmit={onSubmit} match={match} />
    </div>
  );
}