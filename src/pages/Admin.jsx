import React, { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { useToast } from "@/components/ui/use-toast";
import { Loader2, UserPlus, Shield, Mail, Building2, Trophy, Users } from "lucide-react";
import PickleballIcon from "@/components/PickleballIcon";

const TYPES = [
  { value: "player", label: "Player", icon: PickleballIcon, accent: "from-lime-400 to-emerald-500" },
  { value: "club_owner", label: "Club Owner", icon: Building2, accent: "from-sky-400 to-indigo-500" },
  { value: "tournament_organizer", label: "Tournament Organizer", icon: Trophy, accent: "from-amber-400 to-orange-500" },
];

const typeLabel = (t) => TYPES.find((x) => x.value === t)?.label || "—";

export default function Admin() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [email, setEmail] = useState("");
  const [selType, setSelType] = useState("player");

  const load = async () => {
    try {
      const list = await base44.entities.User.list("-created_date", 200);
      setUsers(list);
    } catch (err) {
      toast({ title: "Could not load users", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const invite = async (e) => {
    e.preventDefault();
    const trimmed = email.trim();
    if (!trimmed || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      toast({ title: "Enter a valid email address.", variant: "destructive" });
      return;
    }
    if (users.some((u) => (u.email || "").toLowerCase() === trimmed.toLowerCase())) {
      toast({ title: "A user with that email already exists.", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      await base44.users.inviteUser(trimmed, "user");
      // best-effort: assign the app user_type on the newly created record
      try {
        const found = await base44.entities.User.filter({ email: trimmed });
        if (found.length) {
          await base44.entities.User.update(found[0].id, { user_type: selType });
        }
      } catch {
        // user_type can still be chosen by the user on first login — non-critical
      }
      toast({ title: `Invite sent to ${trimmed} ✓` });
      setEmail("");
      setSelType("player");
      load();
    } catch (err) {
      toast({ title: "Could not invite user", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const changeType = async (u, newType) => {
    if (!newType || newType === (u.user_type || "")) return;
    try {
      await base44.entities.User.update(u.id, { user_type: newType });
      setUsers((prev) => prev.map((x) => (x.id === u.id ? { ...x, user_type: newType } : x)));
      toast({ title: `Role set to ${typeLabel(newType)} ✓` });
    } catch (err) {
      toast({ title: "Could not update role", description: err.message, variant: "destructive" });
    }
  };

  const changeAccess = async (u, access) => {
    const role = access === "admin" ? "admin" : "user";
    if (role === (u.role || "user")) return;
    try {
      await base44.entities.User.update(u.id, { role });
      setUsers((prev) => prev.map((x) => (x.id === u.id ? { ...x, role } : x)));
      toast({ title: `${u.email} is now ${role === "admin" ? "an admin" : "a user"} ✓` });
    } catch (err) {
      toast({ title: "Could not update access", description: err.message, variant: "destructive" });
    }
  };

  const inputCls =
    "w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder:text-slate-500 focus:outline-none focus:border-lime-400/50 focus:ring-1 focus:ring-lime-400/30 transition";

  return (
    <div className="max-w-3xl mx-auto">
      <div className="flex items-center gap-2.5 mb-1">
        <Shield className="w-6 h-6 text-lime-400" />
        <h1 className="font-display text-2xl sm:text-3xl font-bold text-white tracking-tight">Admin</h1>
      </div>
      <p className="text-slate-400 text-sm mb-6">Manage who has access to PickleHub.</p>

      {/* Admin identity */}
      <div className="flex items-center gap-4 rounded-2xl border border-white/5 bg-white/[0.03] p-5 mb-8">
        <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-lime-400 to-emerald-500 flex items-center justify-center text-slate-900">
          <Shield className="w-7 h-7" />
        </div>
        <div className="min-w-0">
          <div className="text-white font-semibold truncate">{user?.full_name || "Admin"}</div>
          <div className="text-sm text-slate-400 truncate">{user?.email}</div>
        </div>
        <span className="ml-auto text-[11px] px-2.5 py-1 rounded-full border border-rose-500/20 bg-rose-500/15 text-rose-300 font-medium">
          Admin
        </span>
      </div>

      {/* Add user form */}
      <form onSubmit={invite} className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 mb-8 space-y-4">
        <h2 className="font-display text-lg font-semibold text-white flex items-center gap-2">
          <UserPlus className="w-5 h-5 text-lime-400" /> Add a user
        </h2>
        <p className="text-sm text-slate-400 -mt-2">
          We'll email an invitation. New users set their own password on first sign-in.
        </p>

        <div>
          <label className="flex items-center gap-1.5 text-xs font-medium text-slate-400 mb-1.5">
            <Mail className="w-3.5 h-3.5" /> Email
          </label>
          <input
            type="email"
            className={inputCls}
            placeholder="player@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-400 mb-2">Role</label>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {TYPES.map((t) => {
              const Icon = t.icon;
              const active = selType === t.value;
              return (
                <button
                  key={t.value}
                  type="button"
                  onClick={() => setSelType(t.value)}
                  className={`flex items-center gap-3 rounded-xl border p-3 text-left transition ${
                    active
                      ? "border-lime-400/60 bg-lime-400/10"
                      : "border-white/5 bg-white/[0.02] hover:bg-white/[0.06]"
                  }`}
                >
                  <div className={`w-9 h-9 shrink-0 rounded-xl bg-gradient-to-br ${t.accent} text-slate-900 flex items-center justify-center`}>
                    <Icon className="w-4 h-4" strokeWidth={2.2} />
                  </div>
                  <span className="text-sm font-medium text-white">{t.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        <button
          type="submit"
          disabled={saving}
          className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-lime-400 hover:bg-lime-300 disabled:opacity-60 text-slate-900 font-semibold transition shadow-lg shadow-lime-500/20"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <><UserPlus className="w-4 h-4" /> Send invite</>}
        </button>
      </form>

      {/* User directory */}
      <h2 className="font-display text-lg font-semibold text-white mb-3 flex items-center gap-2">
        <Users className="w-5 h-5 text-slate-400" /> Users ({users.length})
      </h2>
      {loading ? (
        <div className="flex justify-center py-12">
          <div className="w-6 h-6 border-4 border-white/10 border-t-lime-400 rounded-full animate-spin" />
        </div>
      ) : users.length === 0 ? (
        <div className="text-center py-12 rounded-2xl border border-dashed border-white/10">
          <p className="text-slate-400 text-sm">No users yet.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {users.map((u) => (
            <div
              key={u.id}
              className="flex items-center gap-3 rounded-2xl border border-white/5 bg-white/[0.03] px-4 py-3"
            >
              <div className="w-10 h-10 shrink-0 rounded-full bg-white/5 flex items-center justify-center text-sm font-bold text-slate-200">
                {(u.full_name || u.email || "?").charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-white font-medium truncate">{u.full_name || "Pending invite"}</div>
                <div className="text-xs text-slate-400 truncate">{u.email}</div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <select
                  value={u.user_type || ""}
                  onChange={(e) => changeType(u, e.target.value)}
                  title="Change role"
                  className="text-xs bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-white focus:outline-none focus:border-lime-400/50"
                >
                  <option value="" disabled className="bg-[#0b1220]">No role</option>
                  {TYPES.map((t) => (
                    <option key={t.value} value={t.value} className="bg-[#0b1220]">{t.label}</option>
                  ))}
                </select>
                <select
                  value={u.role === "admin" ? "admin" : "user"}
                  onChange={(e) => changeAccess(u, e.target.value)}
                  title="Change access"
                  className="text-xs bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-white focus:outline-none focus:border-lime-400/50"
                >
                  <option value="user" className="bg-[#0b1220]">User</option>
                  <option value="admin" className="bg-[#0b1220]">Admin</option>
                </select>
                <span
                  className={`text-[11px] px-2.5 py-1 rounded-full border font-medium ${
                    u.role === "admin"
                      ? "border-rose-500/20 bg-rose-500/15 text-rose-300"
                      : "border-white/10 bg-white/5 text-slate-300"
                  }`}
                >
                  {u.role || "user"}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}