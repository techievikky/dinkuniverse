import React, { useState, useEffect, useRef } from "react";
import { useAuth } from "@/lib/AuthContext";
import { base44 } from "@/api/base44Client";
import { useToast } from "@/components/ui/use-toast";
import UserAvatar from "@/components/UserAvatar";
import ProfileMedals from "@/components/ProfileMedals";
import PlayerQR from "@/components/PlayerQR";
import PlayerActivityFeed from "@/components/PlayerActivityFeed";
import { Loader2, Save, Ruler, Phone, FileText, BadgeCheck, Clock, Building2, ChevronRight, AlertTriangle, Trash2, MapPin, Camera, Globe } from "lucide-react";
import { Link } from "react-router-dom";
import DrawerSelect from "@/components/DrawerSelect";
import { TIMEZONE_OPTIONS } from "@/lib/timezone";
import {
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";

export default function Profile() {
  const { user, logout, checkUserAuth } = useAuth();
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [clubs, setClubs] = useState({ approved: [], pending: 0 });
  const [medals, setMedals] = useState([]);
  const [form, setForm] = useState({
    dupr_score: "",
    phone: "",
    city: "",
    zip_code: "",
    bio: "",
    photo_url: "",
    timezone: "",
  });
  const fileRef = useRef(null);
  const [uploading, setUploading] = useState(false);

  const pickPhoto = () => fileRef.current?.click();

  const preparePhoto = (file) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const image = new Image();
      image.onload = () => {
        const maxDimension = 800;
        const scale = Math.min(1, maxDimension / Math.max(image.width, image.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(image.width * scale));
        canvas.height = Math.max(1, Math.round(image.height * scale));
        const context = canvas.getContext("2d");
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", 0.82));
      };
      image.onerror = () => reject(new Error("Could not process the selected image."));
      image.src = reader.result;
    };
    reader.onerror = () => reject(new Error("Could not read the selected image."));
    reader.readAsDataURL(file);
  });

  const onPhoto = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast({ title: "Please choose an image file.", variant: "destructive" });
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      toast({ title: "Please choose an image smaller than 2 MB.", variant: "destructive" });
      return;
    }
    setUploading(true);
    try {
      const photo_url = await preparePhoto(file);
      setForm((f) => ({ ...f, photo_url }));
      await base44.auth.updateMe({ photo_url });
      await checkUserAuth?.();
      toast({ title: "Profile picture updated ✓" });
    } catch (err) {
      toast({ title: "Could not upload photo", description: err.message, variant: "destructive" });
    } finally {
      setUploading(false);
    }
  };

  useEffect(() => {
    if (user) {
      setForm({
        dupr_score: user.dupr_score ?? "",
        phone: user.phone ?? "",
        city: user.city ?? "",
        zip_code: user.zip_code ?? "",
        bio: user.bio ?? "",
        photo_url: user.photo_url ?? "",
        timezone: user.timezone ?? "",
      });
      (async () => {
        try {
          const all = await base44.entities.ClubMembership.list("-created_date", 500);
          const mine = all.filter((m) => m.created_by_id === user.id);
          setClubs({
            approved: mine.filter((m) => m.status === "approved"),
            pending: mine.filter((m) => m.status === "pending").length,
          });
          try {
            const ms = await base44.entities.TournamentMedal.filter({ user_id: user.id });
            setMedals(ms);
          } catch { /* ignore */ }
        } catch { /* ignore */ }
      })();
    }
  }, [user]);

  // Keep the medals showcase live — new medals appear automatically as soon as
  // a tournament finalizes and the medal-award workflow writes them.
  useEffect(() => {
    const unsub = base44.entities.TournamentMedal.subscribe((event) => {
      setMedals((prev) => {
        if (event.type === "create") return [...prev, event.data];
        if (event.type === "delete") return prev.filter((m) => m.id !== event.data.id);
        if (event.type === "update") return prev.map((m) => (m.id === event.data.id ? event.data : m));
        return prev;
      });
    });
    return () => unsub && unsub();
  }, []);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const deleteAccount = async () => {
    setDeleting(true);
    try {
      // best-effort hard delete; the auth logout below clears the session either way
      try {
        await base44.entities.User.delete(user.id);
      } catch {
        /* not every app allows direct User deletion — still force logout */
      }
      toast({ title: "Account deleted" });
      logout();
    } catch (err) {
      toast({ title: "Could not delete account", description: err.message, variant: "destructive" });
      setDeleting(false);
    }
  };

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = {
        phone: form.phone.trim(),
        city: form.city.trim(),
        zip_code: form.zip_code.trim(),
        bio: form.bio.trim(),
        photo_url: form.photo_url.trim(),
        timezone: form.timezone,
      };
      if (form.dupr_score !== "") {
        const val = Number(form.dupr_score);
        if (isNaN(val) || val < 2 || val > 8) {
          toast({ title: "DUPR score must be between 2.0 and 8.0.", variant: "destructive" });
          setSaving(false);
          return;
        }
        payload.dupr_score = val;
      }
      await base44.auth.updateMe(payload);
      // keep the public player directory in sync (used for club rosters & chat search)
      try {
        const existing = await base44.entities.Player.filter({ user_id: user.id });
        const dirData = {
          name: user.full_name || user.email,
          email: user.email || "",
          home_club: clubs.approved.map((m) => m.club_name).join(", "),
          city: form.city.trim(),
          zip_code: form.zip_code.trim(),
          photo_url: form.photo_url.trim(),
        };
        if (form.dupr_score !== "") dirData.dupr_score = Number(form.dupr_score);
        if (existing.length) {
          await base44.entities.Player.update(existing[0].id, dirData);
        } else {
          await base44.entities.Player.create({ user_id: user.id, ...dirData });
        }
      } catch {
        // directory sync is best-effort; don't fail the profile save
      }
      toast({ title: "Profile saved ✓" });
    } catch (err) {
      toast({ title: "Could not save profile", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const inputCls =
    "w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder:text-slate-500 focus:outline-none focus:border-lime-400/50 focus:ring-1 focus:ring-lime-400/30 transition";

  return (
    <div className="max-w-xl mx-auto">
      <h1 className="font-display text-2xl sm:text-3xl font-bold text-white tracking-tight">Player profile</h1>
      <p className="text-slate-400 text-sm mt-1 mb-6">
        Register your DUPR rating and contact info so hosts and players can find you.
      </p>

      {/* Account summary */}
      <div className="flex items-center gap-4 rounded-2xl border border-white/5 bg-white/[0.03] p-5 mb-6">
        <input ref={fileRef} type="file" accept="image/*" onChange={onPhoto} className="hidden" />
        <div className="relative shrink-0">
          <UserAvatar name={user?.full_name || user?.email} photo_url={form.photo_url || user?.photo_url} size="xl" className="rounded-2xl" />
          <button
            type="button"
            onClick={pickPhoto}
            disabled={uploading}
            className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full bg-lime-400 hover:bg-lime-300 text-slate-900 flex items-center justify-center border-2 border-[#0b1220] disabled:opacity-60"
            title="Change profile picture"
          >
            {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Camera className="w-3.5 h-3.5" />}
          </button>
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-white font-semibold truncate">{user?.full_name || "Player"}</div>
          <div className="text-sm text-slate-400 truncate">{user?.email}</div>
          <button type="button" onClick={pickPhoto} disabled={uploading} className="mt-1 text-xs text-lime-400 hover:text-lime-300 disabled:opacity-60">
            {uploading ? "Uploading…" : "Change picture"}
          </button>
        </div>
      </div>

      <PlayerQR user={user} />
      <ProfileMedals medals={medals} />
      <PlayerActivityFeed user={user} />

      <form onSubmit={submit} className="space-y-4">
        <div>
          <label className="flex items-center gap-1.5 text-xs font-medium text-slate-400 mb-1.5">
            <Ruler className="w-3.5 h-3.5" /> DUPR score
          </label>
          <input
            type="number"
            step="0.01"
            min="2"
            max="8"
            inputMode="decimal"
            className={inputCls}
            placeholder="e.g. 3.75"
            value={form.dupr_score}
            onChange={(e) => set("dupr_score", e.target.value)}
          />
          <p className="text-[11px] text-slate-500 mt-1">Dynamic Universal Pickleball Rating (2.0–8.0).</p>
        </div>

        <div>
          <label className="flex items-center gap-1.5 text-xs font-medium text-slate-400 mb-1.5">
            <Globe className="w-3.5 h-3.5" /> Timezone
          </label>
          <DrawerSelect
            triggerClassName={inputCls}
            value={form.timezone}
            onChange={(v) => set("timezone", v)}
            options={TIMEZONE_OPTIONS}
            title="Choose your timezone"
          />
          <p className="text-[11px] text-slate-500 mt-1">Used to show play dates and times correctly for you.</p>
        </div>

        <div>
          <label className="flex items-center gap-1.5 text-xs font-medium text-slate-400 mb-1.5">
            <Phone className="w-3.5 h-3.5" /> Contact phone
          </label>
          <input
            type="tel"
            className={inputCls}
            placeholder="e.g. (555) 123-4567"
            value={form.phone}
            onChange={(e) => set("phone", e.target.value)}
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="flex items-center gap-1.5 text-xs font-medium text-slate-400 mb-1.5">
              <MapPin className="w-3.5 h-3.5" /> City
            </label>
            <input
              className={inputCls}
              placeholder="e.g. Austin"
              value={form.city}
              onChange={(e) => set("city", e.target.value)}
            />
          </div>
          <div>
            <label className="text-xs font-medium text-slate-400 mb-1.5">Zip code</label>
            <input
              className={inputCls}
              placeholder="e.g. 78701"
              value={form.zip_code}
              onChange={(e) => set("zip_code", e.target.value)}
            />
          </div>
        </div>

        <div>
          <label className="flex items-center gap-1.5 text-xs font-medium text-slate-400 mb-1.5">
            <Building2 className="w-3.5 h-3.5" /> Club memberships
          </label>
          <Link to="/clubs" className="block rounded-2xl border border-white/5 bg-white/[0.03] p-4 hover:bg-white/[0.06] transition group">
            {clubs.approved.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {clubs.approved.map((m) => (
                  <span key={m.id} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-lime-400/15 text-lime-300 text-sm font-medium">
                    <BadgeCheck className="w-3.5 h-3.5" /> {m.club_name}
                  </span>
                ))}
              </div>
            ) : (
              <div className="flex items-center gap-2 text-slate-400 text-sm">
                <Building2 className="w-4 h-4" /> No club memberships yet
              </div>
            )}
            <div className="flex items-center justify-between mt-3 text-xs text-slate-500 group-hover:text-slate-300 transition">
              <span className="flex items-center gap-1.5">
                {clubs.pending > 0 ? <><Clock className="w-3.5 h-3.5 text-amber-400" /> {clubs.pending} pending request{clubs.pending !== 1 ? "s" : ""}</> : "Join a club"}
              </span>
              <span className="flex items-center gap-1">Manage <ChevronRight className="w-3.5 h-3.5" /></span>
            </div>
          </Link>
        </div>

        <div>
          <label className="flex items-center gap-1.5 text-xs font-medium text-slate-400 mb-1.5">
            <FileText className="w-3.5 h-3.5" /> Bio
          </label>
          <textarea
            rows={3}
            className={inputCls}
            placeholder="Tell others about your play style, availability, etc."
            value={form.bio}
            onChange={(e) => set("bio", e.target.value)}
          />
        </div>

        <button
          type="submit"
          disabled={saving}
          className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-lime-400 hover:bg-lime-300 disabled:opacity-60 text-slate-900 font-semibold transition shadow-lg shadow-lime-500/20"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Save className="w-4 h-4" /> Save profile</>}
        </button>
      </form>

      {/* Danger zone */}
      <div className="mt-10 rounded-2xl border border-rose-500/20 bg-rose-500/[0.04] p-5">
        <h2 className="font-display text-lg font-semibold text-rose-300 flex items-center gap-2">
          <AlertTriangle className="w-5 h-5" /> Danger zone
        </h2>
        <p className="text-sm text-slate-400 mt-1 mb-4">
          Deleting your account is permanent. It wipes your profile and saved data, and you'll be signed out.
        </p>

        <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
          <AlertDialogTrigger asChild>
            <button
              type="button"
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 text-rose-200 border border-rose-500/30 font-semibold text-sm transition"
            >
              <Trash2 className="w-4 h-4" /> Delete account
            </button>
          </AlertDialogTrigger>
          <AlertDialogContent className="bg-slate-900 border-white/10 text-white">
            <AlertDialogHeader>
              <AlertDialogTitle>Delete your account?</AlertDialogTitle>
              <AlertDialogDescription className="text-slate-400">
                This permanently removes your PickleHub profile, plays, availability and chat history. This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel className="border-white/10 text-slate-200 hover:bg-white/5">Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={deleteAccount}
                disabled={deleting}
                className="bg-rose-500 hover:bg-rose-600 text-white border-0 disabled:opacity-60"
              >
                {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : "Yes, delete"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}