import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useToast } from "@/components/ui/use-toast";
import {
  MapPin, Clock, Calendar, Users, Loader2, Trash2, Check, UserMinus, UserPlus, Trophy, Bell, AlertTriangle, Edit3,
} from "lucide-react";
import PlayInviteDialog from "@/components/PlayInviteDialog";
import {
  loadMyConversations, ensureDirectConversation, sendChatMessage, playInviteText, playNudgeText,
} from "@/lib/chat";
import BackBar from "@/components/BackBar";
import ConfirmDialog from "@/components/ConfirmDialog";
import UserAvatar from "@/components/UserAvatar";
import { addToWaitlist, isOnWaitlist, promoteNext } from "@/lib/waitlist";
import { reportDiscrepancy, fetchForPlay, resolveAllForPlay } from "@/lib/discrepancy";
import ReportDiscrepancyDialog from "@/components/ReportDiscrepancyDialog";
import { formatDateInTimeZone, getUserTimeZone } from "@/lib/timezone";

export default function PlayDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user } = useAuth();
  const [play, setPlay] = useState(null);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);
  const [scoreA, setScoreA] = useState(0);
  const [scoreB, setScoreB] = useState(0);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [showInvite, setShowInvite] = useState(false);
  const [busy, setBusy] = useState(false);
  const [profiles, setProfiles] = useState({});
  const [onWaitlist, setOnWaitlist] = useState(false);
  const [discrepancies, setDiscrepancies] = useState([]);
  const [isClubManager, setIsClubManager] = useState(false);
  const [showReport, setShowReport] = useState(false);
  const [adjusting, setAdjusting] = useState(false);
  const [adjScoreA, setAdjScoreA] = useState(0);
  const [adjScoreB, setAdjScoreB] = useState(0);
  const [invites, setInvites] = useState([]);

  const enrich = async (players) => {
    const uids = (players || []).map((pl) => pl.user_id).filter(Boolean);
    if (!uids.length) { setProfiles({}); return; }
    try {
      const recs = await base44.entities.Player.filter({ user_id: { $in: uids } }, "-created_date", 200);
      const map = {};
      recs.forEach((r) => { if (r.user_id) map[r.user_id] = { dupr_score: r.dupr_score, photo_url: r.photo_url, name: r.name }; });
      setProfiles(map);
    } catch {
      setProfiles({});
    }
  };

  const load = async () => {
    try {
      const p = await base44.entities.Play.get(id);
      setPlay(p);
      setScoreA(p.score_team_a || 0);
      setScoreB(p.score_team_b || 0);
      enrich(p.players);
      base44.entities.PlayInvite.list(p.id).then(setInvites).catch(() => setInvites([]));
      if (user?.id) setOnWaitlist(await isOnWaitlist(p.id, null, user.id));
      setDiscrepancies((await fetchForPlay(p.id)).filter((d) => d.status === "open"));
      if (p.club_id) {
        try {
          const club = await base44.entities.Club.get(p.club_id);
          setIsClubManager(club?.created_by_id === user?.id);
        } catch { setIsClubManager(false); }
      } else {
        setIsClubManager(false);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [id]);

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-slate-500" />
      </div>
    );
  }

  if (!play) {
    return (
      <div className="text-center py-20">
        <p className="text-slate-400">Play not found.</p>
        <Link to="/" className="text-lime-400 text-sm mt-2 inline-block">← Back home</Link>
      </div>
    );
  }

  const isJoined = play.players?.some((pl) => pl.user_id === user?.id);
  const isHost = play.created_by_id === user?.id;
  const spotsLeft = (play.max_players || 4) - (play.players?.length || 0);
  const completed = play.status === "completed";
  const canManage = isHost || isClubManager || user?.role === "admin";
  const pendingInvites = invites.filter((inv) => inv.status === "invited");
  const declinedInvites = invites.filter((inv) => inv.status === "declined");
  const myInvite = invites.find((inv) => inv.invitee_id === user?.id && inv.status === "invited");

  const join = async () => {
    if (spotsLeft <= 0) return;
    const snapshot = play;
    setActing(true);
    try {
      const updated = await base44.entities.Play.join(play.id);
      setPlay(updated);
      enrich(updated.players);
      toast({ title: "You're in! 🎾" });
    } catch (err) {
      toast({ title: "Could not join", description: err.message, variant: "destructive" });
    } finally {
      setActing(false);
    }
  };

  const joinWaitlist = async () => {
    setActing(true);
    try {
      const res = await addToWaitlist({ event_type: "play", event_id: play.id, event_title: play.title, user, userName: user.full_name || user.email });
      if (res.already) {
        toast({ title: "You're already on the waitlist" });
      } else {
        setOnWaitlist(true);
        toast({ title: "Added to the waitlist ✓", description: "We'll message you if a spot opens up." });
      }
    } catch (err) {
      toast({ title: "Could not join waitlist", description: err.message, variant: "destructive" });
    } finally {
      setActing(false);
    }
  };

  const leave = async () => {
    setActing(true);
    try {
      const updated = await base44.entities.Play.leave(play.id);
      setPlay(updated);
      enrich(updated.players);
      await promoteNext({ event_type: "play", event_id: play.id, event_title: play.title, sender: user });
      toast({ title: "You left this play." });
    } catch (err) {
      toast({ title: "Could not leave", description: err.message, variant: "destructive" });
    } finally {
      setActing(false);
    }
  };

  const removePlayer = async (uid) => {
    setActing(true);
    try {
      const players = (play.players || []).filter((pl) => pl.user_id !== uid);
      const status = players.length >= (play.max_players || 4) ? "full" : "open";
      const updated = await base44.entities.Play.update(play.id, { players, status });
      setPlay(updated);
      enrich(updated.players);
      await promoteNext({ event_type: "play", event_id: play.id, event_title: play.title, sender: user });
    } finally {
      setActing(false);
    }
  };

  const completePlay = async () => {
    setActing(true);
    try {
      const winner = scoreA > scoreB ? "Team A" : scoreB > scoreA ? "Team B" : "Tie";
      const updated = await base44.entities.Play.update(play.id, {
        status: "completed",
        score_team_a: Number(scoreA),
        score_team_b: Number(scoreB),
        winner,
      });
      setPlay(updated);
      toast({ title: "Play completed ✓" });
    } finally {
      setActing(false);
    }
  };

  const submitReport = async (reason) => {
    try {
      await reportDiscrepancy({ play, user, userName: user.full_name || user.email, reason });
      setDiscrepancies((await fetchForPlay(play.id)).filter((d) => d.status === "open"));
      setShowReport(false);
      toast({ title: "Report sent ✓", description: "The manager has been notified to review the score." });
    } catch (err) {
      toast({ title: "Could not send report", description: err.message, variant: "destructive" });
    }
  };

  const startAdjust = () => {
    setAdjScoreA(play.score_team_a ?? 0);
    setAdjScoreB(play.score_team_b ?? 0);
    setAdjusting(true);
  };

  const saveAdjustedScore = async () => {
    setActing(true);
    try {
      const a = Number(adjScoreA);
      const b = Number(adjScoreB);
      const winner = a > b ? "Team A" : b > a ? "Team B" : "Tie";
      const updated = await base44.entities.Play.update(play.id, { score_team_a: a, score_team_b: b, winner });
      setPlay(updated);
      await resolveAllForPlay(play.id, { resolverId: user.id, resolverName: user.full_name || user.email, note: "Score adjusted after review" });
      setDiscrepancies((await fetchForPlay(play.id)).filter((d) => d.status === "open"));
      setAdjusting(false);
      toast({ title: "Score updated ✓", description: "Discrepancy reports resolved." });
    } catch (err) {
      toast({ title: "Could not save", description: err.message, variant: "destructive" });
    } finally {
      setActing(false);
    }
  };

  const confirmScore = async () => {
    setActing(true);
    try {
      await resolveAllForPlay(play.id, { resolverId: user.id, resolverName: user.full_name || user.email, note: "Score confirmed after review" });
      setDiscrepancies((await fetchForPlay(play.id)).filter((d) => d.status === "open"));
      toast({ title: "Score confirmed ✓", description: "Discrepancy reports resolved." });
    } catch (err) {
      toast({ title: "Could not confirm", description: err.message, variant: "destructive" });
    } finally {
      setActing(false);
    }
  };

  const deletePlay = async () => {
    setActing(true);
    try {
      await base44.entities.Play.delete(play.id);
      navigate("/");
    } finally {
      setActing(false);
      setConfirmDelete(false);
    }
  };

  const invitePlayers = async (selected) => {
    setBusy(true);
    let count = 0;
    try {
      const hostName = (user?.full_name || user?.name || user?.email || "Someone").split(" ")[0];
      const text = playInviteText(hostName, play);
      const myConvs = await loadMyConversations(user.id);
      for (const p of selected) {
        try {
          const conv = await ensureDirectConversation(myConvs, user, p);
          await sendChatMessage(user, conv, text);
          await base44.entities.PlayInvite.create(play.id, {
            invitee_id: p.user_id, invitee_name: p.name, invitee_photo: p.photo_url || "",
          });
          count++;
        } catch {}
      }
      toast({ title: count ? `Invited ${count} player${count !== 1 ? "s" : ""} 🎾` : "Could not send invites" });
      setShowInvite(false);
      setInvites(await base44.entities.PlayInvite.list(play.id));
    } finally {
      setBusy(false);
    }
  };

  const nudgePlayers = async () => {
    const others = (play.players || []).filter((pl) => pl.user_id !== user.id);
    if (!others.length) return;
    setBusy(true);
    let count = 0;
    try {
      const hostName = (user?.full_name || user?.name || user?.email || "Your host").split(" ")[0];
      const text = playNudgeText(hostName, play);
      const myConvs = await loadMyConversations(user.id);
      for (const pl of others) {
        try {
          const conv = await ensureDirectConversation(myConvs, user, {
            user_id: pl.user_id,
            name: pl.name,
            photo_url: pl.photo_url,
          });
          await sendChatMessage(user, conv, text);
          count++;
        } catch {}
      }
      toast({ title: count ? `Nudged ${count} player${count !== 1 ? "s" : ""} 🔔` : "Could not nudge" });
    } finally {
      setBusy(false);
    }
  };

  const skillStyles = {
    Beginner: "bg-sky-500/15 text-sky-300",
    Intermediate: "bg-amber-500/15 text-amber-300",
    Advanced: "bg-rose-500/15 text-rose-300",
    Open: "bg-lime-500/15 text-lime-300",
  };

  const declineInvite = async () => {
    if (!myInvite) return;
    setActing(true);
    try {
      await base44.entities.PlayInvite.decline(myInvite.id);
      setInvites(await base44.entities.PlayInvite.list(play.id));
      toast({ title: "Invite declined" });
    } catch (err) {
      toast({ title: "Could not decline", description: err.message, variant: "destructive" });
    } finally {
      setActing(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto">
      <BackBar />

      <div className="rounded-3xl border border-white/5 bg-white/[0.03] p-6 sm:p-8">
        <div className="flex items-start justify-between gap-3">
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-white tracking-tight">{play.title}</h1>
          <span className={`shrink-0 text-xs px-3 py-1 rounded-full font-medium ${skillStyles[play.skill_level] || skillStyles.Open}`}>
            {play.skill_level}
          </span>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-3 text-sm">
          <Info icon={Calendar} text={formatDateInTimeZone(play.date, getUserTimeZone(user), { weekday: "long", month: "long", day: "numeric" })} />
          <Info icon={Clock} text={formatPlayTime(play)} />
          <Info icon={MapPin} text={play.location} />
          <Info icon={Users} text={`${play.players?.length || 0}/${play.max_players || 4} players`} />
        </div>

        {play.address && (
          <p className="mt-3 text-sm text-slate-400">{play.address}</p>
        )}
        {play.notes && (
          <p className="mt-4 text-sm text-slate-300 bg-white/[0.03] rounded-xl p-3 border border-white/5">{play.notes}</p>
        )}

        {/* Players */}
        <div className="mt-6">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-3">Players</h3>
          {play.players?.length ? (
            <ul className="space-y-2">
              {play.players.map((pl, i) => (
                <li key={pl.user_id + i} className="flex items-center justify-between bg-white/[0.03] rounded-xl px-3 py-2.5">
                  <span className="flex items-center gap-2.5 text-sm text-white min-w-0">
                    <UserAvatar name={pl.name} photo_url={pl.photo_url || profiles[pl.user_id]?.photo_url} size="sm" />
                    <span className="truncate">{pl.name}</span>
                    {pl.user_id === play.created_by_id && <span className="text-[10px] text-lime-400 shrink-0">Host</span>}
                    <span className={`shrink-0 text-[10px] px-1.5 py-0.5 rounded-full font-medium ${profiles[pl.user_id]?.dupr_score != null ? "bg-lime-400/15 text-lime-300" : "bg-white/5 text-slate-500"}`}>
                      {profiles[pl.user_id]?.dupr_score != null ? `DUPR ${profiles[pl.user_id].dupr_score}` : "No DUPR"}
                    </span>
                  </span>
                  <span className="flex items-center gap-2 shrink-0">
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium bg-lime-400/15 text-lime-300">Joined</span>
                    {isHost && pl.user_id !== user.id && (
                      <button onClick={() => removePlayer(pl.user_id)} className="text-slate-500 hover:text-rose-400">
                        <UserMinus className="w-4 h-4" />
                      </button>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-slate-500">No players yet.</p>
          )}
          {(pendingInvites.length > 0 || declinedInvites.length > 0) && (
            <ul className="space-y-2 mt-2">
              {pendingInvites.map((inv) => (
                <li key={inv.id} className="flex items-center justify-between bg-white/[0.02] rounded-xl px-3 py-2.5">
                  <span className="flex items-center gap-2.5 text-sm text-slate-300 min-w-0">
                    <UserAvatar name={inv.invitee_name} photo_url={inv.invitee_photo} size="sm" />
                    <span className="truncate">{inv.invitee_name}</span>
                  </span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium bg-amber-400/10 text-amber-300 shrink-0">Invite sent</span>
                </li>
              ))}
              {declinedInvites.map((inv) => (
                <li key={inv.id} className="flex items-center justify-between bg-white/[0.02] rounded-xl px-3 py-2.5">
                  <span className="flex items-center gap-2.5 text-sm text-slate-400 min-w-0">
                    <UserAvatar name={inv.invitee_name} photo_url={inv.invitee_photo} size="sm" />
                    <span className="truncate">{inv.invitee_name}</span>
                  </span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium bg-rose-400/10 text-rose-300 shrink-0">Declined</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Score (if completed) */}
        {completed && (
          <div className="mt-6 rounded-2xl bg-gradient-to-br from-lime-500/10 to-emerald-500/10 border border-lime-500/20 p-5">
            <div className="flex items-center gap-2 text-lime-300 text-sm font-semibold mb-3">
              <Trophy className="w-4 h-4" /> Final score
            </div>
            <div className="flex items-center justify-center gap-6 text-white">
              <div className="text-center">
                <div className="text-xs text-slate-400 mb-1">Team A</div>
                <div className="text-3xl font-bold">{play.score_team_a ?? 0}</div>
              </div>
              <div className="text-slate-500">:</div>
              <div className="text-center">
                <div className="text-xs text-slate-400 mb-1">Team B</div>
                <div className="text-3xl font-bold">{play.score_team_b ?? 0}</div>
              </div>
            </div>
            <div className="text-center mt-3 text-sm text-lime-300 font-medium">
              {play.winner === "Tie" ? "It's a tie!" : `${play.winner} wins 🎉`}
            </div>
          </div>
        )}

        {/* Score discrepancy reports (manager) */}
        {completed && canManage && discrepancies.length > 0 && (
          <div className="mt-4 rounded-2xl border border-amber-400/30 bg-amber-400/[0.06] p-4">
            <div className="flex items-center gap-2 text-amber-300 text-sm font-semibold mb-3">
              <AlertTriangle className="w-4 h-4" /> Score discrepancy reports
            </div>
            <ul className="space-y-2 mb-4">
              {discrepancies.map((d) => (
                <li key={d.id} className="rounded-xl bg-white/[0.03] border border-white/10 px-3 py-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm text-white font-medium">{d.reported_by_name}</span>
                    <span className="text-[10px] text-slate-500">{new Date(d.created_date).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span>
                  </div>
                  {d.reason && <p className="text-xs text-slate-400 mt-1 whitespace-pre-wrap">{d.reason}</p>}
                </li>
              ))}
            </ul>
            {adjusting ? (
              <div>
                <div className="flex items-center justify-center gap-4 mb-3">
                  <ScoreInput label="Team A" value={adjScoreA} onChange={setAdjScoreA} />
                  <span className="text-slate-500">:</span>
                  <ScoreInput label="Team B" value={adjScoreB} onChange={setAdjScoreB} />
                </div>
                <div className="flex gap-2">
                  <button onClick={saveAdjustedScore} disabled={acting} className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-amber-400 hover:bg-amber-300 disabled:opacity-60 text-slate-900 font-semibold text-sm transition">
                    <Check className="w-4 h-4" /> Save adjusted score
                  </button>
                  <button onClick={() => setAdjusting(false)} disabled={acting} className="px-4 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-slate-200 font-semibold text-sm transition">
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                <button onClick={startAdjust} disabled={acting} className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-amber-400 hover:bg-amber-300 disabled:opacity-60 text-slate-900 font-semibold text-sm transition">
                  <Edit3 className="w-4 h-4" /> Adjust final score
                </button>
                <button onClick={confirmScore} disabled={acting} className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-60 text-slate-900 font-semibold text-sm transition">
                  <Check className="w-4 h-4" /> Confirm score
                </button>
              </div>
            )}
          </div>
        )}

        {/* Record score (host, not completed) */}
        {isHost && !completed && (
          <div className="mt-6 rounded-2xl border border-white/10 bg-white/[0.02] p-4">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-3">Record final score</h3>
            <div className="flex items-center justify-center gap-4">
              <ScoreInput label="Team A" value={scoreA} onChange={setScoreA} />
              <span className="text-slate-500">:</span>
              <ScoreInput label="Team B" value={scoreB} onChange={setScoreB} />
            </div>
            <button
              onClick={completePlay}
              disabled={acting}
              className="mt-4 w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-60 text-slate-900 font-semibold text-sm transition"
            >
              <Check className="w-4 h-4" /> Mark as completed
            </button>
          </div>
        )}

        {/* Actions */}
        <div className="mt-6 flex flex-wrap gap-3">
          {!completed && !isJoined && spotsLeft > 0 && (
            <button onClick={join} disabled={acting} className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-lime-400 hover:bg-lime-300 disabled:opacity-60 text-slate-900 font-semibold transition">
              <UserPlus className="w-4 h-4" /> Join play
            </button>
          )}
          {!completed && !isJoined && myInvite && (
            <button onClick={declineInvite} disabled={acting} className="inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-white/5 hover:bg-rose-500/15 hover:text-rose-300 disabled:opacity-60 text-slate-300 font-semibold transition">
              Decline invite
            </button>
          )}
          {!completed && isJoined && (
            <button onClick={leave} disabled={acting} className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-white/5 hover:bg-white/10 disabled:opacity-60 text-slate-200 font-semibold transition">
              Leave play
            </button>
          )}
          {!completed && !isJoined && spotsLeft <= 0 && (
            onWaitlist ? (
              <div className="flex-1 text-center py-3 rounded-xl bg-amber-500/10 text-amber-300 font-medium text-sm">You're on the waitlist</div>
            ) : (
              <button onClick={joinWaitlist} disabled={acting} className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-amber-400 hover:bg-amber-300 disabled:opacity-60 text-slate-900 font-semibold transition">
                <Clock className="w-4 h-4" /> Join waitlist
              </button>
            )
          )}
          {completed && isJoined && !canManage && (
            <button onClick={() => setShowReport(true)} className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 text-amber-200 font-semibold transition">
              <AlertTriangle className="w-4 h-4" /> Report score discrepancy
            </button>
          )}
          {isJoined && !completed && (
            <button onClick={() => setShowInvite(true)} disabled={acting || busy} className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-white/5 hover:bg-white/10 disabled:opacity-60 text-slate-200 font-semibold transition">
              <UserPlus className="w-4 h-4" /> Invite players
            </button>
          )}
          {isHost && !completed && (play.players?.length || 0) > 1 && (
            <button onClick={nudgePlayers} disabled={acting || busy} className="inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-white/5 hover:bg-white/10 disabled:opacity-60 text-slate-200 font-semibold transition">
              <Bell className="w-4 h-4" /> Nudge
            </button>
          )}
          {isHost && (
            <button onClick={() => setConfirmDelete(true)} disabled={acting} className="inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-white/5 hover:bg-rose-500/20 hover:text-rose-300 text-slate-300 transition">
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Delete this play?"
        description="This action cannot be undone."
        confirmText="Delete"
        destructive
        onConfirm={deletePlay}
      />
      <PlayInviteDialog
        open={showInvite}
        onClose={() => setShowInvite(false)}
        play={play}
        invites={pendingInvites}
        onDone={invitePlayers}
      />
      <ReportDiscrepancyDialog
        open={showReport}
        onClose={() => setShowReport(false)}
        onSubmit={submitReport}
      />
    </div>
  );
}

function formatPlayTime(play) {
  if (play.start_time && play.end_time) return `${play.start_time} - ${play.end_time}`;
  return play.time || "Time TBD";
}

function Info({ icon: Icon, text }) {
  return (
    <div className="flex items-center gap-2 text-slate-300">
      <Icon className="w-4 h-4 text-slate-500 shrink-0" />
      <span className="truncate">{text}</span>
    </div>
  );
}

function ScoreInput({ label, value, onChange }) {
  return (
    <div className="text-center">
      <div className="text-xs text-slate-400 mb-1.5">{label}</div>
      <input
        type="number"
        min={0}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-20 bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-center text-white text-xl font-bold focus:outline-none focus:border-lime-400/50"
      />
    </div>
  );
}