import { base44 } from "@/api/base44Client";

// Resolve the registered app users that make up a match's two teams, from the
// tournament entries. Only users with a real user_id can approve in-app, so
// unregistered partners are excluded from the required approver set.
export function matchParticipants(match, entries) {
  const parts = [];
  const seen = new Set();
  for (const teamName of [match.team_a, match.team_b]) {
    if (!teamName) continue;
    const entry = (entries || []).find((e) => e.name === teamName);
    if (!entry) continue;
    const leadName = (entry.name || "").split(" & ")[0] || entry.name;
    const candidates = [
      { user_id: entry.user_id, name: leadName, team: teamName },
      entry.partner_user_id
        ? { user_id: entry.partner_user_id, name: entry.partner_name || entry.name, team: teamName }
        : null,
    ];
    for (const p of candidates) {
      if (p && p.user_id && !seen.has(p.user_id)) {
        seen.add(p.user_id);
        parts.push(p);
      }
    }
  }
  return parts;
}

// A player submits a final score for a match they're in. The submitter is
// auto-approved; any prior pending submission for the same match is superseded.
export async function submitScore({ match, tournament, entries, user, userName, scoreA, scoreB }) {
  const a = Number(scoreA);
  const b = Number(scoreB);
  if (Number.isNaN(a) || Number.isNaN(b)) throw new Error("Enter both scores");
  if (a === b) throw new Error("Scores can't be tied — pick a winner");
  const winner = a > b ? "A" : "B";
  const participants = matchParticipants(match, entries);
  if (!participants.some((p) => p.user_id === user.id)) {
    throw new Error("Only players in this match can submit a score");
  }
  try {
    const prior = await base44.entities.ScoreSubmission.filter({ match_id: match.id, status: "pending" });
    for (const s of prior) {
      await base44.entities.ScoreSubmission.update(s.id, { status: "superseded" });
    }
  } catch {
    /* best-effort */
  }
  const submission = await base44.entities.ScoreSubmission.create({
    match_id: match.id,
    tournament_id: tournament.id,
    tournament_name: tournament.name,
    division: match.division || "",
    team_a: match.team_a || "TBD",
    team_b: match.team_b || "TBD",
    score_a: a,
    score_b: b,
    winner,
    submitted_by_id: user.id,
    submitted_by_name: userName,
    status: "pending",
    approvals: [{ user_id: user.id, name: userName }],
    participants,
    rejection_note: "",
  });
  await maybeApply(submission);
  return submission;
}

export async function approveSubmission(submission, user, userName) {
  if (!submission.participants?.some((p) => p.user_id === user.id)) {
    throw new Error("Only participants can approve");
  }
  if (submission.approvals?.some((x) => x.user_id === user.id)) return submission;
  const approvals = [...(submission.approvals || []), { user_id: user.id, name: userName }];
  const updated = await base44.entities.ScoreSubmission.update(submission.id, { approvals });
  await maybeApply(updated);
  return updated;
}

export async function rejectSubmission(submission, user, userName, note) {
  return base44.entities.ScoreSubmission.update(submission.id, {
    status: "rejected",
    rejection_note: `Rejected by ${userName}${note ? ": " + note : ""}`,
  });
}

// Once every required participant has approved, write the score to the Match
// record (status completed) and mark the submission applied.
async function maybeApply(submission) {
  const required = submission.participants || [];
  if (!required.length) return;
  const approved = new Set((submission.approvals || []).map((a) => a.user_id));
  if (!required.every((p) => approved.has(p.user_id))) return;
  await base44.entities.Match.update(submission.match_id, {
    score_a: submission.score_a,
    score_b: submission.score_b,
    winner: submission.winner,
    status: "completed",
  });
  await base44.entities.ScoreSubmission.update(submission.id, { status: "applied" });
}