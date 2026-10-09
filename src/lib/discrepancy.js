import { base44 } from "@/api/base44Client";
import { loadMyConversations, ensureDirectConversation, sendChatMessage } from "@/lib/chat";

export async function fetchForPlay(playId) {
  const all = await base44.entities.ScoreDiscrepancy.list("-created_date", 500);
  return all.filter((d) => d.play_id === playId);
}

// A player reports a discrepancy on a completed play. The club manager (or play
// host for non-club plays) is notified via a direct chat message to review it.
export async function reportDiscrepancy({ play, user, userName, reason }) {
  await base44.entities.ScoreDiscrepancy.create({
    scope: "play",
    play_id: play.id,
    play_title: play.title,
    club_id: play.club_id || null,
    reported_by_id: user.id,
    reported_by_name: userName,
    reason,
    status: "open",
  });

  // Resolve the manager: club owner for club-linked plays, otherwise the host.
  let managerId = play.created_by_id;
  if (play.club_id) {
    try {
      const club = await base44.entities.Club.get(play.club_id);
      if (club?.created_by_id) managerId = club.created_by_id;
    } catch { /* keep host */ }
  }
  if (managerId && managerId !== user.id) {
    let managerName = "Club Manager";
    if (managerId === play.created_by_id) {
      const hostPlayer = (play.players || []).find((p) => p.user_id === managerId);
      if (hostPlayer?.name) managerName = hostPlayer.name;
    }
    try {
      const myConvs = await loadMyConversations(user.id);
      const conv = await ensureDirectConversation(myConvs, user, { user_id: managerId, name: managerName });
      await sendChatMessage(user, conv, `⚠️ ${userName} reported a score discrepancy on "${play.title}". Please review the match and confirm or adjust the final score.`);
    } catch { /* best-effort */ }
  }
}

// Manager confirms or adjusts the score: resolves all open reports for the play.
export async function resolveAllForPlay(playId, { resolverId, resolverName, note }) {
  const open = (await fetchForPlay(playId)).filter((d) => d.status === "open");
  await Promise.all(
    open.map((d) =>
      base44.entities.ScoreDiscrepancy.update(d.id, {
        status: "resolved",
        resolution_note: note,
        resolved_by_id: resolverId,
        resolved_by_name: resolverName,
      })
    )
  );
}

export async function fetchForTournament(tournamentId) {
  const all = await base44.entities.ScoreDiscrepancy.list("-created_date", 500);
  return all.filter((d) => d.tournament_id === tournamentId);
}

// A player reports a score discrepancy on a tournament match. The tournament
// organizer is notified via a direct chat message to review and adjust it.
export async function reportTournamentDiscrepancy({ tournament, match, user, userName, reason }) {
  await base44.entities.ScoreDiscrepancy.create({
    scope: "tournament",
    tournament_id: tournament.id,
    tournament_name: tournament.name,
    match_id: match.id,
    reported_by_id: user.id,
    reported_by_name: userName,
    reason,
    status: "open",
  });
  const organizerId = tournament.created_by_id;
  if (organizerId && organizerId !== user.id) {
    let orgName = "Organizer";
    const entry = (tournament.entries || []).find((e) => e.user_id === organizerId);
    if (entry?.name) orgName = entry.name;
    try {
      const myConvs = await loadMyConversations(user.id);
      const conv = await ensureDirectConversation(myConvs, user, { user_id: organizerId, name: orgName });
      const divInfo = match.division ? ` (${match.division})` : "";
      await sendChatMessage(user, conv, `⚠️ ${userName} reported a score discrepancy on a tournament match in "${tournament.name}"${divInfo}. Please review the match and confirm or adjust the final score.`);
    } catch { /* best-effort */ }
  }
}

export async function resolveAllForMatch(matchId, { resolverId, resolverName, note }) {
  const all = await base44.entities.ScoreDiscrepancy.list("-created_date", 500);
  const open = all.filter((d) => d.match_id === matchId && d.status === "open");
  await Promise.all(
    open.map((d) =>
      base44.entities.ScoreDiscrepancy.update(d.id, {
        status: "resolved",
        resolution_note: note,
        resolved_by_id: resolverId,
        resolved_by_name: resolverName,
      })
    )
  );
}