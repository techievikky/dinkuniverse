import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { useToast } from "@/components/ui/use-toast";
import { Loader2, Dumbbell, Building2, Trophy, Check } from "lucide-react";
import PickleballIcon from "@/components/PickleballIcon";

const TYPES = [
  {
    value: "player",
    title: "Player",
    description: "Find plays, track stats, manage availability and chat with others.",
    icon: PickleballIcon,
    accent: "from-lime-400 to-emerald-500",
  },
  {
    value: "club_owner",
    title: "Club Owner",
    description: "Manage your event calendar, hourly rates, court availability and discounts.",
    icon: Building2,
    accent: "from-sky-400 to-indigo-500",
  },
  {
    value: "tournament_organizer",
    title: "Tournament Organizer",
    description: "Plan and run tournaments, manage registration and skill brackets.",
    icon: Trophy,
    accent: "from-amber-400 to-orange-500",
  },
];

const homeForType = (t) =>
  t === "club_owner" ? "/club" : t === "tournament_organizer" ? "/tournaments" : "/";

export default function Account() {
  const { user, checkUserAuth } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [sel, setSel] = useState(user?.user_type || "");
  const [saving, setSaving] = useState(false);
  const hasRole = !!user?.user_type;
  const isAdmin = user?.role === "admin";
  const locked = hasRole && !isAdmin;

  const save = async () => {
    if (!sel) {
      toast({ title: "Please choose a role first.", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      await base44.auth.updateMe({ user_type: sel });
      await checkUserAuth();
      toast({ title: "Role updated ✓" });
      navigate(homeForType(sel), { replace: true });
    } catch (err) {
      toast({ title: "Could not save role", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="font-display text-2xl sm:text-3xl font-bold text-white tracking-tight">
        {locked ? "Your role" : user?.user_type ? "Switch your role" : "Welcome — let's set up your account"}
      </h1>
      <p className="text-slate-400 text-sm mt-1 mb-6">
        {locked
          ? "Only an administrator can change your role. Contact an admin if you need it updated."
          : "Choose how you'll use the app. You can change this anytime."}
      </p>

      <div className="space-y-3">
        {TYPES.map((t) => {
          const Icon = t.icon;
          const active = sel === t.value;
          return (
            <button
              key={t.value}
              onClick={locked ? undefined : () => setSel(t.value)}
              disabled={locked}
              className={`w-full text-left flex items-center gap-4 rounded-2xl border p-4 transition ${
                active
                  ? "border-lime-400/60 bg-lime-400/10"
                  : "border-white/5 bg-white/[0.03] hover:bg-white/[0.06] hover:border-white/10"
              } ${locked ? "cursor-default opacity-80" : ""}`}
            >
              <div className={`w-12 h-12 shrink-0 rounded-2xl bg-gradient-to-br ${t.accent} text-slate-900 flex items-center justify-center`}>
                <Icon className="w-6 h-6" strokeWidth={2.2} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-white font-semibold">{t.title}</div>
                <div className="text-sm text-slate-400">{t.description}</div>
              </div>
              {active && (
                <div className="w-6 h-6 shrink-0 rounded-full bg-lime-400 text-slate-900 flex items-center justify-center">
                  <Check className="w-4 h-4" strokeWidth={3} />
                </div>
              )}
            </button>
          );
        })}
      </div>

      {locked ? (
        <div className="mt-6 rounded-xl border border-amber-500/20 bg-amber-500/[0.06] px-4 py-3 text-sm text-amber-200">
          Your role is set to <span className="font-semibold">{TYPES.find((x) => x.value === user?.user_type)?.title}</span>. Ask an administrator to change it.
        </div>
      ) : (
        <button
          onClick={save}
          disabled={saving || !sel}
          className="mt-6 w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-lime-400 hover:bg-lime-300 disabled:opacity-60 text-slate-900 font-semibold transition shadow-lg shadow-lime-500/20"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : "Continue"}
        </button>
      )}
    </div>
  );
}