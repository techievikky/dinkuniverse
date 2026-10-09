import React, { useEffect, useMemo, useState } from "react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { useToast } from "@/components/ui/use-toast";
import { ensureDirectConversation, loadMyConversations, playInviteText, sendChatMessage } from "@/lib/chat";
import {
  Loader2, Clock, Users, Send, Bell, ChevronLeft, ChevronRight, Save, X, Building2
} from "lucide-react";
import UserAvatar from "@/components/UserAvatar";

const HOURS = Array.from({ length: 16 }, (_, i) => i + 6); // 6..21

const formatHour = (h) => {
  const ampm = h < 12 ? "AM" : "PM";
  const display = h === 0 ? 12 : h <= 12 ? h : h - 12;
  return `${display} ${ampm}`;
};

const localDateString = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

const shiftDate = (dateStr, delta) => {
  const [year, month, day] = dateStr.split("-").map(Number);
  return localDateString(new Date(year, month - 1, day + delta));
};

export default function ClubAvailabilityBoard() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [club, setClub] = useState(null);
  const [selectedDate, setSelectedDate] = useState(() => localDateString(new Date()));
  const [members, setMembers] = useState([]);
  const [hoursByUser, setHoursByUser] = useState({});
  const reminderTargets = members.filter((member) =>
    member.user_id !== user?.id && !member.availability_id && !(member.busy_hours || []).length
  );
  const [loading, setLoading] = useState(true);
  const [selectedHour, setSelectedHour] = useState(null);

  // schedule/notify modal
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState("");
  const [location, setLocation] = useState("");
  const [maxPlayers, setMaxPlayers] = useState(4);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [clubs, memberships] = await Promise.all([
        base44.entities.Club.list("-created_date", 200),
        base44.entities.ClubMembership.list("-created_date", 500),
      ]);
      const ownedClubs = clubs.filter((item) => item.created_by_id === user?.id);
      const approvedMemberships = memberships.filter((membership) =>
        membership.created_by_id === user?.id && membership.status === "approved" && membership.member_type === "member"
      );
      const preferredName = user?.home_club?.split(",")[0]?.trim().toLowerCase();
      const selectedMembership = approvedMemberships.find((membership) => membership.club_name?.toLowerCase() === preferredName) || approvedMemberships[0];
      const memberClub = clubs.find((item) => item.id === selectedMembership?.club_id);
      const ownedClub = ownedClubs.find((item) => item.name?.toLowerCase() === preferredName) || ownedClubs[0];
      const selectedClub = memberClub || ownedClub || null;
      setClub(selectedClub);

      if (!selectedClub) {
        setMembers([]);
        setHoursByUser({});
        return;
      }

      const board = await base44.entities.Availability.forClub(selectedClub.id, selectedDate);
      const roster = board.members || [];
      setMembers(roster);
      const map = {};
      for (const member of roster) {
        if (member.availability_id) map[member.user_id] = member.hours || [];
      }
      setHoursByUser(map);
    } catch (error) {
      setMembers([]);
      setHoursByUser({});
      toast({ title: "Could not load club availability", description: error.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user?.id) load();
  }, [user?.id, user?.home_club, selectedDate]);

  // available players per hour, including me
  const busyAt = (member, hour) => (member.busy_hours || []).includes(hour);

  const freeAt = (h) => {
    const list = [];
    for (const m of members) {
      if ((hoursByUser[m.user_id] || []).includes(h) && !busyAt(m, h)) list.push(m);
    }
    return list;
  };

  const hourCounts = useMemo(
    () => HOURS.map((h) => freeAt(h).length),
    [members, hoursByUser]
  );

  const selectedFree = selectedHour != null ? freeAt(selectedHour) : [];
  const selectedBusy = selectedHour != null ? members.filter((member) => busyAt(member, selectedHour)) : [];
  const notifyTargets = selectedFree.filter((m) => m.user_id !== user?.id && m.user_id);

  const notPosted = members.filter((m) => m.user_id !== user?.id && !m.availability_id && !(m.busy_hours || []).length);

  const openForm = () => {
    if (selectedHour == null) {
      toast({ title: "Pick an hour first", variant: "destructive" });
      return;
    }
    setTitle("");
    setLocation(club?.name || "");
    setMaxPlayers(4);
    setShowForm(true);
  };

  const scheduleAndNotify = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const time = String(selectedHour).padStart(2, "0") + ":00";
      const loc = location.trim() || club.name || "The club";
      const name = title.trim() || "Casual play";
      const play = await base44.entities.Play.create({
        title: name,
        date: selectedDate,
        time,
        start_time: time,
        end_time: String(selectedHour + 1).padStart(2, "0") + ":00",
        location: loc,
        address: club.location || "",
        club_id: club.id,
        members_only: true,
        skill_level: "Open",
        max_players: Number(maxPlayers),
        players: [{ user_id: user.id, name: user.full_name || user.email, photo_url: user.photo_url }],
        status: "open",
      });

      const conversations = await loadMyConversations(user.id);
      const hostName = (user.full_name || user.name || user.email || "A club member").split(" ")[0];
      const invite = playInviteText(hostName, play);
      let sent = 0;
      let failed = 0;
      for (const member of notifyTargets) {
        try {
          const conversation = await ensureDirectConversation(conversations, user, {
            user_id: member.user_id,
            name: member.name || member.email || "Club member",
            photo_url: member.photo_url || "",
          });
          await sendChatMessage(user, conversation, invite);
          sent += 1;
        } catch {
          failed += 1;
        }
      }

      setShowForm(false);
      toast({
        title: "Play scheduled ✓",
        description:
          notifyTargets.length === 0
            ? "No other players marked themselves free at that hour."
            : `${sent} of ${notifyTargets.length} available player${notifyTargets.length === 1 ? "" : "s"} invited${failed ? ` · ${failed} failed` : ""}.`,
        variant: notifyTargets.length > 0 && sent === 0 ? "destructive" : undefined,
      });
      load();
    } catch (err) {
      toast({ title: "Could not schedule", description: err.message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const remind = async () => {
    if (reminderTargets.length === 0) return;
    setBusy(true);
    try {
      const conversations = await loadMyConversations(user.id);
      const hostName = user?.full_name || user?.name || user?.email || "Your club host";
      const message = `Hi! ${hostName} from ${club.name} here. Please add your available times for ${dateLabel} in the Free Times tab so we can plan a game.`;
      let sent = 0;
      let failed = 0;

      for (const member of reminderTargets) {
        try {
          const conversation = await ensureDirectConversation(conversations, user, {
            user_id: member.user_id,
            name: member.name || member.email || "Club member",
            photo_url: member.photo_url || "",
          });
          await sendChatMessage(user, conversation, message);
          sent += 1;
        } catch {
          failed += 1;
        }
      }

      toast({
        title: sent ? "Availability reminders sent ✓" : "Could not send reminders",
        description: `${sent} of ${reminderTargets.length} member${reminderTargets.length === 1 ? "" : "s"} messaged${failed ? ` · ${failed} failed` : ""}.`,
        variant: sent ? undefined : "destructive",
      });
    } catch (err) {
      toast({ title: "Could not send reminder", description: err.message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const dateLabel = new Date(selectedDate + "T00:00:00").toLocaleDateString(undefined, {
    weekday: "long", month: "long", day: "numeric",
  });

  if (!club) {
    return (
      <div className="rounded-2xl border border-dashed border-white/10 p-8 text-center">
        <Building2 className="w-7 h-7 mx-auto text-slate-600 mb-2" />
        <p className="text-slate-300 font-medium mb-1">Club membership required</p>
        <p className="text-sm text-slate-500">
          Join a club as an approved member, or create a club, to view its players' availability.
        </p>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between gap-3 mb-4">
        <div>
          <h2 className="font-display text-xl font-semibold text-white">{club?.name}</h2>
          <p className="text-xs text-slate-400">See who's free and schedule a play.</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setSelectedDate(shiftDate(selectedDate, -1))} className="w-8 h-8 rounded-lg bg-white/5 hover:bg-white/10 text-slate-300 flex items-center justify-center">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="text-sm text-white font-medium min-w-[9rem] text-center">{dateLabel}</span>
          <button onClick={() => setSelectedDate(shiftDate(selectedDate, 1))} className="w-8 h-8 rounded-lg bg-white/5 hover:bg-white/10 text-slate-300 flex items-center justify-center">
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><div className="w-6 h-6 border-4 border-white/10 border-t-lime-400 rounded-full animate-spin" /></div>
      ) : members.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-white/10 p-8 text-center">
          <Users className="w-7 h-7 mx-auto text-slate-600 mb-2" />
          <p className="text-slate-300 font-medium mb-1">No club members yet</p>
          <p className="text-sm text-slate-500">Players with approved membership at {club?.name} will appear here.</p>
        </div>
      ) : (
        <>
          {/* Hour grid */}
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 mb-5">
            {HOURS.map((h, i) => {
              const count = hourCounts[i];
              const active = selectedHour === h;
              return (
                <button
                  key={h}
                  onClick={() => setSelectedHour(h)}
                  className={`px-2 py-2.5 rounded-xl text-sm font-medium transition border text-left ${
                    active
                      ? "bg-lime-400 text-slate-900 border-lime-400"
                      : count > 0
                      ? "bg-lime-500/10 text-white border-lime-500/20 hover:bg-lime-500/20"
                      : "bg-white/[0.02] text-slate-400 border-white/5 hover:bg-white/5"
                  }`}
                >
                  <div>{formatHour(h)}</div>
                  <div className={`text-[11px] ${active ? "text-slate-700" : "text-lime-400"}`}>
                    {count} free
                  </div>
                </button>
              );
            })}
          </div>

          {/* Selected hour roster */}
          {selectedHour != null && (
            <div className="rounded-2xl border border-white/5 bg-white/[0.03] p-4 mb-4">
              <h3 className="font-medium text-white text-sm mb-3 flex items-center gap-1.5">
                <Clock className="w-4 h-4 text-lime-400" /> Available at {formatHour(selectedHour)}
              </h3>
              {selectedFree.length === 0 ? (
                <p className="text-sm text-slate-500">
                  {members.some((member) => busyAt(member, selectedHour))
                    ? "Club members are already scheduled during this hour."
                    : "No one has marked this hour yet."}
                </p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {selectedFree.map((m) => (
                    <span key={m.user_id} className={`inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full ${
                      m.user_id === user?.id ? "bg-lime-400/20 text-lime-300" : "bg-white/5 text-slate-200"
                    }`}>
                      <UserAvatar name={m.name} photo_url={m.photo_url} size="xs" />
                      {m.name}{m.user_id === user?.id ? " (you)" : ""}
                    </span>
                  ))}
                </div>
              )}
              {selectedBusy.length > 0 && (
                <div className={selectedFree.length > 0 ? "mt-4 pt-3 border-t border-white/5" : ""}>
                  <p className="text-xs text-amber-300 mb-2">Already in a play</p>
                  <div className="flex flex-wrap gap-2">
                    {selectedBusy.map((member) => (
                      <span key={member.user_id} className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full bg-amber-400/10 text-amber-200">
                        <UserAvatar name={member.name} photo_url={member.photo_url} size="xs" />
                        {member.name}{member.user_id === user?.id ? " (you)" : ""}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              <button
                onClick={openForm}
                disabled={selectedFree.length === 0}
                className="mt-4 w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-lime-400 hover:bg-lime-300 disabled:opacity-50 text-slate-900 font-semibold text-sm transition"
              >
                <Send className="w-4 h-4" /> Schedule play & notify available players
              </button>
            </div>
          )}

          {/* Reminder */}
          <div className="rounded-2xl border border-white/5 bg-white/[0.03] p-4 flex items-center justify-between gap-3">
            <div>
              <h3 className="font-medium text-white text-sm flex items-center gap-1.5">
                <Bell className="w-4 h-4 text-amber-400" /> Nudge members to post availability
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                {notPosted.length === 0
                  ? "All members have posted or are already scheduled for this date."
                  : `${notPosted.length} member${notPosted.length === 1 ? "" : "s"} haven't posted.`}
              </p>
            </div>
            <button
              onClick={remind}
              disabled={busy || reminderTargets.length === 0}
              className="shrink-0 inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-amber-400/40 text-amber-300 hover:bg-amber-400/10 disabled:opacity-50 text-sm font-medium transition"
            >
              <Bell className="w-4 h-4" /> Remind
            </button>
          </div>
        </>
      )}

      {/* Schedule form */}
      {showForm && (
        <form onSubmit={scheduleAndNotify} className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-0 sm:p-4">
          <div className="w-full sm:max-w-md bg-[#0b1220] border border-white/10 sm:rounded-2xl rounded-t-2xl p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-display font-semibold text-white">Schedule & notify</h3>
              <button type="button" onClick={() => setShowForm(false)} className="text-slate-400 hover:text-white"><X className="w-5 h-5" /></button>
            </div>
            <p className="text-xs text-slate-400 mb-4">
              {dateLabel} at {selectedHour != null ? formatHour(selectedHour) : ""} · notifying {notifyTargets.length} available player{notifyTargets.length === 1 ? "" : "s"}.
            </p>
            <div className="space-y-3">
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Play title (optional)"
                className="w-full bg-white/5 border border-white/10 rounded-xl px-3.5 py-2.5 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-lime-400/50"
              />
              <input
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="Location"
                className="w-full bg-white/5 border border-white/10 rounded-xl px-3.5 py-2.5 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-lime-400/50"
              />
              <label className="block text-xs font-medium text-slate-400">
                Max players
                <input
                  type="number"
                  min={2}
                  max={16}
                  required
                  value={maxPlayers}
                  onChange={(e) => setMaxPlayers(e.target.value)}
                  className="mt-1.5 w-full bg-white/5 border border-white/10 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-lime-400/50"
                />
              </label>
              <button type="submit" disabled={busy} className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-lime-400 hover:bg-lime-300 disabled:opacity-60 text-slate-900 font-semibold text-sm transition">
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Save className="w-4 h-4" /> Schedule & notify</>}
              </button>
            </div>
          </div>
        </form>
      )}
    </div>
  );
}